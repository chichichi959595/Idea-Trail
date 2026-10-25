"""Prompts for 專案收斂: taking one idea from "is this need real" to "should we
build it, and what exactly".

The stages, in the order the screen walks them:

1. 選題 — no agent; the user picks an idea from 想法庫.
2. 需求分析 — a 正方 and a 反方 agent argue whether the need is real, one
   round per click, as many rounds as the user wants. Neither gives a verdict;
   the user does.
3. MVP (MoSCoW) — an agent drafts candidate features, the user edits them and
   drags each into Must / Should / Could / Won't.
4. 效益 × 成本 — an agent estimates impact and effort per feature, the user
   moves them on the matrix. Must features are flagged and never dropped for
   being expensive.
5. 競品搜尋 — GitHub + web search, compared against the features decided
   above. It sits after the features on purpose: "has someone built this" is
   only answerable once "this" is a feature list rather than a one-liner.
6. 可行性與投入效益 — an agent reads everything above and assesses technical
   feasibility and return on effort; the user makes the go / pivot / drop call.

Same stance as the rest of the app: agents supply reasons, not decisions.
"""

from __future__ import annotations

from app.agents.framework.base import render_pain_point, render_session_context
from app.db.models import ConvergenceProject, Idea, IdeationSession, PainPoint

MOSCOW_LABELS = {
    "must": "Must（一定要有）",
    "should": "Should（應該要有）",
    "could": "Could（有更好）",
    "wont": "Won't（這版不做）",
}
VERDICT_LABELS = {"real": "需求成立", "unsure": "還需要驗證", "not_real": "需求不成立"}

_LANGUAGE_RULE = "一律使用繁體中文回答。只回傳符合 JSON schema 的結構化輸出，不要有多餘文字。"
_HONESTY_RULE = (
    "不要編造數據、統計或來源。沒有證據的地方就說是推論，"
    "並說明這個推論要怎麼驗證（例如找誰問、看什麼數字）。"
)


# ---- shared context ---------------------------------------------------------


def render_idea(idea: Idea) -> str:
    return f"# 要收斂的專案\n{idea.title}\n{idea.description}\n\n"


def render_context(
    session: IdeationSession | None, idea: Idea, pain_point: PainPoint | None
) -> str:
    team = render_session_context(session) if session else "(未提供)"
    return f"# 團隊基本資訊\n{team}\n\n{render_pain_point(pain_point)}{render_idea(idea)}"


def render_verdict(project: ConvergenceProject) -> str:
    if not project.demand_verdict:
        return ""
    line = VERDICT_LABELS.get(project.demand_verdict, project.demand_verdict)
    notes = f"\n使用者補充: {project.demand_notes}" if project.demand_notes else ""
    return f"# 需求分析的結論（使用者判定）\n{line}{notes}\n\n"


def render_features(features: list[dict], *, with_scores: bool = False) -> str:
    """The feature list grouped by MoSCoW bucket, unsorted ones last."""
    if not features:
        return "# 功能清單\n(還沒有功能)\n\n"
    lines = ["# 功能清單（使用者用 MoSCoW 分類過）"]
    for bucket in [*MOSCOW_LABELS, None]:
        group = [f for f in features if f.get("moscow") == bucket]
        if not group:
            continue
        lines.append(f"## {MOSCOW_LABELS[bucket] if bucket else '還沒分類'}")
        for f in group:
            line = f"- [{f['id']}] {f['title']}"
            if f.get("description"):
                line += f"：{f['description']}"
            if with_scores and f.get("impact") is not None and f.get("effort") is not None:
                line += f"（效益 {f['impact']}/5、成本 {f['effort']}/5）"
            lines.append(line)
    return "\n".join(lines) + "\n\n"


def render_research(research: dict | None) -> str:
    if not research or not research.get("summary"):
        return "# 競品搜尋\n(還沒做)\n\n"
    parts = [f"# 競品搜尋的整理\n{research['summary']}"]
    for c in research.get("competitors") or []:
        parts.append(f"- {c.get('name')}：重疊 {c.get('overlap') or '—'}；缺口 {c.get('gap') or '—'}")
    if research.get("differentiation"):
        parts.append(f"差異化空間: {research['differentiation']}")
    return "\n".join(parts) + "\n\n"


# ---- 2. 需求分析：正方 / 反方 ------------------------------------------------

_DEBATE_SIDES = {
    "pro": (
        "正方",
        """你的立場是：「這個需求是真的，而且值得做」。請論證：
- 誰真的會遇到這個問題、多常遇到、遇到時有多痛
- 他們現在用什麼方法應付，那個方法哪裡不夠好（土法煉鋼的做法本身就是需求存在的證據）
- 為什麼是現在、為什麼這個團隊適合做""",
    ),
    "con": (
        "反方",
        """你的立場是：「這個需求可能沒有想像中真實或強烈」。請質疑：
- 這是「真的痛」還是「有了也不錯」？使用者願意為它改變習慣嗎
- 現有的應付方法是不是其實已經夠用
- 遇到的人是不是太少、頻率太低，或是已經有現成產品解掉了
反方的目的不是否定這個專案，而是把最可能讓它失敗的需求面風險挖出來。""",
    ),
}

DIALOGUE_MAX_CHARS = 80
"""Hard cap on a dialogue line, enforced after the call as well as asked for
in the prompt — the point of the mode is that a line can be read at a glance."""

DEBATE_SYSTEM_TEMPLATE = """你是專案收斂階段「需求分析」辯論的{side_label} Agent。
使用者要判斷一個專案點子背後的需求是不是真的存在。另一個 Agent 站在相反立場，
最後由使用者自己判定，你不負責下結論，也不要假裝中立。

{stance}

{mode_rules}
- 如果使用者指定了這一輪要聚焦的方向，就圍繞那個方向。
- {honesty}

{language}"""

_MODE_RULES = {
    # 對話模式: one line each, like two people arguing across a table.
    "dialogue": """這是「對話模式」：你跟對方一人一句輪流講，像兩個人面對面爭論。
規則：
- 只講一句話，最多兩句，60 個字以內。不要條列、不要標題、不要 markdown。
- 直接回應對方剛剛那一句——反駁它、追問它，或承認一部分再補一刀。
  如果你是第一個開口的，就丟出你最有力的那一個論點。
- 一次只講一個點，不要把所有論點塞進一句話。不要重複自己講過的。
- 紀錄裡標成「使用者本人」的是真人加入辯論講的話。站在你對面的話就直接回應他，
  一樣有理有據地反駁，不用客氣也不要討好；站在你這邊的話，就接著他的論點往下推。

`argument` 放你這一句話。""",
    # 分析模式: the full written argument.
    "analysis": """這是「分析模式」：每一輪寫一段完整的論述。
規則：
- 第一輪：直接立論，提出 3~5 個最有力的論點。
- 之後的輪次：針對對方上一輪的論點逐一回應——指出哪裡站不住、哪裡你承認，
  再補上新的論點。不要重複自己前面講過的話。

`argument` 是一段完整的論述（可以用條列），`key_points` 是 2~4 個一句話的重點摘要。""",
}


def debate_output_schema(mode: str = "analysis") -> dict:
    if mode == "dialogue":
        return {
            "type": "object",
            "properties": {"argument": {"type": "string"}},
            "required": ["argument"],
            "additionalProperties": False,
        }
    return {
        "type": "object",
        "properties": {
            "argument": {"type": "string"},
            "key_points": {"type": "array", "items": {"type": "string"}},
        },
        "required": ["argument", "key_points"],
        "additionalProperties": False,
    }


def render_debate(turns: list[dict]) -> str:
    """The debate so far. Both modes can sit in one history — a team may
    trade a few quick lines and then ask for a full analysis round — and each
    agent reads all of it either way."""
    if not turns:
        return "# 目前的辯論紀錄\n(還沒開始，這是第一輪)\n\n"
    lines = ["# 目前的辯論紀錄"]
    for t in turns:
        label = _DEBATE_SIDES[t["side"]][0]
        if t.get("mode") == "dialogue":
            who = f"{label}（使用者本人）" if t.get("speaker") == "user" else label
            focus = f"（聚焦：{t['focus']}）" if t.get("focus") else ""
            lines.append(f"{who}{focus}：{t['argument']}")
            continue
        lines.append(f"## 第 {t['round']} 輪・{label}（分析）")
        if t.get("focus"):
            lines.append(f"(使用者指定的聚焦方向: {t['focus']})")
        lines.append(t["argument"])
    return "\n".join(lines) + "\n\n"


def build_debate_prompt(
    side: str,
    context: str,
    turns: list[dict],
    round_no: int,
    focus: str | None,
    mode: str = "analysis",
) -> tuple[str, str, dict]:
    label, stance = _DEBATE_SIDES[side]
    system_prompt = DEBATE_SYSTEM_TEMPLATE.format(
        side_label=label,
        stance=stance,
        mode_rules=_MODE_RULES[mode],
        honesty=_HONESTY_RULE,
        language=_LANGUAGE_RULE,
    )
    focus_line = f"這一輪使用者要你聚焦在: {focus}\n" if focus else ""
    if mode != "dialogue":
        task = f"現在是第 {round_no} 輪，輪到{label}發言。"
    elif turns and turns[-1].get("speaker") == "user" and turns[-1]["side"] != side:
        task = f"使用者本人剛剛站在對面講了最後那一句，輪到{label}直接回應他。"
    else:
        task = f"輪到{label}講下一句。"
    user_prompt = f"{context}{render_debate(turns)}# 你的任務\n{task}\n{focus_line}"
    return system_prompt, user_prompt, debate_output_schema(mode)


# ---- 3. MVP：功能發想 --------------------------------------------------------

FEATURES_SYSTEM_PROMPT = f"""你是專案收斂階段的功能規劃 Agent。使用者已經確認了需求，
接下來要用 MoSCoW（Must / Should / Could / Won't）切出最小可行性產品（MVP）。
你的工作只有第一步：列出這個專案可能會有的功能，讓使用者自己拖進四個分類。

請做：
- 列出 6~10 個功能，涵蓋核心流程與加分項，每個功能是使用者看得懂的一件事，
  不是技術元件（「登入」可以，「資料庫」不行）。
- `title` 是 12 個字以內的功能名稱，`description` 是一句話說明它解決什麼。
- 不要替使用者分類、排序或標示重要性——分類是使用者的工作。
- 已經在清單上的功能不要重複列。
- 需求分析裡被質疑的地方，可以列出對應的功能去回應它。

{_LANGUAGE_RULE}"""


def features_output_schema() -> dict:
    return {
        "type": "object",
        "properties": {
            "features": {
                "type": "array",
                "items": {
                    "type": "object",
                    "properties": {
                        "title": {"type": "string"},
                        "description": {"type": "string"},
                    },
                    "required": ["title", "description"],
                    "additionalProperties": False,
                },
            }
        },
        "required": ["features"],
        "additionalProperties": False,
    }


def build_features_prompt(
    context: str, project: ConvergenceProject
) -> tuple[str, str, dict]:
    debate = render_debate(project.debate or []) if project.debate else ""
    user_prompt = (
        f"{context}{debate}{render_verdict(project)}{render_features(project.features or [])}"
        "# 你的任務\n列出這個專案可能會有的功能（不要重複上面已經有的）。"
    )
    return FEATURES_SYSTEM_PROMPT, user_prompt, features_output_schema()


# ---- 4. 效益 × 成本 ----------------------------------------------------------

IMPACT_EFFORT_SYSTEM_PROMPT = f"""你是專案收斂階段的效益／成本評估 Agent。
使用者已經用 MoSCoW 把功能分好類，現在要畫 Impact vs. Effort 矩陣，
找出高效益、低成本、應該先做的項目。

請針對清單上每一個功能（Won't 除外）給：
- `impact`（1~5）：做出來之後對使用者、對這個痛點的效益
- `effort`（1~5）：以這個團隊的人數、技術背景、可用時間，實作的成本
- `rationale`：一句話說明這兩個分數的理由

規則：
- 用功能前面方括號裡的 id 對應，不要漏掉、不要自己新增功能。
- 成本要依「這個團隊」估，不是業界平均。團隊不熟的技術成本要拉高。
- 標成 Must 的功能，即使成本很高也照實評估，不要為了讓它看起來好做而壓低成本——
  Must 不會因為成本高被排除，使用者需要知道的是它會花多少力氣。
- {_HONESTY_RULE}

{_LANGUAGE_RULE}"""


def impact_effort_output_schema() -> dict:
    return {
        "type": "object",
        "properties": {
            "estimates": {
                "type": "array",
                "items": {
                    "type": "object",
                    "properties": {
                        "id": {"type": "string"},
                        "impact": {"type": "integer"},
                        "effort": {"type": "integer"},
                        "rationale": {"type": "string"},
                    },
                    "required": ["id", "impact", "effort", "rationale"],
                    "additionalProperties": False,
                },
            }
        },
        "required": ["estimates"],
        "additionalProperties": False,
    }


def build_impact_effort_prompt(
    context: str, project: ConvergenceProject
) -> tuple[str, str, dict]:
    user_prompt = (
        f"{context}{render_verdict(project)}{render_features(project.features or [])}"
        "# 你的任務\n為每個非 Won't 的功能估效益與成本。"
    )
    return IMPACT_EFFORT_SYSTEM_PROMPT, user_prompt, impact_effort_output_schema()


# ---- 5. 競品搜尋 -------------------------------------------------------------

SEARCH_QUERY_SYSTEM_PROMPT = f"""你負責幫一個專案想 GitHub 搜尋關鍵字，用來找有沒有人做過類似的開源專案。

請給 2~3 組搜尋字串：
- 用英文關鍵字（GitHub 上的專案大多是英文描述），每組 2~4 個字
- 一組描述「整個產品在做什麼」，其他組描述「最核心的 Must 功能」
- 不要加 GitHub 搜尋語法（不要 stars:、language: 之類）

只回傳符合 JSON schema 的結構化輸出，不要有多餘文字。"""


def search_query_output_schema() -> dict:
    return {
        "type": "object",
        "properties": {"queries": {"type": "array", "items": {"type": "string"}}},
        "required": ["queries"],
        "additionalProperties": False,
    }


def build_search_query_prompt(
    context: str, project: ConvergenceProject
) -> tuple[str, str, dict]:
    user_prompt = f"{context}{render_features(project.features or [])}"
    return SEARCH_QUERY_SYSTEM_PROMPT, user_prompt, search_query_output_schema()


WEB_RESEARCH_SYSTEM_PROMPT = """你是專案收斂階段的競品調查 Agent，手上有 web_search 工具。
使用者已經決定好這個專案的 MVP 功能，你要找市面上有沒有做到類似功能的產品、服務或開源專案。

請做：
1. 搜尋類似的產品、SaaS、App（開源部分可以用 `site:github.com` 加關鍵字查）。
2. 對每個找到的競品，看它做到了清單上的哪些 Must / Should 功能、沒做到哪些。
3. 把查到的重點整理成條列，每一條都扣著一個具體來源，不要編造查不到的東西。
4. 什麼都查不到就直接說查不到。

一律使用繁體中文回答，純文字條列即可，不需要 JSON，也不用客套話開場。"""


def build_web_research_prompt(context: str, project: ConvergenceProject) -> tuple[str, str]:
    return WEB_RESEARCH_SYSTEM_PROMPT, f"{context}{render_features(project.features or [])}"


RESEARCH_SUMMARY_SYSTEM_PROMPT = f"""你是專案收斂階段的競品分析 Agent。
手上有兩份外部資料：GitHub 搜尋結果、網路搜尋的整理（可能其中一份沒有）。
請拿它們跟使用者決定的功能清單比對，回答「市場上已經有什麼、我們還剩什麼空間」。

請做：
- `summary`：3~5 句話總結搜尋到的狀況
- `competitors`：最相關的 0~6 個競品。`name` 與 `url` 只能用資料裡真的出現過的，
  不要自己補網址；`overlap` 是它做到了清單上的哪些功能，`gap` 是它沒做到、我們可以做的
- `differentiation`：一段話，說明我們的 Must / Should 功能裡哪些是真正的差異化，
  哪些只是在重做別人已經做好的東西
- 兩份資料都是空的或不相關，就老實說沒有找到相近的競品，`competitors` 給空陣列

{_LANGUAGE_RULE}"""


def research_summary_output_schema() -> dict:
    return {
        "type": "object",
        "properties": {
            "summary": {"type": "string"},
            "competitors": {
                "type": "array",
                "items": {
                    "type": "object",
                    "properties": {
                        "name": {"type": "string"},
                        "url": {"type": "string"},
                        "overlap": {"type": "string"},
                        "gap": {"type": "string"},
                    },
                    "required": ["name", "url", "overlap", "gap"],
                    "additionalProperties": False,
                },
            },
            "differentiation": {"type": "string"},
        },
        "required": ["summary", "competitors", "differentiation"],
        "additionalProperties": False,
    }


def render_github_hits(hits: list[dict]) -> str:
    if not hits:
        return "# GitHub 搜尋結果\n(沒有結果)\n\n"
    lines = ["# GitHub 搜尋結果"]
    for h in hits:
        lines.append(
            f"- {h['full_name']}（★{h.get('stars', 0)}）{h['url']}\n  {h.get('description') or '(沒有描述)'}"
        )
    return "\n".join(lines) + "\n\n"


def build_research_summary_prompt(
    context: str,
    project: ConvergenceProject,
    github_hits: list[dict],
    web_text: str | None,
    web_citations: list[dict],
) -> tuple[str, str, dict]:
    if web_text:
        sources = "\n".join(f"- {c['title']} {c['url']}" for c in web_citations)
        web = f"# 網路搜尋的整理\n{web_text}\n\n來源:\n{sources}\n\n"
    else:
        web = "# 網路搜尋的整理\n(這次沒有網路搜尋)\n\n"
    user_prompt = (
        f"{context}{render_features(project.features or [])}"
        f"{render_github_hits(github_hits)}{web}"
    )
    return RESEARCH_SUMMARY_SYSTEM_PROMPT, user_prompt, research_summary_output_schema()


# ---- 6. 技術可行性與投入效益 --------------------------------------------------

FEASIBILITY_SYSTEM_PROMPT = f"""你是專案收斂階段最後一步的可行性評估 Agent。
前面的需求分析、MVP 功能、效益成本、競品搜尋都做完了，你要把它們放在一起，
回答兩個問題：「這個團隊做得出來嗎」與「做下去值得嗎」。
你的立場是提供判斷依據，不是代替使用者決定要不要做——不要說「建議做／不建議做」。

請給：
- `technical`：技術可行性
  - `score` 1~5，`rationale` 理由
  - `risks`：2~4 個最大的技術風險（團隊沒碰過的技術、外部依賴、資料來源……）
  - `suggested_stack`：建議的技術組合，盡量貼近團隊現有的技術背景
- `investment`：投入效益
  - `score` 1~5，`rationale` 理由
  - `effort_estimate`：以團隊人數與可用時間，做完所有 Must 功能大概要多久、還剩多少餘裕
  - `benefit`：做出來之後最實際的收穫（對使用者、對團隊）
- `must_fit`：所有 Must 功能放得進團隊可用時間嗎？放不進的話，哪幾個 Must 最吃時間
- `open_questions`：開工前還需要回答的 2~4 個問題

{_HONESTY_RULE}

{_LANGUAGE_RULE}"""


def feasibility_output_schema() -> dict:
    scored = {
        "score": {"type": "integer"},
        "rationale": {"type": "string"},
    }
    return {
        "type": "object",
        "properties": {
            "technical": {
                "type": "object",
                "properties": {
                    **scored,
                    "risks": {"type": "array", "items": {"type": "string"}},
                    "suggested_stack": {"type": "array", "items": {"type": "string"}},
                },
                "required": ["score", "rationale", "risks", "suggested_stack"],
                "additionalProperties": False,
            },
            "investment": {
                "type": "object",
                "properties": {
                    **scored,
                    "effort_estimate": {"type": "string"},
                    "benefit": {"type": "string"},
                },
                "required": ["score", "rationale", "effort_estimate", "benefit"],
                "additionalProperties": False,
            },
            "must_fit": {"type": "string"},
            "open_questions": {"type": "array", "items": {"type": "string"}},
        },
        "required": ["technical", "investment", "must_fit", "open_questions"],
        "additionalProperties": False,
    }


def build_feasibility_prompt(
    context: str, project: ConvergenceProject
) -> tuple[str, str, dict]:
    debate = render_debate(project.debate or []) if project.debate else ""
    user_prompt = (
        f"{context}{debate}{render_verdict(project)}"
        f"{render_features(project.features or [], with_scores=True)}"
        f"{render_research(project.research)}"
        "# 你的任務\n評估技術可行性與投入效益。"
    )
    return FEASIBILITY_SYSTEM_PROMPT, user_prompt, feasibility_output_schema()


def clamp_score(value) -> int | None:
    if isinstance(value, (int, float)) and not isinstance(value, bool):
        return max(1, min(5, round(value)))
    return None
