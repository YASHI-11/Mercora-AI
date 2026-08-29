"""Hybrid product recommendation: content similarity (TF-IDF over
name+description+tags+category) blended with popularity. Runs in-process
against whatever products are currently in Mongo -- no offline training
step is required, so it always reflects the live catalog."""
import numpy as np
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.metrics.pairwise import cosine_similarity


def _doc_text(p: dict) -> str:
    return " ".join([
        p.get("name", ""), p.get("category", ""), p.get("brand", ""),
        p.get("description", ""), " ".join(p.get("tags", [])),
        " ".join(p.get("features", [])),
    ])


class RecommendationEngine:
    def __init__(self, products: list[dict]):
        self.products = products
        self.id_to_idx = {p["_id"]: i for i, p in enumerate(products)}
        if products:
            texts = [_doc_text(p) for p in products]
            self.vectorizer = TfidfVectorizer(stop_words="english", max_features=2000)
            self.matrix = self.vectorizer.fit_transform(texts)
            self.similarity = cosine_similarity(self.matrix)
        else:
            self.similarity = np.zeros((0, 0))

    def similar_products(self, product_id: str, top_k: int = 6) -> list[dict]:
        idx = self.id_to_idx.get(product_id)
        if idx is None or self.similarity.shape[0] == 0:
            return []
        scores = list(enumerate(self.similarity[idx]))
        scores.sort(key=lambda x: x[1], reverse=True)
        results = []
        for i, score in scores:
            if i == idx:
                continue
            p = dict(self.products[i])
            p["similarity_score"] = round(float(score), 4)
            results.append(p)
            if len(results) >= top_k:
                break
        return results

    def rank_by_intent(self, candidates: list[dict], query_text: str, top_k: int = 12) -> list[dict]:
        """Rank candidate products against a free-text query using TF-IDF
        cosine similarity blended with normalized popularity (rating)."""
        if not candidates:
            return []
        texts = [_doc_text(p) for p in candidates] + [query_text]
        vec = TfidfVectorizer(stop_words="english", max_features=2000)
        try:
            mat = vec.fit_transform(texts)
        except ValueError:
            return candidates[:top_k]
        sims = cosine_similarity(mat[-1], mat[:-1]).flatten()
        ratings = np.array([p.get("rating", 4.0) for p in candidates])
        ratings_range = np.ptp(ratings)
        pop = (ratings - ratings.min()) / (ratings_range + 1e-9) if ratings_range > 0 else np.zeros(len(ratings))
        blended = 0.75 * sims + 0.25 * pop
        order = np.argsort(-blended)
        ranked = []
        for i in order[:top_k]:
            p = dict(candidates[i])
            p["match_score"] = round(float(blended[i]), 4)
            ranked.append(p)
        return ranked

    def popular(self, top_k: int = 8) -> list[dict]:
        ranked = sorted(self.products, key=lambda p: p.get("rating", 0), reverse=True)
        return ranked[:top_k]
