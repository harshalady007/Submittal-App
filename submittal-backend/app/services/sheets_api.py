"""Google Sheets API v4: batchUpdate (findReplace) + values read/update."""
from app.google_auth import authed_request

SHEETS_URL = "https://sheets.googleapis.com/v4/spreadsheets"


async def batch_update(spreadsheet_id: str, requests: list[dict]) -> dict:
    resp = await authed_request(
        "POST", f"{SHEETS_URL}/{spreadsheet_id}:batchUpdate", json={"requests": requests}
    )
    return resp.json()


async def get_sheet_title_by_gid(spreadsheet_id: str, gid: int) -> str:
    resp = await authed_request(
        "GET",
        f"{SHEETS_URL}/{spreadsheet_id}",
        params={"fields": "sheets(properties(sheetId,title))"},
    )
    for sheet in resp.json().get("sheets", []):
        props = sheet.get("properties", {})
        if props.get("sheetId") == gid:
            return props.get("title", "")
    raise ValueError(f"No sheet with gid {gid} in spreadsheet {spreadsheet_id}")


async def get_values(spreadsheet_id: str, a1_range: str) -> list[list]:
    from urllib.parse import quote

    resp = await authed_request(
        "GET", f"{SHEETS_URL}/{spreadsheet_id}/values/{quote(a1_range, safe='')}"
    )
    return resp.json().get("values", [])


async def values_batch_update(spreadsheet_id: str, data: list[dict]) -> dict:
    resp = await authed_request(
        "POST",
        f"{SHEETS_URL}/{spreadsheet_id}/values:batchUpdate",
        json={"valueInputOption": "USER_ENTERED", "data": data},
    )
    return resp.json()


def col_letter(index: int) -> str:
    """0-based column index -> A1 letter(s)."""
    letters = ""
    index += 1
    while index > 0:
        index, rem = divmod(index - 1, 26)
        letters = chr(ord("A") + rem) + letters
    return letters
