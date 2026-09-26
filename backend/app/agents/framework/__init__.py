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

FRAMEWORK_AGENTS: dict[str, FrameworkAgent] = {
    "scamper": ScamperAgent(),
    "pain_point": PainPointAgent(),
    "reverse_thinking": ReverseThinkingAgent(),
    "user_journey": UserJourneyAgent(),
    "analogy": AnalogyAgent(),
    "capability_mapping": CapabilityMappingAgent(),
    "how_might_we": HowMightWeAgent(),
    "mashup": MashupAgent(),
    "random_input": RandomInputAgent(),
    "crazy_8s": Crazy8sAgent(),
}


def get_framework_agent(method_name: str) -> FrameworkAgent:
    try:
        return FRAMEWORK_AGENTS[method_name]
    except KeyError as exc:
        raise ValueError(
            f"method '{method_name}' has no implemented FrameworkAgent yet "
            f"(available: {list(FRAMEWORK_AGENTS)})"
        ) from exc
