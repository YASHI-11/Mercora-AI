"""Computes real ML evaluation metrics against what's in MongoDB, using a
per-customer temporal holdout: each repeat customer's LAST order is held
out as the test set and everything earlier is training data.

- Recommendation engine: Precision@K / Recall@K / Hit Rate on the held-out
  order's *new* items (ones the customer had never bought before), seeded
  from their latest training order. Content similarity (what
  /api/recommendations serves) is reported next to co-purchase rules (what
  the shopping agent's cross-sell serves, via approved bundles) and a
  popularity baseline, so the numbers have something to be compared against.
- Association rules: mined on training orders only, then re-checked on the
  held-out orders (holdout confidence vs. training confidence).
- Segmentation: silhouette score and segment sizes.

Run after scripts/seed_kaggle_retail.py. Prints
a plain-text report; nothing here is fabricated -- every number is computed
from what's actually in MongoDB.
"""
import os
import random
import sys
import time
from collections import Counter

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
from pymongo import MongoClient  # noqa: E402
from app.config import get_settings  # noqa: E402
from app.ml.recommendation import RecommendationEngine  # noqa: E402
from app.ml.association import mine_association_rules  # noqa: E402
from app.ml.segmentation import segment_customers  # noqa: E402

settings = get_settings()
K = 5
MAX_EVAL_CUSTOMERS = 500
SEEDS_PER_CUSTOMER = 3


def _item_ids(order: dict) -> set[str]:
    return {i["product_id"] for i in order.get("items", [])}


def temporal_holdout(orders: list[dict]):
    """Returns (train_orders, test_cases). A test case is a repeat customer's
    held-out last order plus what they had bought before it."""
    by_customer: dict[str, list[dict]] = {}
    for o in orders:
        by_customer.setdefault(o["customer_id"], []).append(o)

    train_orders, test_cases = [], []
    for customer_id, cust_orders in by_customer.items():
        cust_orders.sort(key=lambda o: o["created_at"])
        if len(cust_orders) < 2:
            train_orders.extend(cust_orders)
            continue
        history, last = cust_orders[:-1], cust_orders[-1]
        train_orders.extend(history)
        purchased = set().union(*(_item_ids(o) for o in history))
        relevant = _item_ids(last) - purchased
        if relevant:
            test_cases.append({
                "customer_id": customer_id,
                "seeds": list(_item_ids(history[-1]))[:SEEDS_PER_CUSTOMER],
                "purchased": purchased,
                "relevant": relevant,
                "test_order": last,
            })
    return train_orders, test_cases


def _score(recommended: list[str], relevant: set[str]) -> tuple[float, float, bool]:
    hits = len(set(recommended) & relevant)
    return hits / K, hits / len(relevant), hits > 0


def _summarize(rows: list[tuple[float, float, bool]]) -> dict:
    n = len(rows)
    return {
        "precision_at_k": round(sum(r[0] for r in rows) / n, 4),
        "recall_at_k": round(sum(r[1] for r in rows) / n, 4),
        "hit_rate": round(sum(r[2] for r in rows) / n, 4),
    }


def evaluate_recommendations(products: list[dict], train_orders: list[dict], test_cases: list[dict],
                             rules: list[dict]):
    if not test_cases:
        return None
    cases = sorted(test_cases, key=lambda c: c["customer_id"])
    if len(cases) > MAX_EVAL_CUSTOMERS:
        cases = random.Random(42).sample(cases, MAX_EVAL_CUSTOMERS)

    engine = RecommendationEngine(products)
    popularity = Counter(pid for o in train_orders for pid in _item_ids(o))
    popular_ids = [pid for pid, _ in popularity.most_common()]
    rules_by_antecedent: dict[str, list[dict]] = {}
    for r in rules:
        rules_by_antecedent.setdefault(r["product_a"], []).append(r)

    content_rows, rule_rows, baseline_rows = [], [], []
    for case in cases:
        purchased = case["purchased"]

        best: dict[str, float] = {}
        for seed_id in case["seeds"]:
            for p in engine.similar_products(seed_id, top_k=K + len(purchased)):
                if p["_id"] not in purchased:
                    best[p["_id"]] = max(best.get(p["_id"], 0.0), p["similarity_score"])
        content_recs = sorted(best, key=best.get, reverse=True)[:K]
        content_rows.append(_score(content_recs, case["relevant"]))

        by_conf: dict[str, float] = {}
        for seed_id in case["seeds"]:
            for r in rules_by_antecedent.get(seed_id, []):
                if r["product_b"] not in purchased:
                    by_conf[r["product_b"]] = max(by_conf.get(r["product_b"], 0.0), r["confidence"])
        rule_recs = sorted(by_conf, key=by_conf.get, reverse=True)[:K]
        rule_rows.append(_score(rule_recs, case["relevant"]))

        baseline_recs = [pid for pid in popular_ids if pid not in purchased][:K]
        baseline_rows.append(_score(baseline_recs, case["relevant"]))

    return {"n_evaluated": len(cases), "content": _summarize(content_rows),
            "rules": _summarize(rule_rows), "popularity_baseline": _summarize(baseline_rows)}


def evaluate_rules(train_orders: list[dict], test_cases: list[dict]):
    started = time.perf_counter()
    rules = mine_association_rules(train_orders)
    elapsed = time.perf_counter() - started
    test_baskets = [_item_ids(c["test_order"]) for c in test_cases]

    checked = []
    for r in rules:
        with_a = [b for b in test_baskets if r["product_a"] in b]
        if len(with_a) >= 5:
            holdout_conf = sum(1 for b in with_a if r["product_b"] in b) / len(with_a)
            checked.append((r["confidence"], holdout_conf))
    return rules, elapsed, checked


def main():
    client = MongoClient(settings.mongodb_uri, serverSelectionTimeoutMS=5000)
    db = client[settings.database_name]

    products = list(db.products.find({}))
    orders = list(db.orders.find({"payment_status": "paid"}))
    customers = list(db.customers.find({}))
    train_orders, test_cases = temporal_holdout(orders)
    rules, mining_seconds, checked = evaluate_rules(train_orders, test_cases)

    print("=" * 64)
    print("Mercora AI -- ML Evaluation Report")
    print("=" * 64)
    print(f"Data: {len(products)} products, {len(customers)} customers, {len(orders)} paid orders")
    print(f"Holdout: {len(train_orders)} training orders, {len(test_cases)} repeat customers whose "
          f"last order is held out")

    print(f"\n[Recommendation Engine] Precision@{K} / Recall@{K} / Hit Rate on held-out new items")
    rec = evaluate_recommendations(products, train_orders, test_cases, rules)
    if rec:
        print(f"  Evaluated on {rec['n_evaluated']} customers")
        print(f"  {'':22}{'Precision@' + str(K):>14}{'Recall@' + str(K):>12}{'Hit Rate':>11}")
        for label, key in [("Content (TF-IDF)", "content"), ("Co-purchase rules", "rules"),
                           ("Popularity baseline", "popularity_baseline")]:
            m = rec[key]
            print(f"  {label:22}{m['precision_at_k']:>14.4f}{m['recall_at_k']:>12.4f}{m['hit_rate']:>11.4f}")
    else:
        print("  Not enough repeat-customer history to evaluate.")

    print("\n[Association Rules] mined on training orders, re-checked on held-out orders")
    print(f"  Rules discovered: {len(rules)} (mined in {mining_seconds:.1f}s)")
    if rules:
        supports = [r["support"] for r in rules]
        confidences = [r["confidence"] for r in rules]
        lifts = [r["lift"] for r in rules]
        print(f"  Support:    min={min(supports):.4f} max={max(supports):.4f} avg={sum(supports)/len(supports):.4f}")
        print(f"  Confidence: min={min(confidences):.4f} max={max(confidences):.4f} avg={sum(confidences)/len(confidences):.4f}")
        print(f"  Lift:       min={min(lifts):.4f} max={max(lifts):.4f} avg={sum(lifts)/len(lifts):.4f}")
    if checked:
        print(f"  Holdout check ({len(checked)} rules whose antecedent appears in >=5 held-out orders):")
        print(f"    avg training confidence {sum(c[0] for c in checked)/len(checked):.4f} -> "
              f"avg holdout confidence {sum(c[1] for c in checked)/len(checked):.4f}")

    print("\n[Customer Segmentation] silhouette score")
    seg = segment_customers(customers, orders)
    if seg["silhouette_score"] is not None:
        print(f"  Silhouette score: {seg['silhouette_score']:.4f}")
        for s in seg["segments"]:
            print(f"    - {s['name']}: {s['size']} customers, avg spend Rs.{s['avg_total_spent']:.0f}, "
                  f"avg {s['avg_frequency']:.1f} orders, last order {s['avg_recency_days']:.0f} days before latest")
    else:
        print("  Not enough customers to segment.")

    print("\n" + "=" * 64)


if __name__ == "__main__":
    main()
