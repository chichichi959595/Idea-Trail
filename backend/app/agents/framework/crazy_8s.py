from .base import FrameworkAgent, StepSpec


class Crazy8sAgent(FrameworkAgent):
    method_name = "crazy_8s"
    method_label = "Crazy 8s"
    steps = [
        StepSpec(
            "spark",
            "有什麼粗略的主題、情境或關鍵字，是你們想圍繞著發想的？可以很模糊，甚至只是一個詞。",
        ),
        StepSpec(
            "round_1",
            "不准想太久、不准評論自己：快速寫下 3 個跟這個主題有關、彼此方向盡量不同的點子（用逗號或換行分開即可）。",
        ),
        StepSpec(
            "round_2",
            "不要回頭看剛剛寫的，再快速寫下 3 個新點子，這次刻意換一個切入角度。",
        ),
        StepSpec(
            "round_3",
            "最後衝刺：通常最後擠出來的點子最有突破性。再快速寫 2 個，即使覺得很怪也直接寫出來，不要自我審查。",
        ),
    ]
