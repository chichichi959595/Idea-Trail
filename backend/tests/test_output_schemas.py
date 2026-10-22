"""The convergence schemas must forbid an empty result.

`{"ideas": []}` used to satisfy them, which let a model return nothing while
still looking like a successful call — and the run was then marked "done"
with an empty idea board and no way to retry.
"""

import pytest

from app.agents.framework import METHOD_ORDER, get_framework_agent
from app.agents.framework.base import FINALIZE_OUTPUT_SCHEMA, STEP_OUTPUT_SCHEMA
from app.agents.synthesizer import SYNTH_OUTPUT_SCHEMA


@pytest.mark.parametrize(
    "schema, floor",
    [(FINALIZE_OUTPUT_SCHEMA, 2), (SYNTH_OUTPUT_SCHEMA, 1)],
    ids=["finalize", "synthesize"],
)
def test_ideas_array_has_a_floor(schema, floor):
    ideas = schema["properties"]["ideas"]
    assert ideas["minItems"] == floor
    assert ideas["maxItems"] >= floor


@pytest.mark.parametrize(
    "schema",
    [FINALIZE_OUTPUT_SCHEMA, SYNTH_OUTPUT_SCHEMA, STEP_OUTPUT_SCHEMA],
    ids=["finalize", "synthesize", "step"],
)
def test_schemas_are_strict(schema):
    # A loose schema lets a provider return extra keys we then ignore silently.
    assert schema["additionalProperties"] is False
    assert set(schema["required"]) == set(schema["properties"])


@pytest.mark.parametrize("name", METHOD_ORDER)
def test_finalize_prompt_survives_a_run_with_no_answers(name):
    """A fully timed-out run still has to produce a usable prompt rather than
    blowing up on a None answer."""

    class FakeStep:
        def __init__(self, index):
            self.step_index = index
            self.step_name = f"step_{index}"
            self.question_shown = "問題"
            self.user_answer = None
            self.agent_output_json = None

    class FakeSession:
        team_size = None
        time_budget = None
        tech_background = None
        domain_pref = None
        constraints_text = None

    agent = get_framework_agent(name)
    steps = [FakeStep(i) for i in range(len(agent.steps))]
    system_prompt, user_prompt, schema = agent.build_finalize_prompt(FakeSession(), steps)
    assert system_prompt and user_prompt
    # No placeholder survived into the prompt actually sent.
    assert "{" not in system_prompt
    # Built per method now rather than shared, so this checks the shape instead
    # of the object — including the floor, which a run with nothing answered
    # must still have (Crazy 8s counts answers, and zero would let an empty
    # result pass as success).
    ideas = schema["properties"]["ideas"]
    assert ideas["minItems"] >= 1
    assert ideas["maxItems"] >= ideas["minItems"]


@pytest.mark.parametrize("name", METHOD_ORDER)
def test_every_method_states_its_candidate_count_in_the_prompt(name):
    """The count has to be in the prose, not only in the schema.

    `_sanitize_schema` strips `minItems`/`maxItems` before the Anthropic
    request because structured outputs reject array-length keywords — so on
    that route the prompt text is the only thing carrying the count.
    """
    agent = get_framework_agent(name)
    spec = agent.finalize_spec([])
    assert str(spec.min_items) in spec.material or f"{spec.min_items}~{spec.max_items}" in spec.material


def test_pain_point_yields_three_takes_on_one_problem():
    assert get_framework_agent("pain_point").finalize_spec([]).min_items == 3


def test_crazy_8s_yields_at_most_one_candidate_per_written_solution():
    """Unwritten steps don't count, and finalize may skip a non-answer (it is
    the only relevance check those steps get) — but never invents extras."""

    class Step:
        def __init__(self, name, answer):
            self.step_name = name
            self.user_answer = answer

    agent = get_framework_agent("crazy_8s")
    steps = [Step("problem", "忘記繳作業")] + [
        Step(f"solution_{i + 1}", "解法" if i < 4 else None) for i in range(6)
    ]
    spec = agent.finalize_spec(steps)
    assert (spec.min_items, spec.max_items) == (1, 4)
    assert "1~4 個" in spec.material
