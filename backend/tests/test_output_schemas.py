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
    assert schema is FINALIZE_OUTPUT_SCHEMA
