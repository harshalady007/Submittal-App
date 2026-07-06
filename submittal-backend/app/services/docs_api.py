"""Google Docs API v1: fetch structure, batchUpdate, and TDS image-target selection."""
from app.google_auth import authed_request

DOCS_URL = "https://docs.googleapis.com/v1/documents"


async def get_document(doc_id: str) -> dict:
    resp = await authed_request("GET", f"{DOCS_URL}/{doc_id}")
    return resp.json()


async def batch_update(doc_id: str, requests: list[dict]) -> dict:
    resp = await authed_request("POST", f"{DOCS_URL}/{doc_id}:batchUpdate", json={"requests": requests})
    return resp.json()


def find_image_target(doc: dict) -> tuple[dict | None, dict]:
    """Pick the image object to replace in a TDS doc, mirroring the n8n logic.

    Walks body content (including nested table cells) in document order and
    prefers: last positioned object -> last inline object -> last key of
    doc.positionedObjects (fallback for objects anchored outside normal flow).

    Returns (target, debug) where target is
    {"type", "id", "width", "height"} or None.
    """
    body_inline_ids: list[str] = []
    body_positioned_ids: list[str] = []

    def walk(content):
        if not isinstance(content, list):
            return
        for el in content:
            paragraph = el.get("paragraph")
            if paragraph and isinstance(paragraph.get("elements"), list):
                for pe in paragraph["elements"]:
                    inline = pe.get("inlineObjectElement") or {}
                    if inline.get("inlineObjectId"):
                        body_inline_ids.append(inline["inlineObjectId"])
                    positioned = pe.get("positionedObjectReferenceElement") or {}
                    if positioned.get("positionedObjectId"):
                        body_positioned_ids.append(positioned["positionedObjectId"])
            table = el.get("table")
            if table and table.get("tableRows"):
                for row in table["tableRows"]:
                    for cell in row.get("tableCells") or []:
                        walk(cell.get("content"))

    walk((doc.get("body") or {}).get("content"))

    debug = {
        "bodyInline": len(body_inline_ids),
        "bodyPositioned": len(body_positioned_ids),
        "chosen": None,
        "chosenType": None,
    }

    target_type = target_id = None
    if body_positioned_ids:
        target_type, target_id = "positioned", body_positioned_ids[-1]
    elif body_inline_ids:
        target_type, target_id = "inline", body_inline_ids[-1]
    elif doc.get("positionedObjects"):
        keys = list(doc["positionedObjects"].keys())
        target_type, target_id = "positioned-fallback", keys[-1]

    if not target_id:
        return None, debug

    size = None
    if target_type == "inline":
        obj = (doc.get("inlineObjects") or {}).get(target_id) or {}
        size = ((obj.get("inlineObjectProperties") or {}).get("embeddedObject") or {}).get("size")
    else:
        obj = (doc.get("positionedObjects") or {}).get(target_id) or {}
        size = ((obj.get("positionedObjectProperties") or {}).get("embeddedObject") or {}).get("size")

    size = size or {}
    width = round(((size.get("width") or {}).get("magnitude")) or 200)
    height = round(((size.get("height") or {}).get("magnitude")) or 300)

    debug["chosen"] = target_id
    debug["chosenType"] = target_type
    return {"type": target_type, "id": target_id, "width": width, "height": height}, debug
