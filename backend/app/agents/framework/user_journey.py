from .base import FrameworkAgent, StepSpec


class UserJourneyAgent(FrameworkAgent):
    method_name = "user_journey"
    method_label = "使用者旅程"
    description = (
        "把使用情境攤開成完整旅程，找出體驗最差、最值得切入的環節。"
    )
    tutorial_intro = (
        "把使用情境攤開成一段完整的旅程，從旅程裡最痛的那個瞬間找切入點，而不是憑空想功能。"
    )
    tutorial_how_to = (
        "依序描述主角是誰、他為什麼開始這趟旅程、大致經歷哪些步驟、哪個階段最卡，最後指出如果只能改一個瞬間會是哪裡。"
    )
    steps = [
        StepSpec(
            "who",
            "這趟旅程的主角是誰？在什麼情境下的哪一種使用者？",
        ),
        StepSpec(
            "trigger",
            "他是因為什麼原因或什麼契機，開始需要做這件事、或需要用到這個東西？",
        ),
        StepSpec(
            "steps",
            "從開始到結束，他大致會經歷哪些階段或動作？簡單列出幾個關鍵步驟就好。",
        ),
        StepSpec(
            "friction",
            "這整個過程裡，哪一個階段讓人最不爽、最卡、最容易放棄？",
        ),
        StepSpec(
            "moment_of_truth",
            "如果只能改善這趟旅程裡的「一個瞬間」，讓體驗變好非常多，你覺得會是哪一個瞬間？為什麼？",
        ),
    ]
