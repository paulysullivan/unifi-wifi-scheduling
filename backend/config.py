from pydantic_settings import BaseSettings
from pathlib import Path

_this_dir = Path(__file__).parent
_env_file = _this_dir / "../.env"


class Settings(BaseSettings):
    secret_key: str
    encryption_key: str
    db_path: str = "../data/network_schedule.db"
    port: int = 7323
    cors_origins: str = "http://localhost:5173,http://localhost:7323"
    max_extension_minutes: int = 120
    admin_username: str = "admin"
    admin_password: str = ""
    static_dir: str = ""

    @property
    def database_url(self) -> str:
        db = Path(self.db_path)
        if not db.is_absolute():
            db = _this_dir / db
        db.parent.mkdir(parents=True, exist_ok=True)
        return f"sqlite+aiosqlite:///{db.resolve()}"

    @property
    def cors_origin_list(self) -> list[str]:
        return [o.strip() for o in self.cors_origins.split(",") if o.strip()]

    @property
    def resolved_static_dir(self) -> Path | None:
        if self.static_dir:
            p = Path(self.static_dir)
            return p if p.exists() else None
        # Source checkout layout
        p = _this_dir / "../frontend/dist"
        if p.exists():
            return p.resolve()
        # Docker layout: static dir next to backend
        p = _this_dir / "../static"
        if p.exists():
            return p.resolve()
        return None

    model_config = {
        "env_file": str(_env_file) if _env_file.exists() else None,
        "env_file_encoding": "utf-8",
        "extra": "ignore",
    }


settings = Settings()
