from fastapi import APIRouter, Depends
from auth import get_current_active_user

router = APIRouter(prefix="/debug")

@router.get("/me")
def debug_me(current_user = Depends(get_current_active_user)):
    return {
        "id": getattr(current_user, "id", None),
        "email": getattr(current_user, "email", None),
        "plan": getattr(current_user, "plan", None),
        "role": getattr(current_user, "role", None),
        "is_admin": getattr(current_user, "is_admin", None),
        "is_active": getattr(current_user, "is_active", None),
        "is_verified": getattr(current_user, "is_verified", None),
    }
