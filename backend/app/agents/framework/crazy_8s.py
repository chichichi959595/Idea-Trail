from .base import FrameworkAgent, StepSpec

_SOLUTION_PROMPTS = [
    "解法 1/8：針對上面這個問題，30 秒內寫下第一個解決辦法。不管好不好、可不可行，想到什麼就直接寫下來。",
    "解法 2/8：不要回頭看剛剛寫的，30 秒內再寫一個解法，這次刻意換一個完全不同的切入角度。",
    "解法 3/8：繼續，30 秒內寫下第 3 個解法。",
    "解法 4/8：過半了，30 秒內寫下第 4 個解法，越怪越好，先不要評論自己。",
    "解法 5/8：30 秒內寫下第 5 個解法。如果卡住，故意想一個誇張、不可行的版本也可以。",
    "解法 6/8：30 秒內寫下第 6 個解法。",
    "解法 7/8：只剩最後兩個，30 秒內寫下第 7 個解法。",
    "解法 8/8：最後衝刺！30 秒內寫下第 8 個解法——通常最後擠出來的最有突破性。",
]


class Crazy8sAgent(FrameworkAgent):
    method_name = "crazy_8s"
    method_label = "Crazy 8s"
    steps = [
        StepSpec(
            "problem",
            "你們想解決的具體問題或挑戰是什麼？盡量講清楚（例如「學生常常忘記繳交作業」），這一步不用想解法，只要把問題講清楚就好。",
        ),
        *[StepSpec(f"solution_{i + 1}", prompt) for i, prompt in enumerate(_SOLUTION_PROMPTS)],
    ]
