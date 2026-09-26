from __future__ import annotations

from dataclasses import dataclass

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

METHOD_DESCRIPTIONS = {
    "pain_point": "從最近讓人覺得麻煩的事情出發，逐步問出誰遇到、多常發生、現在怎麼解決，收斂成具體題目。",
    "user_journey": "把使用情境攤開成完整旅程，找出體驗最差、最值得切入的環節。",
    "scamper": "針對一個現有對象，用七個角度（替代／結合／調整／修改／其他用途／消除／反轉）逐一發想改造方式。",
    "reverse_thinking": "故意想一堆最爛、最沒用的點子，挖出爛在哪裡，再把最有趣的一個調轉成有商機的方向。",
    "analogy": "借用其他領域已經解決類似問題的做法，類比套用到團隊的情境。",
    "capability_mapping": "從團隊已經會的技術出發，反推可以解決哪些問題，並檢查問題本身是否值得做。",
    "how_might_we": "把觀察到的問題改寫成一句「How might we...?」，再針對這句話大量發想解法。",
    "mashup": "分別列出對象、痛點、技術三份清單，再隨機強迫組合出新方向。",
    "random_input": "抽一個完全無關的隨機詞彙，強迫把它跟主題湊在一起，逼出意外的連結。",
    "crazy_8s": "針對一個具體問題，限時衝出 8 個不同解法，先求數量、不准自我審查。",
}

_METHOD_ORDER = list(METHOD_LABELS)

SELECTOR_SYSTEM_PROMPT = """你是 Method Selector Agent。系統已經用規則式邏輯，依團隊填的是非題
（是否已有明確問題、是否有既有產品想改造）排出了一份基準推薦清單。
但規則只看得懂那兩個是非題，看不懂團隊自己寫的文字
（技術背景、領域偏好、限制條件、可用時間，以及他們描述的問題或想改造的對象）。

你的工作是讀完團隊的完整資訊後，判斷這份基準清單合不合理，並做出「有限度的調整」：

1. 你可以調整這幾個方法的**先後順序**。
2. 如果你認為候選清單裡有某個方法明顯不適合這個團隊，你可以把它**換掉一個**，
   從下面的完整方法目錄裡挑一個更適合的替補進來。最多只能換一個。
3. 如果你認為規則排的已經很好，就保持原樣，不要為了改而改。

接著針對最終清單裡的每一個方法，用兩到三句話向這個團隊說明「為什麼這個方法適合他們目前的狀況」，
理由要扣住他們實際填的內容（例如他們寫的限制條件或技術背景），不要只是複述方法的通用介紹。

最後在 adjustment 欄位用一到兩句話說明你做了什麼調整、為什麼；
如果你完全沒有調整，就說明你為什麼認為原本的排序已經適合。

一律使用繁體中文，只回傳符合 JSON schema 的結構化輸出，不要有多餘文字。"""


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
    # capability_mapping used to be scored off an "是否技術導向" yes/no field.
    # That field is gone, and whether a team is tech-driven now only shows up
    # in their free-text 技術背景 — which the rules can't read, so it's left to
    # the model to surface this method when the text calls for it.
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


def _selector_schema() -> dict:
    # The enum spans every implemented method, not just the rule baseline —
    # that's what lets the model swap one out for a better fit.
    choices = [m for m in _METHOD_ORDER if m in IMPLEMENTED_METHODS]
    return {
        "type": "object",
        "properties": {
            "adjustment": {"type": "string"},
            "items": {
                "type": "array",
                "items": {
                    "type": "object",
                    "properties": {
                        "method": {"type": "string", "enum": choices},
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


def apply_adjustment(baseline: list[str], proposed: list[str], max_swaps: int) -> list[str]:
    """Keep the model's ordering but cap how far it may depart from the rules.

    Drops unknown/duplicate methods, allows at most `max_swaps` methods the
    rules didn't pick, and backfills from the baseline if the model returned
    too few usable entries — so a bad response degrades to the rule ranking
    instead of producing a broken recommendation list.
    """
    target = len(baseline)
    baseline_set = set(baseline)
    final: list[str] = []
    swaps = 0

    for method in proposed:
        if len(final) >= target:
            break
        if method in final or method not in IMPLEMENTED_METHODS:
            continue
        if method not in baseline_set:
            if swaps >= max_swaps:
                continue
            swaps += 1
        final.append(method)

    for method in baseline:
        if len(final) >= target:
            break
        if method not in final:
            final.append(method)

    return final


@dataclass
class Recommendation:
    methods: list[str]
    """Final ranking actually shown to the team."""
    rationale_by_method: dict[str, str]
    rule_ranking: list[str]
    """What the rules alone proposed, before the model adjusted it."""
    adjustment_note: str
    user_prompt: str
    result: LLMResult


def _render_catalog(exclude: list[str]) -> str:
    lines = [
        f"- {m}（{METHOD_LABELS[m]}）：{METHOD_DESCRIPTIONS[m]}"
        for m in _METHOD_ORDER
        if m in IMPLEMENTED_METHODS and m not in exclude
    ]
    return "\n".join(lines)


async def recommend(
    session: IdeationSession,
    provider_name: str = "claude",
    model: str | None = None,
) -> Recommendation:
    scores = score_methods(session)
    baseline = rank_methods(session)
    # With every score at zero the rules have no real opinion (they only read
    # the yes/no fields), so let the model choose freely instead of anchoring
    # it to an arbitrary default pair.
    rules_had_signal = any(v > 0 for v in scores.values())
    max_swaps = 1 if rules_had_signal else len(baseline)

    baseline_block = "\n".join(
        f"{rank}. {m}（{METHOD_LABELS[m]}）— 規則分數 {scores[m]}：{METHOD_DESCRIPTIONS[m]}"
        for rank, m in enumerate(baseline, start=1)
    )
    if not rules_had_signal:
        baseline_block += (
            "\n\n（注意：團隊把是非題都留在「不確定」，規則沒有任何依據，"
            "上面只是預設值。請主要根據團隊自己寫的文字判斷，必要時整份換掉。）"
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
        f"# 規則排出的基準清單（共 {len(baseline)} 個）\n{baseline_block}\n\n"
        f"# 其他可以替補的方法\n{_render_catalog(baseline)}\n\n"
        f"請輸出最終的 {len(baseline)} 個方法（依推薦順序），"
        f"每個附上推薦理由，並在 adjustment 說明你做了什麼調整。"
        f"最多只能替換 {max_swaps} 個方法。"
    )

    provider = get_provider(provider_name)
    result = await complete_with_quality_guard(
        provider,
        system_prompt=SELECTOR_SYSTEM_PROMPT,
        user_prompt=user_prompt,
        json_schema=_selector_schema(),
        model=model,
    )

    structured = result.structured or {}
    items = structured.get("items") or []
    proposed = [item["method"] for item in items if isinstance(item, dict) and "method" in item]
    methods = apply_adjustment(baseline, proposed, max_swaps)
    rationale_by_method = {
        item["method"]: item.get("rationale", "")
        for item in items
        if isinstance(item, dict) and "method" in item
    }

    return Recommendation(
        methods=methods,
        rationale_by_method=rationale_by_method,
        rule_ranking=baseline,
        adjustment_note=structured.get("adjustment", ""),
        user_prompt=user_prompt,
        result=result,
    )
