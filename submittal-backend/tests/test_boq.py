import json

from app import config
from app.services.rates import get_rate

GEMINI_URL = (
    "https://generativelanguage.googleapis.com/v1beta/models/"
    f"{config.GEMINI_MODEL}:generateContent"
)

GEMINI_ITEMS = [
    {"ITEM_NAME": "Park Bench", "MATERIAL": "Steel", "FINISH": "Powder coated",
     "DIMENSION": "1800mm", "QTY": 4},
    {"ITEM_NAME": "Bollard", "MATERIAL": "Cast iron", "FINISH": None,
     "DIMENSION": None, "QTY": "10"},
    {"ITEM_NAME": "Tree Grate", "MATERIAL": None, "FINISH": None,
     "DIMENSION": "1200x1200", "QTY": 2},
]


def _gemini_response(items):
    text = "```json\n" + json.dumps(items) + "\n```"
    return {"candidates": [{"content": {"parts": [{"text": text}]}}]}


def _mock_sheet(google_api, seq_values):
    sid = config.BOQ_SHEET_ID
    google_api.get(f"https://sheets.googleapis.com/v4/spreadsheets/{sid}").respond(
        json={"sheets": [{"properties": {"sheetId": config.BOQ_SHEET_GID, "title": "Ranim 7"}}]}
    )
    # header row 6 (padded " RATE " / "AMOUNT " headers, exactly as in the sheet)
    google_api.get(url__regex=r".*/values/.*6%3A6$").respond(
        json={"values": [["SEQ", "ITEM", "DESCRIPTION", "QTY", "UNIT", " RATE ", "AMOUNT "]]}
    )
    google_api.get(url__regex=r".*/values/.*A7%3AA$").respond(json={"values": seq_values})
    return google_api.post(
        f"https://sheets.googleapis.com/v4/spreadsheets/{sid}/values:batchUpdate"
    ).respond(json={})


def test_generate_tender_upsert_and_skipped(api, google_api):
    google_api.post(GEMINI_URL).respond(json=_gemini_response(GEMINI_ITEMS))
    update_route = _mock_sheet(google_api, [["1"], ["2"]])  # only SEQ 1 and 2 exist

    res = api.post(
        "/generate-tender", files={"boq": ("boq.jpg", b"fake-image", "image/jpeg")}
    )
    body = res.json()
    assert body["success"] is True
    assert body["itemCount"] == 3
    assert body["updatedCount"] == 2
    # SEQ 3 had no matching row -> surfaced instead of silently dropped
    assert body["skipped"] == [{"SEQ": 3, "DESCRIPTION": "Tree Grate, 1200x1200"}]
    assert f"gid={config.BOQ_SHEET_GID}" in body["sheet_url"]

    payload = json.loads(update_route.calls.last.request.content)
    assert payload["valueInputOption"] == "USER_ENTERED"
    by_range = {d["range"]: d["values"][0][0] for d in payload["data"]}
    # Row 7 = SEQ 1 (bench @ 2000 x 4), row 8 = SEQ 2 (bollard @ 600 x 10)
    assert by_range["'Ranim 7'!C7"] == "Park Bench, Steel, Powder coated, 1800mm"
    assert by_range["'Ranim 7'!F7"] == 2000
    assert by_range["'Ranim 7'!G7"] == 8000
    assert by_range["'Ranim 7'!E7"] == "nr"
    assert by_range["'Ranim 7'!F8"] == 600
    assert by_range["'Ranim 7'!G8"] == 6000


def test_generate_tender_gemini_unavailable(api, google_api):
    google_api.post(GEMINI_URL).respond(status_code=500, json={"error": "boom"})
    res = api.post("/generate-tender", files={"boq": ("boq.jpg", b"x", "image/jpeg")})
    assert res.json() == {
        "success": False,
        "error": "Failed to analyze the BOQ document. Gemini unavailable.",
        "stage": "document_analysis",
    }


def test_generate_tender_unparseable_output(api, google_api):
    google_api.post(GEMINI_URL).respond(
        json={"candidates": [{"content": {"parts": [{"text": "not json at all"}]}}]}
    )
    res = api.post("/generate-tender", files={"boq": ("boq.jpg", b"x", "image/jpeg")})
    body = res.json()
    assert body["success"] is False
    assert body["stage"] == "parse"


def test_rate_table():
    assert get_rate("Park Bench, Steel") == 2000
    assert get_rate("BOLLARD cast iron") == 600
    assert get_rate("Bike rack") == 800
    assert get_rate("Tree grate 1200") == 2500
    assert get_rate("Concrete planter") == 1500
    assert get_rate("Litter bin") == 1500
    assert get_rate("Recycle bin double") == 3000
    assert get_rate("Steel railing") == 2000
    assert get_rate("Unknown thing") == 0
    assert get_rate(None) == 0
