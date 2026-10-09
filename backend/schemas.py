from datetime import date, datetime
from typing import List, Literal, Optional

from pydantic import BaseModel, ConfigDict, EmailStr, Field


class EmployeeBase(BaseModel):
    employee_code: str = Field(min_length=1, max_length=20)
    first_name: str = Field(min_length=1, max_length=50)
    last_name: str = Field(min_length=1, max_length=50)
    email: EmailStr
    phone: str = Field(min_length=7, max_length=20, pattern=r"^[0-9+\-\s()]+$")
    department: str = Field(min_length=1, max_length=60)
    designation: str = Field(min_length=1, max_length=80)
    joining_date: date
    salary: float = Field(ge=0)
    employment_status: Literal["Active", "Inactive"] = "Active"


class EmployeeCreate(EmployeeBase):
    pass


class EmployeeUpdate(EmployeeBase):
    pass


class EmployeeOut(EmployeeBase):
    model_config = ConfigDict(from_attributes=True)

    employee_id: int
    created_at: datetime
    updated_at: datetime


class DepartmentCount(BaseModel):
    department: str
    count: int


class DashboardOut(BaseModel):
    total_employees: int
    active_employees: int
    inactive_employees: int
    by_department: List[DepartmentCount]


class UserSignUp(BaseModel):
    email: EmailStr
    full_name: str = Field(min_length=2, max_length=100)
    password: str = Field(min_length=6, max_length=128)


class UserLogin(BaseModel):
    email: EmailStr
    password: str = Field(min_length=1)


class UserOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    user_id: int
    email: EmailStr
    full_name: str
    role: Literal["SUPER_ADMIN", "USER"] = "USER"
    created_at: datetime


class AuthResponse(BaseModel):
    user: Optional[UserOut] = None
    token: Optional[str] = None
    message: str
    requires_otp: bool = False
    challenge_token: Optional[str] = None
    masked_email: Optional[str] = None


class VerifyOTPRequest(BaseModel):
    challenge_token: str
    otp: str = Field(min_length=6, max_length=6, pattern=r"^\d{6}$")


class ResendOTPRequest(BaseModel):
    challenge_token: str


class AuthStatus(BaseModel):
    has_users: bool
    user_count: int


class ChangePasswordRequest(BaseModel):
    user_id: int
    current_password: str = Field(min_length=1)
    new_password: str = Field(min_length=6, max_length=128)


class UpdateProfileRequest(BaseModel):
    user_id: int
    full_name: str = Field(min_length=2, max_length=100)
