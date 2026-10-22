"""GitHub repository search for 專案收斂's 競品搜尋 stage.

Called directly against the REST API rather than through a model's search
tool, so it works whichever provider the team picked — web search is the
`anthropic` provider's alone, but "has someone already open-sourced this"
shouldn't depend on that.

Unauthenticated, the search API allows 10 requests a minute, plenty for one
stage that sends two or three queries. Set `GITHUB_TOKEN` to lift that.
Standard library only: this is the one outbound HTTP call in the backend and
not worth a runtime dependency.
"""

from __future__ import annotations

import asyncio
import json
import os
import urllib.error
import urllib.parse
import urllib.request

_API = "https://api.github.com/search/repositories"
_TIMEOUT_SECONDS = 15


class GitHubSearchError(Exception):
    pass


def _search_sync(query: str, per_page: int) -> list[dict]:
    params = urllib.parse.urlencode(
        {"q": query, "sort": "stars", "order": "desc", "per_page": per_page}
    )
    headers = {
        "Accept": "application/vnd.github+json",
        "User-Agent": "ideatrail-convergence",
        "X-GitHub-Api-Version": "2022-11-28",
    }
    token = os.environ.get("GITHUB_TOKEN")
    if token:
        headers["Authorization"] = f"Bearer {token}"
    request = urllib.request.Request(f"{_API}?{params}", headers=headers)
    try:
        with urllib.request.urlopen(request, timeout=_TIMEOUT_SECONDS) as res:
            body = json.load(res)
    except urllib.error.HTTPError as exc:
        if exc.code in (403, 429):
            raise GitHubSearchError("GitHub 搜尋額度用完了，等一分鐘再試，或設定 GITHUB_TOKEN") from exc
        raise GitHubSearchError(f"GitHub 回應 {exc.code}") from exc
    except (urllib.error.URLError, TimeoutError) as exc:
        raise GitHubSearchError(f"連不上 GitHub：{exc}") from exc

    return [
        {
            "full_name": item["full_name"],
            "url": item["html_url"],
            "description": item.get("description"),
            "stars": item.get("stargazers_count", 0),
            "language": item.get("language"),
            "updated_at": item.get("pushed_at"),
            "query": query,
        }
        for item in body.get("items", [])
    ]


async def search_repositories(queries: list[str], per_query: int = 5) -> list[dict]:
    """Every query's top repositories, de-duplicated, most-starred first."""
    seen: dict[str, dict] = {}
    for query in queries:
        for hit in await asyncio.to_thread(_search_sync, query, per_query):
            seen.setdefault(hit["full_name"], hit)
    return sorted(seen.values(), key=lambda h: h["stars"], reverse=True)
