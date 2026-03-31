# main.py
# Complete app entry point with all routers + middleware + services

import os
from pathlib import Path
from contextlib import asynccontextmanager

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import JSONResponse

from config import settings
from database import engine
from models.db_models import Base
from middleware import LoggingMiddleware, RateLimitMiddleware

from routers.auth_router          import router as auth_router
from routers.scan_router          import router as scan_router
from routers.profile_router       import router as profile_router
from routers.report_router        import router as report_router
from routers.admin_router         import router as admin_router
from routers.admin_chatbot_router import router as admin_chatbot_router
from routers.export_router        import router as export_router
from routers.chat_router          import router as chat_router
from routers.debug_router         import router as debug_router


@asynccontextmanager
async def lifespan(app: FastAPI):
    print("[startup] Creating DB tables...")
    Base.metadata.create_all(bind=engine)

    print("[startup] Creating directories...")
    Path(settings.UPLOAD_DIR).mkdir(parents=True, exist_ok=True)
    Path(settings.REPORTS_DIR).mkdir(parents=True, exist_ok=True)

    # Warm the YOLO model at startup so the first request isn't slow.
    # _download_model_if_needed() runs inside get_model() automatically.
    print("[startup] Loading YOLOv8 model (downloading from HuggingFace if needed)...")
    try:
        from inference import get_model
        get_model()
        print("[startup] YOLOv8 model ready.")
    except Exception as e:
        print(f"[startup] WARNING: Model failed to load — {e}")
        print("[startup] The server will still start; inference will retry on first request.")

    yield
    print("[shutdown] Bye!")


app = FastAPI(
    title       = settings.APP_NAME,
    description = "Detect vehicle damage from images and videos using YOLOv8",
    version     = settings.APP_VERSION,
    lifespan    = lifespan,
)

# Middleware — order matters, outermost runs first
app.add_middleware(RateLimitMiddleware)
app.add_middleware(LoggingMiddleware)
app.add_middleware(
    CORSMiddleware,
    allow_origins     = [settings.FRONTEND_URL],
    allow_credentials = True,
    allow_methods     = ["*"],
    allow_headers     = ["*"],
)

# Static file serving (after routers to avoid shadowing API routes)
app.mount("/uploads", StaticFiles(directory=settings.UPLOAD_DIR), name="uploads")
app.mount("/reports", StaticFiles(directory=settings.REPORTS_DIR), name="reports")

PREFIX = "/api/v1"
app.include_router(auth_router,           prefix=PREFIX)
app.include_router(scan_router,           prefix=PREFIX)
app.include_router(profile_router,        prefix=PREFIX)
app.include_router(report_router,         prefix=PREFIX)
app.include_router(admin_router,          prefix=PREFIX)
app.include_router(admin_chatbot_router,  prefix=PREFIX)
app.include_router(export_router,         prefix=PREFIX)
app.include_router(chat_router,           prefix=PREFIX)
app.include_router(debug_router,          prefix=PREFIX)


@app.exception_handler(Exception)
async def global_exception_handler(request: Request, exc: Exception):
    print(f"[error] {request.method} {request.url.path} — {exc}")
    return JSONResponse(
        status_code=500,
        content={"detail": "Unexpected server error. Please try again."},
    )


@app.get("/health")
def health():
    from sqlalchemy import text
    from database import SessionLocal
    from inference import get_model, MODEL_PATH

    # Database check
    db_ok = False
    db    = SessionLocal()
    try:
        db.execute(text("SELECT 1"))
        db_ok = True
    except Exception:
        pass
    finally:
        db.close()

    # Model check
    model_loaded = False
    model_classes = 0
    try:
        m = get_model()
        model_loaded  = m is not None
        model_classes = len(m.names) if model_loaded else 0
    except Exception:
        pass

    return {
        "status"        : "ok",
        "version"       : settings.APP_VERSION,
        "db_connected"  : db_ok,
        "model_loaded"  : model_loaded,
        "model_path"    : MODEL_PATH,
        "model_classes" : model_classes,
        "inference_mode": "local_yolov8",
    }