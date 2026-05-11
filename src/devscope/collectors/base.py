from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime
from typing import Any, Protocol


@dataclass(frozen=True)
class Event:
    source: str
    type: str
    external_id: str | None
    payload: dict[str, Any]
    occurred_at: datetime


class Collector(Protocol):
    def fetch(self, *, since: datetime) -> list[Event]: ...
