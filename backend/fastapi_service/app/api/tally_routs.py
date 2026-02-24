"""
Tally API Routes - Endpoints for Tally operations.

Routes:
    POST /api/tally/connect - Connect to Tally and fetch masters
    GET /api/tally/item/{item_name} - Get specific item details
    POST /api/tally/send-voucher - Send voucher XML to Tally
"""

from fastapi import APIRouter, HTTPException, Depends, Body
from sqlalchemy.orm import Session
from typing import Dict

from ..core.database import get_db
from ..services.tally_connector import TallyConnectorService, TallyConnectionError
from ..schemas.invoice_schemas import TallyMastersResponse

router = APIRouter(prefix="/api/tally", tags=["Tally"])


@router.post("/connect", response_model=Dict)
async def connect_to_tally(
    company_name: str = Body(...,embed=True),
    db: Session = Depends(get_db)
):
    """
    Connect to Tally and fetch all masters (Ledgers, Stock Items, Units).
    
    Body:
        {
            "company_name": "My Company Ltd"
        }
    
    Returns:
        {
            "company_name": "My Company Ltd",
            "ledgers": ["Ledger1", "Ledger2", ...],
            "stock_items": ["Item1", "Item2", ...],
            "units": ["Nos", "Kgs", ...]
        }
    """
    try:
        tally_service = TallyConnectorService()
        masters = tally_service.fetch_all_masters(company_name)
        
        # Store company connection in database
        # (Optional: Save to TallyCompany table for history)
        
        return {
            "company_name": company_name,
            "ledgers": masters["ledgers"],
            "stock_items": masters["stock_items"],
            "units": masters["units"],
            "message": f"Successfully connected to {company_name}"
        }
    
    except TallyConnectionError as e:
        raise HTTPException(status_code=503, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Unexpected error: {str(e)}")


@router.get("/item/{item_name}")
async def get_item_details(
    item_name: str,
    company_name: str
):
    """
    Get detailed information for a specific stock item.
    
    Query params:
        company_name: Tally company name
    
    Returns:
        {
            "name": "Product XYZ",
            "rate": "150.00",
            "unit": "Nos",
            "mrp": "200.00"
        }
    """
    try:
        tally_service = TallyConnectorService()
        details = tally_service.fetch_item_details(item_name, company_name)
        return details
    
    except TallyConnectionError as e:
        raise HTTPException(status_code=503, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/send-voucher")
async def send_voucher(
    xml_content: str
):
    """
    Send voucher XML to Tally for import.
    
    Body:
        {
            "xml_content": "<ENVELOPE>...</ENVELOPE>"
        }
    
    Returns:
        {
            "success": true,
            "message": "Voucher imported successfully"
        }
    """
    try:
        tally_service = TallyConnectorService()
        success = tally_service.send_voucher(xml_content)
        
        if success:
            return {
                "success": True,
                "message": "Voucher imported successfully to Tally"
            }
        else:
            raise HTTPException(
                status_code=400, 
                detail="Tally rejected the voucher. Check XML format."
            )
    
    except TallyConnectionError as e:
        raise HTTPException(status_code=503, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


# 🎓 MENTOR NOTE:
# - APIRouter groups related endpoints under /api/tally
# - Depends(get_db) automatically injects database session
# - HTTPException with status codes gives proper REST responses
# - try/except handles Tally-specific errors gracefully