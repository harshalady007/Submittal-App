"""OAuth2 refresh-token -> bearer token helper + authenticated request wrapper.

Mirrors what n8n's googleDriveOAuth2Api credential does internally: exchange a
long-lived refresh token for a short-lived access token and cache it in memory
until near expiry. Async-safe (single lock, double-checked).
"""
import asyncio
import logging
import time

import httpx

from app import config

logger = logging.getLogger("submittal.google")

TOKEN_URL = "https://oauth2.googleapis.com/token"

_client: httpx.AsyncClient | None = None
_token: str | None = None
_token_expiry: float = 0.0
_lock = asyncio.Lock()


class GoogleAPIError(Exception):
    """Raised for non-2xx responses from Google APIs."""

    def __init__(self, status_code: int, message: str):
        self.status_code = status_code
        self.message = message
        super().__init__(f"Google API error {status_code}: {message}")


def get_client() -> httpx.AsyncClient:
    global _client
    if _client is None or _client.is_closed:
        _client = httpx.AsyncClient(timeout=httpx.Timeout(120.0, connect=15.0))
    return _client


async def close_client() -> None:
    global _client
    if _client is not None and not _client.is_closed:
        await _client.aclose()
    _client = None


def _token_valid() -> bool:
    # 60s safety margin so we never send a token about to expire
    return _token is not None and time.time() < _token_expiry - 60


async def get_access_token() -> str:
    global _token, _token_expiry
    if _token_valid():
        return _token  # type: ignore[return-value]
    async with _lock:
        if _token_valid():
            return _token  # type: ignore[return-value]
        resp = await get_client().post(
            TOKEN_URL,
            data={
                "client_id": config.GOOGLE_CLIENT_ID,
                "client_secret": config.GOOGLE_CLIENT_SECRET,
                "refresh_token": config.GOOGLE_REFRESH_TOKEN,
                "grant_type": "refresh_token",
            },
        )
        logger.info("POST %s -> %s", TOKEN_URL, resp.status_code)
        if resp.status_code >= 400:
            raise GoogleAPIError(resp.status_code, f"Token refresh failed: {resp.text[:500]}")
        data = resp.json()
        _token = data["access_token"]
        _token_expiry = time.time() + float(data.get("expires_in", 3600))
        return _token


async def authed_request(method: str, url: str, **kwargs) -> httpx.Response:
    """Send an authenticated request to a Google API and log it.

    This log line is the only debugging trail now that there's no n8n
    execution log — keep it on for every Drive/Docs/Sheets call.
    """
    token = await get_access_token()
    headers = kwargs.pop("headers", None) or {}
    headers["Authorization"] = f"Bearer {token}"
    resp = await get_client().request(method, url, headers=headers, **kwargs)
    logger.info("%s %s -> %s", method.upper(), url, resp.status_code)
    if resp.status_code >= 400:
        raise GoogleAPIError(resp.status_code, resp.text[:1000])
    return resp
