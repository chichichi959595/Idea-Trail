from .base import FrameworkAgent, StepSpec


class MashupAgent(FrameworkAgent):
    method_name = "mashup"
    method_label = "混搭法（Mash-up）"
    short_label = "混搭法"
    description = (
        "分別列出對象、痛點、技術三份清單，再隨機強迫組合出新方向。"
    )
    tutorial_intro = (
        "準備三種不同性質的清單——對象/場景、痛點/需求、技術/媒介——分開發散、再隨機強迫組合，逼出原本不會想到的交集。"
    )
    tutorial_how_to = (
        "分別各自列出 3 個對象、3 個痛點、3 個技術（先不用互相對應），最後從三份清單裡各挑一個硬湊在一起，看看會變成什麼。"
    )
    steps = [
        StepSpec(
            "audiences",
            "列出 3 個可能的目標族群或使用情境（例如「晚班的護理師」「通勤中的學生」），先不用想他們的問題是什麼。",
        ),
        StepSpec(
            "pain_points",
            "先不管上面列的對象，單獨列出 3 個你們常聽到、常觀察到的痛點或需求。",
        ),
        StepSpec(
            "technologies",
            "再列出 3 個你們感興趣、或想嘗試套用的技術／媒介／形式（例如 AR、LINE Bot、語音助理、感測器）。",
        ),
        StepSpec(
            "combine",
            "從上面三份清單裡，各挑一個「對象 + 痛點 + 技術」硬湊在一起，這個組合可能會變成什麼樣的東西？",
        ),
    ]
