"""
Voucher API Routes

ENDPOINTS:
  POST /api/vouchers/generate          → preview XML as JSON
  POST /api/vouchers/generate-and-send → XML + push to Tally
  POST /api/vouchers/download          → download single invoice XML
  POST /api/vouchers/download-bulk     → download N invoices as ONE XML file
  POST /api/vouchers/download_excel    → Excel report

NEW FIELDS in GenerateVoucherRequest:
  - supplier_gstin     : GSTIN from e-invoice → written to <PARTYGSTIN>
  - place_of_supply    : Indian state → written to <PLACEOFSUPPLY>
  - roundoff_ledger    : Tally round-off ledger name (selected by user, not hardcoded)
  - freight_ledger     : Tally freight/charges ledger name
  - gst_ledger_entries : Per-rate GST ledger config (for invoices with multiple GST rates)
    Each entry: { gst_rate, cgst_ledger, sgst_ledger, igst_ledger,
                  cgst_amount, sgst_amount, igst_amount }
"""

from fastapi import APIRouter, HTTPException, Response
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from typing import List, Optional, Dict, Any
from decimal import Decimal
from io import BytesIO

from ..services.tally_encoder import VoucherBuilderService
from ..services.tally_connector import TallyConnectorService, TallyConnectionError
from ..services.excel_download_service import ExcelService

router = APIRouter(prefix="/api/vouchers", tags=["Vouchers"])


# ── Request models ─────────────────────────────────────────────

class VoucherItem(BaseModel):
    stock_item: str
    quantity:   float
    unit:       str
    rate:       float
    amount:     float
    gst_rate:   float = 0.0  # item's GST rate % — used for rate-wise ledger lookup


class GstLedgerEntry(BaseModel):
    """Per-rate GST ledger config — one per unique GST rate in the invoice."""
    gst_rate:     float
    cgst_ledger:  str = "Input CGST"
    sgst_ledger:  str = "Input SGST"
    igst_ledger:  str = "Input IGST"
    cgst_amount:  float = 0.0
    sgst_amount:  float = 0.0
    igst_amount:  float = 0.0


class GenerateVoucherRequest(BaseModel):
    company_name:       str
    invoice_no:         str
    invoice_date:       str
    supplier_ledger:    str           # Tally ledger name (user-selected, NOT raw e-invoice name)
    items:              List[VoucherItem]
    is_interstate:      bool
    # Flat GST totals (legacy / single-rate fallback)
    cgst_total:         float = 0.0
    sgst_total:         float = 0.0
    igst_total:         float = 0.0
    cgst_ledger:        str   = "Input CGST"
    sgst_ledger:        str   = "Input SGST"
    igst_ledger:        str   = "Input IGST"
    purchase_ledger:    str   = "Purchase"
    other_charges:      float = 0.0
    round_off:          float = 0.0
    voucher_type:       Optional[str] = None
    # NEW — no exception fields
    supplier_gstin:     str   = ""
    place_of_supply:    str   = ""
    roundoff_ledger:    str   = "Round Off"      # must match exact Tally ledger name
    freight_ledger:     str   = "Freight Charges"
    party_state:        str   = ""               # → <STATENAME> + <BASICBUYERSSALESTAXSTATE>
    # Rate-wise GST ledger entries (preferred over flat totals when present)
    gst_ledger_entries: Optional[List[GstLedgerEntry]] = None


class BulkVoucherRequest(BaseModel):
    company_name: str
    vouchers:     List[GenerateVoucherRequest]


# ── Shared builder ─────────────────────────────────────────────

def _build_xml_single(req: GenerateVoucherRequest) -> str:
    builder    = VoucherBuilderService()
    items_dict = [item.dict() for item in req.items]
    vtype      = req.voucher_type or req.purchase_ledger or "Purchase"

    gst_entries = None
    if req.gst_ledger_entries:
        gst_entries = [e.dict() for e in req.gst_ledger_entries]

    return builder.build_purchase_voucher(
        company_name       = req.company_name,
        invoice_no         = req.invoice_no,
        invoice_date       = req.invoice_date,
        supplier_ledger    = req.supplier_ledger,
        items              = items_dict,
        is_interstate      = req.is_interstate,
        cgst_total         = Decimal(str(req.cgst_total)),
        sgst_total         = Decimal(str(req.sgst_total)),
        igst_total         = Decimal(str(req.igst_total)),
        cgst_ledger        = req.cgst_ledger,
        sgst_ledger        = req.sgst_ledger,
        igst_ledger        = req.igst_ledger,
        purchase_ledger    = req.purchase_ledger,
        other_charges      = Decimal(str(req.other_charges)),
        round_off          = Decimal(str(req.round_off)),
        voucher_type       = vtype,
        supplier_gstin     = req.supplier_gstin,
        place_of_supply    = req.place_of_supply,
        roundoff_ledger    = req.roundoff_ledger,
        freight_ledger     = req.freight_ledger,
        party_state        = req.party_state,
        gst_ledger_entries = gst_entries,
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


# ── Endpoints ──────────────────────────────────────────────────

@router.post("/generate")
async def generate_voucher(request: GenerateVoucherRequest):
    """Generate XML and return as JSON for preview."""
    try:
        xml_content  = _build_xml_single(request)
        items_total  = sum(item.amount for item in request.items)
        if request.gst_ledger_entries:
            tax_total = sum(
                e.cgst_amount + e.sgst_amount + e.igst_amount
                for e in request.gst_ledger_entries
            )
        else:
            tax_total = request.cgst_total + request.sgst_total + request.igst_total
        total_amount = items_total + tax_total + request.other_charges + request.round_off
        return {
            "xml_content":   xml_content,
            "invoice_no":    request.invoice_no,
            "total_amount":  total_amount,
            "supplier":      request.supplier_ledger,
            "place_of_supply": request.place_of_supply,
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"XML generation error: {str(e)}")


@router.post("/generate-and-send")
async def generate_and_send_voucher(request: GenerateVoucherRequest):
    """Generate XML and push directly to Tally."""
    try:
        xml_content   = _build_xml_single(request)
        tally_service = TallyConnectorService()
        success       = tally_service.send_voucher(xml_content)
        if success:
            return {
                "success":    True,
                "message":    f"Voucher {request.invoice_no} imported to Tally successfully",
                "invoice_no": request.invoice_no,
            }
        raise HTTPException(status_code=400, detail="Tally rejected the voucher")
    except TallyConnectionError as e:
        raise HTTPException(status_code=503, detail=str(e))
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/download")
async def download_voucher_xml(request: GenerateVoucherRequest):
    """Download a SINGLE invoice as XML."""
    try:
        xml_content = _build_xml_single(request)
        vtype    = (request.voucher_type or "voucher").replace(" ", "_")
        filename = f"{vtype}_{request.invoice_no}.xml"
        return _streaming_xml(xml_content, filename)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/download-bulk")
async def download_bulk_xml(request: BulkVoucherRequest):
    """
    Download 1 or N invoices as ONE XML file.
    1 invoice  → single-invoice XML, named after that invoice
    N invoices → combined XML with all <TALLYMESSAGE> blocks inside one <ENVELOPE>
    """
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
            vouchers_data = []
            for v in request.vouchers:
                gst_entries = [e.dict() for e in v.gst_ledger_entries] if v.gst_ledger_entries else None
                vouchers_data.append({
                    "invoice_no":         v.invoice_no,
                    "invoice_date":       v.invoice_date,
                    "supplier_ledger":    v.supplier_ledger,
                    "items":              [item.dict() for item in v.items],
                    "is_interstate":      v.is_interstate,
                    "cgst_total":         v.cgst_total,
                    "sgst_total":         v.sgst_total,
                    "igst_total":         v.igst_total,
                    "cgst_ledger":        v.cgst_ledger,
                    "sgst_ledger":        v.sgst_ledger,
                    "igst_ledger":        v.igst_ledger,
                    "purchase_ledger":    v.purchase_ledger,
                    "other_charges":      v.other_charges,
                    "round_off":          v.round_off,
                    "voucher_type":       v.voucher_type or v.purchase_ledger or "Purchase",
                    "supplier_gstin":     v.supplier_gstin,
                    "place_of_supply":    v.place_of_supply,
                    "roundoff_ledger":    v.roundoff_ledger,
                    "freight_ledger":     v.freight_ledger,
                    "party_state":        v.party_state,
                    "gst_ledger_entries": gst_entries,
                })
            xml_content = builder.build_bulk_vouchers(
                company_name = request.company_name,
                vouchers     = vouchers_data,
            )
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
        excel_service = ExcelService()
        excel_file    = excel_service.generate_invoice_excel(invoices)
        return Response(
            content=excel_file.getvalue(),
            headers={"Content-Disposition": 'attachment; filename="invoices_report.xlsx"'},
            media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Excel error: {str(e)}")