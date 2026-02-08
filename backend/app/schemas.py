from datetime import datetime

from pydantic import BaseModel, EmailStr, Field


class RegisterRequest(BaseModel):
    email: EmailStr
    password: str = Field(min_length=8, max_length=128)


class LoginRequest(BaseModel):
    email: EmailStr
    password: str


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"


class UserResponse(BaseModel):
    id: int
    email: EmailStr


class OpenCVOptions(BaseModel):
    sharpen: bool = False
    contrast: float = 1.0
    saturation: float = 1.0
    gamma: float = 1.0
    denoise: bool = False


class ProcessRequest(BaseModel):
    upscale: bool = False
    face_restore: bool = False
    colorize: bool = False
    opencv: OpenCVOptions | None = None


class ImageResponse(BaseModel):
    id: int
    original_name: str
    created_at: datetime
    updated_at: datetime
    current_version: int


class ProcessResponse(BaseModel):
    image_id: int
    version: int
    message: str
