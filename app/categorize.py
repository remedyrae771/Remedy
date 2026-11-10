"""Автоматическая категоризация операций по правилам «подстрока → категория»."""
import sqlite3
from typing import Optional


def load_rules(conn: sqlite3.Connection) -> list[tuple[str, int, str]]:
    rows = conn.execute(
        "SELECT r.pattern, r.category_id, c.kind FROM rules r JOIN categories c ON c.id = r.category_id"
        " ORDER BY LENGTH(r.pattern) DESC"
    ).fetchall()
    return [(r["pattern"].lower(), r["category_id"], r["kind"]) for r in rows]


def fallback_category(conn: sqlite3.Connection, amount: float) -> Optional[int]:
    name = "Прочие доходы" if amount > 0 else "Прочие расходы"
    row = conn.execute("SELECT id FROM categories WHERE name = ?", (name,)).fetchone()
    return row["id"] if row else None


def categorize(conn: sqlite3.Connection, description: str, amount: float,
               rules: Optional[list] = None) -> Optional[int]:
    """Подбирает категорию: правило должно совпасть по тексту и по знаку суммы."""
    rules = rules if rules is not None else load_rules(conn)
    text = (description or "").lower()
    wanted_kind = "income" if amount > 0 else "expense"
    for pattern, category_id, kind in rules:
        if kind == wanted_kind and pattern in text:
            return category_id
    return fallback_category(conn, amount)
