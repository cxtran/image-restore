from functools import lru_cache
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    app_name: str = "Image Restore Studio"
    environment: str = "development"
    secret_key: str = "change-me"
    access_token_expire_minutes: int = 120
    database_url: str = "sqlite:///./image_restore.db"
    storage_dir: str = "./storage"

    realesrgan_cmd: str | None = None
    gfpgan_cmd: str | None = None
    deoldify_cmd: str | None = None

    realesrgan_model_path: str | None = None
    gfpgan_model_path: str | None = None
    gfpgan_upsampler_model_path: str | None = None

    model_config = SettingsConfigDict(env_file=".env", case_sensitive=False)


@lru_cache
def get_settings() -> Settings:
    return Settings()
