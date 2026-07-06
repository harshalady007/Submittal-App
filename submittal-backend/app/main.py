"""FastAPI app: CORS, logging, router registration.

Run locally with: uvicorn app.main:app --reload
On AWS Lambda the module-level `handler` (Mangum) is the entrypoint.
"""
import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app import config, google_auth
from app.routers import boq, fill, library, merge, search, upload

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)s %(name)s %(message)s",
)


@asynccontextmanager
async def lifespan(_app: FastAPI):
    yield
    await google_auth.close_client()


app = FastAPI(title="SUBMITTAL.BUILD backend", lifespan=lifespan)

# Mirrors the CORS headers every n8n respondToWebhook node sent
app.add_middleware(
    CORSMiddleware,
    allow_origins=(
        ["*"] if config.ALLOWED_ORIGINS.strip() == "*"
        else [o.strip() for o in config.ALLOWED_ORIGINS.split(",") if o.strip()]
    ),
    allow_methods=["GET", "POST", "OPTIONS"],
    allow_headers=["Content-Type"],
)

app.include_router(library.router)
app.include_router(search.router)
app.include_router(upload.router)
app.include_router(fill.router)
app.include_router(boq.router)
app.include_router(merge.router)


@app.get("/health")
async def health():
    return {"ok": True}


try:
    from mangum import Mangum

    handler = Mangum(app)
except ImportError:  # mangum only needed on Lambda
    handler = None
