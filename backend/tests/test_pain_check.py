"""The setup screen's pain point check."""

from __future__ import annotations

import pytest

from app.providers.base import ProviderError


@pytest.mark.parametrize("verdict", ["clear", "vague", "not_pain_point"])
def test_verdict_and_feedback_come_back(client, provider, verdict):
    provider.step_output = {"verdict": verdict, "feedback": "  一句回饋。 "}
    res = client.post("/pain-check", json={"statement": "二手書很難賣", "provider": "fake"})
    assert res.status_code == 200
    assert res.json() == {"verdict": verdict, "feedback": "一句回饋。"}


def test_runs_on_the_step_model_and_sends_the_statement(client, provider):
    provider.step_output = {"verdict": "clear", "feedback": ""}
    client.post("/pain-check", json={"statement": "系上二手書買賣對不上", "provider": "fake"})
    call = provider.calls[-1]
    assert call["model"] == "fake-step-model"
    assert "系上二手書買賣對不上" in call["user_prompt"]


def test_an_unreadable_answer_lets_the_team_through(client, provider):
    provider.step_output = {"verdict": "maybe"}
    res = client.post("/pain-check", json={"statement": "隨便", "provider": "fake"})
    assert res.json()["verdict"] == "clear"


def test_empty_statement_is_rejected_without_a_call(client, provider):
    res = client.post("/pain-check", json={"statement": "   ", "provider": "fake"})
    assert res.status_code == 400
    assert provider.calls == []


def test_provider_failure_is_a_502(client, provider):
    provider.raises = ProviderError("CLI 掛了")
    res = client.post("/pain-check", json={"statement": "排隊太久", "provider": "fake"})
    assert res.status_code == 502
