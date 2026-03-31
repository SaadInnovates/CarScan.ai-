# schemas.py
# Data shapes for API input/output — updated for image + video support

from pydantic import BaseModel, EmailStr, field_validator
from typing import Optional
from datetime import datetime


# ── AUTH ─────────────────────────────────────────────────────

class UserCreate(BaseModel):
    full_name: str
    email: EmailStr
    password: str

    @field_validator("password")
    @classmethod
    def password_min_length(cls, v):
        if len(v) < 6:
            raise ValueError("Password must be at least 6 characters")
        return v

class UserLogin(BaseModel):
    email: EmailStr
    password: str

class UserOut(BaseModel):
    id: int
    email: str
    full_name: str
    plan: str
    avatar_url: Optional[str] = None
    is_active: bool
    created_at: datetime
    last_login: Optional[datetime] = None
    model_config = {"from_attributes": True}

class UserUpdate(BaseModel):
    full_name: Optional[str] = None
    avatar_url: Optional[str] = None

class ChangePasswordRequest(BaseModel):
    current_password: str
    new_password: str

    @field_validator("new_password")
    @classmethod
    def password_min_length(cls, v):
        if len(v) < 6:
            raise ValueError("Password must be at least 6 characters")
        return v

class Token(BaseModel):
    access_token: str
    token_type: str = "bearer"
    expires_in: int

class TokenData(BaseModel):
    user_id: Optional[int] = None
    email: Optional[str] = None


# ── DETECTIONS ────────────────────────────────────────────────

class BoundingBox(BaseModel):
    x1: float
    y1: float
    x2: float
    y2: float

class Detection(BaseModel):
    label: str               # exact class name e.g. "bonnet-dent"
    confidence: float        # 0.0 to 1.0
    bbox: BoundingBox
    damage_category: str     # grouped category e.g. "Body Dent"
    severity_score: float
    frame: Optional[int] = None   # frame number (video only)


# ── VIDEO SUMMARY ─────────────────────────────────────────────

class VideoSummary(BaseModel):
    total_frames    : int
    frames_analyzed : int
    total_detections: int
    unique_damages  : list[str]
    damage_counts   : dict
    severity        : str
    confidence_avg  : float
    processing_time_ms: int
    video_fps       : float
    video_resolution: str


# ── SCAN OUTPUT ───────────────────────────────────────────────

class ScanOut(BaseModel):
    id                  : int
    original_filename   : str
    file_type           : str          # "image" or "video"
    thumbnail_path      : Optional[str] = None
    annotated_image_path: Optional[str] = None
    annotated_video_path: Optional[str] = None
    playback_url        : Optional[str] = None
    total_detections    : int
    severity            : str
    confidence_avg      : float
    processing_time_ms  : int
    created_at          : datetime
    detections          : list[Detection] = []
    video_summary       : Optional[VideoSummary] = None
    damage_labels       : Optional[str] = None
    model_config = {"from_attributes": True}

class ScanSummary(BaseModel):
    id               : int
    original_filename: str
    file_type        : str
    thumbnail_path   : Optional[str] = None
    severity         : str
    total_detections : int
    created_at       : datetime
    model_config = {"from_attributes": True}

class PaginatedScans(BaseModel):
    items   : list[ScanSummary]
    total   : int
    page    : int
    per_page: int
    pages   : int


# ── USAGE / STATS ─────────────────────────────────────────────

class UsageStats(BaseModel):
    scans_this_month    : int
    scan_limit          : int
    scans_remaining     : int
    plan                : str
    total_scans_all_time: int
    reset_date          : str

class DamageStats(BaseModel):
    total_scans       : int
    severity_breakdown: dict
    top_damage_types  : list
    avg_confidence    : float
    scans_by_month    : list


# ── REPORTS / NOTIFICATIONS ───────────────────────────────────

class ReportOut(BaseModel):
    id          : int
    scan_id     : int
    report_type : str
    pdf_path    : Optional[str] = None
    generated_at: datetime
    model_config = {"from_attributes": True}

class NotificationOut(BaseModel):
    id        : int
    message   : str
    type      : str
    is_read   : bool
    created_at: datetime
    model_config = {"from_attributes": True}


class SubscriptionRequestOut(BaseModel):
    id: int
    user_id: int
    payment_method: str
    payment_number: str
    receipt_path: str
    status: str
    admin_note: Optional[str] = None
    reviewed_by_admin_id: Optional[int] = None
    created_at: datetime
    reviewed_at: Optional[datetime] = None
    model_config = {"from_attributes": True}


class AdminSubscriptionRequestOut(BaseModel):
    id: int
    user_id: int
    user_email: str
    user_full_name: str
    user_plan: str
    payment_method: str
    payment_number: str
    receipt_path: str
    status: str
    admin_note: Optional[str] = None
    created_at: datetime
    reviewed_at: Optional[datetime] = None