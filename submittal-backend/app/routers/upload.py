"""POST /submittal-image-upload — port of the "Submittal Image Upload" workflow."""
import logging
from datetime import datetime

from fastapi import APIRouter, File, UploadFile
from fastapi.responses import JSONResponse

from app import config
from app.services import drive

logger = logging.getLogger("submittal.upload")
router = APIRouter()


@router.post("/submittal-image-upload")
async def submittal_image_upload(image: UploadFile = File(...)):
    try:
        content = await image.read()
        name = f"product-image-{datetime.now():%Y%m%d%H%M%S}.jpg"
        uploaded = await drive.upload_file(
            name=name,
            content=content,
            mime_type=image.content_type or "image/jpeg",
            parent_id=config.DRIVE_ROOT_FOLDER_ID,
        )
        file_id = uploaded["id"]
        await drive.grant_public_read(file_id)
    except Exception as exc:  # noqa: BLE001
        logger.exception("Image upload failed")
        return JSONResponse({"success": False, "error": str(exc)}, status_code=502)

    return {
        "success": True,
        "fileId": file_id,
        "name": uploaded.get("name"),
        "mimeType": uploaded.get("mimeType"),
        "publicUrl": f"https://drive.google.com/uc?id={file_id}",
        "viewUrl": f"https://drive.google.com/file/d/{file_id}/view",
    }
