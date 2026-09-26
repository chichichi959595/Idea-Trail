from .analogy import AnalogyAgent
from .base import FrameworkAgent
from .capability_mapping import CapabilityMappingAgent
from .crazy_8s import Crazy8sAgent
from .how_might_we import HowMightWeAgent
from .mashup import MashupAgent
from .pain_point import PainPointAgent
from .random_input import RandomInputAgent
from .reverse_thinking import ReverseThinkingAgent
from .scamper import ScamperAgent
from .user_journey import UserJourneyAgent

# Declaration order is the catalog order everything else inherits: the method
# picker lists them in this order, and the selector uses it as the tie-break
# when two methods score the same.
FRAMEWORK_AGENTS: dict[str, FrameworkAgent] = {
    agent.method_name: agent
    for agent in (
        PainPointAgent(),
        UserJourneyAgent(),
        ScamperAgent(),
        ReverseThinkingAgent(),
        AnalogyAgent(),
        CapabilityMappingAgent(),
        HowMightWeAgent(),
        MashupAgent(),
        RandomInputAgent(),
        Crazy8sAgent(),
    )
}

METHOD_ORDER: list[str] = list(FRAMEWORK_AGENTS)


def get_framework_agent(method_name: str) -> FrameworkAgent:
    try:
        return FRAMEWORK_AGENTS[method_name]
    except KeyError as exc:
        raise ValueError(
            f"method '{method_name}' has no implemented FrameworkAgent yet "
            f"(available: {METHOD_ORDER})"
        ) from exc


def method_catalog() -> list[dict]:
    """Every method's public metadata, in catalog order.

    The one place labels and descriptions come from — both the selector's
    prompt and the frontend read this, so a method can't end up described
    one way to the model and another way on screen.
    """
    return [type(agent).catalog_entry() for agent in FRAMEWORK_AGENTS.values()]


def method_labels() -> dict[str, str]:
    return {name: agent.method_label for name, agent in FRAMEWORK_AGENTS.items()}


def method_descriptions() -> dict[str, str]:
    return {name: agent.description for name, agent in FRAMEWORK_AGENTS.items()}
