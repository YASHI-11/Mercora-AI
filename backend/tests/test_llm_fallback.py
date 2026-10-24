from app.agents.llm_provider import parse_shopping_intent, get_llm_provider, FallbackProvider


def test_parse_intent_category_and_budget():
    intent = parse_shopping_intent("I need christmas decorations under 4000 for the tree")
    assert intent["category"] == "Party & Seasonal"
    assert intent["budget"] == 4000


def test_parse_intent_no_budget():
    intent = parse_shopping_intent("Show me a good mug for coffee")
    assert intent["category"] == "Kitchen & Dining"
    assert intent["budget"] is None


def test_category_keywords_match_on_word_boundary():
    # "chair" contains "hair" (Fashion & Jewellery) as a substring
    assert parse_shopping_intent("a wooden chair")["category"] is None
    assert parse_shopping_intent("hair clips")["category"] == "Fashion & Jewellery"
    assert parse_shopping_intent("lunch bags for school")["category"] == "Bags & Accessories"


def test_parse_intent_min_budget():
    intent = parse_shopping_intent("I want shoes above 4000")
    assert intent["min_budget"] == 4000
    assert intent["budget"] is None
    assert intent["is_shopping_query"] is True


def test_parse_intent_unrecognized_category_has_no_category():
    intent = parse_shopping_intent("give me a tshirt less than 5000")
    assert intent["category"] is None
    assert intent["budget"] == 5000
    assert "tshirt" in intent["keywords"]


def test_price_numbers_are_not_search_keywords():
    intent = parse_shopping_intent("give me tshirt above 4000")
    assert intent["min_budget"] == 4000
    assert intent["keywords"] == ["tshirt"]


def test_fallback_provider_used_without_key(monkeypatch):
    import app.agents.llm_provider as mod
    mod._provider = None
    # Provider must be patched too, not just the key -- Ollama needs no key by design,
    # so leaving llm_provider at whatever a real local .env has configured (e.g. "ollama")
    # would select a live provider here regardless of the cleared key.
    monkeypatch.setattr(mod.settings, "llm_provider", "none")
    monkeypatch.setattr(mod.settings, "llm_api_key", "")
    provider = get_llm_provider()
    assert isinstance(provider, FallbackProvider)
    assert provider.is_live is False
