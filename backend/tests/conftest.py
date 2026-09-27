"""Shared fixtures for the API integration tests.

Two things are swapped out so these stay fast, hermetic and free:

* the database — an in-memory SQLite shared across connections, injected via
  FastAPI's dependency_overrides, so the working `workbench.sqlite3` is never
  opened;
* the LLM provider — a `FakeProvider` registered in the provider registry, so
  no test ever shells out to the `claude` or `codex` CLI or spends quota.
"""

from __future__ import annotations

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.agents.framework.base import FINALIZE_OUTPUT_SCHEMA
from app.db.models import Base
from app.db.session import get_db
from app.main import app
from app.providers import registry
from app.providers.base import LLMResult, ModelOption, StreamEvent

DEFAULT_STEP_OUTPUT = {
    "is_relevant": True,
    "clarification": "",
    "analysis": "這個回答點出了排隊與等待時間的核心浪費。",
    "idea_fragments": ["預約取餐時段", "即時排隊人數地圖"],
}
DEFAULT_FINALIZE_OUTPUT = {
    "ideas": [
        {"title": "校園午餐預約取餐系統", "description": "讓學生先點餐再到店取件，避開尖峰排隊。"},
        {"title": "即時排隊時間查詢地圖", "description": "顯示附近店家的預估等待時間與尖離峰趨勢。"},
    ]
}


class FakeProvider:
    """Stands in for a local CLI provider. Records every call, and lets a test
    dictate what the step and finalize calls come back with."""

    name = "fake"
    label = "Fake Provider"
    speed_tier = "fast"
    speed_note = "測試用，不會真的呼叫任何東西。"

    def __init__(self) -> None:
        self.calls: list[dict] = []
        self.step_output: dict | None = dict(DEFAULT_STEP_OUTPUT)
        self.finalize_output: dict | None = dict(DEFAULT_FINALIZE_OUTPUT)
        self.raises: Exception | None = None

    @property
    def default_model(self) -> str:
        return "fake-model"

    @property
    def default_step_model(self) -> str:
        # A different id from default_model on purpose, so the tests can tell
        # the two roles apart instead of both reading as "fake-model".
        return "fake-step-model"

    def list_models(self) -> list[ModelOption]:
        return [
            ModelOption("fake-model", "Fake Model", "測試用"),
            ModelOption("fake-step-model", "Fake Step Model", "測試用，步驟專用"),
        ]

    @property
    def step_calls(self) -> list[dict]:
        return [c for c in self.calls if not c["is_finalize"]]

    @property
    def finalize_calls(self) -> list[dict]:
        return [c for c in self.calls if c["is_finalize"]]

    async def complete(
        self, *, system_prompt: str, user_prompt: str, json_schema=None, model=None
    ) -> LLMResult:
        is_finalize = json_schema is FINALIZE_OUTPUT_SCHEMA
        self.calls.append(
            {
                "system_prompt": system_prompt,
                "user_prompt": user_prompt,
                "model": model,
                "is_finalize": is_finalize,
            }
        )
        if self.raises is not None:
            raise self.raises
        structured = self.finalize_output if is_finalize else self.step_output
        return LLMResult(
            text="",
            structured=structured,
            provider=self.name,
            model=model,
            resolved_model=model,
            cost_usd=None,
            duration_ms=1,
            raw="",
        )

    async def health(self) -> dict:
        return {"ok": True}


class FakeStreamingProvider(FakeProvider):
    """A provider that also implements `stream`, so the SSE endpoints can be
    tested against something that really emits deltas. Providers without a
    `stream` method go down the single-result path instead, and both are
    exercised."""

    name = "fake-streaming"
    label = "Fake Streaming Provider"

    thinking_chunks = ["先看他們寫的限制條件，", "再對照方法目錄。"]

    async def stream(self, **kwargs):
        for chunk in self.thinking_chunks:
            yield StreamEvent("thinking", text=chunk)
        yield StreamEvent("result", result=await self.complete(**kwargs))


@pytest.fixture
def provider(monkeypatch) -> FakeProvider:
    fake = FakeProvider()
    monkeypatch.setitem(registry._PROVIDERS, "fake", fake)
    return fake


@pytest.fixture
def streaming_provider(monkeypatch) -> FakeStreamingProvider:
    fake = FakeStreamingProvider()
    monkeypatch.setitem(registry._PROVIDERS, "fake-streaming", fake)
    return fake


@pytest.fixture
def client(provider):
    # StaticPool keeps every connection on the same in-memory database;
    # without it each new connection would get its own empty one.
    engine = create_engine(
        "sqlite://",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    Base.metadata.create_all(engine)
    TestingSession = sessionmaker(bind=engine, autoflush=False, autocommit=False)

    def override_get_db():
        db = TestingSession()
        try:
            yield db
        finally:
            db.close()

    app.dependency_overrides[get_db] = override_get_db
    with TestClient(app) as c:
        yield c
    app.dependency_overrides.clear()
    engine.dispose()


@pytest.fixture
def session_id(client) -> int:
    res = client.post(
        "/sessions",
        json={
            "team_size": 3,
            "time_budget": "2 個月",
            "tech_background": "前端、資料/AI",
            "has_clear_problem": True,
            "clear_problem_text": "排隊買午餐很浪費時間",
            "has_existing_product": False,
        },
    )
    assert res.status_code == 200, res.text
    return res.json()["id"]


@pytest.fixture
def start_run(client, session_id):
    """Open a method run on the fixture session. `start_run(method="crazy_8s")`."""

    def _start(method: str = "pain_point", model: str | None = "fake-model") -> dict:
        res = client.post(
            f"/sessions/{session_id}/method-runs",
            json={"method_name": method, "provider": "fake", "model": model},
        )
        assert res.status_code == 200, res.text
        return res.json()

    return _start


@pytest.fixture
def answer_all(client):
    """Walk a run to completion, returning the final response payload."""

    def _answer(run: dict, answer: str = "午餐尖峰時段每次都要排十五分鐘以上") -> dict:
        payload = {"method_run": run}
        while payload["method_run"]["status"] == "running":
            res = client.post(
                f"/method-runs/{run['id']}/answer",
                json={
                    "step_index": payload["method_run"]["current_step_index"],
                    "answer": answer,
                },
            )
            assert res.status_code == 200, res.text
            payload = res.json()
        return payload

    return _answer
