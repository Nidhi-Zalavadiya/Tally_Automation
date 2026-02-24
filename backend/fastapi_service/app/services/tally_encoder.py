"""
Voucher Builder Service - Generates Tally XML for Purchase Vouchers.

This service creates properly formatted Tally XML that can be imported
to create purchase vouchers with multiple items and GST entries.
"""

from decimal import Decimal
from typing import List, Dict
from datetime import datetime


class VoucherBuilderService:
    """
    Service for building Tally XML vouchers.
    
    Focuses on Purchase vouchers with GST handling (CGST/SGST/IGST).
    """
    
    @staticmethod
    def _format_date(date_str: str) -> str:
        """
        Convert date from DD-MM-YYYY to YYYYMMDD (Tally format).
        
        Example: "15-01-2024" → "20240115"
        """
        try:
            # Try DD-MM-YYYY format
            dt = datetime.strptime(date_str, "%d-%m-%Y")
        except ValueError:
            try:
                # Try YYYY-MM-DD format
                dt = datetime.strptime(date_str, "%Y-%m-%d")
            except ValueError:
                # Fallback to today's date
                dt = datetime.now()
        
        return dt.strftime("%Y%m%d")
    
    
    @staticmethod
    def _format_amount(amount: Decimal) -> str:
        """Format amount for Tally (2 decimal places)"""
        return f"{float(amount):.2f}"
    
    
    def build_purchase_voucher(
        self,
        company_name: str,
        invoice_no: str,
        invoice_date: str,
        supplier_ledger: str,
        items: List[Dict],
        is_interstate: bool,
        cgst_total: Decimal = Decimal("0"),
        sgst_total: Decimal = Decimal("0"),
        igst_total: Decimal = Decimal("0"),
        cgst_ledger: str = "Input CGST",
        sgst_ledger: str = "Input SGST", 
        igst_ledger: str = "Input IGST",
        purchase_ledger: str = "Purchase",
        other_charges: Decimal = Decimal("0"),
        round_off: Decimal = Decimal("0")
    ) -> str:
        """
        Build complete Purchase voucher XML.
        
        Args:
            company_name: Tally company name
            invoice_no: Supplier invoice number
            invoice_date: Invoice date (DD-MM-YYYY or YYYY-MM-DD)
            supplier_ledger: Supplier's ledger name in Tally
            items: List of items with structure:
                [
                    {
                        "stock_item": "Product Name",
                        "quantity": 10.0,
                        "unit": "Nos",
                        "rate": 100.0,
                        "amount": 1000.0
                    }
                ]
            is_interstate: True if IGST applies, False for CGST/SGST
            cgst_total, sgst_total, igst_total: Tax amounts
            cgst_ledger, sgst_ledger, igst_ledger: Tax ledger names
            purchase_ledger: Purchase account ledger
            other_charges: Additional charges
            round_off: Round off amount
        
        Returns:
            Complete Tally XML string
        """
        
        # Format date
        tally_date = self._format_date(invoice_date)
        
        # Calculate total invoice value
        items_total = sum(Decimal(str(item.get("amount", 0))) for item in items)
        tax_total = cgst_total + sgst_total + igst_total
        total_value = items_total + tax_total + other_charges + round_off
        
        # Build inventory entries (stock items)
        inventory_entries = self._build_inventory_entries(items, purchase_ledger)
        
        # Build ledger entries (supplier, taxes, etc.)
        ledger_entries = self._build_ledger_entries(
            supplier_ledger=supplier_ledger,
            total_value=total_value,
            is_interstate=is_interstate,
            cgst_total=cgst_total,
            sgst_total=sgst_total,
            igst_total=igst_total,
            cgst_ledger=cgst_ledger,
            sgst_ledger=sgst_ledger,
            igst_ledger=igst_ledger,
            other_charges=other_charges,
            round_off=round_off
        )
        
        # Build complete XML
        xml = f"""<ENVELOPE>
    <HEADER>
        <TALLYREQUEST>Import Data</TALLYREQUEST>
    </HEADER>
    <BODY>
        <IMPORTDATA>
            <REQUESTDESC>
                <REPORTNAME>Vouchers</REPORTNAME>
                <STATICVARIABLES>
                    <SVCURRENTCOMPANY>{company_name}</SVCURRENTCOMPANY>
                </STATICVARIABLES>
            </REQUESTDESC>
            <REQUESTDATA>
                <TALLYMESSAGE xmlns:UDF="TallyUDF">
                    <VOUCHER VCHTYPE="Purchase" ACTION="Create">
                        <DATE>{tally_date}</DATE>
                        <VOUCHERTYPENAME>Purchase</VOUCHERTYPENAME>
                        <VOUCHERNUMBER>{invoice_no}</VOUCHERNUMBER>
                        <PARTYLEDGERNAME>{supplier_ledger}</PARTYLEDGERNAME>
                        <PERSISTEDVIEW>Accounting Voucher View</PERSISTEDVIEW>
                        
                        {inventory_entries}
                        
                        {ledger_entries}
                        
                    </VOUCHER>
                </TALLYMESSAGE>
            </REQUESTDATA>
        </IMPORTDATA>
    </BODY>
</ENVELOPE>"""
        
        return xml
    
    
    def _build_inventory_entries(self, items: List[Dict], purchase_ledger: str) -> str:
        """
        Build <ALLINVENTORYENTRIES.LIST> sections for each item.
        """
        entries = []
        
        for item in items:
            stock_item = item.get("stock_item", "")
            quantity = item.get("quantity", 0)
            unit = item.get("unit", "Nos")
            rate = self._format_amount(Decimal(str(item.get("rate", 0))))
            amount = self._format_amount(Decimal(str(item.get("amount", 0))))
            
            entry = f"""
                        <ALLINVENTORYENTRIES.LIST>
                            <STOCKITEMNAME>{stock_item}</STOCKITEMNAME>
                            <ISDEEMEDPOSITIVE>Yes</ISDEEMEDPOSITIVE>
                            <RATE>{rate}</RATE>
                            <AMOUNT>{amount}</AMOUNT>
                            <ACTUALQTY>{quantity} {unit}</ACTUALQTY>
                            <BILLEDQTY>{quantity} {unit}</BILLEDQTY>
                            <ACCOUNTINGALLOCATIONS.LIST>
                                <LEDGERNAME>{purchase_ledger}</LEDGERNAME>
                                <ISDEEMEDPOSITIVE>No</ISDEEMEDPOSITIVE>
                                <AMOUNT>-{amount}</AMOUNT>
                            </ACCOUNTINGALLOCATIONS.LIST>
                        </ALLINVENTORYENTRIES.LIST>"""
            
            entries.append(entry)
        
        return "".join(entries)
    
    
    def _build_ledger_entries(
        self,
        supplier_ledger: str,
        total_value: Decimal,
        is_interstate: bool,
        cgst_total: Decimal,
        sgst_total: Decimal,
        igst_total: Decimal,
        cgst_ledger: str,
        sgst_ledger: str,
        igst_ledger: str,
        other_charges: Decimal,
        round_off: Decimal
    ) -> str:
        """
        Build <ALLLEDGERENTRIES.LIST> sections.
        """
        entries = []
        
        # 1. Supplier ledger (credit - party to pay)
        entries.append(f"""
                        <ALLLEDGERENTRIES.LIST>
                            <LEDGERNAME>{supplier_ledger}</LEDGERNAME>
                            <ISDEEMEDPOSITIVE>No</ISDEEMEDPOSITIVE>
                            <AMOUNT>-{self._format_amount(total_value)}</AMOUNT>
                        </ALLLEDGERENTRIES.LIST>""")
        
        # 2. GST ledgers
        if is_interstate and igst_total > 0:
            # IGST (Interstate)
            entries.append(f"""
                        <ALLLEDGERENTRIES.LIST>
                            <LEDGERNAME>{igst_ledger}</LEDGERNAME>
                            <ISDEEMEDPOSITIVE>Yes</ISDEEMEDPOSITIVE>
                            <AMOUNT>{self._format_amount(igst_total)}</AMOUNT>
                        </ALLLEDGERENTRIES.LIST>""")
        else:
            # CGST + SGST (Intrastate)
            if cgst_total > 0:
                entries.append(f"""
                        <ALLLEDGERENTRIES.LIST>
                            <LEDGERNAME>{cgst_ledger}</LEDGERNAME>
                            <ISDEEMEDPOSITIVE>Yes</ISDEEMEDPOSITIVE>
                            <AMOUNT>{self._format_amount(cgst_total)}</AMOUNT>
                        </ALLLEDGERENTRIES.LIST>""")
            
            if sgst_total > 0:
                entries.append(f"""
                        <ALLLEDGERENTRIES.LIST>
                            <LEDGERNAME>{sgst_ledger}</LEDGERNAME>
                            <ISDEEMEDPOSITIVE>Yes</ISDEEMEDPOSITIVE>
                            <AMOUNT>{self._format_amount(sgst_total)}</AMOUNT>
                        </ALLLEDGERENTRIES.LIST>""")
        
        # 3. Other charges (if any)
        if other_charges > 0:
            entries.append(f"""
                        <ALLLEDGERENTRIES.LIST>
                            <LEDGERNAME>Freight Charges</LEDGERNAME>
                            <ISDEEMEDPOSITIVE>Yes</ISDEEMEDPOSITIVE>
                            <AMOUNT>{self._format_amount(other_charges)}</AMOUNT>
                        </ALLLEDGERENTRIES.LIST>""")
        
        # 4. Round off (if any)
        if round_off != 0:
            is_positive = "No" if round_off < 0 else "Yes"
            entries.append(f"""
                        <ALLLEDGERENTRIES.LIST>
                            <LEDGERNAME>Round Off</LEDGERNAME>
                            <ISDEEMEDPOSITIVE>{is_positive}</ISDEEMEDPOSITIVE>
                            <AMOUNT>{self._format_amount(abs(round_off))}</AMOUNT>
                        </ALLLEDGERENTRIES.LIST>""")
        
        return "".join(entries)


# 🎓 MENTOR NOTE:
# - This generates Purchase vouchers (not Sales like your old code)
# - ISDEEMEDPOSITIVE: Yes = Debit, No = Credit in Tally
# - For purchases: Stock items are Debit, Supplier is Credit
# - GST input tax is Debit (you can claim it)
# - Date must be YYYYMMDD format for Tally
# - Each item has its own ALLINVENTORYENTRIES.LIST section