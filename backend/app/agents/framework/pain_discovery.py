from app.db.models import IdeationSession, MethodStep, PainPoint

from .base import (
    STEP_OUTPUT_SCHEMA,
    FrameworkAgent,
    StepSpec,
    render_history,
    render_session_context,
)

# The relevance gate is softened here on purpose. In 專案發想 an empty answer
# is a sign the user isn't engaging; in 痛點發想 "想不到" is the very state the
# stage exists for, and bouncing it back with a complaint is exactly wrong.
DISCOVERY_STEP_SYSTEM_PROMPT = """你是「痛點發想」階段「回想問題」方法裡的其中一個步驟 Agent。
這個方法是幫還沒有痛點的人，從具體的生活片段裡把痛點回想出來。
你會看到使用者目前為止的回答歷程，以及這一步的新回答。

先判斷這個新回答：
- 如果是亂打字、明顯在測試、或跟問題完全無關的閒聊，把 is_relevant 設為 false，
  並在 clarification 用一兩句話友善地請他針對問題回想一個具體的片段；
  analysis 留空字串、idea_fragments 留空陣列。
- 如果他說「想不到」「沒有」或回答很短，這不算答非所問：把 is_relevant 設為 true，
  analysis 用一句話給他一個更具體的回想角度（例如換一個時間點或場景），idea_fragments 留空陣列。
- 其他認真的回答，把 is_relevant 設為 true，clarification 留空字串，並且：
  1. analysis 用一兩句話點出這個片段裡藏著的困擾（誰、在什麼情況、卡在哪裡）
  2. idea_fragments 寫 1~3 個從回答裡讀出來的候選痛點，每個一句話，描述「困擾」而不是解法

只能從使用者實際寫的內容裡讀出痛點，不要替他編造他沒提到的困擾。
一律使用繁體中文回答。只回傳符合 JSON schema 的結構化輸出，不要有多餘文字或客套話。"""

DISCOVERY_FINALIZE_SYSTEM_PROMPT = """你是「痛點發想」階段「回想問題」方法的彙整步驟 Agent。
使用者回答了幾個幫助回想的問題，你會看到完整的問答歷程，以及每一步讀出來的候選痛點。

你的工作是把歷程裡真正出現過的痛點整理成 1~5 筆，存進團隊的痛點庫，之後會拿去做專案發想。

規則：
- 只整理使用者實際提到、或從他的回答能直接讀出來的困擾；不要編造他沒提過的痛點，
  寧可少，也不要為了湊數補上通用的問題。
- 意思相同的合併成一筆，不同的困擾分開。
- 描述的是「困擾」，不是解法：不要在任何欄位提出產品或功能。
- 不要排序、不要評價哪個比較好，篩選由使用者自己做。

每筆痛點要有：
- statement（一句話，20 字左右）：誰在什麼時候卡在什麼事上
- who：會遇到的人；讀不出來就留空字串
- context：發生的時間、地點或情境；讀不出來就留空字串
- current_workaround：他們現在怎麼應付或忍受；讀不出來就留空字串

一律使用繁體中文回答。只回傳符合 JSON schema 的結構化輸出，不要有多餘文字。"""

DISCOVERY_FINALIZE_SCHEMA = {
    "type": "object",
    "properties": {
        "pain_points": {
            "type": "array",
            "minItems": 1,
            "maxItems": 5,
            "items": {
                "type": "object",
                "properties": {
                    "statement": {"type": "string"},
                    "who": {"type": "string"},
                    "context": {"type": "string"},
                    "current_workaround": {"type": "string"},
                },
                "required": ["statement", "who", "context", "current_workaround"],
                "additionalProperties": False,
            },
        }
    },
    "required": ["pain_points"],
    "additionalProperties": False,
}


class PainDiscoveryAgent(FrameworkAgent):
    """回想問題, one of 痛點發想's methods — the stage before 專案發想, for
    teams that came in without a problem. Each question is a different recall cue — a moment in the day,
    a workaround, a wait, a repeat, someone else's complaint — because "what
    bothers you lately?" asked cold mostly gets a blank. It ends by writing
    pain points to the library rather than ideas to the wall."""

    method_name = "pain_discovery"
    # The id stays `pain_discovery`: it is what every earlier discovery run
    # is stored under. Only the name on screen changed, from the stage's name
    # to the method's own, now that the stage holds more than one method.
    method_label = "回想問題"
    stage = "discovery"
    description = "用一天裡的時刻、土法煉鋼、等待、重複這幾個具體線索，把藏在日常裡的困擾回想出來。"
    tutorial_intro = (
        "直接問「有什麼痛點」通常只會得到一片空白，因為記憶要靠具體的線索才叫得出來。"
        "這裡每一題都是一個不同的線索：一天裡的某個時刻、一個土法煉鋼的做法、一次等待。"
    )
    tutorial_how_to = (
        "每題回想一個具體的片段就好，不用先想它是不是好題目。想不到可以直接說想不到，"
        "AI 會換個角度提示你。走完之後會整理成幾筆痛點，你再挑一個去做專案發想。"
    )
    steps = [
        StepSpec(
            "a_day",
            "回想最近一個平常的日子，從起床到睡前，哪一刻你嘆了口氣、皺了眉，或心想「怎麼又這樣」？",
        ),
        StepSpec(
            "workaround",
            "你有沒有在用 Excel、便利貼、LINE 記事本、截圖，或某種土法煉鋼的方式硬撐某件事？那件事是什麼？",
        ),
        StepSpec(
            "waiting",
            "最近有什麼事，你得等別人回覆、確認、排隊，或等某個東西準備好才能繼續？",
        ),
        StepSpec(
            "repeat",
            "有什麼事你每週都在重複做，或是一直被別人問同一個問題？",
        ),
        StepSpec(
            "others",
            "想一個你身邊的人（家人、同學、同事、室友），他最近抱怨過什麼？",
        ),
    ]

    def build_step_prompt(
        self,
        index: int,
        session: IdeationSession,
        prior_steps: list[MethodStep],
        user_answer: str,
        pain_point: PainPoint | None = None,
    ) -> tuple[str, str, dict]:
        step = self.steps[index]
        user_prompt = (
            f"# 團隊基本資訊\n{render_session_context(session)}\n\n"
            f"# 目前為止的回想歷程\n{render_history(prior_steps)}\n\n"
            f"# 這一步 [{step.name}]\n問題: {step.question}\n使用者回答: {user_answer}"
        )
        return DISCOVERY_STEP_SYSTEM_PROMPT, user_prompt, STEP_OUTPUT_SCHEMA

    def build_finalize_prompt(
        self,
        session: IdeationSession,
        all_steps: list[MethodStep],
        pain_point: PainPoint | None = None,
    ) -> tuple[str, str, dict]:
        user_prompt = (
            f"# 團隊基本資訊\n{render_session_context(session)}\n\n"
            f"# 完整回想歷程\n{render_history(all_steps)}"
        )
        return DISCOVERY_FINALIZE_SYSTEM_PROMPT, user_prompt, DISCOVERY_FINALIZE_SCHEMA
