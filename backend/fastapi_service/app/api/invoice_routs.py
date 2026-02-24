"""
Invoice API Routes - Endpoints for JWT invoice processing.

Routes:
    POST /api/invoices/parse - Parse uploaded JWT JSON file
    GET /api/invoices/{invoice_id} - Get specific invoice details
    POST /api/excel/downlod - download all invoices in excel format
"""

from fastapi import APIRouter, HTTPException, UploadFile, File
from typing import List, Dict
import json
from ..services.invoice_processor import InvoiceProcessorService, JWTDecodeError

router = APIRouter(prefix="/api/invoices", tags=["Invoices"])


@router.post("/parse")
async def parse_invoice_file(file: UploadFile = File(...)):
    """
    Parse uploaded JWT JSON file containing e-invoices.
    
    Accepts: .json file with array of {"SignedInvoice": "..."} objects
    
    Returns:
        {
            "invoices": [
                {
                    "invoice_no": "INV001",
                    "invoice_date": "15-01-2024",
                    "supplier": {...},
                    "items": [...],
                    "total_amount": 10000.00,
                    ...
                }
            ],
            "total_count": 5
        }
    """
    try:
        # Read uploaded file
        contents = await file.read()
        json_data = json.loads(contents)
        
        # Validate structure
        if not isinstance(json_data, list):
            raise HTTPException(
                status_code=400, 
                detail="JSON must be an array of invoice objects"
            )
        
        # Process invoices
        processor = InvoiceProcessorService()
        structured_invoices = processor.process_and_structure(json_data)
        
        if not structured_invoices:
            raise HTTPException(
                status_code=400,
                detail="No valid invoices found in the file"
            )
        
        return {
            "invoices": structured_invoices,
            "total_count": len(structured_invoices),
            "message": f"Successfully parsed {len(structured_invoices)} invoice(s)"
        }
    
    except json.JSONDecodeError:
        raise HTTPException(status_code=400, detail="Invalid JSON file")
    except JWTDecodeError as e:
        raise HTTPException(status_code=400, detail=f"JWT decoding error: {str(e)}")
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Processing error: {str(e)}")


@router.post("/parse-text")
async def parse_invoice_text(json_data: List[Dict]):
    """
    Parse invoice data sent as JSON body (not file upload).
    
    Useful for testing or when frontend already has parsed JSON.
    
    Body:
        [
            {"SignedInvoice": "eyJ..."},
            {"SignedInvoice": "eyJ..."}
        ]
    """
    try:
        processor = InvoiceProcessorService()
        structured_invoices = processor.process_and_structure(json_data)
        
        return {
            "invoices": structured_invoices,
            "total_count": len(structured_invoices)
        }
    
    except JWTDecodeError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))




# 🎓 MENTOR NOTE:
# - UploadFile = File(...) handles multipart form uploads
# - We provide both file upload and JSON body endpoints
# - Frontend can choose which one fits their flow better
# - Error handling is consistent with other routes