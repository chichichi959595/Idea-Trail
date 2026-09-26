from .base import FrameworkAgent, StepSpec


class CapabilityMappingAgent(FrameworkAgent):
    method_name = "capability_mapping"
    method_label = "能力對應問題"
    steps = [
        StepSpec(
            "capabilities",
            "你們團隊目前比較拿手、或很想拿來練功的技術/工具是什麼？可以列多個，例如電腦視覺、LLM、某個框架。",
        ),
        StepSpec(
            "unique_angle",
            "這個技術跟「隨便找個題目套用」比起來，有沒有什麼是它特別擅長、別的做法很難做到的地方？",
        ),
        StepSpec(
            "who_needs_it",
            "想像一下，誰的生活或工作裡，剛好卡在一個「只有這個技術特性」才能解決的問題上？",
        ),
        StepSpec(
            "sanity_check",
            "如果拿掉這個技術限制，單純只看這群人的問題本身，這個問題本身重要嗎？值得做嗎？"
            "（避免變成「為技術找題目」）",
        ),
    ]
