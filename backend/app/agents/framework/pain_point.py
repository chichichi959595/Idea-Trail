from .base import FinalizeSpec, FrameworkAgent, MethodStep, StepSpec


class PainPointAgent(FrameworkAgent):
    method_name = "pain_point"
    method_label = "痛點導向"
    description = (
        "從最近讓你們覺得麻煩的事情出發，逐步問出誰遇到、多常發生、現在怎麼解決，彙整成具體題目。"
    )
    tutorial_intro = (
        "從真實觀察到的困擾出發，而不是憑空想題目：核心假設是「先有痛點、才有解法」。"
    )
    tutorial_how_to = (
        "依序回答最近卡在什麼事、誰會遇到、現在怎麼解決、為什麼不好、多常發生、解決後的價值。回答越具體，AI 抽出的想法片段就越準。"
    )
    steps = [
        StepSpec(
            "trigger",
            "最近有什麼事讓你覺得麻煩、卡關，或者一直在用不太好的方式應付？",
        ),
        StepSpec("who", "誰會遇到這個問題？是你自己，還是某一群特定的人？"),
        StepSpec("current_solution", "現在大家是怎麼解決（或忍受）這個問題的？"),
        StepSpec("why_bad", "為什麼現有的解決方式不好？哪裡讓人不滿意？"),
        StepSpec("frequency", "這個問題發生的頻率有多高？是每天都碰到，還是偶爾才遇到？"),
        StepSpec("value", "如果這個問題被解決了，對當事人來說，價值或差別會是什麼？"),
    ]

    # A pain-point run digs into exactly one problem, so its candidates are
    # three ways of attacking that problem — not three unrelated topics, which
    # is what the shared instruction ("彼此有區隔") was quietly asking for.
    _FINALIZE_MATERIAL = (
        "這一輪的材料是一個被逐步深挖的痛點：誰遇到、現在怎麼解決、為什麼不好、多常發生、"
        "解決後的價值。它不是散落的碎片，而是同一個問題的六個切面。\n"
        "請彙整成 3 個 Project Concept，而且這 3 個是解決「同一個痛點」的三種不同作法"
        "（切入點、使用者、技術路線任一項不同就算），不要為了湊數變成三個互不相關的題目。"
    )

    def finalize_spec(self, all_steps: list[MethodStep]) -> FinalizeSpec:
        return FinalizeSpec(self._FINALIZE_MATERIAL, 3, 3)
