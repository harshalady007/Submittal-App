"""POST /submittal-merge — redesigned port of the "Submittal PDF Merge" workflow.

The n8n version needed PDF.co (HTML->PDF for the index page, URL-based merge)
plus an async job + /submittal-merge-fetch polling dance, purely because of
n8n Cloud's webhook timeout. Here the whole merge runs in-process and returns
synchronously.

Frontend compatibility: the existing React app checks for `jobId` in the
start response and then polls /submittal-merge-fetch until `ready`. We return
a synthetic jobId and keep a fetch shim that immediately answers ready:true,
so the frontend works unmodified. Once stable, the poll loop in the frontend
is dead code and can be removed along with the shim.
"""
import logging
import re
import uuid

from fastapi import APIRouter, Body
from fastapi.responses import JSONResponse

from app import config
from app.services import drive, pdf_merge

logger = logging.getLogger("submittal.merge")
router = APIRouter()

DOC_ID_RE = re.compile(r"/d/([a-zA-Z0-9_-]+)")


@router.post("/submittal-merge")
async def submittal_merge(body: dict = Body(default={})):
    filled = body.get("filledDocs") or []
    drive_files = body.get("driveFileIds") or []
    if not filled and not drive_files:
        return JSONResponse(
            {"success": False, "error": "No documents to merge"}, status_code=400
        )
    output_name = body.get("outputName") or "submittal"
    index_items = body.get("indexItems") or []

    # Collect merge tasks in the same shape as the n8n Build Tasks node
    tasks = []
    fallback_order = iter(range(10_000))

    def order_of(entry: dict):
        order = entry.get("orderIndex")
        return order if isinstance(order, (int, float)) and not isinstance(order, bool) else next(fallback_order)

    for doc in filled:
        m = DOC_ID_RE.search(doc.get("viewLink") or "")
        if not m:
            continue
        tasks.append(
            {
                "type": "filled",
                "fileId": m.group(1),
                "docKey": doc.get("docKey"),
                "orderIndex": order_of(doc),
            }
        )
    for f in drive_files:
        if not f.get("fileId"):
            continue
        tasks.append(
            {
                "type": "drive",
                "fileId": f["fileId"],
                "docKey": f.get("docKey"),
                "orderIndex": order_of(f),
            }
        )
    if not tasks:
        return JSONResponse(
            {"success": False, "error": "No documents to merge"}, status_code=400
        )

    try:
        # Download every document as PDF bytes (export for Google Docs,
        # raw download for pre-existing Drive files like certs)
        for task in tasks:
            if task["type"] == "filled":
                task["pdf"] = await drive.export_pdf(task["fileId"])
            else:
                task["pdf"] = await drive.download_file(task["fileId"])

        tasks.sort(key=lambda t: t["orderIndex"])
        streams = [t["pdf"] for t in tasks]

        # Index page goes right after the cover if present, else first
        if index_items:
            cover_idx = next(
                (i for i, t in enumerate(tasks) if t["docKey"] == "cover"), -1
            )
            insert_at = cover_idx + 1 if cover_idx >= 0 else 0
            streams.insert(insert_at, pdf_merge.build_index_pdf(index_items))

        merged = pdf_merge.merge_pdfs(streams)

        uploaded = await drive.upload_file(
            name=f"{output_name}.pdf",
            content=merged,
            mime_type="application/pdf",
            parent_id=config.DRIVE_ROOT_FOLDER_ID,
        )
        file_id = uploaded["id"]
        await drive.grant_public_read(file_id)
    except Exception as exc:  # noqa: BLE001
        logger.exception("Merge failed")
        return JSONResponse({"success": False, "error": str(exc)}, status_code=502)

    return {
        "success": True,
        # Synthetic jobId keeps the existing frontend's poll loop happy;
        # the merge is already done by the time this response is sent.
        "jobId": f"sync-{uuid.uuid4().hex}",
        "mergedUrl": f"https://drive.google.com/uc?id={file_id}",
        "filename": f"{output_name}.pdf",
        "fileCount": len(streams),
    }


@router.post("/submittal-merge-fetch")
async def submittal_merge_fetch(body: dict = Body(default={})):
    """Compatibility shim: the merge is synchronous now, so the 'job' the
    frontend polls for is always already complete. Follow-up cleanup: drop
    this endpoint and the frontend poll loop once the backend is stable."""
    output_name = body.get("outputName") or "submittal"
    return {
        "ready": True,
        "success": True,
        "mergedUrl": body.get("mergedUrl"),
        "filename": f"{output_name}.pdf",
        "fileCount": body.get("fileCount"),
    }
