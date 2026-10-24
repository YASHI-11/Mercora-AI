import csv
import importlib.util
import os

import pytest

_SCRIPTS = os.path.join(os.path.dirname(__file__), "..", "scripts")


def _load(name):
    spec = importlib.util.spec_from_file_location(name, os.path.join(_SCRIPTS, f"{name}.py"))
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


fix = _load("fix_dataset")
images = _load("fetch_product_images")


@pytest.mark.parametrize("name, expected", [
    ("WHITE HANGING HEART T-LIGHT HOLDER", ("Home Decor", "Lighting & Candles")),
    ("KNITTED UNION FLAG HOT WATER BOTTLE", ("Fashion & Jewellery", "Hot Water Bottles & Warmers")),
    ("CHICK GREY HOT WATER BOTTLE", ("Fashion & Jewellery", "Hot Water Bottles & Warmers")),
    ("DOORMAT UNION FLAG", ("Home Decor", "Doormats & Rugs")),
    ("BLUE DIAMANTE PEN IN GIFT BOX", ("Stationery & Gift Wrap", "Pens & Desk Accessories")),
    ("SET 10 CARDS CHRISTMAS ROBIN 17095", ("Stationery & Gift Wrap", "Cards")),
    ("ROLL WRAP VINTAGE CHRISTMAS", ("Stationery & Gift Wrap", "Gift Wrap & Bags")),
    ("CHRISTMAS GINGHAM STAR", ("Party & Seasonal", "Christmas")),
    ("HANGING CHICK YELLOW DECORATION", ("Party & Seasonal", "Easter")),
    ("MINI JIGSAW BUNNIES", ("Toys & Kids", "Toys & Games")),
    ("4 BLUE DINNER CANDLES SILVER FLOCK", ("Home Decor", "Lighting & Candles")),
    ("LETTER \"A\" BLING KEY RING", ("Fashion & Jewellery", "Keyrings & Charms")),
    ("PANTRY ROLLING PIN", ("Kitchen & Dining", "Baking")),
    ("CHILDREN'S SPACEBOY MUG", ("Toys & Kids", "Baby & Kids Dining")),
    ("BLUE PAINTED KASHMIRI CHAIR", ("Home Decor", "Furniture")),
    ("GLASS BEAD HOOP EARRINGS AMETHYST", ("Fashion & Jewellery", "Earrings")),
    ("SET/3 FLORAL GARDEN TOOLS IN BAG", ("Garden & Outdoor", "Planters & Garden Tools")),
    ("JUMBO BAG VINTAGE CHRISTMAS", ("Bags & Accessories", "Shopping & Tote Bags")),
])
def test_classify_uses_product_type(name, expected):
    assert fix.classify(name) == expected


def test_every_rule_targets_the_taxonomy():
    for _rx, cat, sub in fix.TAXONOMY_RULES:
        assert sub in fix.TAXONOMY[cat]


def test_clean_name_fixes_truncations_and_noise():
    assert fix.clean_name("*Boombox Ipod Classic") == "BOOMBOX IPOD CLASSIC"
    assert fix.clean_name("LUNCH BAG BLACK SKULL.") == "LUNCH BAG BLACK SKULL"
    assert fix.clean_name("RASPBERRY ANT COPPER FLOWER NECKLAC") == "RASPBERRY ANT COPPER FLOWER NECKLACE"
    assert fix.clean_name("PINK FOXGLOVE ARTIIFCIAL FLOWER") == "PINK FOXGLOVE ARTIFICIAL FLOWER"
    assert fix.clean_name("FLOWER GLASS GARLD NECKL36\"AMETHYST") == "FLOWER GLASS GARLAND NECKLACE 36\"AMETHYST"
    assert fix.clean_name(fix.clean_name("LARGE MINT DIAMANTE HAIRSLIDE")) == "LARGE MINT DIAMANTE HAIR SLIDE"


def test_non_merchandise_lines_are_recognised():
    for name in ("NEXT DAY CARRIAGE", "PACKING CHARGE", "HIGH RESOLUTION IMAGE", "DOTCOMGIFTSHOP GIFT VOUCHER £100.00"):
        assert fix.NON_MERCHANDISE.match(name)
    assert not fix.NON_MERCHANDISE.match("GIFT BAG BIRTHDAY")


def test_product_text_matches_file_format():
    # name, category, subcategory, then the first colour word in the name
    assert fix.product_text("WHITE HANGING HEART T-LIGHT HOLDER", "Home Decor", "Lighting & Candles") == \
        "white hanging heart t light holder home decor lighting candles white"
    assert fix.product_text("JAM MAKING SET PRINTED", "Kitchen & Dining", "Baking") == \
        "jam making set printed kitchen dining baking"


def test_fix_is_idempotent(tmp_path, monkeypatch):
    path = tmp_path / "data.csv"
    columns = ["order_id", "order_date", "customer_id", "country", "product_id", "product_name", "category",
               "subcategory", "product_text"]
    rows = [
        {"order_id": "1", "order_date": "2010-12-01T08:26:00", "customer_id": "1", "country": "EIRE",
         "product_id": "OR-1", "product_name": "WHITE METAL LANTERN", "category": "", "subcategory": "",
         "product_text": ""},
        {"order_id": "1", "order_date": "2010-12-01T08:27:00", "customer_id": "1", "country": "EIRE",
         "product_id": "OR-POST", "product_name": "Next Day Carriage", "category": "", "subcategory": "",
         "product_text": ""},
    ]
    with open(path, "w", encoding="utf-8", newline="") as f:
        writer = csv.DictWriter(f, fieldnames=columns, lineterminator="\n")
        writer.writeheader()
        writer.writerows(rows)

    monkeypatch.setattr("sys.argv", ["fix_dataset.py", str(path)])
    fix.main()
    first = path.read_text(encoding="utf-8")
    fix.main()
    assert path.read_text(encoding="utf-8") == first

    with open(path, encoding="utf-8") as f:
        out = list(csv.DictReader(f))
    assert len(out) == 1  # carriage line dropped
    assert (out[0]["category"], out[0]["subcategory"], out[0]["country"]) == ("Home Decor", "Lighting & Candles",
                                                                              "Ireland")


@pytest.mark.parametrize("name, subcategory, query", [
    ("WHITE HANGING HEART T-LIGHT HOLDER", "Lighting & Candles", "tealight holder"),
    ("RED RETROSPOT TRADITIONAL TEAPOT", "Mugs & Teaware", "teapot"),
    ("DOORMAT UNION FLAG", "Doormats & Rugs", "doormat"),
    ("POPPY'S PLAYHOUSE BEDROOM", "Toys & Games", "wooden toy"),  # no type rule -> subcategory fallback
])
def test_image_type_query(name, subcategory, query):
    assert images.type_query(name, subcategory) == query


def test_image_pick_is_stable_and_in_range():
    assert images.pick("85123A", 7) == images.pick("85123A", 7)
    assert all(0 <= images.pick(code, 5) < 5 for code in ("1", "22", "85123A", "DCGSSBOY"))
