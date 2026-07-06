"""POST /submittal-search — port of the "Submittal Drive Search" workflow."""
import logging

from fastapi import APIRouter, Body
from fastapi.responses import JSONResponse

from app.services import drive

logger = logging.getLogger("submittal.search")
router = APIRouter()

FOLDER_MIME = "application/vnd.google-apps.folder"


@router.post("/submittal-search")
async def submittal_search(body: dict = Body(default={})):
    queries: dict = body.get("queries") or {}
    preferred: dict = body.get("preferredFilenames") or {}

    # Union every keyword plus every preferred filename into one keyword set
    all_kws: list[str] = []
    seen = set()
    for kws in queries.values():
        for kw in kws or []:
            c = str(kw).strip()
            if c and c not in seen:
                seen.add(c)
                all_kws.append(c)
    for fn in preferred.values():
        c = str(fn).strip()
        if c and c not in seen:
            seen.add(c)
            all_kws.append(c)

    if not all_kws:
        return {"success": True, "matches": {}, "fileCount": 0}

    clauses = " or ".join("name contains '" + kw.replace("'", "\\'") + "'" for kw in all_kws)
    query = f"({clauses}) and mimeType != '{FOLDER_MIME}' and trashed = false"

    try:
        files = await drive.list_files(
            q=query,
            fields="files(id,name,mimeType,webViewLink,parents)",
            page_size=100,
            corpora="user",
        )
    except Exception as exc:  # noqa: BLE001
        logger.exception("Drive search failed")
        return JSONResponse({"success": False, "error": str(exc)}, status_code=502)

    def slim(f: dict) -> dict:
        return {
            "id": f.get("id"),
            "name": f.get("name"),
            "mimeType": f.get("mimeType"),
            "webViewLink": f.get("webViewLink"),
        }

    matches: dict = {}
    for doc_key in queries:
        kws = [str(s).lower() for s in (queries[doc_key] or []) if str(s)]
        pref = preferred.get(doc_key)
        if pref:
            exact = next(
                (f for f in files if str(f.get("name") or "").lower() == str(pref).lower()),
                None,
            )
            if exact:
                matches[doc_key] = slim(exact)
                continue
        if not kws:
            matches[doc_key] = None
            continue
        found = next(
            (
                f
                for f in files
                if any(kw in str(f.get("name") or "").lower() for kw in kws)
            ),
            None,
        )
        matches[doc_key] = slim(found) if found else None

    return {"success": True, "matches": matches, "fileCount": len(files)}
