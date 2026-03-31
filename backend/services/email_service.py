# email_service.py
# Sends transactional emails (scan complete, welcome, password change)
# Silently skips sending if SMTP_HOST is not configured in .env

import smtplib
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart
from config import settings


def _can_send_email() -> bool:
    # only attempt sending if SMTP is configured
    return bool(settings.SMTP_HOST and settings.SMTP_USER)


def is_email_configured() -> bool:
    return _can_send_email()


def _send(to_email: str, subject: str, body_html: str) -> bool:
    """Internal helper — builds and sends a MIME email"""
    if not _can_send_email():
        print(f"[email] SMTP not configured — skipping email to {to_email}")
        return False

    msg = MIMEMultipart("alternative")
    msg["Subject"] = subject
    msg["From"]    = settings.EMAIL_FROM
    msg["To"]      = to_email

    msg.attach(MIMEText(body_html, "html"))

    try:
        with smtplib.SMTP(settings.SMTP_HOST, settings.SMTP_PORT) as server:
            server.starttls()
            server.login(settings.SMTP_USER, settings.SMTP_PASSWORD)
            server.sendmail(settings.EMAIL_FROM, to_email, msg.as_string())
        print(f"[email] Sent '{subject}' to {to_email}")
        return True
    except Exception as e:
        # never crash the app because of email failure
        print(f"[email] Failed to send to {to_email}: {e}")
        return False


def send_welcome_email(to_email: str, full_name: str):
    """Sent when a new user registers"""
    subject = f"Welcome to {settings.APP_NAME}!"
    body    = f"""
    <h2>Hi {full_name},</h2>
    <p>Welcome to <strong>{settings.APP_NAME}</strong>.</p>
    <p>You have <strong>10 free scans</strong> this month. Upload a photo or
    video of a vehicle and our AI will detect damage instantly.</p>
    <p><a href="{settings.FRONTEND_URL}/dashboard">Go to your dashboard</a></p>
    <p>— The {settings.APP_NAME} team</p>
    """
    _send(to_email, subject, body)


def send_scan_complete_email(
    to_email  : str,
    full_name : str,
    scan_id   : int,
    severity  : str,
    file_type : str,
    detections: int
):
    """Sent after a scan finishes processing"""
    subject = f"Your {file_type} scan is ready — {severity.upper()} damage detected"
    body    = f"""
    <h2>Hi {full_name},</h2>
    <p>Your <strong>{file_type}</strong> analysis is complete.</p>
    <table style="border-collapse:collapse;width:100%;max-width:400px">
      <tr><td style="padding:6px;font-weight:bold">Severity</td>
          <td style="padding:6px">{severity.upper()}</td></tr>
      <tr><td style="padding:6px;font-weight:bold">Detections</td>
          <td style="padding:6px">{detections}</td></tr>
    </table>
    <br>
    <a href="{settings.FRONTEND_URL}/scans/{scan_id}"
       style="background:#7F77DD;color:white;padding:10px 20px;
              border-radius:6px;text-decoration:none">
      View Full Results
    </a>
    <br><br>
    <p>— The {settings.APP_NAME} team</p>
    """
    _send(to_email, subject, body)


def send_password_changed_email(to_email: str, full_name: str):
    """Security alert when password is changed"""
    subject = "Your password was changed"
    body    = f"""
    <h2>Hi {full_name},</h2>
    <p>Your password for <strong>{settings.APP_NAME}</strong> was just changed.</p>
    <p>If you did not make this change, please contact support immediately.</p>
    <p>— The {settings.APP_NAME} team</p>
    """
    _send(to_email, subject, body)


def send_limit_warning_email(
    to_email  : str,
    full_name : str,
    scans_used: int,
    limit     : int
):
    """Sent when user hits 80% of their monthly scan limit"""
    subject = f"You've used {scans_used}/{limit} scans this month"
    body    = f"""
    <h2>Hi {full_name},</h2>
    <p>You've used <strong>{scans_used} of {limit}</strong> scans this month.</p>
    <p>Upgrade to Pro for 500 scans/month and priority support.</p>
    <a href="{settings.FRONTEND_URL}/pricing"
       style="background:#7F77DD;color:white;padding:10px 20px;
              border-radius:6px;text-decoration:none">
      Upgrade to Pro
    </a>
    <br><br>
    <p>— The {settings.APP_NAME} team</p>
    """
    _send(to_email, subject, body)


def send_verification_email(to_email: str, full_name: str, token: str) -> bool:
    """Sends account verification email with confirmation link."""
    frontend_link = f"{settings.FRONTEND_URL}/verify-email?token={token}"

    subject = f"Verify your email for {settings.APP_NAME}"
    body = f"""
    <h2>Hi {full_name},</h2>
    <p>Thanks for registering with <strong>{settings.APP_NAME}</strong>.</p>
    <p>Please verify your email address to activate your account.</p>
    <p>
        <a href="{frontend_link}"
             style="background:#0ea5e9;color:white;padding:10px 18px;border-radius:6px;text-decoration:none">
            Verify Email
        </a>
    </p>
    <p>If the button does not work, use this link:</p>
    <p><a href="{frontend_link}">{frontend_link}</a></p>
    <p>This link expires automatically for security reasons.</p>
    <p>— The {settings.APP_NAME} team</p>
    """
    return _send(to_email, subject, body)