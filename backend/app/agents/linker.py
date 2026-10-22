"""Which items in a library are related — the AI half of the library graphs.

One agent for both libraries. What changes between them is what the items are
and what "related" means for them, so that is all a `LinkSubject` carries.
"""

from __future__ import annotations

from dataclasses import dataclass

from app.db.models import Idea, PainPoint

LINK_SYSTEM_PROMPT = """你是 Linker Agent。你會看到一個{library}裡的所有{noun}，每個都有編號。
你的工作是找出「內容上相關」的配對，讓使用者在關聯圖上看到哪些{noun}靠在一起。

什麼算相關（任一項就算）：
{criteria}

規則：
- 只連真的有關的，不要為了讓每個{noun}都有連線而硬湊；沒有關聯的就讓它獨立。
- 每一對只寫一次，a 跟 b 填編號，不能連到自己。
- reason 用一句話（15 字左右）講出它們相關在哪裡。

一律使用繁體中文回答，只回傳符合 JSON schema 的結構化輸出。"""

LINK_OUTPUT_SCHEMA = {
    "type": "object",
    "properties": {
        "links": {
            "type": "array",
            "minItems": 1,
            "items": {
                "type": "object",
                "properties": {
                    "a": {"type": "integer"},
                    "b": {"type": "integer"},
                    "reason": {"type": "string"},
                },
                "required": ["a", "b", "reason"],
                "additionalProperties": False,
            },
        }
    },
    "required": ["links"],
    "additionalProperties": False,
}

TEXT_LIMIT = 120
"""Characters of each item's body sent along. The whole library goes into one
prompt, so it is kept short; the headline carries most of the signal."""


@dataclass(frozen=True)
class LinkSubject:
    library: str
    noun: str
    criteria: str


IDEA_SUBJECT = LinkSubject(
    library="想法庫",
    noun="Project Concept",
    criteria=(
        "- 解決同一類問題，或服務同一群使用者\n"
        "- 用到相同的核心機制或技術路線\n"
        "- 一個可以當另一個的元件、延伸或前置"
    ),
)

PAIN_POINT_SUBJECT = LinkSubject(
    library="痛點庫",
    noun="痛點",
    criteria=(
        "- 發生在同一群人身上，或同一個場景、同一段流程裡\n"
        "- 根本原因相同（例如都是資訊分散、都是要等人確認）\n"
        "- 一個解法很可能同時解決兩個痛點"
    ),
)


def _clip(text: str | None) -> str:
    return (text or "")[:TEXT_LIMIT]


def build_link_prompt(subject: LinkSubject, lines: list[str]) -> tuple[str, str, dict]:
    system_prompt = LINK_SYSTEM_PROMPT.format(
        library=subject.library, noun=subject.noun, criteria=subject.criteria
    )
    user_prompt = f"# {subject.library}（共 {len(lines)} 個）\n" + "\n".join(lines)
    return system_prompt, user_prompt, LINK_OUTPUT_SCHEMA


def idea_lines(ideas: list[Idea]) -> list[str]:
    return [f"[{i.id}] {i.title}：{_clip(i.description)}" for i in ideas]


def pain_point_lines(pain_points: list[PainPoint]) -> list[str]:
    lines = []
    for p in pain_points:
        detail = "；".join(
            f"{label}{value}"
            for label, value in (("誰：", p.who), ("情境：", p.context))
            if value
        )
        lines.append(f"[{p.id}] {p.statement}" + (f"（{_clip(detail)}）" if detail else ""))
    return lines


def interpret_links(structured: dict | None, known_ids: set[int]) -> dict[tuple[int, int], str]:
    """The model's pairs, cleaned: unknown ids and self-links dropped, each
    pair spelled smaller-id-first, and a repeated pair kept once."""
    pairs: dict[tuple[int, int], str] = {}
    for item in (structured or {}).get("links") or []:
        if not isinstance(item, dict):
            continue
        try:
            a, b = int(item.get("a")), int(item.get("b"))
        except (TypeError, ValueError):
            continue
        if a == b or a not in known_ids or b not in known_ids:
            continue
        key = (min(a, b), max(a, b))
        pairs.setdefault(key, (item.get("reason") or "").strip())
    return pairs
