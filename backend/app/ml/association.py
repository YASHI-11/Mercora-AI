"""Association-rule mining over historical order line-items using
mlxtend's Apriori/association_rules, to discover real "frequently bought
together" pairs (support / confidence / lift) from the seeded order data."""
import pandas as pd
from mlxtend.frequent_patterns import apriori, association_rules
from mlxtend.preprocessing import TransactionEncoder


def mine_association_rules(orders: list[dict], min_support: float = 0.01,
                            min_confidence: float = 0.15) -> list[dict]:
    transactions = []
    for order in orders:
        items = list({item["product_id"] for item in order.get("items", [])})
        if len(items) >= 2:
            transactions.append(items)

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
