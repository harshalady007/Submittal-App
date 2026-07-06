import io

from pypdf import PdfReader, PdfWriter


def _blank_pdf(pages: int = 1) -> bytes:
    writer = PdfWriter()
    for _ in range(pages):
        writer.add_blank_page(width=595, height=842)
    buf = io.BytesIO()
    writer.write(buf)
    return buf.getvalue()


def test_merge_synchronous(api, google_api):
    google_api.get(
        "https://www.googleapis.com/drive/v3/files/COVERDOC/export",
        params={"mimeType": "application/pdf"},
    ).respond(content=_blank_pdf(1), content_type="application/pdf")
    google_api.get(
        "https://www.googleapis.com/drive/v3/files/CERT123", params={"alt": "media"}
    ).respond(content=_blank_pdf(2), content_type="application/pdf")
    upload_route = google_api.post(
        "https://www.googleapis.com/upload/drive/v3/files",
        params={"uploadType": "multipart"},
    ).respond(json={"id": "merged1", "name": "Marina_Submittal.pdf", "mimeType": "application/pdf"})
    google_api.post(
        "https://www.googleapis.com/drive/v3/files/merged1/permissions"
    ).respond(json={"id": "perm"})

    res = api.post(
        "/submittal-merge",
        json={
            "filledDocs": [
                {"docKey": "cover", "viewLink": "https://docs.google.com/document/d/COVERDOC/edit",
                 "orderIndex": 0}
            ],
            "driveFileIds": [{"docKey": "cert", "fileId": "CERT123", "orderIndex": 1}],
            "outputName": "Marina_Submittal",
            "indexItems": [{"label": "Cover Page"}, {"label": "Certificate"}],
        },
    )
    body = res.json()
    assert body["success"] is True
    assert body["jobId"].startswith("sync-")
    assert body["mergedUrl"] == "https://drive.google.com/uc?id=merged1"
    assert body["filename"] == "Marina_Submittal.pdf"
    assert body["fileCount"] == 3  # cover + index + cert

    # The uploaded PDF really contains cover(1) + index(1) + cert(2) pages,
    # with the index inserted right after the cover
    raw = upload_route.calls.last.request.content
    pdf_start = raw.find(b"%PDF")
    pdf_end = raw.rfind(b"%%EOF") + len(b"%%EOF")
    merged = PdfReader(io.BytesIO(raw[pdf_start:pdf_end]))
    assert len(merged.pages) == 4
    assert "INDEX" in (merged.pages[1].extract_text() or "")


def test_merge_index_first_when_no_cover(api, google_api):
    google_api.get(
        "https://www.googleapis.com/drive/v3/files/TDSDOC/export",
        params={"mimeType": "application/pdf"},
    ).respond(content=_blank_pdf(1), content_type="application/pdf")
    upload_route = google_api.post(
        "https://www.googleapis.com/upload/drive/v3/files",
        params={"uploadType": "multipart"},
    ).respond(json={"id": "m2", "name": "x.pdf", "mimeType": "application/pdf"})
    google_api.post("https://www.googleapis.com/drive/v3/files/m2/permissions").respond(json={})

    res = api.post(
        "/submittal-merge",
        json={
            "filledDocs": [
                {"docKey": "tds", "viewLink": "https://docs.google.com/document/d/TDSDOC/edit",
                 "orderIndex": 0}
            ],
            "outputName": "NoCover",
            "indexItems": [{"label": "TDS"}],
        },
    )
    assert res.json()["fileCount"] == 2
    raw = upload_route.calls.last.request.content
    pdf_start, pdf_end = raw.find(b"%PDF"), raw.rfind(b"%%EOF") + 5
    merged = PdfReader(io.BytesIO(raw[pdf_start:pdf_end]))
    assert "INDEX" in (merged.pages[0].extract_text() or "")


def test_merge_rejects_empty(api, google_api):
    res = api.post("/submittal-merge", json={"filledDocs": [], "driveFileIds": []})
    assert res.status_code == 400
    assert res.json()["success"] is False


def test_merge_fetch_shim_always_ready(api):
    res = api.post(
        "/submittal-merge-fetch",
        json={"jobId": "sync-abc", "mergedUrl": "https://drive.google.com/uc?id=m1",
              "outputName": "Pack", "fileCount": 3},
    )
    assert res.json() == {
        "ready": True,
        "success": True,
        "mergedUrl": "https://drive.google.com/uc?id=m1",
        "filename": "Pack.pdf",
        "fileCount": 3,
    }
