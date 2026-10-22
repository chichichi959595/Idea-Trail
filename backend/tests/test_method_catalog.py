"""The catalog is the single source of truth the frontend reads over
`GET /methods`, so every method must actually fill it in."""

import pytest

from app.agents.framework import (
    DISCOVERY_AGENTS,
    FRAMEWORK_AGENTS,
    METHOD_ORDER,
    get_framework_agent,
    method_catalog,
)


@pytest.mark.parametrize("entry", method_catalog(), ids=lambda e: e["name"])
def test_every_method_is_fully_described(entry):
    assert entry["label"]
    assert entry["short_label"]
    assert entry["description"]
    assert entry["tutorial"]["intro"]
    assert entry["tutorial"]["how_to"]
    assert entry["step_count"] > 0


def test_catalog_covers_exactly_the_implemented_agents():
    ideation = [e["name"] for e in method_catalog() if e["stage"] == "ideation"]
    assert ideation == METHOD_ORDER
    assert set(METHOD_ORDER) == set(FRAMEWORK_AGENTS)


def test_discovery_is_in_the_catalog_but_never_a_method():
    discovery = [e["name"] for e in method_catalog() if e["stage"] == "discovery"]
    assert discovery == list(DISCOVERY_AGENTS) == ["pain_discovery"]
    assert "pain_discovery" not in METHOD_ORDER
    assert get_framework_agent("pain_discovery").stage == "discovery"


def test_short_label_defaults_to_the_full_label():
    # Only the three long names override it; the rest fall through.
    overridden = {e["name"] for e in method_catalog() if e["short_label"] != e["label"]}
    assert overridden == {"how_might_we", "mashup", "random_input"}


def test_unknown_method_raises_value_error():
    with pytest.raises(ValueError, match="no implemented FrameworkAgent"):
        get_framework_agent("no_such_method")


@pytest.mark.parametrize("name", METHOD_ORDER)
def test_every_step_has_a_question(name):
    agent = get_framework_agent(name)
    for index, step in enumerate(agent.steps):
        assert step.name
        assert agent.question_for(index), f"{name} step {index} has no question"


def test_crazy_8s_solution_steps_are_time_boxed():
    # The 30s pacing lives with the method, not in the frontend.
    steps = get_framework_agent("crazy_8s").steps
    timed = [s for s in steps if s.timer_seconds is not None]
    assert len(timed) == 6
    assert all(s.timer_seconds == 30 for s in timed)
    assert steps[0].timer_seconds is None


def test_crazy_8s_only_analyzes_the_problem_step():
    # A model call between timed rounds breaks the pace; solutions are judged
    # together at finalize instead.
    steps = get_framework_agent("crazy_8s").steps
    assert steps[0].analyze is True
    assert not any(s.analyze for s in steps[1:])


def test_user_journey_walks_eight_steps_into_three_concepts():
    agent = get_framework_agent("user_journey")
    assert [s.name for s in agent.steps] == [
        "context",
        "steps",
        "actions",
        "friction",
        "impact",
        "one_change",
        "improvements",
        "tool_wish",
    ]
    spec = agent.finalize_spec([])
    assert (spec.min_items, spec.max_items) == (3, 3)
