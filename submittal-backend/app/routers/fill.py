"""POST /submittal-fill — port of the "Submittal Template Filler" workflow.

Doc templates get replaceAllText (plus the TDS product-image swap); sheet
templates get findReplace across all sheets. Replacement dicts are ported
1:1 from the n8n Code nodes, including the "M/s. " prefixing and the
double-space placeholder variants.
"""
import asyncio
import logging
import re
import urllib.parse
from datetime import datetime

from fastapi import APIRouter, Body
from fastapi.responses import JSONResponse

from app import config
from app.services import docs_api, drive, sheets_api

logger = logging.getLogger("submittal.fill")
router = APIRouter()

PRODUCT_EXCLUSIONS = [
    (
        [
            "litter bin", "litterbin", "waste bin", "wastebin", "trash bin", "trashbin",
            "litter container", "recycle bin", "recyclebin", "recycling bin",
        ],
        " excluding liners",
    ),
]

DATE_RE = re.compile(r"^(\d{4})-(\d{2})-(\d{2})")


def safe(v) -> str:
    return "" if v is None else str(v)


def with_ms(v) -> str:
    s = safe(v).strip()
    return f"M/s. {s}" if s else ""


def format_date(s) -> str:
    if not s:
        return ""
    m = DATE_RE.match(str(s))
    return f"{m.group(3)}-{m.group(2)}-{m.group(1)}" if m else str(s)


def detect_exclusion(product_name, product_list) -> str:
    hay = f"{safe(product_name)} {safe(product_list)}".lower()
    for keywords, text in PRODUCT_EXCLUSIONS:
        if any(kw in hay for kw in keywords):
            return text
    return ""


def build_doc_replacements(p: dict, ref_number: str) -> dict:
    return {
        "M/s. {{CLIENT}}": with_ms(p.get("client")),
        "M/s.  {{CLIENT}}": with_ms(p.get("client")),
        "M/s. {{MAIN_CONTRACTOR}}": with_ms(p.get("mainContractor")),
        "M/s.  {{MAIN_CONTRACTOR}}": with_ms(p.get("mainContractor")),
        "M/s. {{SUB_CONTRACTOR}}": with_ms(p.get("subContractor")),
        "M/s.  {{SUB_CONTRACTOR}}": with_ms(p.get("subContractor")),
        "{{PROJECT_NAME}}": safe(p.get("projectName")),
        "{{CLIENT}}": safe(p.get("client")),
        "{{MAIN_CONTRACTOR}}": safe(p.get("mainContractor")),
        "{{SUB_CONTRACTOR}}": safe(p.get("subContractor")),
        "{{PRODUCT_NAME}}": safe(p.get("productName")),
        "{{MATERIAL_SPEC}}": safe(p.get("materialSpec")),
        "{{DIMENSIONS}}": safe(p.get("dimensions")),
        "{{MATERIAL}}": safe(p.get("material")),
        "{{FINISH}}": safe(p.get("finish")),
        "{{PRODUCT_WARRANTY}}": safe(p.get("productWarranty")).lower(),
        "{{PRODUCT_LIST}}": safe(p.get("productList")),
        "{{REF_NUMBER}}": ref_number,
        "{{DATE}}": format_date(p.get("date")),
        "{{QUOTE}}": safe(p.get("quoteNumber")),
        "{{QUOTE_NUMBER}}": safe(p.get("quoteNumber")),
        "{{QUOTATION}}": safe(p.get("quoteNumber")),
        "{{QUOTATION_NUMBER}}": safe(p.get("quoteNumber")),
        "{{EXCLUSION_CLAUSE}}": detect_exclusion(p.get("productName"), p.get("productList")),
    }


def build_sheet_replacements(p: dict, ref_number: str) -> dict:
    return {
        "{{PROJECT_NAME}}": safe(p.get("projectName")),
        "{{CLIENT}}": safe(p.get("client")),
        "{{MAIN_CONTRACTOR}}": safe(p.get("mainContractor")),
        "{{SUB_CONTRACTOR}}": safe(p.get("subContractor")),
        "{{CONSULTANT}}": safe(p.get("consultant")),
        "{{LOCATION}}": safe(p.get("location")),
        "{{PRODUCT_NAME}}": safe(p.get("productName")),
        "{{MATERIAL_SPEC}}": safe(p.get("materialSpec")),
        "{{DIMENSIONS}}": safe(p.get("dimensions")),
        "{{MATERIAL}}": safe(p.get("material")),
        "{{FINISH}}": safe(p.get("finish")),
        "{{DATE}}": format_date(p.get("date")),
        "{{QUOTE}}": safe(p.get("quoteNumber")),
        "{{QUOTE_NUMBER}}": safe(p.get("quoteNumber")),
        "{{QUOTATION}}": safe(p.get("quoteNumber")),
        "{{QUOTATION_NUMBER}}": safe(p.get("quoteNumber")),
        "{{REF_NUMBER}}": ref_number,
    }


def wsrv_url(product_image_url: str, width: int, height: int) -> str:
    """Letterboxed, aspect-preserving proxy at 3x target size for sharpness."""
    return (
        "https://wsrv.nl/?url=" + urllib.parse.quote(product_image_url, safe="")
        + f"&w={width * 3}&h={height * 3}&fit=contain&cbg=white&output=jpg&q=90"
    )


async def _fill_doc(doc_key: str, template_id: str, p: dict, ref_number: str, timestamp: str):
    copy = await drive.copy_file(
        template_id, f"{safe(p.get('projectName'))} - {doc_key} - {timestamp}"
    )
    copy_id = copy["id"]
    doc = await docs_api.get_document(copy_id)

    replacements = build_doc_replacements(p, ref_number)
    requests = [
        {
            "replaceAllText": {
                "containsText": {"text": find, "matchCase": True},
                "replaceText": str(value),
            }
        }
        for find, value in replacements.items()
    ]

    product_image_url = p.get("productImageUrl")
    img_debug = {
        "tdsAndUrl": doc_key == "tds" and bool(product_image_url),
        "bodyInline": 0,
        "bodyPositioned": 0,
        "chosen": None,
        "chosenType": None,
    }
    if doc_key == "tds" and product_image_url:
        target, debug = docs_api.find_image_target(doc)
        img_debug.update(debug)
        if target:
            requests.append(
                {
                    "replaceImage": {
                        "imageObjectId": target["id"],
                        "uri": wsrv_url(product_image_url, target["width"], target["height"]),
                        "imageReplaceMethod": "CENTER_CROP",
                    }
                }
            )

    await docs_api.batch_update(copy_id, requests)
    return doc_key, {
        "viewLink": f"https://docs.google.com/document/d/{copy_id}/edit",
        "downloadLink": f"https://docs.google.com/document/d/{copy_id}/export?format=docx",
    }, img_debug


async def _fill_sheet(doc_key: str, template_id: str, p: dict, ref_number: str, timestamp: str):
    copy = await drive.copy_file(
        template_id, f"{safe(p.get('projectName'))} - {doc_key} - {timestamp}"
    )
    copy_id = copy["id"]
    requests = [
        {
            "findReplace": {
                "find": find,
                "replacement": str(value),
                "matchCase": True,
                "allSheets": True,
            }
        }
        for find, value in build_sheet_replacements(p, ref_number).items()
    ]
    await sheets_api.batch_update(copy_id, requests)
    return doc_key, {
        "viewLink": f"https://docs.google.com/spreadsheets/d/{copy_id}/edit",
        "downloadLink": f"https://docs.google.com/spreadsheets/d/{copy_id}/export?format=xlsx",
    }, None


@router.post("/submittal-fill")
async def submittal_fill(body: dict = Body(default={})):
    p: dict = body.get("projectInfo") or {}
    selected = [
        k
        for k in (body.get("selectedDocs") or [])
        if k in config.DOC_TEMPLATES or k in config.SHEET_TEMPLATES
    ]
    if not selected:
        return {"success": True, "documents": {}, "_imgDebug": {}}

    # Ref number date parts come from projectInfo.date (fallback: now)
    date_obj = None
    m = DATE_RE.match(str(p.get("date") or ""))
    if m:
        date_obj = datetime(int(m.group(1)), int(m.group(2)), int(m.group(3)))
    date_obj = date_obj or datetime.now()
    dd, mm = f"{date_obj.day:02d}", f"{date_obj.month:02d}"
    timestamp = f"{datetime.now():%Y%m%d-%H%M%S}"

    async def fill_one(doc_key: str):
        ref_number = f"MS-COO-{dd}-{mm}-01" if doc_key == "origin" else f"MS-DW-{dd}-{mm}-01"
        if doc_key in config.SHEET_TEMPLATES:
            return await _fill_sheet(doc_key, config.SHEET_TEMPLATES[doc_key], p, ref_number, timestamp)
        return await _fill_doc(doc_key, config.DOC_TEMPLATES[doc_key], p, ref_number, timestamp)

    try:
        results = await asyncio.gather(*(fill_one(k) for k in selected))
    except Exception as exc:  # noqa: BLE001
        logger.exception("Fill failed")
        return JSONResponse({"success": False, "error": str(exc)}, status_code=502)

    documents, debug = {}, {}
    for doc_key, links, img_debug in results:
        documents[doc_key] = links
        if img_debug is not None:
            debug[doc_key] = img_debug
    return {"success": True, "documents": documents, "_imgDebug": debug}
