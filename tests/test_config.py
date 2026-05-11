from pathlib import Path

from devscope.config import Settings, load_settings


def test_default_settings_have_sensible_defaults(tmp_path: Path, monkeypatch):
    monkeypatch.setenv("DEVSCOPE_HOME", str(tmp_path))
    settings = load_settings()
    assert settings.llm.provider_chain == ["ollama"]
    assert settings.llm.budget.monthly_usd == 20.0
    assert settings.scanner.auto_rescan_days == 30
    assert settings.web.host == "127.0.0.1"
    assert settings.web.port == 8765
    assert settings.storage.db_path == tmp_path / "devscope.db"


def test_settings_loads_from_toml(tmp_path: Path, monkeypatch):
    monkeypatch.setenv("DEVSCOPE_HOME", str(tmp_path))
    (tmp_path / "config.toml").write_text(
        """
        [llm]
        provider_chain = ["ollama"]
        [llm.budget]
        monthly_usd = 5.0
        """
    )
    settings = load_settings()
    assert settings.llm.budget.monthly_usd == 5.0


def test_settings_is_validated(tmp_path: Path, monkeypatch):
    import pytest
    from pydantic import ValidationError
    monkeypatch.setenv("DEVSCOPE_HOME", str(tmp_path))
    (tmp_path / "config.toml").write_text(
        """
        [llm.budget]
        monthly_usd = -1.0
        """
    )
    with pytest.raises(ValidationError):
        load_settings()
