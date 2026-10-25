"""Offline evaluation of the ML layer against the real order history, using a
per-customer temporal holdout: each repeat customer's LAST order is held
out as the test set and everything earlier is training data.

- Recommendations: Precision@K / Recall@K / Hit Rate on the held-out
  order's *new* items (ones the customer had never bought before), seeded
  from their latest training order. Content similarity (what
  /api/recommendations serves) is reported next to co-purchase rules (what
  the shopping agent's cross-sell serves) and a popularity baseline, so the
  numbers have something to be compared against. Coverage is the share of
  customers a method could recommend anything to at all.
- Association rules: mined on training orders only, then re-checked on the
  held-out orders (holdout confidence vs. training confidence).
- Segmentation: silhouette score and segment sizes.

Pure functions over plain dicts; scripts/evaluate_ml.py and
POST /api/merchant/ml-evaluation/run both call run_evaluation(). Nothing is
fabricated: every number is computed from the orders passed in."""
import random
import time
from collections import Counter
from datetime import datetime, timezone

from app.ml.association import mine_association_rules
from app.ml.recommendation import RecommendationEngine
from app.ml.segmentation import segment_customers

K = 5
MAX_EVAL_CUSTOMERS = 500
SEEDS_PER_CUSTOMER = 3
MIN_HOLDOUT_BASKETS = 5  # a rule is re-checked only if its antecedent recurs this often
MAX_CALIBRATION_POINTS = 300


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
                "seeds": sorted(_item_ids(history[-1]))[:SEEDS_PER_CUSTOMER],
                "purchased": purchased,
                "relevant": relevant,
                "test_order": last,
            })
    return train_orders, test_cases


def _score(recommended: list[str], relevant: set[str]) -> tuple[float, float, bool, bool]:
    hits = len(set(recommended) & relevant)
    return hits / K, hits / len(relevant), hits > 0, bool(recommended)


def _summarize(rows: list[tuple[float, float, bool, bool]]) -> dict:
    n = len(rows)
    return {
        "precision_at_k": round(sum(r[0] for r in rows) / n, 4),
        "recall_at_k": round(sum(r[1] for r in rows) / n, 4),
        "hit_rate": round(sum(r[2] for r in rows) / n, 4),
        "coverage": round(sum(r[3] for r in rows) / n, 4),
    }


def evaluate_recommendations(products: list[dict], train_orders: list[dict], test_cases: list[dict],
                             rules: list[dict]) -> dict | None:
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
            for p in engine.similar_products(seed_id, top_k=K + len(purchased), explained=False):
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
    """Mines rules on training orders and re-checks each one whose antecedent
    appears in enough held-out baskets. Returns (rules, mining_seconds, checked)
    where checked holds {rule, holdout_confidence, holdout_baskets} rows."""
    started = time.perf_counter()
    rules = mine_association_rules(train_orders)
    elapsed = time.perf_counter() - started
    test_baskets = [_item_ids(c["test_order"]) for c in test_cases]

    checked = []
    for r in rules:
        with_a = [b for b in test_baskets if r["product_a"] in b]
        if len(with_a) >= MIN_HOLDOUT_BASKETS:
            holdout_conf = sum(1 for b in with_a if r["product_b"] in b) / len(with_a)
            checked.append({"rule": r, "holdout_confidence": holdout_conf, "holdout_baskets": len(with_a)})
    return rules, elapsed, checked


def _stats(values: list[float]) -> dict:
    return {"min": round(min(values), 4), "max": round(max(values), 4), "avg": round(sum(values) / len(values), 4)}


def run_evaluation(products: list[dict], orders: list[dict], customers: list[dict]) -> dict:
    """The full report as a JSON-ready dict. `orders` are paid orders with at
    least customer_id, created_at, total and items[].product_id."""
    started = time.perf_counter()
    names = {p["_id"]: p.get("name", p["_id"]) for p in products}
    train_orders, test_cases = temporal_holdout(orders)
    rules, mining_seconds, checked = evaluate_rules(train_orders, test_cases)
    recommendations = evaluate_recommendations(products, train_orders, test_cases, rules)

    rules_report: dict = {"count": len(rules), "mining_seconds": round(mining_seconds, 2), "holdout": None}
    if rules:
        rules_report["support"] = _stats([r["support"] for r in rules])
        rules_report["confidence"] = _stats([r["confidence"] for r in rules])
        rules_report["lift"] = _stats([r["lift"] for r in rules])
    if checked:
        points = sorted(checked, key=lambda c: c["holdout_baskets"], reverse=True)[:MAX_CALIBRATION_POINTS]
        rules_report["holdout"] = {
            "n_rules": len(checked),
            "min_baskets": MIN_HOLDOUT_BASKETS,
            "avg_train_confidence": round(sum(c["rule"]["confidence"] for c in checked) / len(checked), 4),
            "avg_holdout_confidence": round(sum(c["holdout_confidence"] for c in checked) / len(checked), 4),
            "points": [{
                "product_a": names.get(c["rule"]["product_a"], c["rule"]["product_a"]),
                "product_b": names.get(c["rule"]["product_b"], c["rule"]["product_b"]),
                "train_confidence": c["rule"]["confidence"],
                "holdout_confidence": round(c["holdout_confidence"], 4),
                "holdout_baskets": c["holdout_baskets"],
                "lift": c["rule"]["lift"],
            } for c in points],
        }

    seg = segment_customers(customers, orders)
    return {
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "k": K,
        "data": {
            "products": len(products), "customers": len(customers), "paid_orders": len(orders),
            "train_orders": len(train_orders), "test_customers": len(test_cases),
        },
        "recommendations": recommendations,
        "rules": rules_report,
        "segmentation": {"silhouette_score": seg["silhouette_score"], "segments": seg["segments"]},
        "duration_seconds": round(time.perf_counter() - started, 2),
    }
