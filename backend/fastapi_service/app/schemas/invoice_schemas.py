"""
Pydantic schemas for request/response validation.

These define the structure of data coming in and going out of FastAPI endpoints.
Think of them as TypeScript interfaces for Python.
"""

from pydantic import BaseModel, Field
from typing import List, Optional
from datetime import datetime
from decimal import Decimal


# ===== TALLY MASTER SCHEMAS =====

class TallyStockItem(BaseModel):
    """Single stock item from Tally"""
    name: str
    unit: str
    last_purchase_rate: Optional[Decimal] = None
    mrp: Optional[Decimal] = None
    
    class Config:
        json_encoders = {
            Decimal: lambda v: float(v)  # Convert Decimal to float for JSON
        }


class TallyLedger(BaseModel):
    """Single ledger from Tally"""
    name: str
    ledger_type: Optional[str] = None  # "Sundry Creditors", "GST", etc.


class TallyMastersResponse(BaseModel):
    """Response containing all Tally masters"""
    company_name: str
    stock_items: List[TallyStockItem]
    ledgers: List[TallyLedger]
    units: List[str]


# ===== INVOICE SCHEMAS =====

class InvoiceItem(BaseModel):
    """Single item from e-invoice JSON"""
    description: str = Field(..., alias="PrdDesc")
    hsn: Optional[str] = Field(None, alias="HsnCd")
    quantity: float = Field(..., alias="Qty")
    unit: str = Field(..., alias="Unit")
    rate: Decimal = Field(..., alias="UnitPrice")
    taxable_amount: Decimal = Field(..., alias="AssAmt")
    gst_rate: float = Field(..., alias="GstRt")
    cgst: Decimal = Field(0, alias="CgstAmt")
    sgst: Decimal = Field(0, alias="SgstAmt")
    igst: Decimal = Field(0, alias="IgstAmt")
    total: Decimal = Field(..., alias="TotItemVal")
    
    class Config:
        populate_by_name = True  # Allow both field name and alias
        json_encoders = {Decimal: lambda v: float(v)}


class SupplierDetails(BaseModel):
    """Supplier/Party details from invoice"""
    name: str = Field(..., alias="LglNm")
    gstin: str = Field(..., alias="Gstin")
    address: str = Field(..., alias="Addr1")
    state_code: str = Field(..., alias="Stcd")
    
    class Config:
        populate_by_name = True


class Invoice(BaseModel):
    """Complete invoice structure"""
    invoice_no: str
    invoice_date: str
    supplier: SupplierDetails
    items: List[InvoiceItem]
    total_amount: Decimal
    cgst: Decimal = 0
    sgst: Decimal = 0
    igst: Decimal = 0
    is_interstate: bool = False  # Determined by IGST > 0


class ParsedInvoicesResponse(BaseModel):
    """Response after parsing JWT file"""
    invoices: List[Invoice]
    total_count: int


# ===== MAPPING SCHEMAS =====

class MappingSuggestion(BaseModel):
    """Suggested mapping for a product"""
    json_description: str
    suggested_tally_item: Optional[str] = None
    confidence: float = 0.0  # 0-1, how confident we are in the suggestion
    source: str  # "exact_match", "fuzzy_match", "user_history", "none"


class CreateMappingRequest(BaseModel):
    """Request to save a new mapping"""
    company_id: int
    json_description: str
    tally_item_name: str
    last_sales_rate: Optional[Decimal] = None
    mrp: Optional[Decimal] = None


class MappingResponse(BaseModel):
    """Response after saving mapping"""
    id: int
    company_id: int
    json_description: str
    tally_item_name: str
    created_at: datetime


# ===== VOUCHER GENERATION SCHEMAS =====

class VoucherItem(BaseModel):
    """Item for voucher generation"""
    tally_item_name: str
    quantity: float
    unit: str
    rate: Decimal
    amount: Decimal
    gst_rate: float
    cgst: Decimal = 0
    sgst: Decimal = 0
    igst: Decimal = 0


class GenerateVoucherRequest(BaseModel):
    """Request to generate Tally XML"""
    company_name: str
    invoice_no: str
    invoice_date: str
    supplier_ledger: str  # Party ledger name from Tally
    items: List[VoucherItem]
    cgst_ledger: Optional[str] = None
    sgst_ledger: Optional[str] = None
    igst_ledger: Optional[str] = None
    purchase_ledger: str = "Purchase"  # Default purchase ledger


class VoucherResponse(BaseModel):
    """Response with generated XML"""
    xml_content: str
    invoice_no: str
    total_amount: Decimal


# 🎓 MENTOR NOTE:
# - Pydantic automatically validates incoming data
# - If request doesn't match schema, FastAPI returns 422 error
# - Field(...) means required, Field(None) means optional
# - alias allows JSON keys to differ from Python field names
# - Config.populate_by_name lets you use either name or alias