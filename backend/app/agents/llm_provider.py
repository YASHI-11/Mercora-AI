"""Provider-independent LLM abstraction. If no API key is configured the
app falls back to a deterministic, rule-based implementation so the whole
product stays demoable without any external credentials."""
import json
import logging
import re
from abc import ABC, abstractmethod

import httpx

from app.config import get_settings

logger = logging.getLogger("shoppilot.llm")
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
    if settings.llm_provider.lower() == "anthropic" and settings.llm_api_key:
        _provider = AnthropicProvider(settings.llm_api_key)
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


def parse_shopping_intent(message: str) -> dict:
    """Deterministic fallback NLU: extract category / budget / keywords."""
    text = message.lower()
    price_match = PRICE_RE.search(text)
    budget = float(price_match.group(1).replace(",", "")) if price_match else None

    category = None
    for kw, cat in CATEGORY_KEYWORDS.items():
        if kw in text:
            category = cat
            break

    stopwords = {"i", "need", "want", "a", "for", "the", "under", "below", "with", "my",
                 "an", "to", "of", "in", "on", "less", "than", "rs", "inr", "please", "and"}
    keywords = [w.strip(".,!?") for w in text.split() if w.strip(".,!?") not in stopwords and len(w) > 2]

    return {"category": category, "budget": budget, "keywords": keywords}
