"""
Voucher API Routes - Endpoints for generating Tally XML vouchers.

Routes:
    POST /api/vouchers/generate - Generate purchase voucher XML
    POST /api/vouchers/generate-and-send - Generate XML and send to Tally
"""

from fastapi import APIRouter, HTTPException, Response
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from typing import List, Dict
from decimal import Decimal
from io import BytesIO

from ..services.tally_encoder import VoucherBuilderService
from ..services.tally_connector import TallyConnectorService, TallyConnectionError
from ..services.excel_download_service import ExcelService

router = APIRouter(prefix="/api/vouchers", tags=["Vouchers"])


# Request models
class VoucherItem(BaseModel):
    stock_item: str
    quantity: float
    unit: str
    rate: float
    amount: float


class GenerateVoucherRequest(BaseModel):
    company_name: str
    invoice_no: str
    invoice_date: str
    supplier_ledger: str
    items: List[VoucherItem]
    is_interstate: bool
    cgst_total: float = 0.0
    sgst_total: float = 0.0
    igst_total: float = 0.0
    cgst_ledger: str = "Input CGST"
    sgst_ledger: str = "Input SGST"
    igst_ledger: str = "Input IGST"
    purchase_ledger: str = "Purchase"
    other_charges: float = 0.0
    round_off: float = 0.0


@router.post("/generate")
async def generate_voucher(request: GenerateVoucherRequest):
    """
    Generate Tally Purchase voucher XML (returns XML content).
    
    Body:
        {
            "company_name": "My Company Ltd",
            "invoice_no": "PINV001",
            "invoice_date": "15-01-2024",
            "supplier_ledger": "ABC Suppliers",
            "items": [
                {
                    "stock_item": "Product A",
                    "quantity": 10,
                    "unit": "Nos",
                    "rate": 100.00,
                    "amount": 1000.00
                }
            ],
            "is_interstate": false,
            "cgst_total": 90.00,
            "sgst_total": 90.00,
            ...
        }
    
    Returns:
        {
            "xml_content": "<ENVELOPE>...</ENVELOPE>",
            "invoice_no": "PINV001",
            "total_amount": 1180.00
        }
    """
    try:
        builder = VoucherBuilderService()
        
        # Convert items to dict format
        items_dict = [item.dict() for item in request.items]
        
        # Generate XML
        xml_content = builder.build_purchase_voucher(
            company_name=request.company_name,
            invoice_no=request.invoice_no,
            invoice_date=request.invoice_date,
            supplier_ledger=request.supplier_ledger,
            items=items_dict,
            is_interstate=request.is_interstate,
            cgst_total=Decimal(str(request.cgst_total)),
            sgst_total=Decimal(str(request.sgst_total)),
            igst_total=Decimal(str(request.igst_total)),
            cgst_ledger=request.cgst_ledger,
            sgst_ledger=request.sgst_ledger,
            igst_ledger=request.igst_ledger,
            purchase_ledger=request.purchase_ledger,
            other_charges=Decimal(str(request.other_charges)),
            round_off=Decimal(str(request.round_off))
        )
        
        # Calculate total
        items_total = sum(item.amount for item in request.items)
        tax_total = request.cgst_total + request.sgst_total + request.igst_total
        total_amount = items_total + tax_total + request.other_charges + request.round_off
        
        return {
            "xml_content": xml_content,
            "invoice_no": request.invoice_no,
            "total_amount": total_amount
        }
    
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"XML generation error: {str(e)}")


@router.post("/generate-and-send")
async def generate_and_send_voucher(request: GenerateVoucherRequest):
    """
    Generate voucher XML and immediately send to Tally.
    
    Same request body as /generate endpoint.
    
    Returns:
        {
            "success": true,
            "message": "Voucher imported to Tally successfully",
            "invoice_no": "PINV001"
        }
    """
    try:
        # Generate XML
        builder = VoucherBuilderService()
        items_dict = [item.dict() for item in request.items]
        
        xml_content = builder.build_purchase_voucher(
            company_name=request.company_name,
            invoice_no=request.invoice_no,
            invoice_date=request.invoice_date,
            supplier_ledger=request.supplier_ledger,
            items=items_dict,
            is_interstate=request.is_interstate,
            cgst_total=Decimal(str(request.cgst_total)),
            sgst_total=Decimal(str(request.sgst_total)),
            igst_total=Decimal(str(request.igst_total)),
            cgst_ledger=request.cgst_ledger,
            sgst_ledger=request.sgst_ledger,
            igst_ledger=request.igst_ledger,
            purchase_ledger=request.purchase_ledger,
            other_charges=Decimal(str(request.other_charges)),
            round_off=Decimal(str(request.round_off))
        )
        
        # Send to Tally
        tally_service = TallyConnectorService()
        success = tally_service.send_voucher(xml_content)
        
        if success:
            return {
                "success": True,
                "message": f"Voucher {request.invoice_no} imported to Tally successfully",
                "invoice_no": request.invoice_no
            }
        else:
            raise HTTPException(
                status_code=400,
                detail="Tally rejected the voucher"
            )
    
    except TallyConnectionError as e:
        raise HTTPException(status_code=503, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/download")
async def download_voucher_xml(request: GenerateVoucherRequest):
    """
    Generate voucher XML and return as downloadable file.
    
    Returns: XML file with proper headers for browser download.
    """
    try:
        # Generate XML
        builder = VoucherBuilderService()
        items_dict = [item.dict() for item in request.items]
        
        xml_content = builder.build_purchase_voucher(
            company_name=request.company_name,
            invoice_no=request.invoice_no,
            invoice_date=request.invoice_date,
            supplier_ledger=request.supplier_ledger,
            items=items_dict,
            is_interstate=request.is_interstate,
            cgst_total=Decimal(str(request.cgst_total)),
            sgst_total=Decimal(str(request.sgst_total)),
            igst_total=Decimal(str(request.igst_total)),
            cgst_ledger=request.cgst_ledger,
            sgst_ledger=request.sgst_ledger,
            igst_ledger=request.igst_ledger,
            purchase_ledger=request.purchase_ledger,
            other_charges=Decimal(str(request.other_charges)),
            round_off=Decimal(str(request.round_off))
        )
        
        # Create file stream
        xml_bytes = xml_content.encode("utf-8")
        file_stream = BytesIO(xml_bytes)
        
        # Return as downloadable file
        filename = f"purchase_voucher_{request.invoice_no}.xml"
        
        return StreamingResponse(
            file_stream,
            media_type="application/xml",
            headers={
                "Content-Disposition": f"attachment; filename={filename}"
            }
        )
    
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))



@router.post("/download_excel")
async def download_invoices_exce(invoice_data : dict):
    """
    Generate and download an Excel file from the structured invoice JSON.
    
    Body:
        { "invoices": [ ... ] }
    """
    try:
        invoices = invoice_data.get("invoices", [])
        if not invoices:
            raise HTTPException(status_code=400, detail="No invoice data provided")

        excel_service = ExcelService()
        excel_file = excel_service.generate_invoice_excel(invoices)

        headers = {
            'Content-Disposition': 'attachment; filename="invoices_report.xlsx"'
        }
        
        return Response(
            content=excel_file.getvalue(),
            headers=headers,
            media_type='application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
        )

    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Excel generation error: {str(e)}")

# 🎓 MENTOR NOTE:
# - /generate returns XML as JSON (frontend can display/edit)
# - /generate-and-send pushes to Tally immediately
# - /download returns XML as file (user can save and import manually)
# - Choose endpoint based on your workflow preference