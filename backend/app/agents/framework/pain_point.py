from .base import FrameworkAgent, StepSpec


class PainPointAgent(FrameworkAgent):
    method_name = "pain_point"
    method_label = "痛點導向"
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
