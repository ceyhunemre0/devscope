from __future__ import annotations

from datetime import datetime
from pathlib import Path
from typing import Protocol

from jinja2 import Environment, FileSystemLoader, select_autoescape

from devscope.collectors.base import Event
from devscope.generators.base import GeneratorOutput
from devscope.llm.base import LLMResponse

_PROMPT_DIR = Path(__file__).parent / "prompts"


class _RouterLike(Protocol):
    async def complete(
        self, *, prompt: str, purpose: str, max_tokens: int = 1500,
        temperature: float = 0.2,
    ) -> LLMResponse: ...


class StandupGenerator:
    def __init__(self, *, router: _RouterLike) -> None:
        self._router = router
        self._env = Environment(
            loader=FileSystemLoader(str(_PROMPT_DIR)),
            autoescape=select_autoescape(disabled_extensions=("j2",)),
            trim_blocks=True,
            lstrip_blocks=True,
        )

    async def run(
        self,
        *,
        events_by_project: dict[str, list[Event]],
        since: datetime,
        until: datetime,
    ) -> GeneratorOutput:
        total = sum(len(v) for v in events_by_project.values())
        if total == 0:
            return GeneratorOutput(
                content=f"_No activity recorded between {since:%Y-%m-%d %H:%M} "
                        f"and {until:%Y-%m-%d %H:%M} (UTC)._",
                purpose="standup",
            )

        prompt = self._env.get_template("standup.j2").render(
            since=since.isoformat(),
            until=until.isoformat(),
            events_by_project=events_by_project,
        )
        resp = await self._router.complete(prompt=prompt, purpose="standup")
        return GeneratorOutput(content=resp.text.strip(), purpose="standup")
