"""
Mapping Service - Handles product mapping and smart suggestions.

This service:
1. Saves user mappings to Django's ProductMapping table
2. Suggests mappings based on history
3. Provides fuzzy matching for similar products
"""

from sqlalchemy.orm import Session
from sqlalchemy import text
from typing import Optional, Dict, List
from difflib import SequenceMatcher
from decimal import Decimal


class MappingService:
    """
    Service for managing product mappings between JSON and Tally.
    
    Methods:
        - get_mapping: Check if mapping exists
        - save_mapping: Save new mapping to DB
        - suggest_mapping: Smart suggestion algorithm
        - get_all_mappings: Get all mappings for a company
    """
    
    def __init__(self, db: Session):
        self.db = db
    
    
    def get_mapping(self, company_id: int, json_description: str) -> Optional[Dict]:
        """
        Check if mapping already exists for this product.
        
        Args:
            company_id: TallyCompany ID
            json_description: Product description from JSON
        
        Returns:
            Mapping dict if found, None otherwise
        """
        query = text("""
            SELECT 
                id, 
                company_id, 
                json_description, 
                tally_item_name,
                last_sales_rate,
                alt_unit
            FROM companies_productmapping
            WHERE company_id = :company_id 
            AND json_description = :json_description
        """)
        
        result = self.db.execute(
            query, 
            {"company_id": company_id, "json_description": json_description}
        ).fetchone()
        
        if result:
            return {
                "id": result[0],
                "company_id": result[1],
                "json_description": result[2],
                "tally_item_name": result[3],
                "last_sales_rate": result[4],
                "alt_unit": result[5]
            }
        
        return None
    
    
    def save_mapping(
        self, 
        company_id: int, 
        json_description: str, 
        tally_item_name: str,
        last_sales_rate: Optional[Decimal] = None,
        alt_unit: Optional[str] = None
    ) -> Dict:
        """
        Save a new mapping or update existing one.
        
        Uses INSERT ... ON CONFLICT (PostgreSQL upsert) to handle duplicates.
        """
        query = text("""
            INSERT INTO companies_productmapping 
                (company_id, json_description, tally_item_name, last_sales_rate, alt_unit, updated_at)
            VALUES 
                (:company_id, :json_description, :tally_item_name, :last_sales_rate, :alt_unit, NOW())
            ON CONFLICT (company_id, json_description) 
            DO UPDATE SET
                tally_item_name = EXCLUDED.tally_item_name,
                last_sales_rate = EXCLUDED.last_sales_rate,
                alt_unit = EXCLUDED.alt_unit,
                updated_at = NOW()
            RETURNING id, company_id, json_description, tally_item_name
        """)
        
        result = self.db.execute(query, {
            "company_id": company_id,
            "json_description": json_description,
            "tally_item_name": tally_item_name,
            "last_sales_rate": last_sales_rate,
            "alt_unit": alt_unit
        })
        
        self.db.commit()
        
        row = result.fetchone()
        return {
            "id": row[0],
            "company_id": row[1],
            "json_description": row[2],
            "tally_item_name": row[3]
        }
    
    
    def suggest_mapping(
        self, 
        company_id: int, 
        json_description: str,
        tally_items: List[str]
    ) -> Dict:
        """
        Smart suggestion algorithm:
        1. Check exact match in history
        2. Try fuzzy matching with similar descriptions
        3. Check if JSON description exists in Tally items
        4. Return best guess with confidence score
        """
        
        # 1. Check exact match in mapping history
        existing = self.get_mapping(company_id, json_description)
        if existing:
            return {
                "suggested_item": existing["tally_item_name"],
                "confidence": 1.0,
                "source": "exact_match"
            }
        
        # 2. Fuzzy match with existing mappings
        fuzzy_match = self._find_fuzzy_match(company_id, json_description)
        if fuzzy_match:
            return fuzzy_match
        
        # 3. Check if JSON description exists as-is in Tally items
        for tally_item in tally_items:
            if tally_item.lower() == json_description.lower():
                return {
                    "suggested_item": tally_item,
                    "confidence": 0.9,
                    "source": "tally_exact"
                }
        
        # 4. No match found
        return {
            "suggested_item": None,
            "confidence": 0.0,
            "source": "none"
        }
    
    
    def _find_fuzzy_match(self, company_id: int, json_description: str) -> Optional[Dict]:
        """
        Find similar product descriptions using fuzzy string matching.
        """
        query = text("""
            SELECT json_description, tally_item_name
            FROM companies_productmapping
            WHERE company_id = :company_id
        """)
        
        results = self.db.execute(query, {"company_id": company_id}).fetchall()
        
        best_match = None
        best_ratio = 0.75  # Minimum 75% similarity
        
        for row in results:
            stored_desc = row[0]
            ratio = SequenceMatcher(None, json_description.lower(), stored_desc.lower()).ratio()
            
            if ratio > best_ratio:
                best_ratio = ratio
                best_match = row[1]  # tally_item_name
        
        if best_match:
            return {
                "suggested_item": best_match,
                "confidence": best_ratio,
                "source": "fuzzy_match"
            }
        
        return None
    
    
    def get_all_mappings(self, company_id: int) -> List[Dict]:
        """Get all saved mappings for a company"""
        query = text("""
            SELECT 
                id, 
                json_description, 
                tally_item_name, 
                last_sales_rate, 
                alt_unit
            FROM companies_productmapping
            WHERE company_id = :company_id
            ORDER BY updated_at DESC
        """)
        
        results = self.db.execute(query, {"company_id": company_id}).fetchall()
        
        return [
            {
                "id": row[0],
                "json_description": row[1],
                "tally_item_name": row[2],
                "last_sales_rate": row[3],
                "alt_unit": row[4]
            }
            for row in results
        ]
    
    
    def bulk_suggest(
        self, 
        company_id: int, 
        descriptions: List[str],
        tally_items: List[str]
    ) -> Dict[str, Dict]:
        """Get suggestions for multiple products at once."""
        suggestions = {}
        
        for desc in descriptions:
            suggestions[desc] = self.suggest_mapping(company_id, desc, tally_items)
        
        return suggestions