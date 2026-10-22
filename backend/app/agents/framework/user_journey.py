from .base import FinalizeSpec, FrameworkAgent, MethodStep, StepSpec


class UserJourneyAgent(FrameworkAgent):
    method_name = "user_journey"
    method_label = "使用者旅程"
    description = (
        "把處理這個問題的完整流程一步步攤開，找出最麻煩、最花時間或最容易出錯的那一步。"
    )
    tutorial_intro = (
        "把處理這個問題的過程攤開成一段完整的旅程，從流程裡最卡的那一步找切入點，而不是憑空想功能。"
    )
    tutorial_how_to = (
        "先說問題在什麼情況下發生、從頭到尾會經歷哪些步驟、每一步做什麼；"
        "再指出最麻煩的那一步和它造成的影響；最後說出最想改變什麼、希望工具幫你做到什麼。"
        "用你自己（或當事人）的第一人稱回答，越貼近實際經驗越好。"
    )
    # Eight questions in three movements: lay out the journey (1–3), find where
    # it hurts and how much (4–5), then turn that into what should change
    # (6–8). Asked in the first person — the team walks through the problem as
    # the person who lives it, rather than describing a 主角 from outside.
    steps = [
        StepSpec("context", "這個問題通常會在什麼情況下發生？"),
        StepSpec("steps", "從開始處理到完成，你通常會經歷哪些步驟？"),
        StepSpec("actions", "在每個步驟中，你會做什麼、使用哪些工具，或與哪些人互動？"),
        StepSpec("friction", "在整個流程中，哪個步驟最麻煩、最花時間，或最容易出錯？"),
        StepSpec("impact", "這個困難會對你造成什麼影響？"),
        StepSpec("one_change", "如果可以改善一個步驟，你最希望改變什麼？為什麼？"),
        StepSpec(
            "improvements",
            "你覺得有哪些地方可以變得更簡單、更有效率或更不容易出錯？",
        ),
        StepSpec(
            "tool_wish",
            "如果有一個工具或系統能改善這個流程，你希望它幫你完成什麼事？",
        ),
    ]

    # A journey run maps one process end to end and then says where it hurts,
    # so its candidates should be anchored on that process — the worst step
    # and the change the team said they want most — rather than drifting into
    # whatever the earlier, purely descriptive answers happened to mention.
    _FINALIZE_MATERIAL = (
        "這一輪的材料是同一個問題的完整處理流程：在什麼情況發生、經歷哪些步驟、每一步做什麼、"
        "哪一步最麻煩、造成什麼影響，以及使用者最想改變什麼、希望工具幫他做到什麼。\n"
        "請彙整成 3 個 Project Concept，每一個都要明確對準流程裡的某一個步驟"
        "（優先是使用者指出最麻煩的那一步，以及他最想改變的地方），"
        "並在描述裡說清楚它改變了流程中的哪一步、怎麼改。"
        "三個之間要有區隔：可以是改善同一步的不同作法，也可以分別處理不同的步驟。"
    )

    def finalize_spec(self, all_steps: list[MethodStep]) -> FinalizeSpec:
        return FinalizeSpec(self._FINALIZE_MATERIAL, 3, 3)
