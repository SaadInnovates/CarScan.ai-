# websocket_service.py
# Manages active WebSocket connections per user
# Frontend connects and receives live scan progress updates
# e.g. "Uploading..." → "Running AI..." → "Done!"

from fastapi import WebSocket
from typing import Dict, List

# stores active connections: {user_id: [WebSocket, ...]}
_connections: Dict[int, List[WebSocket]] = {}


async def connect(user_id: int, websocket: WebSocket):
    """Called when a client opens a WebSocket connection"""
    await websocket.accept()
    if user_id not in _connections:
        _connections[user_id] = []
    _connections[user_id].append(websocket)
    print(f"[ws] User {user_id} connected ({len(_connections[user_id])} connections)")


def disconnect(user_id: int, websocket: WebSocket):
    """Called when a client closes the connection"""
    if user_id in _connections:
        _connections[user_id] = [
            ws for ws in _connections[user_id] if ws != websocket
        ]
        if not _connections[user_id]:
            del _connections[user_id]
    print(f"[ws] User {user_id} disconnected")


async def send_progress(user_id: int, step: str, percent: int, message: str):
    """
    Sends a progress update to all connections for a user.
    Frontend receives: {step, percent, message}
    Steps: "uploading" | "analyzing" | "annotating" | "saving" | "done" | "error"
    """
    if user_id not in _connections:
        return

    payload = {
        "step"   : step,
        "percent": percent,
        "message": message,
    }

    dead_connections = []
    for ws in _connections[user_id]:
        try:
            await ws.send_json(payload)
        except Exception:
            # connection is dead — mark for removal
            dead_connections.append(ws)

    # clean up dead connections
    for ws in dead_connections:
        _connections[user_id].remove(ws)


async def send_scan_complete(user_id: int, scan_id: int, severity: str):
    """Sends final completion event with scan ID so frontend can redirect"""
    await send_progress(
        user_id = user_id,
        step    = "done",
        percent = 100,
        message = f"Scan complete — {severity.upper()} severity detected",
    )
    # also send the scan_id so frontend knows where to navigate
    if user_id in _connections:
        for ws in _connections[user_id]:
            try:
                await ws.send_json({"step": "redirect", "scan_id": scan_id})
            except Exception:
                pass