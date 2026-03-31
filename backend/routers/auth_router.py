# auth_router.py
# Handles register, login, profile update, password change, delete account
# pyright: reportGeneralTypeIssues=false, reportArgumentType=false, reportAttributeAccessIssue=false, reportOperatorIssue=false, reportCallIssue=false

from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.responses import RedirectResponse
from sqlalchemy.orm import Session
from datetime import timedelta, datetime, timezone
import os
from urllib.parse import quote_plus, urlencode
import uuid
import requests

from database import get_db
from models.db_models import User, UsageLog, Notification
from schemas import UserCreate, UserLogin, UserOut, UserUpdate, Token, ChangePasswordRequest
from auth import (
    verify_password, get_password_hash,
    create_access_token, get_current_active_user,
    create_email_verification_token, decode_email_verification_token,
    create_google_oauth_state_token, decode_google_oauth_state_token,
)
from utils import get_month_key
from dotenv import load_dotenv
from services.email_service import send_verification_email, is_email_configured
from config import settings

load_dotenv()

EXPIRE_MINS = int(os.getenv("ACCESS_TOKEN_EXPIRE_MINUTES", 30))

router = APIRouter(prefix="/auth", tags=["Authentication"])


@router.post("/register", response_model=dict)
def register(user_data: UserCreate, db: Session = Depends(get_db)):
    # check if email already exists
    existing = db.query(User).filter(User.email == user_data.email).first()
    if existing:
        raise HTTPException(
            status_code=400,
            detail="An account with this email already exists."
        )

    # create user
    new_user = User(
        email           = user_data.email,
        hashed_password = get_password_hash(user_data.password),
        full_name       = user_data.full_name,
        plan            = "free",
        is_active       = True,
        is_verified     = False,
    )
    db.add(new_user)
    db.commit()
    db.refresh(new_user)

    # create first usage log entry for this month
    db.add(UsageLog(
        user_id    = new_user.id,
        year_month = get_month_key(),
        scan_count = 0,
    ))

    # welcome notification
    db.add(Notification(
        user_id = new_user.id,
        message = f"Welcome {new_user.full_name}! You have 10 free scans this month.",
        type    = "success",
    ))
    db.commit()

    verify_token = create_email_verification_token(new_user.email, int(new_user.id))
    email_sent = send_verification_email(new_user.email, new_user.full_name, verify_token)
    response = {
        "detail"      : "Registration successful. Please verify your email before logging in.",
        "requires_verification": True,
        "email_sent": email_sent,
        "user"        : {
            "id"       : new_user.id,
            "email"    : new_user.email,
            "full_name": new_user.full_name,
            "plan"     : new_user.plan,
            "is_verified": new_user.is_verified,
        }
    }

    return response


@router.post("/login", response_model=dict)
def login(user_data: UserLogin, db: Session = Depends(get_db)):
    # find user by email
    user = db.query(User).filter(User.email == user_data.email).first()

    if not user or not verify_password(user_data.password, user.hashed_password):
        raise HTTPException(
            status_code=401,
            detail="Incorrect email or password."
        )

    if not user.is_active:
        raise HTTPException(
            status_code=403,
            detail="Your account has been deactivated."
        )

    if not user.is_verified:
        raise HTTPException(
            status_code=403,
            detail={
                "code": "EMAIL_NOT_VERIFIED",
                "message": "Please verify your email before logging in.",
                "email": user.email,
                "requires_verification": True,
            }
        )

    # update last login time
    user.last_login = datetime.now(timezone.utc)
    db.commit()

    token = create_access_token(
        data          = {"sub": user.email, "user_id": user.id},
        expires_delta = timedelta(minutes=EXPIRE_MINS)
    )

    return {
        "access_token": token,
        "token_type"  : "bearer",
        "expires_in"  : EXPIRE_MINS * 60,
        "user"        : {
            "id"        : user.id,
            "email"     : user.email,
            "full_name" : user.full_name,
            "plan"      : user.plan,
            "avatar_url": user.avatar_url,
            "last_login": str(user.last_login),
        }
    }


@router.get("/verify-email")
def verify_email(token: str, db: Session = Depends(get_db)):
    token_data = decode_email_verification_token(token)
    if token_data is None:
        raise HTTPException(status_code=400, detail="Invalid or expired verification link.")

    user = db.query(User).filter(
        User.id == token_data.user_id,
        User.email == token_data.email,
    ).first()

    if not user:
        raise HTTPException(status_code=404, detail="User not found.")

    if user.is_verified:
        return {"detail": "Email already verified."}

    user.is_verified = True
    db.add(Notification(
        user_id=user.id,
        message="Email verified successfully. Your account is now active.",
        type="success",
    ))
    db.commit()

    return {"detail": "Email verified successfully. You can now log in."}


@router.post("/resend-verification")
def resend_verification(email: str, db: Session = Depends(get_db)):
    user = db.query(User).filter(User.email == email).first()
    if not user:
        return {"detail": "If the account exists, a verification email has been sent."}

    if user.is_verified:
        return {"detail": "Email is already verified."}

    verify_token = create_email_verification_token(user.email, int(user.id))
    email_sent = send_verification_email(user.email, user.full_name, verify_token)

    if not is_email_configured():
        return {
            "detail": "Verification request accepted. Email service is currently unavailable.",
            "email_sent": False,
        }

    return {
        "detail": "Verification email sent. Please check your inbox.",
        "email_sent": email_sent,
    }


@router.get("/google/url")
def google_auth_url():
    url = "/api/v1/auth/google/login"
    enabled = bool(
        settings.GOOGLE_CLIENT_ID.strip()
        and settings.GOOGLE_CLIENT_SECRET.strip()
        and settings.GOOGLE_REDIRECT_URI.strip()
    )
    return {
        "enabled": enabled,
        "auth_url": url,
    }


@router.get("/google/login")
def google_login_redirect():
    if not (
        settings.GOOGLE_CLIENT_ID.strip()
        and settings.GOOGLE_CLIENT_SECRET.strip()
        and settings.GOOGLE_REDIRECT_URI.strip()
    ):
        return RedirectResponse(
            url=f"{settings.FRONTEND_URL.rstrip('/')}/auth?oauth_error={quote_plus('Google sign-in is not configured.')}"
        )

    state_token = create_google_oauth_state_token(settings.GOOGLE_OAUTH_STATE_EXPIRE_MINUTES)

    params = {
        "client_id": settings.GOOGLE_CLIENT_ID,
        "redirect_uri": settings.GOOGLE_REDIRECT_URI,
        "response_type": "code",
        "scope": "openid email profile",
        "access_type": "online",
        "prompt": "select_account",
        "state": state_token,
    }

    google_url = f"https://accounts.google.com/o/oauth2/v2/auth?{urlencode(params)}"
    return RedirectResponse(url=google_url)


@router.get("/google/callback")
def google_callback(code: str | None = None, state: str | None = None, db: Session = Depends(get_db)):
    frontend_auth = f"{settings.FRONTEND_URL.rstrip('/')}/auth"

    if not code or not state:
        return RedirectResponse(url=f"{frontend_auth}?oauth_error={quote_plus('Google sign-in failed. Missing authorization data.')}" )

    if not decode_google_oauth_state_token(state):
        return RedirectResponse(url=f"{frontend_auth}?oauth_error={quote_plus('Google sign-in failed. Invalid or expired session state.')}" )

    if not (
        settings.GOOGLE_CLIENT_ID.strip()
        and settings.GOOGLE_CLIENT_SECRET.strip()
        and settings.GOOGLE_REDIRECT_URI.strip()
    ):
        return RedirectResponse(url=f"{frontend_auth}?oauth_error={quote_plus('Google sign-in is not configured.')}" )

    try:
        token_resp = requests.post(
            "https://oauth2.googleapis.com/token",
            data={
                "code": code,
                "client_id": settings.GOOGLE_CLIENT_ID,
                "client_secret": settings.GOOGLE_CLIENT_SECRET,
                "redirect_uri": settings.GOOGLE_REDIRECT_URI,
                "grant_type": "authorization_code",
            },
            timeout=15,
        )
        token_data = token_resp.json()
        google_access_token = token_data.get("access_token")
        if not google_access_token:
            return RedirectResponse(url=f"{frontend_auth}?oauth_error={quote_plus('Google sign-in failed during token exchange.')}" )

        profile_resp = requests.get(
            "https://www.googleapis.com/oauth2/v3/userinfo",
            headers={"Authorization": f"Bearer {google_access_token}"},
            timeout=15,
        )
        profile_data = profile_resp.json()

        email = str(profile_data.get("email", "")).strip().lower()
        full_name = str(profile_data.get("name", "")).strip() or "Google User"
        avatar_url = str(profile_data.get("picture", "")).strip() or None
        email_verified = bool(profile_data.get("email_verified", False))

        if not email:
            return RedirectResponse(url=f"{frontend_auth}?oauth_error={quote_plus('Google account did not return an email address.')}" )

        user = db.query(User).filter(User.email == email).first()

        if user is None:
            random_password = uuid.uuid4().hex + uuid.uuid4().hex
            user = User(
                email=email,
                hashed_password=get_password_hash(random_password),
                full_name=full_name,
                avatar_url=avatar_url,
                plan="free",
                is_active=True,
                is_verified=email_verified,
                last_login=datetime.now(timezone.utc),
            )
            db.add(user)
            db.commit()
            db.refresh(user)

            db.add(UsageLog(
                user_id=user.id,
                year_month=get_month_key(),
                scan_count=0,
            ))
            db.add(Notification(
                user_id=user.id,
                message=f"Welcome {user.full_name}! Your Google account is connected.",
                type="success",
            ))
            db.commit()
        else:
            if not user.is_active:
                return RedirectResponse(url=f"{frontend_auth}?oauth_error={quote_plus('Your account has been deactivated.')}" )

            if email_verified and not user.is_verified:
                user.is_verified = True

            if avatar_url and not user.avatar_url:
                user.avatar_url = avatar_url

            if full_name and user.full_name != full_name:
                user.full_name = full_name

            user.last_login = datetime.now(timezone.utc)
            db.commit()

        app_token = create_access_token(
            data={"sub": user.email, "user_id": user.id},
            expires_delta=timedelta(minutes=EXPIRE_MINS),
        )

        return RedirectResponse(url=f"{frontend_auth}?oauth_token={quote_plus(app_token)}")
    except Exception:
        return RedirectResponse(url=f"{frontend_auth}?oauth_error={quote_plus('Google sign-in failed. Please try again.')}" )


@router.get("/me", response_model=UserOut)
def get_me(current_user: User = Depends(get_current_active_user)):
    # returns the currently logged-in user's profile
    return current_user


@router.put("/me", response_model=UserOut)
def update_me(
    update_data : UserUpdate,
    db          : Session = Depends(get_db),
    current_user: User    = Depends(get_current_active_user)
):
    # update name or avatar
    if update_data.full_name is not None:
        current_user.full_name = update_data.full_name
    if update_data.avatar_url is not None:
        current_user.avatar_url = update_data.avatar_url

    db.commit()
    db.refresh(current_user)
    return current_user


@router.post("/change-password")
def change_password(
    data        : ChangePasswordRequest,
    db          : Session = Depends(get_db),
    current_user: User    = Depends(get_current_active_user)
):
    # verify old password first
    if not verify_password(data.current_password, current_user.hashed_password):
        raise HTTPException(status_code=400, detail="Current password is incorrect.")

    current_user.hashed_password = get_password_hash(data.new_password)
    db.commit()

    return {"detail": "Password changed successfully."}


@router.delete("/account")
def delete_account(
    db          : Session = Depends(get_db),
    current_user: User    = Depends(get_current_active_user)
):
    # soft delete — deactivate instead of removing data
    current_user.is_active = False
    db.commit()
    return {"detail": "Account deactivated successfully."}