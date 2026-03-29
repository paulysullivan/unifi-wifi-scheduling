import logging
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse

from config import settings
from database import async_session
from seed import seed_admin
from scheduler import start_scheduler, stop_scheduler

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)-8s %(name)s — %(message)s",
)
logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup
    async with async_session() as db:
        await seed_admin(db)
    await start_scheduler()
    logger.info(f"Network Schedule Manager running on port {settings.port}")
    yield
    # Shutdown
    stop_scheduler()


app = FastAPI(title="Network Schedule Manager", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origin_list,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Register API routers
from routers import auth, credentials, devices, groups, schedules, extensions, status

app.include_router(auth.router)
app.include_router(credentials.router)
app.include_router(devices.router)
app.include_router(groups.router)
app.include_router(schedules.router)
app.include_router(extensions.router)
app.include_router(status.router)

# Serve frontend static files
dist_dir = Path(__file__).parent / "../frontend/dist"
if dist_dir.exists():
    app.mount("/assets", StaticFiles(directory=str(dist_dir / "assets")), name="assets")

    @app.get("/{full_path:path}")
    async def serve_spa(full_path: str):
        file_path = dist_dir / full_path
        if file_path.is_file():
            return FileResponse(str(file_path))
        return FileResponse(str(dist_dir / "index.html"))
