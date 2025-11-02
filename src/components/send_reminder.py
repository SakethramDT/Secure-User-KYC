#!/usr/bin/env python3
"""
send_reminder.py (with safe user_data column check)

- Ensures user_data.start_time and user_data.end_time exist (adds them if missing)
- Updates appointments.start_time/end_time to now()
- Updates user_data.start_time/end_time to now()
- Sends confirmation and/or videocall emails synchronously
- Marks appointments.confirmation_sent_at when confirmation is sent

python send_reminder.py --id 84 --type confirm
python send_reminder.py --id 84 --type videocall
python send_reminder.py --id 84 --type both

"""

import os
import sys
import argparse
import logging
import smtplib
from datetime import datetime, timedelta, timezone
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart
from urllib.parse import quote_plus

import psycopg2
import psycopg2.extras

# ---------------- CONFIG ----------------
CONFIG = {
    "DB_DSN": os.getenv("DB_DSN", "dbname=video_kyc user=postgres password=admin@753 host=164.52.217.141 port=6432"),
    "SMTP_HOST": os.getenv("SMTP_HOST", "smtp.gmail.com"),
    "SMTP_PORT": int(os.getenv("SMTP_PORT", 587)),
    "SMTP_USER": os.getenv("SMTP_USER", "nvnlsindhu1@gmail.com"),
    "SMTP_PASS": os.getenv("SMTP_PASS", "ckzo htkb gpmc shvd"),
    "FROM_EMAIL": os.getenv("FROM_EMAIL", "noreply@digitaltrust.com"),
    "BASE_URL": os.getenv("BASE_URL", "https://uaeid-stg.digitaltrusttech.com:3000/UserVideoKyc/#"),
    "LOGO_URL": os.getenv("LOGO_URL", ""),
    "CONFIRM_LINK_EXPIRY_MINUTES": int(os.getenv("CONFIRM_LINK_EXPIRY_MINUTES", 30)),
}


IST = timezone(timedelta(hours=5, minutes=30))
logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
logger = logging.getLogger("send_reminder_standalone")

# ---------------- DB HELPERS ----------------
def get_conn():
    return psycopg2.connect(CONFIG["DB_DSN"])

def fetchone(query, params=()):
    conn = get_conn()
    try:
        with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
            cur.execute(query, params)
            row = cur.fetchone()
        conn.commit()
        return row
    finally:
        conn.close()

def fetchall(query, params=()):
    conn = get_conn()
    try:
        with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
            cur.execute(query, params)
            rows = cur.fetchall()
        conn.commit()
        return rows
    finally:
        conn.close()

def execute(query, params=()):
    conn = get_conn()
    try:
        with conn.cursor() as cur:
            cur.execute(query, params)
        conn.commit()
    finally:
        conn.close()

# ---------------- SCHEMA GUARD ----------------
def ensure_user_time_columns():
    """
    Ensure user_data has start_time and end_time (timestamptz).
    Adds columns if missing. Logs and continues on failure.
    """
    try:
        # Add columns if not present (IF NOT EXISTS works in recent Postgres)
        # Use timestamptz so timezone-aware times can be stored.
        q = """
        ALTER TABLE public.user_data
          ADD COLUMN IF NOT EXISTS start_time timestamptz,
          ADD COLUMN IF NOT EXISTS end_time timestamptz;
        """
        execute(q)
        logger.info("Ensured user_data.start_time and user_data.end_time columns exist (or were already present).")
        return True
    except Exception as exc:
        logger.warning("Could not ensure user_data time columns: %s", exc)
        # do not raise — we will continue but will skip user updates if schema can't be modified
        return False

# ---------------- MUTATE TIMES ----------------
def touch_appointment_now(appointment_id):
    """
    Update appointment start_time/end_time to now() (DB server time) and return appointment row.
    """
    q = """
    UPDATE appointments
    SET start_time = now(), end_time = now() + interval '30 minutes', updated_at = now()
    WHERE id = %s
    RETURNING id, user_id, start_time, end_time, status, confirmation_sent_at
    """
    row = fetchone(q, (appointment_id,))
    if not row:
        logger.error("Appointment %s not found.", appointment_id)
        return None
    return row

def touch_user_now(user_id):
    """
    Update user_data start_time/end_time to now() if columns exist.
    Returns:
      - dict row if RETURNING present and row updated,
      - True if update executed but no RETURNING,
      - None if user row missing,
      - False on failure (permission/schema issue)
    """
    # Quick check: do columns exist?
    col_check = fetchone(
        """
        SELECT column_name
        FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'user_data' AND column_name IN ('start_time','end_time')
        """
    )
    # If information_schema returns none, proceed cautiously — try update and catch exceptions
    try:
        row = fetchone(
            """
                UPDATE user_data
                SET start_time = now(),
                    end_time = now() + interval '30 minutes',
                    updated_at = now()
                WHERE user_id = %s
                RETURNING user_id, start_time, end_time
           """,
            (user_id,),
        )
        if row:
            return row
        # If no row returned, check if user exists
        exists = fetchone("SELECT 1 FROM user_data WHERE user_id = %s LIMIT 1", (user_id,))
        if not exists:
            return None
        return True
    except Exception as exc:
        logger.warning("Could not update user_data.start_time/end_time for user_id=%s: %s", user_id, exc)
        return False

# ---------------- LINK GENERATION ----------------
def generate_confirm_link(user_id):
    base = CONFIG["BASE_URL"].rstrip("/")
    row = fetchone("SELECT kyc_id FROM user_data WHERE user_id = %s LIMIT 1", (user_id,))
    if not row or not row.get("kyc_id"):
        return None
    return f"{base}/confirm-slot/{quote_plus(str(row['kyc_id']))}"

def generate_videocall_link(user_id):
    base = CONFIG["BASE_URL"].rstrip("/")
    row = fetchone(
        """SELECT room_id FROM video_rooms
           WHERE user_id = %s AND (status = 'active' OR status = 'pending' OR status IS NULL)
           ORDER BY created_at DESC, id DESC LIMIT 1""",
        (user_id,),
    )
    if not row or not row.get("room_id"):
        return None
    return f"{base}/videocall/{quote_plus(str(row['room_id']))}/{quote_plus(str(user_id))}"

# ---------------- EMAIL BUILDERS ----------------
def to_user_local_string(dt):
    if dt is None:
        return ""
    try:
        return dt.astimezone(IST).strftime("%A, %b %d, %Y at %I:%M %p %Z")
    except Exception:
        return dt.strftime("%A, %b %d, %Y at %I:%M %p")

def build_confirmation_email(name, start_local, confirm_url=None, videocall_url=None):
    expiry_msg = f"Note: This confirmation link will expire in {CONFIG['CONFIRM_LINK_EXPIRY_MINUTES']} minutes."
    plain_lines = [
        f"Hi {name},", "",
        f"This is a reminder for your appointment on {start_local}.", "",
        "Please confirm your slot to avoid cancellation.", "",
    ]
    if confirm_url:
        plain_lines += ["Confirm slot:", confirm_url, ""]
    if videocall_url:
        plain_lines += ["Join video call:", videocall_url, ""]
    plain_lines += [expiry_msg, "", "Please ensure your camera and microphone are ready for the call.", "", "Thanks,", "KYC Team"]
    plain_text = "\n".join(plain_lines)

    logo_html = f'<img src="{CONFIG["LOGO_URL"]}" alt="Company Logo" style="max-width:140px;height:auto;margin-bottom:12px;display:block;" />' if CONFIG["LOGO_URL"] else ""
    primary_btn = "display:inline-block;padding:12px 22px;border-radius:8px;background:#0b76ef;color:#ffffff;text-decoration:none;font-weight:700;font-size:15px;"
    secondary_btn = "display:inline-block;padding:10px 18px;border-radius:8px;background:#ffffff;color:#0b76ef;border:1px solid #dbe9ff;text-decoration:none;font-weight:600;font-size:14px;"
    primary_html = f'<a href="{confirm_url}" style="{primary_btn}">Confirm slot</a>' if confirm_url else ""
    secondary_html = f'<a href="{videocall_url}" style="{secondary_btn}">Join video call</a>' if videocall_url else ""

    html = f"""<!doctype html>
<html><body style="margin:0;padding:20px;background:#f4f6f8;font-family:Arial,Helvetica,sans-serif;color:#222;">
  <center style="width:100%;table-layout:fixed;">
    <table style="max-width:640px;margin:0 auto;">
      <tr><td style="padding:18px 12px;">
        <table style="background:#ffffff;border-radius:10px;overflow:hidden;">
          <tr><td style="padding:28px 24px 6px;text-align:center;">{logo_html}<h1 style="margin:10px 0 0;font-size:20px;">Slot confirmation reminder</h1></td></tr>
          <tr><td style="padding:14px 24px 20px;">
            <p>Hi <strong>{name}</strong>,</p>
            <p>This is a reminder for your appointment on <strong>{start_local}</strong>. Please confirm your slot to avoid cancellation.</p>
            <div style="text-align:center;margin:18px 0;">
              {primary_html}
              <div style="height:12px;"></div>
              {secondary_html}
            </div>
            <p style="color:#777;font-size:13px;text-align:center;">{expiry_msg}</p>
            <p>Please ensure your camera and microphone are ready for the call.</p>
          </td></tr>
          <tr><td style="background:#fafafa;padding:14px 20px;text-align:center;font-size:12px;color:#9aa0a6;">&copy; {datetime.now().year} Your Company</td></tr>
        </table>
      </td></tr>
    </table>
  </center>
</body></html>"""
    return plain_text, html

def build_videocall_email(name, start_local, videocall_url=None):
    note = "Please join the video call at the scheduled time. If you cannot join, contact support."
    plain_lines = [
        f"Hi {name},", "",
        f"Your Video KYC call is scheduled for {start_local}.", ""
    ]
    if videocall_url:
        plain_lines += ["Join video call:", videocall_url, ""]
    plain_lines += [note, "", "Please ensure your camera and microphone are ready for the call.", "", "Thanks,", "KYC Team"]
    plain_text = "\n".join(plain_lines)

    logo_html = f'<img src="{CONFIG["LOGO_URL"]}" alt="Company Logo" style="max-width:140px;height:auto;margin-bottom:12px;display:block;" />' if CONFIG["LOGO_URL"] else ""
    join_btn = "display:inline-block;padding:14px 24px;border-radius:8px;background:#ffffff;color:#0b76ef;border:2px solid #0b76ef;text-decoration:none;font-weight:700;font-size:16px;"
    join_html = f'<a href="{videocall_url}" style="{join_btn}">Join video call</a>' if videocall_url else ""
    html = f"""<!doctype html>
<html><body style="margin:0;padding:20px;background:#f4f6f8;font-family:Arial,Helvetica,sans-serif;color:#222;">
  <center style="width:100%;table-layout:fixed;">
    <table style="max-width:640px;margin:0 auto;">
      <tr><td style="padding:18px 12px;">
        <table style="background:#ffffff;border-radius:10px;overflow:hidden;">
          <tr><td style="padding:28px 24px 6px;text-align:center;">{logo_html}<h1 style="margin:10px 0 0;font-size:20px;">Your Video KYC call</h1></td></tr>
          <tr><td style="padding:14px 24px 20px;">
            <p>Hi <strong>{name}</strong>,</p>
            <p>Your Video KYC call is scheduled for <strong>{start_local}</strong>.</p>
            <div style="text-align:center;margin:18px 0;">{join_html}</div>
            <p style="color:#777;font-size:13px;text-align:center;">{note}</p>
            <p>Please ensure your camera and microphone are ready for the call.</p>
          </td></tr>
          <tr><td style="background:#fafafa;padding:14px 20px;text-align:center;font-size:12px;color:#9aa0a6;">&copy; {datetime.now().year} Your Company</td></tr>
        </table>
      </td></tr>
    </table>
  </center>
</body></html>"""
    return plain_text, html

# ---------------- EMAIL SENDER ----------------
def send_email(to_email, subject, plain_text, html_body):
    msg = MIMEMultipart("alternative")
    msg["Subject"] = subject
    msg["From"] = f'"Digital Trust Technologies" <from: <no-reply@digitaltrust.com>'
    msg["To"] = to_email
    part1 = MIMEText(plain_text, "plain")
    part2 = MIMEText(html_body, "html")
    msg.attach(part1)
    msg.attach(part2)
    logger.info("Connecting to SMTP %s:%s", CONFIG["SMTP_HOST"], CONFIG["SMTP_PORT"])
    s = smtplib.SMTP(CONFIG["SMTP_HOST"], CONFIG["SMTP_PORT"], timeout=30)
    try:
        s.starttls()
        s.login(CONFIG["SMTP_USER"], CONFIG["SMTP_PASS"])
        s.send_message(msg)
    finally:
        s.quit()
    logger.info("Email sent to %s (subject: %s)", to_email, subject)

# ---------------- MAIN LOGIC ----------------
def send_for_appointment(appointment_id, typ):
    # Ensure user_data columns exist (best-effort). If DB user lacks ALTER privileges this will log and continue.
    ensure_user_time_columns()

    appt = touch_appointment_now(appointment_id)
    if not appt:
        logger.error("Appointment not found: %s", appointment_id)
        sys.exit(2)

    user_id = appt.get("user_id")
    if not user_id:
        logger.error("Appointment %s has no user_id.", appointment_id)
        sys.exit(3)

    # try updating user_data times (best-effort)
    ures = touch_user_now(user_id)
    if ures is None:
        logger.warning("No user_data row for user_id=%s", user_id)
    elif ures is False:
        logger.warning("Failed to update user_data times for user_id=%s", user_id)
    else:
        logger.info("Updated user_data times for user_id=%s", user_id)

    # fetch user row
    user = fetchone("SELECT user_id, email, name FROM user_data WHERE user_id = %s", (user_id,))
    if not user or not user.get("email"):
        logger.error("No email available for user_id=%s", user_id)
        sys.exit(4)

    name = user.get("name", "") or ""
    email = user.get("email")

    # compute links as needed
    confirm_link = generate_confirm_link(user_id) if typ in ("confirm", "both") else None
    videocall_link = generate_videocall_link(user_id) if typ in ("videocall", "both") else None

    # send confirmation email (if requested)
    if typ in ("confirm", "both"):
        start_local = to_user_local_string(appt.get("start_time"))
        plain, html = build_confirmation_email(name, start_local, confirm_url=confirm_link, videocall_url=videocall_link)
        subject = "Appointment reminder"
        send_email(email, subject, plain, html)
        # mark confirmation_sent_at
        try:
            execute("UPDATE appointments SET confirmation_sent_at = now(), updated_at = now() WHERE id = %s", (appointment_id,))
            logger.info("Marked confirmation_sent_at for appointment %s", appointment_id)
        except Exception:
            logger.exception("Failed to mark confirmation_sent_at for appointment %s", appointment_id)

    # send videocall-only email (if requested)
    if typ in ("videocall", "both"):
        start_local = to_user_local_string(appt.get("start_time"))
        plain_v, html_v = build_videocall_email(name, start_local, videocall_url=videocall_link)
        subject_v = "Your Video KYC call is starting soon"
        if not videocall_link:
            logger.warning("No videocall link found for user_id=%s — videocall email will be sent without CTA.", user_id)
        send_email(email, subject_v, plain_v, html_v)

    logger.info("Done sending requested emails for appointment %s", appointment_id)

# ---------------- CLI ----------------
def main():
    p = argparse.ArgumentParser(description="Send appointment reminder emails synchronously (standalone).")
    p.add_argument("--id", "-i", type=int, required=True, help="Appointment ID (integer)")
    p.add_argument("--type", "-t", required=True, choices=["confirm", "videocall", "both"], help="Which emails to send")
    args = p.parse_args()
    send_for_appointment(args.id, args.type)

if __name__ == "__main__":
    main()
