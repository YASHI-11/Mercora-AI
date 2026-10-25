import json
from datetime import datetime, timedelta, timezone

import pytest

from app.ml import explain
from app.ml.association import mine_association_rules
from app.ml.evaluation import K, run_evaluation, temporal_holdout
from app.ml.recommendation import RecommendationEngine
from tests.test_ml import sample_products


# ---------------------------------------------------------------- explanations

def test_similar_products_explain_with_shared_terms():
    engine = RecommendationEngine(sample_products())
    top = engine.similar_products("p1", top_k=1)[0]
    why = top["explanation"]
    assert why["method"] == "content"
    assert why["metrics"]["similarity"] == pytest.approx(top["similarity_score"], abs=1e-4)
    terms = why["metrics"]["shared_terms"]
    assert terms and terms[0]["term"] in why["summary"]
    # Shares are fractions of the cosine similarity, which is their sum.
    assert sum(t["share"] for t in terms) <= 1.0 + 1e-6


def test_shared_term_contributions_sum_to_the_cosine_similarity():
    engine = RecommendationEngine(sample_products())
    a, b = engine.id_to_idx["p1"], engine.id_to_idx["p2"]
    every_term = explain.top_shared_terms(engine.matrix[a], engine.matrix[b], engine.feature_names, n=10_000)
    assert sum(s for _, s in every_term) == pytest.approx(1.0)
    served = next(p for p in engine.similar_products("p1", top_k=2) if p["_id"] == "p2")
    assert float(engine.matrix[a].multiply(engine.matrix[b]).sum()) == pytest.approx(served["similarity_score"],
                                                                                      abs=1e-4)


def test_rank_by_intent_explains_matched_terms_and_weights():
    engine = RecommendationEngine(sample_products())
    ranked = engine.rank_by_intent(sample_products(), "wireless headphones for gaming", top_k=2)
    why = ranked[0]["explanation"]
    assert why["method"] == "intent"
    matched = {t["term"] for t in why["metrics"]["matched_terms"]}
    assert matched & {"wireless", "headphones", "gaming"}
    m = why["metrics"]
    assert m["score"] == pytest.approx(m["weights"]["text"] * m["text_match"] + m["weights"]["rating"] * m["rating_score"],
                                       abs=1e-3)


def test_popular_explains_rank():
    engine = RecommendationEngine(sample_products())
    popular = engine.popular(top_k=3)
    assert [p["explanation"]["metrics"]["rank"] for p in popular] == [1, 2, 3]
    assert popular[0]["explanation"]["method"] == "popularity"


def test_association_rules_carry_exact_counts():
    orders = [{"items": [{"product_id": "p1"}, {"product_id": "p2"}]} for _ in range(6)]
    orders += [{"items": [{"product_id": "p1"}, {"product_id": "p3"}]} for _ in range(4)]
    rules = mine_association_rules(orders, min_support=0.1, min_confidence=0.1)
    rule = next(r for r in rules if r["product_a"] == "p1" and r["product_b"] == "p2")
    assert rule["baskets_analysed"] == 10
    assert rule["orders_together"] == 6
    assert rule["support_a"] == pytest.approx(1.0)
    assert rule["support_b"] == pytest.approx(0.6)
    assert rule["confidence"] == pytest.approx(0.6)


def test_co_purchase_confidence_is_oriented_to_the_viewed_product():
    # p1 is in every basket, p2 in 60%: P(p2|p1) = 0.6 but P(p1|p2) = 1.0.
    opp = {"products": ["p1", "p2"], "support": 0.6, "confidence": 0.6, "lift": 1.0,
           "support_a": 1.0, "support_b": 0.6, "orders_together": 6, "baskets_analysed": 10}
    assert explain.co_purchase(opp, "p1")["metrics"]["confidence"] == pytest.approx(0.6)
    viewed_b = explain.co_purchase(opp, "p2")
    assert viewed_b["metrics"]["confidence"] == pytest.approx(1.0)
    assert "6 of 10" in viewed_b["summary"]


def test_co_purchase_omits_what_an_older_rule_never_stored():
    opp = {"products": ["p1", "p2"], "support": 0.2, "confidence": 0.5, "lift": 2.5}
    why = explain.co_purchase(opp, "p2")
    assert why["metrics"]["confidence"] is None
    labels = {s["label"] for s in why["signals"]}
    assert "Orders together" not in labels and "Confidence" not in labels
    assert "Lift" in labels


# ------------------------------------------------------------------ evaluation

def _orders():
    """30 customers: everyone buys p1+p2 first; their last order adds p3."""
    start = datetime(2026, 1, 1, tzinfo=timezone.utc)
    orders = []
    for c in range(30):
        orders.append({"customer_id": f"c{c}", "created_at": (start + timedelta(days=c)).isoformat(), "total": 100,
                       "items": [{"product_id": "p1"}, {"product_id": "p2"}]})
        orders.append({"customer_id": f"c{c}", "created_at": (start + timedelta(days=40 + c)).isoformat(),
                       "total": 50 + c * 10, "items": [{"product_id": "p3"}, {"product_id": "p2"}]})
    return orders


def test_temporal_holdout_holds_out_each_customers_last_order():
    train, cases = temporal_holdout(_orders())
    assert len(train) == 30 and len(cases) == 30
    assert all(c["relevant"] == {"p3"} for c in cases)
    assert all(c["test_order"]["created_at"] > "2026-02" for c in cases)


def test_run_evaluation_report_is_json_ready_and_complete():
    customers = [{"_id": f"c{c}"} for c in range(30)]
    report = run_evaluation(sample_products(), _orders(), customers)
    json.dumps(report)  # stored in Mongo and served as-is
    assert report["k"] == K
    assert report["data"] == {"products": 3, "customers": 30, "paid_orders": 60,
                              "train_orders": 30, "test_customers": 30}
    rec = report["recommendations"]
    for method in ("content", "rules", "popularity_baseline"):
        m = rec[method]
        assert set(m) == {"precision_at_k", "recall_at_k", "hit_rate", "coverage"}
        assert all(0 <= v <= 1 for v in m.values())
    # Only p3 is new to every customer. Nobody bought it in training, so
    # popularity has nothing new to offer (coverage 0), while content
    # similarity reaches it from the p1/p2 seeds.
    assert rec["popularity_baseline"]["coverage"] == 0.0
    assert rec["content"]["hit_rate"] == 1.0
    assert rec["content"]["precision_at_k"] == pytest.approx(1 / K)
    assert report["segmentation"]["silhouette_score"] is not None


def test_run_evaluation_is_deterministic():
    customers = [{"_id": f"c{c}"} for c in range(30)]
    a = run_evaluation(sample_products(), _orders(), customers)
    b = run_evaluation(sample_products(), _orders(), customers)
    for report in (a, b):
        report.pop("generated_at"), report.pop("duration_seconds"), report["rules"].pop("mining_seconds")
    assert a == b
