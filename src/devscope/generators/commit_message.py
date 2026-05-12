from __future__ import annotations

import re
from collections.abc import Iterable
from pathlib import Path
from typing import Protocol

from jinja2 import Environment, FileSystemLoader, select_autoescape

from devscope.collectors.git_diff import CommitExample, WorkingTreeChanges
from devscope.generators.base import GeneratorOutput
from devscope.llm.base import LLMResponse

_PROMPT_DIR = Path(__file__).parent / "prompts"

_SUBJECT_RE = re.compile(
    r"^(feat|fix|chore|docs|refactor|test|perf|style|build|ci)"
    r"(\([^)]+\))?: \S.*$"
)

# Substrings that signal generic LLM filler. Matched case-insensitively
# anywhere in the output. The retry pass will re-prompt the model with the
# specific phrase it must remove.
_BANNED_SUBSTRINGS: tuple[str, ...] = (
    "enhances",
    "enhancing",
    "enhancement",
    "introduces",
    "introducing",
    "comprehensive",
    "seamless",
    "various",
    "overall",
    "user experience",
    "awareness",
    "streamlines",
    "improves the experience",
    "improving the experience",
)

# Anything wrapped in triple backticks (with or without a language tag) is
# stripped from the model's output before validation. Some providers stubbornly
# wrap their reply even when told not to.
_FENCE_RE = re.compile(r"^```\w*\n?|\n?```\s*$", re.MULTILINE)


class _RouterLike(Protocol):
    async def complete(
        self,
        *,
        prompt: str,
        purpose: str,
        max_tokens: int = 1500,
        temperature: float = 0.2,
    ) -> LLMResponse: ...


def _clean(raw: str) -> str:
    return _FENCE_RE.sub("", raw).strip()


def _validate(message: str) -> str | None:
    """Return None if the message passes; otherwise a human-readable reason."""
    if not message:
        return "the response was empty"

    lines = message.split("\n", 1)
    subject = lines[0].rstrip()

    if not _SUBJECT_RE.match(subject):
        return (
            f"the subject line '{subject[:60]}' does not match the format "
            "<type>(<scope>): <description> using one of the allowed types"
        )
    if len(subject) > 72:
        return f"the subject is {len(subject)} characters; the limit is 72"
    if subject.endswith("."):
        return "the subject must not end with a period"

    after_type = subject.split(":", 1)[1].strip() if ":" in subject else ""
    if after_type and after_type[0].isupper():
        return "the first word after the type must be lowercase (imperative mood)"

    lowered = message.lower()
    for banned in _BANNED_SUBSTRINGS:
        if banned in lowered:
            return f"the message contains the forbidden phrase '{banned}'"

    return None


class CommitMessageGenerator:
    """Turn an uncommitted working tree into a Conventional Commits suggestion.

    Two-pass discipline: render with few-shot examples and explicit rules; if
    the response fails subject-format or banned-phrase checks, re-prompt once
    with the specific failure reason so the model can correct itself.
    """

    def __init__(self, *, router: _RouterLike, max_retries: int = 1) -> None:
        self._router = router
        self._max_retries = max_retries
        self._env = Environment(
            loader=FileSystemLoader(str(_PROMPT_DIR)),
            autoescape=select_autoescape(disabled_extensions=("j2",)),
            trim_blocks=True,
            lstrip_blocks=True,
        )

    async def run(
        self,
        changes: WorkingTreeChanges,
        examples: Iterable[CommitExample] = (),
    ) -> GeneratorOutput:
        if changes.is_empty:
            return GeneratorOutput(content="", purpose="commit_message")

        template = self._env.get_template("commit_message.j2")
        example_list = list(examples)

        message = ""
        retry_reason: str | None = None
        for attempt in range(self._max_retries + 1):
            prompt = template.render(
                status=changes.status,
                diff=changes.diff,
                truncated=changes.truncated,
                examples=example_list,
                retry_reason=retry_reason,
            )
            response = await self._router.complete(
                prompt=prompt,
                purpose="commit_message",
                max_tokens=400,
                temperature=0.2 if attempt == 0 else 0.1,
            )
            message = _clean(response.text)
            retry_reason = _validate(message)
            if retry_reason is None:
                break

        return GeneratorOutput(content=message, purpose="commit_message")
