"""All IDs/constants for the submittal backend, overridable via environment."""
import os

# --- Google OAuth2 (personal My Drive; see README for one-time refresh-token setup)
GOOGLE_CLIENT_ID = os.getenv("GOOGLE_CLIENT_ID", "")
GOOGLE_CLIENT_SECRET = os.getenv("GOOGLE_CLIENT_SECRET", "")
GOOGLE_REFRESH_TOKEN = os.getenv("GOOGLE_REFRESH_TOKEN", "")

# --- Gemini
GEMINI_API_KEY = os.getenv("GEMINI_API_KEY", "")
# n8n hardcoded models/gemini-2.0-flash; gemini-2.5-flash is the current
# recommended stable flash model. Override if Google deprecates it.
GEMINI_MODEL = os.getenv("GEMINI_MODEL", "gemini-2.5-flash")

# --- Drive
DRIVE_ROOT_FOLDER_ID = os.getenv("DRIVE_ROOT_FOLDER_ID", "1dCvVda8iJf8v7Unxmbvwrxn7xmjt8mRs")

DOC_TEMPLATES = {
    "cover":    os.getenv("DOC_TEMPLATE_COVER",    "1th6qlcsAwd0Sd3sOUo7lQ28PsaHMv20CbR6sivr_sjE"),
    "tds":      os.getenv("DOC_TEMPLATE_TDS",      "1pQ4elE7evs4TmKnXYlCiVUPLdO0-SXJ1y4YAFErEPXU"),
    "warranty": os.getenv("DOC_TEMPLATE_WARRANTY", "1equRpuRmmfq1Xs28kE6m7SVOcCIK4VpufzwRpaaxHgw"),
    "origin":   os.getenv("DOC_TEMPLATE_ORIGIN",   "14XKE586Vl8GX6hFZVUF2AIH8_6fhzceV_xs3Q8uMY6U"),
}
SHEET_TEMPLATES = {
    "maf":  os.getenv("SHEET_TEMPLATE_MAF",  "1lgUIHGJx9pgap4ODM4gq2x7k7EJTDwu4uqE2T6HZOMQ"),
    "msdf": os.getenv("SHEET_TEMPLATE_MSDF", "1XTXQ8y2WUUfeQirBasZ85kmvWpN6yBuuIzRsfCuzwSc"),
}

# --- BOQ tender sheet defaults (tab "Ranim 7"). These are only the defaults:
# /generate-tender accepts sheet_id / sheet_gid / header_row / first_data_row
# overrides per request, since future tenders will target different sheets.
BOQ_SHEET_ID = os.getenv("BOQ_SHEET_ID", "1F5CDXWyAP3tNMuK9YKRvOJSDDjdhysAirA2UgvSkNv4")
BOQ_SHEET_GID = int(os.getenv("BOQ_SHEET_GID", "1969418757"))
BOQ_HEADER_ROW = int(os.getenv("BOQ_HEADER_ROW", "6"))
BOQ_FIRST_DATA_ROW = int(os.getenv("BOQ_FIRST_DATA_ROW", "7"))

# --- Server
ALLOWED_ORIGINS = os.getenv("ALLOWED_ORIGINS", "*")
PORT = int(os.getenv("PORT", "8000"))
