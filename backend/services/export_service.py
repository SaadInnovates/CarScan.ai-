# export_service.py
# Exports scan history as CSV or JSON for download
# Used by the profile/history pages "Export my data" button

import csv
import json
import io
from datetime import datetime, timezone


def export_scans_csv(scans: list) -> str:
    """
    Takes a list of Scan ORM objects.
    Returns a CSV string the router can send as a file download.
    """
    output = io.StringIO()

    fieldnames = [
        "id", "file_type", "original_filename",
        "severity", "total_detections", "confidence_avg",
        "damage_labels", "processing_time_ms", "created_at"
    ]

    writer = csv.DictWriter(output, fieldnames=fieldnames)
    writer.writeheader()

    for scan in scans:
        writer.writerow({
            "id"                : scan.id,
            "file_type"         : scan.file_type,
            "original_filename" : scan.original_filename,
            "severity"          : scan.severity,
            "total_detections"  : scan.total_detections,
            "confidence_avg"    : scan.confidence_avg,
            "damage_labels"     : scan.damage_labels or "",
            "processing_time_ms": scan.processing_time_ms,
            "created_at"        : str(scan.created_at),
        })

    return output.getvalue()


def export_scans_json(scans: list) -> str:
    """
    Takes a list of Scan ORM objects.
    Returns a pretty JSON string the router can send as a file download.
    """
    data = []

    for scan in scans:
        entry = {
            "id"                : scan.id,
            "file_type"         : scan.file_type,
            "original_filename" : scan.original_filename,
            "severity"          : scan.severity,
            "total_detections"  : scan.total_detections,
            "confidence_avg"    : scan.confidence_avg,
            "damage_labels"     : scan.damage_labels or "",
            "processing_time_ms": scan.processing_time_ms,
            "created_at"        : str(scan.created_at),
            "detections"        : scan.result_json.get("detections", []) if scan.result_json else [],
        }
        data.append(entry)

    return json.dumps({"scans": data, "total": len(data)}, indent=2)