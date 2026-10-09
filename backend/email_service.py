import json
import logging
import os
import smtplib
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText
from datetime import datetime, timezone
from pathlib import Path
from dotenv import load_dotenv

load_dotenv()

logger = logging.getLogger("empsys.email")


class GmailSMTPConfigurationError(RuntimeError):
    """Raised when Gmail SMTP environment variables are missing."""
    pass


def mask_email(email: str) -> str:
    """Mask email address for privacy (e.g., s***n@example.com)."""
    if not email or "@" not in email:
        return email or ""
    local_part, domain = email.split("@", 1)
    if len(local_part) <= 2:
        masked_local = local_part[0] + "*"
    else:
        masked_local = local_part[0] + "***" + local_part[-1]
    return f"{masked_local}@{domain}"


def send_otp_email(to_email: str, recipient_name: str, otp_code: str) -> bool:
    """
    Send OTP verification email to Super Admin via Gmail SMTP.
    Requires SMTP_USER and SMTP_APP_PASSWORD in environment variables.
    Raises GmailSMTPConfigurationError if SMTP is unconfigured (never silently bypasses).
    """
    load_dotenv()
    smtp_host = os.getenv("SMTP_HOST", "smtp.gmail.com")
    smtp_port_raw = os.getenv("SMTP_PORT", "465")
    try:
        smtp_port = int(smtp_port_raw)
    except ValueError:
        smtp_port = 465

    smtp_user = (os.getenv("SMTP_USER") or "").strip()
    smtp_app_password = (os.getenv("SMTP_APP_PASSWORD") or os.getenv("SMTP_PASSWORD") or "").strip().replace(" ", "")
    smtp_from = os.getenv("SMTP_FROM") or (f"EMPSYS CRM <{smtp_user}>" if smtp_user else "EMPSYS CRM <noreply@empsys.com>")

    # Requirement 12: If Gmail SMTP is not configured, show clear server-side configuration error
    if not smtp_user or not smtp_app_password:
        missing = []
        if not smtp_user:
            missing.append("SMTP_USER (your Gmail address)")
        if not smtp_app_password:
            missing.append("SMTP_APP_PASSWORD (your 16-character Gmail App Password)")
        missing_str = " and ".join(missing)
        err_msg = (
            f"Gmail SMTP is not configured on the server. Missing: {missing_str}. "
            "Please configure SMTP_USER, SMTP_APP_PASSWORD, and optionally SMTP_HOST=smtp.gmail.com, "
            "SMTP_PORT=465 in backend/.env before Super Admin login can proceed. OTP verification is never bypassed."
        )
        logger.error("[EMAIL CONFIGURATION ERROR] %s", err_msg)
        raise GmailSMTPConfigurationError(err_msg)

    subject = "EMPSYS CRM - Your Super Admin Login Verification Code"

    html_content = f"""<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <style>
    body {{ font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background-color: #f8fafc; margin: 0; padding: 24px; color: #1e293b; }}
    .container {{ max-width: 520px; margin: 0 auto; background: #ffffff; border-radius: 10px; border: 1px solid #e2e8f0; padding: 36px 32px; box-shadow: 0 4px 12px rgba(0,0,0,0.05); }}
    .header {{ text-align: center; margin-bottom: 24px; }}
    .brand {{ font-size: 20px; font-weight: 800; color: #0f766e; letter-spacing: 0.05em; }}
    .title {{ font-size: 20px; font-weight: 700; color: #0f172a; margin-top: 12px; margin-bottom: 8px; }}
    .greeting {{ font-size: 15px; color: #475569; margin-bottom: 20px; line-height: 1.5; }}
    .otp-box {{ background: #f0fdfa; border: 2px dashed #0f766e; border-radius: 8px; padding: 20px; text-align: center; margin: 24px 0; }}
    .otp-code {{ font-size: 34px; font-weight: 800; letter-spacing: 8px; color: #0f766e; font-family: monospace; }}
    .expiry {{ font-size: 13px; color: #64748b; margin-top: 8px; }}
    .notice {{ font-size: 13px; color: #64748b; line-height: 1.6; border-top: 1px solid #f1f5f9; padding-top: 18px; margin-top: 24px; }}
    .warning {{ color: #b45309; font-weight: 600; }}
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <div class="brand">EMPSYS CRM</div>
      <div class="title">Super Admin Login Verification</div>
    </div>
    <div class="greeting">
      Hello <strong>{recipient_name or 'Super Admin'}</strong>,<br>
      A login attempt was made for your Super Admin account. Use the one-time verification code below to complete sign in:
    </div>
    <div class="otp-box">
      <div class="otp-code">{otp_code}</div>
      <div class="expiry">Expires in <strong>5 minutes</strong> &bull; Single-use only</div>
    </div>
    <div class="notice">
      <span class="warning">&#9888; Security Notice:</span> Never share this verification code with anyone. EMPSYS support will never ask for your code. If you did not initiate this login request, please verify your credentials immediately.
    </div>
  </div>
</body>
</html>
"""

    text_content = f"""EMPSYS CRM - Super Admin Login Verification

Hello {recipient_name or 'Super Admin'},

A login request was received for your Super Admin account.
Your one-time verification code is:

    {otp_code}

This code will expire in 5 minutes and can only be used once.

Security Notice:
Do not share this code with anyone. If you did not initiate this login request, please secure your account immediately.
"""

    msg = MIMEMultipart("alternative")
    msg["Subject"] = subject
    msg["From"] = smtp_from
    msg["To"] = to_email
    msg.attach(MIMEText(text_content, "plain"))
    msg.attach(MIMEText(html_content, "html"))

    try:
        if smtp_port == 465:
            with smtplib.SMTP_SSL(smtp_host, smtp_port, timeout=15) as server:
                server.login(smtp_user, smtp_app_password)
                server.send_message(msg)
        else:
            with smtplib.SMTP(smtp_host, smtp_port, timeout=15) as server:
                server.starttls()
                server.login(smtp_user, smtp_app_password)
                server.send_message(msg)

        logger.info("Successfully dispatched OTP verification email to %s via Gmail SMTP", to_email)
        return True
    except smtplib.SMTPAuthenticationError as e:
        logger.error("Gmail SMTP authentication failed for user %s: %s", smtp_user, e)
        raise RuntimeError(
            "Gmail SMTP authentication failed. Please verify that SMTP_USER is correct and "
            "SMTP_APP_PASSWORD is a valid 16-character Google App Password (not your primary Gmail password)."
        ) from e
    except Exception as e:
        logger.error("Failed to send OTP via Gmail SMTP to %s: %s", to_email, e)
        raise RuntimeError(f"Failed to deliver OTP email via Gmail SMTP: {str(e)}") from e
