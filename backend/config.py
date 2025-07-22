from pydantic_settings import BaseSettings, SettingsConfigDict
from typing import Optional

class Settings(BaseSettings):
    AZURE_TENANT_ID: Optional[str] = None
    AZURE_APP_CLIENT_ID: Optional[str] = None
    AZURE_CLIENT_SECRET: Optional[str] = None
    AZURE_SUBSCRIPTION_ID: Optional[str] = None
    AZURE_AUTHORITY_HOST: Optional[str] = None
    AZURE_RESOURCE_MANAGER_ENDPOINT: Optional[str] = None
    AZURE_RESOURCE_MANAGER_AUDIENCE: Optional[str] = None

    # Load from .env file
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding='utf-8', extra='ignore')

settings = Settings()