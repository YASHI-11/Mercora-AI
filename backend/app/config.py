import os
from functools import lru_cache
from dotenv import load_dotenv

load_dotenv(os.path.join(os.path.dirname(__file__), "..", "..", ".env"))
load_dotenv(os.path.join(os.path.dirname(__file__), "..", ".env"))


class Settings:
    mongodb_uri: str = os.getenv("MONGODB_URI", "mongodb://localhost:27017")
    database_name: str = os.getenv("DATABASE_NAME", "mercora")

    razorpay_key_id: str = os.getenv("RAZORPAY_KEY_ID", "")
    razorpay_key_secret: str = os.getenv("RAZORPAY_KEY_SECRET", "")

    llm_api_key: str = os.getenv("LLM_API_KEY", "")
    llm_provider: str = os.getenv("LLM_PROVIDER", "none")
    ollama_base_url: str = os.getenv("OLLAMA_BASE_URL", "http://localhost:11434")
    ollama_model: str = os.getenv("OLLAMA_MODEL", "llama3.2")
    gemini_model: str = os.getenv("GEMINI_MODEL", "gemini-2.5-flash")
    openai_model: str = os.getenv("OPENAI_MODEL", "gpt-4o-mini")

    jwt_secret: str = os.getenv("JWT_SECRET", "dev-secret-change-me")
    jwt_algorithm: str = os.getenv("JWT_ALGORITHM", "HS256")

    frontend_url: str = os.getenv("FRONTEND_URL", "http://localhost:5173")
    backend_url: str = os.getenv("BACKEND_URL", "http://localhost:8000")

    default_merchant_id: str = "merchant_demo_001"


@lru_cache
def get_settings() -> Settings:
    return Settings()
