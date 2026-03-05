"""
Companies Routes - CRUD for TallyCompany tied to logged-in user.

Routes:
    GET  /api/companies/             → list all companies for current user
    POST /api/companies/connect      → connect to Tally + save company to DB
    POST /api/companies/{id}/refresh → refresh masters (ledgers/items/units) without reconnect
    DELETE /api/companies/{id}       → disconnect (delete from DB)
"""

from fastapi import APIRouter, HTTPException, Depends, Body
from sqlalchemy.orm import Session
from sqlalchemy import text

from ..core.database import get_db
from ..services.tally_connector import TallyConnectorService, TallyConnectionError
from .auth_routs import get_current_user

router = APIRouter(prefix="/api/companies", tags=["Companies"])


@router.get("/")
def get_user_companies(
    current_user: dict = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    rows = db.execute(
        text("""
            SELECT id, company_name, connected_at
            FROM companies_tallycompany
            WHERE user_id = :user_id
            ORDER BY connected_at DESC
        """),
        {"user_id": current_user["id"]},
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
    db: Session = Depends(get_db),
):
    """
    1. Fetch masters from Tally (ledgers, stock_items, units)
    2. Upsert company row in DB
    3. Return full company object + masters to frontend
    """
    try:
        masters = TallyConnectorService().fetch_all_masters(company_name)
    except TallyConnectionError as e:
        raise HTTPException(status_code=503, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Tally error: {str(e)}")

    result = db.execute(
        text("""
            INSERT INTO companies_tallycompany (user_id, company_name, connected_at)
            VALUES (:user_id, :company_name, NOW())
            ON CONFLICT (user_id, company_name)
            DO UPDATE SET connected_at = NOW()
            RETURNING id, company_name, connected_at
        """),
        {"user_id": current_user["id"], "company_name": company_name},
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


@router.post("/{company_id}/refresh")
async def refresh_company_masters(
    company_id: int,
    current_user: dict = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """
    Re-fetch Tally masters (ledgers, stock_items, units) for an already-connected company.
    Use this when you add new items/ledgers in Tally WITHOUT needing to fully reconnect.
    Returns the fresh masters so frontend can merge them into AppState.
    """
    # Verify company belongs to this user
    row = db.execute(
        text("""
            SELECT id, company_name FROM companies_tallycompany
            WHERE id = :id AND user_id = :user_id
        """),
        {"id": company_id, "user_id": current_user["id"]},
    ).fetchone()

    if not row:
        raise HTTPException(status_code=404, detail="Company not found or access denied")

    company_name = row[1]

    try:
        masters = TallyConnectorService().fetch_all_masters(company_name)
    except TallyConnectionError as e:
        raise HTTPException(status_code=503, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Tally refresh error: {str(e)}")

    # Update connected_at timestamp to mark fresh sync
    db.execute(
        text("UPDATE companies_tallycompany SET connected_at = NOW() WHERE id = :id"),
        {"id": company_id},
    )
    db.commit()

    return {
        "id":           company_id,
        "company_name": company_name,
        "ledgers":      masters["ledgers"],
        "stock_items":  masters["stock_items"],
        "units":        masters["units"],
        "refreshed":    True,
        "message":      f"Masters refreshed for {company_name} — {len(masters['stock_items'])} items, {len(masters['ledgers'])} ledgers",
    }


@router.delete("/{company_id}")
def disconnect_company(
    company_id: int,
    current_user: dict = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    result = db.execute(
        text("""
            DELETE FROM companies_tallycompany
            WHERE id = :id AND user_id = :user_id
            RETURNING id
        """),
        {"id": company_id, "user_id": current_user["id"]},
    )
    db.commit()
    if not result.fetchone():
        raise HTTPException(status_code=404, detail="Company not found")
    return {"message": "Company disconnected"}