from .base import FrameworkAgent, StepSpec


class CapabilityMappingAgent(FrameworkAgent):
    method_name = "capability_mapping"
    method_label = "能力對應問題"
    description = (
        "從你們已經會的技術出發，反推可以解決哪些問題，並檢查問題本身是否值得做。"
    )
    tutorial_intro = (
        "從你們已經會的技術出發往回推可以解決什麼問題，適合技術導向但還沒有明確題目的團隊；但要小心不要變成「為技術找題目」。"
    )
    tutorial_how_to = (
        "先列出拿手或想練的技術，講出它的獨特優勢，想像誰的問題剛好需要這個技術，最後拿掉技術濾鏡，誠實檢查這個問題本身重不重要。"
    )
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
