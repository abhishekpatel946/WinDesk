from fastapi import FastAPI
from fastapi.middleware.gzip import GZipMiddleware

from app.api.routes import router

app = FastAPI(
    title="Wind Forecast Decision API",
    version="1.0.0",
    description="GB national wind forecasts as seen at day-ahead auction deadlines, "
    "and their measured accuracy (Elexon FUELHH / WINDFOR, January 2026).",
    docs_url="/api/docs",
    openapi_url="/api/openapi.json",
)
app.add_middleware(GZipMiddleware, minimum_size=1024)
app.include_router(router, prefix="/api")
