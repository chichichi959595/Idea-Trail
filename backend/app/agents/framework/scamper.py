from .base import FrameworkAgent, StepSpec


class ScamperAgent(FrameworkAgent):
    method_name = "scamper"
    method_label = "SCAMPER"
    description = (
        "針對一個現有對象，用七個角度（替代／結合／調整／修改／其他用途／消除／反轉）逐一發想改造方式。"
    )
    tutorial_intro = (
        "針對一個現有的產品、服務或流程，用七個固定角度逐一逼問「還能怎麼改」，是最經典的產品改造發想法。"
    )
    tutorial_how_to = (
        "先講清楚要套用的對象是什麼，接著依序回答替代、結合、調整、修改、其他用途、消除、反轉七個角度，每個角度舉一個具體例子就好，不用每個都很厲害。"
    )
    steps = [
        StepSpec(
            "subject",
            "你想要套用 SCAMPER 的對象是什麼？可以是現有的產品、服務、流程，或你目前一個粗略的題目方向。",
        ),
        StepSpec(
            "substitute",
            "Substitute（替代）：這個對象裡，有哪個元件、角色、材料或做法可以被替代掉？替代成什麼？",
        ),
        StepSpec(
            "combine",
            "Combine（結合）：可以把這個對象和什麼其他東西、功能或服務結合在一起？",
        ),
        StepSpec(
            "adapt",
            "Adapt（調整）：有沒有其他領域的做法，可以拿來調整套用到這個對象上？",
        ),
        StepSpec(
            "modify",
            "Modify（修改）：這個對象的某個特性（大小、頻率、強度……）如果放大或縮小，會發生什麼事？",
        ),
        StepSpec(
            "put_to_other_use",
            "Put to another use（其他用途）：這個對象或它的一部分，還可以用在完全不同的用途或使用者身上嗎？",
        ),
        StepSpec(
            "eliminate",
            "Eliminate（消除）：如果拿掉這個對象裡的某個部分，會變得更簡單、更聚焦嗎？拿掉什麼？",
        ),
        StepSpec(
            "reverse",
            "Reverse（反轉）：如果把這個對象的順序、角色或邏輯反過來，會變成什麼樣子？",
        ),
    ]
