"""
Settings API Routes — Persist user settings + invoice state to DB.

PROBLEM SOLVED:
  sessionStorage dies on logout/tab close.
  We now save everything to the DB per user, restore on login.

ENDPOINTS:
  GET  /api/settings/            → load all saved settings
  POST /api/settings/save        → save ledger config + rate-wise + voucher types
  GET  /api/settings/invoices    → load saved invoice list for this user
  POST /api/settings/invoices    → save current invoice list
  DELETE /api/settings/invoices  → clear saved invoices
  POST /api/companies/{id}/refresh-masters → re-fetch Tally masters without reconnect

DB TABLE (auto-created SQL below):
  CREATE TABLE IF NOT EXISTS user_settings (
      id          SERIAL PRIMARY KEY,
      user_id     INTEGER NOT NULL UNIQUE REFERENCES auth_user(id) ON DELETE CASCADE,
      ledger_config     JSONB DEFAULT '{}',
      rate_wise_ledgers JSONB DEFAULT '{}',
      voucher_types     JSONB DEFAULT '{}',
      invoices          JSONB DEFAULT '[]',
      mapping_status    JSONB DEFAULT '{}',
      updated_at  TIMESTAMPTZ DEFAULT NOW()
  );
"""

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from sqlalchemy import text
from pydantic import BaseModel
from typing import Any, Dict, List, Optional
import json

from ..core.database import get_db
from ..services.tally_connector import TallyConnectorService, TallyConnectionError
from .auth_routs import get_current_user

router = APIRouter(prefix="/api/settings", tags=["Settings"])


# ── Pydantic models ────────────────────────────────────────────

class SaveSettingsRequest(BaseModel):
    company_id : int
    ledger_config:     Optional[Dict[str, Any]] = None
    rate_wise_ledgers: Optional[Dict[str, Any]] = None
    voucher_types:     Optional[Dict[str, Any]] = None


class SaveInvoicesRequest(BaseModel):
    company_id : int
    invoices:       List[Any] = []
    mapping_status: Dict[str, Any] = {}


# ── DB helper ──────────────────────────────────────────────────
def _upsert_field(db: Session, user_id: int, company_id : int,field: str, value: Any):
    """Upsert a single JSONB column while satisfying NOT NULL constraints."""
    val_json = json.dumps(value)
    
    # We provide default empty JSON '{}' or '[]' for all columns 
    # to satisfy the NOT NULL constraint on initial INSERT.
    query = text(f"""
        INSERT INTO user_settings (
            user_id, 
            company_id,
            ledger_config, 
            rate_wise_ledgers, 
            voucher_types, 
            invoices, 
            mapping_status, 
            updated_at
        )
        VALUES (
            :uid, 
            :cid,
            '{{}}'::jsonb, 
            '{{}}'::jsonb, 
            '{{}}'::jsonb, 
            '[]'::jsonb, 
            '{{}}'::jsonb, 
            NOW()
        )
        ON CONFLICT (user_id,company_id) DO UPDATE
            SET {field} = CAST(:val AS JSONB), 
                updated_at = NOW()
    """)
    
    db.execute(query, {"uid": user_id, "cid":company_id, "val": val_json})
    db.commit()


def _get_row(db: Session, user_id: int, company_id : int) -> dict:
    row = db.execute(text("""
        SELECT ledger_config, rate_wise_ledgers, voucher_types, invoices, mapping_status
        FROM user_settings WHERE user_id = :uid AND company_id= :cid
    """), {"uid": user_id, "cid":company_id}).fetchone()
    if not row:
        return {
            "ledger_config":     {},
            "rate_wise_ledgers": {},
            "voucher_types":     {"purchase": ["Purchase"], "sales": ["Sales"], "journal": ["Journal"]},
            "invoices":          [],
            "mapping_status":    {},
        }
    return {
        "ledger_config":     row[0] or {},
        "rate_wise_ledgers": row[1] or {},
        "voucher_types":     row[2] or {"purchase": ["Purchase"], "sales": ["Sales"], "journal": ["Journal"]},
        "invoices":          row[3] or [],
        "mapping_status":    row[4] or {},
    }


# ── GET /api/settings/ ─────────────────────────────────────────

@router.get("/")
def load_settings(
    company_id : int,
    current_user: dict = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """
    Load all settings for this user on login.
    Frontend calls this once after authentication to restore full state.
    """

    data = _get_row(db, current_user["id"], company_id)
    return {
        "ok": True,
        **data,
        "message": "Settings loaded",
    }


# ── POST /api/settings/save ────────────────────────────────────

@router.post("/save")
def save_settings(
    req: SaveSettingsRequest,
    current_user: dict = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """
    Save ledger config + rate-wise + voucher types.
    Called when user clicks 'Save Settings' in Settings page.
    Each field is optional — only provided fields are updated.
    """
    
    uid = current_user["id"]
    cid = req.company_id
    if req.ledger_config is not None:
        _upsert_field(db, uid,cid, "ledger_config", req.ledger_config)
    if req.rate_wise_ledgers is not None:
        _upsert_field(db, uid,cid, "rate_wise_ledgers", req.rate_wise_ledgers)
    if req.voucher_types is not None:
        _upsert_field(db, uid,cid, "voucher_types", req.voucher_types)

    return {"ok": True, "message": "Settings saved successfully"}


# ── GET /api/settings/invoices ─────────────────────────────────

@router.get("/invoices")
def load_invoices(
    company_id : int,
    current_user: dict = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """
    Restore previously uploaded invoices + mapping status after login.
    So the user doesn't have to re-upload the JSON file every session.
    """

    data = _get_row(db, current_user["id"],company_id)
    return {
        "ok":             True,
        "invoices":       data["invoices"],
        "mapping_status": data["mapping_status"],
        "count":          len(data["invoices"]),
    }


# ── POST /api/settings/invoices ────────────────────────────────

@router.post("/invoices")
def save_invoices(
    req: SaveInvoicesRequest,
    current_user: dict = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    uid = current_user["id"]
    cid = req.company_id
    inv_json = json.dumps(req.invoices)
    status_json = json.dumps(req.mapping_status)

    query = text("""
        INSERT INTO user_settings (
            user_id,company_id, ledger_config, rate_wise_ledgers, voucher_types, 
            invoices, mapping_status, updated_at
        )
        VALUES (
            :uid, :cid, '{}'::jsonb, '{}'::jsonb, '{}'::jsonb, 
            CAST(:inv AS JSONB), CAST(:st AS JSONB), NOW()
        )
        ON CONFLICT (user_id, company_id) DO UPDATE
            SET invoices = EXCLUDED.invoices,
                mapping_status = EXCLUDED.mapping_status,
                updated_at = NOW()
    """)

    db.execute(query, {"uid": uid,"cid":cid, "inv": inv_json, "st": status_json})
    db.commit()
    return {"ok": True, "message": "Invoices saved"}

# ── DELETE /api/settings/invoices ──────────────────────────────

@router.delete("/invoices")
def clear_invoices(
    company_id : int,
    current_user: dict = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Clear saved invoices for this user (explicit 'Start Fresh' action)."""

    db.execute(text("""
    UPDATE user_settings
    SET invoices = '[]'::jsonb, mapping_status = '{}'::jsonb, updated_at = NOW()
    WHERE user_id = :uid AND company_id = :cid
"""), {"uid": current_user["id"], "cid": company_id})
    db.commit()
    return {"ok": True, "message": "Invoices cleared"}