"""
Tally Connector Service - Handles all Tally XML communication.

This is your existing tally_connector.py refactored for FastAPI.
All the core logic remains the same, just organized better.
"""

import requests
import xml.etree.ElementTree as ET
import re
from typing import List, Dict, Optional
from decimal import Decimal

TALLY_URL = "http://localhost:9000"
TIMEOUT = 15


class TallyConnectionError(Exception):
    """Raised when Tally connection fails"""
    pass


class TallyXMLParseError(Exception):
    """Raised when XML parsing fails"""
    pass


class TallyConnectorService:
    """
    Service class for all Tally operations.
    
    Methods:
        - fetch_all_masters: Get ledgers, stock items, units
        - fetch_item_details: Get specific item's rate, MRP, unit
        - send_voucher: Send purchase voucher to Tally
    """
    
    def __init__(self, tally_url: str = TALLY_URL):
        self.tally_url = tally_url
    
    
    def _send_request(self, xml_request: str) -> str:
        """
        Send XML request to Tally and return response.
        
        Raises:
            TallyConnectionError: If Tally is not running or connection fails
        """
        try:
            response = requests.post(
                self.tally_url,
                data=xml_request.encode("utf-8"),
                headers={"Content-Type": "application/xml"},
                timeout=TIMEOUT
            )
            response.raise_for_status()
            return response.text
        except requests.exceptions.ConnectionError:
            raise TallyConnectionError(
                f"Cannot connect to Tally at {self.tally_url}. "
                "Make sure Tally Prime is running with ODBC enabled on port 9000."
            )
        except requests.exceptions.Timeout:
            raise TallyConnectionError("Tally request timed out")
        except Exception as e:
            raise TallyConnectionError(f"Tally communication error: {str(e)}")
    
    
    @staticmethod
    def _sanitize_xml(xml_text: str) -> str:
        """
        Clean Tally XML response (removes invalid characters).
        
        Your original regex logic - works perfectly!
        """
        if not xml_text:
            return ""
        
        # Remove numeric character references like &#4;
        xml_text = re.sub(r"&#\d+;", "", xml_text)
        
        # Remove non-printable control characters
        xml_text = re.sub(r"[\x00-\x08\x0B\x0C\x0E-\x1F]", "", xml_text)
        
        # Replace Tally-specific symbols
        xml_text = xml_text.replace("Requested Data not found", "")
        xml_text = xml_text.replace("₹", "INR")
        
        # Extract only the first <ENVELOPE> block
        match = re.search(r'(<ENVELOPE>.*?</ENVELOPE>)', xml_text, re.DOTALL)
        if match:
            return match.group(1)
        
        return xml_text
    
    
    def fetch_all_masters(self, company_name: str) -> Dict[str, List]:
        """
        Fetch all Tally masters (Ledgers, Stock Items, Units).
        
        Returns:
            {
                "ledgers": [...],
                "stock_items": [...],
                "units": [...]
            }
        """
        xml_request = f"""
<ENVELOPE>
    <HEADER>
        <VERSION>1</VERSION>
        <TALLYREQUEST>Export</TALLYREQUEST>
        <TYPE>Data</TYPE>
        <ID>List of Accounts</ID>
    </HEADER>
    <BODY>
        <DESC>
            <STATICVARIABLES>
                <SVCURRENTCOMPANY>{company_name}</SVCURRENTCOMPANY>
                <SVEXPORTFORMAT>$$SysName:XML</SVEXPORTFORMAT>
                <ACCOUNTTYPE>All Masters</ACCOUNTTYPE>
            </STATICVARIABLES>
        </DESC>
    </BODY>
</ENVELOPE>
"""
        xml_response = self._send_request(xml_request)
        sanitized_xml = self._sanitize_xml(xml_response)
        
        return {
            "ledgers": self._extract_ledgers(sanitized_xml),
            "stock_items": self._extract_stock_items(sanitized_xml),
            "units": self._extract_units(sanitized_xml)
        }
    
    
    def _extract_ledgers(self, xml_text: str) -> List[str]:
        """Extract ledger names from Tally XML"""
        try:
            root = ET.fromstring(xml_text)
            ledgers = []
            for ledger in root.findall(".//LEDGER"):
                name = ledger.get("NAME") or ledger.findtext("NAME")
                if name:
                    ledgers.append(name.strip())
            return sorted(list(set(ledgers)))
        except ET.ParseError as e:
            raise TallyXMLParseError(f"Failed to parse ledgers: {str(e)}")
    
    
    def _extract_stock_items(self, xml_text: str) -> List[str]:
        """Extract stock item names from Tally XML"""
        try:
            root = ET.fromstring(xml_text)
            items = []
            for item in root.findall(".//STOCKITEM"):
                name = item.get("NAME") or item.findtext("NAME")
                if name:
                    items.append(name.strip())
            return sorted(list(set(items)))
        except ET.ParseError as e:
            raise TallyXMLParseError(f"Failed to parse stock items: {str(e)}")
    
    
    def _extract_units(self, xml_text: str) -> List[str]:
        """Extract unit names from Tally XML"""
        try:
            root = ET.fromstring(xml_text)
            units = []
            for unit in root.findall(".//UNIT"):
                name = unit.get("NAME") or unit.findtext("NAME")
                if name:
                    units.append(name.strip())
            return sorted(list(set(units)))
        except ET.ParseError:
            return []
    
    
    def fetch_item_details(self, item_name: str, company_name: str) -> Dict:
        """
        Fetch specific item's rate, MRP, and unit from Tally.
        
        Your original fetch_item_details() logic.
        """
        xml_request = f"""
<ENVELOPE>
    <HEADER>
        <VERSION>1</VERSION>
        <TALLYREQUEST>Export</TALLYREQUEST>
        <TYPE>Data</TYPE>
        <ID>Stock Item Details</ID>
    </HEADER>
    <BODY>
        <DESC>
            <STATICVARIABLES>
                <SVCURRENTCOMPANY>{company_name}</SVCURRENTCOMPANY>
                <SVEXPORTFORMAT>$$SysName:XML</SVEXPORTFORMAT>
            </STATICVARIABLES>
            <TDL>
                <TDLMESSAGE>
                    <REPORT NAME="Stock Item Details">
                        <FORMS>Stock Item Form</FORMS>
                    </REPORT>
                    <FORMS NAME="Stock Item Form">
                        <PARTS>Stock Item Part</PARTS>
                    </FORMS>
                    <PARTS NAME="Stock Item Part">
                        <LINES>Stock Item Line</LINES>
                    </PARTS>
                    <LINES NAME="Stock Item Line">
                        <FIELDS>ItemName, LastRate, BaseUnit, ItemMRP</FIELDS>
                    </LINES>
                    <FIELDS NAME="ItemName"><SET>$Name</SET></FIELDS>
                    <FIELDS NAME="LastRate"><SET>$FullLastSalesRate</SET></FIELDS>
                    <FIELDS NAME="BaseUnit"><SET>$BaseUnits</SET></FIELDS>
                    <FIELDS NAME="ItemMRP"><SET>$MRPDetails.1.MRPValue</SET></FIELDS>
                    
                    <OBJECT NAME="Stock Item" OBJECT="{item_name}">
                    </OBJECT>
                </TDLMESSAGE>
            </TDL>
        </DESC>
    </BODY>
</ENVELOPE>
"""
        try:
            xml_response = self._send_request(xml_request)
            sanitized_xml = self._sanitize_xml(xml_response)
            root = ET.fromstring(sanitized_xml)
            
            # Parse the response
            rate = "0.00"
            unit = "N/A"
            mrp = "0.00"
            
            for item in root.findall(".//STOCKITEM"):
                rate_val = item.findtext("FULLLASTSALESRATE") or "0.00"
                rate = rate_val.split('/')[0].strip() if '/' in rate_val else rate_val
                unit = item.findtext("BASEUNITS") or "N/A"
                mrp = item.findtext("MRPVALUE") or "0.00"
            
            return {
                "name": item_name,
                "rate": rate,
                "unit": unit,
                "mrp": mrp
            }
        
        except Exception as e:
            return {
                "name": item_name,
                "rate": "0.00",
                "unit": "Error",
                "mrp": "0.00"
            }
    
    
    def send_voucher(self, xml_voucher: str) -> bool:
        """
        Send purchase voucher XML to Tally for import.
        
        Returns:
            True if successful, False otherwise
        """
        try:
            response = self._send_request(xml_voucher)
            # Tally returns success indicator in response
            return "created" in response.lower() or "imported" in response.lower()
        except Exception:
            return False


# 🎓 MENTOR NOTE:
# - This class encapsulates all Tally communication
# - We use class methods to organize related functionality
# - Error handling is centralized with custom exceptions
# - All your original logic is preserved, just better structured