# admin_chatbot_router.py
# LLM-powered admin chatbot — uses a lean tool-calling approach.
# Instead of a heavy LangChain SQL Agent, we define precise SQL-backed tools
# and let the LLM (Groq) decide which tool(s) to call. This slashes token usage
# dramatically while giving the admin richer, more reliable answers.
#
# ✅ SQLite-compatible: all PostgreSQL-specific syntax has been replaced.

import json
import logging
import textwrap
import time
from datetime import datetime, timezone
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel
from sqlalchemy import text
from sqlalchemy.orm import Session

from auth import get_current_active_user
from config import settings
from database import get_db
from models.db_models import User

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/admin/chatbot", tags=["AdminChatbot"])


# ══════════════════════════════════════════════════════════════════════════════
#  SQL TOOL DEFINITIONS
# ══════════════════════════════════════════════════════════════════════════════

TOOLS = [
    {
        "name": "platform_overview",
        "description": (
            "Returns a high-level dashboard snapshot: total users, active users, "
            "total scans, scans today, pending subscription requests, total PDF reports, "
            "and average confidence across all scans."
        ),
        "input_schema": {"type": "object", "properties": {}, "required": []},
    },
    {
        "name": "user_stats",
        "description": (
            "Returns user-level analytics: total users by plan (free/pro/admin), "
            "verified vs unverified counts, active vs inactive counts, "
            "and the N most recently registered users with their email, plan and join date."
        ),
        "input_schema": {
            "type": "object",
            "properties": {
                "recent_limit": {
                    "type": "integer",
                    "description": "How many recent users to return (default 10).",
                }
            },
            "required": [],
        },
    },
    {
        "name": "top_users_by_scans",
        "description": "Returns the top N users ranked by total scan count.",
        "input_schema": {
            "type": "object",
            "properties": {
                "limit": {
                    "type": "integer",
                    "description": "Number of top users to return (default 10).",
                }
            },
            "required": [],
        },
    },
    {
        "name": "scan_analytics",
        "description": (
            "Returns scan analytics: breakdown by severity (low/medium/high/critical), "
            "by file type (image/video), average processing time, "
            "and daily scan counts for the last N days."
        ),
        "input_schema": {
            "type": "object",
            "properties": {
                "days": {
                    "type": "integer",
                    "description": "How many past days to include in the daily trend (default 7).",
                }
            },
            "required": [],
        },
    },
    {
        "name": "subscription_requests",
        "description": (
            "Returns subscription upgrade requests filtered by status "
            "(pending / approved / rejected / all). "
            "Includes user email, payment method, status, and created date."
        ),
        "input_schema": {
            "type": "object",
            "properties": {
                "status": {
                    "type": "string",
                    "enum": ["pending", "approved", "rejected", "all"],
                    "description": "Filter by subscription status (default: all).",
                },
                "limit": {
                    "type": "integer",
                    "description": "Max rows to return (default 20).",
                },
            },
            "required": [],
        },
    },
    {
        "name": "conversion_stats",
        "description": (
            "Returns free-to-pro conversion stats: how many users are on each plan, "
            "how many upgrade requests were approved/rejected/pending this month, "
            "and a list of users who upgraded in the last N days."
        ),
        "input_schema": {
            "type": "object",
            "properties": {
                "days": {
                    "type": "integer",
                    "description": "Lookback window in days (default 30).",
                }
            },
            "required": [],
        },
    },
    {
        "name": "report_analytics",
        "description": (
            "Returns PDF damage report analytics: counts by report type "
            "(summary / detailed / insurance), reports generated per day "
            "in the last N days, and top N users by report count."
        ),
        "input_schema": {
            "type": "object",
            "properties": {
                "days": {
                    "type": "integer",
                    "description": "Lookback window for daily trend (default 14).",
                },
                "top_users_limit": {
                    "type": "integer",
                    "description": "How many top report-generating users to return (default 5).",
                },
            },
            "required": [],
        },
    },
    {
        "name": "user_lookup",
        "description": (
            "Looks up a specific user by email or partial name. Returns their profile, "
            "scan count, severity breakdown, subscription status, and recent activity."
        ),
        "input_schema": {
            "type": "object",
            "properties": {
                "query": {
                    "type": "string",
                    "description": "Email address or partial name to search for.",
                }
            },
            "required": ["query"],
        },
    },
    {
        "name": "scan_lookup",
        "description": (
            "Returns the most recent N scans, optionally filtered by severity or user email. "
            "Each row includes user email, filename, severity, confidence, detections, and date."
        ),
        "input_schema": {
            "type": "object",
            "properties": {
                "severity": {
                    "type": "string",
                    "enum": ["low", "medium", "high", "critical", "all"],
                    "description": "Filter by severity (default: all).",
                },
                "user_email": {
                    "type": "string",
                    "description": "Optional: filter scans by this user's email.",
                },
                "limit": {
                    "type": "integer",
                    "description": "Max rows to return (default 20).",
                },
            },
            "required": [],
        },
    },
    {
        "name": "notification_stats",
        "description": (
            "Returns notification analytics: total sent, breakdown by type "
            "(info/warning/success), read vs unread counts, and "
            "users with the most unread notifications."
        ),
        "input_schema": {"type": "object", "properties": {}, "required": []},
    },
    {
        "name": "growth_trends",
        "description": (
            "Returns month-over-month growth: new user signups per month, "
            "total scans per month, and pro upgrades per month for the last N months."
        ),
        "input_schema": {
            "type": "object",
            "properties": {
                "months": {
                    "type": "integer",
                    "description": "How many past months to include (default 6).",
                }
            },
            "required": [],
        },
    },
    {
        "name": "custom_readonly_sql",
        "description": (
            "Executes a custom read-only SQL SELECT query directly on the database. "
            "Use ONLY when no other tool covers the question. "
            "The query MUST start with SELECT. INSERT/UPDATE/DELETE/DROP are forbidden."
        ),
        "input_schema": {
            "type": "object",
            "properties": {
                "sql": {
                    "type": "string",
                    "description": "A valid SELECT SQL statement.",
                },
                "limit": {
                    "type": "integer",
                    "description": "Safety cap on rows returned (default 50, max 200).",
                },
            },
            "required": ["sql"],
        },
    },
]


# ══════════════════════════════════════════════════════════════════════════════
#  TOOL IMPLEMENTATIONS  (SQLite-compatible)
#
#  Key SQLite conversions applied throughout:
#    PostgreSQL              → SQLite
#    ─────────────────────────────────────────
#    ::numeric cast          → removed (ROUND works natively)
#    NOW()                   → datetime('now')
#    CURRENT_DATE            → date('now')
#    DATE(col)               → date(col)
#    INTERVAL ':n days'      → f-string: datetime('now', '-{n} days')
#    INTERVAL ':n months'    → f-string: datetime('now', '-{n} months')
#    date_trunc('month',NOW) → strftime('%Y-%m-01', 'now')
#    TO_CHAR(col,'YYYY-MM')  → strftime('%Y-%m', col)
#    ILIKE                   → LIKE (SQLite LIKE is case-insensitive for ASCII)
# ══════════════════════════════════════════════════════════════════════════════

def _rows(db: Session, sql: str, params: dict | None = None) -> list[dict]:
    """Execute a SQL string and return list-of-dicts."""
    result = db.execute(text(sql), params or {})
    cols = list(result.keys())
    return [dict(zip(cols, row)) for row in result.fetchall()]


def run_tool(name: str, args: dict, db: Session) -> Any:
    """Dispatch a tool call to the matching implementation."""

    # ── platform_overview ──────────────────────────────────────────────────
    if name == "platform_overview":
        sql = """
            SELECT
                (SELECT COUNT(*) FROM users)                                        AS total_users,
                (SELECT COUNT(*) FROM users WHERE is_active = 1)                    AS active_users,
                (SELECT COUNT(*) FROM users WHERE plan = 'pro')                     AS pro_users,
                (SELECT COUNT(*) FROM scans  WHERE is_deleted = 0)                  AS total_scans,
                (SELECT COUNT(*) FROM scans
                 WHERE date(created_at) = date('now') AND is_deleted = 0)           AS scans_today,
                (SELECT COUNT(*) FROM subscription_requests WHERE status = 'pending') AS pending_subs,
                (SELECT COUNT(*) FROM damage_reports)                               AS total_reports,
                (SELECT ROUND(AVG(confidence_avg), 2)
                 FROM scans WHERE is_deleted = 0)                                   AS avg_confidence
        """
        return _rows(db, sql)[0]

    # ── user_stats ─────────────────────────────────────────────────────────
    elif name == "user_stats":
        limit = int(args.get("recent_limit", 10))
        by_plan  = _rows(db,
            "SELECT plan, COUNT(*) AS count FROM users GROUP BY plan ORDER BY count DESC")
        verified = _rows(db,
            "SELECT is_verified, COUNT(*) AS count FROM users GROUP BY is_verified")
        active   = _rows(db,
            "SELECT is_active, COUNT(*) AS count FROM users GROUP BY is_active")
        recent   = _rows(db,
            "SELECT email, full_name, plan, is_verified, created_at "
            "FROM users ORDER BY created_at DESC LIMIT :lim",
            {"lim": limit},
        )
        return {"by_plan": by_plan, "by_verified": verified,
                "by_active": active, "recent_users": recent}

    # ── top_users_by_scans ─────────────────────────────────────────────────
    elif name == "top_users_by_scans":
        limit = int(args.get("limit", 10))
        sql = """
            SELECT u.email, u.full_name, u.plan,
                   COUNT(s.id) AS scan_count,
                   MAX(s.created_at) AS last_scan
            FROM users u
            JOIN scans s ON s.user_id = u.id AND s.is_deleted = 0
            GROUP BY u.id, u.email, u.full_name, u.plan
            ORDER BY scan_count DESC
            LIMIT :lim
        """
        return _rows(db, sql, {"lim": limit})

    # ── scan_analytics ─────────────────────────────────────────────────────
    elif name == "scan_analytics":
        days = int(args.get("days", 7))
        by_severity = _rows(db,
            "SELECT severity, COUNT(*) AS count FROM scans "
            "WHERE is_deleted = 0 GROUP BY severity")
        by_type = _rows(db,
            "SELECT file_type, COUNT(*) AS count FROM scans "
            "WHERE is_deleted = 0 GROUP BY file_type")
        # ✅ Removed ::numeric cast — ROUND() works natively in SQLite
        perf = _rows(db,
            "SELECT ROUND(AVG(processing_time_ms), 0) AS avg_ms, "
            "       ROUND(AVG(confidence_avg), 3)     AS avg_confidence, "
            "       ROUND(AVG(total_detections), 1)   AS avg_detections "
            "FROM scans WHERE is_deleted = 0")[0]
        # ✅ INTERVAL replaced with datetime('now', '-N days') via f-string
        daily = _rows(db,
            f"SELECT date(created_at) AS day, COUNT(*) AS scans "
            f"FROM scans "
            f"WHERE created_at >= datetime('now', '-{days} days') AND is_deleted = 0 "
            f"GROUP BY day ORDER BY day")
        return {"by_severity": by_severity, "by_file_type": by_type,
                "performance": perf, "daily_trend": daily}

    # ── subscription_requests ──────────────────────────────────────────────
    elif name == "subscription_requests":
        status = args.get("status", "all")
        limit  = int(args.get("limit", 20))
        where  = "" if status == "all" else "WHERE sr.status = :status"
        sql = f"""
            SELECT u.email, u.full_name, sr.payment_method, sr.status,
                   sr.created_at, sr.admin_note
            FROM subscription_requests sr
            JOIN users u ON u.id = sr.user_id
            {where}
            ORDER BY sr.created_at DESC
            LIMIT :lim
        """
        params: dict = {"lim": limit}
        if status != "all":
            params["status"] = status
        return _rows(db, sql, params)

    # ── conversion_stats ───────────────────────────────────────────────────
    elif name == "conversion_stats":
        days = int(args.get("days", 30))
        by_plan = _rows(db, "SELECT plan, COUNT(*) AS count FROM users GROUP BY plan")
        # ✅ date_trunc('month', NOW()) → strftime('%Y-%m-01', 'now')
        monthly = _rows(db,
            "SELECT status, COUNT(*) AS count FROM subscription_requests "
            "WHERE created_at >= strftime('%Y-%m-01', 'now') "
            "GROUP BY status")
        # ✅ INTERVAL replaced with f-string datetime
        recent_upgrades = _rows(db,
            f"SELECT u.email, u.full_name, sr.created_at "
            f"FROM subscription_requests sr JOIN users u ON u.id = sr.user_id "
            f"WHERE sr.status = 'approved' "
            f"  AND sr.created_at >= datetime('now', '-{days} days') "
            f"ORDER BY sr.created_at DESC")
        return {"plans": by_plan, "this_month_requests": monthly,
                "recent_upgrades": recent_upgrades}

    # ── report_analytics ───────────────────────────────────────────────────
    elif name == "report_analytics":
        days      = int(args.get("days", 14))
        top_limit = int(args.get("top_users_limit", 5))
        by_type   = _rows(db,
            "SELECT report_type, COUNT(*) AS count FROM damage_reports GROUP BY report_type")
        # ✅ INTERVAL + DATE replaced with SQLite equivalents
        daily     = _rows(db,
            f"SELECT date(generated_at) AS day, COUNT(*) AS reports "
            f"FROM damage_reports "
            f"WHERE generated_at >= datetime('now', '-{days} days') "
            f"GROUP BY day ORDER BY day")
        top_users = _rows(db,
            "SELECT u.email, COUNT(dr.id) AS reports "
            "FROM damage_reports dr JOIN users u ON u.id = dr.user_id "
            "GROUP BY u.email ORDER BY reports DESC LIMIT :lim",
            {"lim": top_limit},
        )
        return {"by_type": by_type, "daily_trend": daily, "top_users": top_users}

    # ── user_lookup ────────────────────────────────────────────────────────
    elif name == "user_lookup":
        q = f"%{args.get('query', '')}%"
        # ✅ ILIKE → LIKE (SQLite LIKE is case-insensitive for ASCII by default)
        users = _rows(db,
            "SELECT id, email, full_name, plan, is_active, is_verified, created_at, last_login "
            "FROM users WHERE email LIKE :q OR full_name LIKE :q LIMIT 5",
            {"q": q},
        )
        if not users:
            return {"message": "No users found matching that query."}
        uid = users[0]["id"]
        scans = _rows(db,
            "SELECT COUNT(*) AS total, "
            "       SUM(CASE WHEN severity = 'critical' THEN 1 ELSE 0 END) AS critical, "
            "       SUM(CASE WHEN severity = 'high'     THEN 1 ELSE 0 END) AS high, "
            "       SUM(CASE WHEN severity = 'medium'   THEN 1 ELSE 0 END) AS medium, "
            "       SUM(CASE WHEN severity = 'low'      THEN 1 ELSE 0 END) AS low "
            "FROM scans WHERE user_id = :uid AND is_deleted = 0",
            {"uid": uid},
        )
        subs = _rows(db,
            "SELECT status, created_at FROM subscription_requests "
            "WHERE user_id = :uid ORDER BY created_at DESC LIMIT 3",
            {"uid": uid},
        )
        return {"profile": users[0], "scan_summary": scans[0], "subscriptions": subs}

    # ── scan_lookup ────────────────────────────────────────────────────────
    elif name == "scan_lookup":
        severity   = args.get("severity", "all")
        user_email = args.get("user_email", "")
        limit      = int(args.get("limit", 20))
        filters    = ["s.is_deleted = 0"]
        params: dict = {"lim": limit}
        if severity != "all":
            filters.append("s.severity = :severity")
            params["severity"] = severity
        if user_email:
            # ✅ ILIKE → LIKE
            filters.append("u.email LIKE :email")
            params["email"] = f"%{user_email}%"
        where = "WHERE " + " AND ".join(filters)
        sql = f"""
            SELECT u.email, s.original_filename, s.file_type, s.severity,
                   s.confidence_avg, s.total_detections, s.created_at
            FROM scans s JOIN users u ON u.id = s.user_id
            {where}
            ORDER BY s.created_at DESC
            LIMIT :lim
        """
        return _rows(db, sql, params)

    # ── notification_stats ─────────────────────────────────────────────────
    elif name == "notification_stats":
        summary = _rows(db,
            "SELECT type, COUNT(*) AS count, "
            "       SUM(CASE WHEN is_read = 1 THEN 1 ELSE 0 END) AS read_count "
            "FROM notifications GROUP BY type")
        unread  = _rows(db,
            "SELECT u.email, COUNT(*) AS unread "
            "FROM notifications n JOIN users u ON u.id = n.user_id "
            "WHERE n.is_read = 0 GROUP BY u.email ORDER BY unread DESC LIMIT 5")
        totals  = _rows(db,
            "SELECT COUNT(*) AS total, "
            "       SUM(CASE WHEN is_read = 1 THEN 1 ELSE 0 END) AS total_read "
            "FROM notifications")[0]
        return {"totals": totals, "by_type": summary, "top_unread_users": unread}

    # ── growth_trends ──────────────────────────────────────────────────────
    elif name == "growth_trends":
        months = int(args.get("months", 6))
        # ✅ TO_CHAR(col,'YYYY-MM') → strftime('%Y-%m', col)
        # ✅ INTERVAL ':m months'   → datetime('now', '-N months') via f-string
        signups = _rows(db,
            f"SELECT strftime('%Y-%m', created_at) AS month, COUNT(*) AS new_users "
            f"FROM users "
            f"WHERE created_at >= datetime('now', '-{months} months') "
            f"GROUP BY month ORDER BY month")
        scans = _rows(db,
            f"SELECT strftime('%Y-%m', created_at) AS month, COUNT(*) AS scans "
            f"FROM scans "
            f"WHERE created_at >= datetime('now', '-{months} months') AND is_deleted = 0 "
            f"GROUP BY month ORDER BY month")
        upgrades = _rows(db,
            f"SELECT strftime('%Y-%m', created_at) AS month, COUNT(*) AS upgrades "
            f"FROM subscription_requests "
            f"WHERE status = 'approved' "
            f"  AND created_at >= datetime('now', '-{months} months') "
            f"GROUP BY month ORDER BY month")
        return {"signups": signups, "scans": scans, "pro_upgrades": upgrades}

    # ── custom_readonly_sql ────────────────────────────────────────────────
    elif name == "custom_readonly_sql":
        sql = args.get("sql", "").strip()
        cap = min(int(args.get("limit", 50)), 200)
        if not sql.upper().startswith("SELECT"):
            return {"error": "Only SELECT statements are allowed."}
        forbidden = ["INSERT", "UPDATE", "DELETE", "DROP", "ALTER",
                     "TRUNCATE", "GRANT", "REVOKE"]
        up = sql.upper()
        for kw in forbidden:
            if kw in up:
                return {"error": f"Forbidden keyword '{kw}' detected in query."}
        try:
            rows = _rows(db, f"{sql} LIMIT {cap}")
            return {"rows": rows, "count": len(rows)}
        except Exception as e:
            return {"error": str(e)}

    return {"error": f"Unknown tool: {name}"}


# ══════════════════════════════════════════════════════════════════════════════
#  SYSTEM PROMPT
# ══════════════════════════════════════════════════════════════════════════════

SYSTEM_PROMPT = textwrap.dedent("""
    You are an expert admin analytics assistant for a damage-scanning SaaS platform.
    You have a set of precise database tools — use them to answer the admin's question.

    ## Response formatting rules (IMPORTANT)
    - Use **Markdown headings** (##, ###) to organise multi-section answers.
    - Use bullet points or numbered lists for enumerations.
    - Use **bold** for key numbers and labels.
    - Use `code` for technical identifiers (emails, SQL snippets, enum values).
    - Never output raw asterisks like *** or ___ as text; always render proper Markdown.
    - Be concise. Lead with the most important insight, then supporting detail.
    - If data is empty, say so clearly and suggest why.

    ## Tool selection rules
    - Always prefer a specific tool over `custom_readonly_sql`.
    - You may call multiple tools in sequence when the question spans topics.
    - Never guess data — always call a tool.
""").strip()


# ══════════════════════════════════════════════════════════════════════════════
#  GROQ CLIENT  — with retry on 429 rate-limit
# ══════════════════════════════════════════════════════════════════════════════

def _call_groq(messages: list[dict], tools: list[dict], retries: int = 3) -> dict:
    """Call the Groq chat-completions endpoint with exponential-backoff retry."""
    import httpx

    if not settings.GROQ_MODEL:
        raise ValueError("GROQ_MODEL is not configured.")

    headers = {
        "Authorization": f"Bearer {settings.GROQ_API_KEY}",
        "Content-Type": "application/json",
    }
    payload = {
        "model": settings.GROQ_MODEL,
        "messages": messages,
        "tools": [{"type": "function", "function": {
            "name": t["name"],
            "description": t["description"],
            "parameters": t["input_schema"],
        }} for t in tools],
        "tool_choice": "auto",
        "temperature": 0.0,
        "max_tokens": 1024,
    }

    for attempt in range(retries):
        resp = httpx.post(
            "https://api.groq.com/openai/v1/chat/completions",
            headers=headers,
            json=payload,
            timeout=60,
        )
        if resp.status_code == 429:
            wait = 2 ** attempt          # 1 s → 2 s → 4 s
            logger.warning(f"[CHATBOT] Rate limited by Groq. Retrying in {wait}s… "
                           f"(attempt {attempt + 1}/{retries})")
            time.sleep(wait)
            continue
        resp.raise_for_status()
        return resp.json()

    raise Exception("Groq rate limit exceeded after all retries. Please wait and try again.")


# ══════════════════════════════════════════════════════════════════════════════
#  CORE FUNCTION — agentic tool-call loop
# ══════════════════════════════════════════════════════════════════════════════

def run_admin_query(question: str, db: Session) -> str:
    """
    Run an admin question through the Groq LLM with tool-calling.
    The LLM picks which tool(s) to call; we execute them and feed results back.
    Typically 2 API round-trips max → very low token cost.
    """
    if not settings.GROQ_API_KEY:
        return "⚠️ GROQ_API_KEY is not configured. Please set it in your environment."
    if not getattr(settings, "GROQ_MODEL", None):
        return "⚠️ GROQ_MODEL is not configured. Please set it in your environment."

    messages: list[dict] = [
        {"role": "system", "content": SYSTEM_PROMPT},
        {"role": "user",   "content": question},
    ]

    for _iteration in range(5):      # safety cap: at most 5 round-trips
        try:
            response = _call_groq(messages, TOOLS)
        except Exception as e:
            logger.error(f"[CHATBOT] Groq API error: {e}")
            return f"Sorry, I couldn't reach the AI service: {e}"

        choice  = response["choices"][0]
        message = choice["message"]
        finish  = choice["finish_reason"]

        messages.append(message)     # append assistant turn (may contain tool_calls)

        if finish == "stop" or not message.get("tool_calls"):
            return (message.get("content") or "").strip()

        # ── Execute all requested tool calls ──────────────────────────────
        for tc in message.get("tool_calls", []):
            tool_name = tc["function"]["name"]
            try:
                tool_args = json.loads(tc["function"]["arguments"] or "{}")
            except json.JSONDecodeError:
                tool_args = {}

            logger.info(f"[CHATBOT] Tool call → {tool_name}({tool_args})")

            try:
                tool_result = run_tool(tool_name, tool_args, db)
            except Exception as e:
                logger.error(f"[CHATBOT] Tool '{tool_name}' error: {e}")
                tool_result = {"error": str(e)}

            messages.append({
                "role": "tool",
                "tool_call_id": tc["id"],
                "content": json.dumps(tool_result, default=str),
            })

    return ("I reached my iteration limit while processing your question. "
            "Please try a more specific query.")


# ══════════════════════════════════════════════════════════════════════════════
#  API SCHEMA & ROUTE
# ══════════════════════════════════════════════════════════════════════════════

class AdminChatbotRequest(BaseModel):
    question: str


class AdminChatbotResponse(BaseModel):
    answer: str


@router.post("/ask", response_model=AdminChatbotResponse)
async def ask_admin_chatbot(
    req: AdminChatbotRequest,
    request: Request,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
):
    """Admin-only chatbot endpoint. Ask any natural-language question about platform data."""
    if str(current_user.plan) != "admin":
        raise HTTPException(status_code=403, detail="Admins only.")

    logger.info(f"[CHATBOT] Admin '{current_user.email}' asked: {req.question}")
    answer = run_admin_query(req.question, db)
    return AdminChatbotResponse(answer=answer)