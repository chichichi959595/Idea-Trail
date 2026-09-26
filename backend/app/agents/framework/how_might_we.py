from .base import FrameworkAgent, StepSpec


class HowMightWeAgent(FrameworkAgent):
    method_name = "how_might_we"
    method_label = "HMW（How Might We）"
    steps = [
        StepSpec(
            "raw_problem",
            "你觀察到的原始問題或困擾是什麼？不用講得很完整，先講你實際觀察到的現象就好。",
        ),
        StepSpec(
            "reframe",
            "試著把這個問題改寫成一句「How might we ...？（我們可以怎麼做，讓...？）」的句子。"
            "例如：How might we 幫助學生快速找到空教室？",
        ),
        StepSpec(
            "brainstorm",
            "針對你剛剛寫的這句 HMW 問題，盡量列出幾個可能的解法，不用完整、越天馬行空越好。",
        ),
        StepSpec(
            "pick_promising",
            "剛剛列的這些解法裡，你自己最想深入研究的是哪一個？為什麼？",
        ),
    ]
