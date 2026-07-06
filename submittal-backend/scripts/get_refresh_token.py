"""One-time helper: complete the Google OAuth consent flow locally and print a
long-lived refresh token for .env.

Prerequisites (Google Cloud Console, once):
  1. Create/reuse an OAuth Client ID of type "Desktop app".
  2. Enable the Drive, Docs and Sheets APIs on the project.

Usage:
  pip install google-auth-oauthlib
  GOOGLE_CLIENT_ID=... GOOGLE_CLIENT_SECRET=... python scripts/get_refresh_token.py

A browser window opens; sign in with the SAME personal Gmail account that owns
the Drive templates (the one the n8n credential used). The refresh token is
printed at the end — put it in .env as GOOGLE_REFRESH_TOKEN.
"""
import os
import sys

from google_auth_oauthlib.flow import InstalledAppFlow

SCOPES = [
    "https://www.googleapis.com/auth/drive",
    "https://www.googleapis.com/auth/documents",
    "https://www.googleapis.com/auth/spreadsheets",
]


def main() -> None:
    client_id = os.environ.get("GOOGLE_CLIENT_ID")
    client_secret = os.environ.get("GOOGLE_CLIENT_SECRET")
    if not client_id or not client_secret:
        sys.exit("Set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET env vars first.")

    flow = InstalledAppFlow.from_client_config(
        {
            "installed": {
                "client_id": client_id,
                "client_secret": client_secret,
                "auth_uri": "https://accounts.google.com/o/oauth2/auth",
                "token_uri": "https://oauth2.googleapis.com/token",
                "redirect_uris": ["http://localhost"],
            }
        },
        scopes=SCOPES,
    )
    # access_type=offline + prompt=consent forces Google to issue a refresh token
    creds = flow.run_local_server(port=0, access_type="offline", prompt="consent")
    print("\nGOOGLE_REFRESH_TOKEN=" + (creds.refresh_token or "<none returned>"))


if __name__ == "__main__":
    main()
