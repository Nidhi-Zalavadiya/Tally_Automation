"""
otp_service.py — Email OTP generation, storage & verification.

TABLES:
  user_userprofile  → user_id, phone, is_phone_verified, is_email_verified, created_at, updated_at
  user_otpattempt   → profile_id (FK), otp_code, attempt_type, created_at, expires_at, is_used

FLOW:
  1. signup()         → send_otp(user_id, email)
  2. send_otp()       → upsert UserProfile → INSERT OTPAttempt → send email
  3. verify_otp()     → find latest unused+valid attempt → check code
                      → mark is_used=True + is_email_verified=True
  4. resend_otp()     → fetch email from auth_user → call send_otp() again

EMAIL PROVIDER: SMTP  (Gmail / Outlook / SendGrid / any SMTP)
  No Twilio, no SMS, no phone number needed.

ENV VARS (.env):
  OTP_DEV_MODE=true           → prints code to terminal, NO real email sent
  OTP_EXPIRE_MINUTES=10       → how long OTP is valid
  OTP_MAX_PER_HOUR=5          → rate-limit: max sends per hour per user
  SMTP_HOST=smtp.gmail.com
  SMTP_PORT=587
  SMTP_USER=you@gmail.com
  SMTP_PASSWORD=your-app-password   ← Gmail: create an "App Password" in Google Account
  SMTP_FROM_NAME=EInvoice Pro

HOW TO GET GMAIL APP PASSWORD:
  1. Google Account → Security → 2-Step Verification → ON
  2. Google Account → Security → App Passwords
  3. Create one for "Mail" → copy the 16-char password
  4. Paste it as SMTP_PASSWORD in .env
"""

import os
import random
import string
import smtplib
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText
from datetime import datetime, timedelta, timezone

from sqlalchemy.orm import Session
from sqlalchemy import text
from dotenv import load_dotenv



# ── Config ────────────────────────────────────────────────────

load_dotenv()
OTP_DEV_MODE       = os.getenv("OTP_DEV_MODE",       "false").lower() == "true"
OTP_EXPIRE_MINUTES = int(os.getenv("OTP_EXPIRE_MINUTES", "10"))
OTP_MAX_PER_HOUR   = int(os.getenv("OTP_MAX_PER_HOUR",   "5"))

SMTP_HOST      = os.getenv("SMTP_HOST",      "smtp.gmail.com")
SMTP_PORT      = int(os.getenv("SMTP_PORT",  "587"))
SMTP_USER      = os.getenv("SMTP_USER",      "")
SMTP_PASSWORD  = os.getenv("SMTP_PASSWORD",  "")
SMTP_FROM_NAME = os.getenv("SMTP_FROM_NAME", "EInvoice Pro")


# ════════════════════════════════════════════════════════════════
# Private helpers
# ════════════════════════════════════════════════════════════════

def _generate_otp() -> str:
    """Return a secure random 6-digit string e.g. '482910'."""
    return "".join(random.choices(string.digits, k=6))


def _build_html(otp: str) -> str:
    """HTML email body — clean, professional, mobile-friendly."""
    return f"""<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f0f2f7;font-family:'Segoe UI',Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="padding:40px 16px;">
    <tr><td align="center">
      <table width="520" cellpadding="0" cellspacing="0"
             style="background:#fff;border-radius:16px;overflow:hidden;
                    box-shadow:0 4px 24px rgba(0,0,0,0.08);max-width:100%;">

        <!-- Header -->
        <tr>
          <td style="background:linear-gradient(135deg,#1e2536,#0f1117);
                     padding:32px 40px;text-align:center;">
            <div style="font-size:30px;margin-bottom:6px;">⚡</div>
            <div style="color:#fff;font-size:20px;font-weight:700;letter-spacing:-0.3px;">
              EInvoice Pro
            </div>
            <div style="color:#8b96ab;font-size:11px;text-transform:uppercase;
                        letter-spacing:1.2px;margin-top:4px;">
              Tally Integration Platform
            </div>
          </td>
        </tr>

        <!-- Body -->
        <tr>
          <td style="padding:40px 40px 32px;">
            <p style="margin:0 0 6px;color:#111827;font-size:22px;
                       font-weight:700;letter-spacing:-0.3px;">
              Verify your email address
            </p>
            <p style="margin:0 0 28px;color:#6b7280;font-size:14px;line-height:1.65;">
              Enter the code below to complete your signup. It expires in
              <strong>{OTP_EXPIRE_MINUTES} minutes</strong>.
            </p>

            <!-- OTP box -->
            <div style="background:#f0f4ff;border:2px solid #4f8ef7;
                        border-radius:12px;padding:24px;text-align:center;
                        margin-bottom:28px;">
              <div style="color:#4b5563;font-size:11px;text-transform:uppercase;
                          letter-spacing:1.8px;margin-bottom:10px;font-weight:600;">
                Your verification code
              </div>
              <div style="color:#0f1117;font-size:44px;font-weight:800;
                          letter-spacing:14px;font-family:'Courier New',monospace;">
                {otp}
              </div>
            </div>

            <p style="margin:0;color:#9ca3af;font-size:12.5px;line-height:1.75;">
              🔒 Do not share this code with anyone.<br>
              If you didn't sign up for EInvoice Pro, you can safely ignore this email.
            </p>
          </td>
        </tr>

        <!-- Footer -->
        <tr>
          <td style="background:#f9fafb;padding:20px 40px;
                     border-top:1px solid #e5e7eb;text-align:center;">
            <p style="margin:0;color:#9ca3af;font-size:11px;line-height:1.6;">
              © EInvoice Pro · Tally Integration Platform<br>
              This is an automated message — please do not reply.
            </p>
          </td>
        </tr>

      </table>
    </td></tr>
  </table>
</body>
</html>"""


def _send_email(to_email: str, otp: str) -> bool:
    """
    Send the OTP to the user's email address.

    DEV MODE  → prints OTP to terminal, returns True immediately.
    PROD MODE → connects to SMTP, sends HTML + plain-text email.

    Returns True on success, False on any failure (never raises).
    """
    if OTP_DEV_MODE:
        print(f"\n{'─' * 54}")
        print(f"  📧  EMAIL OTP  →  {to_email}")
        print(f"  Code  ›  [ {otp} ]")
        print(f"  Valid for {OTP_EXPIRE_MINUTES} minutes.")
        print(f"  (Set OTP_DEV_MODE=false in .env to send real email)")
        print(f"{'─' * 54}\n")
        return True

    if not SMTP_USER or not SMTP_PASSWORD:
        print("[OTP ERROR] SMTP_USER or SMTP_PASSWORD not set in .env")
        return False

    try:
        msg = MIMEMultipart("alternative")
        msg["Subject"] = f"{otp} — your EInvoice Pro verification code"
        msg["From"]    = f"{SMTP_FROM_NAME} <{SMTP_USER}>"
        msg["To"]      = to_email

        # Plain text fallback for email clients that don't render HTML
        plain = (
            f"Your EInvoice Pro email verification code is: {otp}\n"
            f"It is valid for {OTP_EXPIRE_MINUTES} minutes.\n"
            f"Do not share this code with anyone."
        )
        msg.attach(MIMEText(plain, "plain"))
        msg.attach(MIMEText(_build_html(otp), "html"))

        with smtplib.SMTP(SMTP_HOST, SMTP_PORT, timeout=10) as server:
            server.set_debuglevel(1) #For Debug
            server.ehlo()
            server.starttls()        # encrypt the connection
            server.login(SMTP_USER, SMTP_PASSWORD)
            server.sendmail(SMTP_USER, to_email, msg.as_string())

        return True

    except smtplib.SMTPAuthenticationError:
        print("[OTP ERROR] SMTP login failed — check SMTP_USER and SMTP_PASSWORD in .env")
        return False
    except smtplib.SMTPRecipientsRefused:
        print(f"[OTP ERROR] Email address refused by SMTP server: {to_email}")
        return False
    except Exception as exc:
        print(f"[OTP ERROR] Could not send email: {exc}")
        return False


# ════════════════════════════════════════════════════════════════
# OTPService
# ════════════════════════════════════════════════════════════════

class OTPService:
    """
    All OTP operations. Uses two DB tables:
      user_userprofile  — tracks verification status per user
      user_otpattempt   — one row per OTP sent (full audit trail)

    Usage:
        svc = OTPService(db)
        svc.send_otp(user_id=5, email="user@example.com")
        svc.verify_otp(user_id=5, otp_input="482910")
        svc.resend_otp(user_id=5, email="user@example.com")
    """

    def __init__(self, db: Session):
        self.db = db

    # ── send_otp ──────────────────────────────────────────────
    def send_otp(self, user_id: int, email: str) -> dict:
        """
        Steps:
          a. Upsert user_userprofile  (creates row if not exists, updates timestamp if exists)
          b. Read back profile.id          (needed as FK for OTPAttempt)
          c. Rate-limit check              (max OTP_MAX_PER_HOUR per hour)
          d. INSERT user_otpattempt   (new row every time — keeps audit trail)
          e. _send_email()                 (SMTP or console in dev)
        """

        # a. Upsert UserProfile — phone stays empty (email-only verification)
        self.db.execute(text("""
            INSERT INTO user_userprofile
                (user_id, phone, is_phone_verified, is_email_verified, created_at, updated_at)
            VALUES
                (:uid, '', false, false, NOW(), NOW())
            ON CONFLICT (user_id) DO UPDATE
                SET updated_at = NOW()
        """), {"uid": user_id})
        self.db.commit()

        # b. Get profile.id (primary key, used as FK in OTPAttempt.profile_id)
        prow = self.db.execute(
            text("SELECT id FROM user_userprofile WHERE user_id = :uid"),
            {"uid": user_id}
        ).fetchone()

        if not prow:
            return {"sent": False, "reason": "Profile could not be created. Please try again."}

        profile_id = prow[0]

        # c. Rate-limit: count attempts in last hour
        since = datetime.now(timezone.utc) - timedelta(hours=1)
        cnt = self.db.execute(text("""
            SELECT COUNT(*) FROM user_otpattempt
            WHERE profile_id = :pid AND created_at > :since
        """), {"pid": profile_id, "since": since}).fetchone()[0]

        if cnt >= OTP_MAX_PER_HOUR:
            return {
                "sent":   False,
                "reason": (
                    f"Too many verification emails sent. "
                    f"Maximum {OTP_MAX_PER_HOUR} per hour. Please wait and try again."
                ),
            }

        # d. Generate + store OTP in user_otpattempt
        otp        = _generate_otp()
        expires_at = datetime.now(timezone.utc) + timedelta(minutes=OTP_EXPIRE_MINUTES)

        self.db.execute(text("""
            INSERT INTO user_otpattempt
                (profile_id, otp_code, attempt_type, expires_at, is_used, created_at)
            VALUES
                (:pid, :otp, 'email_verification', :exp, false, NOW())
        """), {"pid": profile_id, "otp": otp, "exp": expires_at})
        self.db.commit()

        # e. Send email
        if not _send_email(email, otp):
            return {
                "sent":   False,
                "reason": "Could not send verification email. Please check your address and try again.",
            }

        return {"sent": True, "dev_mode": OTP_DEV_MODE}

    # ── verify_otp ────────────────────────────────────────────
    def verify_otp(self, user_id: int, otp_input: str) -> dict:
        """
        Find the latest unused + unexpired OTPAttempt for this user.
        Compare code. On match → mark used + set is_email_verified=True.
        Returns { verified: bool, reason: str (on failure) }.
        """

        # Get profile id
        prow = self.db.execute(
            text("SELECT id FROM user_userprofile WHERE user_id = :uid"),
            {"uid": user_id}
        ).fetchone()

        if not prow:
            return {"verified": False, "reason": "No profile found. Please sign up again."}

        profile_id = prow[0]
        now        = datetime.now(timezone.utc)

        # Find latest valid attempt
        attempt = self.db.execute(text("""
            SELECT id, otp_code
            FROM user_otpattempt
            WHERE profile_id  = :pid
              AND attempt_type = 'email_verification'
              AND is_used      = false
              AND expires_at   > :now
            ORDER BY created_at DESC
            LIMIT 1
        """), {"pid": profile_id, "now": now}).fetchone()

        # No valid attempt — give a specific reason
        if not attempt:
            last = self.db.execute(text("""
                SELECT is_used, expires_at
                FROM user_otpattempt
                WHERE profile_id  = :pid
                  AND attempt_type = 'email_verification'
                ORDER BY created_at DESC LIMIT 1
            """), {"pid": profile_id}).fetchone()

            if not last:
                return {"verified": False, "reason": "No code was sent. Please request a new one."}
            if last[0]:  # is_used = True
                return {"verified": False, "reason": "This code has already been used. Please request a new one."}
            return {
                "verified": False,
                "reason": f"Code expired. OTPs are valid for {OTP_EXPIRE_MINUTES} minutes. Please request a new one.",
            }

        # Wrong code
        if attempt[1].strip() != otp_input.strip():
            return {"verified": False, "reason": "Incorrect code. Please check your email and try again."}

        # ✅ Success — mark attempt used, mark email verified
        self.db.execute(
            text("UPDATE user_otpattempt SET is_used = true WHERE id = :aid"),
            {"aid": attempt[0]}
        )
        self.db.execute(text("""
            UPDATE user_userprofile
            SET is_email_verified = true, updated_at = NOW()
            WHERE id = :pid
        """), {"pid": profile_id})
        self.db.commit()

        return {"verified": True}

    # ── resend_otp ────────────────────────────────────────────
    def resend_otp(self, user_id: int, email: str) -> dict:
        """
        Resend a fresh OTP email.
        email is passed in from the route (fetched from auth_user.email on server side).
        """
        if not email:
            return {"sent": False, "reason": "No email address found for this account."}
        return self.send_otp(user_id, email)