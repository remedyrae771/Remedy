"""Remedy — учёт доходов и расходов с синхронизацией с банком. HTTP API + веб-интерфейс."""
import asyncio
import logging
import os
import uuid
from contextlib import asynccontextmanager
from datetime import date
from typing import Optional

from fastapi import FastAPI, File, Form, HTTPException, Query, Request, UploadFile
from fastapi.responses import FileResponse, RedirectResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, Field

from . import db
from .banks import BankError, available_providers, get_provider
from .banks.importers import parse_statement
from .categorize import categorize, load_rules
from .sync import link_connection, save_transactions, sync_account

log = logging.getLogger("remedy")
FRONTEND_DIR = os.path.join(os.path.dirname(__file__), "..", "frontend")
AUTO_SYNC_HOURS = float(os.environ.get("REMEDY_AUTO_SYNC_HOURS", "6"))
DEFAULT_CURRENCY = os.environ.get("REMEDY_CURRENCY", "KZT").upper()


def sync_all() -> dict:
    results = {}
    with db.get_conn() as conn:
        ids = [r["id"] for r in conn.execute("SELECT id FROM accounts WHERE provider NOT IN ('manual', 'file')")]
    for account_id in ids:
        try:
            with db.get_conn() as conn:
                results[account_id] = sync_account(conn, account_id)
        except Exception as e:  # один сломанный банк не должен останавливать остальные
            log.warning("Синхронизация счёта %s не удалась: %s", account_id, e)
            results[account_id] = f"ошибка: {e}"
    return results


async def auto_sync_loop():
    while True:
        await asyncio.sleep(AUTO_SYNC_HOURS * 3600)
        await asyncio.to_thread(sync_all)


@asynccontextmanager
async def lifespan(app: FastAPI):
    db.init_db()
    task = asyncio.create_task(auto_sync_loop()) if AUTO_SYNC_HOURS > 0 else None
    yield
    if task:
        task.cancel()


app = FastAPI(title="Remedy — учёт финансов", lifespan=lifespan)


def bank_error(e: Exception) -> HTTPException:
    return HTTPException(status_code=502 if isinstance(e, BankError) else 400, detail=str(e))


# --- Модели ------------------------------------------------------------------------------
class AccountIn(BaseModel):
    name: str = Field(min_length=1)
    currency: str = DEFAULT_CURRENCY


class TransactionIn(BaseModel):
    account_id: int
    date: date
    amount: float
    description: str = ""
    category_id: Optional[int] = None


class TransactionPatch(BaseModel):
    category_id: Optional[int] = None
    description: Optional[str] = None
    remember: bool = False   # создать правило «описание → категория» и применить к похожим


class CategoryIn(BaseModel):
    name: str = Field(min_length=1)
    kind: str = Field(pattern="^(income|expense)$")
    color: str = "#888888"


class RuleIn(BaseModel):
    pattern: str = Field(min_length=2)
    category_id: int


class ConnectIn(BaseModel):
    institution_id: str


# --- Категории и правила ----------------------------------------------------------------
@app.get("/api/categories")
def list_categories():
    with db.get_conn() as conn:
        return [dict(r) for r in conn.execute("SELECT * FROM categories ORDER BY kind DESC, name")]


@app.post("/api/categories")
def create_category(c: CategoryIn):
    with db.get_conn() as conn:
        try:
            cur = conn.execute("INSERT INTO categories (name, kind, color) VALUES (?, ?, ?)", (c.name, c.kind, c.color))
        except db.sqlite3.IntegrityError:
            raise HTTPException(409, "Такая категория уже есть")
        return {"id": cur.lastrowid, **c.model_dump()}


@app.delete("/api/categories/{category_id}")
def delete_category(category_id: int):
    with db.get_conn() as conn:
        conn.execute("DELETE FROM categories WHERE id = ?", (category_id,))
    return {"ok": True}


@app.get("/api/rules")
def list_rules():
    with db.get_conn() as conn:
        return [dict(r) for r in conn.execute(
            "SELECT r.id, r.pattern, r.category_id, c.name AS category FROM rules r"
            " JOIN categories c ON c.id = r.category_id ORDER BY c.name, r.pattern")]


@app.post("/api/rules")
def create_rule(r: RuleIn):
    with db.get_conn() as conn:
        cur = conn.execute("INSERT INTO rules (pattern, category_id) VALUES (?, ?)", (r.pattern.lower(), r.category_id))
        return {"id": cur.lastrowid}


@app.delete("/api/rules/{rule_id}")
def delete_rule(rule_id: int):
    with db.get_conn() as conn:
        conn.execute("DELETE FROM rules WHERE id = ?", (rule_id,))
    return {"ok": True}


@app.post("/api/recategorize")
def recategorize():
    """Применить правила заново ко всем операциям."""
    with db.get_conn() as conn:
        rows = conn.execute("SELECT id, description, amount FROM transactions").fetchall()
        rules = load_rules(conn)
        for r in rows:
            conn.execute("UPDATE transactions SET category_id = ? WHERE id = ?",
                         (categorize(conn, r["description"], r["amount"], rules), r["id"]))
    return {"updated": len(rows)}


# --- Счета -------------------------------------------------------------------------------
@app.get("/api/accounts")
def list_accounts():
    with db.get_conn() as conn:
        return [dict(r) for r in conn.execute(
            "SELECT a.*, COALESCE(SUM(t.amount), 0) AS balance, COUNT(t.id) AS tx_count FROM accounts a"
            " LEFT JOIN transactions t ON t.account_id = a.id GROUP BY a.id ORDER BY a.id")]


@app.post("/api/accounts")
def create_account(a: AccountIn):
    with db.get_conn() as conn:
        cur = conn.execute("INSERT INTO accounts (name, currency) VALUES (?, ?)", (a.name, a.currency.upper()))
        return {"id": cur.lastrowid}


@app.delete("/api/accounts/{account_id}")
def delete_account(account_id: int):
    with db.get_conn() as conn:
        conn.execute("DELETE FROM accounts WHERE id = ?", (account_id,))
    return {"ok": True}


@app.post("/api/accounts/{account_id}/sync")
def sync_one(account_id: int):
    try:
        with db.get_conn() as conn:
            return {"added": sync_account(conn, account_id)}
    except (BankError, ValueError) as e:
        raise bank_error(e)


@app.post("/api/sync")
def sync_everything():
    return {"results": sync_all()}


# --- Операции ----------------------------------------------------------------------------
@app.get("/api/transactions")
def list_transactions(
    date_from: Optional[date] = Query(None, alias="from"),
    date_to: Optional[date] = Query(None, alias="to"),
    account_id: Optional[int] = None,
    category_id: Optional[int] = None,
    kind: Optional[str] = Query(None, pattern="^(income|expense)$"),
    q: Optional[str] = None,
    limit: int = Query(500, le=5000),
):
    sql = ("SELECT t.*, a.name AS account, a.currency, c.name AS category, c.color FROM transactions t"
           " JOIN accounts a ON a.id = t.account_id LEFT JOIN categories c ON c.id = t.category_id WHERE 1=1")
    args: list = []
    if date_from:
        sql += " AND t.date >= ?"; args.append(date_from.isoformat())
    if date_to:
        sql += " AND t.date <= ?"; args.append(date_to.isoformat())
    if account_id:
        sql += " AND t.account_id = ?"; args.append(account_id)
    if category_id:
        sql += " AND t.category_id = ?"; args.append(category_id)
    if kind:
        sql += " AND t.amount > 0" if kind == "income" else " AND t.amount < 0"
    if q:
        sql += " AND instr(ulower(t.description), ?) > 0"; args.append(q.lower())
    sql += " ORDER BY t.date DESC, t.id DESC LIMIT ?"
    args.append(limit)
    with db.get_conn() as conn:
        return [dict(r) for r in conn.execute(sql, args)]


@app.post("/api/transactions")
def create_transaction(t: TransactionIn):
    with db.get_conn() as conn:
        if not conn.execute("SELECT 1 FROM accounts WHERE id = ?", (t.account_id,)).fetchone():
            raise HTTPException(404, "Счёт не найден")
        category = t.category_id or categorize(conn, t.description, t.amount)
        cur = conn.execute(
            "INSERT INTO transactions (account_id, date, amount, description, category_id) VALUES (?, ?, ?, ?, ?)",
            (t.account_id, t.date.isoformat(), round(t.amount, 2), t.description, category))
        return {"id": cur.lastrowid}


@app.patch("/api/transactions/{tx_id}")
def update_transaction(tx_id: int, p: TransactionPatch):
    with db.get_conn() as conn:
        tx = conn.execute("SELECT * FROM transactions WHERE id = ?", (tx_id,)).fetchone()
        if not tx:
            raise HTTPException(404, "Операция не найдена")
        if p.description is not None:
            conn.execute("UPDATE transactions SET description = ? WHERE id = ?", (p.description, tx_id))
        updated = 1
        if p.category_id is not None:
            conn.execute("UPDATE transactions SET category_id = ? WHERE id = ?", (p.category_id, tx_id))
            pattern = (p.description if p.description is not None else tx["description"]).strip().lower()
            if p.remember and len(pattern) >= 2:
                conn.execute("INSERT INTO rules (pattern, category_id) VALUES (?, ?)", (pattern, p.category_id))
                sign = "> 0" if tx["amount"] > 0 else "< 0"
                cur = conn.execute(
                    f"UPDATE transactions SET category_id = ? WHERE instr(ulower(description), ?) > 0 AND amount {sign}",
                    (p.category_id, pattern))
                updated = max(cur.rowcount, 1)
        return {"ok": True, "updated": updated}


@app.delete("/api/transactions/{tx_id}")
def delete_transaction(tx_id: int):
    with db.get_conn() as conn:
        conn.execute("DELETE FROM transactions WHERE id = ?", (tx_id,))
    return {"ok": True}


# --- Отчёты ------------------------------------------------------------------------------
@app.get("/api/summary")
def summary(date_from: Optional[date] = Query(None, alias="from"),
            date_to: Optional[date] = Query(None, alias="to"),
            account_id: Optional[int] = None):
    where, args = " WHERE 1=1", []
    if date_from:
        where += " AND t.date >= ?"; args.append(date_from.isoformat())
    if date_to:
        where += " AND t.date <= ?"; args.append(date_to.isoformat())
    if account_id:
        where += " AND t.account_id = ?"; args.append(account_id)
    with db.get_conn() as conn:
        totals = conn.execute(
            "SELECT COALESCE(SUM(CASE WHEN amount > 0 THEN amount END), 0) AS income,"
            " COALESCE(-SUM(CASE WHEN amount < 0 THEN amount END), 0) AS expense FROM transactions t" + where,
            args).fetchone()
        by_category = conn.execute(
            "SELECT c.id, COALESCE(c.name, 'Без категории') AS name, COALESCE(c.color, '#cccccc') AS color,"
            " CASE WHEN t.amount > 0 THEN 'income' ELSE 'expense' END AS kind, ABS(SUM(t.amount)) AS total"
            " FROM transactions t LEFT JOIN categories c ON c.id = t.category_id" + where +
            " GROUP BY c.id, kind ORDER BY total DESC", args).fetchall()
        by_month = conn.execute(
            "SELECT SUBSTR(t.date, 1, 7) AS month,"
            " COALESCE(SUM(CASE WHEN amount > 0 THEN amount END), 0) AS income,"
            " COALESCE(-SUM(CASE WHEN amount < 0 THEN amount END), 0) AS expense"
            " FROM transactions t" + where + " GROUP BY month ORDER BY month", args).fetchall()
    return {
        "income": round(totals["income"], 2),
        "expense": round(totals["expense"], 2),
        "net": round(totals["income"] - totals["expense"], 2),
        "by_category": [dict(r) for r in by_category],
        "by_month": [dict(r) for r in by_month],
    }


# --- Банки -------------------------------------------------------------------------------
@app.get("/api/banks/providers")
def providers():
    return available_providers()


@app.get("/api/banks/{provider}/institutions")
def institutions(provider: str, country: str = "DE"):
    try:
        return [i.__dict__ for i in get_provider(provider).list_institutions(country)]
    except BankError as e:
        raise bank_error(e)


@app.post("/api/banks/{provider}/connect")
def connect(provider: str, body: ConnectIn, request: Request):
    """Создаёт подключение и возвращает ссылку, по которой пользователь входит в свой банк."""
    reference = uuid.uuid4().hex
    redirect = str(request.url_for("bank_callback"))
    try:
        c = get_provider(provider).create_connection(body.institution_id, redirect, reference)
    except BankError as e:
        raise bank_error(e)
    with db.get_conn() as conn:
        conn.execute("INSERT INTO pending_connections (reference, provider, connection_id) VALUES (?, ?, ?)",
                     (reference, provider, c.id))
    return {"link": c.link}


@app.get("/api/banks/callback", name="bank_callback")
def bank_callback(ref: str, error: Optional[str] = None):
    """Сюда банк возвращает пользователя после подтверждения доступа."""
    if error:
        return RedirectResponse(f"/?bank_error={error}")
    with db.get_conn() as conn:
        pending = conn.execute("SELECT * FROM pending_connections WHERE reference = ?", (ref,)).fetchone()
        if not pending:
            return RedirectResponse("/?bank_error=unknown_reference")
        try:
            ids = link_connection(conn, pending["provider"], pending["connection_id"])
        except BankError as e:
            log.warning("Не удалось привязать счета: %s", e)
            return RedirectResponse("/?bank_error=link_failed")
        conn.execute("DELETE FROM pending_connections WHERE reference = ?", (ref,))
    return RedirectResponse(f"/?bank_linked={len(ids)}")


# --- Импорт выписки ----------------------------------------------------------------------
@app.post("/api/import")
async def import_statement(file: UploadFile = File(...),
                           account_id: Optional[int] = Form(None),
                           account_name: Optional[str] = Form(None)):
    data = await file.read()
    try:
        txs, currency = parse_statement(file.filename or "", data)
    except BankError as e:
        raise HTTPException(400, str(e))
    is_pdf = (file.filename or "").lower().endswith(".pdf") or data[:5] == b"%PDF-"
    with db.get_conn() as conn:
        if not account_id:
            name = account_name or ("Kaspi Gold" if is_pdf else os.path.splitext(file.filename or "Выписка")[0])
            account_id = conn.execute("INSERT INTO accounts (name, provider, currency) VALUES (?, 'file', ?)",
                                      (name, currency or DEFAULT_CURRENCY)).lastrowid
        elif not conn.execute("SELECT 1 FROM accounts WHERE id = ?", (account_id,)).fetchone():
            raise HTTPException(404, "Счёт не найден")
        added = save_transactions(conn, account_id, txs)
    return {"account_id": account_id, "parsed": len(txs), "added": added}


# --- Фронтенд ----------------------------------------------------------------------------
app.mount("/static", StaticFiles(directory=FRONTEND_DIR), name="static")


@app.get("/")
def index():
    return FileResponse(os.path.join(FRONTEND_DIR, "index.html"))
