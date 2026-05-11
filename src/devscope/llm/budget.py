from __future__ import annotations

import warnings
from datetime import UTC, datetime, timedelta

from devscope.llm.base import BudgetExceededError
from devscope.storage.repositories import LLMCallRepo


class BudgetGuard:
    def __init__(self, *, repo: LLMCallRepo, monthly_usd: float, hard_stop: bool) -> None:
        self.repo = repo
        self.monthly_usd = monthly_usd
        self.hard_stop = hard_stop

    def check(self) -> None:
        if self.monthly_usd <= 0:
            return
        since = datetime.now(UTC) - timedelta(days=30)
        spent = self.repo.sum_cost_since(since)
        if spent < self.monthly_usd:
            return
        msg = f"LLM monthly budget exceeded: ${spent:.4f} >= ${self.monthly_usd:.2f}"
        if self.hard_stop:
            raise BudgetExceededError(msg)
        warnings.warn(msg, stacklevel=2)
