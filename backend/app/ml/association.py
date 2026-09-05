"""Association-rule mining over historical order line-items using
mlxtend's Apriori/association_rules, to discover real "frequently bought
together" pairs (support / confidence / lift) from the seeded order data."""
from collections import Counter

import pandas as pd
from mlxtend.frequent_patterns import apriori, association_rules
from mlxtend.preprocessing import TransactionEncoder

# Hard ceiling on how many distinct products TransactionEncoder gets to build
# a column for. A one-hot matrix scales with (orders x distinct products);
# with the full catalog merged in (thousands of long-tail SKUs that mostly
# appear once) that matrix -- and Apriori's search over it -- gets large
# enough to blow a serverless function's time/memory budget. Frequency-based
# pre-filtering below is what actually keeps this bounded; this is just a
# hard backstop.
MAX_CANDIDATE_ITEMS = 300


def mine_association_rules(orders: list[dict], min_support: float = 0.01,
                            min_confidence: float = 0.15) -> list[dict]:
    raw_transactions = []
    for order in orders:
        items = list({item["product_id"] for item in order.get("items", [])})
        if len(items) >= 2:
            raw_transactions.append(items)

    if len(raw_transactions) < 5:
        return []

    # Pre-filter to items that could possibly meet min_support on their own --
    # Apriori would prune anything below that in its first pass anyway, so
    # this loses no valid rules while shrinking the one-hot matrix from
    # "every distinct product in the catalog" down to only the ones with
    # real repeat-purchase signal.
    min_count = max(2, int(min_support * len(raw_transactions)))
    item_counts = Counter(item for txn in raw_transactions for item in txn)
    candidate_items = {item for item, count in item_counts.items() if count >= min_count}
    if len(candidate_items) > MAX_CANDIDATE_ITEMS:
        candidate_items = {item for item, _ in item_counts.most_common(MAX_CANDIDATE_ITEMS)}

    transactions = [
        [item for item in txn if item in candidate_items]
        for txn in raw_transactions
    ]
    transactions = [txn for txn in transactions if len(txn) >= 2]

    if len(transactions) < 5:
        return []

    te = TransactionEncoder()
    te_ary = te.fit(transactions).transform(transactions)
    df = pd.DataFrame(te_ary, columns=te.columns_)

    try:
        frequent = apriori(df, min_support=min_support, use_colnames=True)
        if frequent.empty:
            return []
        rules = association_rules(frequent, metric="confidence", min_threshold=min_confidence)
    except Exception:
        return []

    results = []
    for _, row in rules.iterrows():
        antecedents = list(row["antecedents"])
        consequents = list(row["consequents"])
        if len(antecedents) != 1 or len(consequents) != 1:
            continue
        results.append({
            "product_a": antecedents[0],
            "product_b": consequents[0],
            "support": round(float(row["support"]), 4),
            "confidence": round(float(row["confidence"]), 4),
            "lift": round(float(row["lift"]), 4),
        })
    results.sort(key=lambda r: r["lift"], reverse=True)
    return results
