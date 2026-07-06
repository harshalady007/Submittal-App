FOLDER = {"id": "f1", "name": "Benches", "mimeType": "application/vnd.google-apps.folder"}
FILE = {"id": "d1", "name": "TDS.pdf", "mimeType": "application/pdf"}


def test_library_root_splits_folders_and_files(api, google_api):
    route = google_api.get("https://www.googleapis.com/drive/v3/files").respond(
        json={"files": [FOLDER, FILE]}
    )
    res = api.get("/submittal-library")
    assert res.status_code == 200
    body = res.json()
    assert body == {"folders": [FOLDER], "files": [FILE], "isRoot": True}
    q = dict(route.calls.last.request.url.params)["q"]
    assert "'1dCvVda8iJf8v7Unxmbvwrxn7xmjt8mRs' in parents" in q


def test_library_subfolder_is_not_root(api, google_api):
    route = google_api.get("https://www.googleapis.com/drive/v3/files").respond(
        json={"files": []}
    )
    res = api.get("/submittal-library", params={"folder": "sub123"})
    assert res.json()["isRoot"] is False
    assert "'sub123' in parents" in dict(route.calls.last.request.url.params)["q"]


def test_library_google_error_returns_json_error(api, google_api):
    google_api.get("https://www.googleapis.com/drive/v3/files").respond(
        status_code=403, json={"error": "denied"}
    )
    res = api.get("/submittal-library")
    assert res.status_code == 502
    assert res.json()["success"] is False
