"""Provider-independent LLM abstraction. If no API key is configured the
app falls back to a deterministic, rule-based implementation so the whole
product stays demoable without any external credentials."""
import json
import logging
import re
from abc import ABC, abstractmethod

import httpx

from app.config import get_settings

logger = logging.getLogger("mercora.llm")
settings = get_settings()


class LLMProvider(ABC):
    @abstractmethod
    async def complete(self, system_prompt: str, user_prompt: str) -> str:
        ...

    @property
    @abstractmethod
    def is_live(self) -> bool:
        ...


class AnthropicProvider(LLMProvider):
    def __init__(self, api_key: str):
        self.api_key = api_key

    @property
    def is_live(self) -> bool:
        return True

    async def complete(self, system_prompt: str, user_prompt: str) -> str:
        async with httpx.AsyncClient(timeout=30) as client:
            resp = await client.post(
                "https://api.anthropic.com/v1/messages",
                headers={
                    "x-api-key": self.api_key,
                    "anthropic-version": "2023-06-01",
                    "content-type": "application/json",
                },
                json={
                    "model": "claude-sonnet-5",
                    "max_tokens": 1024,
                    "system": system_prompt,
                    "messages": [{"role": "user", "content": user_prompt}],
                },
            )
            resp.raise_for_status()
            data = resp.json()
            return "".join(block.get("text", "") for block in data.get("content", []))


class GeminiProvider(LLMProvider):
    def __init__(self, api_key: str, model: str):
        self.api_key = api_key
        self.model = model

    @property
    def is_live(self) -> bool:
        return True

    async def complete(self, system_prompt: str, user_prompt: str) -> str:
        async with httpx.AsyncClient(timeout=30) as client:
            resp = await client.post(
                f"https://generativelanguage.googleapis.com/v1beta/models/{self.model}:generateContent",
                params={"key": self.api_key},
                json={
                    "system_instruction": {"parts": [{"text": system_prompt}]},
                    "contents": [{"role": "user", "parts": [{"text": user_prompt}]}],
                },
            )
            resp.raise_for_status()
            data = resp.json()
            candidates = data.get("candidates") or []
            if not candidates:
                return ""
            parts = candidates[0].get("content", {}).get("parts", [])
            return "".join(part.get("text", "") for part in parts)


class OllamaProvider(LLMProvider):
    """Local LLM via Ollama (https://ollama.com) -- no API key needed, no
    external network calls. Requires `ollama serve` running locally with
    the configured model pulled (e.g. `ollama pull llama3.2`)."""

    def __init__(self, base_url: str, model: str):
        self.base_url = base_url.rstrip("/")
        self.model = model

    @property
    def is_live(self) -> bool:
        return True

    async def complete(self, system_prompt: str, user_prompt: str) -> str:
        async with httpx.AsyncClient(timeout=30) as client:
            resp = await client.post(
                f"{self.base_url}/api/chat",
                json={
                    "model": self.model,
                    "stream": False,
                    "messages": [
                        {"role": "system", "content": system_prompt},
                        {"role": "user", "content": user_prompt},
                    ],
                },
            )
            resp.raise_for_status()
            data = resp.json()
            return data.get("message", {}).get("content", "")


class FallbackProvider(LLMProvider):
    """Deterministic keyword/regex based understanding -- no external calls."""

    @property
    def is_live(self) -> bool:
        return False

    async def complete(self, system_prompt: str, user_prompt: str) -> str:
        return ""


_provider: LLMProvider | None = None


def get_llm_provider() -> LLMProvider:
    global _provider
    if _provider is not None:
        return _provider
    provider_name = settings.llm_provider.lower()
    if provider_name == "anthropic" and settings.llm_api_key:
        _provider = AnthropicProvider(settings.llm_api_key)
    elif provider_name == "gemini" and settings.llm_api_key:
        _provider = GeminiProvider(settings.llm_api_key, settings.gemini_model)
    elif provider_name == "ollama":
        _provider = OllamaProvider(settings.ollama_base_url, settings.ollama_model)
    else:
        _provider = FallbackProvider()
    return _provider


PRICE_RE = re.compile(r"(?:under|below|less than|<=?|within)\s*(?:rs\.?|inr|₹)?\s*([\d,]+)", re.I)
CATEGORY_KEYWORDS = {
    "headphone": "Audio", "earphone": "Audio", "earbud": "Audio", "speaker": "Audio",
    "laptop": "Laptops", "notebook": "Laptops",
    "smartwatch": "Smartwatches", "watch": "Smartwatches",
    "camera": "Cameras", "dslr": "Cameras",
    "keyboard": "Accessories", "mouse": "Accessories", "charger": "Accessories", "cable": "Accessories",
    "phone": "Electronics", "smartphone": "Electronics", "tablet": "Electronics",
    "monitor": "Home Office", "desk": "Home Office", "chair": "Home Office",
    "controller": "Gaming", "console": "Gaming", "gaming": "Gaming",
}


STOPWORDS = {"i", "need", "want", "a", "for", "the", "under", "below", "with", "my",
             "an", "to", "of", "in", "on", "less", "than", "rs", "inr", "please", "and",
             "show", "me", "give", "looking", "some", "any", "good", "best"}
GREETING_WORDS = {"hi", "hii", "hiii", "hello", "hey", "heyy", "yo", "sup", "hola", "there",
                   "thanks", "thank", "thankyou", "bye", "goodbye", "ok", "okay", "sure",
                   "cool", "nice", "great", "good", "morning", "evening", "afternoon",
                   "how", "are", "you", "whats", "what's", "up", "today", "please", "help"}


def parse_shopping_intent(message: str) -> dict:
    """Deterministic fallback NLU: extract category / budget / keywords, and
    whether the message reads like a product search at all (vs. small talk
    like "hi" or "thanks", which should get a conversational reply instead
    of a dump of unrelated products)."""
    text = message.lower()
    price_match = PRICE_RE.search(text)
    budget = float(price_match.group(1).replace(",", "")) if price_match else None

    category = None
    for kw, cat in CATEGORY_KEYWORDS.items():
        if kw in text:
            category = cat
            break

    keywords = [
        w.strip(".,!?") for w in text.split()
        if w.strip(".,!?") not in STOPWORDS and w.strip(".,!?") not in GREETING_WORDS
        and len(w.strip(".,!?")) > 2
    ]

    is_shopping_query = bool(category or budget or keywords)

    return {"category": category, "budget": budget, "keywords": keywords, "is_shopping_query": is_shopping_query}


async def parse_shopping_intent_llm(message: str, categories: list[str]) -> dict:
    """Uses the configured LLM provider (Anthropic or local Ollama) to parse
    shopping intent when one is configured and live; otherwise -- or if the
    LLM call fails or returns something unparseable -- falls back to the
    deterministic keyword/regex parser so the assistant never breaks."""
    provider = get_llm_provider()
    if not provider.is_live:
        return parse_shopping_intent(message)

    system_prompt = (
        "You are the intent parser for an e-commerce shopping assistant. "
        "Given a customer's message, extract shopping intent as strict JSON only, "
        "no markdown, no commentary, matching exactly this shape: "
        '{"is_shopping_query": boolean, "category": string|null, "budget": number|null, '
        '"keywords": string[]}. '
        "is_shopping_query is true only if the customer is actually asking to find, browse, "
        "compare, or buy a product -- false for greetings, thanks, small talk, or anything "
        "that isn't a product request (e.g. \"hi\", \"thanks\", \"how are you\"). "
        f"category must be one of {categories} or null if unclear or general. "
        "budget is the maximum price in rupees the customer mentioned, or null. "
        "keywords are the important product-search terms from the message (product type, "
        "brand, use-case), lowercase, excluding filler words. keywords must be [] when "
        "is_shopping_query is false."
    )
    try:
        raw = await provider.complete(system_prompt, message)
        cleaned = raw.strip()
        if cleaned.startswith("```"):
            cleaned = cleaned.strip("`")
            if cleaned.lower().startswith("json"):
                cleaned = cleaned[4:]
        parsed = json.loads(cleaned)
        category = parsed.get("category")
        if category not in categories:
            category = None
        budget = parsed.get("budget")
        budget = float(budget) if isinstance(budget, (int, float)) else None
        keywords = parsed.get("keywords") or []
        keywords = [str(k).lower() for k in keywords if isinstance(k, (str, int, float))]
        is_shopping_query = bool(parsed.get("is_shopping_query"))
        return {"category": category, "budget": budget, "keywords": keywords,
                "is_shopping_query": is_shopping_query}
    except Exception:
        logger.warning("LLM intent parsing failed, falling back to deterministic parser", exc_info=True)
        return parse_shopping_intent(message)


async def generate_conversational_reply(message: str) -> str:
    """Used when the customer's message isn't a product search (greeting,
    thanks, small talk, etc.) -- responds naturally instead of dumping
    unrelated products. Uses the live LLM provider when configured, falling
    back to a friendly canned reply otherwise or if the call fails."""
    fallback_reply = (
        "Hi! I'm Mercora, your shopping assistant. Tell me what you're looking for -- "
        "e.g. \"wireless headphones under ₹4000 for gaming\" -- and I'll find the best matches "
        "and explain why."
    )
    provider = get_llm_provider()
    if not provider.is_live:
        return fallback_reply

    system_prompt = (
        "You are Mercora, a friendly, concise AI shopping assistant for an online store "
        "selling audio, laptops, smartwatches, cameras, accessories, electronics, home office "
        "and gaming products. The customer's message is small talk, not a product search. "
        "Reply warmly in 1-2 short sentences and invite them to describe what they're shopping "
        "for (category, budget, or use case). Do not list or mention specific products."
    )
    try:
        reply = await provider.complete(system_prompt, message)
        reply = reply.strip()
        return reply if reply else fallback_reply
    except Exception:
        logger.warning("LLM conversational reply failed, using fallback", exc_info=True)
        return fallback_reply
