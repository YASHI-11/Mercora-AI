from pydantic import BaseModel, Field
from typing import Any
import uuid
from datetime import datetime, timezone


def new_id(prefix: str) -> str:
    return f"{prefix}_{uuid.uuid4().hex[:16]}"


def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


class ErrorResponse(BaseModel):
    error: str
    detail: str | None = None
