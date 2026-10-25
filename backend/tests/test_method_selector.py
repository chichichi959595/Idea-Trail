"""The rules are a hint; the model decides. These pin both halves down."""

import pytest

from app.agents.framework import METHOD_ORDER
from app.agents.method_selector import (
    RECOMMENDATION_COUNT,
    finalize_selection,
    rank_methods,
)


class FakeSession:
    def __init__(self, has_clear_problem=None, has_existing_product=None, team_size=None):
        self.has_clear_problem = has_clear_problem
        self.has_existing_product = has_existing_product
        self.team_size = team_size


@pytest.mark.parametrize("clear", [True, False, None])
@pytest.mark.parametrize("existing", [True, False, None])
def test_rules_always_suggest_a_full_list(clear, existing):
    """It used to return 1 method for (clear=True, existing=False), which
    capped the whole recommendation down to a single entry."""
    ranking = rank_methods(FakeSession(clear, existing))
    assert len(ranking) == RECOMMENDATION_COUNT
    assert len(set(ranking)) == RECOMMENDATION_COUNT


def test_model_choice_wins_over_the_rules():
    chosen = ["crazy_8s", "analogy", "mashup"]
    assert finalize_selection(chosen, ["pain_point", "user_journey", "scamper"]) == chosen


def test_short_answer_is_topped_up_from_the_rules():
    assert finalize_selection(["crazy_8s"], ["pain_point", "user_journey", "scamper"]) == [
        "crazy_8s",
        "pain_point",
        "user_journey",
    ]


def test_unusable_answer_degrades_to_the_rules():
    fallback = ["pain_point", "user_journey", "scamper"]
    assert finalize_selection([], fallback) == fallback


def test_duplicates_and_unknown_methods_are_dropped():
    result = finalize_selection(
        ["mashup", "mashup", "no_such_method", "analogy"],
        ["pain_point", "user_journey", "scamper"],
    )
    assert result == ["mashup", "analogy", "pain_point"]


def test_always_returns_real_methods():
    result = finalize_selection(["no_such_method"] * 5, [])
    assert len(result) == RECOMMENDATION_COUNT
    assert all(m in METHOD_ORDER for m in result)


def test_relay_is_no_longer_a_project_method():
    """多人接龍 moved to 痛點發想 — 專案發想's rules never score it."""
    from app.agents.method_selector import score_methods

    assert "relay" not in score_methods(FakeSession(False, None, team_size=4))


@pytest.mark.parametrize("team_size", [0, 1])
def test_a_team_too_small_for_the_relay_is_never_offered_it(team_size):
    from app.agents.method_selector import build_discovery_prompt

    session = FakeSession(False, None, team_size=team_size)
    for attr in ("time_budget", "tech_background", "domain_pref", "constraints_text",
                 "clear_problem_text", "existing_product_text"):
        setattr(session, attr, None)

    prompt = build_discovery_prompt(session)
    assert prompt.allowed == ["pain_discovery"]
    assert "relay" not in prompt.schema["properties"]["items"]["items"]["properties"]["method"]["enum"]
    assert "多人接龍" not in prompt.user_prompt
    # Even if the model names it anyway (the enum isn't enforced on every route).
    assert "relay" not in finalize_selection(["relay"], prompt.rule_ranking, allowed=prompt.allowed)


def test_an_unanswered_team_size_rules_nothing_out():
    from app.agents.framework import eligible_methods

    assert eligible_methods(None) == METHOD_ORDER
    assert eligible_methods(2) == METHOD_ORDER
