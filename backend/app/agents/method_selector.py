from __future__ import annotations

from dataclasses import dataclass

from app.agents.framework import (
    METHOD_ORDER,
    method_descriptions,
    method_labels,
)
from app.db.models import IdeationSession
from app.providers.base import LLMResult
from app.providers.quality import complete_with_quality_guard
from app.providers.registry import get_provider

RECOMMENDATION_COUNT = 3
"""How many methods the team is always shown.

Fixed on purpose. This used to be `len(baseline)`, i.e. however many methods
the rules happened to score above zero — which silently collapsed to a single
recommendation for teams that answered "有明確問題 + 沒有既有產品".
"""

SELECTOR_SYSTEM_PROMPT = """你是 Method Selector Agent，負責從完整的方法目錄裡，
為這個團隊挑出最適合的 {count} 個發想方法並排出順序。

系統另外附了一份規則式的「參考排序」。那份排序只看得懂兩個是非題
（是否已有明確問題、是否有既有產品想改造），看不懂團隊自己寫的文字
（技術背景、領域偏好、限制條件、可用時間，以及他們描述的問題或想改造的對象）。
**它只是參考，不是限制**——你可以完全照用、可以調順序、也可以整份換掉。
請以團隊實際寫的內容為主要判斷依據。

接著針對你選的每一個方法，用兩到三句話向這個團隊說明「為什麼這個方法適合他們目前的狀況」，
理由要扣住他們實際填的內容（例如他們寫的限制條件或技術背景），不要只是複述方法的通用介紹。

最後在 adjustment 欄位用一到兩句話說明你的選擇跟參考排序差在哪、為什麼；
如果你完全照用參考排序，就說明你為什麼認為它已經適合。

一律使用繁體中文，只回傳符合 JSON schema 的結構化輸出，不要有多餘文字。"""


def score_methods(session: IdeationSession) -> dict[str, int]:
    """Rule-of-thumb scores from the two yes/no fields.

    Only ever a hint now — `recommend()` passes the resulting order to the
    model as a suggestion and lets it decide, and falls back to this order
    only when the model's answer is unusable.
    """
    scores = {m: 0 for m in METHOD_ORDER}
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
    # capability_mapping used to be scored off an "是否技術導向" yes/no field.
    # That field is gone, and whether a team is tech-driven now only shows up
    # in their free-text 技術背景 — which the rules can't read, so it's left to
    # the model to surface this method when the text calls for it.
    if session.has_clear_problem:
        # 已經有方向時，隨機刺激比較能發揮強迫聯想的效果
        scores["random_input"] += 1
    return scores


def rank_methods(session: IdeationSession, top_n: int = RECOMMENDATION_COUNT) -> list[str]:
    """The rules' suggested ordering — always exactly `top_n` methods.

    Methods the rules have no opinion about (score 0) still fill the tail in
    catalog order, so the caller always has a complete fallback list.
    """
    scores = score_methods(session)
    ranked = sorted(scores.items(), key=lambda kv: (-kv[1], METHOD_ORDER.index(kv[0])))
    return [method for method, _ in ranked][:top_n]


def _selector_schema() -> dict:
    return {
        "type": "object",
        "properties": {
            "adjustment": {"type": "string"},
            "items": {
                "type": "array",
                "minItems": RECOMMENDATION_COUNT,
                "maxItems": RECOMMENDATION_COUNT,
                "items": {
                    "type": "object",
                    "properties": {
                        "method": {"type": "string", "enum": METHOD_ORDER},
                        "rationale": {"type": "string"},
                    },
                    "required": ["method", "rationale"],
                    "additionalProperties": False,
                },
            },
        },
        "required": ["adjustment", "items"],
        "additionalProperties": False,
    }


def finalize_selection(
    proposed: list[str], fallback: list[str], count: int = RECOMMENDATION_COUNT
) -> list[str]:
    """The model's picks, cleaned up and guaranteed to be exactly `count` long.

    The model chooses freely — this only drops unknown/duplicate methods and
    tops the list back up (first from the rules' ordering, then from the rest
    of the catalog) so a truncated or garbled response still yields a complete
    recommendation list instead of a short one.
    """
    final: list[str] = []
    for method in (*proposed, *fallback, *METHOD_ORDER):
        if len(final) >= count:
            break
        if method in final or method not in METHOD_ORDER:
            continue
        final.append(method)
    return final


@dataclass
class Recommendation:
    methods: list[str]
    """Final ranking actually shown to the team."""
    rationale_by_method: dict[str, str]
    rule_ranking: list[str]
    """What the rules alone suggested, before the model decided."""
    adjustment_note: str
    system_prompt: str
    """The prompt as actually sent (placeholders filled in), so the audit log
    records what the model really saw rather than the raw template."""
    user_prompt: str
    result: LLMResult


def _render_catalog() -> str:
    labels, descriptions = method_labels(), method_descriptions()
    return "\n".join(f"- {m}（{labels[m]}）：{descriptions[m]}" for m in METHOD_ORDER)


async def recommend(
    session: IdeationSession,
    provider_name: str = "claude",
    model: str | None = None,
) -> Recommendation:
    scores = score_methods(session)
    suggestion = rank_methods(session)
    labels, descriptions = method_labels(), method_descriptions()

    suggestion_block = "\n".join(
        f"{rank}. {m}（{labels[m]}）— 規則分數 {scores[m]}"
        for rank, m in enumerate(suggestion, start=1)
    )
    if not any(v > 0 for v in scores.values()):
        suggestion_block += (
            "\n\n（注意：團隊把是非題都留在「不確定」，規則完全沒有依據，"
            "上面只是目錄順序。請純粹根據團隊自己寫的文字判斷。）"
        )

    user_prompt = (
        "# 團隊基本資訊\n"
        f"團隊人數: {session.team_size}\n"
        f"可用時間: {session.time_budget}\n"
        f"技術背景: {session.tech_background}\n"
        f"領域偏好: {session.domain_pref}\n"
        f"限制條件: {session.constraints_text}\n"
        f"是否已有明確問題: {session.has_clear_problem}\n"
        f"他們說的問題是: {session.clear_problem_text or '(未填)'}\n"
        f"是否已有既有產品/題目想改造: {session.has_existing_product}\n"
        f"想改造的對象是: {session.existing_product_text or '(未填)'}\n\n"
        f"# 完整方法目錄（共 {len(METHOD_ORDER)} 個，你可以自由從中挑選）\n{_render_catalog()}\n\n"
        f"# 規則排出的參考排序（僅供參考，可自由推翻）\n{suggestion_block}\n\n"
        f"請從上面的目錄挑出最適合的 {RECOMMENDATION_COUNT} 個方法（依推薦順序），"
        f"每個附上針對這個團隊的推薦理由，並在 adjustment 說明你的選擇與參考排序的差異。"
    )

    system_prompt = SELECTOR_SYSTEM_PROMPT.format(count=RECOMMENDATION_COUNT)
    provider = get_provider(provider_name)
    result = await complete_with_quality_guard(
        provider,
        system_prompt=system_prompt,
        user_prompt=user_prompt,
        json_schema=_selector_schema(),
        model=model,
    )

    structured = result.structured or {}
    items = [i for i in (structured.get("items") or []) if isinstance(i, dict) and "method" in i]
    methods = finalize_selection([i["method"] for i in items], suggestion)

    return Recommendation(
        methods=methods,
        rationale_by_method={i["method"]: i.get("rationale", "") for i in items},
        rule_ranking=suggestion,
        adjustment_note=structured.get("adjustment", ""),
        system_prompt=system_prompt,
        user_prompt=user_prompt,
        result=result,
    )
