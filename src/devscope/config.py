from __future__ import annotations

import os
import tomllib
from pathlib import Path

from pydantic import BaseModel, Field, NonNegativeFloat, PositiveInt


class BudgetSettings(BaseModel):
    monthly_usd: NonNegativeFloat = 20.0
    hard_stop: bool = True


class LLMModelDefaults(BaseModel):
    ollama: str = "llama3.1:8b"


class LLMSettings(BaseModel):
    provider_chain: list[str] = Field(default_factory=lambda: ["ollama"])
    default_model: LLMModelDefaults = Field(default_factory=LLMModelDefaults)
    budget: BudgetSettings = Field(default_factory=BudgetSettings)


class ScannerSettings(BaseModel):
    auto_rescan_days: PositiveInt = 30
    max_discover_depth: PositiveInt = 4


class WebSettings(BaseModel):
    host: str = "127.0.0.1"
    port: PositiveInt = 8765
    shared_secret: str = ""


class StorageSettings(BaseModel):
    db_path: Path
    home: Path


class Settings(BaseModel):
    llm: LLMSettings = Field(default_factory=LLMSettings)
    scanner: ScannerSettings = Field(default_factory=ScannerSettings)
    web: WebSettings = Field(default_factory=WebSettings)
    storage: StorageSettings


def _resolve_home() -> Path:
    return Path(os.environ.get("DEVSCOPE_HOME", Path.home() / ".devscope")).expanduser()


def load_settings() -> Settings:
    home = _resolve_home()
    home.mkdir(parents=True, exist_ok=True)
    config_file = home / "config.toml"

    raw: dict[str, dict[str, object]] = {}
    if config_file.exists():
        with config_file.open("rb") as f:
            raw = tomllib.load(f)

    storage = raw.setdefault("storage", {})
    storage.setdefault("db_path", str(home / "devscope.db"))
    storage.setdefault("home", str(home))

    return Settings.model_validate(raw)
