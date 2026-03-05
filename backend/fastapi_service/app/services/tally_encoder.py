"""
Voucher Builder Service - Generates Tally XML for Purchase/Sales Vouchers.

KEY POINTS:
  - PERSISTEDVIEW = "Invoice Voucher View"
  - Voucher type is dynamic (passed in, not hardcoded)
  - Debit amounts (Purchases, Taxes) are NEGATIVE in Tally XML
  - Credit amounts (Supplier balance) are POSITIVE in Tally XML

FIELDS NOW SUPPORTED:
  - supplier_gstin       = GSTIN from e-invoice → <PARTYGSTIN>
  - buyer_gstin          = Our company GSTIN   → <BUYERGSTIN>
  - place_of_supply      = Indian state        → <PLACEOFSUPPLY>
  - party_state          = Supplier state      → <STATENAME> + <BASICBUYERSSALESTAXSTATE>
  - buyer_address        = Buyer address       → <BASICBUYERADDRESS>
  - gst_registration_type= Regular/Unregistered→ <GSTREGISTRATIONTYPE>
  - narration            = Free-text memo      → <NARRATION>
  - roundoff_ledger      = Tally ledger name   (user selected)
  - freight_ledger       = Tally ledger name   (user selected)
  - gst_ledger_entries   = per-rate GST config list

TAGS ADDED vs ORIGINAL:
  NARRATION, REFERENCEDATE, ISOPTIONAL, ISCANCELLED, ISDELETED,
  VCHGSTCLASS, DIFFACTUALQTY, GSTREGISTRATIONTYPE, ISINTERSTATEPURCHASE,
  BUYERGSTIN, BASICBUYERADDRESS, ISLASTDEEMEDPOSITIVE, ISPARTYLEDGER,
  TAXOBJECTTYPES.LIST per inventory item, GSTDETAILS.LIST (voucher GST summary)
"""

from decimal import Decimal
from typing import List, Dict, Optional
from datetime import datetime


GST_REG_TYPES = {
    "Regular": "Regular", "Unregistered": "Unregistered",
    "Consumer": "Consumer", "Composition": "Composition", "Unknown": "Unknown",
}


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
    # Inner block — ONE voucher
    # ─────────────────────────────────────────────────────────────
    def build_voucher_block(
        self,
        invoice_no:            str,
        invoice_date:          str,
        supplier_ledger:       str,
        items:                 List[Dict],
        is_interstate:         bool,
        cgst_total:            Decimal = Decimal("0"),
        sgst_total:            Decimal = Decimal("0"),
        igst_total:            Decimal = Decimal("0"),
        cgst_ledger:           str = "Input CGST",
        sgst_ledger:           str = "Input SGST",
        igst_ledger:           str = "Input IGST",
        purchase_ledger:       str = "Purchase",
        other_charges:         Decimal = Decimal("0"),
        round_off:             Decimal = Decimal("0"),
        voucher_type:          str = "Purchase",
        supplier_gstin:        str = "",
        place_of_supply:       str = "",
        party_state:           str = "",
        buyer_gstin:           str = "",
        buyer_address:         str = "",
        gst_registration_type: str = "Regular",
        narration:             str = "",
        roundoff_ledger:       str = "Round Off",
        freight_ledger:        str = "Freight Charges",
        gst_ledger_entries:    Optional[List[Dict]] = None,
    ) -> str:
        """Returns a single <TALLYMESSAGE> block."""
        tally_date  = self._format_date(invoice_date)
        items_total = sum(Decimal(str(item.get("amount", 0))) for item in items)

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
        t = ""
        if supplier_gstin:  t += f"\n                        <PARTYGSTIN>{supplier_gstin}</PARTYGSTIN>"
        if buyer_gstin:     t += f"\n                        <BUYERGSTIN>{buyer_gstin}</BUYERGSTIN>"
        if place_of_supply: t += f"\n                        <PLACEOFSUPPLY>{place_of_supply}</PLACEOFSUPPLY>"
        if party_state:
            t += f"\n                        <STATENAME>{party_state}</STATENAME>"
            t += f"\n                        <BASICBUYERSSALESTAXSTATE>{party_state}</BASICBUYERSSALESTAXSTATE>"
        if buyer_address:   t += f"\n                        <BASICBUYERADDRESS>{buyer_address}</BASICBUYERADDRESS>"

        narr     = narration or f"Purchase against invoice {invoice_no}"
        reg_type = GST_REG_TYPES.get(gst_registration_type, "Regular")
        gst_det  = self._build_gst_voucher_details(
            invoice_no, tally_date, is_interstate, place_of_supply,
            supplier_gstin, gst_ledger_entries, cgst_total, sgst_total, igst_total
        )

        return f"""
                <TALLYMESSAGE xmlns:UDF="TallyUDF">
                    <VOUCHER VCHTYPE="{voucher_type}" ACTION="Create" OBJVIEW="Invoice Voucher View">
                        <DATE>{tally_date}</DATE>
                        <REFERENCEDATE>{tally_date}</REFERENCEDATE>
                        <VOUCHERTYPENAME>{voucher_type}</VOUCHERTYPENAME>
                        <VOUCHERNUMBER>{invoice_no}</VOUCHERNUMBER>
                        <REFERENCE>{invoice_no}</REFERENCE>
                        <PARTYNAME>{supplier_ledger}</PARTYNAME>
                        <PARTYLEDGERNAME>{supplier_ledger}</PARTYLEDGERNAME>
                        <PERSISTEDVIEW>Invoice Voucher View</PERSISTEDVIEW>
                        <ISINVOICE>Yes</ISINVOICE>
                        <ISOPTIONAL>No</ISOPTIONAL>
                        <ISCANCELLED>No</ISCANCELLED>
                        <ISDELETED>No</ISDELETED>
                        <VCHGSTCLASS/>
                        <DIFFACTUALQTY>No</DIFFACTUALQTY>
                        <ISINTERSTATEPURCHASE>{str(is_interstate).lower()}</ISINTERSTATEPURCHASE>
                        <GSTREGISTRATIONTYPE>{reg_type}</GSTREGISTRATIONTYPE>
                        <NARRATION>{narr}</NARRATION>{t}
                        {gst_det}
                        {led_entries}
                        {inv_entries}
                    </VOUCHER>
                </TALLYMESSAGE>"""

    # ─────────────────────────────────────────────────────────────
    # Single invoice — complete XML
    # ─────────────────────────────────────────────────────────────
    def build_purchase_voucher(
        self,
        company_name:          str,
        invoice_no:            str,
        invoice_date:          str,
        supplier_ledger:       str,
        items:                 List[Dict],
        is_interstate:         bool,
        cgst_total:            Decimal = Decimal("0"),
        sgst_total:            Decimal = Decimal("0"),
        igst_total:            Decimal = Decimal("0"),
        cgst_ledger:           str = "Input CGST",
        sgst_ledger:           str = "Input SGST",
        igst_ledger:           str = "Input IGST",
        purchase_ledger:       str = "Purchase",
        other_charges:         Decimal = Decimal("0"),
        round_off:             Decimal = Decimal("0"),
        voucher_type:          str = "Purchase",
        supplier_gstin:        str = "",
        place_of_supply:       str = "",
        party_state:           str = "",
        buyer_gstin:           str = "",
        buyer_address:         str = "",
        gst_registration_type: str = "Regular",
        narration:             str = "",
        roundoff_ledger:       str = "Round Off",
        freight_ledger:        str = "Freight Charges",
        gst_ledger_entries:    Optional[List[Dict]] = None,
    ) -> str:
        block = self.build_voucher_block(
            invoice_no=invoice_no, invoice_date=invoice_date,
            supplier_ledger=supplier_ledger, items=items,
            is_interstate=is_interstate, cgst_total=cgst_total,
            sgst_total=sgst_total, igst_total=igst_total,
            cgst_ledger=cgst_ledger, sgst_ledger=sgst_ledger,
            igst_ledger=igst_ledger, purchase_ledger=purchase_ledger,
            other_charges=other_charges, round_off=round_off,
            voucher_type=voucher_type, supplier_gstin=supplier_gstin,
            place_of_supply=place_of_supply, party_state=party_state,
            buyer_gstin=buyer_gstin, buyer_address=buyer_address,
            gst_registration_type=gst_registration_type, narration=narration,
            roundoff_ledger=roundoff_ledger, freight_ledger=freight_ledger,
            gst_ledger_entries=gst_ledger_entries,
        )
        return self._wrap_envelope(company_name, block)

    # ─────────────────────────────────────────────────────────────
    # Bulk — N invoices in ONE XML
    # ─────────────────────────────────────────────────────────────
    def build_bulk_vouchers(self, company_name: str, vouchers: List[Dict]) -> str:
        blocks = []
        for v in vouchers:
            blocks.append(self.build_voucher_block(
                invoice_no            = v.get("invoice_no",            ""),
                invoice_date          = v.get("invoice_date",          ""),
                supplier_ledger       = v.get("supplier_ledger",       ""),
                items                 = v.get("items",                 []),
                is_interstate         = v.get("is_interstate",         False),
                cgst_total            = Decimal(str(v.get("cgst_total",    0))),
                sgst_total            = Decimal(str(v.get("sgst_total",    0))),
                igst_total            = Decimal(str(v.get("igst_total",    0))),
                cgst_ledger           = v.get("cgst_ledger",     "Input CGST"),
                sgst_ledger           = v.get("sgst_ledger",     "Input SGST"),
                igst_ledger           = v.get("igst_ledger",     "Input IGST"),
                purchase_ledger       = v.get("purchase_ledger", "Purchase"),
                other_charges         = Decimal(str(v.get("other_charges", 0))),
                round_off             = Decimal(str(v.get("round_off",     0))),
                voucher_type          = v.get("voucher_type",    "Purchase"),
                supplier_gstin        = v.get("supplier_gstin",  ""),
                place_of_supply       = v.get("place_of_supply", ""),
                party_state           = v.get("party_state",     ""),
                buyer_gstin           = v.get("buyer_gstin",     ""),
                buyer_address         = v.get("buyer_address",   ""),
                gst_registration_type = v.get("gst_registration_type", "Regular"),
                narration             = v.get("narration",       ""),
                roundoff_ledger       = v.get("roundoff_ledger", "Round Off"),
                freight_ledger        = v.get("freight_ledger",  "Freight Charges"),
                gst_ledger_entries    = v.get("gst_ledger_entries", None),
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
            gst_rate   = float(item.get("gst_rate", 0))

            entries.append(f"""
                        <ALLINVENTORYENTRIES.LIST>
                            <STOCKITEMNAME>{stock_item}</STOCKITEMNAME>
                            <ISDEEMEDPOSITIVE>Yes</ISDEEMEDPOSITIVE>
                            <ISLASTDEEMEDPOSITIVE>Yes</ISLASTDEEMEDPOSITIVE>
                            <ISAUTONEGATE>No</ISAUTONEGATE>
                            <ISGSTASSESSABLEVALUEOVERRIDDEN>No</ISGSTASSESSABLEVALUEOVERRIDDEN>
                            <RATE>{rate}</RATE>
                            <AMOUNT>-{amount}</AMOUNT>
                            <ACTUALQTY> {quantity} {unit}</ACTUALQTY>
                            <BILLEDQTY> {quantity} {unit}</BILLEDQTY>
                            <ACCOUNTINGALLOCATIONS.LIST>
                                <LEDGERNAME>{purchase_ledger}</LEDGERNAME>
                                <ISDEEMEDPOSITIVE>Yes</ISDEEMEDPOSITIVE>
                                <ISLASTDEEMEDPOSITIVE>Yes</ISLASTDEEMEDPOSITIVE>
                                <ISPARTYLEDGER>No</ISPARTYLEDGER>
                                <AMOUNT>-{amount}</AMOUNT>
                            </ACCOUNTINGALLOCATIONS.LIST>
                            <TAXOBJECTTYPES.LIST>
                                <GSTSTOCKCLASSIFICATIONNAME>GST @ {gst_rate:.0f}%</GSTSTOCKCLASSIFICATIONNAME>
                                <GSTRATE>{gst_rate:.2f}</GSTRATE>
                            </TAXOBJECTTYPES.LIST>
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

        # Supplier (Credit = Positive)
        entries.append(f"""
                        <LEDGERENTRIES.LIST>
                            <LEDGERNAME>{supplier_ledger}</LEDGERNAME>
                            <ISDEEMEDPOSITIVE>No</ISDEEMEDPOSITIVE>
                            <ISLASTDEEMEDPOSITIVE>No</ISLASTDEEMEDPOSITIVE>
                            <ISPARTYLEDGER>Yes</ISPARTYLEDGER>
                            <AMOUNT>{self._format_amount(total_value)}</AMOUNT>
                        </LEDGERENTRIES.LIST>""")

        # GST
        if gst_ledger_entries:
            for entry in gst_ledger_entries:
                if is_interstate:
                    igst_amt = Decimal(str(entry.get("igst_amount", 0)))
                    if igst_amt > 0:
                        entries.append(f"""
                        <LEDGERENTRIES.LIST>
                            <LEDGERNAME>{entry["igst_ledger"]}</LEDGERNAME>
                            <ISDEEMEDPOSITIVE>Yes</ISDEEMEDPOSITIVE>
                            <ISLASTDEEMEDPOSITIVE>Yes</ISLASTDEEMEDPOSITIVE>
                            <ISPARTYLEDGER>No</ISPARTYLEDGER>
                            <AMOUNT>-{self._format_amount(igst_amt)}</AMOUNT>
                        </LEDGERENTRIES.LIST>""")
                else:
                    for key, lname in [("cgst_amount", entry.get("cgst_ledger","")),
                                       ("sgst_amount", entry.get("sgst_ledger",""))]:
                        amt = Decimal(str(entry.get(key, 0)))
                        if amt > 0:
                            entries.append(f"""
                        <LEDGERENTRIES.LIST>
                            <LEDGERNAME>{lname}</LEDGERNAME>
                            <ISDEEMEDPOSITIVE>Yes</ISDEEMEDPOSITIVE>
                            <ISLASTDEEMEDPOSITIVE>Yes</ISLASTDEEMEDPOSITIVE>
                            <ISPARTYLEDGER>No</ISPARTYLEDGER>
                            <AMOUNT>-{self._format_amount(amt)}</AMOUNT>
                        </LEDGERENTRIES.LIST>""")
        else:
            if is_interstate and igst_total > 0:
                entries.append(f"""
                        <LEDGERENTRIES.LIST>
                            <LEDGERNAME>{igst_ledger}</LEDGERNAME>
                            <ISDEEMEDPOSITIVE>Yes</ISDEEMEDPOSITIVE>
                            <ISLASTDEEMEDPOSITIVE>Yes</ISLASTDEEMEDPOSITIVE>
                            <ISPARTYLEDGER>No</ISPARTYLEDGER>
                            <AMOUNT>-{self._format_amount(igst_total)}</AMOUNT>
                        </LEDGERENTRIES.LIST>""")
            else:
                for amt, lname in [(cgst_total, cgst_ledger), (sgst_total, sgst_ledger)]:
                    if amt > 0:
                        entries.append(f"""
                        <LEDGERENTRIES.LIST>
                            <LEDGERNAME>{lname}</LEDGERNAME>
                            <ISDEEMEDPOSITIVE>Yes</ISDEEMEDPOSITIVE>
                            <ISLASTDEEMEDPOSITIVE>Yes</ISLASTDEEMEDPOSITIVE>
                            <ISPARTYLEDGER>No</ISPARTYLEDGER>
                            <AMOUNT>-{self._format_amount(amt)}</AMOUNT>
                        </LEDGERENTRIES.LIST>""")

        # Freight
        if other_charges > 0:
            entries.append(f"""
                        <LEDGERENTRIES.LIST>
                            <LEDGERNAME>{freight_ledger}</LEDGERNAME>
                            <ISDEEMEDPOSITIVE>Yes</ISDEEMEDPOSITIVE>
                            <ISLASTDEEMEDPOSITIVE>Yes</ISLASTDEEMEDPOSITIVE>
                            <ISPARTYLEDGER>No</ISPARTYLEDGER>
                            <AMOUNT>-{self._format_amount(other_charges)}</AMOUNT>
                        </LEDGERENTRIES.LIST>""")

        # Round Off
        if round_off != 0:
            is_debit = round_off > 0
            amt_str  = f"-{self._format_amount(abs(round_off))}" if is_debit else f"{self._format_amount(abs(round_off))}"
            entries.append(f"""
                        <LEDGERENTRIES.LIST>
                            <LEDGERNAME>{roundoff_ledger}</LEDGERNAME>
                            <ISDEEMEDPOSITIVE>{"Yes" if is_debit else "No"}</ISDEEMEDPOSITIVE>
                            <ISLASTDEEMEDPOSITIVE>{"Yes" if is_debit else "No"}</ISLASTDEEMEDPOSITIVE>
                            <ISPARTYLEDGER>No</ISPARTYLEDGER>
                            <AMOUNT>{amt_str}</AMOUNT>
                        </LEDGERENTRIES.LIST>""")

        return "".join(entries)

    def _build_gst_voucher_details(
        self,
        invoice_no:         str,
        invoice_date:       str,   # already formatted YYYYMMDD
        is_interstate:      bool,
        place_of_supply:    str,
        supplier_gstin:     str,
        gst_ledger_entries: Optional[List[Dict]],
        cgst_total:         Decimal,
        sgst_total:         Decimal,
        igst_total:         Decimal,
    ) -> str:
        """Voucher-level GSTDETAILS.LIST — used by Tally for GSTR-2 matching."""
        if gst_ledger_entries:
            total_cgst = sum(Decimal(str(e.get("cgst_amount", 0))) for e in gst_ledger_entries)
            total_sgst = sum(Decimal(str(e.get("sgst_amount", 0))) for e in gst_ledger_entries)
            total_igst = sum(Decimal(str(e.get("igst_amount", 0))) for e in gst_ledger_entries)
        else:
            total_cgst, total_sgst, total_igst = cgst_total, sgst_total, igst_total

        gst_type = "Inter State" if is_interstate else "Intra State"
        pos      = f"\n                            <PLACEOFSUPPLY>{place_of_supply}</PLACEOFSUPPLY>" if place_of_supply else ""
        gstin    = f"\n                            <SELLERGSTIN>{supplier_gstin}</SELLERGSTIN>" if supplier_gstin else ""

        tax_block = ""
        if is_interstate and total_igst > 0:
            tax_block = f"\n                            <IGSTAMOUNT>{self._format_amount(total_igst)}</IGSTAMOUNT>"
        else:
            if total_cgst > 0:
                tax_block += f"\n                            <CGSTAMOUNT>{self._format_amount(total_cgst)}</CGSTAMOUNT>"
            if total_sgst > 0:
                tax_block += f"\n                            <SGSTAMOUNT>{self._format_amount(total_sgst)}</SGSTAMOUNT>"

        return f"""
                        <GSTDETAILS.LIST>
                            <GSTTYPE>{gst_type}</GSTTYPE>
                            <INVOICENUMBER>{invoice_no}</INVOICENUMBER>
                            <INVOICEDATE>{invoice_date}</INVOICEDATE>{pos}{gstin}{tax_block}
                        </GSTDETAILS.LIST>"""