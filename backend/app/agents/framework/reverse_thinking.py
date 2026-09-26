from .base import FrameworkAgent, StepSpec


class ReverseThinkingAgent(FrameworkAgent):
    method_name = "reverse_thinking"
    method_label = "逆向思考"
    steps = [
        StepSpec(
            "subject",
            "這次想圍繞的情境或對象是什麼？可以是一群使用者、一個場景，或一個粗略的題目方向。",
        ),
        StepSpec(
            "worst_ideas",
            "先反過來想：針對這個情境，故意想 3～5 個「最爛、最沒用、根本沒人想用」的點子。越荒謬越好，不用擔心丟臉。",
        ),
        StepSpec(
            "why_bad",
            "這些爛點子裡，讓你覺得「最讓人討厭」或「最沒用」的地方到底是什麼？具體說說看。",
        ),
        StepSpec(
            "flip_to_good",
            "挑其中一個你覺得最有趣的爛點子，試著把它「調轉」或「修正」成一個說得通、甚至有商機的方向，會變成什麼樣子？",
        ),
    ]
