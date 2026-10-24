import csv
import importlib.util
import json
import os
from datetime import datetime, timezone

from app.agents.llm_provider import parse_shopping_intent
from app.ml.recommendation import RecommendationEngine
from app.ml.segmentation import build_customer_features

_spec = importlib.util.spec_from_file_location(
    "seed_kaggle_retail", os.path.join(os.path.dirname(__file__), "..", "scripts", "seed_kaggle_retail.py")
)
seed = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(seed)

COLUMNS = ["order_id", "order_date", "customer_id", "country", "product_id", "product_name", "category",
           "subcategory", "price", "unit_price", "quantity", "line_total", "currency", "order_count",
           "units_sold", "implicit_rating", "implicit_rating_customers", "customer_recency_days",
           "customer_frequency", "customer_monetary_value", "product_text"]


def _row(**overrides):
    row = {
        "order_id": "536365", "order_date": "2010-12-01T08:26:00", "customer_id": "17850",
        "country": "United Kingdom", "product_id": "OR-85123A",
        "product_name": "WHITE HANGING HEART T-LIGHT HOLDER", "category": "Home Decor",
        "subcategory": "Lighting & Candles", "price": "2.95", "unit_price": "2.55", "quantity": "6",
        "line_total": "15.3", "currency": "GBP", "order_count": "2253", "units_sold": "35409",
        "implicit_rating": "5.0", "implicit_rating_customers": "854", "customer_recency_days": "372",
        "customer_frequency": "34", "customer_monetary_value": "5333.25", "product_text": "",
    }
    row.update(overrides)
    return row


def _write_csv(path, rows):
    with open(path, "w", encoding="utf-8", newline="") as f:
        writer = csv.DictWriter(f, fieldnames=COLUMNS)
        writer.writeheader()
        writer.writerows(rows)


def test_load_rows_skips_guests_and_strips_stock_code_prefix(tmp_path):
    path = tmp_path / "data.csv"
    _write_csv(path, [
        _row(),
        _row(customer_id="", order_id="536366"),  # guest invoice
        _row(quantity="0", order_id="536367"),
    ])
    rows = list(seed.load_rows(str(path)))
    assert len(rows) == 1
    assert rows[0]["stock_code"] == "85123A"
    assert seed.nid("prod", rows[0]["stock_code"]) == "prod_retail_85123A"


def test_build_products_uses_dataset_taxonomy_and_flags_gaps(tmp_path):
    path = tmp_path / "data.csv"
    _write_csv(path, [
        _row(),
        _row(product_id="OR-21777", product_name="RECIPE BOX", implicit_rating="", order_id="536368"),
        _row(product_id="OR-22961", product_name="JAM MAKING SET PRINTED", category="", subcategory="",
             order_id="536369"),
    ])
    products = seed.build_products(list(seed.load_rows(str(path))))

    holder = products["85123A"]
    assert (holder["category"], holder["subcategory"], holder["category_source"]) == \
        ("Home Decor", "Lighting & Candles", "dataset")
    assert holder["rating"] == 5.0 and holder["rating_count"] == 854 and not holder["rating_imputed"]
    assert holder["price"] == round(2.95 * seed.GBP_TO_INR, 2)

    unrated = products["21777"]
    assert unrated["rating_imputed"] and unrated["rating"] == 5.0  # Home Decor median

    uncategorized = products["22961"]
    assert uncategorized["category"] == uncategorized["subcategory"] == "Uncategorized"
    assert uncategorized["category_source"] == "uncategorized"
    assert all(p["image"] == "" for p in products.values())


def test_build_orders_groups_lines_by_invoice(tmp_path):
    path = tmp_path / "data.csv"
    _write_csv(path, [_row(), _row(product_id="OR-71053", product_name="WHITE METAL LANTERN")])
    rows = list(seed.load_rows(str(path)))
    products = seed.build_products(rows)
    customers = seed.build_customers(rows)
    orders = seed.build_orders(rows, products, customers)
    assert len(orders) == 1
    assert len(orders[0]["items"]) == 2
    assert orders[0]["customer_id"] == "cust_retail_17850"
    assert orders[0]["source_order_date"].startswith("2010-12-01T08:26:00")
    # one fixed shift: the file's last invoice (2011-12-09 12:50) -> 2026-10-23 12:50
    assert seed.shifted(seed.parse_order_date("2011-12-09T12:50:00")).isoformat() == "2026-10-23T12:50:00+00:00"
    assert orders[0]["created_at"] == seed.shifted(seed.parse_order_date("2010-12-01T08:26:00")).isoformat()


def test_similar_products_never_returns_source():
    products = [
        {"_id": f"p{i}", "name": f"Heart Lantern {i}", "category": "Home Decor", "tags": ["home decor"]}
        for i in range(4)
    ]
    engine = RecommendationEngine(products)
    similar = engine.similar_products("p0", top_k=10)
    assert [p["_id"] for p in similar] != [] and "p0" not in {p["_id"] for p in similar}
    assert len(similar) == 3


def test_segmentation_recency_is_relative_to_latest_order():
    customers = [{"_id": "c1"}, {"_id": "c2"}]
    orders = [
        {"customer_id": "c1", "total": 10, "created_at": "2011-12-09T12:50:00+00:00"},
        {"customer_id": "c2", "total": 10, "created_at": "2011-11-29T12:50:00+00:00"},
    ]
    df = build_customer_features(customers, orders).set_index("customer_id")
    assert df.loc["c1", "recency_days"] == 0
    assert df.loc["c2", "recency_days"] == 10

    fixed = datetime(2011, 12, 19, 12, 50, tzinfo=timezone.utc)
    assert build_customer_features(customers, orders, fixed).set_index("customer_id").loc["c1", "recency_days"] == 10


def test_fallback_parser_knows_retail_categories():
    assert parse_shopping_intent("christmas decorations under 500")["category"] == "Party & Seasonal"
    assert parse_shopping_intent("a heart candle holder")["category"] == "Home Decor"
    assert parse_shopping_intent("silver necklace")["category"] == "Fashion & Jewellery"
    # ambiguous across the file's categories -> left to keyword search
    assert parse_shopping_intent("a hanging lantern")["category"] is None
    assert parse_shopping_intent("cake")["category"] is None


def test_build_products_attaches_licensed_image(tmp_path):
    path = tmp_path / "data.csv"
    _write_csv(path, [_row(), _row(product_id="OR-71053", product_name="WHITE METAL LANTERN")])
    photo = {"url": "https://upload.wikimedia.org/x.jpg", "author": "A. Photographer",
             "license": "CC BY-SA 4.0", "source": "https://commons.wikimedia.org/wiki/File:X.jpg", "title": "File:X.jpg"}
    products = seed.build_products(list(seed.load_rows(str(path))), {"85123A": photo})
    assert products["85123A"]["image"] == photo["url"]
    assert products["85123A"]["image_credit"] == {"author": "A. Photographer", "license": "CC BY-SA 4.0",
                                                  "source": photo["source"]}
    assert products["71053"]["image"] == "" and products["71053"]["image_credit"] is None


def test_load_images_resolves_pool_index(tmp_path):
    path = tmp_path / "images.json"
    pool = [{"url": f"u{i}", "author": "a", "license": "CC0", "source": "s", "title": "t"} for i in range(3)]
    path.write_text(json.dumps({"pools": {"mug": pool, "empty": []},
                                "products": {"A": ["mug", 4], "B": ["empty", 0]}}), encoding="utf-8")
    images = seed.load_images(str(path))
    assert images["A"]["url"] == "u1"  # index wraps within the pool
    assert "B" not in images
    assert seed.load_images(str(tmp_path / "missing.json")) == {}


def test_segment_names_are_unique():
    customers = [{"_id": f"c{i}"} for i in range(40)]
    orders = [
        {"customer_id": f"c{i}", "total": 100 * (1 + i % 4), "created_at": f"2026-10-{1 + i % 20:02d}T10:00:00+00:00"}
        for i in range(40) for _ in range(1 + i % 3)
    ]
    from app.ml.segmentation import segment_customers
    names = [s["name"] for s in segment_customers(customers, orders)["segments"]]
    assert len(names) == len(set(names))


def test_rfm_aggregates_match_order_based_features():
    from app.ml.segmentation import features_from_rfm, rfm_rows_from_orders
    customers = [{"_id": "c1"}, {"_id": "c2"}, {"_id": "c3"}]
    orders = [
        {"customer_id": "c1", "total": 10, "created_at": "2026-10-01T00:00:00+00:00"},
        {"customer_id": "c1", "total": 30, "created_at": "2026-10-11T00:00:00+00:00"},
        {"customer_id": "c2", "total": 5, "created_at": "2026-10-21T00:00:00+00:00"},
    ]
    df = features_from_rfm(customers, rfm_rows_from_orders(orders)).set_index("customer_id")
    assert (df.loc["c1", "total_spent"], df.loc["c1", "frequency"], df.loc["c1", "recency_days"]) == (40, 2, 10)
    assert df.loc["c1", "avg_order_value"] == 20
    assert df.loc["c3", "frequency"] == 0


def test_revenue_and_product_metrics_from_aggregates():
    from app.agents.growth_agent import get_product_metrics, get_revenue_metrics
    revenue = get_revenue_metrics({"total_revenue": 300.0, "total_orders": 3}, carts_started=6)
    assert revenue == {"total_revenue": 300.0, "total_orders": 3, "average_order_value": 100.0,
                       "conversion_rate": 50.0}
    products = [{"_id": "a", "name": "A"}, {"_id": "b", "name": "B"}]
    metrics = get_product_metrics(products, {"a": {"units_sold": 7, "revenue": 70.004}})
    assert metrics["top_products"][0]["_id"] == "a" and metrics["top_products"][0]["revenue"] == 70.0
    assert metrics["low_conversion_products"][0] == {"_id": "b", "name": "B", "units_sold": 0, "revenue": 0}
