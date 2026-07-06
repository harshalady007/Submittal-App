"""POST /generate-tender — BOQ extraction (Gemini) -> tender sheet upsert.

Faithful to the n8n Google Sheets node's `operation: "update"` with
`matchingColumns: ["SEQ"]`: rows are only written where a matching SEQ value
already exists in the sheet — no new rows are appended. Rows that find no
SEQ match are surfaced in the response's `skipped` list (the n8n version
dropped them silently, which hid template-out-of-rows problems).
"""
import json
import logging
import re

from fastapi import APIRouter, File, Form, UploadFile
from fastapi.responses import JSONResponse

from app import config
from app.services import gemini, sheets_api
from app.services.rates import get_rate

logger = logging.getLogger("submittal.boq")
router = APIRouter()

# Header names as they literally appear in the tender sheet — " RATE " and
# "AMOUNT " really are padded with spaces; do not "fix" them.
COLUMN_HEADERS = ["SEQ", "ITEM", "DESCRIPTION", "QTY", "UNIT", " RATE ", "AMOUNT "]

FENCE_RE = re.compile(r"^```(?:json)?\s*|\s*```$", re.MULTILINE)


def _err(error: str, stage: str, status: int = 502) -> JSONResponse:
    return JSONResponse({"success": False, "error": error, "stage": stage}, status_code=status)


def _to_int(v) -> int:
    try:
        return int(float(v))
    except (TypeError, ValueError):
        return 0


def _find_column(headers: list, name: str) -> int | None:
    """Exact header match first (padded names included), then a trimmed
    case-insensitive fallback in case the template's padding changes."""
    for i, h in enumerate(headers):
        if str(h) == name:
            return i
    for i, h in enumerate(headers):
        if str(h).strip().lower() == name.strip().lower():
            return i
    return None


@router.post("/generate-tender")
async def generate_tender(
    boq: UploadFile = File(...),
    sheet_id: str = Form(default=None),
    sheet_gid: int = Form(default=None),
    header_row: int = Form(default=None),
    first_data_row: int = Form(default=None),
):
    sheet_id = sheet_id or config.BOQ_SHEET_ID
    sheet_gid = sheet_gid if sheet_gid is not None else config.BOQ_SHEET_GID
    header_row = header_row or config.BOQ_HEADER_ROW
    first_data_row = first_data_row or config.BOQ_FIRST_DATA_ROW

    # 1. Gemini extraction
    try:
        content = await boq.read()
        text = await gemini.extract_boq(content, boq.content_type or "image/jpeg")
    except Exception:  # noqa: BLE001
        logger.exception("Gemini call failed")
        text = None
    if not text:
        return _err(
            "Failed to analyze the BOQ document. Gemini unavailable.", "document_analysis"
        )

    # 2. Parse the JSON array (strip any ```json fences first)
    try:
        raw_rows = json.loads(FENCE_RE.sub("", text.strip()).strip())
        assert isinstance(raw_rows, list)
    except (ValueError, AssertionError):
        logger.error("Unparseable Gemini output: %s", text[:500])
        return _err("Could not parse BOQ items from the document.", "parse")

    # 3. Build tender rows
    rows = []
    for i, r in enumerate(raw_rows):
        if not isinstance(r, dict):
            continue
        description = ", ".join(
            str(v)
            for v in [r.get("ITEM_NAME"), r.get("MATERIAL"), r.get("FINISH"), r.get("DIMENSION")]
            if v
        )
        qty = _to_int(r.get("QTY") or 0)
        rate = get_rate(description)
        rows.append(
            {
                "SEQ": i + 1,
                "ITEM": str(r.get("ITEM_NAME") or ""),
                "DESCRIPTION": description,
                "QTY": qty,
                "UNIT": "nr",
                " RATE ": rate,
                "AMOUNT ": rate * qty,
            }
        )
    if not rows:
        return _err("No BOQ items were extracted from the document.", "parse")

    # 4. Update-only upsert matched on SEQ
    try:
        title = await sheets_api.get_sheet_title_by_gid(sheet_id, sheet_gid)
        headers = (await sheets_api.get_values(sheet_id, f"'{title}'!{header_row}:{header_row}"))
        headers = headers[0] if headers else []
        col_idx = {name: _find_column(headers, name) for name in COLUMN_HEADERS}
        if col_idx["SEQ"] is None:
            return _err(f"SEQ column not found in header row {header_row}.", "sheet_update")

        seq_col = sheets_api.col_letter(col_idx["SEQ"])
        existing = await sheets_api.get_values(
            sheet_id, f"'{title}'!{seq_col}{first_data_row}:{seq_col}"
        )
        seq_to_row = {}  # sheet SEQ value -> absolute row number
        for offset, row_vals in enumerate(existing):
            val = str(row_vals[0]).strip() if row_vals else ""
            if val and val not in seq_to_row:
                seq_to_row[val] = first_data_row + offset

        data, skipped = [], []
        for row in rows:
            sheet_row = seq_to_row.get(str(row["SEQ"]))
            if sheet_row is None:
                skipped.append({"SEQ": row["SEQ"], "DESCRIPTION": row["DESCRIPTION"]})
                continue
            for name in COLUMN_HEADERS:
                idx = col_idx[name]
                if idx is None:
                    continue
                data.append(
                    {
                        "range": f"'{title}'!{sheets_api.col_letter(idx)}{sheet_row}",
                        "values": [[row[name]]],
                    }
                )
        if data:
            await sheets_api.values_batch_update(sheet_id, data)
    except Exception as exc:  # noqa: BLE001
        logger.exception("Sheet update failed")
        return _err(str(exc), "sheet_update")

    return {
        "success": True,
        "sheet_url": (
            f"https://docs.google.com/spreadsheets/d/{sheet_id}/edit"
            f"?gid={sheet_gid}#gid={sheet_gid}"
        ),
        "message": "Tender generated successfully.",
        "itemCount": len(rows),
        "updatedCount": len(rows) - len(skipped),
        "skipped": skipped,
    }
