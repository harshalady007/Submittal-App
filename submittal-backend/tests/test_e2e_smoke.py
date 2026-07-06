"""Opt-in end-to-end smoke test against the real Google APIs.

Skipped by default. To run it, fill .env with real credentials and:

    RUN_E2E_SMOKE=1 pytest tests/test_e2e_smoke.py -v

It only lists the Drive library root (read-only) — safe to run any time.
"""
import os

import pytest
from fastapi.testclient import TestClient

pytestmark = pytest.mark.skipif(
    os.environ.get("RUN_E2E_SMOKE") != "1",
    reason="set RUN_E2E_SMOKE=1 (with real creds in env) to run",
)


def test_library_against_real_drive():
    from app.main import app

    with TestClient(app) as client:
        res = client.get("/submittal-library")
        assert res.status_code == 200
        body = res.json()
        assert body["isRoot"] is True
        assert isinstance(body["folders"], list)
        assert isinstance(body["files"], list)
