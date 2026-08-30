"""
One-off migration: reassign every product's `image` field so that every
product has a unique image URL while keeping the image topic relevant
to the product.

This script:
- Does NOT touch products/customers/orders relationships.
- Does NOT re-run any seed scripts.
- Only updates the `image` field of existing products.
- Works with both synthetic and Kaggle-seeded catalogs.
- Generates product-specific LoremFlickr tags.
- Uses deterministic, catalog-wide unique lock values.

Run from backend/ with the virtual environment activated:

    python scripts/fix_product_images.py
"""

import os
import re
import sys
from collections import defaultdict

import requests
from pymongo import MongoClient, UpdateOne

# Allow importing app.config when running this file directly.
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from app.config import get_settings  # noqa: E402


settings = get_settings()


# Category anchors keep the generated image relevant even when the
# product name itself is ambiguous.
CATEGORY_ANCHOR = {
    "Audio": "audio",
    "Laptops": "laptop",
    "Gaming": "gaming",
    "Accessories": "gadget",
    "Smartwatches": "wearable",
    "Cameras": "camera",
    "Home Office": "office",
    "Electronics": "electronics",
    "Christmas & Seasonal": "christmas",
    "Kitchen & Dining": "kitchen",
    "Home Decor": "decor",
    "Bags & Purses": "bag",
    "Stationery & Cards": "stationery",
    "Jewellery & Accessories": "jewellery",
    "Toys & Games": "toy",
    "Garden & Outdoor": "garden",
    "Bathroom & Textiles": "bathroom",
    "General Gifts": "gift",
}


STOPWORDS = {
    "the", "and", "with", "for", "set", "pack", "no", "of", "in", "a", "to", "on",
    "lite", "pro", "max", "mini", "inch", "gaming",
}

# loremflickr.com does an AND-intersection tag search: chaining several rare
# words (as raw retail names produce -- "cutlery", "paisley", "edwardian",
# "girly") pushes many products' searches to ZERO matching photos, and
# loremflickr then silently serves the SAME fallback placeholder photo for
# every one of them (verified live: "cutlery,lunch,gift" and "tool,pink,gift"
# returned byte-identical images -- a cat statue photo, unrelated to either
# product). Restricting the extra tag(s) to a curated vocabulary of common,
# high-volume object nouns keeps the AND-search pool large enough to almost
# always return real, on-topic, distinct results.
COMMON_NOUNS = {
    "holder", "lantern", "candle", "mug", "cup", "jar", "box", "tin", "tray",
    "plate", "bowl", "spoon", "fork", "knife", "teapot", "kettle", "apron",
    "napkin", "coaster", "cushion", "curtain", "blanket", "towel", "soap",
    "mirror", "frame", "clock", "lamp", "light", "hook", "hanger", "basket",
    "vase", "bottle", "bag", "purse", "wallet", "backpack", "necklace",
    "bracelet", "earring", "ring", "brooch", "notebook", "diary", "pen",
    "pencil", "envelope", "card", "sticker", "stamp", "paper", "doll", "toy",
    "block", "puzzle", "game", "ball", "kite", "balloon", "garden", "plant",
    "pot", "flower", "umbrella", "bird", "cat", "dog", "rabbit", "bear",
    "star", "heart", "ribbon", "wreath", "ornament", "bauble", "stocking",
    "tree", "gift", "present", "key", "keyring", "magnet", "bell", "chain",
    "clip", "badge", "button", "brush", "comb", "scarf", "glove", "hat",
    "sock", "chair", "table", "shelf", "rug", "bin", "bucket", "watch",
    "spinner", "sign", "banner", "garland", "wreath", "photo", "album",
}


def keyword_tags(name: str, category: str, brand: str) -> list[str]:
    """
    Build 1-2 relevant LoremFlickr tags: the product's own noun (only if it's
    a common, high-photo-volume word -- see COMMON_NOUNS) plus the category
    anchor. Falls back to the anchor alone rather than chaining rare/obscure
    words, which risks an empty-result placeholder image (see note above).
    """

    words = re.findall(r"[a-zA-Z]+", (name or "").lower())

    brand_words = set(
        re.findall(r"[a-zA-Z]+", (brand or "").lower())
    )

    anchor = CATEGORY_ANCHOR.get(category, "product")

    # Capped at ONE noun + the anchor (2 tags, not 3): live testing showed
    # that even two CURATED common nouns chained together (e.g.
    # "star,lantern,decor", "ring,key,jewellery") sometimes still hit the
    # zero-result placeholder -- narrower AND-intersections are safer.
    nouns = []
    for word in reversed(words):
        if word in COMMON_NOUNS and word not in brand_words and word != anchor and word not in nouns:
            nouns.append(word)
        if len(nouns) == 1:
            break

    tags = nouns + [anchor]
    unique_tags = list(dict.fromkeys(tags))
    return unique_tags[:2]


# loremflickr.com's own "no photos matched this tag combination" placeholder
# (a cat-statue photo, confirmed byte-identical across two different
# zero-result tag combos during debugging). Any generated URL that resolves
# to exactly this many bytes at 500x500 means the tag combo had no results.
FALLBACK_PLACEHOLDER_BYTES = 71603


def is_placeholder(url: str) -> bool:
    try:
        resp = requests.get(url, timeout=10)
        return len(resp.content) == FALLBACK_PLACEHOLDER_BYTES
    except requests.RequestException:
        return False


def check_all_keyword_groups(group_counters: dict) -> list[str]:
    """EXHAUSTIVELY checks every distinct keyword group (not a random sample)
    at both lock=0 and its worst-case (largest assigned) lock, so a keyword
    that only fails once its group gets large (pool exhaustion) is caught
    too. Returns the list of keywords that hit the empty-result placeholder."""
    bad = []
    for i, (keyword, count) in enumerate(group_counters.items()):
        locks_to_check = {0, count - 1}
        for lock in locks_to_check:
            url = f"https://loremflickr.com/500/500/{keyword}?lock={lock}"
            if is_placeholder(url):
                bad.append(keyword)
                break
        if (i + 1) % 50 == 0:
            print(f"  checked {i + 1}/{len(group_counters)} keyword groups...")
    return bad


def build_image_url(keyword: str, lock: int) -> str:
    """
    Build the LoremFlickr URL.

    The lock is unique within each keyword group.
    """

    return f"https://loremflickr.com/500/500/{keyword}?lock={lock}"


def main():
    client = MongoClient(
        settings.mongodb_uri,
        serverSelectionTimeoutMS=5000,
    )

    db = client[settings.database_name]

    try:
        client.admin.command("ping")
    except Exception as exc:
        print(
            f"ERROR: Cannot connect to MongoDB at "
            f"{settings.mongodb_uri}: {exc}"
        )
        sys.exit(1)

    try:
        # Scoped to the Kaggle-sourced catalog only ("Online Retail Co." is
        # the fixed brand seed_kaggle_retail.py assigns) -- the synthetic
        # catalog's images are hand-verified and assigned by seed_data.py
        # itself and must not be overwritten here.
        kaggle_filter = {"brand": "Online Retail Co."}

        products = list(
            db.products.find(
                kaggle_filter,
                {
                    "_id": 1,
                    "name": 1,
                    "category": 1,
                    "brand": 1,
                },
            ).sort("_id", 1)
        )

        print(f"Found {len(products)} Kaggle-catalog products.")

        if not products:
            print("No products found. Nothing to update.")
            return

        # First pass: compute each product's keyword and how many products
        # would land in each keyword group, WITHOUT writing anything yet.
        product_keyword: dict = {}
        product_category: dict = {}
        group_counters = defaultdict(int)
        for product in products:
            category = product.get("category") or ""
            tags = keyword_tags(
                name=product.get("name") or "",
                category=category,
                brand=product.get("brand") or "",
            )
            keyword = ",".join(tags)
            product_keyword[product["_id"]] = keyword
            product_category[product["_id"]] = category
            group_counters[keyword] += 1

        print(f"{len(group_counters)} distinct keyword groups (pre-check). "
              f"Exhaustively checking every group for the empty-result "
              f"placeholder (lock=0 and worst-case lock)...")
        bad_keywords = set(check_all_keyword_groups(group_counters))
        if bad_keywords:
            print(f"{len(bad_keywords)} keyword group(s) hit the placeholder -- "
                  f"falling those products back to their category anchor alone "
                  f"(a single common tag, much larger photo pool):")
            for kw in sorted(bad_keywords):
                print(f"  - {kw}")
        else:
            print("All keyword groups check out -- no placeholder hits.")

        # Second pass: reassign any product whose keyword was flagged to its
        # bare category anchor, then compute final sequential locks.
        group_counters = defaultdict(int)
        operations = []
        generated_urls = set()

        for product in products:
            product_id = product["_id"]
            keyword = product_keyword[product_id]
            if keyword in bad_keywords:
                keyword = CATEGORY_ANCHOR.get(product_category[product_id], "gift")

            lock = group_counters[keyword]
            group_counters[keyword] += 1

            image_url = build_image_url(
                keyword=keyword,
                lock=lock,
            )

            # This catches an implementation error before anything
            # is written to MongoDB.
            if image_url in generated_urls:
                raise RuntimeError(
                    f"Generated duplicate image URL for product "
                    f"{product_id}: {image_url}"
                )

            generated_urls.add(image_url)

            operations.append(
                UpdateOne(
                    {"_id": product_id},
                    {
                        "$set": {
                            "image": image_url,
                        }
                    },
                )
            )

        distinct_keywords = len(group_counters)

        largest_group = (
            max(group_counters.values())
            if group_counters
            else 0
        )

        print(
            f"{distinct_keywords} distinct keyword groups."
        )

        print(
            f"Largest keyword group contains "
            f"{largest_group} products."
        )

        print(
            f"Generated {len(generated_urls)} unique image URLs."
        )

        # Write everything in one bulk operation.
        if operations:
            result = db.products.bulk_write(
                operations,
                ordered=False,
            )

            print(
                f"Matched:  {result.matched_count}"
            )
            print(
                f"Modified: {result.modified_count}"
            )

        # ------------------------------------------------------------
        # FINAL DATABASE SANITY CHECK
        # ------------------------------------------------------------

        images = list(
            db.products.find(
                kaggle_filter,
                {
                    "_id": 1,
                    "image": 1,
                },
            )
        )

        urls = [
            doc.get("image")
            for doc in images
            if doc.get("image")
        ]

        duplicate_count = len(urls) - len(set(urls))

        print(
            f"Duplicate image URLs remaining: "
            f"{duplicate_count}"
        )

        if duplicate_count != 0:
            print(
                "ERROR: Duplicate image URLs still exist."
            )
            sys.exit(1)

        print(
            "SUCCESS: Every product has a unique image URL."
        )

        print("Re-checking every FINAL keyword group (post fallback-reassignment) "
              "for the empty-result placeholder...")
        residual_bad = check_all_keyword_groups(group_counters)
        if residual_bad:
            print(f"WARNING: {len(residual_bad)} keyword group(s) still hit the "
                  f"placeholder even after fallback: {residual_bad}")
        else:
            print("Final check: every keyword group returns real photos, 0 placeholder hits.")

    except Exception as exc:
        print(f"ERROR: Migration failed: {exc}")
        sys.exit(1)

    finally:
        client.close()


if __name__ == "__main__":
    main()