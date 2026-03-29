from pydantic_settings import BaseSettings
from pathlib import Path


class Settings(BaseSettings):
    secret_key: str
    encryption_key: str
    db_path: str = "../data/network_schedule.db"
    port: int = 7323
    cors_origins: str = "http://localhost:5173,http://localhost:7323"
    admin_username: str = "admin"
    admin_password: str = ""
    max_extension_minutes: int = 120

    @property
    def database_url(self) -> str:
        db = Path(self.db_path)
        if not db.is_absolute():
            db = Path(__file__).parent / db
        db.parent.mkdir(parents=True, exist_ok=True)
        return f"sqlite+aiosqlite:///{db.resolve()}"

    @property
    def cors_origin_list(self) -> list[str]:
        return [o.strip() for o in self.cors_origins.split(",") if o.strip()]

    model_config = {"env_file": "../.env", "env_file_encoding": "utf-8"}


settings = Settings()
