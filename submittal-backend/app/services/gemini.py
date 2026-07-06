"""Gemini BOQ extraction via the Generative Language REST API."""
import base64
import logging

from app import config
from app.google_auth import get_client

logger = logging.getLogger("submittal.gemini")

# Ported verbatim from the n8n BOQ workflow — do not reword.
BOQ_PROMPT = (
    "You are a strict BOQ data extraction system. Extract ONLY what is explicitly "
    "visible in the image. DO NOT guess. DO NOT infer. DO NOT add new items. For each "
    "item extract ITEM_NAME, MATERIAL, FINISH, DIMENSION, QTY. Ignore item codes like "
    "F01/FU-03. If data is missing return null. If unsure skip the item. Output a "
    "strict JSON array of `{ITEM_NAME, MATERIAL, FINISH, DIMENSION, QTY}`."
)


async def extract_boq(content: bytes, mime_type: str) -> str | None:
    """Send the BOQ image/PDF to Gemini; return the raw text response or None."""
    url = (
        "https://generativelanguage.googleapis.com/v1beta/models/"
        f"{config.GEMINI_MODEL}:generateContent"
    )
    body = {
        "contents": [
            {
                "parts": [
                    {"text": BOQ_PROMPT},
                    {
                        "inline_data": {
                            "mime_type": mime_type or "image/jpeg",
                            "data": base64.b64encode(content).decode(),
                        }
                    },
                ]
            }
        ]
    }
    resp = await get_client().post(
        url, json=body, headers={"x-goog-api-key": config.GEMINI_API_KEY}
    )
    logger.info("POST %s -> %s", url, resp.status_code)
    if resp.status_code >= 400:
        logger.error("Gemini error: %s", resp.text[:1000])
        return None
    data = resp.json()
    try:
        parts = data["candidates"][0]["content"]["parts"]
        text = "".join(p.get("text", "") for p in parts).strip()
        return text or None
    except (KeyError, IndexError, TypeError):
        logger.error("Gemini returned no usable candidates: %s", str(data)[:500])
        return None
