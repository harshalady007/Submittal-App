import json

from app import config

PROJECT_INFO = {
    "projectName": "Marina Walk",
    "client": "Emaar",
    "mainContractor": "ALEC",
    "subContractor": None,
    "productName": "Litter Bin LB-2",
    "productList": "Litter bins",
    "productWarranty": "FIVE YEARS",
    "date": "2026-07-06",
    "quoteNumber": "Q-991",
}


def _doc_requests(route):
    return json.loads(route.calls.last.request.content)["requests"]


def test_fill_doc_and_sheet(api, google_api):
    google_api.post(
        f"https://www.googleapis.com/drive/v3/files/{config.DOC_TEMPLATES['cover']}/copy"
    ).respond(json={"id": "doc-copy"})
    google_api.post(
        f"https://www.googleapis.com/drive/v3/files/{config.SHEET_TEMPLATES['maf']}/copy"
    ).respond(json={"id": "sheet-copy"})
    google_api.get("https://docs.googleapis.com/v1/documents/doc-copy").respond(
        json={"body": {"content": []}}
    )
    docs_update = google_api.post(
        "https://docs.googleapis.com/v1/documents/doc-copy:batchUpdate"
    ).respond(json={})
    sheets_update = google_api.post(
        "https://sheets.googleapis.com/v4/spreadsheets/sheet-copy:batchUpdate"
    ).respond(json={})

    res = api.post(
        "/submittal-fill",
        json={"selectedDocs": ["cover", "maf", "unknown-key"], "projectInfo": PROJECT_INFO},
    )
    body = res.json()
    assert body["success"] is True
    assert body["documents"]["cover"] == {
        "viewLink": "https://docs.google.com/document/d/doc-copy/edit",
        "downloadLink": "https://docs.google.com/document/d/doc-copy/export?format=docx",
    }
    assert body["documents"]["maf"] == {
        "viewLink": "https://docs.google.com/spreadsheets/d/sheet-copy/edit",
        "downloadLink": "https://docs.google.com/spreadsheets/d/sheet-copy/export?format=xlsx",
    }
    assert "unknown-key" not in body["documents"]
    # cover is a doc, so it carries an _imgDebug entry; sheets don't
    assert "cover" in body["_imgDebug"] and "maf" not in body["_imgDebug"]

    reqs = _doc_requests(docs_update)
    by_find = {
        r["replaceAllText"]["containsText"]["text"]: r["replaceAllText"]["replaceText"]
        for r in reqs
        if "replaceAllText" in r
    }
    assert by_find["M/s. {{CLIENT}}"] == "M/s. Emaar"
    assert by_find["M/s.  {{CLIENT}}"] == "M/s. Emaar"
    assert by_find["M/s. {{SUB_CONTRACTOR}}"] == ""  # None -> empty, no "M/s. " prefix
    assert by_find["{{PRODUCT_WARRANTY}}"] == "five years"
    assert by_find["{{DATE}}"] == "06-07-2026"
    assert by_find["{{REF_NUMBER}}"] == "MS-DW-06-07-01"
    assert by_find["{{EXCLUSION_CLAUSE}}"] == " excluding liners"
    assert all(r["replaceAllText"]["containsText"]["matchCase"] for r in reqs)

    sheet_reqs = json.loads(sheets_update.calls.last.request.content)["requests"]
    by_find = {r["findReplace"]["find"]: r["findReplace"] for r in sheet_reqs}
    assert by_find["{{CLIENT}}"]["replacement"] == "Emaar"
    assert "{{CONSULTANT}}" in by_find and "{{LOCATION}}" in by_find
    assert "M/s. {{CLIENT}}" not in by_find
    assert all(r["findReplace"]["allSheets"] for r in sheet_reqs)


def test_fill_origin_ref_number(api, google_api):
    google_api.post(
        f"https://www.googleapis.com/drive/v3/files/{config.DOC_TEMPLATES['origin']}/copy"
    ).respond(json={"id": "origin-copy"})
    google_api.get("https://docs.googleapis.com/v1/documents/origin-copy").respond(json={})
    update = google_api.post(
        "https://docs.googleapis.com/v1/documents/origin-copy:batchUpdate"
    ).respond(json={})

    api.post("/submittal-fill", json={"selectedDocs": ["origin"], "projectInfo": PROJECT_INFO})
    by_find = {
        r["replaceAllText"]["containsText"]["text"]: r["replaceAllText"]["replaceText"]
        for r in _doc_requests(update)
    }
    assert by_find["{{REF_NUMBER}}"] == "MS-COO-06-07-01"


def test_fill_tds_image_replacement(api, google_api):
    doc_structure = {
        "body": {
            "content": [
                {
                    "paragraph": {
                        "elements": [{"inlineObjectElement": {"inlineObjectId": "img-early"}}]
                    }
                },
                {
                    "table": {
                        "tableRows": [
                            {
                                "tableCells": [
                                    {
                                        "content": [
                                            {
                                                "paragraph": {
                                                    "elements": [
                                                        {
                                                            "inlineObjectElement": {
                                                                "inlineObjectId": "img-in-table"
                                                            }
                                                        }
                                                    ]
                                                }
                                            }
                                        ]
                                    }
                                ]
                            }
                        ]
                    }
                },
            ]
        },
        "inlineObjects": {
            "img-in-table": {
                "inlineObjectProperties": {
                    "embeddedObject": {
                        "size": {
                            "width": {"magnitude": 150.4},
                            "height": {"magnitude": 210.0},
                        }
                    }
                }
            }
        },
    }
    google_api.post(
        f"https://www.googleapis.com/drive/v3/files/{config.DOC_TEMPLATES['tds']}/copy"
    ).respond(json={"id": "tds-copy"})
    google_api.get("https://docs.googleapis.com/v1/documents/tds-copy").respond(json=doc_structure)
    update = google_api.post(
        "https://docs.googleapis.com/v1/documents/tds-copy:batchUpdate"
    ).respond(json={})

    res = api.post(
        "/submittal-fill",
        json={
            "selectedDocs": ["tds"],
            "projectInfo": {**PROJECT_INFO, "productImageUrl": "https://drive.google.com/uc?id=img123"},
        },
    )
    debug = res.json()["_imgDebug"]["tds"]
    assert debug["chosen"] == "img-in-table"  # last inline object in document order
    assert debug["chosenType"] == "inline"
    assert debug["bodyInline"] == 2

    replace_img = next(r for r in _doc_requests(update) if "replaceImage" in r)["replaceImage"]
    assert replace_img["imageObjectId"] == "img-in-table"
    assert replace_img["imageReplaceMethod"] == "CENTER_CROP"
    # 150.4 -> round 150 -> *3 = 450; 210 -> 630; letterboxed via wsrv.nl
    assert (
        replace_img["uri"]
        == "https://wsrv.nl/?url=https%3A%2F%2Fdrive.google.com%2Fuc%3Fid%3Dimg123"
        "&w=450&h=630&fit=contain&cbg=white&output=jpg&q=90"
    )


def test_fill_no_valid_docs(api, google_api):
    res = api.post("/submittal-fill", json={"selectedDocs": [], "projectInfo": {}})
    assert res.json() == {"success": True, "documents": {}, "_imgDebug": {}}
