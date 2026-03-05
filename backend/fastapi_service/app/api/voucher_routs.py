"""
Voucher API Routes — all new fields included.
"""

from fastapi import APIRouter, HTTPException, Response
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from typing import List, Optional
from decimal import Decimal
from io import BytesIO

from ..services.tally_encoder import VoucherBuilderService
from ..services.tally_connector import TallyConnectorService, TallyConnectionError
from ..services.excel_download_service import ExcelService

router = APIRouter(prefix="/api/vouchers", tags=["Vouchers"])


class VoucherItem(BaseModel):
    stock_item: str
    quantity:   float
    unit:       str
    rate:       float
    amount:     float
    gst_rate:   float = 0.0


class GstLedgerEntry(BaseModel):
    gst_rate:     float
    cgst_ledger:  str   = "Input CGST"
    sgst_ledger:  str   = "Input SGST"
    igst_ledger:  str   = "Input IGST"
    cgst_amount:  float = 0.0
    sgst_amount:  float = 0.0
    igst_amount:  float = 0.0


class GenerateVoucherRequest(BaseModel):
    company_name:          str
    invoice_no:            str
    invoice_date:          str
    supplier_ledger:       str
    items:                 List[VoucherItem]
    is_interstate:         bool
    cgst_total:            float = 0.0
    sgst_total:            float = 0.0
    igst_total:            float = 0.0
    cgst_ledger:           str   = "Input CGST"
    sgst_ledger:           str   = "Input SGST"
    igst_ledger:           str   = "Input IGST"
    purchase_ledger:       str   = "Purchase"
    other_charges:         float = 0.0
    round_off:             float = 0.0
    voucher_type:          Optional[str] = None
    # Party/GST metadata
    supplier_gstin:        str   = ""
    buyer_gstin:           str   = ""        # Our company GSTIN → <BUYERGSTIN>
    buyer_address:         str   = ""        # → <BASICBUYERADDRESS>
    place_of_supply:       str   = ""
    party_state:           str   = ""
    gst_registration_type: str   = "Regular" # Regular / Unregistered / Consumer
    narration:             str   = ""
    roundoff_ledger:       str   = "Round Off"
    freight_ledger:        str   = "Freight Charges"
    gst_ledger_entries:    Optional[List[GstLedgerEntry]] = None


class BulkVoucherRequest(BaseModel):
    company_name: str
    vouchers:     List[GenerateVoucherRequest]


def _build_xml_single(req: GenerateVoucherRequest) -> str:
    builder     = VoucherBuilderService()
    items_dict  = [item.dict() for item in req.items]
    vtype       = req.voucher_type or req.purchase_ledger or "Purchase"
    gst_entries = [e.dict() for e in req.gst_ledger_entries] if req.gst_ledger_entries else None
    return builder.build_purchase_voucher(
        company_name=req.company_name, invoice_no=req.invoice_no,
        invoice_date=req.invoice_date, supplier_ledger=req.supplier_ledger,
        items=items_dict, is_interstate=req.is_interstate,
        cgst_total=Decimal(str(req.cgst_total)),
        sgst_total=Decimal(str(req.sgst_total)),
        igst_total=Decimal(str(req.igst_total)),
        cgst_ledger=req.cgst_ledger, sgst_ledger=req.sgst_ledger,
        igst_ledger=req.igst_ledger, purchase_ledger=req.purchase_ledger,
        other_charges=Decimal(str(req.other_charges)),
        round_off=Decimal(str(req.round_off)),
        voucher_type=vtype,
        supplier_gstin=req.supplier_gstin, buyer_gstin=req.buyer_gstin,
        buyer_address=req.buyer_address, place_of_supply=req.place_of_supply,
        party_state=req.party_state,
        gst_registration_type=req.gst_registration_type,
        narration=req.narration,
        roundoff_ledger=req.roundoff_ledger, freight_ledger=req.freight_ledger,
        gst_ledger_entries=gst_entries,
    )


def _streaming_xml(xml_content: str, filename: str) -> StreamingResponse:
    xml_bytes = xml_content.encode("utf-8")
    return StreamingResponse(
        BytesIO(xml_bytes),
        media_type="application/xml",
        headers={
            "Content-Disposition":           f'attachment; filename="{filename}"',
            "Content-Length":                str(len(xml_bytes)),
            "Access-Control-Expose-Headers": "Content-Disposition",
        },
    )


@router.post("/generate")
async def generate_voucher(request: GenerateVoucherRequest):
    try:
        xml_content  = _build_xml_single(request)
        items_total  = sum(item.amount for item in request.items)
        tax_total    = sum(e.cgst_amount + e.sgst_amount + e.igst_amount
                          for e in request.gst_ledger_entries) if request.gst_ledger_entries \
                      else request.cgst_total + request.sgst_total + request.igst_total
        total_amount = items_total + tax_total + request.other_charges + request.round_off
        return {"xml_content": xml_content, "invoice_no": request.invoice_no,
                "total_amount": total_amount, "supplier": request.supplier_ledger,
                "place_of_supply": request.place_of_supply}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"XML generation error: {str(e)}")


@router.post("/generate-and-send")
async def generate_and_send_voucher(request: GenerateVoucherRequest):
    try:
        xml_content = _build_xml_single(request)
        success     = TallyConnectorService().send_voucher(xml_content)
        if success:
            return {"success": True, "message": f"Voucher {request.invoice_no} imported to Tally",
                    "invoice_no": request.invoice_no}
        raise HTTPException(status_code=400, detail="Tally rejected the voucher")
    except TallyConnectionError as e:
        raise HTTPException(status_code=503, detail=str(e))
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/download")
async def download_voucher_xml(request: GenerateVoucherRequest):
    try:
        xml_content = _build_xml_single(request)
        vtype    = (request.voucher_type or "voucher").replace(" ", "_")
        return _streaming_xml(xml_content, f"{vtype}_{request.invoice_no}.xml")
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/download-bulk")
async def download_bulk_xml(request: BulkVoucherRequest):
    try:
        if not request.vouchers:
            raise HTTPException(status_code=400, detail="No vouchers provided")
        builder = VoucherBuilderService()
        count   = len(request.vouchers)
        if count == 1:
            xml_content = _build_xml_single(request.vouchers[0])
            vtype    = (request.vouchers[0].voucher_type or "voucher").replace(" ", "_")
            filename = f"{vtype}_{request.vouchers[0].invoice_no}.xml"
        else:
            vd = []
            for v in request.vouchers:
                vd.append({
                    "invoice_no": v.invoice_no, "invoice_date": v.invoice_date,
                    "supplier_ledger": v.supplier_ledger,
                    "items": [i.dict() for i in v.items],
                    "is_interstate": v.is_interstate,
                    "cgst_total": v.cgst_total, "sgst_total": v.sgst_total,
                    "igst_total": v.igst_total, "cgst_ledger": v.cgst_ledger,
                    "sgst_ledger": v.sgst_ledger, "igst_ledger": v.igst_ledger,
                    "purchase_ledger": v.purchase_ledger,
                    "other_charges": v.other_charges, "round_off": v.round_off,
                    "voucher_type": v.voucher_type or v.purchase_ledger or "Purchase",
                    "supplier_gstin": v.supplier_gstin, "buyer_gstin": v.buyer_gstin,
                    "buyer_address": v.buyer_address, "place_of_supply": v.place_of_supply,
                    "party_state": v.party_state,
                    "gst_registration_type": v.gst_registration_type,
                    "narration": v.narration,
                    "roundoff_ledger": v.roundoff_ledger, "freight_ledger": v.freight_ledger,
                    "gst_ledger_entries": [e.dict() for e in v.gst_ledger_entries] if v.gst_ledger_entries else None,
                })
            xml_content = builder.build_bulk_vouchers(company_name=request.company_name, vouchers=vd)
            from datetime import date
            today    = date.today().strftime("%Y%m%d")
            vtype    = (request.vouchers[0].voucher_type or "voucher").replace(" ", "_")
            filename = f"{vtype}_bulk_{count}invoices_{today}.xml"
        return _streaming_xml(xml_content, filename)
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Bulk XML error: {str(e)}")


@router.post("/download_excel")
async def download_invoices_excel(invoice_data: dict):
    try:
        invoices = invoice_data.get("invoices", [])
        if not invoices:
            raise HTTPException(status_code=400, detail="No invoice data provided")
        excel_file = ExcelService().generate_invoice_excel(invoices)
        return Response(
            content=excel_file.getvalue(),
            headers={"Content-Disposition": 'attachment; filename="invoices_report.xlsx"'},
            media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Excel error: {str(e)}")