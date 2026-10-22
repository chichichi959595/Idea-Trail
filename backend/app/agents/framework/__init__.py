from .analogy import AnalogyAgent
from .base import FrameworkAgent
from .capability_mapping import CapabilityMappingAgent
from .crazy_8s import Crazy8sAgent
from .how_might_we import HowMightWeAgent
from .mashup import MashupAgent
from .pain_discovery import PainDiscoveryAgent
from .pain_point import PainPointAgent
from .random_input import RandomInputAgent
from .relay import RelayAgent
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
        RelayAgent(),
    )
}

METHOD_ORDER: list[str] = list(FRAMEWORK_AGENTS)

# 痛點發想's methods. They run on the same step machinery but end in pain
# points for the library rather than ideas for the wall, so they are their own
# catalog: kept out of FRAMEWORK_AGENTS so 專案發想's selector, eligibility
# rules and method picker never offer them, and recommended separately on the
# 痛點發想 screen. Declaration order is this catalog's order, as above.
DISCOVERY_AGENTS: dict[str, FrameworkAgent] = {
    agent.method_name: agent for agent in (PainDiscoveryAgent(),)
}


def get_framework_agent(method_name: str) -> FrameworkAgent:
    agent = FRAMEWORK_AGENTS.get(method_name) or DISCOVERY_AGENTS.get(method_name)
    if agent is None:
        raise ValueError(
            f"method '{method_name}' has no implemented FrameworkAgent yet "
            f"(available: {METHOD_ORDER + list(DISCOVERY_AGENTS)})"
        )
    return agent


def method_catalog() -> list[dict]:
    """Every method's public metadata, in catalog order.

    The one place labels and descriptions come from — both the selector's
    prompt and the frontend read this, so a method can't end up described
    one way to the model and another way on screen.

    Discovery agents come last, marked by their `stage`, so the run screen can
    find their tutorial and step count the same way it does for a method.
    """
    agents = (*FRAMEWORK_AGENTS.values(), *DISCOVERY_AGENTS.values())
    return [type(agent).catalog_entry() for agent in agents]


def eligible_methods(team_size: int | None) -> list[str]:
    """The methods a team of this size can actually play, in catalog order.

    An unanswered team size rules nothing out — there's nothing to judge by,
    and the room can still turn out big enough on the day.
    """
    return [
        name
        for name, agent in FRAMEWORK_AGENTS.items()
        if team_size is None or agent.min_team_size is None or team_size >= agent.min_team_size
    ]


DISCOVERY_ORDER: list[str] = list(DISCOVERY_AGENTS)


def method_labels() -> dict[str, str]:
    return {
        name: agent.method_label
        for name, agent in (*FRAMEWORK_AGENTS.items(), *DISCOVERY_AGENTS.items())
    }


def method_descriptions() -> dict[str, str]:
    return {
        name: agent.description
        for name, agent in (*FRAMEWORK_AGENTS.items(), *DISCOVERY_AGENTS.items())
    }
