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
# specific phrase it must remove. Curated from real LLM output observed on
# this project — patterns get added when they appear in suggestions that
# slipped past the prompt.
_BANNED_SUBSTRINGS: tuple[str, ...] = (
    # Marketing / hype verbs
    "enhances",
    "enhancing",
    "enhancement",
    "introduces",
    "introducing",
    "streamlines",
    "improves the experience",
    "improving the experience",
    # Vague adjectives that add no information
    "comprehensive",
    "seamless",
    "various",
    "overall",
    "robust",
    # Filler abstractions
    "user experience",
    "awareness",
    "for consistency",
    "desired tone",
    "desired structure",
    "desired behavior",
    "relevant suggestions",
    # Soft hedges that signal the model is justifying instead of stating
    "ensures that",
    "still produce",
    "still get",
    "maintain the",
    # "quality" as a hand-wave adjective ("quality output", "quality commits")
    "quality commit",
    "quality output",
    "quality message",
    "quality suggestions",
    "quality code",
)

# Anything wrapped in triple backticks (with or without a language tag) is
# stripped from the model's output before validation. Some providers stubbornly
# wrap their reply even when told not to.
_FENCE_RE = re.compile(r"^```\w*\n?|\n?```\s*$", re.MULTILINE)

# Matches "1. foo", "2) bar" etc. — numbered list fallback when the model
# chooses a numbered format instead of bullets.
_NUMBERED_RE = re.compile(r"^\d+[.)]\s+(.+)$")

# When the repository has fewer than this many recent commits, the generator
# supplements with generic examples so the model has enough style signal to
# imitate. Real commits are always preferred and appear first.
_MIN_EXAMPLES = 3

# Generic Conventional Commits examples used to top up few-shot context for
# fresh repositories. Style: short imperative subject, terse body that
# explains WHY rather than restating WHAT.
_FALLBACK_EXAMPLES: tuple[CommitExample, ...] = (
    CommitExample(
        sha="",
        subject="fix(auth): reject empty tokens before hitting the database",
        body=(
            "Empty bearer tokens slipped past the middleware and caused a DB "
            "lookup on every unauthenticated request. Drop them at the parser."
        ),
    ),
    CommitExample(
        sha="",
        subject="feat(billing): prorate charges on mid-cycle downgrade",
        body=(
            "Downgrades kept the full-tier charge until renewal, which "
            "generated weekly support tickets. Bill only the days at the "
            "higher tier."
        ),
    ),
    CommitExample(
        sha="",
        subject="refactor(api): split the user controller into read/write modules",
        body=(
            "One 1200-line file owned by two teams. Read paths and write "
            "paths now live in separate modules so changes stop colliding."
        ),
    ),
    CommitExample(
        sha="",
        subject="chore: drop python 3.10 from the ci matrix",
        body="Reached EOL last month and no remaining consumer pins it.",
    ),
)


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


def _count_sentences(text: str) -> int:
    """Approximate sentence count for short commit bodies."""
    cleaned = text.strip()
    if not cleaned:
        return 0
    return len(re.findall(r"[.!?](?:\s|$)", cleaned))


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
            return (
                f"the message contains the forbidden phrase '{banned}' — "
                "rewrite with a specific factual statement instead of a generic justification"
            )

    body = lines[1].strip() if len(lines) > 1 else ""
    if body:
        sentence_count = _count_sentences(body)
        if sentence_count > 2:
            return (
                f"the body has {sentence_count} sentences; trim to at most 2. "
                "Each sentence must state a specific fact (a bug, behavior, "
                "or motivation). Drop generic restatements."
            )

    return None


class CommitMessageGenerator:
    """Turn an uncommitted working tree into a Conventional Commits suggestion.

    Two-stage pipeline:
      1. Extraction pass — ask the model to enumerate the distinct logical
         changes in the diff as bullets (deterministic, low temperature).
      2. Message pass — render the message template with those bullets plus
         few-shot examples; if the response fails subject-format / sentence
         / banned-phrase checks, re-prompt once with the failure reason.

    The extraction pass forces the model to acknowledge multi-change diffs
    instead of latching on to the most visible change and ignoring the rest.
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

    async def _extract_changes(self, changes: WorkingTreeChanges) -> list[str]:
        """Pass 1 — list distinct logical changes as short bullets.

        Returns an empty list on any failure; the message pass then falls
        back to single-pass behavior so a flaky extraction never blocks the
        suggestion.
        """
        template = self._env.get_template("extract_changes.j2")
        prompt = template.render(
            status=changes.status,
            diff=changes.diff,
            truncated=changes.truncated,
        )
        try:
            response = await self._router.complete(
                prompt=prompt,
                purpose="commit_message_extract",
                max_tokens=300,
                temperature=0.0,
            )
        except Exception:
            return []

        bullets: list[str] = []
        for raw_line in _clean(response.text).splitlines():
            line = raw_line.strip()
            if not line:
                continue
            if line[0] in "-*•":
                content = line.lstrip("-*• ").strip()
                if content:
                    bullets.append(content)
                continue
            numbered = _NUMBERED_RE.match(line)
            if numbered:
                content = numbered.group(1).strip()
                if content:
                    bullets.append(content)
        return bullets[:5]

    async def run(
        self,
        changes: WorkingTreeChanges,
        examples: Iterable[CommitExample] = (),
    ) -> GeneratorOutput:
        if changes.is_empty:
            return GeneratorOutput(content="", purpose="commit_message")

        template = self._env.get_template("commit_message.j2")
        real_examples = list(examples)
        no_precedent = len(real_examples) == 0
        example_list = real_examples[:]
        if len(example_list) < _MIN_EXAMPLES:
            needed = _MIN_EXAMPLES - len(example_list)
            example_list.extend(_FALLBACK_EXAMPLES[:needed])

        extracted = await self._extract_changes(changes)

        message = ""
        retry_reason: str | None = None
        for attempt in range(self._max_retries + 1):
            prompt = template.render(
                status=changes.status,
                diff=changes.diff,
                truncated=changes.truncated,
                examples=example_list,
                extracted_changes=extracted,
                no_precedent=no_precedent,
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
