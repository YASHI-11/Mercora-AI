from app.agents.llm_provider import parse_shopping_intent, get_llm_provider, FallbackProvider


def test_parse_intent_category_and_budget():
    intent = parse_shopping_intent("I need wireless headphones under 4000 for gaming")
    assert intent["category"] == "Audio"
    assert intent["budget"] == 4000


def test_parse_intent_no_budget():
    intent = parse_shopping_intent("Show me a good laptop for programming")
    assert intent["category"] == "Laptops"
    assert intent["budget"] is None


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
