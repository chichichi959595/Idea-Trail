from .base import FinalizeSpec, FrameworkAgent, MethodStep, StepSpec

_SOLUTION_PROMPTS = [
    "解法 1/6：針對上面這個問題，30 秒內寫下第一個解決辦法。不管好不好、可不可行，想到什麼就直接寫下來。",
    "解法 2/6：不要回頭看剛剛寫的，30 秒內再寫一個解法，這次刻意換一個完全不同的切入角度。",
    "解法 3/6：30 秒內寫下第 3 個解法，越怪越好，先不要評論自己。",
    "解法 4/6：過半了，30 秒內寫下第 4 個解法。如果卡住，故意想一個誇張、不可行的版本也可以。",
    "解法 5/6：只剩最後兩個，30 秒內寫下第 5 個解法。",
    "解法 6/6：最後衝刺！30 秒內寫下第 6 個解法——通常最後擠出來的最有突破性。",
]


class Crazy8sAgent(FrameworkAgent):
    method_name = "crazy_8s"
    method_label = "Crazy 8s"
    description = (
        "針對一個具體問題，每 30 秒衝一個解法，6 個解法不准評論自己，越後面擠出來的往往越有突破性。"
    )
    tutorial_intro = (
        "針對「同一個」具體問題，逼自己在極短時間內想出 6 個不同的解法，規則是不准評論、不准刪除、先求數量——前幾個通常是老掉牙的常識，但越後面擠出來的往往越有突破性。"
    )
    tutorial_how_to = (
        "先講清楚要解決的具體問題，接著每一步都有 30 秒的限時，針對同一個問題寫下一個新解法（不是點子，是解法），共 6 步，不要回頭修改或刪除前面寫的。"
        "中間不會停下來分析，6 個都寫完後 AI 才會一起看過，把每個解法寫成完整的專案主題。"
    )
    steps = [
        StepSpec(
            "problem",
            "你們想解決的具體問題或挑戰是什麼？盡量講清楚（例如「學生常常忘記繳交作業」），這一步不用想解法，只要把問題講清楚就好。",
        ),
        # analyze=False: the method lives on uninterrupted pace, so nothing is
        # judged between rounds — all six are judged together at finalize.
        *[
            StepSpec(f"solution_{i + 1}", prompt, timer_seconds=30, analyze=False)
            for i, prompt in enumerate(_SOLUTION_PROMPTS)
        ],
    ]

    def finalize_spec(self, all_steps: list[MethodStep]) -> FinalizeSpec:
        """At most one candidate per solution the user actually wrote.

        The solution steps skip the per-step relevance gate, so this is where
        each answer gets checked — but only for whether it is a real attempt at
        the problem. Wild or infeasible ones stay: that is what the method is
        for, and judging quality belongs to the scoring stage after the idea
        board. What survives is fleshed out into a full project topic.

        Upper bound is the written count (steps can time out empty, and asking
        for more would have the model invent some); the floor is 1, so a run
        where nothing usable was written ends `failed` rather than "done" with
        an empty board.
        """
        written = sum(
            1 for s in all_steps if s.step_name.startswith("solution_") and s.user_answer
        )
        count = max(1, written)
        material = (
            f"這一輪的材料是使用者針對「同一個問題」在限時內衝出來的 {count} 個解法"
            "（最前面那一步是問題陳述本身）。這些解法寫的時候沒有經過任何審核，所以請你逐一判斷：\n"
            "1. 先看它是不是真的在試著解決這個問題。亂打字、空洞到看不出意思、跟問題完全無關的，"
            "就跳過，不要產生候選。\n"
            "   但「誇張」「不可行」「只有幾個字」都不是跳過的理由——這個方法本來就鼓勵這樣寫，"
            "只要看得出想法就算數。\n"
            "2. 每個算數的解法，對應一個 Project Concept，順序照原本的順序。"
            "把它補完整成一個團隊可以拿去做的專案主題：保留使用者原本的核心想法，"
            "補上它具體要做什麼、給誰用、怎麼解決原本那個問題；太誇張的就收斂成做得出來的版本，"
            "但不要換成另一個想法。\n"
            f"總共 1~{count} 個（等於算數的解法數）。不要合併相近的解法、"
            "不要因為覺得比較弱就淘汰、也不要另外補上使用者沒寫的想法。"
        )
        return FinalizeSpec(material, 1, count)
