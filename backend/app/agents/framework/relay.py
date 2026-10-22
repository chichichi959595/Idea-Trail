from app import relay

from .base import FrameworkAgent, StepSpec


class RelayAgent(FrameworkAgent):
    """多人接龍. A method like the others in the catalog — the selector can
    recommend it and it starts from the same button — but it isn't walked one
    answer at a time by one person, so `mode = "relay"` sends it down its own
    path: a lobby that phones join, and the relay grid in place of `steps`
    (see app/api/relay.py).

    `steps` is the full (3+ people) ladder expressed as StepSpecs, so the catalog's
    step count and the per-round timers come from the same place as every
    other method's. Nothing walks these as steps.
    """

    method_name = "relay"
    method_label = "多人接龍"
    mode = "relay"
    min_team_size = relay.MIN_PARTICIPANTS
    description = (
        "2 人以上坐在一起，各自用手機同時寫、往右傳：使用者 → 場景 → 卡點"
        "（兩個人時縮成兩層），最後一次公布所有的鏈。適合還沒有方向、而且人在現場的團隊。"
    )
    tutorial_intro = (
        "紙本 Brainwriting 的線上版。每個人手上同時有一張紙，寫完一層就往右傳；"
        "你看得到手上這張紙的全部，但看不到其他人手上的。"
        "因為沒有人看得到全貌，每一層都會被下一個人用自己的方式解讀，新東西就是從這裡來的。"
    )
    tutorial_how_to = (
        "主持人開場後，大家用手機掃畫面上的 QR code 加入。每一輪限時寫一兩句，"
        "只往下接一層、不修改上面已經寫的；看不懂的地方按「看不懂」照樣往下寫。"
        "全部寫完後在主持人的畫面上一起看所有的鏈。"
    )
    steps = [
        StepSpec(rung["role"], rung["question"], timer_seconds=rung["timer_seconds"])
        for rung in relay.DEFAULT_RUNGS
    ]
