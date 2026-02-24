"""
JWT Invoice Processor Service.

Handles decoding of GST e-invoice JWT files and extraction of invoice data.
Your original processor.py logic, enhanced for production use.
"""

import base64
import json
from typing import List, Dict
from decimal import Decimal


class JWTDecodeError(Exception):
    """Raised when JWT decoding fails"""
    pass


class InvoiceProcessorService:
    """
    Service for processing GST e-invoice JWT files.
    
    Methods:
        - decode_jwt: Decode a single JWT token
        - process_json_file: Process uploaded JSON with multiple invoices
        - extract_invoice_data: Parse invoice structure
    """
    
    @staticmethod
    def _base64_url_decode(data: str) -> bytes:
        """
        Decode base64 URL-encoded data.
        
        Your original logic - adds padding if needed.
        """
        padding = '=' * (-len(data) % 4)
        return base64.urlsafe_b64decode(data + padding)
    
    
    def decode_jwt(self, jwt_token: str) -> Dict:
        """
        Decode JWT and extract invoice data.
        
        Args:
            jwt_token: The SignedInvoice JWT string
        
        Returns:
            Decoded invoice dictionary
        
        Raises:
            JWTDecodeError: If JWT is invalid
        """
        try:
            # JWT structure: header.payload.signature
            parts = jwt_token.split('.')
            if len(parts) != 3:
                raise JWTDecodeError("Invalid JWT format. Expected 3 parts separated by '.'")
            
            # Decode payload (middle part)
            payload_bytes = self._base64_url_decode(parts[1])
            payload_json = json.loads(payload_bytes.decode("utf-8"))
            
            # GST portal wraps actual invoice data in "data" field
            invoice_data = json.loads(payload_json["data"])
            
            return invoice_data
        
        except (ValueError, KeyError, json.JSONDecodeError) as e:
            raise JWTDecodeError(f"Failed to decode JWT: {str(e)}")
    
    
    def process_json_file(self, json_data: List[Dict]) -> List[Dict]:
        """
        Process uploaded JSON file containing multiple invoices.
        
        Args:
            json_data: List of entries with 'SignedInvoice' field
        
        Returns:
            List of decoded invoice dictionaries
        
        Your original logic from process_json_file()
        """
        decoded_invoices = []
        
        for entry in json_data:
            if 'SignedInvoice' in entry:
                try:
                    invoice = self.decode_jwt(entry['SignedInvoice'])
                    decoded_invoices.append(invoice)
                except JWTDecodeError as e:
                    # Log error but continue processing other invoices
                    print(f"Skipping invalid invoice: {e}")
                    continue
        
        return decoded_invoices
    
    
    @staticmethod
    def extract_invoice_structure(raw_invoice: Dict) -> Dict:
        """
        Extract and normalize invoice data into a clean structure.
        
        This transforms the raw GST JSON into a format easier to work with.
        """
        doc = raw_invoice.get("DocDtls", {})
        val = raw_invoice.get("ValDtls", {})
        seller = raw_invoice.get("SellerDtls", {})  # For purchases, this is the supplier
        buyer = raw_invoice.get("BuyerDtls", {})
        items = raw_invoice.get("ItemList", [])
        
        # Determine if interstate (IGST) or intrastate (CGST/SGST)
        igst_val = Decimal(str(val.get('IgstVal', 0)))
        is_interstate = igst_val > 0
        
        # Extract items
        processed_items = []
        for item in items:
            processed_items.append({
                "description": item.get("PrdDesc", ""),
                "hsn": item.get("HsnCd", ""),
                "quantity": float(item.get("Qty", 0)),
                "unit": item.get("Unit", ""),
                "rate": Decimal(str(item.get("UnitPrice", 0))),
                "taxable_amount": Decimal(str(item.get("AssAmt", 0))),
                "gst_rate": float(item.get("GstRt", 0)),
                "cgst": Decimal(str(item.get("CgstAmt", 0))),
                "sgst": Decimal(str(item.get("SgstAmt", 0))),
                "igst": Decimal(str(item.get("IgstAmt", 0))),
                "total": Decimal(str(item.get("TotItemVal", 0)))
            })
        
        return {
            "invoice_no": doc.get("No", ""),
            "invoice_date": doc.get("Dt", ""),
            "supplier": {
                "name": seller.get("LglNm", ""),
                "gstin": seller.get("Gstin", ""),
                "address": seller.get("Addr1", ""),
                "state_code": seller.get("Stcd", "")
            },
            "buyer": {
                "name": buyer.get("LglNm", ""),
                "gstin": buyer.get("Gstin", "")
            },
            "items": processed_items,
            "total_amount": Decimal(str(val.get("TotInvVal", 0))),
            "cgst": Decimal(str(val.get("CgstVal", 0))),
            "sgst": Decimal(str(val.get("SgstVal", 0))),
            "igst": Decimal(str(val.get("IgstVal", 0))),
            "is_interstate": is_interstate,
            "other_charges": Decimal(str(val.get("OthChrg", 0))),
            "round_off": Decimal(str(val.get("RndOffAmt", 0)))
        }
    
    
    def process_and_structure(self, json_data: List[Dict]) -> List[Dict]:
        """
        Complete processing: Decode JWT + Structure data.
        
        This is the main method you'll call from FastAPI endpoints.
        """
        raw_invoices = self.process_json_file(json_data)
        structured_invoices = []
        
        for raw_inv in raw_invoices:
            structured = self.extract_invoice_structure(raw_inv)
            structured_invoices.append(structured)
        
        return structured_invoices


# 🎓 MENTOR NOTE:
# - We separate concerns: JWT decoding vs data structuring
# - All Decimal conversions happen here for consistency
# - Error handling allows partial success (skip bad invoices)
# - The structured format matches your Pydantic schemas