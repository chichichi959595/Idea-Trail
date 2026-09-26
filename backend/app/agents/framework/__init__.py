from .base import FrameworkAgent
from .pain_point import PainPointAgent
from .scamper import ScamperAgent

FRAMEWORK_AGENTS: dict[str, FrameworkAgent] = {
    "scamper": ScamperAgent(),
    "pain_point": PainPointAgent(),
}


def get_framework_agent(method_name: str) -> FrameworkAgent:
    try:
        return FRAMEWORK_AGENTS[method_name]
    except KeyError as exc:
        raise ValueError(
            f"method '{method_name}' has no implemented FrameworkAgent yet "
            f"(available: {list(FRAMEWORK_AGENTS)})"
        ) from exc
