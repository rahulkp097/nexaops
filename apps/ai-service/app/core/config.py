from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    database_app_url: str = "postgresql://nexaops_app:nexaops_app@localhost:55432/nexaops"
    redis_url: str = "redis://localhost:56379"


@lru_cache
def get_settings() -> Settings:
    return Settings()
