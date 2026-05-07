"""
auth_routs.py — Authentication API routes.

ROUTES:
  POST /api/auth/signup      → create account + send email OTP
  POST /api/auth/login       → verify creds → JWT
  GET  /api/auth/me          → current user (protected)
  POST /api/auth/verify-otp  → verify 6-digit code from email
  POST /api/auth/resend-otp  → resend verification email
  GET  /api/auth/profile     → full profile (phone, dates, verification)
  PUT  /api/auth/profile     → update first_name, last_name, phone


"""

import os
from datetime import datetime, timedelta, timezone
from dotenv import load_dotenv
from fastapi import APIRouter, HTTPException, Depends
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from sqlalchemy.orm import Session
from sqlalchemy import text
from pydantic import BaseModel
from jose import JWTError, jwt

from argon2 import PasswordHasher
from argon2.exceptions import VerifyMismatchError, VerificationError, InvalidHashError

from ..core.database import get_db
from ..services.otp_service import OTPService
load_dotenv()
router = APIRouter(prefix="/api/auth", tags=["Auth"])

ph = PasswordHasher(time_cost=3, memory_cost=65536, parallelism=2)

SECRET_KEY         = os.getenv("JWT_SECRET", "einvoice-CHANGE-IN-PRODUCTION")
ALGORITHM          = "HS256"
TOKEN_EXPIRE_HOURS = int(os.getenv("JWT_EXPIRE_HOURS", "168"))

bearer = HTTPBearer()


# ── Schemas ───────────────────────────────────────────────────

class SignupRequest(BaseModel):
    email:      str
    password:   str
    first_name: str = ""
    last_name:  str = ""
    phone:      str = ""   # collected at signup, stored but NOT verified here


class LoginRequest(BaseModel):
    email:    str
    password: str


class OTPVerifyRequest(BaseModel):
    user_id: int
    otp:     str


class OTPResendRequest(BaseModel):
    user_id: int


class ProfileUpdateRequest(BaseModel):
    first_name: str = ""
    last_name:  str = ""
    phone:      str = ""


class AuthResponse(BaseModel):
    token:             str
    user_id:           int
    email:             str
    first_name:        str
    last_name:         str
    phone:             str  = ""
    is_email_verified: bool = False


# ── Password helpers ──────────────────────────────────────────

def hash_password(plain: str) -> str:
    return ph.hash(plain)


def verify_password(plain: str, hashed: str) -> bool:
    try:
        return ph.verify(hashed, plain)
    except VerifyMismatchError:
        return False
    except (VerificationError, InvalidHashError):
        return False


# ── JWT helpers ───────────────────────────────────────────────

def create_token(user_id: int, email: str) -> str:
    payload = {
        "sub":   str(user_id),
        "email": email,
        "exp":   datetime.now(timezone.utc) + timedelta(hours=TOKEN_EXPIRE_HOURS),
    }
    return jwt.encode(payload, SECRET_KEY, algorithm=ALGORITHM)


def decode_token(token: str) -> dict:
    try:
        return jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
    except JWTError:
        raise HTTPException(status_code=401, detail="Session expired. Please sign in again.")


# ── Auth dependency ───────────────────────────────────────────

def get_current_user(
    credentials: HTTPAuthorizationCredentials = Depends(bearer),
    db: Session = Depends(get_db),
) -> dict:
    payload = decode_token(credentials.credentials)
    user_id = int(payload["sub"])

    row = db.execute(text("""
        SELECT
            u.id, u.email, u.first_name, u.last_name,
            COALESCE(p.phone,             '')    AS phone,
            COALESCE(p.is_email_verified, false) AS is_email_verified,
            COALESCE(p.is_phone_verified, false) AS is_phone_verified
        FROM auth_user u
        LEFT JOIN user_userprofile p ON p.user_id = u.id
        WHERE u.id = :id
    """), {"id": user_id}).fetchone()

    if not row:
        raise HTTPException(status_code=401, detail="Account not found. Please sign up again.")

    return {
        "id":                row[0],
        "email":             row[1],
        "first_name":        row[2] or "",
        "last_name":         row[3] or "",
        "phone":             row[4],
        "is_email_verified": row[5],
        "is_phone_verified": row[6],
    }


# ── POST /api/auth/signup ─────────────────────────────────────

@router.post("/signup", response_model=AuthResponse, status_code=201)
def signup(req: SignupRequest, db: Session = Depends(get_db)):
    email = req.email.lower().strip()
    phone = req.phone.strip().replace(" ", "")

    if "@" not in email or "." not in email.split("@")[-1]:
        raise HTTPException(status_code=422, detail="Please enter a valid email address.")

    if db.execute(text("SELECT id FROM auth_user WHERE username = :e"), {"e": email}).fetchone():
        raise HTTPException(status_code=409, detail="An account with this email already exists. Please sign in instead.")

    if len(req.password) < 6:
        raise HTTPException(status_code=422, detail="Password must be at least 6 characters long.")

    now = datetime.now(timezone.utc)
    # CHECK IF USER EXISTS: Instead of just INSERT, use an upsert logic
    # This prevents multiple rows for the same "session"
    existing_user = db.execute(text("SELECT id FROM auth_user WHERE email = :e"), {"e": email}).fetchone()
    
    if existing_user:
        user_id = existing_user[0]
        # Update existing user instead of creating new
        db.execute(text("""
            UPDATE auth_user 
            SET password = :pw, first_name = :fn, last_name = :ln, last_login = NOW()
            WHERE id = :id
        """), {"pw": hash_password(req.password), "fn": req.first_name, "ln": req.last_name, "id": user_id})
    
    else:
        result = db.execute(text("""
            INSERT INTO auth_user
                (username, email, password, first_name, last_name,
                is_staff, is_active, is_superuser, date_joined, last_login)
            VALUES (:e, :e, :pw, :fn, :ln, false, true, false, :now, :now)
            RETURNING id
        """), {"e": email, "pw": hash_password(req.password),
            "fn": req.first_name.strip(), "ln": req.last_name.strip(), "now": now})
        user_id = result.fetchone()[0]
    db.commit()


    # Store phone in UserProfile immediately (OTP service also upserts it,
    # but we do it here first so phone is saved even if OTP send fails)
    db.execute(text("""
        INSERT INTO user_userprofile
            (user_id, phone, is_phone_verified, is_email_verified, created_at, updated_at)
        VALUES (:uid, :phone, false, false, NOW(), NOW())
        ON CONFLICT (user_id) DO UPDATE SET phone = :phone, updated_at = NOW()
    """), {"uid": user_id, "phone": phone})
    db.commit()

    otp_result = OTPService(db).send_otp(user_id, email)
    if not otp_result.get("sent"):
        print(f"[WARN] Email OTP failed for user {user_id}: {otp_result.get('reason')}")

    return AuthResponse(
        token=create_token(user_id, email),
        user_id=user_id, email=email,
        first_name=req.first_name.strip(), last_name=req.last_name.strip(),
        phone=phone, is_email_verified=False,
    )


# ── POST /api/auth/login ──────────────────────────────────────

@router.post("/login", response_model=AuthResponse)
def login(req: LoginRequest, db: Session = Depends(get_db)):
    email = req.email.lower().strip()

    row = db.execute(text("""
        SELECT u.id, u.email, u.password, u.first_name, u.last_name, u.is_active,
               COALESCE(p.phone,             '')    AS phone,
               COALESCE(p.is_email_verified, false) AS is_email_verified
        FROM auth_user u
        LEFT JOIN user_userprofile p ON p.user_id = u.id
        WHERE u.username = :e
    """), {"e": email}).fetchone()

    if not row:
        raise HTTPException(status_code=401, detail="No account found with this email. Please check or create a new account.")

    user_id, db_email, hashed_pw, fn, ln, is_active, phone, is_email_verified = row

    if not is_active:
        raise HTTPException(status_code=403, detail="This account has been deactivated. Please contact support.")

    if not verify_password(req.password, hashed_pw):
        raise HTTPException(status_code=401, detail="Incorrect password. Please try again.")

    db.execute(text("UPDATE auth_user SET last_login = :now WHERE id = :id"),
               {"now": datetime.now(timezone.utc), "id": user_id})
    db.commit()

    return AuthResponse(
        token=create_token(user_id, db_email),
        user_id=user_id, email=db_email,
        first_name=fn or "", last_name=ln or "",
        phone=phone, is_email_verified=is_email_verified,
    )


# ── GET /api/auth/me ──────────────────────────────────────────

@router.get("/me")
def me(current_user: dict = Depends(get_current_user)):
    return current_user


# ── GET /api/auth/profile ─────────────────────────────────────

@router.get("/profile")
def get_profile(current_user: dict = Depends(get_current_user), db: Session = Depends(get_db)):
    """
    Full profile for the Profile sidebar page.
    Returns all user info + account metadata (join date, last login).
    """
    row = db.execute(text("""
        SELECT
            u.id, u.email, u.first_name, u.last_name,
            u.date_joined, u.last_login,
            COALESCE(p.phone,             '')    AS phone,
            COALESCE(p.is_email_verified, false) AS is_email_verified,
            COALESCE(p.is_phone_verified, false) AS is_phone_verified
        FROM auth_user u
        LEFT JOIN user_userprofile p ON p.user_id = u.id
        WHERE u.id = :id
    """), {"id": current_user["id"]}).fetchone()

    if not row:
        raise HTTPException(status_code=404, detail="Profile not found.")

    return {
        "id":                row[0],
        "email":             row[1],
        "first_name":        row[2] or "",
        "last_name":         row[3] or "",
        "date_joined":       row[4].isoformat() if row[4] else None,
        "last_login":        row[5].isoformat() if row[5] else None,
        "phone":             row[6],
        "is_email_verified": row[7],
        "is_phone_verified": row[8],
    }


# ── PUT /api/auth/profile ─────────────────────────────────────

@router.put("/profile")
def update_profile(
    req: ProfileUpdateRequest,
    current_user: dict = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """
    Update first_name, last_name, phone.
    If phone changes → is_phone_verified resets to false.
    Email cannot be changed here.
    """
    user_id = current_user["id"]
    phone   = req.phone.strip().replace(" ", "")

    db.execute(text("UPDATE auth_user SET first_name = :fn, last_name = :ln WHERE id = :id"),
               {"fn": req.first_name.strip(), "ln": req.last_name.strip(), "id": user_id})

    old = db.execute(text("SELECT phone FROM user_userprofile WHERE user_id = :id"),
                     {"id": user_id}).fetchone()
    phone_changed = bool(old and (old[0] or "").strip() != phone)

    db.execute(text("""
        INSERT INTO user_userprofile
            (user_id, phone, is_phone_verified, is_email_verified, created_at, updated_at)
        VALUES (:uid, :phone, false, false, NOW(), NOW())
        ON CONFLICT (user_id) DO UPDATE
            SET phone             = :phone,
                is_phone_verified = CASE WHEN :changed
                                         THEN false
                                         ELSE user_userprofile.is_phone_verified END,
                updated_at        = NOW()
    """), {"uid": user_id, "phone": phone, "changed": phone_changed})
    db.commit()

    return {
        "updated":    True,
        "first_name": req.first_name.strip(),
        "last_name":  req.last_name.strip(),
        "phone":      phone,
        "message":    "Profile updated successfully.",
    }


# ── POST /api/auth/verify-otp ─────────────────────────────────

@router.post("/verify-otp")
def verify_otp(req: OTPVerifyRequest, db: Session = Depends(get_db)):
    user_row = db.execute(text("SELECT id, email FROM auth_user WHERE id = :id"),
                          {"id": req.user_id}).fetchone()
    if not user_row:
        raise HTTPException(status_code=400, detail="Invalid request. Please sign up again.")

    result = OTPService(db).verify_otp(req.user_id, req.otp)
    if not result["verified"]:
        raise HTTPException(status_code=400, detail=result.get("reason", "Verification failed."))

    return {"verified": True, "user_id": req.user_id, "email": user_row[1],
            "message": "Email verified successfully! You are now signed in."}


# ── POST /api/auth/resend-otp ─────────────────────────────────

@router.post("/resend-otp")
def resend_otp(req: OTPResendRequest, db: Session = Depends(get_db)):
    user_row = db.execute(text("SELECT id, email FROM auth_user WHERE id = :id"),
                          {"id": req.user_id}).fetchone()
    if not user_row:
        raise HTTPException(status_code=400, detail="Invalid request.")

    result = OTPService(db).resend_otp(req.user_id, user_row[1])
    if not result.get("sent"):
        raise HTTPException(status_code=400, detail=result.get("reason", "Could not send email."))

    return {"sent": True, "dev_mode": result.get("dev_mode", False),
            "message": f"A new code was sent to {user_row[1]}."}