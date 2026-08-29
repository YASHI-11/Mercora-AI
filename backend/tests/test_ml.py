from app.ml.recommendation import RecommendationEngine
from app.ml.association import mine_association_rules
from app.ml.opportunity import score_opportunity, build_bundle_opportunities
from app.ml.segmentation import segment_customers


def sample_products():
    return [
        {"_id": "p1", "name": "Wireless Headphones", "category": "Audio", "brand": "SonicWave",
         "description": "Bluetooth headphones for gaming and music", "price": 3000, "discount": 0,
         "rating": 4.5, "features": ["Bluetooth"], "tags": ["audio"]},
        {"_id": "p2", "name": "Headphone Case", "category": "Audio", "brand": "SonicWave",
         "description": "Carrying case for headphones", "price": 400, "discount": 0,
         "rating": 4.2, "features": ["Hardshell"], "tags": ["audio", "companion"]},
        {"_id": "p3", "name": "Gaming Laptop", "category": "Laptops", "brand": "CoreForge",
         "description": "High performance laptop for gaming and programming", "price": 70000, "discount": 0,
         "rating": 4.6, "features": ["RTX"], "tags": ["laptop"]},
    ]


def test_similar_products():
    engine = RecommendationEngine(sample_products())
    similar = engine.similar_products("p1", top_k=2)
    assert len(similar) >= 1
    assert similar[0]["_id"] in {"p2", "p3"}


def test_rank_by_intent():
    engine = RecommendationEngine(sample_products())
    ranked = engine.rank_by_intent(sample_products(), "wireless headphones for gaming", top_k=2)
    assert ranked[0]["_id"] == "p1"


def test_association_rules():
    orders = [{"items": [{"product_id": "p1"}, {"product_id": "p2"}]} for _ in range(10)]
    orders += [{"items": [{"product_id": "p3"}]} for _ in range(5)]
    rules = mine_association_rules(orders, min_support=0.1, min_confidence=0.1)
    assert any(r["product_a"] == "p1" and r["product_b"] == "p2" for r in rules)


def test_opportunity_score_bounds():
    score = score_opportunity(1.0, 1.0, 1.0, 1.0)
    assert score == 1.0
    score2 = score_opportunity(0, 0, 0, 0)
    assert score2 == 0.0


def test_build_bundle_opportunities():
    rules = [{"product_a": "p1", "product_b": "p2", "support": 0.2, "confidence": 0.5, "lift": 2.5}]
    products_by_id = {p["_id"]: p for p in sample_products()}
    opps = build_bundle_opportunities(rules, products_by_id, orders_count=100)
    assert len(opps) == 1
    assert opps[0]["type"] == "bundle"
    assert 0 <= opps[0]["score"] <= 1


def test_segmentation_handles_small_data():
    result = segment_customers([{"_id": "c1"}], [], n_clusters=5)
    assert result["segments"] == []
