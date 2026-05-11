import os
import stat
from pathlib import Path

import pytest

from devscope.secrets import (
    delete_secret,
    get_secret,
    has_secret,
    mask,
    set_secret,
)


@pytest.fixture(autouse=True)
def isolated_home(tmp_path: Path, monkeypatch):
    monkeypatch.setenv("DEVSCOPE_HOME", str(tmp_path))
    # Clear any inherited env var so file-backed tests are deterministic.
    monkeypatch.delenv("OPENAI_API_KEY", raising=False)
    return tmp_path


def test_set_and_get_round_trip(isolated_home):
    set_secret("OPENAI_API_KEY", "sk-abc123")
    assert get_secret("OPENAI_API_KEY") == "sk-abc123"
    assert has_secret("OPENAI_API_KEY") is True


def test_file_is_chmod_600(isolated_home):
    set_secret("OPENAI_API_KEY", "sk-abc123")
    path = isolated_home / ".env"
    assert path.exists()
    mode = stat.S_IMODE(os.stat(path).st_mode)
    assert mode == 0o600


def test_env_var_overrides_stored(isolated_home, monkeypatch):
    set_secret("OPENAI_API_KEY", "sk-stored")
    monkeypatch.setenv("OPENAI_API_KEY", "sk-env")
    assert get_secret("OPENAI_API_KEY") == "sk-env"


def test_get_returns_none_when_missing(isolated_home):
    assert get_secret("ANTHROPIC_API_KEY") is None
    assert has_secret("ANTHROPIC_API_KEY") is False


def test_set_rejects_invalid_name(isolated_home):
    with pytest.raises(ValueError):
        set_secret("not-uppercase", "x")


def test_set_rejects_newlines(isolated_home):
    with pytest.raises(ValueError):
        set_secret("KEY", "with\nnewline")


def test_delete_removes_key(isolated_home):
    set_secret("OPENAI_API_KEY", "sk-abc")
    set_secret("OTHER_KEY", "keep-me")
    delete_secret("OPENAI_API_KEY")
    assert get_secret("OPENAI_API_KEY") is None
    assert get_secret("OTHER_KEY") == "keep-me"


def test_delete_missing_is_noop(isolated_home):
    delete_secret("NEVER_SET")  # no raise


def test_overwrite_replaces_value(isolated_home):
    set_secret("OPENAI_API_KEY", "sk-old")
    set_secret("OPENAI_API_KEY", "sk-new")
    assert get_secret("OPENAI_API_KEY") == "sk-new"
    content = (isolated_home / ".env").read_text()
    assert "sk-old" not in content


def test_mask_short_keys():
    assert mask(None) == "—"
    assert mask("") == "—"
    assert mask("ab") == "••"
    assert mask("sk-abcd1234") == "…1234"
