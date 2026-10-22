from __future__ import annotations

from dataclasses import dataclass
from typing import Optional

from app.db.models import IdeationSession, MethodStep, PainPoint


@dataclass
class StepSpec:
    name: str
    question: str
    timer_seconds: Optional[int] = None
    """Countdown for this step, if the method is time-boxed. Lives here rather
    than in the frontend so the pacing is part of the method's definition."""
    analyze: bool = True
    """Whether answering this step calls the model (relevance gate, analysis,
    fragments). False just records the answer and moves on — for steps whose
    whole point is pace, where a blocking call between them breaks the method.
    Such answers are judged once, at finalize."""


STEP_SYSTEM_PROMPT_TEMPLATE = """你是「{method_label}」發想引導流程裡的其中一個步驟 Agent。
你會看到使用者目前為止的回答歷程，以及這一步的新回答。

先判斷這個新回答是不是認真在回答這一步的問題：
- 如果答非所問、內容空洞（例如亂打字、單一個字、明顯在測試、離題閒聊、拒絕回答），
  把 is_relevant 設為 false，並在 clarification 欄位用一兩句話友善地指出問題在哪、
  請他重新針對這個問題具體回答；這種情況 analysis 留空字串、idea_fragments 留空陣列。
- 如果是認真、切題的回答（即使簡短也算），把 is_relevant 設為 true，clarification 留空字串，
  並且：
  1. 用一兩句話分析這個回答揭露出的洞察或機會
  2. 產生 1~3 個簡短的候選專案想法片段（不需要完整，只是這一步觸發的靈感）

一律使用繁體中文回答。只回傳符合 JSON schema 的結構化輸出，不要有多餘文字或客套話。"""

# Appended to the step system prompt when the user force-submits an answer the
# agent already rejected once. The relevance gate is an escape hatch away at
# that point, so stop judging and just mine whatever was written for insight.
FORCE_ACCEPT_INSTRUCTION = """補充指示（本次強制送出）：
使用者已經確認要用這個回答繼續，不需要你再做切題性審核。
請一律把 is_relevant 設為 true、clarification 留空字串，
即使回答很簡短、很跳、或看起來離題，也要盡力從裡面挖出可用的洞察，
照樣產生 analysis 與 1~3 個 idea_fragments。"""

STEP_OUTPUT_SCHEMA = {
    "type": "object",
    "properties": {
        "is_relevant": {"type": "boolean"},
        "clarification": {"type": "string"},
        "analysis": {"type": "string"},
        "idea_fragments": {"type": "array", "items": {"type": "string"}},
    },
    "required": ["is_relevant", "clarification", "analysis", "idea_fragments"],
    "additionalProperties": False,
}

FINALIZE_SYSTEM_PROMPT_TEMPLATE = """你是「{method_label}」發想引導流程的彙整步驟 Agent。
使用者已經走完所有步驟，你會看到完整的問答歷程與每一步產生的候選想法片段。

{material}

每個 Concept 要有：
- title（10~20字）：直接描述核心功能本身，不要取產品名、品牌名、或可愛擬人化綽號
  （例如不要出現「OO 助手」「OO 機器人」「Star OO」這類命名），
  而是像「多人協作文件格式自動統一工具」這樣直接講清楚它做什麼。
- description（2~3 句，精簡）：講清楚解決什麼問題、給誰用、為什麼可行即可，
  去掉「這個工具能夠」「可以讓使用者」「非常適合」之類的贅字和客套話，直接切入重點。

這一步只負責整理，不負責評價：不要排序、不要挑出「比較好的」、
也不要因為覺得某個想法弱就把它丟掉。候選提案的評分與篩選是想法牆之後獨立的階段要做的事，
由使用者和另一個 agent 一起進行。

一律使用繁體中文回答。只回傳符合 JSON schema 的結構化輸出，不要有多餘文字。"""

DEFAULT_FINALIZE_MATERIAL = (
    "你的工作是去重、合併相近的片段，彙整成 2~4 個具體、彼此有區隔的 Project Concept。"
)
"""What the finalize call is told to do when a method hasn't defined its own.

The eight methods that haven't been tuned yet all use this, so it is worded
exactly as the single shared instruction used to be — adopting `finalize_spec`
changed nothing for them.
"""


@dataclass
class FinalizeSpec:
    """How one method's finished run becomes candidates.

    `material` says what this run's transcript actually is and what shape the
    candidates should take — the part that genuinely differs per method. The
    quality rules (naming, brevity, no ranking) stay in the shared template so
    a fix to them lands once rather than ten times.

    The count is stated twice on purpose: `min_items`/`max_items` go into the
    JSON schema, and `material` states it in prose. The Anthropic route strips
    array-length keywords from the schema (see `_sanitize_schema`), so there
    the prose is the only thing carrying the count.
    """

    material: str
    min_items: int
    max_items: int


def finalize_output_schema(min_items: int, max_items: int) -> dict:
    """The finalize schema for a given candidate count.

    Built per method rather than shared, because the natural yield differs:
    Crazy 8s should hand back one candidate per solution the user wrote, while
    a method that deep-dives a single problem should hand back a fixed few.
    """
    return {
        "type": "object",
        "properties": {
            "ideas": {
                "type": "array",
                # Without a floor, `{"ideas": []}` satisfies the schema — the model
                # can return nothing at all and still look like a successful call.
                "minItems": min_items,
                "maxItems": max_items,
                "items": {
                    "type": "object",
                    "properties": {
                        "title": {"type": "string"},
                        "description": {"type": "string"},
                    },
                    "required": ["title", "description"],
                    "additionalProperties": False,
                },
            }
        },
        "required": ["ideas"],
        "additionalProperties": False,
    }


FINALIZE_OUTPUT_SCHEMA = finalize_output_schema(2, 4)
"""The shape a method gets when it hasn't overridden `finalize_spec`."""


def render_session_context(session: IdeationSession) -> str:
    parts = [
        f"團隊人數: {session.team_size}" if session.team_size is not None else None,
        f"可用時間: {session.time_budget}" if session.time_budget else None,
        f"技術背景: {session.tech_background}" if session.tech_background else None,
        f"領域偏好: {session.domain_pref}" if session.domain_pref else None,
        f"限制條件: {session.constraints_text}" if session.constraints_text else None,
    ]
    return "\n".join(p for p in parts if p) or "(未提供)"


def render_pain_point(pain_point: PainPoint | None) -> str:
    """The problem this run sets out to solve, as a prompt section — or nothing,
    for a run the team started without one."""
    if pain_point is None:
        return ""
    parts = [
        f"痛點: {pain_point.statement}",
        f"誰會遇到: {pain_point.who}" if pain_point.who else None,
        f"發生情境: {pain_point.context}" if pain_point.context else None,
        f"現在怎麼應付: {pain_point.current_workaround}"
        if pain_point.current_workaround
        else None,
    ]
    body = "\n".join(p for p in parts if p)
    return f"# 這一輪要解決的痛點\n{body}\n所有想法都要扣回這個痛點。\n\n"


def render_history(steps: list[MethodStep]) -> str:
    lines = []
    for s in steps:
        lines.append(f"[{s.step_name}] 問題: {s.question_shown}")
        if s.user_answer:
            lines.append(f"回答: {s.user_answer}")
        if s.agent_output_json:
            fragments = s.agent_output_json.get("idea_fragments") or []
            if fragments:
                lines.append("這一步產生的想法片段: " + " / ".join(fragments))
    return "\n".join(lines) or "(尚無)"


class FrameworkAgent:
    """One ideation method: what it is called, how it is described, and the
    ordered questions it walks the user through.

    This class is the single source of truth for a method's identity. The
    rule/LLM method selector reads its label and description to build its
    prompt, and the frontend reads the same values over `GET /methods` — so
    a method is never described one way in a prompt and another way on screen.
    """

    method_name: str
    method_label: str
    """Full name, used in prompts and as a screen heading."""
    short_label: str = ""
    """Compact name for tight spots (idea-board tags). Defaults to the full label."""
    description: str = ""
    """One sentence on what the method does — shown in the method picker and
    given to the selector agent so it can reason about the choices."""
    tutorial_intro: str = ""
    """What the method is and why it works."""
    tutorial_how_to: str = ""
    """How to actually play it inside this flow."""
    steps: list[StepSpec]
    mode: str = "solo"
    """"solo" = one person answers `steps` in turn. "relay" = several phones
    write at once (多人接龍); such a run opens a lobby instead of a first step."""
    min_team_size: Optional[int] = None
    """Below this many people the method can't be played at all, so the
    selector never recommends it to a team that says it's smaller."""
    stage: str = "ideation"
    """"ideation" = 專案發想, ends in ideas on the wall. "discovery" = 痛點發想,
    ends in pain points in the library, and is never offered as a method."""

    @classmethod
    def catalog_entry(cls) -> dict:
        return {
            "name": cls.method_name,
            "label": cls.method_label,
            "short_label": cls.short_label or cls.method_label,
            "description": cls.description,
            "tutorial": {"intro": cls.tutorial_intro, "how_to": cls.tutorial_how_to},
            "step_count": len(cls.steps),
            "mode": cls.mode,
            "stage": cls.stage,
        }

    def question_for(self, index: int) -> str:
        return self.steps[index].question

    def build_step_prompt(
        self,
        index: int,
        session: IdeationSession,
        prior_steps: list[MethodStep],
        user_answer: str,
        pain_point: PainPoint | None = None,
    ) -> tuple[str, str, dict]:
        system_prompt = STEP_SYSTEM_PROMPT_TEMPLATE.format(method_label=self.method_label)
        step = self.steps[index]
        user_prompt = (
            f"# 團隊基本資訊\n{render_session_context(session)}\n\n"
            f"{render_pain_point(pain_point)}"
            f"# 目前為止的發想歷程\n{render_history(prior_steps)}\n\n"
            f"# 這一步 [{step.name}]\n問題: {step.question}\n使用者回答: {user_answer}"
        )
        return system_prompt, user_prompt, STEP_OUTPUT_SCHEMA

    def finalize_spec(self, all_steps: list[MethodStep]) -> FinalizeSpec:
        """What this method's material is, and how many candidates it yields.

        The one place a method gets to disagree with the others about its own
        output. Overriding this is preferred over overriding
        `build_finalize_prompt`: the shared quality rules and the audit-log
        shape stay put, and the only thing that varies is the part that
        genuinely varies.

        It takes the finished steps because the count is not always a constant
        — Crazy 8s yields one candidate per solution the user actually wrote.
        """
        return FinalizeSpec(DEFAULT_FINALIZE_MATERIAL, 2, 4)

    def build_finalize_prompt(
        self,
        session: IdeationSession,
        all_steps: list[MethodStep],
        pain_point: PainPoint | None = None,
    ) -> tuple[str, str, dict]:
        spec = self.finalize_spec(all_steps)
        system_prompt = FINALIZE_SYSTEM_PROMPT_TEMPLATE.format(
            method_label=self.method_label, material=spec.material
        )
        user_prompt = (
            f"# 團隊基本資訊\n{render_session_context(session)}\n\n"
            f"{render_pain_point(pain_point)}"
            f"# 完整發想歷程\n{render_history(all_steps)}"
        )
        return system_prompt, user_prompt, finalize_output_schema(spec.min_items, spec.max_items)
