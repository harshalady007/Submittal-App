import os

# Must be set before app.config is imported (it reads env at import time)
os.environ.setdefault("GOOGLE_CLIENT_ID", "test-client-id")
os.environ.setdefault("GOOGLE_CLIENT_SECRET", "test-client-secret")
os.environ.setdefault("GOOGLE_REFRESH_TOKEN", "test-refresh-token")
os.environ.setdefault("GEMINI_API_KEY", "test-gemini-key")

import pytest
import respx
from fastapi.testclient import TestClient

from app import google_auth
from app.main import app


@pytest.fixture
def api():
    with TestClient(app) as client:
        yield client


@pytest.fixture
def google_api(api):
    """respx mock context with the OAuth token endpoint pre-mocked."""
    # Reset the cached token so every test exercises a clean auth path
    google_auth._token = None
    google_auth._token_expiry = 0.0
    with respx.mock(assert_all_called=False) as mock:
        mock.post("https://oauth2.googleapis.com/token").respond(
            json={"access_token": "test-token", "expires_in": 3600}
        )
        yield mock
