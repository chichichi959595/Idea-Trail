from .base import FrameworkAgent, StepSpec


class PainPointAgent(FrameworkAgent):
    method_name = "pain_point"
    method_label = "痛點導向"
    description = (
        "從最近讓你們覺得麻煩的事情出發，逐步問出誰遇到、多常發生、現在怎麼解決，收斂成具體題目。"
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
