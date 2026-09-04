import logging
import os
from contextlib import asynccontextmanager

# scikit-learn's KMeans (customer segmentation) parallelizes via joblib's
# loky backend, which probes physical CPU core count by shelling out to
# `wmic` -- removed in recent Windows versions, producing a harmless but
# noisy UserWarning on every clustering call. Setting this env var (joblib's
# own documented fix) skips that probe.
os.environ.setdefault("LOKY_MAX_CPU_COUNT", str(os.cpu_count() or 4))

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from app.config import get_settings
from app.database.connection import check_connection, ensure_indexes
from app.api import (
    auth, products, search, recommendations, cart, orders, payments,
    shopping_agent, merchant, growth_agent, opportunities, audit, llm_usage,
)

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("mercora")
settings = get_settings()


@asynccontextmanager
async def lifespan(app: FastAPI):
    from app.agents.llm_provider import get_llm_provider
    provider = get_llm_provider()
    if provider.is_live:
        logger.info("LLM provider active: %s (a failed call falls back to the "
                    "deterministic keyword parser and is logged as an error).",
                    settings.llm_provider)
    else:
        logger.warning("No live LLM provider (LLM_PROVIDER=%s) -- the assistant will use the "
                        "deterministic keyword parser for every message.", settings.llm_provider)

    connected = await check_connection()
    if connected:
        await ensure_indexes()
        logger.info("MongoDB connected and indexes ensured.")
    else:
        logger.warning("MongoDB is NOT reachable at startup. API will return 503 for DB-dependent routes "
                        "until MongoDB is available. Run `docker run -p 27017:27017 mongo` or install MongoDB.")
    yield


app = FastAPI(title="Mercora AI", version="1.0.0", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[settings.frontend_url, "http://localhost:5173", "http://127.0.0.1:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.exception_handler(Exception)
async def unhandled_exception_handler(request: Request, exc: Exception):
    logger.exception("Unhandled error on %s %s", request.method, request.url)
    return JSONResponse(status_code=500, content={"error": "internal_error", "detail": str(exc)})


@app.get("/api/health")
async def health():
    db_ok = await check_connection()
    from app.agents.llm_provider import get_llm_provider
    provider = get_llm_provider()
    return {
        "status": "ok" if db_ok else "degraded",
        "database": "connected" if db_ok else "unreachable",
        "llm_provider": settings.llm_provider,
        "llm_live": provider.is_live,
    }


for router in [
    auth.router, products.router, search.router, recommendations.router, cart.router,
    orders.router, payments.router, shopping_agent.router, merchant.router,
    growth_agent.router, opportunities.router, audit.router, llm_usage.router,
]:
    app.include_router(router)
