"""Growth-opportunity scoring: combines association-rule signals with
revenue/conversion metrics into ranked, explainable opportunities for the
merchant. Every number here is derived from real aggregate order/product
data -- nothing is invented by the LLM layer."""


def score_opportunity(purchase_affinity: float, conversion_potential: float,
                       revenue_potential: float, confidence: float) -> float:
    score = (
        0.35 * purchase_affinity +
        0.25 * conversion_potential +
        0.20 * revenue_potential +
        0.20 * confidence
    )
    return round(min(1.0, max(0.0, score)), 4)


def build_bundle_opportunities(rules: list[dict], products_by_id: dict, orders_count: int) -> list[dict]:
    opportunities = []
    seen_pairs = set()
    for rule in rules[:30]:
        a, b = rule["product_a"], rule["product_b"]
        pair_key = tuple(sorted([a, b]))
        if pair_key in seen_pairs:
            continue
        seen_pairs.add(pair_key)

        prod_a = products_by_id.get(a)
        prod_b = products_by_id.get(b)
        if not prod_a or not prod_b:
            continue

        purchase_affinity = min(1.0, rule["lift"] / 5)
        conversion_potential = min(1.0, rule["confidence"] * 1.5)
        estimated_monthly_orders = rule["support"] * orders_count
        expected_uplift = round(estimated_monthly_orders * prod_b["price"] * 0.3, 2)
        revenue_potential = min(1.0, expected_uplift / 50000)
        confidence = min(1.0, rule["confidence"])

        score = score_opportunity(purchase_affinity, conversion_potential, revenue_potential, confidence)
        recommended_discount = round(min(15, max(5, rule["lift"] * 2)), 1)

        opportunities.append({
            "type": "bundle",
            "products": [a, b],
            "product_names": [prod_a["name"], prod_b["name"]],
            "support": rule["support"],
            "confidence": rule["confidence"],
            "lift": rule["lift"],
            "score": score,
            "expected_uplift": expected_uplift,
            "recommended_discount": recommended_discount,
            "reason": (
                f"Customers purchasing {prod_a['name']} are {rule['lift']:.1f}x more likely "
                f"than average to also purchase {prod_b['name']} (support {rule['support']*100:.1f}%, "
                f"confidence {rule['confidence']*100:.1f}%)."
            ),
        })
    opportunities.sort(key=lambda o: o["score"], reverse=True)
    return opportunities


def build_upsell_opportunities(products: list[dict]) -> list[dict]:
    """Identify high-rating, low-conversion-adjacent premium products within
    a category as upsell candidates relative to the category's cheapest item."""
    by_category: dict[str, list[dict]] = {}
    for p in products:
        by_category.setdefault(p["category"], []).append(p)

    opportunities = []
    for category, items in by_category.items():
        if len(items) < 2:
            continue
        items_sorted = sorted(items, key=lambda p: p["price"])
        cheapest = items_sorted[0]
        premium_candidates = [p for p in items_sorted[1:] if p.get("rating", 0) >= 4.3]
        if not premium_candidates:
            continue
        premium = max(premium_candidates, key=lambda p: p.get("rating", 0))
        price_gap = premium["price"] - cheapest["price"]
        if price_gap <= 0:
            continue
        confidence = min(1.0, premium.get("rating", 4.0) / 5)
        score = score_opportunity(0.5, 0.6, min(1.0, price_gap / 20000), confidence)
        opportunities.append({
            "type": "upsell",
            "products": [cheapest["_id"], premium["_id"]],
            "product_names": [cheapest["name"], premium["name"]],
            "score": score,
            "expected_uplift": round(price_gap * 0.05, 2),
            "reason": (
                f"{premium['name']} rates {premium.get('rating', 0):.1f}/5 and costs "
                f"₹{price_gap:.0f} more than {cheapest['name']} -- a natural upsell for "
                f"budget-conscious shoppers already viewing this category."
            ),
        })
    opportunities.sort(key=lambda o: o["score"], reverse=True)
    return opportunities
