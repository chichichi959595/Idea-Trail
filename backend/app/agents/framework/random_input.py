import random

from .base import FrameworkAgent, StepSpec

# Split into two disjoint pools so the two random-word steps never draw the
# same word for a single run without needing any shared/mutable run state.
_WORD_POOL_A = ["潛水艇", "仙人掌", "降落傘", "章魚", "鬧鐘", "螺絲起子", "溜滑梯", "指南針"]
_WORD_POOL_B = ["爆米花", "風箏", "保溫瓶", "蜂巢", "跳繩", "羅盤", "拼圖", "螢火蟲"]


class RandomInputAgent(FrameworkAgent):
    method_name = "random_input"
    method_label = "隨機刺激（Random Input）"
    steps = [
        StepSpec(
            "topic",
            "你們目前的方向或想解決的領域大致是什麼？就算還很模糊也沒關係。",
        ),
        StepSpec("random_word_1", ""),
        StepSpec("random_word_2", ""),
        StepSpec(
            "pick_best",
            "剛剛兩次的隨機聯想裡，哪一個組合你覺得比較有潛力？再稍微延伸一下這個方向。",
        ),
    ]

    def question_for(self, index: int) -> str:
        if index == 1:
            word = random.choice(_WORD_POOL_A)
            return (
                f"不用管合不合理，硬把「{word}」的某個特性、功能或形象，"
                "跟你們的主題湊在一起，想出一個點子。"
            )
        if index == 2:
            word = random.choice(_WORD_POOL_B)
            return (
                f"再來一次，這次用「{word}」——一樣不用管合不合理，"
                "找出它跟你們主題可以硬湊在一起的地方，想出另一個點子。"
            )
        return super().question_for(index)
