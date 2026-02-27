"""
Voucher Builder Service - Generates Tally XML for Purchase/Sales Vouchers.

KEY POINTS:
  - PERSISTEDVIEW = "Invoice Voucher View"
  - Voucher type is dynamic (passed in, not hardcoded)
  - Debit amounts (Purchases, Taxes) are NEGATIVE in Tally XML
  - Credit amounts (Supplier balance) are POSITIVE in Tally XML
  - supplier_ledger = Tally ledger name (user-selected, not raw e-invoice name)
  - place_of_supply = Indian state name → written to <PLACEOFSUPPLY>
  - supplier_gstin  = GSTIN from e-invoice → written to <PARTYGSTIN>
  - roundoff_ledger = Tally round-off ledger name (from user selection, not hardcoded)
  - freight_ledger  = Tally freight/other charges ledger name
  - gst_ledger_entries = list of per-rate GST ledger entries:
      [{ gst_rate, cgst_ledger, sgst_ledger, igst_ledger,
         cgst_amount, sgst_amount, igst_amount }, ...]
    If provided, each rate gets its own <LEDGERENTRIES.LIST> blocks.
    Falls back to single cgst_ledger/sgst_ledger/igst_ledger if not provided.
"""

from decimal import Decimal
from typing import List, Dict, Optional
from datetime import datetime


class VoucherBuilderService:

    @staticmethod
    def _format_date(date_str: str) -> str:
        for fmt in ("%d-%m-%Y", "%Y-%m-%d", "%d/%m/%Y"):
            try:
                return datetime.strptime(date_str, fmt).strftime("%Y%m%d")
            except ValueError:
                continue
        return datetime.now().strftime("%Y%m%d")

    @staticmethod
    def _format_amount(amount: Decimal) -> str:
        return f"{float(amount):.2f}"

    # ─────────────────────────────────────────────────────────────
    # Inner block — ONE voucher, no envelope wrapper
    # ─────────────────────────────────────────────────────────────
    def build_voucher_block(
        self,
        invoice_no:         str,
        invoice_date:       str,
        supplier_ledger:    str,          # Tally ledger name (user selected)
        items:              List[Dict],
        is_interstate:      bool,
        # Flat totals — used if gst_ledger_entries not provided
        cgst_total:         Decimal = Decimal("0"),
        sgst_total:         Decimal = Decimal("0"),
        igst_total:         Decimal = Decimal("0"),
        cgst_ledger:        str = "Input CGST",
        sgst_ledger:        str = "Input SGST",
        igst_ledger:        str = "Input IGST",
        purchase_ledger:    str = "Purchase",
        other_charges:      Decimal = Decimal("0"),
        round_off:          Decimal = Decimal("0"),
        voucher_type:       str = "Purchase",
        # NEW fields
        supplier_gstin:     str = "",
        place_of_supply:    str = "",
        roundoff_ledger:    str = "Round Off",   # from Tally ledger list
        freight_ledger:     str = "Freight Charges",
        # Rate-wise GST: list of dicts
        # Each: { gst_rate, cgst_ledger, sgst_ledger, igst_ledger,
        #         cgst_amount, sgst_amount, igst_amount }
        gst_ledger_entries: Optional[List[Dict]] = None,
    ) -> str:
        """Returns a single <TALLYMESSAGE> block."""
        tally_date  = self._format_date(invoice_date)
        items_total = sum(Decimal(str(item.get("amount", 0))) for item in items)

        # Compute tax total from rate-wise entries if available
        if gst_ledger_entries:
            tax_total = sum(
                Decimal(str(e.get("cgst_amount", 0))) +
                Decimal(str(e.get("sgst_amount", 0))) +
                Decimal(str(e.get("igst_amount", 0)))
                for e in gst_ledger_entries
            )
        else:
            tax_total = cgst_total + sgst_total + igst_total

        total_value = items_total + tax_total + other_charges + round_off

        inv_entries = self._build_inventory_entries(items, purchase_ledger)
        led_entries = self._build_ledger_entries(
            supplier_ledger    = supplier_ledger,
            total_value        = total_value,
            is_interstate      = is_interstate,
            cgst_total         = cgst_total,
            sgst_total         = sgst_total,
            igst_total         = igst_total,
            cgst_ledger        = cgst_ledger,
            sgst_ledger        = sgst_ledger,
            igst_ledger        = igst_ledger,
            other_charges      = other_charges,
            round_off          = round_off,
            roundoff_ledger    = roundoff_ledger,
            freight_ledger     = freight_ledger,
            gst_ledger_entries = gst_ledger_entries,
        )

        # Optional tags
        gstin_tag = f"\n                        <PARTYGSTIN>{supplier_gstin}</PARTYGSTIN>" if supplier_gstin else ""
        pos_tag   = f"\n                        <PLACEOFSUPPLY>{place_of_supply}</PLACEOFSUPPLY>" if place_of_supply else ""

        return f"""
                <TALLYMESSAGE xmlns:UDF="TallyUDF">
                    <VOUCHER VCHTYPE="{voucher_type}" ACTION="Create" OBJVIEW="Invoice Voucher View">
                        <DATE>{tally_date}</DATE>
                        <VOUCHERTYPENAME>{voucher_type}</VOUCHERTYPENAME>
                        <VOUCHERNUMBER>{invoice_no}</VOUCHERNUMBER>
                        <REFERENCE>{invoice_no}</REFERENCE>
                        <PARTYNAME>{supplier_ledger}</PARTYNAME>
                        <PARTYLEDGERNAME>{supplier_ledger}</PARTYLEDGERNAME>
                        <PERSISTEDVIEW>Invoice Voucher View</PERSISTEDVIEW>
                        <ISINVOICE>Yes</ISINVOICE>{gstin_tag}{pos_tag}
                        {led_entries}
                        {inv_entries}
                    </VOUCHER>
                </TALLYMESSAGE>"""

    # ─────────────────────────────────────────────────────────────
    # Single invoice — complete XML
    # ─────────────────────────────────────────────────────────────
    def build_purchase_voucher(
        self,
        company_name:       str,
        invoice_no:         str,
        invoice_date:       str,
        supplier_ledger:    str,
        items:              List[Dict],
        is_interstate:      bool,
        cgst_total:         Decimal = Decimal("0"),
        sgst_total:         Decimal = Decimal("0"),
        igst_total:         Decimal = Decimal("0"),
        cgst_ledger:        str = "Input CGST",
        sgst_ledger:        str = "Input SGST",
        igst_ledger:        str = "Input IGST",
        purchase_ledger:    str = "Purchase",
        other_charges:      Decimal = Decimal("0"),
        round_off:          Decimal = Decimal("0"),
        voucher_type:       str = "Purchase",
        supplier_gstin:     str = "",
        place_of_supply:    str = "",
        roundoff_ledger:    str = "Round Off",
        freight_ledger:     str = "Freight Charges",
        gst_ledger_entries: Optional[List[Dict]] = None,
    ) -> str:
        block = self.build_voucher_block(
            invoice_no         = invoice_no,
            invoice_date       = invoice_date,
            supplier_ledger    = supplier_ledger,
            items              = items,
            is_interstate      = is_interstate,
            cgst_total         = cgst_total,
            sgst_total         = sgst_total,
            igst_total         = igst_total,
            cgst_ledger        = cgst_ledger,
            sgst_ledger        = sgst_ledger,
            igst_ledger        = igst_ledger,
            purchase_ledger    = purchase_ledger,
            other_charges      = other_charges,
            round_off          = round_off,
            voucher_type       = voucher_type,
            supplier_gstin     = supplier_gstin,
            place_of_supply    = place_of_supply,
            roundoff_ledger    = roundoff_ledger,
            freight_ledger     = freight_ledger,
            gst_ledger_entries = gst_ledger_entries,
        )
        return self._wrap_envelope(company_name, block)

    # ─────────────────────────────────────────────────────────────
    # Bulk — N invoices in ONE XML
    # ─────────────────────────────────────────────────────────────
    def build_bulk_vouchers(self, company_name: str, vouchers: List[Dict]) -> str:
        blocks = []
        for v in vouchers:
            blocks.append(self.build_voucher_block(
                invoice_no         = v["invoice_no"],
                invoice_date       = v["invoice_date"],
                supplier_ledger    = v["supplier_ledger"],
                items              = v["items"],
                is_interstate      = v.get("is_interstate", False),
                cgst_total         = Decimal(str(v.get("cgst_total",  0))),
                sgst_total         = Decimal(str(v.get("sgst_total",  0))),
                igst_total         = Decimal(str(v.get("igst_total",  0))),
                cgst_ledger        = v.get("cgst_ledger",     "Input CGST"),
                sgst_ledger        = v.get("sgst_ledger",     "Input SGST"),
                igst_ledger        = v.get("igst_ledger",     "Input IGST"),
                purchase_ledger    = v.get("purchase_ledger", "Purchase"),
                other_charges      = Decimal(str(v.get("other_charges", 0))),
                round_off          = Decimal(str(v.get("round_off",     0))),
                voucher_type       = v.get("voucher_type",    "Purchase"),
                supplier_gstin     = v.get("supplier_gstin",  ""),
                place_of_supply    = v.get("place_of_supply", ""),
                roundoff_ledger    = v.get("roundoff_ledger", "Round Off"),
                freight_ledger     = v.get("freight_ledger",  "Freight Charges"),
                gst_ledger_entries = v.get("gst_ledger_entries", None),
            ))
        return self._wrap_envelope(company_name, "\n".join(blocks))

    # ─────────────────────────────────────────────────────────────
    # Helpers
    # ─────────────────────────────────────────────────────────────
    @staticmethod
    def _wrap_envelope(company_name: str, content: str) -> str:
        return f"""<ENVELOPE>
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
                {content}
            </REQUESTDATA>
        </IMPORTDATA>
    </BODY>
</ENVELOPE>"""

    def _build_inventory_entries(self, items: List[Dict], purchase_ledger: str) -> str:
        entries = []
        for item in items:
            stock_item = item.get("stock_item", "")
            quantity   = item.get("quantity", 0)
            unit       = item.get("unit", "Nos")
            rate       = self._format_amount(Decimal(str(item.get("rate",   0))))
            amount     = self._format_amount(Decimal(str(item.get("amount", 0))))
            entries.append(f"""
                        <ALLINVENTORYENTRIES.LIST>
                            <STOCKITEMNAME>{stock_item}</STOCKITEMNAME>
                            <ISDEEMEDPOSITIVE>Yes</ISDEEMEDPOSITIVE>
                            <RATE>{rate}</RATE>
                            <AMOUNT>-{amount}</AMOUNT>
                            <ACTUALQTY>{quantity} {unit}</ACTUALQTY>
                            <BILLEDQTY>{quantity} {unit}</BILLEDQTY>
                            <ACCOUNTINGALLOCATIONS.LIST>
                                <LEDGERNAME>{purchase_ledger}</LEDGERNAME>
                                <ISDEEMEDPOSITIVE>Yes</ISDEEMEDPOSITIVE>
                                <AMOUNT>-{amount}</AMOUNT>
                            </ACCOUNTINGALLOCATIONS.LIST>
                        </ALLINVENTORYENTRIES.LIST>""")
        return "".join(entries)

    def _build_ledger_entries(
        self,
        supplier_ledger:    str,
        total_value:        Decimal,
        is_interstate:      bool,
        cgst_total:         Decimal,
        sgst_total:         Decimal,
        igst_total:         Decimal,
        cgst_ledger:        str,
        sgst_ledger:        str,
        igst_ledger:        str,
        other_charges:      Decimal,
        round_off:          Decimal,
        roundoff_ledger:    str = "Round Off",
        freight_ledger:     str = "Freight Charges",
        gst_ledger_entries: Optional[List[Dict]] = None,
    ) -> str:
        entries = []

        # ── Supplier (Credit = Positive) ──
        entries.append(f"""
                        <LEDGERENTRIES.LIST>
                            <LEDGERNAME>{supplier_ledger}</LEDGERNAME>
                            <ISDEEMEDPOSITIVE>No</ISDEEMEDPOSITIVE>
                            <AMOUNT>{self._format_amount(total_value)}</AMOUNT>
                        </LEDGERENTRIES.LIST>""")

        # ── GST entries ──
        if gst_ledger_entries:
            # Rate-wise: one LEDGERENTRIES.LIST block per rate per ledger
            for entry in gst_ledger_entries:
                if is_interstate:
                    igst_amt = Decimal(str(entry.get("igst_amount", 0)))
                    if igst_amt > 0:
                        entries.append(f"""
                        <LEDGERENTRIES.LIST>
                            <LEDGERNAME>{entry["igst_ledger"]}</LEDGERNAME>
                            <ISDEEMEDPOSITIVE>Yes</ISDEEMEDPOSITIVE>
                            <AMOUNT>-{self._format_amount(igst_amt)}</AMOUNT>
                        </LEDGERENTRIES.LIST>""")
                else:
                    cgst_amt = Decimal(str(entry.get("cgst_amount", 0)))
                    sgst_amt = Decimal(str(entry.get("sgst_amount", 0)))
                    if cgst_amt > 0:
                        entries.append(f"""
                        <LEDGERENTRIES.LIST>
                            <LEDGERNAME>{entry["cgst_ledger"]}</LEDGERNAME>
                            <ISDEEMEDPOSITIVE>Yes</ISDEEMEDPOSITIVE>
                            <AMOUNT>-{self._format_amount(cgst_amt)}</AMOUNT>
                        </LEDGERENTRIES.LIST>""")
                    if sgst_amt > 0:
                        entries.append(f"""
                        <LEDGERENTRIES.LIST>
                            <LEDGERNAME>{entry["sgst_ledger"]}</LEDGERNAME>
                            <ISDEEMEDPOSITIVE>Yes</ISDEEMEDPOSITIVE>
                            <AMOUNT>-{self._format_amount(sgst_amt)}</AMOUNT>
                        </LEDGERENTRIES.LIST>""")
        else:
            # Fallback: flat single-ledger mode
            if is_interstate and igst_total > 0:
                entries.append(f"""
                        <LEDGERENTRIES.LIST>
                            <LEDGERNAME>{igst_ledger}</LEDGERNAME>
                            <ISDEEMEDPOSITIVE>Yes</ISDEEMEDPOSITIVE>
                            <AMOUNT>-{self._format_amount(igst_total)}</AMOUNT>
                        </LEDGERENTRIES.LIST>""")
            else:
                if cgst_total > 0:
                    entries.append(f"""
                        <LEDGERENTRIES.LIST>
                            <LEDGERNAME>{cgst_ledger}</LEDGERNAME>
                            <ISDEEMEDPOSITIVE>Yes</ISDEEMEDPOSITIVE>
                            <AMOUNT>-{self._format_amount(cgst_total)}</AMOUNT>
                        </LEDGERENTRIES.LIST>""")
                if sgst_total > 0:
                    entries.append(f"""
                        <LEDGERENTRIES.LIST>
                            <LEDGERNAME>{sgst_ledger}</LEDGERNAME>
                            <ISDEEMEDPOSITIVE>Yes</ISDEEMEDPOSITIVE>
                            <AMOUNT>-{self._format_amount(sgst_total)}</AMOUNT>
                        </LEDGERENTRIES.LIST>""")

        # ── Freight / Other Charges ──
        if other_charges > 0:
            entries.append(f"""
                        <LEDGERENTRIES.LIST>
                            <LEDGERNAME>{freight_ledger}</LEDGERNAME>
                            <ISDEEMEDPOSITIVE>Yes</ISDEEMEDPOSITIVE>
                            <AMOUNT>-{self._format_amount(other_charges)}</AMOUNT>
                        </LEDGERENTRIES.LIST>""")

        # ── Round Off — uses Tally ledger name from user selection ──
        if round_off != 0:
            is_debit = round_off > 0
            amt_str  = f"-{self._format_amount(abs(round_off))}" if is_debit else f"{self._format_amount(abs(round_off))}"
            entries.append(f"""
                        <LEDGERENTRIES.LIST>
                            <LEDGERNAME>{roundoff_ledger}</LEDGERNAME>
                            <ISDEEMEDPOSITIVE>{"Yes" if is_debit else "No"}</ISDEEMEDPOSITIVE>
                            <AMOUNT>{amt_str}</AMOUNT>
                        </LEDGERENTRIES.LIST>""")

        return "".join(entries)