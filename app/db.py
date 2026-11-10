"""Хранилище на SQLite (стандартная библиотека, без ORM)."""
import os
import sqlite3
from contextlib import contextmanager

DB_PATH = os.environ.get("REMEDY_DB", os.path.join(os.path.dirname(__file__), "..", "remedy.db"))

SCHEMA = """
CREATE TABLE IF NOT EXISTS categories (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL UNIQUE,
    kind TEXT NOT NULL CHECK (kind IN ('income', 'expense')),
    color TEXT NOT NULL DEFAULT '#888888'
);

CREATE TABLE IF NOT EXISTS accounts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    currency TEXT NOT NULL DEFAULT 'RUB',
    provider TEXT NOT NULL DEFAULT 'manual',   -- manual | file | demo | gocardless
    external_id TEXT,                          -- id счёта у провайдера
    connection_id TEXT,                        -- id подключения (requisition) у провайдера
    last_synced_at TEXT,
    UNIQUE (provider, external_id)
);

CREATE TABLE IF NOT EXISTS transactions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    account_id INTEGER NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
    date TEXT NOT NULL,                        -- YYYY-MM-DD
    amount REAL NOT NULL,                      -- > 0 доход, < 0 расход
    description TEXT NOT NULL DEFAULT '',
    category_id INTEGER REFERENCES categories(id) ON DELETE SET NULL,
    external_id TEXT,                          -- id операции в банке (для дедупликации)
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    UNIQUE (account_id, external_id)
);

CREATE TABLE IF NOT EXISTS rules (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    pattern TEXT NOT NULL,                     -- подстрока описания (без учёта регистра)
    category_id INTEGER NOT NULL REFERENCES categories(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS pending_connections (
    reference TEXT PRIMARY KEY,                -- наш id, банк вернёт его в ?ref=
    provider TEXT NOT NULL,
    connection_id TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_tx_date ON transactions(date);
"""

DEFAULT_CATEGORIES = [
    ("Зарплата", "income", "#2e9e5b"),
    ("Переводы входящие", "income", "#5fb98a"),
    ("Прочие доходы", "income", "#9bd4b3"),
    ("Продукты", "expense", "#e0703b"),
    ("Кафе и рестораны", "expense", "#d94f70"),
    ("Транспорт", "expense", "#3b7be0"),
    ("Жильё и ЖКХ", "expense", "#8a5cd1"),
    ("Связь и интернет", "expense", "#3bb3c4"),
    ("Здоровье", "expense", "#c43b3b"),
    ("Развлечения", "expense", "#e0b03b"),
    ("Покупки", "expense", "#a0703b"),
    ("Переводы исходящие", "expense", "#7a7a7a"),
    ("Прочие расходы", "expense", "#b0b0b0"),
]

DEFAULT_RULES = {
    "Продукты": ["пятёрочка", "пятерочка", "перекрёсток", "перекресток", "магнит", "лента", "ашан",
                 "вкусвилл", "дикси", "metro", "spar", "supermarket", "grocery", "lidl", "aldi", "tesco"],
    "Кафе и рестораны": ["кафе", "ресторан", "кофе", "coffee", "cafe", "restaurant", "burger",
                         "макдоналдс", "kfc", "вкусно и точка", "starbucks", "pizza", "пицц"],
    "Транспорт": ["метро", "яндекс go", "yandex go", "такси", "taxi", "uber", "bolt", "азс",
                  "лукойл", "газпромнефть", "роснефть", "shell", "ржд", "аэрофлот", "тройка"],
    "Жильё и ЖКХ": ["жкх", "аренда", "квартплата", "мосэнергосбыт", "rent", "electricity"],
    "Связь и интернет": ["мтс", "билайн", "мегафон", "теле2", "ростелеком", "mobile", "internet"],
    "Здоровье": ["аптека", "pharmacy", "клиника", "стоматолог", "invitro", "здоровье"],
    "Развлечения": ["кино", "netflix", "spotify", "кинопоиск", "steam", "театр", "cinema"],
    "Покупки": ["zara", "h&m", "uniqlo", "wildberries", "ozon", "lamoda"],
    "Зарплата": ["зарплата", "заработная плата", "salary", "аванс"],
    "Переводы входящие": ["входящий перевод", "пополнение"],
    "Переводы исходящие": ["перевод по сбп", "перевод на карту", "исходящий перевод", "внешний перевод"],
}


def connect() -> sqlite3.Connection:
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    # встроенный LOWER() в SQLite понимает только латиницу — регистрируем юникодный вариант
    conn.create_function("ulower", 1, lambda s: s.lower() if isinstance(s, str) else s, deterministic=True)
    conn.execute("PRAGMA foreign_keys = ON")
    return conn


@contextmanager
def get_conn():
    conn = connect()
    try:
        yield conn
        conn.commit()
    except Exception:
        conn.rollback()
        raise
    finally:
        conn.close()


def init_db() -> None:
    with get_conn() as conn:
        conn.executescript(SCHEMA)
        if conn.execute("SELECT COUNT(*) FROM categories").fetchone()[0] == 0:
            conn.executemany("INSERT INTO categories (name, kind, color) VALUES (?, ?, ?)", DEFAULT_CATEGORIES)
            ids = {r["name"]: r["id"] for r in conn.execute("SELECT id, name FROM categories")}
            conn.executemany(
                "INSERT INTO rules (pattern, category_id) VALUES (?, ?)",
                [(p, ids[cat]) for cat, patterns in DEFAULT_RULES.items() for p in patterns],
            )
