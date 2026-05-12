from __future__ import annotations

from pathlib import Path
from typing import Protocol

from jinja2 import Environment, FileSystemLoader, select_autoescape

from devscope.collectors.git_diff import WorkingTreeChanges
from devscope.generators.base import GeneratorOutput
from devscope.llm.base import LLMResponse

_PROMPT_DIR = Path(__file__).parent / "prompts"


class _RouterLike(Protocol):
    async def complete(
        self,
        *,
        prompt: str,
        purpose: str,
        max_tokens: int = 1500,
        temperature: float = 0.2,
    ) -> LLMResponse: ...


class CommitMessageGenerator:
    """Turn an uncommitted working tree into a Conventional Commits suggestion."""

    def __init__(self, *, router: _RouterLike) -> None:
        self._router = router
        self._env = Environment(
            loader=FileSystemLoader(str(_PROMPT_DIR)),
            autoescape=select_autoescape(disabled_extensions=("j2",)),
            trim_blocks=True,
            lstrip_blocks=True,
        )

    async def run(self, changes: WorkingTreeChanges) -> GeneratorOutput:
        if changes.is_empty:
            return GeneratorOutput(content="", purpose="commit_message")

        template = self._env.get_template("commit_message.j2")
        prompt = template.render(
            status=changes.status,
            diff=changes.diff,
            truncated=changes.truncated,
        )
        response = await self._router.complete(
            prompt=prompt,
            purpose="commit_message",
            max_tokens=400,
            temperature=0.2,
        )
        return GeneratorOutput(content=response.text.strip(), purpose="commit_message")
