import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from app.config import get_settings
from app.database.connection import check_connection, ensure_indexes
from app.api import (
    auth, products, search, recommendations, cart, orders, payments,
    shopping_agent, merchant, growth_agent, opportunities, audit,
)

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("mercora")
settings = get_settings()


@asynccontextmanager
async def lifespan(app: FastAPI):
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
    return {"status": "ok" if db_ok else "degraded", "database": "connected" if db_ok else "unreachable"}


for router in [
    auth.router, products.router, search.router, recommendations.router, cart.router,
    orders.router, payments.router, shopping_agent.router, merchant.router,
    growth_agent.router, opportunities.router, audit.router,
]:
    app.include_router(router)
