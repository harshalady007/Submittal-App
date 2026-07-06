import json


def test_image_upload(api, google_api):
    upload_route = google_api.post(
        "https://www.googleapis.com/upload/drive/v3/files",
        params={"uploadType": "multipart"},
    ).respond(json={"id": "img123", "name": "product-image-x.jpg", "mimeType": "image/jpeg"})
    perm_route = google_api.post(
        "https://www.googleapis.com/drive/v3/files/img123/permissions"
    ).respond(json={"id": "perm1"})

    res = api.post(
        "/submittal-image-upload",
        files={"image": ("photo.jpg", b"\xff\xd8fakejpeg", "image/jpeg")},
    )
    body = res.json()
    assert body["success"] is True
    assert body["fileId"] == "img123"
    assert body["publicUrl"] == "https://drive.google.com/uc?id=img123"
    assert body["viewUrl"] == "https://drive.google.com/file/d/img123/view"

    # multipart/related body carries metadata (name + parent folder) and the bytes
    raw = upload_route.calls.last.request.content
    assert b"1dCvVda8iJf8v7Unxmbvwrxn7xmjt8mRs" in raw
    assert b"product-image-" in raw
    assert b"fakejpeg" in raw
    assert json.loads(perm_route.calls.last.request.content) == {"role": "reader", "type": "anyone"}
