from __future__ import annotations

from app.db.models import Idea, IdeationSession

SYNTH_SYSTEM_PROMPT = """你是 Idea Synthesizer Agent。使用者從不同發想方法裡選出了幾個候選 Project Concept，
你的工作是找出它們之間可以組合、延伸的地方，產生 1~3 個新的、更完整的 Project Concept。

每個新 Concept 要有：
- title：直接描述核心功能本身，不要取產品名、品牌名、或可愛擬人化綽號
  （不要出現「OO 助手」「OO 機器人」「Star OO」這類命名），直接講清楚它做什麼。
- description（2~3 句，精簡）：說明參考了哪些原始想法的元素、為什麼這樣組合有價值即可，
  去掉「這個工具能夠」「可以讓使用者」之類的贅字和客套話，直接切入重點。

一律使用繁體中文回答，只回傳符合 JSON schema 的結構化輸出。"""

SYNTH_OUTPUT_SCHEMA = {
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


def build_synthesis_prompt(session: IdeationSession, ideas: list[Idea]) -> tuple[str, str, dict]:
    lines = [f"- [{idea.source_method or '整合'}] {idea.title}：{idea.description}" for idea in ideas]
    user_prompt = (
        f"# 團隊基本資訊\n"
        f"團隊人數: {session.team_size}\n"
        f"可用時間: {session.time_budget}\n"
        f"技術背景: {session.tech_background}\n"
        f"領域偏好: {session.domain_pref}\n\n"
        "# 使用者選的候選想法\n" + "\n".join(lines)
    )
    return SYNTH_SYSTEM_PROMPT, user_prompt, SYNTH_OUTPUT_SCHEMA
