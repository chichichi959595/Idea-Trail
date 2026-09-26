from __future__ import annotations

from app.db.models import IdeationSession
from app.providers.base import LLMResult
from app.providers.quality import complete_with_quality_guard
from app.providers.registry import get_provider

METHOD_LABELS = {
    "pain_point": "痛點導向",
    "user_journey": "使用者旅程",
    "scamper": "SCAMPER",
    "reverse_thinking": "逆向思考",
    "analogy": "類比法",
    "capability_mapping": "能力對應問題",
    "how_might_we": "HMW（How Might We）",
    "mashup": "混搭法（Mash-up）",
    "random_input": "隨機刺激（Random Input）",
    "crazy_8s": "Crazy 8s",
}

IMPLEMENTED_METHODS = {
    "scamper",
    "pain_point",
    "reverse_thinking",
    "user_journey",
    "analogy",
    "capability_mapping",
    "how_might_we",
    "mashup",
    "random_input",
    "crazy_8s",
}

_METHOD_ORDER = list(METHOD_LABELS)

RATIONALE_SYSTEM_PROMPT = """你是 Method Selector Agent。系統已經用規則式邏輯，根據團隊的基本資訊，
排出了最適合的發想方法清單。你的工作不是重新選擇方法，而是針對已經排好的每一個方法，
用兩到三句話向這個團隊說明「為什麼這個方法適合他們目前的狀況」。
一律使用繁體中文，語氣像是在跟團隊解釋建議理由，不要條列規則本身，只回傳符合 JSON schema 的結構化輸出。"""


def score_methods(session: IdeationSession) -> dict[str, int]:
    scores = {m: 0 for m in METHOD_LABELS}
    if session.has_clear_problem is False:
        scores["pain_point"] += 2
        scores["user_journey"] += 2
        # 沒有明確方向時，這幾種發散技法也適合拿來先打開選項
        scores["how_might_we"] += 1
        scores["mashup"] += 1
        scores["crazy_8s"] += 1
    if session.has_existing_product:
        scores["scamper"] += 2
        scores["reverse_thinking"] += 1
        scores["analogy"] += 1
    if session.is_tech_driven and session.has_clear_problem is False:
        scores["capability_mapping"] += 2
    if session.has_clear_problem:
        # 已經有方向時，隨機刺激比較能發揮強迫聯想的效果
        scores["random_input"] += 1
    return scores


def rank_methods(session: IdeationSession, top_n: int = 3) -> list[str]:
    scores = score_methods(session)
    ranked = sorted(scores.items(), key=lambda kv: (-kv[1], _METHOD_ORDER.index(kv[0])))
    top = [method for method, s in ranked if s > 0][:top_n]
    if not top:
        top = ["pain_point", "scamper"]
    return top


def _rationale_schema(methods: list[str]) -> dict:
    return {
        "type": "object",
        "properties": {
            "items": {
                "type": "array",
                "items": {
                    "type": "object",
                    "properties": {
                        "method": {"type": "string", "enum": methods},
                        "rationale": {"type": "string"},
                    },
                    "required": ["method", "rationale"],
                    "additionalProperties": False,
                },
            }
        },
        "required": ["items"],
        "additionalProperties": False,
    }


async def recommend(session: IdeationSession, provider_name: str = "claude") -> tuple[list[str], dict[str, str], LLMResult]:
    """Returns (ranked method names, {method: rationale}, raw LLMResult for auditing)."""
    methods = rank_methods(session)
    labels = ", ".join(f"{m}（{METHOD_LABELS[m]}）" for m in methods)
    user_prompt = (
        "# 團隊基本資訊\n"
        f"團隊人數: {session.team_size}\n"
        f"可用時間: {session.time_budget}\n"
        f"技術背景: {session.tech_background}\n"
        f"領域偏好: {session.domain_pref}\n"
        f"限制條件: {session.constraints_text}\n"
        f"是否已有明確問題: {session.has_clear_problem}\n"
        f"是否已有既有產品/題目想改造: {session.has_existing_product}\n"
        f"是否技術導向但不確定應用場景: {session.is_tech_driven}\n\n"
        f"# 已排序的推薦方法\n{labels}\n\n"
        "請針對上面每一個方法，各給一段推薦理由。"
    )
    provider = get_provider(provider_name)
    result = await complete_with_quality_guard(
        provider,
        system_prompt=RATIONALE_SYSTEM_PROMPT,
        user_prompt=user_prompt,
        json_schema=_rationale_schema(methods),
    )
    rationale_by_method = {
        item["method"]: item["rationale"] for item in (result.structured or {}).get("items", [])
    }
    return methods, rationale_by_method, result
