"""Customer segmentation via KMeans over RFM-style features (recency,
frequency, monetary, avg order value). Segment labels are derived
deterministically from cluster centroid characteristics, never hardcoded
per-customer.

Recency is measured against the latest order in the data, not the wall
clock. Features are log1p-scaled before standardizing: spend and frequency
are heavy-tailed (a handful of wholesale buyers spend 50x the median), and
on raw values KMeans spends whole clusters on single outliers instead of
finding usable segments.

Features can be built from raw orders (build_customer_features) or from
per-customer aggregates computed in MongoDB (features_from_rfm) -- the
growth agent uses the latter so segmentation always covers every paid
order without loading them all into memory."""
from datetime import datetime, timezone

import numpy as np
import pandas as pd
from sklearn.cluster import KMeans
from sklearn.metrics import silhouette_score
from sklearn.preprocessing import StandardScaler

NO_ORDERS_RECENCY_DAYS = 999


def rfm_rows_from_orders(orders: list[dict]) -> list[dict]:
    """Per-customer aggregates, the same shape a MongoDB $group produces."""
    rows: dict[str, dict] = {}
    for o in orders:
        row = rows.setdefault(o["customer_id"], {"customer_id": o["customer_id"], "total_spent": 0.0,
                                                 "frequency": 0, "last_order_at": o["created_at"]})
        row["total_spent"] += o.get("total", 0)
        row["frequency"] += 1
        row["last_order_at"] = max(row["last_order_at"], o["created_at"],
                                   key=datetime.fromisoformat)
    return list(rows.values())


def features_from_rfm(customers: list[dict], rfm_rows: list[dict],
                      reference_date: datetime | None = None) -> pd.DataFrame:
    by_customer = {r["customer_id"]: r for r in rfm_rows}
    last_dates = {cid: datetime.fromisoformat(r["last_order_at"]) for cid, r in by_customer.items()}
    if reference_date is None:
        reference_date = max(last_dates.values(), default=datetime.now(timezone.utc))

    rows = []
    for c in customers:
        r = by_customer.get(c["_id"])
        frequency = r["frequency"] if r else 0
        total_spent = r["total_spent"] if r else 0
        recency_days = max(0, (reference_date - last_dates[c["_id"]]).days) if r else NO_ORDERS_RECENCY_DAYS
        rows.append({
            "customer_id": c["_id"],
            "total_spent": total_spent,
            "frequency": frequency,
            "recency_days": recency_days,
            "avg_order_value": total_spent / frequency if frequency else 0,
        })
    return pd.DataFrame(rows)


def build_customer_features(customers: list[dict], orders: list[dict],
                            reference_date: datetime | None = None) -> pd.DataFrame:
    return features_from_rfm(customers, rfm_rows_from_orders(orders), reference_date)


def _base_segment_name(sub: pd.DataFrame, df: pd.DataFrame) -> str:
    avg_spent, avg_freq, avg_recency = sub["total_spent"].mean(), sub["frequency"].mean(), sub["recency_days"].mean()
    if avg_spent > df["total_spent"].quantile(0.75) and avg_freq > df["frequency"].median():
        return "High-value customers"
    if avg_freq > df["frequency"].quantile(0.75):
        return "Frequent customers"
    if avg_recency > df["recency_days"].quantile(0.75):
        return "At-risk customers"
    if avg_freq <= 1:
        return "New customers"
    return "Occasional customers"


_QUALIFIERS = {
    "avg_recency_days": ("recently active", "cooling", "lapsing"),  # ascending recency
    "avg_total_spent": ("lower spend", "mid spend", "higher spend"),  # ascending spend
}


def _disambiguate_names(segments: list[dict]) -> None:
    """Two clusters can land on the same rule-based label. Qualify each such
    group by whichever of recency / spend actually separates its clusters
    (largest max/min ratio), so every segment shown is distinguishable."""
    groups: dict[str, list[dict]] = {}
    for s in segments:
        groups.setdefault(s["name"], []).append(s)
    for name, group in groups.items():
        if len(group) < 2:
            continue

        def spread(key):
            values = [s[key] for s in group]
            return max(values) / max(min(values), 1e-9)

        key = max(_QUALIFIERS, key=spread)
        ordered = sorted(group, key=lambda s: s[key])
        low, mid, high = _QUALIFIERS[key]
        for i, s in enumerate(ordered):
            qualifier = low if i == 0 else high if i == len(ordered) - 1 else mid
            s["name"] = f"{name} ({qualifier})"
        if len(ordered) > 3:
            for i, s in enumerate(ordered[1:-1], start=2):
                s["name"] = f"{name} ({mid} {i})"


def segment_features(df: pd.DataFrame, n_clusters: int = 5) -> dict:
    if len(df) < n_clusters * 2:
        return {"segments": [], "silhouette_score": None, "assignments": {}}

    features = df[["total_spent", "frequency", "recency_days", "avg_order_value"]].values
    scaled = StandardScaler().fit_transform(np.log1p(features))

    kmeans = KMeans(n_clusters=n_clusters, random_state=42, n_init=10)
    labels = kmeans.fit_predict(scaled)
    df = df.assign(cluster=labels)

    try:
        sil = float(silhouette_score(scaled, labels))
    except Exception:
        sil = None

    segments = []
    for cluster_id in sorted(df["cluster"].unique()):
        sub = df[df["cluster"] == cluster_id]
        segments.append({
            "cluster_id": int(cluster_id),
            "name": _base_segment_name(sub, df),
            "size": int(len(sub)),
            "avg_total_spent": round(float(sub["total_spent"].mean()), 2),
            "avg_frequency": round(float(sub["frequency"].mean()), 2),
            "avg_recency_days": round(float(sub["recency_days"].mean()), 2),
        })

    _disambiguate_names(segments)

    names = {s["cluster_id"]: s["name"] for s in segments}
    assignments = {cid: names[int(cl)] for cid, cl in zip(df["customer_id"], df["cluster"])}
    return {"segments": segments, "silhouette_score": sil, "assignments": assignments}


def segment_customers(customers: list[dict], orders: list[dict], n_clusters: int = 5) -> dict:
    return segment_features(build_customer_features(customers, orders), n_clusters)
