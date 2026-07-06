"""GET /submittal-library — port of the "Submittal Library Browser" workflow."""
import logging

from fastapi import APIRouter
from fastapi.responses import JSONResponse

from app import config
from app.services import drive

logger = logging.getLogger("submittal.library")
router = APIRouter()

FOLDER_MIME = "application/vnd.google-apps.folder"


@router.get("/submittal-library")
async def submittal_library(folder: str | None = None):
    folder_id = folder or config.DRIVE_ROOT_FOLDER_ID
    is_root = not folder
    try:
        files = await drive.list_files(
            q=f"'{folder_id}' in parents and trashed=false",
            fields="files(id,name,mimeType,webViewLink,iconLink)",
            page_size=100,
        )
    except Exception as exc:  # noqa: BLE001 - frontend expects JSON on failure
        logger.exception("Library listing failed")
        return JSONResponse({"success": False, "error": str(exc)}, status_code=502)

    return {
        "folders": [f for f in files if f.get("mimeType") == FOLDER_MIME],
        "files": [f for f in files if f.get("mimeType") != FOLDER_MIME],
        "isRoot": is_root,
    }
