"""Runs the ML evaluation (app/ml/evaluation.py) against what's in MongoDB,
prints a plain-text report, and saves it to the `ml_evaluations` collection,
where the merchant UI's ML Evaluation page reads it (--no-save to skip).

Per-customer temporal holdout: each repeat customer's LAST order is held out
as the test set and everything earlier is training data. Run after
scripts/seed_kaggle_retail.py. Nothing here is fabricated -- every number is
computed from what's actually in MongoDB.
"""
import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
from pymongo import MongoClient  # noqa: E402
from app.config import get_settings  # noqa: E402
from app.ml.evaluation import run_evaluation  # noqa: E402

settings = get_settings()
ORDER_FIELDS = {"customer_id": 1, "created_at": 1, "total": 1, "items.product_id": 1}


def print_report(report: dict) -> None:
    data, k = report["data"], report["k"]
    print("=" * 64)
    print("Mercora AI -- ML Evaluation Report")
    print("=" * 64)
    print(f"Data: {data['products']} products, {data['customers']} customers, {data['paid_orders']} paid orders")
    print(f"Holdout: {data['train_orders']} training orders, {data['test_customers']} repeat customers whose "
          f"last order is held out")

    print(f"\n[Recommendation Engine] Precision@{k} / Recall@{k} / Hit Rate on held-out new items")
    rec = report["recommendations"]
    if rec:
        print(f"  Evaluated on {rec['n_evaluated']} customers")
        print(f"  {'':22}{'Precision@' + str(k):>14}{'Recall@' + str(k):>12}{'Hit Rate':>11}{'Coverage':>11}")
        for label, key in [("Content (TF-IDF)", "content"), ("Co-purchase rules", "rules"),
                           ("Popularity baseline", "popularity_baseline")]:
            m = rec[key]
            print(f"  {label:22}{m['precision_at_k']:>14.4f}{m['recall_at_k']:>12.4f}"
                  f"{m['hit_rate']:>11.4f}{m['coverage']:>11.4f}")
    else:
        print("  Not enough repeat-customer history to evaluate.")

    rules = report["rules"]
    print("\n[Association Rules] mined on training orders, re-checked on held-out orders")
    print(f"  Rules discovered: {rules['count']} (mined in {rules['mining_seconds']:.1f}s)")
    for key in ("support", "confidence", "lift"):
        if key in rules:
            s = rules[key]
            print(f"  {key.capitalize() + ':':12}min={s['min']:.4f} max={s['max']:.4f} avg={s['avg']:.4f}")
    if rules["holdout"]:
        h = rules["holdout"]
        print(f"  Holdout check ({h['n_rules']} rules whose antecedent appears in >={h['min_baskets']} "
              f"held-out orders):")
        print(f"    avg training confidence {h['avg_train_confidence']:.4f} -> "
              f"avg holdout confidence {h['avg_holdout_confidence']:.4f}")

    seg = report["segmentation"]
    print("\n[Customer Segmentation] silhouette score")
    if seg["silhouette_score"] is not None:
        print(f"  Silhouette score: {seg['silhouette_score']:.4f}")
        for s in seg["segments"]:
            print(f"    - {s['name']}: {s['size']} customers, avg spend Rs.{s['avg_total_spent']:.0f}, "
                  f"avg {s['avg_frequency']:.1f} orders, last order {s['avg_recency_days']:.0f} days before latest")
    else:
        print("  Not enough customers to segment.")
    print(f"\nComputed in {report['duration_seconds']:.1f}s")
    print("=" * 64)


def main():
    client = MongoClient(settings.mongodb_uri, serverSelectionTimeoutMS=5000)
    db = client[settings.database_name]

    products = list(db.products.find({}))
    orders = list(db.orders.find({"payment_status": "paid"}, ORDER_FIELDS))
    customers = list(db.customers.find({}, {"_id": 1}))
    report = run_evaluation(products, orders, customers)
    print_report(report)

    if "--no-save" not in sys.argv:
        db.ml_evaluations.insert_one({**report, "source": "scripts/evaluate_ml.py"})
        print("Saved to ml_evaluations (shown on /merchant/ml-evaluation).")


if __name__ == "__main__":
    main()
