from fastapi import HTTPException, status, Depends
from models.db_models import User
from typing import TYPE_CHECKING
if TYPE_CHECKING:
    from sqlalchemy.orm import Session
# auth.py
# Handles password hashing, JWT token creation, and identifying current user
# pyright: reportGeneralTypeIssues=false, reportArgumentType=false, reportAttributeAccessIssue=false, reportOperatorIssue=false, reportCallIssue=false

from datetime import datetime, timedelta, timezone
from typing import Optional
import hashlib
import secrets
import bcrypt
from jose import JWTError, jwt
from fastapi import Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer
from sqlalchemy.orm import Session
from dotenv import load_dotenv
import os

from database import get_db
from models.db_models import User
from schemas import TokenData

load_dotenv()

SECRET_KEY  = os.getenv("SECRET_KEY", "changeme-supersecret")
ALGORITHM   = os.getenv("ALGORITHM", "HS256")
EXPIRE_MINS = int(os.getenv("ACCESS_TOKEN_EXPIRE_MINUTES", 30))
EMAIL_VERIFY_EXPIRE_HOURS = int(os.getenv("EMAIL_VERIFY_EXPIRE_HOURS", 24))
GOOGLE_OAUTH_STATE_EXPIRE_MINUTES = int(os.getenv("GOOGLE_OAUTH_STATE_EXPIRE_MINUTES", 10))

# tells FastAPI where the login endpoint is so it can grab the token
oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/api/v1/auth/login")


def _bcrypt_sha256_bytes(password: str) -> bytes:
    # Pre-hash with sha256 so bcrypt never receives >72 bytes directly.
    digest = hashlib.sha256(password.encode("utf-8")).hexdigest()
    return digest.encode("utf-8")


def verify_password(plain_password: str, hashed_password: str) -> bool:
    # Supports both legacy raw-bcrypt hashes and new bcrypt-sha256 style hashes.
    hashed = hashed_password.encode("utf-8")

    try:
        if bcrypt.checkpw(plain_password.encode("utf-8"), hashed):
            return True
    except ValueError:
        # bcrypt raises for >72-byte inputs; we'll validate with pre-hash below.
        pass

    try:
        return bcrypt.checkpw(_bcrypt_sha256_bytes(plain_password), hashed)
    except ValueError:
        return False


def get_password_hash(password: str) -> str:
    # bcrypt-sha256 style hash avoids bcrypt's 72-byte password limit.
    return bcrypt.hashpw(_bcrypt_sha256_bytes(password), bcrypt.gensalt()).decode("utf-8")


def create_access_token(data: dict, expires_delta: Optional[timedelta] = None) -> str:
    # creates a signed JWT token with an expiry time
    to_encode = data.copy()
    expire = datetime.now(timezone.utc) + (expires_delta or timedelta(minutes=EXPIRE_MINS))
    to_encode.update({"exp": expire})
    return jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)


def create_email_verification_token(email: str, user_id: int, expires_hours: int | None = None) -> str:
    expire_hours = expires_hours if expires_hours is not None else EMAIL_VERIFY_EXPIRE_HOURS
    payload = {
        "sub": email,
        "user_id": user_id,
        "purpose": "email_verification",
        "exp": datetime.now(timezone.utc) + timedelta(hours=expire_hours),
    }
    return jwt.encode(payload, SECRET_KEY, algorithm=ALGORITHM)


def decode_email_verification_token(token: str) -> Optional[TokenData]:
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        if payload.get("purpose") != "email_verification":
            return None

        user_id = payload.get("user_id")
        email = payload.get("sub")
        if user_id is None or email is None:
            return None

        return TokenData(user_id=int(user_id), email=str(email))
    except JWTError:
        return None


def create_google_oauth_state_token(expires_minutes: int | None = None) -> str:
    ttl = expires_minutes if expires_minutes is not None else GOOGLE_OAUTH_STATE_EXPIRE_MINUTES
    payload = {
        "purpose": "google_oauth_state",
        "nonce": secrets.token_urlsafe(16),
        "exp": datetime.now(timezone.utc) + timedelta(minutes=ttl),
    }
    return jwt.encode(payload, SECRET_KEY, algorithm=ALGORITHM)


def decode_google_oauth_state_token(token: str) -> bool:
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        return payload.get("purpose") == "google_oauth_state"
    except JWTError:
        return False


def get_current_user(
    token: str = Depends(oauth2_scheme),
    db: Session = Depends(get_db)
) -> User:
    # decodes the JWT token and returns the matching user from DB
    import logging
    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Invalid or expired token. Please log in again.",
        headers={"WWW-Authenticate": "Bearer"},
    )
    try:
        payload   = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        user_id   = payload.get("user_id")
        email     = payload.get("sub")
        logging.warning(f"[AUTH] Decoded token: user_id={user_id}, email={email}")
        if user_id is None or email is None:
            logging.error(f"[AUTH] Token missing user_id or email: {payload}")
            raise credentials_exception
        token_data = TokenData(user_id=user_id, email=email)
    except JWTError as e:
        logging.error(f"[AUTH] JWTError: {e}")
        raise credentials_exception

    # fetch user from database
    user = db.query(User).filter(User.id == token_data.user_id).first()
    if user is None:
        logging.error(f"[AUTH] No user found for user_id={token_data.user_id}")
        raise credentials_exception
    logging.warning(f"[AUTH] Authenticated user: id={user.id}, email={user.email}, plan={getattr(user, 'plan', None)}, is_active={getattr(user, 'is_active', None)}, is_verified={getattr(user, 'is_verified', None)}")
    return user


def get_current_active_user(current_user: User = Depends(get_current_user)) -> User:
    # extra check — makes sure account is not deactivated
    import logging
    is_active = getattr(current_user, "is_active", False)
    if is_active is not True:
        logging.error(f"[AUTH] User deactivated: id={getattr(current_user, 'id', None)}")
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Your account has been deactivated."
        )

    is_verified = getattr(current_user, "is_verified", False)
    if is_verified is not True:
        logging.error(f"[AUTH] User not verified: id={getattr(current_user, 'id', None)}")
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Please verify your email before continuing."
        )
    return current_user

# Admin dependency (must be after get_current_active_user)
def require_admin(current_user: User = Depends(get_current_active_user)) -> User:
    if not getattr(current_user, "is_admin", False):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You do not have admin privileges."
        )
    return current_user