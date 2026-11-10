"""Aqsha — учёт доходов и расходов с синхронизацией с банком. HTTP API + веб-интерфейс."""
import asyncio
import json
import logging
import os
import re
import secrets
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
from .banks.importers import parse_amount, parse_statement
from .categorize import categorize, load_rules
from .sync import link_connection, save_transactions, sync_account
from .ingest import Parsed, parse_notification, parse_quick, push_external_id
from .tips import general_tips, has_data, personal_tips, pick_tip
from .tips_library import TOPICS

log = logging.getLogger("aqsha")
FRONTEND_DIR = os.path.join(os.path.dirname(__file__), "..", "frontend")
AUTO_SYNC_HOURS = float(db.env("AUTO_SYNC_HOURS", "6"))
DEFAULT_CURRENCY = db.env("CURRENCY", "KZT").upper()


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


app = FastAPI(title="Aqsha — учёт финансов", lifespan=lifespan)


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


# --- Советы ------------------------------------------------------------------------------
@app.get("/api/tip")
def tip(seen: str = ""):
    """Случайный финансовый совет. seen — id уже показанных советов через запятую."""
    with db.get_conn() as conn:
        return pick_tip(conn, {s for s in seen.split(",") if s})


@app.get("/api/tips")
def all_tips():
    """Все советы для вкладки «Советы»: личные (если есть операции) и вся подборка по темам."""
    with db.get_conn() as conn:
        return {"has_data": has_data(conn), "personal": personal_tips(conn),
                "topics": TOPICS, "general": general_tips()}


# --- Операции без выписки: уведомления банка, Apple Wallet, быстрый ввод -------------------
def ingest_token(conn) -> str:
    token = db.get_setting(conn, "ingest_token")
    if not token:
        token = secrets.token_urlsafe(18)
        db.set_setting(conn, "ingest_token", token)
    return token


def ingest_account(conn) -> int:
    """Счёт для операций из уведомлений: выбранный в настройках, иначе «Kaspi Gold» (создаётся при необходимости)."""
    chosen = db.get_setting(conn, "ingest_account_id")
    if chosen and conn.execute("SELECT 1 FROM accounts WHERE id = ?", (chosen,)).fetchone():
        return int(chosen)
    row = conn.execute("SELECT id FROM accounts WHERE name LIKE 'Kaspi%' ORDER BY id LIMIT 1").fetchone()
    if row:
        return row["id"]
    return conn.execute("INSERT INTO accounts (name, provider, currency) VALUES ('Kaspi Gold', 'file', ?)",
                        (DEFAULT_CURRENCY,)).lastrowid


def _save_parsed(conn, p, source: str, external_id: Optional[str]) -> dict:
    account_id = ingest_account(conn)
    if external_id and conn.execute("SELECT 1 FROM transactions WHERE external_id = ?", (external_id,)).fetchone():
        return {"saved": False, "duplicate": True, "amount": p.amount, "description": p.description, "date": p.date}
    cur = conn.execute(
        "INSERT INTO transactions (account_id, date, amount, description, category_id, external_id, source)"
        " VALUES (?, ?, ?, ?, ?, ?, ?)",
        (account_id, p.date, p.amount, p.description, categorize(conn, p.description, p.amount), external_id, source))
    cat = conn.execute("SELECT name FROM categories c JOIN transactions t ON t.category_id = c.id WHERE t.id = ?",
                       (cur.lastrowid,)).fetchone()
    return {"saved": True, "id": cur.lastrowid, "amount": p.amount, "description": p.description, "date": p.date,
            "category": cat["name"] if cat else None, "account_id": account_id}


@app.get("/api/ingest/config")
def ingest_config(request: Request):
    with db.get_conn() as conn:
        token = ingest_token(conn)
        account_id = ingest_account(conn)
        name = conn.execute("SELECT name FROM accounts WHERE id = ?", (account_id,)).fetchone()["name"]
        pushed = conn.execute("SELECT COUNT(*) FROM transactions WHERE source = 'push'").fetchone()[0]
    return {"url": str(request.url_for("ingest")) + f"?token={token}", "token": token,
            "account_id": account_id, "account": name, "received": pushed}


@app.post("/api/ingest/token/reset")
def ingest_token_reset():
    with db.get_conn() as conn:
        db.set_setting(conn, "ingest_token", secrets.token_urlsafe(18))
    return {"ok": True}


class IngestAccountIn(BaseModel):
    account_id: int


@app.post("/api/ingest/account")
def ingest_set_account(body: IngestAccountIn):
    with db.get_conn() as conn:
        if not conn.execute("SELECT 1 FROM accounts WHERE id = ?", (body.account_id,)).fetchone():
            raise HTTPException(404, "Счёт не найден")
        db.set_setting(conn, "ingest_account_id", str(body.account_id))
    return {"ok": True}


@app.post("/api/ingest", name="ingest")
async def ingest(request: Request, token: str = ""):
    """Принимает уведомление банка с телефона (MacroDroid/Tasker на Android, «Команды» на iPhone).

    Тело: JSON {"text": "..."} или {"amount": 2500, "merchant": "Magnum"}, форма text=..., или просто текст.
    Ключ: ?token=... или заголовок X-Aqsha-Token.
    """
    token = token or request.headers.get("x-aqsha-token", "")
    raw = (await request.body()).decode("utf-8", errors="replace")
    ctype = request.headers.get("content-type", "")
    data: dict = {}
    if "json" in ctype:
        try:
            data = json.loads(raw or "{}")
            data = data if isinstance(data, dict) else {"text": str(data)}
        except ValueError:
            data = {"text": raw}
    elif "form" in ctype:
        data = dict((await request.form()).items())
    else:
        data = {"text": raw}
    with db.get_conn() as conn:
        if not secrets.compare_digest(token, ingest_token(conn)):
            raise HTTPException(403, "Неверный ключ")
        if data.get("amount") not in (None, ""):
            # Apple Wallet: сумма и магазин приходят отдельно; сумма может быть «₸2 500», «2,500.00»
            value = parse_amount(re.sub(r"[^\d.,\-+−\s]", "", str(data["amount"])))
            merchant = str(data.get("merchant") or data.get("name") or "").strip()
            text = f"wallet|{data['amount']}|{merchant}|{data.get('date', '')}"
            p = Parsed(amount=-abs(value), description=f"Покупка: {merchant}" if merchant else "Покупка",
                       date=date.today().isoformat()) if value else None
        else:
            text = str(data.get("text") or (str(data.get("title", "")) + " " + str(data.get("body", "")))).strip()
            p = parse_notification(text)
        if not p:
            raise HTTPException(422, "Не нашёл в тексте сумму в тенге")
        return _save_parsed(conn, p, "push", push_external_id(text, p.date))


class TextIn(BaseModel):
    text: str = Field(min_length=1, max_length=1000)


@app.post("/api/ingest/preview")
def ingest_preview(body: TextIn):
    """Проверить, как будет разобрано уведомление, ничего не сохраняя."""
    p = parse_notification(body.text)
    if not p:
        raise HTTPException(422, "Не нашёл в тексте сумму в тенге")
    with db.get_conn() as conn:
        cat = categorize(conn, p.description, p.amount)
        name = conn.execute("SELECT name FROM categories WHERE id = ?", (cat,)).fetchone() if cat else None
    return {"amount": p.amount, "description": p.description, "date": p.date, "category": name["name"] if name else None}


@app.post("/api/quick")
def quick_add(body: TextIn):
    """Быстрый ввод из приложения: «кофе 1500», «+450000 зарплата»."""
    p = parse_quick(body.text)
    if not p:
        raise HTTPException(422, "Напишите, например: «кофе 1500» или «+450000 зарплата»")
    with db.get_conn() as conn:
        return _save_parsed(conn, p, "quick", None)


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


@app.get("/favicon.ico", include_in_schema=False)
def favicon():
    # браузеры по старинке запрашивают /favicon.ico — отдаём PNG-иконку
    return FileResponse(os.path.join(FRONTEND_DIR, "icons", "favicon-32.png"), media_type="image/png")


@app.get("/")
def index():
    return FileResponse(os.path.join(FRONTEND_DIR, "index.html"))
