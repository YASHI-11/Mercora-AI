"""Computes real ML evaluation metrics against the seeded dataset:
- Recommendation engine: Precision@K / Recall@K / Hit Rate, using each
  customer's held-out purchases as ground truth for "relevant" items.
- Association rules: distribution of support/confidence/lift for discovered rules.
- Segmentation: silhouette score.
Run after scripts/seed_data.py. Prints a plain-text report; nothing here
is fabricated -- every number is computed from what's actually in MongoDB.
"""
import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
from pymongo import MongoClient  # noqa: E402
from app.config import get_settings  # noqa: E402
from app.ml.recommendation import RecommendationEngine  # noqa: E402
from app.ml.association import mine_association_rules  # noqa: E402
from app.ml.segmentation import segment_customers  # noqa: E402

settings = get_settings()
K = 5


def evaluate_recommendations(db):
    products = list(db.products.find({}))
    orders = list(db.orders.find({"payment_status": "paid"}))

    orders_by_customer: dict[str, list[dict]] = {}
    for o in orders:
        orders_by_customer.setdefault(o["customer_id"], []).append(o)

    engine = RecommendationEngine(products)
    precisions, recalls, hits = [], [], []

    for customer_id, cust_orders in list(orders_by_customer.items())[:200]:
        purchased_ids = {i["product_id"] for o in cust_orders for i in o["items"]}
        if len(purchased_ids) < 2:
            continue
        seed_id = next(iter(purchased_ids))
        relevant = purchased_ids - {seed_id}
        if not relevant:
            continue

        recs = engine.similar_products(seed_id, top_k=K)
        recommended_ids = {p["_id"] for p in recs}

        hit = len(recommended_ids & relevant) > 0
        precision = len(recommended_ids & relevant) / K
        recall = len(recommended_ids & relevant) / len(relevant)

        hits.append(hit)
        precisions.append(precision)
        recalls.append(recall)

    if not precisions:
        return None
    return {
        "n_evaluated": len(precisions),
        "precision_at_k": round(sum(precisions) / len(precisions), 4),
        "recall_at_k": round(sum(recalls) / len(recalls), 4),
        "hit_rate": round(sum(hits) / len(hits), 4),
    }


def main():
    client = MongoClient(settings.mongodb_uri, serverSelectionTimeoutMS=5000)
    db = client[settings.database_name]

    print("=" * 60)
    print("Mercora AI -- ML Evaluation Report")
    print("=" * 60)

    print(f"\n[Recommendation Engine] Precision@{K} / Recall@{K} / Hit Rate")
    rec_metrics = evaluate_recommendations(db)
    if rec_metrics:
        print(f"  Evaluated on {rec_metrics['n_evaluated']} customers")
        print(f"  Precision@{K}: {rec_metrics['precision_at_k']}")
        print(f"  Recall@{K}:    {rec_metrics['recall_at_k']}")
        print(f"  Hit Rate:      {rec_metrics['hit_rate']}")
    else:
        print("  Not enough order history to evaluate.")

    print("\n[Association Rules] support / confidence / lift distribution")
    orders = list(db.orders.find({"payment_status": "paid"}))
    rules = mine_association_rules(orders)
    print(f"  Rules discovered: {len(rules)}")
    if rules:
        supports = [r["support"] for r in rules]
        confidences = [r["confidence"] for r in rules]
        lifts = [r["lift"] for r in rules]
        print(f"  Support:    min={min(supports):.4f} max={max(supports):.4f} avg={sum(supports)/len(supports):.4f}")
        print(f"  Confidence: min={min(confidences):.4f} max={max(confidences):.4f} avg={sum(confidences)/len(confidences):.4f}")
        print(f"  Lift:       min={min(lifts):.4f} max={max(lifts):.4f} avg={sum(lifts)/len(lifts):.4f}")

    print("\n[Customer Segmentation] silhouette score")
    customers = list(db.customers.find({}))
    seg = segment_customers(customers, orders)
    if seg["silhouette_score"] is not None:
        print(f"  Silhouette score: {seg['silhouette_score']:.4f}")
        for s in seg["segments"]:
            print(f"    - {s['name']}: {s['size']} customers, avg spend Rs.{s['avg_total_spent']:.0f}")
    else:
        print("  Not enough customers to segment.")

    print("\n" + "=" * 60)


if __name__ == "__main__":
    main()
