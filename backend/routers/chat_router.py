# chat_router.py
# AI assistant endpoints including nearby mechanics lookup.
# pyright: reportGeneralTypeIssues=false, reportArgumentType=false, reportAttributeAccessIssue=false, reportOperatorIssue=false, reportCallIssue=false

from __future__ import annotations

import importlib
from typing import TypedDict

from fastapi import APIRouter, Depends, Query
from pydantic import BaseModel
from sqlalchemy.orm import Session

from auth import get_current_active_user
from config import settings
from database import get_db
from models.db_models import Scan, ScanChatMessage, User

router = APIRouter(prefix="/chat", tags=["Chat"])


class ChatRequest(BaseModel):
    message: str


class ScanChatRequest(BaseModel):
    message: str


class ChatResponse(BaseModel):
    reply: str


class ChatHistoryItem(BaseModel):
    id: int
    role: str
    text: str
    created_at: str


class ChatState(TypedDict):
    user_message: str
    scan_summary: str
    scan_context: str
    answer: str


def _load_langgraph_components():
    try:
        langgraph_graph = importlib.import_module("langgraph.graph")
        return (
            getattr(langgraph_graph, "START", None),
            getattr(langgraph_graph, "END", None),
            getattr(langgraph_graph, "StateGraph", None),
        )
    except Exception:
        return None, None, None


def _load_chat_groq():
    try:
        module = importlib.import_module("langchain_groq")
        return getattr(module, "ChatGroq", None)
    except Exception:
        return None



# Helper: check if user is admin
def _is_admin(user) -> bool:
    return getattr(user, "plan", "") == "admin" or bool(getattr(user, "is_admin", False))

def _tool_recent_scan_summary(db: Session, user_id: int, user: User = None) -> str:
    # If admin, show recent scans across all users
    if user is not None and _is_admin(user):
        scans = db.query(Scan).filter(
            Scan.is_deleted == False
        ).order_by(Scan.created_at.desc()).limit(5).all()
    else:
        scans = db.query(Scan).filter(
            Scan.user_id == user_id,
            Scan.is_deleted == False,
        ).order_by(Scan.created_at.desc()).limit(5).all()

    if not scans:
        return "No previous scans available. Please upload an image or video of the vehicle damage to initiate a scan."

    high_count = len([s for s in scans if (s.severity or "").lower() in ("high", "critical")])
    labels: list[str] = []
    for scan in scans:
        if scan.damage_labels:
            labels.extend([x.strip() for x in scan.damage_labels.split(",") if x.strip()])

    top_labels = ", ".join(sorted(set(labels))[:8]) if labels else "none"
    return (
        f"Recent scans analyzed: {len(scans)}; "
        f"high_or_critical: {high_count}; "
        f"top_damage_labels: {top_labels}."
    )


def _build_scan_context(scan: Scan) -> str:
    result_json = scan.result_json or {}
    detections = result_json.get("detections", []) if isinstance(result_json, dict) else []
    summary = result_json.get("summary", {}) if isinstance(result_json, dict) else {}

    compact = []
    for det in detections[:20]:
        bbox = det.get("bbox", {})
        compact.append(
            {
                "label": det.get("label", "N/A"),
                "category": det.get("damage_category", "N/A"),
                "confidence": det.get("confidence", 0),
                "frame": det.get("frame"),
                "bbox": {
                    "x1": bbox.get("x1", 0),
                    "y1": bbox.get("y1", 0),
                    "x2": bbox.get("x2", 0),
                    "y2": bbox.get("y2", 0),
                },
            }
        )

    return (
        f"scan_id={scan.id}; file={scan.original_filename}; type={scan.file_type}; "
        f"severity={scan.severity}; total_detections={scan.total_detections}; "
        f"confidence_avg={scan.confidence_avg}; video_fps={scan.video_fps}; "
        f"video_resolution={scan.video_resolution}; summary={summary}; detections={compact}"
    )


def _is_media_question(message: str) -> bool:
    content = (message or "").lower()
    if not content.strip():
        return False

    media_keywords = (
        "car", "vehicle", "damage", "dent", "scratch", "bumper", "fender", "door", "mirror",
        "windshield", "scan", "image", "video", "frame", "detection", "confidence", "severity",
        "report", "repair", "insurance", "estimate", "label", "bbox", "analysis",
        "panel", "hood", "bonnet", "boot", "taillight", "headlight", "windscreen",
        "claim", "claimable", "workshop", "replacement", "paint", "alignment",
        "front", "rear", "left", "right", "collision", "impact", "crack", "broken",
        "cost", "fix", "priority", "safe to drive", "drivable",
    )
    return any(keyword in content for keyword in media_keywords)


def _is_clearly_unrelated_question(message: str) -> bool:
    content = (message or "").lower().strip()
    if not content:
        return True

    unrelated_markers = (
        "recipe", "cook", "weather", "football", "cricket", "movie", "song",
        "stock market", "crypto", "bitcoin", "politics", "election", "history",
        "programming", "python", "javascript", "sql", "leetcode", "math homework",
        "love advice", "astrology", "horoscope", "game", "travel plan",
        "visa", "university", "exam", "lyrics", "poem", "joke", "birthday wish",
    )
    return any(marker in content for marker in unrelated_markers)


def _looks_like_follow_up(message: str, scan_context: str) -> bool:
    content = (message or "").lower().strip()
    if not content or not scan_context.strip():
        return False

    follow_up_tokens = (
        "this", "that", "it", "these", "those", "same", "above", "here",
        "how bad", "how serious", "what next", "repair first", "is it safe",
        "can i drive", "claim", "estimate", "why", "explain",
    )
    short_query = len(content.split()) <= 12
    return short_query and any(token in content for token in follow_up_tokens)


def _classify_media_relevance(message: str, scan_summary: str, scan_context: str) -> bool:
    # deterministic checks first for speed and reliability
    if _is_media_question(message):
        return True
    if _looks_like_follow_up(message, scan_context):
        return True
    if _is_clearly_unrelated_question(message):
        return False

    ChatGroq = _load_chat_groq()
    if not settings.GROQ_API_KEY or ChatGroq is None:
        return False

    prompt = (
        "Classify whether the user query is related to automotive image/video damage scan results. "
        "Return ONLY one token: RELATED or UNRELATED.\n\n"
        "Consider related if it asks about: vehicle damage, detections, severity, confidence, "
        "repair priority, insurance context, report interpretation, frames/bounding boxes.\n"
        "Anything else is unrelated.\n\n"
        "Examples:\n"
        "- Query: 'Is the front bumper dent severe?' -> RELATED\n"
        "- Query: 'Can I use this report for insurance claim?' -> RELATED\n"
        "- Query: 'What should I repair first based on this scan?' -> RELATED\n"
        "- Query: 'Write a python script for me' -> UNRELATED\n"
        "- Query: 'What is the weather in Delhi?' -> UNRELATED\n"
        "- Query: 'Suggest a movie for tonight' -> UNRELATED\n\n"
        f"User query: {message}\n"
        f"Recent scan summary: {scan_summary}\n"
        f"Selected scan context: {scan_context}\n"
    )

    try:
        llm = ChatGroq(
            model=settings.GROQ_MODEL,
            temperature=0.0,
            api_key=settings.GROQ_API_KEY,
        )
        result = llm.invoke(prompt)
        content = str(getattr(result, "content", "") or "").strip().upper()
        return content.startswith("RELATED")
    except Exception:
        return False


def _run_tools_node(
    state: ChatState,
    db: Session,
    current_user: User,
) -> ChatState:
    scan_summary = _tool_recent_scan_summary(db, current_user.id, current_user)
    return {
        **state,
        "scan_summary": scan_summary,
        "scan_context": state.get("scan_context", ""),
    }


def _llm_answer_node(state: ChatState) -> ChatState:
    if not _classify_media_relevance(
        message=state.get("user_message", ""),
        scan_summary=state.get("scan_summary", ""),
        scan_context=state.get("scan_context", ""),
    ):
        return {
            **state,
            "answer": (
                "I can only answer questions about your uploaded vehicle images/videos, "
                "detections, severity, reports, and repair-related next steps."
            ),
        }

    fallback = (
        "I analyzed your request using your recent scan context. "
        "For urgent damage, prioritize a trusted workshop and carry your AI report PDF during inspection."
    )

    ChatGroq = _load_chat_groq()
    if not settings.GROQ_API_KEY or ChatGroq is None:
        return {**state, "answer": fallback}

    prompt = (
        "You are an automotive AI assistant for a vehicle damage analyzer app. "
        "You must answer ONLY with information relevant to uploaded images/videos and their scan results. "
        "If user asks unrelated topics, refuse briefly. Be concise, practical, and safety-first.\n\n"
        f"User message: {state.get('user_message', '')}\n"
        f"Scan tool context: {state.get('scan_summary', '')}\n"
        f"Selected scan context: {state.get('scan_context', '')}\n"
    )

    try:
        llm = ChatGroq(
            model=settings.GROQ_MODEL,
            temperature=0.2,
            api_key=settings.GROQ_API_KEY,
        )
        result = llm.invoke(prompt)
        content = str(getattr(result, "content", "") or "").strip()
        return {**state, "answer": content or fallback}
    except Exception:
        return {**state, "answer": fallback}


def _run_langgraph_agent(
    message: str,
    db: Session,
    current_user: User,
    scan_context: str = "",
) -> str:
    START, END, StateGraph = _load_langgraph_components()

    state: ChatState = {
        "user_message": message,
        "scan_summary": "",
        "scan_context": scan_context,
        "answer": "",
    }

    state = _run_tools_node(state, db, current_user)

    if StateGraph is None or START is None or END is None:
        state = _llm_answer_node(state)
        return state["answer"]

    graph = StateGraph(ChatState)
    graph.add_node("llm", lambda s: _llm_answer_node(s))
    graph.add_edge(START, "llm")
    graph.add_edge("llm", END)
    compiled = graph.compile()
    final_state = compiled.invoke(state)

    answer = str(final_state.get("answer", "") or "").strip()
    if not answer:
        answer = _llm_answer_node(state).get("answer", "")

    return answer


def _save_scan_chat_message(db: Session, scan_id: int, user_id: int, role: str, text: str) -> None:
    message = (text or "").strip()
    if not message:
        return

    db.add(
        ScanChatMessage(
            scan_id=scan_id,
            user_id=user_id,
            role=role,
            message=message,
        )
    )



# Helper: get scan for admin or owner
def _get_scan_for_chat(db: Session, scan_id: int, current_user: User) -> Scan | None:
    query = db.query(Scan).filter(Scan.id == scan_id, Scan.is_deleted == False)
    if not _is_admin(current_user):
        query = query.filter(Scan.user_id == current_user.id)
    return query.first()


@router.post("/agent", response_model=ChatResponse)
def chat_with_agent(
    payload: ChatRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
):
    answer = _run_langgraph_agent(
        message=payload.message,
        db=db,
        current_user=current_user,
    )

    return ChatResponse(reply=answer)


@router.post("/scan/{scan_id}", response_model=ChatResponse)
def chat_about_scan(
    scan_id: int,
    payload: ScanChatRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
):
    scan = _get_scan_for_chat(db, scan_id, current_user)

    if not scan:
        return ChatResponse(reply="Scan not found or not accessible.")

    scan_context = _build_scan_context(scan)
    # Add scan-specific context to the user message for clarity
    user_message = f"[SCAN CONTEXT: {scan_context}]\n{payload.message}"
    answer = _run_langgraph_agent(
        message=user_message,
        db=db,
        current_user=current_user,
        scan_context=scan_context,
    )

    _save_scan_chat_message(db, scan_id, current_user.id, "user", payload.message)
    _save_scan_chat_message(db, scan_id, current_user.id, "assistant", answer)
    db.commit()

    return ChatResponse(reply=answer)


@router.get("/scan/{scan_id}/history", response_model=list[ChatHistoryItem])
def get_scan_chat_history(
    scan_id: int,
    limit: int = Query(default=50, ge=1, le=300),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
):
    scan = _get_scan_for_chat(db, scan_id, current_user)
    if not scan:
        return []

    # Admins see all messages for the scan, users see only their own
    if _is_admin(current_user):
        rows = db.query(ScanChatMessage).filter(
            ScanChatMessage.scan_id == scan_id,
        ).order_by(ScanChatMessage.created_at.asc()).limit(limit).all()
    else:
        rows = db.query(ScanChatMessage).filter(
            ScanChatMessage.scan_id == scan_id,
            ScanChatMessage.user_id == current_user.id,
        ).order_by(ScanChatMessage.created_at.asc()).limit(limit).all()

    return [
        ChatHistoryItem(
            id=int(row.id),
            role=str(row.role),
            text=str(row.message),
            created_at=str(row.created_at),
        )
        for row in rows
    ]
