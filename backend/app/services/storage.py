import shutil
from pathlib import Path
from uuid import uuid4

from fastapi import UploadFile

from app.core.config import get_settings


ALLOWED_EXTENSIONS = {".jpg", ".jpeg", ".png", ".webp", ".bmp", ".tif", ".tiff"}


class StorageService:
    def __init__(self) -> None:
        self.settings = get_settings()
        self.base_dir = Path(self.settings.storage_dir)

    def user_upload_dir(self, user_id: int) -> Path:
        path = self.base_dir / "uploads" / str(user_id)
        path.mkdir(parents=True, exist_ok=True)
        return path

    def user_processed_dir(self, user_id: int) -> Path:
        path = self.base_dir / "processed" / str(user_id)
        path.mkdir(parents=True, exist_ok=True)
        return path

    def save_upload(self, file: UploadFile, user_id: int) -> Path:
        ext = Path(file.filename or "").suffix.lower()
        if ext not in ALLOWED_EXTENSIONS:
            raise ValueError("Unsupported file type")

        upload_dir = self.user_upload_dir(user_id)
        filename = f"{uuid4().hex}{ext}"
        destination = upload_dir / filename

        with destination.open("wb") as output:
            shutil.copyfileobj(file.file, output)

        return destination
