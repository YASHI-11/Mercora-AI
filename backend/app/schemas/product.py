from pydantic import BaseModel
from typing import Optional

# Label for products mercora_ml_dataset.csv leaves without a category; kept
# out of the category choices offered to the shopping agent's NLU.
UNCATEGORIZED = "Uncategorized"


class ProductCreate(BaseModel):
    name: str
    category: str
    subcategory: str = UNCATEGORIZED
    description: str
    price: float
    discount: float = 0
    inventory: int = 100
    rating: float = 4.0
    features: list[str] = []
    tags: list[str] = []
    brand: str = "Generic"
    image: str = ""


class ProductUpdate(BaseModel):
    name: Optional[str] = None
    category: Optional[str] = None
    subcategory: Optional[str] = None
    description: Optional[str] = None
    price: Optional[float] = None
    discount: Optional[float] = None
    inventory: Optional[int] = None
    rating: Optional[float] = None
    features: Optional[list[str]] = None
    tags: Optional[list[str]] = None
    brand: Optional[str] = None
    image: Optional[str] = None
