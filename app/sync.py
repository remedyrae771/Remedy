"""Синхронизация: загрузка операций из банка/файла в БД с дедупликацией и категоризацией."""
import sqlite3
from datetime import date, datetime, timedelta, timezone
from typing import Iterable

from .banks import get_provider
from .banks.base import BankTransaction
from .categorize import categorize, load_rules
from .ingest import merge_with_pushed

# при повторной синхронизации берём операции с запасом — банки иногда проводят их задним числом
OVERLAP_DAYS = 5
INITIAL_DAYS = 90


def save_transactions(conn: sqlite3.Connection, account_id: int, txs: Iterable[BankTransaction]) -> int:
    """Сохраняет операции, пропуская уже известные. Возвращает число добавленных."""
    rules = load_rules(conn)
    added = 0
    for t in txs:
        if conn.execute("SELECT 1 FROM transactions WHERE account_id = ? AND external_id = ?",
                        (account_id, t.external_id)).fetchone():
            continue  # уже загружена раньше
        if merge_with_pushed(conn, account_id, t):
            continue  # уже пришла уведомлением — привязали к выписке, дубля нет
        cur = conn.execute(
            "INSERT OR IGNORE INTO transactions (account_id, date, amount, description, category_id, external_id)"
            " VALUES (?, ?, ?, ?, ?, ?)",
            (account_id, t.date, round(t.amount, 2), t.description,
             categorize(conn, t.description, t.amount, rules), t.external_id),
        )
        added += cur.rowcount
    return added


def sync_account(conn: sqlite3.Connection, account_id: int) -> int:
    acc = conn.execute("SELECT * FROM accounts WHERE id = ?", (account_id,)).fetchone()
    if acc is None:
        raise ValueError("Счёт не найден")
    if acc["provider"] in ("manual", "file"):
        return 0
    provider = get_provider(acc["provider"])
    last = conn.execute("SELECT MAX(date) FROM transactions WHERE account_id = ? AND external_id IS NOT NULL",
                        (account_id,)).fetchone()[0]
    if last:
        date_from = (date.fromisoformat(last) - timedelta(days=OVERLAP_DAYS)).isoformat()
    else:
        date_from = (date.today() - timedelta(days=INITIAL_DAYS)).isoformat()
    txs = provider.fetch_transactions(acc["external_id"], date_from)
    added = save_transactions(conn, account_id, txs)
    conn.execute("UPDATE accounts SET last_synced_at = ? WHERE id = ?",
                 (datetime.now(timezone.utc).isoformat(timespec="seconds"), account_id))
    return added


def link_connection(conn: sqlite3.Connection, provider_name: str, connection_id: str) -> list[int]:
    """После авторизации в банке — создаёт счета в БД и сразу их синхронизирует."""
    provider = get_provider(provider_name)
    ids = []
    for a in provider.list_accounts(connection_id):
        conn.execute(
            "INSERT INTO accounts (name, currency, provider, external_id, connection_id) VALUES (?, ?, ?, ?, ?)"
            " ON CONFLICT(provider, external_id) DO UPDATE SET connection_id = excluded.connection_id",
            (a.name, a.currency, provider_name, a.external_id, connection_id),
        )
        row = conn.execute("SELECT id FROM accounts WHERE provider = ? AND external_id = ?",
                           (provider_name, a.external_id)).fetchone()
        ids.append(row["id"])
    for account_id in ids:
        sync_account(conn, account_id)
    return ids
