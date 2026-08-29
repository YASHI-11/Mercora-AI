"""Customer segmentation via KMeans over RFM-style features (recency,
frequency, monetary, avg order value). Segment labels are derived
deterministically from cluster centroid characteristics, never hardcoded
per-customer."""
import numpy as np
import pandas as pd
from sklearn.cluster import KMeans
from sklearn.preprocessing import StandardScaler
from sklearn.metrics import silhouette_score
from datetime import datetime, timezone


def build_customer_features(customers: list[dict], orders: list[dict]) -> pd.DataFrame:
    now = datetime.now(timezone.utc)
    orders_by_customer: dict[str, list[dict]] = {}
    for o in orders:
        orders_by_customer.setdefault(o["customer_id"], []).append(o)

    rows = []
    for c in customers:
        cust_orders = orders_by_customer.get(c["_id"], [])
        total_spent = sum(o.get("total", 0) for o in cust_orders)
        frequency = len(cust_orders)
        if cust_orders:
            dates = [datetime.fromisoformat(o["created_at"]) for o in cust_orders]
            recency_days = (now - max(dates)).days
        else:
            recency_days = 999
        aov = total_spent / frequency if frequency else 0
        rows.append({
            "customer_id": c["_id"],
            "total_spent": total_spent,
            "frequency": frequency,
            "recency_days": recency_days,
            "avg_order_value": aov,
        })
    return pd.DataFrame(rows)


def segment_customers(customers: list[dict], orders: list[dict], n_clusters: int = 5) -> dict:
    df = build_customer_features(customers, orders)
    if len(df) < n_clusters * 2:
        return {"segments": [], "silhouette_score": None, "assignments": {}}

    features = df[["total_spent", "frequency", "recency_days", "avg_order_value"]].values
    scaler = StandardScaler()
    scaled = scaler.fit_transform(features)

    kmeans = KMeans(n_clusters=n_clusters, random_state=42, n_init=10)
    labels = kmeans.fit_predict(scaled)
    df["cluster"] = labels

    try:
        sil = float(silhouette_score(scaled, labels))
    except Exception:
        sil = None

    segments = []
    assignments = {}
    for cluster_id in sorted(df["cluster"].unique()):
        sub = df[df["cluster"] == cluster_id]
        avg_spent = sub["total_spent"].mean()
        avg_freq = sub["frequency"].mean()
        avg_recency = sub["recency_days"].mean()

        if avg_spent > df["total_spent"].quantile(0.75) and avg_freq > df["frequency"].median():
            name = "High-value customers"
        elif avg_freq > df["frequency"].quantile(0.75):
            name = "Frequent customers"
        elif avg_recency > df["recency_days"].quantile(0.75):
            name = "At-risk customers"
        elif avg_freq <= 1:
            name = "New customers"
        else:
            name = "Occasional customers"

        segments.append({
            "cluster_id": int(cluster_id),
            "name": name,
            "size": int(len(sub)),
            "avg_total_spent": round(float(avg_spent), 2),
            "avg_frequency": round(float(avg_freq), 2),
            "avg_recency_days": round(float(avg_recency), 2),
        })
        for cid in sub["customer_id"]:
            assignments[cid] = name

    return {"segments": segments, "silhouette_score": sil, "assignments": assignments}
