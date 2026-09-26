from __future__ import annotations

from dataclasses import dataclass
from typing import Optional

from app.db.models import IdeationSession, MethodStep


@dataclass
class StepSpec:
    name: str
    question: str


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

FINALIZE_SYSTEM_PROMPT_TEMPLATE = """你是「{method_label}」發想引導流程的收斂步驟 Agent。
使用者已經走完所有步驟，你會看到完整的問答歷程與每一步產生的候選想法片段。
你的工作是去重、合併相近的片段，收斂成 2~4 個具體、彼此有區隔的 Project Concept。

每個 Concept 要有：
- title（10~20字）：直接描述核心功能本身，不要取產品名、品牌名、或可愛擬人化綽號
  （例如不要出現「OO 助手」「OO 機器人」「Star OO」這類命名），
  而是像「多人協作文件格式自動統一工具」這樣直接講清楚它做什麼。
- description（2~3 句，精簡）：講清楚解決什麼問題、給誰用、為什麼可行即可，
  去掉「這個工具能夠」「可以讓使用者」「非常適合」之類的贅字和客套話，直接切入重點。

一律使用繁體中文回答。只回傳符合 JSON schema 的結構化輸出，不要有多餘文字。"""

FINALIZE_OUTPUT_SCHEMA = {
    "type": "object",
    "properties": {
        "ideas": {
            "type": "array",
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


def render_session_context(session: IdeationSession) -> str:
    parts = [
        f"團隊人數: {session.team_size}" if session.team_size is not None else None,
        f"可用時間: {session.time_budget}" if session.time_budget else None,
        f"技術背景: {session.tech_background}" if session.tech_background else None,
        f"領域偏好: {session.domain_pref}" if session.domain_pref else None,
        f"限制條件: {session.constraints_text}" if session.constraints_text else None,
    ]
    return "\n".join(p for p in parts if p) or "(未提供)"


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
    method_name: str
    method_label: str
    steps: list[StepSpec]

    def question_for(self, index: int) -> str:
        return self.steps[index].question

    def build_step_prompt(
        self,
        index: int,
        session: IdeationSession,
        prior_steps: list[MethodStep],
        user_answer: str,
    ) -> tuple[str, str, dict]:
        system_prompt = STEP_SYSTEM_PROMPT_TEMPLATE.format(method_label=self.method_label)
        step = self.steps[index]
        user_prompt = (
            f"# 團隊基本資訊\n{render_session_context(session)}\n\n"
            f"# 目前為止的發想歷程\n{render_history(prior_steps)}\n\n"
            f"# 這一步 [{step.name}]\n問題: {step.question}\n使用者回答: {user_answer}"
        )
        return system_prompt, user_prompt, STEP_OUTPUT_SCHEMA

    def build_finalize_prompt(
        self, session: IdeationSession, all_steps: list[MethodStep]
    ) -> tuple[str, str, dict]:
        system_prompt = FINALIZE_SYSTEM_PROMPT_TEMPLATE.format(method_label=self.method_label)
        user_prompt = (
            f"# 團隊基本資訊\n{render_session_context(session)}\n\n"
            f"# 完整發想歷程\n{render_history(all_steps)}"
        )
        return system_prompt, user_prompt, FINALIZE_OUTPUT_SCHEMA
