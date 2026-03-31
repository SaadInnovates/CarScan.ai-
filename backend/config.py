# config.py
# Single source of truth for all app settings
# Everything reads from .env — no hardcoded values anywhere else

from pydantic_settings import BaseSettings
from pydantic import field_validator
from functools import lru_cache
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent

class Settings(BaseSettings):
    # app
    APP_NAME: str              = "AI Vehicle Damage Analyzer"
    APP_VERSION: str           = "1.0.0"
    DEBUG: bool                = False

    # auth
    SECRET_KEY: str            = "changeme-supersecret"
    ALGORITHM: str             = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 30

    # database
    DATABASE_URL: str          = "sqlite:///./damage_analyzer.db"

    # model (no local model path needed)
    MODEL_PATH: str            = "huggingface-api"

    # uploads
    UPLOAD_DIR: str            = str(BASE_DIR / "uploads")
    REPORTS_DIR: str           = str(BASE_DIR / "reports")
    MAX_FILE_SIZE_MB: int      = 50
    THUMBNAIL_SIZE: int        = 200

    # plans
    MAX_FREE_SCANS_PER_MONTH: int  = 10
    MAX_PRO_SCANS_PER_MONTH: int   = 500
    ENABLE_ALL_PRO_FEATURES: bool  = True

    # LLM report generation
    GROQ_API_KEY: str              = ""
    GROQ_MODEL: str                = "llama-3.3-70b-versatile"

    # email (optional — leave blank to disable email)
    SMTP_HOST: str             = ""
    SMTP_PORT: int             = 587
    SMTP_USER: str             = ""
    SMTP_PASSWORD: str         = ""
    EMAIL_FROM: str            = "noreply@vehicledamage.ai"

    # frontend URL (used in email links)
    FRONTEND_URL: str          = "http://localhost:5173"

    # google oauth (optional)
    GOOGLE_CLIENT_ID: str      = ""
    GOOGLE_CLIENT_SECRET: str  = ""
    GOOGLE_REDIRECT_URI: str   = ""
    GOOGLE_OAUTH_STATE_EXPIRE_MINUTES: int = 10

    @field_validator("MODEL_PATH", "UPLOAD_DIR", "REPORTS_DIR", mode="before")
    @classmethod
    def resolve_backend_relative_paths(cls, value: str) -> str:
        path = Path(value)
        if not path.is_absolute():
            path = BASE_DIR / path
        return str(path.resolve())

    class Config:
        env_file = ".env"
        extra    = "ignore"


@lru_cache()
def get_settings() -> Settings:
    # cached so we only read .env once per app lifetime
    return Settings()

# shortcut used throughout the app
settings = get_settings()