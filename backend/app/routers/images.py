import json
from pathlib import Path
from uuid import uuid4

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile, status
from fastapi.responses import FileResponse
from sqlalchemy import func
from sqlalchemy.orm import Session

from app.deps import get_current_user, get_db
from app.models import ImageAsset, ImageVersion, User
from app.schemas import ImageResponse, ProcessRequest, ProcessResponse
from app.services.processing import ProcessingService
from app.services.storage import StorageService


router = APIRouter(prefix="/api/images", tags=["images"])
storage = StorageService()
processor = ProcessingService()


@router.post("/upload", response_model=ImageResponse)
def upload_image(
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> ImageResponse:
    try:
        saved_path = storage.save_upload(file, current_user.id)
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc

    image = ImageAsset(
        owner_id=current_user.id,
        original_name=file.filename or saved_path.name,
        original_path=str(saved_path),
        current_path=str(saved_path),
    )
    db.add(image)
    db.commit()
    db.refresh(image)

    db.add(ImageVersion(image_id=image.id, version=1, path=str(saved_path), operations_json=json.dumps({"upload": True})))
    db.commit()

    return ImageResponse(
        id=image.id,
        original_name=image.original_name,
        created_at=image.created_at,
        updated_at=image.updated_at,
        current_version=1,
    )


@router.get("", response_model=list[ImageResponse])
def list_images(db: Session = Depends(get_db), current_user: User = Depends(get_current_user)) -> list[ImageResponse]:
    images = (
        db.query(ImageAsset)
        .filter(ImageAsset.owner_id == current_user.id)
        .order_by(ImageAsset.updated_at.desc())
        .all()
    )

    response: list[ImageResponse] = []
    for image in images:
        version = db.query(func.max(ImageVersion.version)).filter(ImageVersion.image_id == image.id).scalar() or 1
        response.append(
            ImageResponse(
                id=image.id,
                original_name=image.original_name,
                created_at=image.created_at,
                updated_at=image.updated_at,
                current_version=int(version),
            )
        )
    return response


@router.post("/{image_id}/process", response_model=ProcessResponse)
def process_image(
    image_id: int,
    payload: ProcessRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> ProcessResponse:
    image = db.query(ImageAsset).filter(ImageAsset.id == image_id, ImageAsset.owner_id == current_user.id).first()
    if image is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Image not found")

    latest_version = db.query(func.max(ImageVersion.version)).filter(ImageVersion.image_id == image.id).scalar() or 1
    next_version = int(latest_version) + 1

    ext = Path(image.current_path).suffix.lower() or ".png"
    out_path = storage.user_processed_dir(current_user.id) / f"{image.id}_{next_version}_{uuid4().hex}{ext}"

    try:
        processor.process_image(Path(image.current_path), out_path, payload)
    except RuntimeError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc

    image.current_path = str(out_path)
    db.add(image)
    db.add(
        ImageVersion(
            image_id=image.id,
            version=next_version,
            path=str(out_path),
            operations_json=payload.model_dump_json(),
        )
    )
    db.commit()

    return ProcessResponse(image_id=image.id, version=next_version, message="Image processed")


@router.get("/{image_id}/download")
def download_image(
    image_id: int,
    version: int | None = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    image = db.query(ImageAsset).filter(ImageAsset.id == image_id, ImageAsset.owner_id == current_user.id).first()
    if image is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Image not found")

    path = image.current_path
    if version is not None:
        version_row = (
            db.query(ImageVersion)
            .filter(ImageVersion.image_id == image.id, ImageVersion.version == version)
            .first()
        )
        if version_row is None:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Version not found")
        path = version_row.path

    file_path = Path(path)
    if not file_path.exists():
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="File not found on disk")

    return FileResponse(path=file_path, filename=f"restored_{image.original_name}")
