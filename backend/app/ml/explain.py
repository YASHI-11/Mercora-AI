"""Explanations attached to every recommendation: which method picked the
product and the numbers that made it pick it.

Each explanation is {"method", "summary", "signals", "metrics"}:
- method: "co_purchase" (association rule), "content" (TF-IDF similarity),
  "intent" (search ranking) or "popularity".
- summary: one sentence for shoppers.
- signals: [{"label", "value"}] pre-formatted for display.
- metrics: the raw numbers, for anything that wants to compute with them.

Only what the method actually measured is reported -- e.g. a co-purchase
rule mined before basket counts were stored has no "orders together" signal
rather than an estimated one."""
import numpy as np


def _fmt_terms(terms: list[str]) -> str:
    return ", ".join(f"“{t}”" for t in terms)


def top_shared_terms(row_a, row_b, feature_names, n: int = 3) -> list[tuple[str, float]]:
    """The terms that contribute most to the cosine similarity of two
    L2-normalised TF-IDF rows, with each term's share of the similarity
    (the similarity is exactly the sum of these per-term products)."""
    contrib = row_a.multiply(row_b).tocsr()
    if contrib.nnz == 0:
        return []
    total = float(contrib.data.sum())
    order = np.argsort(-contrib.data, kind="stable")[:n]
    return [(str(feature_names[contrib.indices[i]]), float(contrib.data[i]) / total) for i in order]


def content(similarity: float, shared: list[tuple[str, float]]) -> dict:
    terms = [t for t, _ in shared]
    if terms:
        lead, share = shared[0]
        summary = (f"Similar product description: shares {_fmt_terms(terms)} "
                   f"(“{lead}” drives {share:.0%} of the match)")
    else:
        summary = "Similar product description"
    signals = [{"label": "Text similarity", "value": f"{similarity:.2f}"}]
    if terms:
        signals.append({"label": "Shared terms", "value": " · ".join(terms)})
    return {
        "method": "content",
        "summary": summary,
        "signals": signals,
        "metrics": {"similarity": round(similarity, 4),
                    "shared_terms": [{"term": t, "share": round(s, 4)} for t, s in shared]},
    }


def co_purchase(opportunity: dict, viewed_id: str) -> dict:
    """From a mined bundle opportunity, oriented to the product being viewed.
    Confidence is directional: P(other | viewed) = support / support(viewed).
    Lift and the co-occurrence count are symmetric."""
    a, _ = opportunity["products"]
    forward = viewed_id == a
    support = opportunity.get("support")
    viewed_support = opportunity.get("support_a" if forward else "support_b")
    if forward:
        confidence = opportunity.get("confidence")
    elif support and viewed_support:
        confidence = min(1.0, support / viewed_support)
    else:
        confidence = None  # the reverse direction was never stored for this rule
    lift = opportunity.get("lift")
    together = opportunity.get("orders_together")
    baskets = opportunity.get("baskets_analysed")

    parts = []
    if together and baskets:
        parts.append(f"Bought together in {together:,} of {baskets:,} multi-item orders")
    if confidence is not None:
        parts.append(f"{confidence:.0%} of buyers of this product also bought it")
    if lift:
        parts.append(f"{lift:.1f}× more often than chance")
    signals = []
    if together:
        signals.append({"label": "Orders together", "value": f"{together:,}"})
    if confidence is not None:
        signals.append({"label": "Confidence", "value": f"{confidence:.2f}"})
    if lift:
        signals.append({"label": "Lift", "value": f"{lift:.2f}×"})
    if support:
        signals.append({"label": "Support", "value": f"{support:.2%}"})
    return {
        "method": "co_purchase",
        "summary": "; ".join(parts) if parts else "Frequently bought together (association rule)",
        "signals": signals,
        "metrics": {"orders_together": together, "baskets_analysed": baskets, "confidence": confidence,
                    "lift": lift, "support": support},
    }


def intent(blended: float, text_match: float, rating_score: float, matched: list[tuple[str, float]],
           text_weight: float, rating_weight: float) -> dict:
    terms = [t for t, _ in matched]
    summary = (f"Matches your search on {_fmt_terms(terms)}" if terms
               else "Ranked by rating among the products matching your filters")
    signals = [{"label": "Search match", "value": f"{text_match:.2f}"},
               {"label": "Rating score", "value": f"{rating_score:.2f}"},
               {"label": "Ranking score", "value": f"{blended:.2f}"}]
    if terms:
        signals.append({"label": "Matched terms", "value": " · ".join(terms)})
    return {
        "method": "intent",
        "summary": summary,
        "signals": signals,
        "metrics": {"score": round(blended, 4), "text_match": round(text_match, 4),
                    "rating_score": round(rating_score, 4),
                    "weights": {"text": text_weight, "rating": rating_weight},
                    "matched_terms": [{"term": t, "share": round(s, 4)} for t, s in matched]},
    }


def popularity(product: dict, rank: int) -> dict:
    rating = product.get("rating", 0)
    buyers = product.get("rating_count") or 0
    if product.get("rating_imputed"):
        summary = f"Popular in {product.get('category', 'the catalogue')} (category-median rating)"
    else:
        summary = f"#{rank} by rating across the catalogue, from {buyers:,} buyers' repeat purchases"
    return {
        "method": "popularity",
        "summary": summary,
        "signals": [{"label": "Rating", "value": f"{rating:.1f}"},
                    {"label": "Buyers", "value": f"{buyers:,}"},
                    {"label": "Rank", "value": f"#{rank}"}],
        "metrics": {"rating": rating, "rating_count": buyers, "rank": rank,
                    "rating_imputed": bool(product.get("rating_imputed"))},
    }


def because_of(explanation: dict, seed_name: str) -> dict:
    """Personalised picks: the same explanation, prefixed with its seed."""
    return {**explanation, "summary": f"Because you added “{seed_name}” to your cart. "
                                      f"{explanation['summary']}",
            "metrics": {**explanation["metrics"], "seed_product": seed_name}}
