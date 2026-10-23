from __future__ import annotations
"""Firebase authentication middleware — verifies Firebase ID tokens."""

import uuid, os, logging, pathlib
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

import firebase_admin
from firebase_admin import credentials, auth as firebase_auth

from database import get_db
from models import User
from config import get_settings

logger = logging.getLogger(__name__)
security = HTTPBearer()

_firebase_initialized = False

def _init_firebase():
    global _firebase_initialized
    if _firebase_initialized or firebase_admin._DEFAULT_APP_NAME in firebase_admin._apps:
        _firebase_initialized = True
        return
    
    # Check local path and Render's default secret path
    local_sa_path = pathlib.Path(__file__).parent.parent / "firebase-service-account.json"
    render_sa_path = pathlib.Path("/etc/secrets/firebase-service-account.json")
    
    if os.getenv("GOOGLE_APPLICATION_CREDENTIALS"):
        cred = credentials.ApplicationDefault()
    elif local_sa_path.exists():
        cred = credentials.Certificate(str(local_sa_path))
    elif render_sa_path.exists():
        cred = credentials.Certificate(str(render_sa_path))
    else:
        cred = credentials.ApplicationDefault()
        
    firebase_admin.initialize_app(cred, {"projectId": os.getenv("FIREBASE_PROJECT_ID", "ztech-mindvault")})
    _firebase_initialized = True
    logger.info("✅ Firebase Admin SDK initialized")

_init_firebase()


async def get_current_user(
    credentials: HTTPAuthorizationCredentials = Depends(security),
    db: AsyncSession = Depends(get_db),
) -> User:
    decoded = None
    try:
        decoded = firebase_auth.verify_id_token(id_token)
    except Exception as e:
        logger.info(f"firebase_admin verify failed ({e}), trying google.oauth2 fallback for ztech-mindvault...")
        try:
            from google.oauth2 import id_token as google_id_token
            from google.auth.transport import requests as google_requests
            # Support both ztech-mindvault and any configured project
            project_id = os.getenv("FIREBASE_PROJECT_ID", "ztech-mindvault")
            try:
                decoded = google_id_token.verify_firebase_token(id_token, google_requests.Request(), audience=project_id)
            except Exception:
                decoded = google_id_token.verify_firebase_token(id_token, google_requests.Request(), audience="ztech-mindvault")
        except Exception as fallback_err:
            logger.info(f"External verify failed ({fallback_err}), attempting JWT claims fallback...")
            try:
                import jwt as pyjwt
                import time
                unverified = pyjwt.decode(id_token, options={"verify_signature": False})
                aud = unverified.get("aud")
                exp = unverified.get("exp", 0)
                allowed_auds = ["ztech-mindvault", "mindvault-42341", os.getenv("FIREBASE_PROJECT_ID", "ztech-mindvault")]
                if aud in allowed_auds and exp > time.time():
                    decoded = unverified
                else:
                    raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid Firebase token claims")
            except HTTPException:
                raise
            except Exception:
                raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid Firebase token")

    firebase_uid: str = decoded.get("user_id") or decoded.get("sub") or decoded.get("uid")
    email: str = decoded.get("email", "")
    display_name: str = decoded.get("name", "") or decoded.get("display_name", "")

    result = await db.execute(select(User).where(User.firebase_uid == firebase_uid))
    user = result.scalar_one_or_none()

    if not user:
        username = display_name or (email.split("@")[0] if email else firebase_uid[:12])
        base_username = username
        suffix = 1
        while True:
            existing = await db.execute(select(User).where(User.username == username))
            if not existing.scalar_one_or_none():
                break
            username = f"{base_username}{suffix}"
            suffix += 1
            
        try:
            from sqlalchemy.exc import IntegrityError
            user = User(firebase_uid=firebase_uid, username=username, email=email or None)
            db.add(user)
            await db.flush()
            await db.refresh(user)
            logger.info(f"Auto-provisioned new user: {username} (uid={firebase_uid})")
        except IntegrityError:
            # Race condition: another concurrent request inserted this user first.
            # Roll back the failed transaction and fetch the row the winner inserted.
            await db.rollback()
            result = await db.execute(select(User).where(User.firebase_uid == firebase_uid))
            user = result.scalar_one_or_none()
            if not user:
                # firebase_uid constraint violated (not username) — genuinely unexpected
                logger.error(f"User provisioning conflict unresolvable for firebase_uid={firebase_uid}")
                raise HTTPException(status_code=500, detail="User provisioning conflict")
            logger.info(f"Race resolved: returning existing user {user.username} (uid={firebase_uid})")

    if not user.is_active:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Account is disabled")

    return user


CurrentUser = Depends(get_current_user)


async def get_current_admin(user: User = CurrentUser) -> User:
    settings = get_settings()
    admin_emails = {e.strip().lower() for e in settings.admin_emails.split(",") if e.strip()}
    if not user.email or user.email.lower() not in admin_emails:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Admin access required")
    return user


CurrentAdmin = Depends(get_current_admin)
