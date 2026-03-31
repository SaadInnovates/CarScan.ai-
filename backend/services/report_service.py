# report_service.py
# Generates report text and exports PDF with Groq + LangGraph summary support.

from __future__ import annotations

from datetime import datetime, timezone
from functools import lru_cache
import importlib
from pathlib import Path
import textwrap
from typing import TypedDict

from config import settings


class ReportGraphState(TypedDict):
    scan_data: dict
    user_data: dict
    report_type: str
    metrics_summary: str
    labels_summary: str
    llm_summary: str


def _sanitize_detections_for_reporting(detections: list[dict]) -> list[dict]:
    """Normalize detections for reporting and explicitly drop frame-level fields."""
    sanitized: list[dict] = []
    for det in detections[:30]:
        bbox = det.get("bbox", {}) if isinstance(det, dict) else {}
        sanitized.append(
            {
                "label": str(det.get("label", "N/A")),
                "category": str(det.get("damage_category", "N/A")),
                "confidence": float(det.get("confidence", 0.0) or 0.0),
                "bbox": {
                    "x1": float(bbox.get("x1", 0.0) or 0.0),
                    "y1": float(bbox.get("y1", 0.0) or 0.0),
                    "x2": float(bbox.get("x2", 0.0) or 0.0),
                    "y2": float(bbox.get("y2", 0.0) or 0.0),
                },
            }
        )
    return sanitized


def _fallback_report_body(scan_data: dict, report_type: str) -> str:
    labels = [l.strip() for l in str(scan_data.get("damage_labels", "") or "").split(",") if l.strip()]
    labels_text = ", ".join(labels[:10]) if labels else "No confirmed labels"
    detections = int(scan_data.get("total_detections", 0) or 0)
    confidence = float(scan_data.get("confidence_avg", 0.0) or 0.0)
    severity = str(scan_data.get("severity", "low") or "low").upper()

    blocks = [
        "Executive Findings",
        f"Overall severity is {severity} with {detections} detections at {confidence:.1%} average confidence.",
        f"Primary observed damage labels: {labels_text}.",
        "Business Impact",
        "Visible exterior damage patterns indicate repair coordination should be scheduled before standard use resumes.",
        "Recommended Action Plan",
        "1) Perform technician validation and panel alignment checks. 2) Prepare parts-and-labor estimate. 3) Capture close-up evidence photos for records.",
    ]

    if report_type == "detailed":
        blocks += [
            "Technical Focus",
            "Prioritize structural alignment checks on affected body sections and verify light/windscreen integrity where applicable.",
        ]

    if report_type == "insurance":
        blocks += [
            "Claim Readiness Notes",
            "Use this report as preliminary AI evidence and attach close-up photos plus workshop estimate for claim validation.",
        ]

    return "\n".join(blocks)


def _generate_ai_report_body(scan_data: dict, user_data: dict, report_type: str, ai_summary: str) -> str:
    fallback = _fallback_report_body(scan_data, report_type)
    ChatGroq = _load_chat_groq()
    if not settings.GROQ_API_KEY or ChatGroq is None:
        return fallback

    detections = scan_data.get("detections", [])
    compact_detections = _sanitize_detections_for_reporting(detections)

    prompt = (
        "You are a senior automotive risk analyst writing an enterprise-grade vehicle damage report for business stakeholders. "
        "Only return plain text with concise professional section headers and audit-friendly wording. "
        "Do not use markdown tables, do not invent facts, and do not include frame-level references.\n\n"
        f"Report type: {report_type}\n"
        f"Customer: {user_data.get('full_name', 'N/A')} ({user_data.get('plan', 'free')})\n"
        f"File: {scan_data.get('original_filename', 'N/A')}\n"
        f"Severity: {scan_data.get('severity', 'N/A')}\n"
        f"Total detections: {scan_data.get('total_detections', 0)}\n"
        f"Average confidence: {scan_data.get('confidence_avg', 0)}\n"
        f"AI summary: {ai_summary}\n"
        f"Detections sample: {compact_detections}\n\n"
        "For summary type use sections: Executive Findings, Damage Scope, Operational Recommendation. "
        "For detailed type use sections: Executive Findings, Damage Scope, Technical Assessment Notes, Repair Priorities, Action Plan. "
        "For insurance type use sections: Executive Findings, Damage Scope, Claim Readiness Notes, Risk & Compliance Notes, Action Plan. "
        "Avoid mentioning model internals, frame numbers, or low-level coordinate dumps."
    )

    try:
        llm = ChatGroq(
            model=settings.GROQ_MODEL,
            temperature=0.15,
            api_key=settings.GROQ_API_KEY,
        )
        result = llm.invoke(prompt)
        content = str(getattr(result, "content", "") or "").strip()
        return content or fallback
    except Exception:
        return fallback


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


def _load_reportlab_components():
    try:
        pagesizes = importlib.import_module("reportlab.lib.pagesizes")
        units = importlib.import_module("reportlab.lib.units")
        pdfgen = importlib.import_module("reportlab.pdfgen.canvas")
        return (
            getattr(pagesizes, "A4", None),
            getattr(units, "cm", None),
            getattr(pdfgen, "Canvas", None),
        )
    except Exception:
        return None, None, None


def _tool_damage_metrics(scan_data: dict) -> str:
    total = int(scan_data.get("total_detections", 0) or 0)
    confidence = float(scan_data.get("confidence_avg", 0.0) or 0.0)
    severity = str(scan_data.get("severity", "low") or "low").lower()
    processing_ms = int(scan_data.get("processing_time_ms", 0) or 0)

    return (
        f"severity={severity}; detections={total}; "
        f"avg_confidence={confidence:.3f}; processing_ms={processing_ms}"
    )


def _tool_top_damage_labels(scan_data: dict) -> str:
    labels_raw = str(scan_data.get("damage_labels", "") or "")
    if not labels_raw.strip():
        return "No damage labels detected."

    labels = [label.strip() for label in labels_raw.split(",") if label.strip()]
    if not labels:
        return "No damage labels detected."

    return "Top labels: " + ", ".join(labels[:8])


def _fallback_summary(scan_data: dict, report_type: str) -> str:
    severity = str(scan_data.get("severity", "low") or "low").upper()
    total = int(scan_data.get("total_detections", 0) or 0)
    confidence = float(scan_data.get("confidence_avg", 0.0) or 0.0)

    if total == 0:
        return "No visible damage patterns were detected. A controlled re-capture under improved lighting is recommended for verification quality."

    detail = "an executive overview"
    if report_type == "detailed":
        detail = "a technical breakdown of likely impacted components and repair priority"
    elif report_type == "insurance":
        detail = "an insurance-oriented preliminary claim readiness narrative"

    return (
        f"Severity is {severity} with {total} detections at {confidence:.1%} average confidence. "
        f"This report provides {detail} to support inspection planning and decision alignment."
    )


def _run_tools_node(state: ReportGraphState) -> ReportGraphState:
    scan_data = state["scan_data"]
    return {
        **state,
        "metrics_summary": _tool_damage_metrics(scan_data),
        "labels_summary": _tool_top_damage_labels(scan_data),
    }


def _llm_summary_node(state: ReportGraphState) -> ReportGraphState:
    scan_data = state["scan_data"]
    user_data = state["user_data"]
    report_type = state["report_type"]

    fallback = _fallback_summary(scan_data, report_type)

    ChatGroq = _load_chat_groq()
    if not settings.GROQ_API_KEY or ChatGroq is None:
        return {**state, "llm_summary": fallback}

    prompt = (
        "You are an automotive damage analyst writing for enterprise operations and claims teams. "
        "Write a concise executive summary in 4-6 sentences for a vehicle damage report. "
        "Keep it factual, avoid legal guarantees, mention severity, confidence, business impact, and recommended next action. "
        "Never mention frame-level analysis.\n\n"
        f"Report type: {report_type}\n"
        f"User plan: {user_data.get('plan', 'free')}\n"
        f"File: {scan_data.get('original_filename', 'N/A')}\n"
        f"Tool metrics: {state.get('metrics_summary', '')}\n"
        f"Tool labels: {state.get('labels_summary', '')}\n"
        f"Detected count: {scan_data.get('total_detections', 0)}\n"
        f"Scan date: {scan_data.get('created_at', 'N/A')}\n"
    )

    try:
        llm = ChatGroq(
            model=settings.GROQ_MODEL,
            temperature=0.2,
            api_key=settings.GROQ_API_KEY,
        )
        result = llm.invoke(prompt)
        content = getattr(result, "content", "") or ""
        summary = str(content).strip() if content else fallback
        return {**state, "llm_summary": summary}
    except Exception:
        return {**state, "llm_summary": fallback}


@lru_cache()
def _build_summary_graph():
    START, END, StateGraph = _load_langgraph_components()
    if StateGraph is None or START is None or END is None:
        return None

    graph = StateGraph(ReportGraphState)
    graph.add_node("tools", _run_tools_node)
    graph.add_node("llm", _llm_summary_node)
    graph.add_edge(START, "tools")
    graph.add_edge("tools", "llm")
    graph.add_edge("llm", END)
    return graph.compile()


def _generate_ai_summary(scan_data: dict, user_data: dict, report_type: str) -> str:
    compiled = _build_summary_graph()

    if compiled is None:
        return _fallback_summary(scan_data, report_type)

    final_state = compiled.invoke(
        {
            "scan_data": scan_data,
            "user_data": user_data,
            "report_type": report_type,
            "metrics_summary": "",
            "labels_summary": "",
            "llm_summary": "",
        }
    )

    summary = str(final_state.get("llm_summary", "") or "").strip()
    return summary or _fallback_summary(scan_data, report_type)


def _title_case_slug(value: str) -> str:
    return str(value or "N/A").replace("-", " ").replace("_", " ").title()


def _append_wrapped(lines: list[str], text: str, width: int = 96, indent: str = "") -> None:
    cleaned = str(text or "").strip()
    if not cleaned:
        lines.append("")
        return

    wrapped = textwrap.wrap(cleaned, width=width) or [cleaned]
    for line in wrapped:
        lines.append(f"{indent}{line}")


def _append_section(lines: list[str], title: str, body: str) -> None:
    lines.append(title.upper())
    lines.append("-" * 96)

    for paragraph in str(body or "").splitlines():
        _append_wrapped(lines, paragraph, width=96)

    lines.append("")


def _detection_register_lines(detections: list[dict], report_type: str) -> list[str]:
    if not detections:
        return [
            "No confirmed damage detections were available for this assessment window.",
            "Capture additional images with improved lighting and less glare for higher confidence verification.",
        ]

    top_n = 6 if report_type == "summary" else 12
    ranked = sorted(detections, key=lambda d: float(d.get("confidence", 0.0) or 0.0), reverse=True)[:top_n]

    register: list[str] = []
    for idx, det in enumerate(ranked, start=1):
        bbox = det.get("bbox", {}) if isinstance(det, dict) else {}
        label = _title_case_slug(det.get("label", "N/A"))
        category = _title_case_slug(det.get("category", "N/A"))
        confidence = float(det.get("confidence", 0.0) or 0.0)

        register.append(
            f"{idx:02d}. {label} | Category: {category} | Confidence: {confidence:.1%}"
        )

        if report_type != "summary":
            register.append(
                "    Bounding Box: "
                f"x1={bbox.get('x1', 0.0):.1f}, y1={bbox.get('y1', 0.0):.1f}, "
                f"x2={bbox.get('x2', 0.0):.1f}, y2={bbox.get('y2', 0.0):.1f}"
            )

    return register


def _report_title(report_type: str) -> str:
    titles = {
        "summary": "Executive Summary Report",
        "detailed": "Technical Detailed Assessment",
        "insurance": "Insurance Claim Support Report",
    }
    return titles.get(report_type, "Damage Assessment Report")


def _report_scope_statement(report_type: str) -> str:
    if report_type == "detailed":
        return "This document includes a detailed technical view of detected damage indicators and repair planning priorities."
    if report_type == "insurance":
        return "This document is structured to support preliminary insurance claim preparation and evidence organization."
    return "This document provides a concise executive view of detected damage patterns and immediate next actions."


def generate_report_text(scan_data: dict, user_data: dict, report_type: str = "summary") -> str:
    """
    Builds a formatted damage report string.
    scan_data  - dict with scan fields (severity, detections, etc.)
    user_data  - dict with user fields (name, email, plan)
    report_type - "summary" | "detailed" | "insurance"
    """

    now = datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M UTC")
    divider = "=" * 96
    sub_divider = "-" * 96
    ai_summary = _generate_ai_summary(scan_data, user_data, report_type)
    ai_report_body = _generate_ai_report_body(scan_data, user_data, report_type, ai_summary)
    detections = _sanitize_detections_for_reporting(scan_data.get("detections", []))
    labels_list = [l.strip() for l in str(scan_data.get("damage_labels", "") or "").split(",") if l.strip()]

    lines = [
        divider,
        f"{settings.APP_NAME}",
        _report_title(report_type),
        "Document Classification: Internal Assessment",
        divider,
        f"Generated On      : {now}",
        f"Prepared For      : {user_data.get('full_name', 'N/A')}",
        f"Contact Email     : {user_data.get('email', 'N/A')}",
        f"Customer Plan     : {str(user_data.get('plan', 'free')).upper()}",
        f"Assessment ID     : SCAN-{int(scan_data.get('id', 0) or 0):06d}",
        f"Source File       : {scan_data.get('original_filename', 'N/A')}",
        f"Source Type       : {str(scan_data.get('file_type', 'image')).upper()}",
        sub_divider,
        "",
    ]

    _append_section(lines, "1. Report Scope", _report_scope_statement(report_type))
    _append_section(lines, "2. Executive Summary", ai_summary)

    lines.append("3. Assessment Snapshot")
    lines.append(sub_divider)
    lines.append(f"Severity Classification : {str(scan_data.get('severity', 'N/A')).upper()}")
    lines.append(f"Total Detections        : {int(scan_data.get('total_detections', 0) or 0)}")
    lines.append(f"Average Confidence      : {float(scan_data.get('confidence_avg', 0) or 0.0):.1%}")
    lines.append(f"Processing Duration     : {int(scan_data.get('processing_time_ms', 0) or 0)} ms")
    lines.append(f"Scan Timestamp          : {scan_data.get('created_at', 'N/A')}")
    if labels_list:
        lines.append(f"Top Labels              : {', '.join(labels_list[:10])}")
    lines.append("")

    lines.append("4. Detected Damage Register")
    lines.append(sub_divider)
    for row in _detection_register_lines(detections, report_type):
        _append_wrapped(lines, row, width=96)
    lines.append("")

    next_section_num = 5
    if report_type == "detailed":
        _append_section(lines, f"{next_section_num}. Technical Assessment Narrative", ai_report_body)
        next_section_num += 1
        _append_section(
            lines,
            f"{next_section_num}. Repair Priority Guidance",
            "Prioritize safety-critical components first (windscreen, lights, mirrors), followed by structural and cosmetic panel restoration.",
        )
    elif report_type == "insurance":
        _append_section(lines, f"{next_section_num}. Claim Readiness Narrative", ai_report_body)
        next_section_num += 1
        _append_section(
            lines,
            f"{next_section_num}. Insurance Disclosure",
            "This AI-generated report is a preliminary decision-support artifact. Final claim outcomes require certified physical inspection and policy validation.",
        )
    else:
        _append_section(lines, f"{next_section_num}. Management Recommendation", ai_report_body)

    lines += [
        "",
        divider,
        f"Powered by {settings.APP_NAME} v{settings.APP_VERSION}",
        "End of Report",
        divider,
    ]

    return "\n".join(lines)


def _write_pdf_from_text(report_text: str, output_path: Path) -> None:
    A4, cm, Canvas = _load_reportlab_components()
    if Canvas is None or A4 is None or cm is None:
        raise RuntimeError("reportlab is required to generate PDF reports.")

    output_path.parent.mkdir(parents=True, exist_ok=True)

    pdf = Canvas(str(output_path), pagesize=A4)
    page_width, page_height = A4

    left_margin = 2.0 * cm
    top_margin = 2.0 * cm
    line_height = 14

    x = left_margin
    y = page_height - top_margin
    page_no = 1

    def draw_footer(current_page: int) -> None:
        pdf.setFont("Helvetica", 8)
        pdf.drawRightString(page_width - left_margin, 1.2 * cm, f"Page {current_page}")

    def new_page(current_page: int) -> int:
        draw_footer(current_page)
        pdf.showPage()
        return current_page + 1

    for raw_line in report_text.splitlines():
        line = raw_line.expandtabs(4)
        if y <= 2.2 * cm:
            page_no = new_page(page_no)
            y = page_height - top_margin

        if line.strip().startswith("==="):
            pdf.setLineWidth(0.8)
            pdf.line(left_margin, y, page_width - left_margin, y)
            y -= 10
            continue

        if line.strip().startswith("---"):
            pdf.setLineWidth(0.3)
            pdf.line(left_margin, y, page_width - left_margin, y)
            y -= 8
            continue

        is_header = line.strip().isupper() and len(line.strip()) <= 70
        if is_header:
            pdf.setFont("Helvetica-Bold", 10)
            pdf.drawString(x, y, line[:120])
            y -= line_height
            continue

        pdf.setFont("Helvetica", 9)
        wrapped = textwrap.wrap(line, width=120) or [""]
        for segment in wrapped:
            if y <= 2.2 * cm:
                page_no = new_page(page_no)
                y = page_height - top_margin
            pdf.drawString(x, y, segment[:140])
            y -= 12

    draw_footer(page_no)
    pdf.save()


def save_report(report_text: str, scan_id: int, user_id: int, report_type: str) -> str:
    """Saves report PDF to disk, returns the file path."""

    report_dir = Path(settings.REPORTS_DIR) / str(user_id)
    report_dir.mkdir(parents=True, exist_ok=True)

    filename = f"report_{scan_id}_{report_type}.pdf"
    report_path = report_dir / filename

    _write_pdf_from_text(report_text, report_path)

    return str(report_path)
