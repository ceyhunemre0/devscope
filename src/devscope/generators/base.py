from __future__ import annotations

from dataclasses import dataclass


@dataclass(frozen=True)
class GeneratorOutput:
    content: str
    purpose: str
