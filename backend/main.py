import hashlib
import hmac
import os
import secrets
import time
from datetime import datetime, timedelta, timezone
from typing import List, Optional

from dotenv import load_dotenv
from fastapi import Depends, FastAPI, HTTPException, Query, Response, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy import func, or_
from sqlalchemy.orm import Session

import models
import schemas
from database import Base, engine, get_db
from email_service import GmailSMTPConfigurationError, mask_email, send_otp_email

load_dotenv()

# Creates tables in database if they do not exist yet.
Base.metadata.create_all(bind=engine)

app = FastAPI(title="EMPSYS CRM API", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        os.getenv("FRONTEND_ORIGIN", "http://localhost:5173"),
        "http://127.0.0.1:5173",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

SECRET_KEY = os.getenv("SECRET_KEY", "empsys-crm-secret-key-32890523098520935")
security = HTTPBearer(auto_error=False)


@app.get("/")
def root():
    return {
        "status": "online",
        "service": "EMPSYS CRM API",
        "docs_url": "/docs",
    }


def hash_password(password: str) -> str:
    """Generate a salted PBKDF2-HMAC-SHA256 password hash."""
    salt = secrets.token_hex(16)
    key = hashlib.pbkdf2_hmac("sha256", password.encode("utf-8"), salt.encode("utf-8"), 100000)
    return f"{salt}${key.hex()}"


def verify_password(password: str, stored_hash: str) -> bool:
    """Verify password against salt$hash using timing-safe comparison."""
    try:
        salt, key_hex = stored_hash.split("$", 1)
        test_key = hashlib.pbkdf2_hmac("sha256", password.encode("utf-8"), salt.encode("utf-8"), 100000)
        return hmac.compare_digest(test_key.hex(), key_hex)
    except Exception:
        return False


def create_token(user_id: int) -> str:
    """Generate a signed bearer token for user_id."""
    timestamp = str(int(time.time()))
    payload = f"{user_id}:{timestamp}"
    signature = hmac.new(
        SECRET_KEY.encode("utf-8"), payload.encode("utf-8"), hashlib.sha256
    ).hexdigest()
    return f"{user_id}.{timestamp}.{signature}"


def verify_token(token: str) -> Optional[int]:
    """Verify signed bearer token and return user_id if valid."""
    try:
        parts = token.split(".")
        if len(parts) != 3:
            return None
        user_id_str, timestamp_str, sig = parts
        user_id = int(user_id_str)
        payload = f"{user_id}:{timestamp_str}"
        expected = hmac.new(
            SECRET_KEY.encode("utf-8"), payload.encode("utf-8"), hashlib.sha256
        ).hexdigest()
        if not hmac.compare_digest(sig, expected):
            return None
        return user_id
    except Exception:
        return None


def get_current_user(
    credentials: Optional[HTTPAuthorizationCredentials] = Depends(security),
    db: Session = Depends(get_db),
) -> models.User:
    """Dependency to retrieve and validate authenticated user from Bearer token."""
    if not credentials or not credentials.credentials:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Authentication credentials required",
            headers={"WWW-Authenticate": "Bearer"},
        )
    user_id = verify_token(credentials.credentials)
    if not user_id:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired token",
            headers={"WWW-Authenticate": "Bearer"},
        )
    user = db.get(models.User, user_id)
    if not user:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="User not found",
            headers={"WWW-Authenticate": "Bearer"},
        )
    return user


def require_super_admin(
    current_user: models.User = Depends(get_current_user),
) -> models.User:
    """Dependency ensuring only the designated SUPER_ADMIN can execute employee-management actions."""
    if current_user.role != "SUPER_ADMIN":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Permission denied: Only the designated Super Admin can add, edit, or delete employees",
        )
    return current_user


@app.get("/auth/status", response_model=schemas.AuthStatus)
def auth_status(db: Session = Depends(get_db)):
    """Check if any users exist in the system."""
    count = db.query(func.count(models.User.user_id)).scalar() or 0
    return schemas.AuthStatus(has_users=(count > 0), user_count=count)


@app.post("/auth/signup", response_model=schemas.AuthResponse, status_code=status.HTTP_201_CREATED)
def signup(payload: schemas.UserSignUp, db: Session = Depends(get_db)):
    """Register a new user account (always assigned USER role)."""
    normalized_email = payload.email.lower().strip()
    existing = db.query(models.User).filter(func.lower(models.User.email) == normalized_email).first()
    if existing:
        raise HTTPException(status.HTTP_409_CONFLICT, "An account with this email already exists")

    # Public signups are strictly granted the USER role. There is only one designated Super Admin.
    user = models.User(
        email=normalized_email,
        full_name=payload.full_name.strip(),
        password_hash=hash_password(payload.password),
        role="USER",
    )
    db.add(user)
    db.commit()
    db.refresh(user)

    token = create_token(user.user_id)
    return schemas.AuthResponse(
        user=user,
        token=token,
        requires_otp=False,
        message="Account created successfully",
    )


@app.post("/auth/login", response_model=schemas.AuthResponse)
def login(payload: schemas.UserLogin, db: Session = Depends(get_db)):
    """Authenticate an existing user. Requires email OTP / 2FA for SUPER_ADMIN role."""
    normalized_email = payload.email.lower().strip()
    user = db.query(models.User).filter(func.lower(models.User.email) == normalized_email).first()
    if not user or not verify_password(payload.password, user.password_hash):
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Invalid email or password")

    # SUPER_ADMIN requires Email OTP verification before gaining full access / session token
    if user.role == "SUPER_ADMIN":
        now_utc = datetime.now(timezone.utc)

        # Check if an active, unexpired challenge was created less than 60 seconds ago
        active_challenge = (
            db.query(models.AdminOTPChallenge)
            .filter(
                models.AdminOTPChallenge.user_id == user.user_id,
                models.AdminOTPChallenge.is_used == False,
            )
            .order_by(models.AdminOTPChallenge.created_at.desc())
            .first()
        )

        if active_challenge:
            exp = active_challenge.expires_at
            if exp.tzinfo is None:
                exp = exp.replace(tzinfo=timezone.utc)
            last_sent = active_challenge.last_sent_at
            if last_sent.tzinfo is None:
                last_sent = last_sent.replace(tzinfo=timezone.utc)

            # If within 60s cooldown and unexpired, reuse the active challenge to avoid email spamming
            if now_utc < exp and (now_utc - last_sent).total_seconds() < 60:
                return schemas.AuthResponse(
                    requires_otp=True,
                    challenge_token=active_challenge.challenge_id,
                    masked_email=mask_email(user.email),
                    message="Verification code already sent to your registered email address.",
                )

        # Invalidate any prior active OTP challenges for this user
        db.query(models.AdminOTPChallenge).filter(
            models.AdminOTPChallenge.user_id == user.user_id,
            models.AdminOTPChallenge.is_used == False,
        ).update({"is_used": True})

        otp_numeric = f"{secrets.randbelow(900000) + 100000:06d}"
        challenge_id = secrets.token_urlsafe(32)
        expires_at = now_utc + timedelta(minutes=5)

        challenge = models.AdminOTPChallenge(
            challenge_id=challenge_id,
            user_id=user.user_id,
            otp_hash=hash_password(otp_numeric),
            attempts=0,
            max_attempts=5,
            last_sent_at=now_utc,
            expires_at=expires_at,
            is_used=False,
        )
        db.add(challenge)
        db.commit()

        # Send email to the Super Admin's registered email address via Gmail SMTP
        try:
            send_otp_email(user.email, user.full_name, otp_numeric)
        except GmailSMTPConfigurationError as e:
            # Rollback challenge on config error so subsequent attempts start cleanly
            db.delete(challenge)
            db.commit()
            raise HTTPException(status.HTTP_500_INTERNAL_SERVER_ERROR, detail=str(e))
        except RuntimeError as e:
            db.delete(challenge)
            db.commit()
            raise HTTPException(status.HTTP_502_BAD_GATEWAY, detail=str(e))

        return schemas.AuthResponse(
            requires_otp=True,
            challenge_token=challenge_id,
            masked_email=mask_email(user.email),
            message="Verification code sent to your registered email address.",
        )

    # Normal users (USER) continue directly without OTP requirement
    token = create_token(user.user_id)
    return schemas.AuthResponse(
        user=user,
        token=token,
        requires_otp=False,
        message="Login successful",
    )


@app.post("/auth/verify-otp", response_model=schemas.AuthResponse)
def verify_otp(payload: schemas.VerifyOTPRequest, db: Session = Depends(get_db)):
    """Verify Super Admin email OTP and complete session login."""
    challenge = db.get(models.AdminOTPChallenge, payload.challenge_token)
    if not challenge or challenge.is_used:
        raise HTTPException(
            status.HTTP_400_BAD_REQUEST,
            "Invalid or expired verification session. Please sign in again.",
        )

    user = db.get(models.User, challenge.user_id)
    if not user or user.role != "SUPER_ADMIN":
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Invalid authorization context.")

    # Check attempt limit
    if challenge.attempts >= challenge.max_attempts:
        challenge.is_used = True
        db.commit()
        raise HTTPException(
            status.HTTP_403_FORBIDDEN,
            "Maximum verification attempts exceeded. Verification code invalidated. Please sign in again.",
        )

    # Check expiration
    now_utc = datetime.now(timezone.utc)
    exp = challenge.expires_at
    if exp.tzinfo is None:
        exp = exp.replace(tzinfo=timezone.utc)

    if now_utc > exp:
        raise HTTPException(
            status.HTTP_400_BAD_REQUEST,
            "This verification code has expired. Please request a new code.",
        )

    # Verify OTP timing-safely
    if not verify_password(payload.otp, challenge.otp_hash):
        challenge.attempts += 1
        db.commit()
        remaining = challenge.max_attempts - challenge.attempts
        if remaining <= 0:
            challenge.is_used = True
            db.commit()
            raise HTTPException(
                status.HTTP_403_FORBIDDEN,
                "Maximum verification attempts exceeded. Verification code invalidated. Please sign in again.",
            )
        raise HTTPException(
            status.HTTP_400_BAD_REQUEST,
            f"Invalid verification code. Please try again. ({remaining} attempt{'s' if remaining != 1 else ''} remaining)",
        )

    # OTP is correct -> mark used, complete login and issue full session token
    challenge.is_used = True
    db.commit()

    token = create_token(user.user_id)
    return schemas.AuthResponse(
        user=user,
        token=token,
        requires_otp=False,
        message="Verification successful. Welcome Super Admin!",
    )


@app.post("/auth/resend-otp")
def resend_otp(payload: schemas.ResendOTPRequest, db: Session = Depends(get_db)):
    """Resend a fresh OTP to the Super Admin's registered email with a 60-second cooldown."""
    challenge = db.get(models.AdminOTPChallenge, payload.challenge_token)
    if not challenge or challenge.is_used:
        raise HTTPException(
            status.HTTP_400_BAD_REQUEST,
            "Invalid verification session. Please sign in again.",
        )

    user = db.get(models.User, challenge.user_id)
    if not user or user.role != "SUPER_ADMIN":
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Invalid authorization context.")

    now_utc = datetime.now(timezone.utc)
    last_sent = challenge.last_sent_at
    if last_sent.tzinfo is None:
        last_sent = last_sent.replace(tzinfo=timezone.utc)

    elapsed = (now_utc - last_sent).total_seconds()
    if elapsed < 60:
        remaining = int(60 - elapsed)
        raise HTTPException(
            status.HTTP_429_TOO_MANY_REQUESTS,
            f"Please wait {remaining} second{'s' if remaining != 1 else ''} before requesting a new code.",
        )

    # Invalidate previous OTP and generate a fresh one
    otp_numeric = f"{secrets.randbelow(900000) + 100000:06d}"
    challenge.otp_hash = hash_password(otp_numeric)
    challenge.attempts = 0
    challenge.expires_at = now_utc + timedelta(minutes=5)
    challenge.last_sent_at = now_utc
    db.commit()

    try:
        send_otp_email(user.email, user.full_name, otp_numeric)
    except GmailSMTPConfigurationError as e:
        raise HTTPException(status.HTTP_500_INTERNAL_SERVER_ERROR, detail=str(e))
    except RuntimeError as e:
        raise HTTPException(status.HTTP_502_BAD_GATEWAY, detail=str(e))

    return {"message": "A new verification code has been sent to your registered email."}


@app.get("/auth/profile/{user_id}", response_model=schemas.UserOut)
def get_profile(
    user_id: int,
    current_user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Fetch profile data for a user."""
    user = db.get(models.User, user_id)
    if not user:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "User not found")
    return user


@app.put("/auth/profile", response_model=schemas.UserOut)
def update_profile(
    payload: schemas.UpdateProfileRequest,
    current_user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Update user profile details (e.g. full name). Users can update their own profile; Super Admin can update any."""
    if current_user.user_id != payload.user_id and current_user.role != "SUPER_ADMIN":
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Cannot modify other user profiles")

    user = db.get(models.User, payload.user_id)
    if not user:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "User not found")

    user.full_name = payload.full_name.strip()
    db.commit()
    db.refresh(user)
    return user


@app.post("/auth/change-password")
def change_password(
    payload: schemas.ChangePasswordRequest,
    current_user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Change user password with validation against current password."""
    if current_user.user_id != payload.user_id and current_user.role != "SUPER_ADMIN":
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Cannot change other user password")

    user = db.get(models.User, payload.user_id)
    if not user:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "User not found")

    if not verify_password(payload.current_password, user.password_hash):
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Current password is incorrect")

    if payload.current_password == payload.new_password:
        raise HTTPException(
            status.HTTP_400_BAD_REQUEST, "New password cannot be identical to current password"
        )

    user.password_hash = hash_password(payload.new_password)
    db.commit()
    return {"message": "Password changed successfully"}


def ensure_unique(db: Session, data: schemas.EmployeeBase, exclude_id: Optional[int] = None):
    """Return a 409 if the employee code or email already belongs to someone else."""
    for column, value, label in (
        (models.Employee.employee_code, data.employee_code, "Employee code"),
        (models.Employee.email, data.email, "Email"),
    ):
        query = db.query(models.Employee).filter(column == value)
        if exclude_id is not None:
            query = query.filter(models.Employee.employee_id != exclude_id)
        if query.first():
            raise HTTPException(status.HTTP_409_CONFLICT, f"{label} '{value}' is already in use")


def get_employee_or_404(db: Session, employee_id: int) -> models.Employee:
    employee = db.get(models.Employee, employee_id)
    if not employee:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Employee not found")
    return employee


@app.get("/employees", response_model=List[schemas.EmployeeOut])
def list_employees(
    search: Optional[str] = Query(None, description="Matches name, code, email, department or designation"),
    current_user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """List employees. Accessible to all authenticated users (SUPER_ADMIN and USER)."""
    query = db.query(models.Employee)
    if search:
        term = f"%{search.strip()}%"
        query = query.filter(
            or_(
                models.Employee.first_name.ilike(term),
                models.Employee.last_name.ilike(term),
                (models.Employee.first_name + " " + models.Employee.last_name).ilike(term),
                models.Employee.employee_code.ilike(term),
                models.Employee.email.ilike(term),
                models.Employee.department.ilike(term),
                models.Employee.designation.ilike(term),
            )
        )
    return query.order_by(models.Employee.employee_id.desc()).all()


@app.get("/employees/{employee_id}", response_model=schemas.EmployeeOut)
def get_employee(
    employee_id: int,
    current_user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Get single employee details. Accessible to all authenticated users."""
    return get_employee_or_404(db, employee_id)


@app.post("/employees", response_model=schemas.EmployeeOut, status_code=status.HTTP_201_CREATED)
def create_employee(
    payload: schemas.EmployeeCreate,
    current_user: models.User = Depends(require_super_admin),
    db: Session = Depends(get_db),
):
    """Create an employee. ONLY SUPER_ADMIN is permitted."""
    ensure_unique(db, payload)
    employee = models.Employee(**payload.model_dump())
    db.add(employee)
    db.commit()
    db.refresh(employee)
    return employee


@app.put("/employees/{employee_id}", response_model=schemas.EmployeeOut)
def update_employee(
    employee_id: int,
    payload: schemas.EmployeeUpdate,
    current_user: models.User = Depends(require_super_admin),
    db: Session = Depends(get_db),
):
    """Update employee details. ONLY SUPER_ADMIN is permitted."""
    employee = get_employee_or_404(db, employee_id)
    ensure_unique(db, payload, exclude_id=employee_id)
    for field, value in payload.model_dump().items():
        setattr(employee, field, value)
    db.commit()
    db.refresh(employee)
    return employee


@app.delete("/employees/{employee_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_employee(
    employee_id: int,
    current_user: models.User = Depends(require_super_admin),
    db: Session = Depends(get_db),
):
    """Delete employee. ONLY SUPER_ADMIN is permitted."""
    employee = get_employee_or_404(db, employee_id)
    db.delete(employee)
    db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@app.get("/dashboard", response_model=schemas.DashboardOut)
def dashboard(
    current_user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Dashboard metrics. Accessible to all authenticated users."""
    E = models.Employee
    total = db.query(func.count(E.employee_id)).scalar() or 0
    active = db.query(func.count(E.employee_id)).filter(E.employment_status == "Active").scalar() or 0
    rows = (
        db.query(E.department, func.count(E.employee_id))
        .group_by(E.department)
        .order_by(func.count(E.employee_id).desc(), E.department)
        .all()
    )
    return schemas.DashboardOut(
        total_employees=total,
        active_employees=active,
        inactive_employees=total - active,
        by_department=[schemas.DepartmentCount(department=d, count=c) for d, c in rows],
    )
