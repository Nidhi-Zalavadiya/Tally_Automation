"""
Companies Routes - CRUD for TallyCompany tied to logged-in user.

Routes:
    GET  /api/companies          → list all companies for current user
    POST /api/companies/connect  → connect to Tally + save company to DB
    DELETE /api/companies/:id    → disconnect (delete from DB)
"""

from fastapi import APIRouter, HTTPException, Depends, Body
from sqlalchemy.orm import Session
from sqlalchemy import text
from typing import List

from ..core.database import get_db
from ..services.tally_connector import TallyConnectorService, TallyConnectionError
from .auth_routs import get_current_user

router = APIRouter(prefix="/api/companies", tags=["Companies"])


@router.get("/")
def get_user_companies(
    current_user: dict = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """
    Return all TallyCompany rows for the logged-in user.
    Frontend uses this to populate the dashboard KPIs.
    """
    rows = db.execute(
        text("""
            SELECT id, company_name, connected_at
            FROM companies_tallycompany
            WHERE user_id = :user_id
            ORDER BY connected_at DESC
        """),
        {"user_id": current_user["id"]}
    ).fetchall()

    return {
        "companies": [
            {
                "id":           r[0],
                "company_name": r[1],
                "connected_at": r[2].isoformat() if r[2] else None,
            }
            for r in rows
        ]
    }


@router.post("/connect")
async def connect_company(
    company_name: str = Body(..., embed=True),
    current_user: dict = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """
    1. Connect to Tally and fetch masters (ledgers, stock_items, units)
    2. Upsert company into companies_tallycompany table
    3. Return masters + company DB id to frontend
    """
    try:
        tally_service = TallyConnectorService()
        masters = tally_service.fetch_all_masters(company_name)
    except TallyConnectionError as e:
        raise HTTPException(status_code=503, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Tally error: {str(e)}")

    # Upsert company (unique_together = user + company_name)
    result = db.execute(
        text("""
            INSERT INTO companies_tallycompany (user_id, company_name, connected_at)
            VALUES (:user_id, :company_name, NOW())
            ON CONFLICT (user_id, company_name)
            DO UPDATE SET connected_at = NOW()
            RETURNING id, company_name, connected_at
        """),
        {"user_id": current_user["id"], "company_name": company_name}
    )
    db.commit()
    row = result.fetchone()

    return {
        "id":           row[0],
        "company_name": row[1],
        "connected_at": row[2].isoformat(),
        "ledgers":      masters["ledgers"],
        "stock_items":  masters["stock_items"],
        "units":        masters["units"],
        "message":      f"Connected to {company_name}",
    }


@router.delete("/{company_id}")
def disconnect_company(
    company_id: int,
    current_user: dict = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Remove company — only if it belongs to the current user."""
    result = db.execute(
        text("""
            DELETE FROM companies_tallycompany
            WHERE id = :id AND user_id = :user_id
            RETURNING id
        """),
        {"id": company_id, "user_id": current_user["id"]}
    )
    db.commit()

    if not result.fetchone():
        raise HTTPException(status_code=404, detail="Company not found")

    return {"message": "Company disconnected"}