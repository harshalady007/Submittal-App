"""Vercel Python entrypoint — serves the FastAPI app as one ASGI function.

Vercel's Python runtime detects the module-level `app` ASGI application.
All routes are rewritten here via vercel.json.
"""
from app.main import app  # noqa: F401
