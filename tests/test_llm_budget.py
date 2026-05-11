import pytest

from devscope.llm.base import BudgetExceededError
from devscope.llm.budget import BudgetGuard
from devscope.storage.repositories import LLMCallRepo


def test_budget_allows_when_under(db_session, now):
    repo = LLMCallRepo(db_session)
    guard = BudgetGuard(repo=repo, monthly_usd=10.0, hard_stop=True)
    guard.check()  # no spend yet, no error


def test_budget_raises_when_exceeded(db_session, now):
    repo = LLMCallRepo(db_session)
    repo.record(provider="ollama", model="m", purpose="p", prompt_tokens=1,
                output_tokens=1, cost_usd=11.0, duration_ms=1, succeeded=True,
                error=None, called_at=now)
    db_session.commit()
    guard = BudgetGuard(repo=repo, monthly_usd=10.0, hard_stop=True)
    with pytest.raises(BudgetExceededError):
        guard.check()


def test_budget_warns_only_when_soft_stop(db_session, now):
    repo = LLMCallRepo(db_session)
    repo.record(provider="ollama", model="m", purpose="p", prompt_tokens=1,
                output_tokens=1, cost_usd=11.0, duration_ms=1, succeeded=True,
                error=None, called_at=now)
    db_session.commit()
    guard = BudgetGuard(repo=repo, monthly_usd=10.0, hard_stop=False)
    guard.check()  # no raise
