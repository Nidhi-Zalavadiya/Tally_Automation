"""
Mapping API Routes - Endpoints for product mapping and suggestions.

Routes:
    POST /api/mappings/suggest - Get mapping suggestion for a product
    POST /api/mappings/save - Save a new mapping
    GET /api/mappings/company/{company_id} - Get all mappings for a company
    POST /api/mappings/bulk-suggest - Get suggestions for multiple products
"""

from fastapi import APIRouter, HTTPException, Depends
from sqlalchemy.orm import Session
from typing import List, Dict
from pydantic import BaseModel

from ..core.database import get_db
from ..services.mapping_service import MappingService

router = APIRouter(prefix="/api/mappings", tags=["Mappings"])


# Request/Response models
class SuggestMappingRequest(BaseModel):
    company_id: int
    json_description: str
    tally_items: List[str]  # All available Tally stock items


class SaveMappingRequest(BaseModel):
    company_id: int
    json_description: str
    tally_item_name: str
    last_sales_rate: float = None
    mrp: float = None


class BulkSuggestRequest(BaseModel):
    company_id: int
    descriptions: List[str]
    tally_items: List[str]


@router.post("/suggest")
async def suggest_mapping(
    request: SuggestMappingRequest,
    db: Session = Depends(get_db)
):
    """
    Get smart mapping suggestion for a product.
    
    Body:
        {
            "company_id": 1,
            "json_description": "Apple iPhone 15 Pro",
            "tally_items": ["iPhone 15", "iPhone 15 Pro", ...]
        }
    
    Returns:
        {
            "suggested_item": "iPhone 15 Pro",
            "confidence": 0.95,
            "source": "exact_match"
        }
    """
    try:
        mapping_service = MappingService(db)
        suggestion = mapping_service.suggest_mapping(
            company_id=request.company_id,
            json_description=request.json_description,
            tally_items=request.tally_items
        )
        return suggestion
    
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/save")
async def save_mapping(
    request: SaveMappingRequest,
    db: Session = Depends(get_db)
):
    """
    Save a new product mapping.
    
    Body:
        {
            "company_id": 1,
            "json_description": "Apple iPhone 15 Pro",
            "tally_item_name": "iPhone 15 Pro 256GB",
            "last_sales_rate": 129900.00,
            "mrp": 134900.00
        }
    
    Returns:
        {
            "id": 123,
            "company_id": 1,
            "json_description": "Apple iPhone 15 Pro",
            "tally_item_name": "iPhone 15 Pro 256GB",
            "message": "Mapping saved successfully"
        }
    """
    try:
        mapping_service = MappingService(db)
        result = mapping_service.save_mapping(
            company_id=request.company_id,
            json_description=request.json_description,
            tally_item_name=request.tally_item_name,
            last_sales_rate=request.last_sales_rate,
            mrp=request.mrp
        )
        
        return {
            **result,
            "message": "Mapping saved successfully"
        }
    
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/company/{company_id}")
async def get_company_mappings(
    company_id: int,
    db: Session = Depends(get_db)
):
    """
    Get all saved mappings for a company.
    
    Returns:
        {
            "mappings": [
                {
                    "id": 1,
                    "json_description": "Product A",
                    "tally_item_name": "Product A Master",
                    "last_sales_rate": 100.00,
                    "mrp": 150.00
                }
            ],
            "total_count": 25
        }
    """
    try:
        mapping_service = MappingService(db)
        mappings = mapping_service.get_all_mappings(company_id)
        
        return {
            "mappings": mappings,
            "total_count": len(mappings)
        }
    
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/bulk-suggest")
async def bulk_suggest_mappings(
    request: BulkSuggestRequest,
    db: Session = Depends(get_db)
):
    """
    Get suggestions for multiple products at once.
    
    Useful when processing invoices with 50+ items.
    
    Body:
        {
            "company_id": 1,
            "descriptions": ["Product A", "Product B", "Product C"],
            "tally_items": ["Item1", "Item2", ...]
        }
    
    Returns:
        {
            "suggestions": {
                "Product A": {"suggested_item": "Item1", "confidence": 0.9, ...},
                "Product B": {"suggested_item": None, "confidence": 0.0, ...}
            }
        }
    """
    try:
        mapping_service = MappingService(db)
        suggestions = mapping_service.bulk_suggest(
            company_id=request.company_id,
            descriptions=request.descriptions,
            tally_items=request.tally_items
        )
        
        return {"suggestions": suggestions}
    
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


# 🎓 MENTOR NOTE:
# - bulk_suggest is key for performance with multi-item invoices
# - Confidence scores help frontend decide whether to auto-apply or ask user
# - GET endpoint lets you pre-populate dropdown with existing mappings
# - All mappings are per-company (multi-tenant ready)