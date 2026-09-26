from .base import FrameworkAgent, StepSpec


class AnalogyAgent(FrameworkAgent):
    method_name = "analogy"
    method_label = "類比法"
    steps = [
        StepSpec(
            "problem",
            "你想解決的問題或情境，用一句話簡單描述一下？",
        ),
        StepSpec(
            "other_domain",
            "有沒有其他完全不同的領域、產業，甚至大自然裡，已經有很成熟的方式在處理「結構類似」的問題？"
            "不用跟你的題目像，結構像就好。",
        ),
        StepSpec(
            "how_they_solve",
            "那個領域具體是怎麼解決的？他們的做法或設計邏輯是什麼？",
        ),
        StepSpec(
            "map_back",
            "如果把那個做法的邏輯「借」過來，套用在你原本的問題上，會變成什麼樣子？",
        ),
    ]
