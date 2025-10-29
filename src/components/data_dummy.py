#!/usr/bin/env python3
"""
assign_agents_simple.py

Synchronous script to assign one available admin per user (no concurrency/workers).
Usage:
  1) pip install -r requirements.txt
  2) create a .env file (example below)
  3) python assign_agents_simple.py
"""

import os
import time
import uuid
import logging
from typing import List
from dotenv import load_dotenv
import psycopg2
import psycopg2.extras

load_dotenv()

# ---------- Config ----------
DATABASE_URL = os.getenv("DATABASE_URL", "postgres://postgres:admin%40753@164.52.217.141:6432/video_kyc")
# Comma-separated list of user IDs (strings or ints)
USER_IDS_CSV = os.getenv("USER_IDS", "67358326,190011,190014,190016,P732687,1234567789,190012,190013,190015,190017,53564657980")
# How long to wait between retries when no agent is available (seconds)
AGENT_WAIT_SECONDS = int(os.getenv("AGENT_WAIT_SECONDS", "2"))
# Max number of attempts waiting for an agent before giving up for that user (0 = infinite)
AGENT_WAIT_MAX_ATTEMPTS = int(os.getenv("AGENT_WAIT_MAX_ATTEMPTS", "0"))

# ---------- Logging ----------
logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
log = logging.getLogger("assigner")

# ---------- SQL ----------
ASSIGN_AGENT_SQL = """
WITH candidate AS (
  SELECT user_id, username
  FROM adminlogin
  WHERE status = 'active'
    AND is_available = true
  ORDER BY created_at ASC
  LIMIT 1
  FOR UPDATE SKIP LOCKED
)
UPDATE adminlogin a
SET is_available = false,
    last_assignment = NOW()
FROM candidate c
WHERE a.user_id = c.user_id
RETURNING a.user_id AS agent_id, a.username;
"""

INSERT_ROOM_SQL = """
INSERT INTO video_rooms (user_id, admin_id, room_id, status, created_at)
VALUES (%s, %s, %s, 'pending', NOW())
"""

UPDATE_USER_SQL = """
UPDATE user_data
SET assigned_to = %s,
    status = 'pending'
WHERE user_id = %s
"""

SELECT_USER_LOCK_SQL = "SELECT user_id FROM user_data WHERE user_id = %s FOR UPDATE"

# ---------- Helpers ----------
def parse_user_ids(csv: str) -> List[int]:
    out = []
    for part in csv.split(","):
        part = part.strip()
        if not part:
            continue
        try:
            out.append((part))
        except ValueError:
            # preserve strings if user ids are non-int
            out.append(part)
    return out

# ---------- Core per-user assignment ----------
def assign_agent_for_user(conn, user_id) -> dict:
    """
    Performs a single assignment transaction for user_id.
    Raises exceptions on fatal errors. Returns dict with details on success.
    """
    cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
    try:
        log.info("[%s] BEGIN transaction", user_id)
        cur.execute("BEGIN")

        # Optional: lock user row to prevent concurrent assignments for same user
        cur.execute(SELECT_USER_LOCK_SQL, (user_id,))
        user_row = cur.fetchone()
        if not user_row:
            raise RuntimeError(f"User {user_id} not found")

        # Loop waiting for an available agent
        attempts = 0
        agent = None
        while True:
            attempts += 1
            cur.execute(ASSIGN_AGENT_SQL)
            res = cur.fetchone()
            if res:
                agent = res
                break

            log.info("[%s] No available agents (attempt %d). Waiting %s seconds...", user_id, attempts, AGENT_WAIT_SECONDS)

            # Stop condition if max attempts set (>0)
            if AGENT_WAIT_MAX_ATTEMPTS > 0 and attempts >= AGENT_WAIT_MAX_ATTEMPTS:
                raise RuntimeError(f"No available agents after {AGENT_WAIT_MAX_ATTEMPTS} attempts")

            time.sleep(AGENT_WAIT_SECONDS)

        agent_id = agent["agent_id"]
        agent_username = agent["username"]
        log.info("[%s] Reserved agent %s (id=%s)", user_id, agent_username, agent_id)

        # Create room
        room_id = f"room-{uuid.uuid4()}"
        cur.execute(INSERT_ROOM_SQL, (user_id, agent_id, room_id))
        log.info("[%s] Inserted video room %s", user_id, room_id)

        # Update user record
        cur.execute(UPDATE_USER_SQL, (agent_username, user_id))
        log.info("[%s] Updated user_data assigned_to=%s", user_id, agent_username)

        cur.execute("COMMIT")
        log.info("[%s] COMMIT", user_id)

        return {"success": True, "user_id": user_id, "agent_id": agent_id, "agent_username": agent_username, "room_id": room_id}

    except Exception as exc:
        try:
            cur.execute("ROLLBACK")
            log.info("[%s] ROLLBACK", user_id)
        except Exception as rb_exc:
            log.error("[%s] Rollback failed: %s", user_id, rb_exc)
        raise

    finally:
        cur.close()

# ---------- Main ----------
def main():
    user_ids = parse_user_ids(USER_IDS_CSV)
    log.info("Will assign agents for %d users", len(user_ids))

    summary = []
    # Single connection reused for sequential operations
    conn = psycopg2.connect(DATABASE_URL)
    try:
        for user_id in user_ids:
            try:
                result = assign_agent_for_user(conn, user_id)
                summary.append({"user_id": user_id, "status": "success", "detail": result})
            except Exception as err:
                log.error("[%s] Assignment failed: %s", user_id, err)
                summary.append({"user_id": user_id, "status": "error", "error": str(err)})
                # continue to next user (no background retries)
    finally:
        conn.close()

    log.info("Summary:")
    for item in summary:
        log.info(item)

if __name__ == "__main__":
    main()
