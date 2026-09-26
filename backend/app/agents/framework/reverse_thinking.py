from .base import FrameworkAgent, StepSpec


class ReverseThinkingAgent(FrameworkAgent):
    method_name = "reverse_thinking"
    method_label = "逆向思考"
    description = (
        "故意想一堆最爛、最沒用的點子，挖出爛在哪裡，再把最有趣的一個調轉成有商機的方向。"
    )
    tutorial_intro = (
        "源自「最糟點子法」：與其直接想好點子，不如先故意想最爛的點子，因為爛點子往往能暴露出真正重要的限制條件，再把它們調轉回來。"
    )
    tutorial_how_to = (
        "先講情境，接著刻意想幾個爛到不行的點子，說出它們爛在哪裡，最後挑一個最有趣的爛點子，把它修正成一個說得通的方向。"
    )
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
