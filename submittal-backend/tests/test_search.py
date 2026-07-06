FILES = [
    {"id": "1", "name": "Litter Bin Warranty.pdf", "mimeType": "application/pdf",
     "webViewLink": "https://drive/1", "parents": ["root"]},
    {"id": "2", "name": "Bench TDS.pdf", "mimeType": "application/pdf",
     "webViewLink": "https://drive/2", "parents": ["root"]},
]


def test_search_empty_returns_without_drive_call(api, google_api):
    route = google_api.get("https://www.googleapis.com/drive/v3/files").respond(json={"files": []})
    res = api.post("/submittal-search", json={"queries": {}, "preferredFilenames": {}})
    assert res.json() == {"success": True, "matches": {}, "fileCount": 0}
    assert not route.called


def test_search_prefers_exact_filename_then_keywords(api, google_api):
    route = google_api.get("https://www.googleapis.com/drive/v3/files").respond(
        json={"files": FILES}
    )
    res = api.post(
        "/submittal-search",
        json={
            "queries": {"warranty": ["bench"], "tds": ["tds"], "missing": ["nothing-matches"]},
            "preferredFilenames": {"warranty": "litter bin warranty.PDF"},
        },
    )
    body = res.json()
    assert body["success"] is True
    assert body["fileCount"] == 2
    # preferred filename wins (case-insensitive) even though keywords also match
    assert body["matches"]["warranty"]["id"] == "1"
    assert body["matches"]["tds"]["id"] == "2"
    assert body["matches"]["missing"] is None
    # parents field is requested from Drive but stripped from the response
    assert "parents" not in body["matches"]["tds"]

    q = dict(route.calls.last.request.url.params)["q"]
    assert "name contains 'bench'" in q
    assert "mimeType != 'application/vnd.google-apps.folder'" in q


def test_search_escapes_single_quotes(api, google_api):
    route = google_api.get("https://www.googleapis.com/drive/v3/files").respond(json={"files": []})
    api.post("/submittal-search", json={"queries": {"a": ["o'brien"]}})
    assert "name contains 'o\\'brien'" in dict(route.calls.last.request.url.params)["q"]
