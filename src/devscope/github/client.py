"""Thin GitHub API client used by devscope.

Covers only what the app needs today:
- whoami (authenticated user's login)
- list_repos (owned + collaborator repos, paginated)
- contributions (GraphQL contribution calendar for the heatmap)

Anything else lives in the route handlers; this module stays focused.
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import UTC, datetime, timedelta

import httpx

_API_BASE = "https://api.github.com"
_GRAPHQL_URL = f"{_API_BASE}/graphql"
_USER_AGENT = "devscope/0.0.1"
_TIMEOUT = httpx.Timeout(20.0, connect=10.0)


class GitHubError(Exception):
    """Raised when GitHub returns a non-OK response or the token is invalid."""

    def __init__(self, message: str, status: int | None = None) -> None:
        super().__init__(message)
        self.status = status


@dataclass(frozen=True)
class GitHubUser:
    login: str
    name: str | None
    avatar_url: str | None


@dataclass(frozen=True)
class GitHubRepo:
    full_name: str  # "owner/name"
    name: str
    description: str | None
    private: bool
    fork: bool
    archived: bool
    default_branch: str
    clone_url: str
    pushed_at: str | None  # ISO 8601
    stargazers_count: int
    language: str | None


@dataclass(frozen=True)
class ContributionDay:
    date: str  # ISO date
    count: int
    color: str  # GitHub's level color (#ebedf0 .. #216e39)


@dataclass(frozen=True)
class Contributions:
    login: str
    total: int
    commits: int
    issues: int
    pull_requests: int
    reviews: int
    days: list[ContributionDay]


def _headers(token: str) -> dict[str, str]:
    return {
        "Authorization": f"Bearer {token}",
        "Accept": "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28",
        "User-Agent": _USER_AGENT,
    }


def _raise_for(resp: httpx.Response) -> None:
    if resp.is_success:
        return
    detail = ""
    try:
        body = resp.json()
        detail = body.get("message") or str(body)
    except Exception:
        detail = resp.text[:200]
    raise GitHubError(f"GitHub API {resp.status_code}: {detail}", status=resp.status_code)


async def whoami(token: str) -> GitHubUser:
    try:
        async with httpx.AsyncClient(timeout=_TIMEOUT) as client:
            resp = await client.get(f"{_API_BASE}/user", headers=_headers(token))
    except httpx.HTTPError as exc:
        raise GitHubError(f"network error: {exc.__class__.__name__}") from exc
    _raise_for(resp)
    data = resp.json()
    return GitHubUser(
        login=data["login"],
        name=data.get("name"),
        avatar_url=data.get("avatar_url"),
    )


async def list_repos(token: str, *, max_pages: int = 5) -> list[GitHubRepo]:
    """Return repos the authenticated user can see, sorted by last push."""
    out: list[GitHubRepo] = []
    try:
        async with httpx.AsyncClient(timeout=_TIMEOUT) as client:
            for page in range(1, max_pages + 1):
                resp = await client.get(
                    f"{_API_BASE}/user/repos",
                    headers=_headers(token),
                    params={
                        "per_page": 100,
                        "page": page,
                        "sort": "pushed",
                        "direction": "desc",
                        "affiliation": "owner,collaborator,organization_member",
                    },
                )
                _raise_for(resp)
                batch = resp.json()
                if not batch:
                    break
                for item in batch:
                    out.append(
                        GitHubRepo(
                            full_name=item["full_name"],
                            name=item["name"],
                            description=item.get("description"),
                            private=bool(item.get("private")),
                            fork=bool(item.get("fork")),
                            archived=bool(item.get("archived")),
                            default_branch=item.get("default_branch") or "main",
                            clone_url=item["clone_url"],
                            pushed_at=item.get("pushed_at"),
                            stargazers_count=int(item.get("stargazers_count") or 0),
                            language=item.get("language"),
                        )
                    )
                if len(batch) < 100:
                    break
    except httpx.HTTPError as exc:
        raise GitHubError(f"network error: {exc.__class__.__name__}") from exc
    return out


_CONTRIBUTIONS_QUERY = """
query($from: DateTime!, $to: DateTime!) {
  viewer {
    login
    contributionsCollection(from: $from, to: $to) {
      totalCommitContributions
      totalIssueContributions
      totalPullRequestContributions
      totalPullRequestReviewContributions
      contributionCalendar {
        totalContributions
        weeks {
          contributionDays { date contributionCount color }
        }
      }
    }
  }
}
"""


async def contributions(token: str, *, days: int = 365) -> Contributions:
    """Fetch the contribution calendar for the authenticated user."""
    until = datetime.now(UTC)
    since = until - timedelta(days=days)
    payload = {
        "query": _CONTRIBUTIONS_QUERY,
        "variables": {
            "from": since.strftime("%Y-%m-%dT%H:%M:%SZ"),
            "to": until.strftime("%Y-%m-%dT%H:%M:%SZ"),
        },
    }
    try:
        async with httpx.AsyncClient(timeout=_TIMEOUT) as client:
            resp = await client.post(_GRAPHQL_URL, headers=_headers(token), json=payload)
    except httpx.HTTPError as exc:
        raise GitHubError(f"network error: {exc.__class__.__name__}") from exc
    _raise_for(resp)
    body = resp.json()
    if "errors" in body:
        raise GitHubError(f"GraphQL errors: {body['errors']}")
    viewer = body["data"]["viewer"]
    cc = viewer["contributionsCollection"]
    cal = cc["contributionCalendar"]
    out_days: list[ContributionDay] = []
    for week in cal["weeks"]:
        for day in week["contributionDays"]:
            out_days.append(
                ContributionDay(
                    date=day["date"],
                    count=int(day["contributionCount"]),
                    color=day["color"],
                )
            )
    return Contributions(
        login=viewer["login"],
        total=int(cal["totalContributions"]),
        commits=int(cc["totalCommitContributions"]),
        issues=int(cc["totalIssueContributions"]),
        pull_requests=int(cc["totalPullRequestContributions"]),
        reviews=int(cc["totalPullRequestReviewContributions"]),
        days=out_days,
    )
