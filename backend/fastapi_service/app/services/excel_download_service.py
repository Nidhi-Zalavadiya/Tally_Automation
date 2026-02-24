import pandas as pd
from io import BytesIO
from typing import List, Dict

class ExcelService:
    @staticmethod
    def generate_invoice_excel(invoices: List[Dict]) -> BytesIO:
        """
        Flattens invoice JSON data and generates an Excel file in memory.
        """
        flattened_data = []

        for inv in invoices:
            invoice_no = inv.get("invoice_no")
            date = inv.get("invoice_date")
            supplier_name = inv.get("supplier", {}).get("name")
            
            # Create a row for every item to ensure all data is captured
            for item in inv.get("items", []):
                row = {
                    "Invoice No": invoice_no,
                    "Date": date,
                    "Supplier": supplier_name,
                    "Item Description": item.get("description"),
                    "HSN": item.get("hsn"),
                    "Quantity": item.get("quantity"),
                    "Unit": item.get("unit"),
                    "Rate": item.get("rate"),
                    "Taxable Value": item.get("taxable_amount"),
                    "GST %": item.get("gst_rate"),
                    "CGST": item.get("cgst"),
                    "SGST": item.get("sgst"),
                    "IGST": item.get("igst"),
                    "Total Item Amount": item.get("total"),
                    "Full Invoice Total": inv.get("total_amount")
                }
                flattened_data.append(row)

        # Create DataFrame
        df = pd.DataFrame(flattened_data)

        # Save to BytesIO buffer
        output = BytesIO()
        with pd.ExcelWriter(output, engine='openpyxl') as writer:
            df.to_excel(writer, index=False, sheet_name='Invoices Export')
        
        output.seek(0)
        return output