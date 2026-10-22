"""Pain Check Agent — a light read of the pain point typed on the setup screen.

A team that answers "yes, we already have a problem" skips 痛點發想 and goes
straight to 專案發想 with whatever they wrote. That is only a good trade when
what they wrote is a problem. This agent is the one look taken before the
skip, and it sorts the answer three ways:

* `clear` — it is a pain point; go on to 專案發想.
* `vague` — there is a real direction, but the team doesn't yet know the pain
  well (a topic, a solution, a "someone somewhere is inconvenienced"). The
  team is offered 痛點發想 first, and may still skip it.
* `not_pain_point` — keyboard mash, a joke, nothing that names a problem at
  all. The only verdict that stops the team: they are asked to rewrite it.

It is meant to be lenient. A wrong `not_pain_point` blocks a team that had a
perfectly usable problem; a wrong `clear` costs them nothing they couldn't
recover from on the next screen. So every doubt resolves toward letting them
through.
"""

from __future__ import annotations

VERDICTS = ("clear", "vague", "not_pain_point")

PAIN_CHECK_SYSTEM_PROMPT = """你是 Pain Check Agent。一個學生團隊在開始專案發想之前，
說他們「已經有明確想解決的痛點」，並寫下了那個痛點。你的工作是很快地看一眼，
判斷它屬於哪一種：

- clear：看得出是一個痛點。大致讀得出「誰」在「什麼情況」下遇到「什麼麻煩」就算，
  不需要三樣都寫齊，也不需要寫得漂亮。
- vague：有一個真實的方向，但團隊對痛點本身還不夠了解。例如只寫了主題
  （「環保」「學生壓力」）、只寫了想做的解法（「想做一個二手書平台」），
  或者麻煩是什麼、發生在誰身上都還看不出來。
- not_pain_point：完全看不出任何問題或主題。例如亂打的字、測試用字串、
  跟做專案無關的閒聊、只有一兩個字而且看不出意思。

判斷要寬鬆：
- 在 clear 和 vague 之間猶豫時，選 clear。
- 在 vague 和 not_pain_point 之間猶豫時，選 vague。
- 錯字、口語、寫得很短都不是扣分理由。

feedback 欄位直接對團隊說話，一到兩句：
- clear：用一句話複述你讀到的痛點（誰、什麼情況、什麼麻煩），讓他們確認你讀對了。
- vague：說出目前缺的是哪一塊（例如還看不出是誰遇到、或寫的是解法不是麻煩），
  語氣是建議，不是退件。
- not_pain_point：溫和地請他們改寫，並舉一個寫法的方向。

一律使用繁體中文，只回傳符合 JSON schema 的結構化輸出。"""

PAIN_CHECK_SCHEMA = {
    "type": "object",
    "properties": {
        "verdict": {"type": "string", "enum": list(VERDICTS)},
        "feedback": {"type": "string"},
    },
    "required": ["verdict", "feedback"],
    "additionalProperties": False,
}

STATEMENT_LIMIT = 600
"""Characters of the statement sent along. Generous for a pain point; the cap
only exists so a pasted essay doesn't become an expensive call."""


def build_pain_check_prompt(statement: str) -> tuple[str, str, dict]:
    user_prompt = f"# 團隊寫的痛點\n{statement.strip()[:STATEMENT_LIMIT]}"
    return PAIN_CHECK_SYSTEM_PROMPT, user_prompt, PAIN_CHECK_SCHEMA


def interpret_pain_check(structured: dict | None) -> dict:
    """The model's verdict, or `clear` when the answer is unusable.

    Falling back to `clear` rather than failing is the same leniency as the
    prompt: a check that couldn't be read must not be what stops the team.
    """
    data = structured if isinstance(structured, dict) else {}
    verdict = data.get("verdict")
    feedback = data.get("feedback")
    if verdict not in VERDICTS:
        return {"verdict": "clear", "feedback": ""}
    return {
        "verdict": verdict,
        "feedback": feedback.strip() if isinstance(feedback, str) else "",
    }
