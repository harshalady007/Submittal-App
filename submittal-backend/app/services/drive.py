"""Google Drive REST v3 operations (list/copy/upload/export/download/permissions)."""
import json
import uuid

from app.google_auth import authed_request

DRIVE_FILES_URL = "https://www.googleapis.com/drive/v3/files"
DRIVE_UPLOAD_URL = "https://www.googleapis.com/upload/drive/v3/files"


async def list_files(q: str, fields: str, page_size: int = 100, corpora: str | None = None) -> list[dict]:
    params = {"q": q, "fields": fields, "pageSize": page_size}
    if corpora:
        params["corpora"] = corpora
    resp = await authed_request("GET", DRIVE_FILES_URL, params=params)
    return resp.json().get("files", [])


async def copy_file(template_id: str, name: str) -> dict:
    resp = await authed_request(
        "POST", f"{DRIVE_FILES_URL}/{template_id}/copy", json={"name": name}
    )
    return resp.json()


async def upload_file(name: str, content: bytes, mime_type: str, parent_id: str) -> dict:
    """Multipart (multipart/related) upload of raw bytes into a folder."""
    boundary = f"submittal-{uuid.uuid4().hex}"
    metadata = {"name": name, "parents": [parent_id]}
    body = (
        f"--{boundary}\r\n"
        "Content-Type: application/json; charset=UTF-8\r\n\r\n"
        f"{json.dumps(metadata)}\r\n"
        f"--{boundary}\r\n"
        f"Content-Type: {mime_type}\r\n\r\n"
    ).encode() + content + f"\r\n--{boundary}--".encode()
    resp = await authed_request(
        "POST",
        f"{DRIVE_UPLOAD_URL}?uploadType=multipart&fields=id,name,mimeType",
        headers={"Content-Type": f"multipart/related; boundary={boundary}"},
        content=body,
    )
    return resp.json()


async def grant_public_read(file_id: str) -> dict:
    resp = await authed_request(
        "POST",
        f"{DRIVE_FILES_URL}/{file_id}/permissions",
        json={"role": "reader", "type": "anyone"},
    )
    return resp.json()


async def export_pdf(file_id: str) -> bytes:
    resp = await authed_request(
        "GET", f"{DRIVE_FILES_URL}/{file_id}/export", params={"mimeType": "application/pdf"}
    )
    return resp.content


async def download_file(file_id: str) -> bytes:
    resp = await authed_request("GET", f"{DRIVE_FILES_URL}/{file_id}", params={"alt": "media"})
    return resp.content
