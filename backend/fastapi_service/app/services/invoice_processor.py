"""
JWT Invoice Processor Service.
Handles decoding of GST e-invoice JWT files and extraction of invoice data.
Now also extracts: supplier state name, buyer GSTIN, buyer address.
"""

import base64
import json
from typing import List, Dict
from decimal import Decimal


# GSTIN state code → state name
GSTIN_STATE_MAP = {
    "01":"Jammu and Kashmir", "02":"Himachal Pradesh", "03":"Punjab",
    "04":"Chandigarh", "05":"Uttarakhand", "06":"Haryana", "07":"Delhi",
    "08":"Rajasthan", "09":"Uttar Pradesh", "10":"Bihar", "11":"Sikkim",
    "12":"Arunachal Pradesh", "13":"Nagaland", "14":"Manipur", "15":"Mizoram",
    "16":"Tripura", "17":"Meghalaya", "18":"Assam", "19":"West Bengal",
    "20":"Jharkhand", "21":"Odisha", "22":"Chhattisgarh", "23":"Madhya Pradesh",
    "24":"Gujarat", "26":"Dadra and Nagar Haveli and Daman and Diu",
    "27":"Maharashtra", "28":"Andhra Pradesh", "29":"Karnataka", "30":"Goa",
    "31":"Lakshadweep", "32":"Kerala", "33":"Tamil Nadu", "34":"Puducherry",
    "35":"Andaman and Nicobar Islands", "36":"Telangana", "37":"Andhra Pradesh",
    "38":"Ladakh", "97":"Other Territory",
}

def gstin_to_state(gstin: str) -> str:
    """Derive state name from GSTIN's first two digits."""
    if gstin and len(gstin) >= 2:
        return GSTIN_STATE_MAP.get(gstin[:2], "")
    return ""


class JWTDecodeError(Exception):
    pass


class InvoiceProcessorService:

    @staticmethod
    def _base64_url_decode(data: str) -> bytes:
        padding = '=' * (-len(data) % 4)
        return base64.urlsafe_b64decode(data + padding)

    def decode_jwt(self, jwt_token: str) -> Dict:
        try:
            parts = jwt_token.split('.')
            if len(parts) != 3:
                raise JWTDecodeError("Invalid JWT format")
            payload_bytes = self._base64_url_decode(parts[1])
            payload_json  = json.loads(payload_bytes.decode("utf-8"))
            invoice_data  = json.loads(payload_json["data"])
            return invoice_data
        except (ValueError, KeyError, json.JSONDecodeError) as e:
            raise JWTDecodeError(f"Failed to decode JWT: {str(e)}")

    def process_json_file(self, json_data: List[Dict]) -> List[Dict]:
        decoded = []
        for entry in json_data:
            if 'SignedInvoice' in entry:
                try:
                    decoded.append(self.decode_jwt(entry['SignedInvoice']))
                except JWTDecodeError as e:
                    print(f"Skipping invalid invoice: {e}")
        return decoded

    @staticmethod
    def extract_invoice_structure(raw_invoice: Dict) -> Dict:
        doc    = raw_invoice.get("DocDtls",    {})
        val    = raw_invoice.get("ValDtls",    {})
        seller = raw_invoice.get("SellerDtls", {})
        buyer  = raw_invoice.get("BuyerDtls",  {})
        items  = raw_invoice.get("ItemList",   [])

        igst_val     = Decimal(str(val.get("IgstVal", 0)))
        is_interstate = igst_val > 0

        # Derive seller state from Stcd or GSTIN
        seller_gstin    = seller.get("Gstin", "")
        seller_stcd     = seller.get("Stcd", "")
        seller_state    = GSTIN_STATE_MAP.get(seller_stcd, "") or gstin_to_state(seller_gstin)

        # Buyer
        buyer_gstin  = buyer.get("Gstin", "")
        buyer_addr   = buyer.get("Addr1", "")
        buyer_state  = GSTIN_STATE_MAP.get(buyer.get("Stcd", ""), "") or gstin_to_state(buyer_gstin)

        # Items
        processed_items = []
        for item in items:
            processed_items.append({
                "description":    item.get("PrdDesc", ""),
                "hsn":            item.get("HsnCd", ""),
                "quantity":       float(item.get("Qty", 0)),
                "unit":           item.get("Unit", ""),
                "rate":           Decimal(str(item.get("UnitPrice", 0))),
                "taxable_amount": Decimal(str(item.get("AssAmt",    0))),
                "gst_rate":       float(item.get("GstRt", 0)),
                "cgst":           Decimal(str(item.get("CgstAmt",   0))),
                "sgst":           Decimal(str(item.get("SgstAmt",   0))),
                "igst":           Decimal(str(item.get("IgstAmt",   0))),
                "total":          Decimal(str(item.get("TotItemVal",0))),
            })

        return {
            "invoice_no":   doc.get("No",  ""),
            "invoice_date": doc.get("Dt",  ""),
            "supplier": {
                "name":       seller.get("LglNm", "") or seller.get("TrdNm", ""),
                "gstin":      seller_gstin,
                "address":    seller.get("Addr1", ""),
                "state_code": seller_stcd,
                "state":      seller_state,          # ← NEW: human-readable state name
            },
            "buyer": {
                "name":    buyer.get("LglNm", "") or buyer.get("TrdNm", ""),
                "gstin":   buyer_gstin,
                "address": buyer_addr,
                "state":   buyer_state,
            },
            "items":          processed_items,
            "total_amount":   Decimal(str(val.get("TotInvVal", 0))),
            "cgst":           Decimal(str(val.get("CgstVal",   0))),
            "sgst":           Decimal(str(val.get("SgstVal",   0))),
            "igst":           Decimal(str(val.get("IgstVal",   0))),
            "is_interstate":  is_interstate,
            "other_charges":  Decimal(str(val.get("OthChrg",   0))),
            "round_off":      Decimal(str(val.get("RndOffAmt", 0))),
            # Convenience top-level for frontend
            "place_of_supply": buyer_state,
        }

    def process_and_structure(self, json_data: List[Dict]) -> List[Dict]:
        raw = self.process_json_file(json_data)
        return [self.extract_invoice_structure(r) for r in raw]