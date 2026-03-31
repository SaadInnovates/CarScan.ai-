# db_models.py
# All database tables — now includes file_type to track image vs video scans

from sqlalchemy import (
    Column, Integer, String, Float,
    Boolean, Text, DateTime, ForeignKey, JSON
)
from sqlalchemy.orm import relationship
from datetime import datetime, timezone
from database import Base


def now_utc():
    return datetime.now(timezone.utc)


class User(Base):
    __tablename__ = "users"

    id              = Column(Integer, primary_key=True, index=True)
    email           = Column(String, unique=True, index=True, nullable=False)
    hashed_password = Column(String, nullable=False)
    full_name       = Column(String, nullable=False)
    avatar_url      = Column(String, nullable=True)
    plan            = Column(String, default="free")   # "free" or "pro"
    is_active       = Column(Boolean, default=True)
    is_verified     = Column(Boolean, default=False)
    is_admin        = Column(Boolean, default=False)  # True for admin users
    created_at      = Column(DateTime(timezone=True), default=now_utc)
    updated_at      = Column(DateTime(timezone=True), default=now_utc, onupdate=now_utc)
    last_login      = Column(DateTime(timezone=True), nullable=True)

    scans         = relationship("Scan", back_populates="user")
    usage_logs    = relationship("UsageLog", back_populates="user")
    notifications = relationship("Notification", back_populates="user")
    reports       = relationship("DamageReport", back_populates="user")
    scan_chat_messages = relationship("ScanChatMessage", back_populates="user")
    subscription_requests = relationship("SubscriptionRequest", back_populates="user")


class Scan(Base):
    __tablename__ = "scans"

    id                   = Column(Integer, primary_key=True, index=True)
    user_id              = Column(Integer, ForeignKey("users.id"), nullable=False)

    original_filename    = Column(String, nullable=False)

    # "image" or "video"
    file_type            = Column(String, default="image")

    image_path           = Column(String, nullable=False)    # original upload path
    thumbnail_path       = Column(String, nullable=True)     # preview image
    annotated_image_path = Column(String, nullable=True)     # photo with boxes drawn
    annotated_video_path = Column(String, nullable=True)     # video with boxes drawn

    # full JSON result: detections list + summary
    result_json          = Column(JSON, nullable=True)

    # comma-separated unique damage labels found e.g. "bonnet-dent,fender-dent"
    damage_labels        = Column(Text, nullable=True)

    total_detections     = Column(Integer, default=0)
    severity             = Column(String, default="low")     # low/medium/high/critical
    confidence_avg       = Column(Float, default=0.0)
    processing_time_ms   = Column(Integer, default=0)
    is_deleted           = Column(Boolean, default=False)
    created_at           = Column(DateTime(timezone=True), default=now_utc)

    # video-specific metadata
    video_duration_sec   = Column(Float, nullable=True)
    video_fps            = Column(Float, nullable=True)
    video_resolution     = Column(String, nullable=True)     # e.g. "1920x1080"
    frames_analyzed      = Column(Integer, nullable=True)

    user    = relationship("User", back_populates="scans")
    reports = relationship("DamageReport", back_populates="scan")
    chat_messages = relationship("ScanChatMessage", back_populates="scan")


class DamageReport(Base):
    __tablename__ = "damage_reports"

    id           = Column(Integer, primary_key=True, index=True)
    scan_id      = Column(Integer, ForeignKey("scans.id"), nullable=False)
    user_id      = Column(Integer, ForeignKey("users.id"), nullable=False)
    report_type  = Column(String, default="summary")   # summary/detailed/insurance
    pdf_path     = Column(String, nullable=True)
    generated_at = Column(DateTime(timezone=True), default=now_utc)

    scan = relationship("Scan", back_populates="reports")
    user = relationship("User", back_populates="reports")


class UsageLog(Base):
    __tablename__ = "usage_logs"

    id           = Column(Integer, primary_key=True, index=True)
    user_id      = Column(Integer, ForeignKey("users.id"), nullable=False)
    year_month   = Column(String, nullable=False)   # "2025-06"
    scan_count   = Column(Integer, default=0)
    last_scan_at = Column(DateTime(timezone=True), nullable=True)

    user = relationship("User", back_populates="usage_logs")


class Notification(Base):
    __tablename__ = "notifications"

    id         = Column(Integer, primary_key=True, index=True)
    user_id    = Column(Integer, ForeignKey("users.id"), nullable=False)
    message    = Column(String, nullable=False)
    type       = Column(String, default="info")   # info/warning/success
    is_read    = Column(Boolean, default=False)
    created_at = Column(DateTime(timezone=True), default=now_utc)

    user = relationship("User", back_populates="notifications")


class ScanChatMessage(Base):
    __tablename__ = "scan_chat_messages"

    id         = Column(Integer, primary_key=True, index=True)
    scan_id    = Column(Integer, ForeignKey("scans.id"), nullable=False, index=True)
    user_id    = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    role       = Column(String, nullable=False)  # "user" or "assistant"
    message    = Column(Text, nullable=False)
    created_at = Column(DateTime(timezone=True), default=now_utc)

    scan = relationship("Scan", back_populates="chat_messages")
    user = relationship("User", back_populates="scan_chat_messages")


class SubscriptionRequest(Base):
    __tablename__ = "subscription_requests"

    id                   = Column(Integer, primary_key=True, index=True)
    user_id              = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    payment_method       = Column(String, nullable=False)  # jazzcash | easypaisa
    payment_number       = Column(String, nullable=False, default="+92 3371458542")
    receipt_path         = Column(String, nullable=False)
    status               = Column(String, default="pending", nullable=False)  # pending | approved | rejected
    admin_note           = Column(Text, nullable=True)
    reviewed_by_admin_id = Column(Integer, nullable=True)
    created_at           = Column(DateTime(timezone=True), default=now_utc)
    reviewed_at          = Column(DateTime(timezone=True), nullable=True)

    user = relationship("User", back_populates="subscription_requests")