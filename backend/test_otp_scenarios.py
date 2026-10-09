import os
from datetime import datetime, timedelta, timezone
from unittest.mock import MagicMock, patch

from fastapi import HTTPException
from fastapi.security import HTTPAuthorizationCredentials

import database
import models
import schemas
from email_service import GmailSMTPConfigurationError, mask_email
from main import (
    app,
    dashboard,
    get_current_user,
    hash_password,
    login,
    require_super_admin,
    resend_otp,
    verify_otp,
)


def test_all_scenarios():
    print("=" * 70)
    print("STARTING TEST OF GMAIL SMTP & SUPER ADMIN OTP FLOW")
    print("=" * 70)

    db = database.SessionLocal()

    try:
        # Ensure test accounts exist with known passwords
        sa = db.query(models.User).filter_by(role="SUPER_ADMIN").first()
        if not sa:
            sa = models.User(
                email="superadmin@example.com",
                full_name="Super Admin",
                password_hash=hash_password("Admin@123"),
                role="SUPER_ADMIN",
            )
            db.add(sa)
            db.commit()
            db.refresh(sa)
        else:
            sa.password_hash = hash_password("Admin@123")
            db.commit()

        u = db.query(models.User).filter_by(role="USER").first()
        if not u:
            u = models.User(
                email="asif@example.com",
                full_name="Asif K A",
                password_hash=hash_password("User@123"),
                role="USER",
            )
            db.add(u)
            db.commit()
            db.refresh(u)
        else:
            u.password_hash = hash_password("User@123")
            db.commit()

        # Clear prior active challenges
        db.query(models.AdminOTPChallenge).filter_by(user_id=sa.user_id).update({"is_used": True})
        db.commit()

        # =====================================================================
        # Test 1: Requirement 12 - Unconfigured Gmail SMTP Error
        # =====================================================================
        print("\n--- Test 1: Requirement 12 - Unconfigured Gmail SMTP Error ---")
        # Ensure SMTP env vars are empty
        with patch.dict(os.environ, {"SMTP_USER": "", "SMTP_APP_PASSWORD": ""}, clear=False):
            try:
                login(schemas.UserLogin(email=sa.email, password="Admin@123"), db=db)
                assert False, "Should have raised HTTPException 500 when Gmail SMTP is unconfigured"
            except HTTPException as ex:
                assert ex.status_code == 500, f"Expected 500, got {ex.status_code}"
                assert "Gmail SMTP is not configured on the server" in ex.detail
                assert "SMTP_USER" in ex.detail
                assert "SMTP_APP_PASSWORD" in ex.detail
                assert "OTP verification is never bypassed" in ex.detail
                print(f"  [PASS] Correctly rejected with status 500: '{ex.detail[:80]}...'")

        # =====================================================================
        # Test 2: Successful Gmail SMTP Delivery & Valid OTP Verification
        # =====================================================================
        print("\n--- Test 2: Successful Gmail SMTP Delivery & Valid OTP Verification ---")
        captured_emails = []

        class MockSMTPSSL:
            def __init__(self, host, port, timeout=15):
                self.host = host
                self.port = port
                self.timeout = timeout
                assert host == "smtp.gmail.com", f"Expected smtp.gmail.com, got {host}"
                assert port == 465, f"Expected port 465, got {port}"

            def __enter__(self):
                return self

            def __exit__(self, exc_type, exc_val, exc_tb):
                pass

            def login(self, user, password):
                assert user == "test_admin@gmail.com"
                assert password == "abcd1234efgh5678"

            def send_message(self, msg):
                captured_emails.append(msg)

        mock_env = {
            "SMTP_HOST": "smtp.gmail.com",
            "SMTP_PORT": "465",
            "SMTP_USER": "test_admin@gmail.com",
            "SMTP_APP_PASSWORD": "abcd1234efgh5678",
            "SMTP_FROM": "EMPSYS CRM <test_admin@gmail.com>",
        }

        with patch.dict(os.environ, mock_env, clear=False), patch("smtplib.SMTP_SSL", MockSMTPSSL):
            login_res = login(schemas.UserLogin(email=sa.email, password="Admin@123"), db=db)
            assert login_res.requires_otp is True
            assert login_res.token is None
            assert login_res.challenge_token is not None
            assert login_res.masked_email == mask_email(sa.email)
            challenge_token = login_res.challenge_token

            # Verify email was captured by mock SMTP_SSL
            assert len(captured_emails) == 1
            sent_msg = captured_emails[0]
            assert sent_msg["Subject"] == "EMPSYS CRM - Your Super Admin Login Verification Code"
            assert sent_msg["To"] == sa.email
            assert "test_admin@gmail.com" in sent_msg["From"]

            # Extract 6-digit OTP code from email payload
            body = sent_msg.get_payload()[0].get_payload()
            import re
            match = re.search(r"\b(\d{6})\b", body)
            assert match is not None, f"Could not find 6-digit OTP in email: {body}"
            otp_code = match.group(1)

            # Verify OTP
            verify_res = verify_otp(schemas.VerifyOTPRequest(challenge_token=challenge_token, otp=otp_code), db=db)
            assert verify_res.token is not None
            assert verify_res.user.role == "SUPER_ADMIN"
            sa_token = verify_res.token

            # Verify authenticated Super Admin accesses dashboard
            authed_user = get_current_user(HTTPAuthorizationCredentials(scheme="Bearer", credentials=sa_token), db=db)
            dash_res = dashboard(current_user=authed_user, db=db)
            assert dash_res is not None
            print("  [PASS] Gmail SMTP SSL dispatched email with 6-digit OTP and granted dashboard access.")

        # =====================================================================
        # Test 3: Incorrect OTP Handling
        # =====================================================================
        print("\n--- Test 3: Incorrect OTP Handling ---")
        db.query(models.AdminOTPChallenge).filter_by(user_id=sa.user_id).update({"is_used": True})
        db.commit()

        with patch.dict(os.environ, mock_env, clear=False), patch("smtplib.SMTP_SSL", MockSMTPSSL):
            login_b = login(schemas.UserLogin(email=sa.email, password="Admin@123"), db=db)
            ch_b = login_b.challenge_token

            try:
                verify_otp(schemas.VerifyOTPRequest(challenge_token=ch_b, otp="000000"), db=db)
                assert False, "Should fail on incorrect OTP"
            except HTTPException as ex:
                assert ex.status_code == 400
                assert "Invalid verification code. Please try again." in ex.detail
                print(f"  [PASS] Incorrect OTP rejected: '{ex.detail}'")

        # =====================================================================
        # Test 4: Expired OTP and Resend OTP
        # =====================================================================
        print("\n--- Test 4: Expired OTP and Resend via Gmail SMTP ---")
        ch_rec = db.get(models.AdminOTPChallenge, ch_b)
        ch_rec.expires_at = datetime.now(timezone.utc) - timedelta(minutes=10)
        ch_rec.last_sent_at = datetime.now(timezone.utc) - timedelta(minutes=5)
        db.commit()

        try:
            verify_otp(schemas.VerifyOTPRequest(challenge_token=ch_b, otp="123456"), db=db)
            assert False, "Should fail on expired OTP"
        except HTTPException as ex:
            assert ex.status_code == 400
            assert "This verification code has expired. Please request a new code." in ex.detail
            print(f"  [PASS] Expired OTP correctly rejected: '{ex.detail}'")

        # Resend OTP
        captured_emails.clear()
        with patch.dict(os.environ, mock_env, clear=False), patch("smtplib.SMTP_SSL", MockSMTPSSL):
            resend_res = resend_otp(schemas.ResendOTPRequest(challenge_token=ch_b), db=db)
            assert "A new verification code has been sent" in resend_res["message"]
            assert len(captured_emails) == 1
            resent_body = captured_emails[0].get_payload()[0].get_payload()
            resent_otp = re.search(r"\b(\d{6})\b", resent_body).group(1)

            # Verify resent OTP
            v_res = verify_otp(schemas.VerifyOTPRequest(challenge_token=ch_b, otp=resent_otp), db=db)
            assert v_res.token is not None
            print("  [PASS] Resent OTP via Gmail SMTP successfully verified.")

        # =====================================================================
        # Test 5: Normal User Login (No OTP requirement)
        # =====================================================================
        print("\n--- Test 5: Normal User Login (No OTP requirement) ---")
        u_res = login(schemas.UserLogin(email="asif@example.com", password="User@123"), db=db)
        assert u_res.requires_otp is False
        assert u_res.token is not None
        assert u_res.user.role == "USER"

        authed_u = get_current_user(HTTPAuthorizationCredentials(scheme="Bearer", credentials=u_res.token), db=db)
        u_dash = dashboard(current_user=authed_u, db=db)
        assert u_dash is not None
        print("  [PASS] Normal user authenticated directly without OTP.")

        # =====================================================================
        # Test 6: Dashboard Bypass & Privilege Escalation Protection
        # =====================================================================
        print("\n--- Test 6: Dashboard Bypass & Privilege Escalation Protection ---")
        # Missing token
        try:
            get_current_user(None, db=db)
            assert False
        except HTTPException as ex:
            assert ex.status_code == 401
            print("  [PASS] Unauthenticated access denied (401)")

        # Normal user attempting Super Admin action
        try:
            require_super_admin(current_user=authed_u)
            assert False
        except HTTPException as ex:
            assert ex.status_code == 403
            print(f"  [PASS] Normal user blocked from admin role (403): '{ex.detail}'")

        # =====================================================================
        # Test 7: Brute-Force Lockout (5 attempts)
        # =====================================================================
        print("\n--- Test 7: Brute-Force Lockout (5 attempts) ---")
        db.query(models.AdminOTPChallenge).filter_by(user_id=sa.user_id).update({"is_used": True})
        db.commit()

        with patch.dict(os.environ, mock_env, clear=False), patch("smtplib.SMTP_SSL", MockSMTPSSL):
            bf_login = login(schemas.UserLogin(email=sa.email, password="Admin@123"), db=db)
            bf_ch = bf_login.challenge_token

            for att in range(1, 5):
                try:
                    verify_otp(schemas.VerifyOTPRequest(challenge_token=bf_ch, otp="000000"), db=db)
                    assert False
                except HTTPException as ex:
                    assert ex.status_code == 400
                    assert f"{5 - att} attempt" in ex.detail

            # 5th attempt locks challenge
            try:
                verify_otp(schemas.VerifyOTPRequest(challenge_token=bf_ch, otp="000000"), db=db)
                assert False
            except HTTPException as ex:
                assert ex.status_code == 403
                assert "Maximum verification attempts exceeded" in ex.detail
                print(f"  [PASS] 5th incorrect attempt locked challenge (403): '{ex.detail}'")

            # Subsequent attempt is rejected
            try:
                verify_otp(schemas.VerifyOTPRequest(challenge_token=bf_ch, otp="000000"), db=db)
                assert False
            except HTTPException as ex:
                assert ex.status_code == 400
                assert "Invalid or expired verification session" in ex.detail
                print(f"  [PASS] Subsequent attempt rejected: '{ex.detail}'")

        print("\n" + "=" * 70)
        print("ALL GMAIL SMTP & 2FA SCENARIOS FULLY VERIFIED!")
        print("=" * 70)

    finally:
        db.close()


if __name__ == "__main__":
    test_all_scenarios()
