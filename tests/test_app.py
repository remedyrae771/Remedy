import io

import httpx
import pytest
from fastapi.testclient import TestClient

from app import db
from app.banks import set_provider
from app.banks.gocardless import GoCardlessProvider
from app.banks.importers import parse_amount, parse_csv, parse_ofx


@pytest.fixture
def client(tmp_path, monkeypatch):
    monkeypatch.setattr(db, "DB_PATH", str(tmp_path / "test.db"))
    from app.main import app
    with TestClient(app) as c:
        yield c


def test_parse_amount():
    assert parse_amount("-1 234,56") == -1234.56
    assert parse_amount("1,234.50") == 1234.5
    assert parse_amount("+500 ₽") == 500
    assert parse_amount("") is None


TBANK_CSV = (
    '"Дата операции";"Дата платежа";"Номер карты";"Статус";"Сумма операции";"Валюта операции";'
    '"Сумма платежа";"Валюта платежа";"Кэшбэк";"Категория";"MCC";"Описание"\n'
    '"01.11.2026 12:30:00";"01.11.2026";"*1234";"OK";"-1250,50";"RUB";"-1250,50";"RUB";"";"Супермаркеты";"5411";"Пятёрочка"\n'
    '"02.11.2026 09:00:00";"02.11.2026";"";"OK";"80000,00";"RUB";"80000,00";"RUB";"";"Пополнения";"";"Зарплата"\n'
    '"03.11.2026 10:00:00";"03.11.2026";"*1234";"FAILED";"-500,00";"RUB";"-500,00";"RUB";"";"Такси";"4121";"Яндекс Go"\n'
).encode("cp1251")


def test_parse_tbank_csv():
    txs = parse_csv(TBANK_CSV)
    assert [(t.date, t.amount) for t in txs] == [("2026-11-01", -1250.5), ("2026-11-02", 80000.0)]
    assert "Пятёрочка" in txs[0].description


def test_parse_ofx():
    ofx = b"""OFXHEADER:100
<OFX><BANKMSGSRSV1><STMTTRNRS><STMTRS><BANKTRANLIST>
<STMTTRN><TRNTYPE>DEBIT<DTPOSTED>20261105120000<TRNAMT>-42.10<FITID>abc1<NAME>LIDL<MEMO>Card
<STMTTRN><TRNTYPE>CREDIT<DTPOSTED>20261106<TRNAMT>1000.00<FITID>abc2<NAME>Salary
</BANKTRANLIST></STMTRS></STMTTRNRS></BANKMSGSRSV1></OFX>"""
    txs = parse_ofx(ofx)
    assert [(t.external_id, t.date, t.amount) for t in txs] == [("abc1", "2026-11-05", -42.1), ("abc2", "2026-11-06", 1000.0)]


def test_import_is_idempotent_and_categorized(client):
    files = {"file": ("tbank.csv", TBANK_CSV, "text/csv")}
    r = client.post("/api/import", files=files).json()
    assert r["added"] == 2
    r2 = client.post("/api/import", files=files, data={"account_id": r["account_id"]}).json()
    assert r2["added"] == 0
    txs = client.get("/api/transactions").json()
    cats = {t["description"].split(" (")[0]: t["category"] for t in txs}
    assert cats["Пятёрочка"] == "Продукты"
    assert cats["Зарплата"] == "Зарплата"
    s = client.get("/api/summary").json()
    assert s["income"] == 80000 and s["expense"] == 1250.5


def test_demo_bank_flow(client):
    r = client.post("/api/banks/demo/connect", json={"institution_id": "DEMO_BANK"}).json()
    callback = r["link"].split("testserver", 1)[1]
    resp = client.get(callback, follow_redirects=False)
    assert resp.status_code == 307 and "bank_linked=2" in resp.headers["location"]
    accounts = client.get("/api/accounts").json()
    assert len(accounts) == 2 and all(a["tx_count"] > 0 for a in accounts)
    total = sum(a["tx_count"] for a in accounts)
    # повторная синхронизация не создаёт дублей
    client.post("/api/sync")
    assert sum(a["tx_count"] for a in client.get("/api/accounts").json()) == total


def test_manual_transaction_and_rule(client):
    acc = client.post("/api/accounts", json={"name": "Наличные"}).json()["id"]
    cats = {c["name"]: c["id"] for c in client.get("/api/categories").json()}
    t1 = client.post("/api/transactions", json={"account_id": acc, "date": "2026-11-01", "amount": -300, "description": "Шаурма у дома"}).json()["id"]
    client.post("/api/transactions", json={"account_id": acc, "date": "2026-11-02", "amount": -350, "description": "Шаурма у дома"})
    r = client.patch(f"/api/transactions/{t1}", json={"category_id": cats["Кафе и рестораны"], "remember": True}).json()
    assert r["updated"] == 2
    t3 = client.post("/api/transactions", json={"account_id": acc, "date": "2026-11-03", "amount": -320, "description": "ШАУРМА У ДОМА"}).json()["id"]
    tx = next(t for t in client.get("/api/transactions").json() if t["id"] == t3)
    assert tx["category"] == "Кафе и рестораны"


def test_gocardless_provider_with_mock():
    def handler(req: httpx.Request):
        p = req.url.path
        if p.endswith("/token/new/"):
            return httpx.Response(200, json={"access": "tok", "access_expires": 86400})
        assert req.headers["authorization"] == "Bearer tok"
        if p.endswith("/requisitions/req1/"):
            return httpx.Response(200, json={"status": "LN", "accounts": ["acc1"]})
        if p.endswith("/accounts/acc1/details/"):
            return httpx.Response(200, json={"account": {"currency": "EUR", "name": "Girokonto"}})
        if p.endswith("/accounts/acc1/transactions/"):
            return httpx.Response(200, json={"transactions": {"booked": [
                {"transactionId": "t1", "bookingDate": "2026-11-01", "transactionAmount": {"amount": "-12.50", "currency": "EUR"},
                 "creditorName": "REWE", "remittanceInformationUnstructured": "Kartenzahlung"},
            ], "pending": []}})
        return httpx.Response(404, json={"detail": "not found"})

    client = httpx.Client(base_url="https://gc.test/api/v2", transport=httpx.MockTransport(handler))
    gc = GoCardlessProvider("id", "key", client=client)
    accs = gc.list_accounts("req1")
    assert accs[0].name == "Girokonto" and accs[0].currency == "EUR"
    txs = gc.fetch_transactions("acc1", "2026-10-01")
    assert txs[0].amount == -12.5 and txs[0].description == "REWE Kartenzahlung"


KASPI_TEXT = """АО «Kaspi Bank», БИК CASPKZKA, www.kaspi.kz
ВЫПИСКА по Kaspi Gold за период с 01.11.26 по 09.11.26
Доступно на 09.11.26                  123 456,78 ₸
Пополнения                         + 300 000,00 ₸
Дата       Сумма              Операция     Детали
01.11.26   - 12 450,00 ₸      Покупки      Magnum Cash&Carry
02.11.26   + 250 000,00 ₸     Пополнение   С Kaspi Депозита
03.11.26   - 5 000,00 ₸       Переводы     Айгерим К.
03.11.26   - 5 000,00 ₸       Переводы     Айгерим К.
04.11.26   - 330,00 ₸         Покупки      ONAY
05.11.26   - 20 000,00 ₸      Снятия       Банкомат Kaspi
"""


def test_parse_kaspi_text():
    from app.banks.kaspi import parse_kaspi_text
    txs, currency = parse_kaspi_text(KASPI_TEXT)
    assert currency == "KZT"
    assert [(t.date, t.amount) for t in txs] == [
        ("2026-11-01", -12450.0), ("2026-11-02", 250000.0), ("2026-11-03", -5000.0),
        ("2026-11-03", -5000.0), ("2026-11-04", -330.0), ("2026-11-05", -20000.0)]
    assert txs[0].description == "Покупки: Magnum Cash&Carry"
    assert txs[2].external_id != txs[3].external_id  # два одинаковых перевода — не дубль


def _kaspi_pdf() -> bytes:
    """PDF, свёрстанный как выписка Kaspi: каждая колонка — отдельный текстовый блок."""
    canvas_mod = pytest.importorskip("reportlab.pdfgen.canvas")
    from reportlab.pdfbase import pdfmetrics
    from reportlab.pdfbase.ttfonts import TTFont
    font = "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf"
    import os
    if not os.path.exists(font):
        pytest.skip("нет шрифта с кириллицей")
    pdfmetrics.registerFont(TTFont("DejaVu", font))
    buf = io.BytesIO()
    c = canvas_mod.Canvas(buf)
    c.setFont("DejaVu", 9)
    c.drawString(40, 800, "АО «Kaspi Bank» ВЫПИСКА по Kaspi Gold")
    y = 760
    for line in KASPI_TEXT.splitlines()[5:]:
        date, rest = line[:10].strip(), line[11:]
        amount, op, details = rest[:18].strip(), rest[19:31].strip(), rest[31:].strip()
        for x, val in ((40, date), (110, amount), (220, op), (300, details)):
            c.drawString(x, y, val)
        y -= 16
    c.save()
    return buf.getvalue()


def test_kaspi_pdf_import(client):
    r = client.post("/api/import", files={"file": ("kaspi_gold.pdf", _kaspi_pdf(), "application/pdf")})
    assert r.status_code == 200, r.text
    assert r.json()["added"] == 6
    acc = client.get("/api/accounts").json()[0]
    assert acc["name"] == "Kaspi Gold" and acc["currency"] == "KZT"
    cats = {t["description"]: t["category"] for t in client.get("/api/transactions").json()}
    assert cats["Покупки: Magnum Cash&Carry"] == "Продукты"
    assert cats["Покупки: ONAY"] == "Транспорт"
    assert cats["Пополнение: С Kaspi Депозита"] == "Переводы входящие"
    assert cats["Переводы: Айгерим К."] == "Переводы исходящие"
    # повторная загрузка той же выписки
    assert client.post("/api/import", files={"file": ("k.pdf", _kaspi_pdf(), "application/pdf")},
                       data={"account_id": acc["id"]}).json()["added"] == 0


def test_bad_pdf(client):
    r = client.post("/api/import", files={"file": ("x.pdf", b"%PDF-1.4 garbage", "application/pdf")})
    assert r.status_code == 400


def test_kaspi_salary_beats_generic_topup(client):
    acc = client.post("/api/accounts", json={"name": "Kaspi Gold"}).json()["id"]
    client.post("/api/transactions", json={"account_id": acc, "date": "2026-11-05", "amount": 450000,
                                           "description": "Пополнение: Зарплата ТОО Алем"})
    assert client.get("/api/transactions").json()[0]["category"] == "Зарплата"


def test_tips_without_any_money_data(client):
    """Пустое приложение: советы есть, все общие, без повторов, пока не покажутся все."""
    seen, ids = [], set()
    for _ in range(200):
        t = client.get("/api/tip", params={"seen": ",".join(seen)}).json()
        assert t["title"] and t["text"] and t["kind"] == "general" and t["has_data"] is False
        if t["reset"]:
            break
        assert t["id"] not in ids  # пока не показаны все — без повторов
        ids.add(t["id"])
        seen.append(t["id"])
    assert len(ids) >= 90
    assert t["reset"]  # круг начался заново

    d = client.get("/api/tips").json()
    assert d["has_data"] is False and d["personal"] == []
    assert len(d["general"]) >= 90 and len(d["topics"]) >= 8
    assert all(t["topic"] in d["topics"] for t in d["general"])


def test_personal_tips_from_data(tmp_path, monkeypatch):
    from datetime import date
    from app.tips import personal_tips
    monkeypatch.setattr(db, "DB_PATH", str(tmp_path / "t.db"))
    db.init_db()
    with db.get_conn() as conn:
        acc = conn.execute("INSERT INTO accounts (name) VALUES ('Kaspi Gold')").lastrowid
        cats = {r["name"]: r["id"] for r in conn.execute("SELECT id, name FROM categories")}
        rows = [("2026-09-05", 400000, "Зарплата"), ("2026-10-05", 400000, "Зарплата"),
                ("2026-09-15", -4990, "Платежи: Kcell"), ("2026-10-15", -4990, "Платежи: Kcell"),
                ("2026-10-08", -380000, "Аренда")]
        rows += [(f"2026-10-{d:02d}", -3000, "Покупки: Glovo") for d in range(10, 22)]
        rows += [(f"2026-11-{d:02d}", -9000, "Покупки: Glovo") for d in range(1, 9)]
        rows += [("2026-10-03", -4000, "Покупки: Glovo")]
        for d, a, desc in rows:
            cat = "Кафе и рестораны" if "Glovo" in desc else ("Зарплата" if a > 0 else "Прочие расходы")
            conn.execute("INSERT INTO transactions (account_id, date, amount, description, category_id) VALUES (?,?,?,?,?)",
                         (acc, d, a, desc, cats[cat]))
        tips = {t["id"].split(":")[0]: t for t in personal_tips(conn, date(2026, 11, 10))}
    assert "savings-neg" in tips                     # в октябре расходы больше доходов
    assert "growth-Кафе и рестораны" in tips         # кафе выросли
    assert "cafe-count" in tips and "13 заказов" in tips["cafe-count"]["title"]
    assert "subs" in tips and "Kcell" in tips["subs"]["text"]
    assert "cushion" in tips


def test_env_new_and_old_names(monkeypatch):
    monkeypatch.delenv("AQSHA_CURRENCY", raising=False)
    monkeypatch.setenv("REMEDY_CURRENCY", "RUB")
    assert db.env("CURRENCY") == "RUB"           # старое имя ещё работает
    monkeypatch.setenv("AQSHA_CURRENCY", "KZT")
    assert db.env("CURRENCY") == "KZT"           # новое имя важнее


def test_icons_are_served(client):
    html = client.get("/").text
    assert "/static/icons/icon.svg" in html and "apple-touch-icon" in html and "manifest.json" in html
    for path in ["/static/icons/icon.svg", "/static/icons/apple-touch-icon.png", "/static/icons/icon-192.png",
                 "/static/icons/icon-512.png", "/static/icons/icon-maskable-512.png", "/static/manifest.json", "/favicon.ico"]:
        assert client.get(path).status_code == 200, path
    m = client.get("/static/manifest.json").json()
    assert m["short_name"] == "Aqsha" and len(m["icons"]) == 3


def test_parse_notification_variants():
    from datetime import date
    from app.ingest import parse_notification as pn, parse_quick as pq
    T = date(2026, 11, 10)
    p = pn("Kaspi Gold *1234. Покупка: 1 850 ₸, Coffee Boom. Доступно: 98 000 ₸", T)
    assert (p.amount, p.description, p.date) == (-1850.0, "Покупка: Coffee Boom", "2026-11-10")
    assert pn("Пополнение 450 000 ₸ от ТОО Алем. Доступно 543 000 ₸", T).amount == 450000
    assert pn("Вам перевели 15 000 ₸ от Даурен С.", T).amount == 15000
    assert pn("Возврат 3 200 ₸ Wildberries", T).amount == 3200
    assert pn("Оплата 4 990 ₸ Kcell 09.11.26", T).date == "2026-11-09"
    assert pn("Доступно 50 000 ₸", T) is None and pn("Привет", T) is None
    assert pq("кофе 1500", T).amount == -1500 and pq("1500 кофе", T).description == "кофе"
    assert pq("+450000 зарплата", T).amount == 450000 and pq("зарплата 300000", T).amount == 300000
    assert pq("такси 1 200 ₸", T).amount == -1200 and pq("просто текст", T) is None


def test_push_ingest_flow_and_merge_with_statement(client):
    cfg = client.get("/api/ingest/config").json()
    token = cfg["token"]
    assert cfg["url"].endswith(f"/api/ingest?token={token}") and cfg["account"] == "Kaspi Gold"
    assert client.post("/api/ingest?token=wrong", json={"text": "Покупка 100 ₸ X"}).status_code == 403

    # Android: текст уведомления (JSON, форма и просто текст)
    r = client.post(f"/api/ingest?token={token}", json={"text": "Покупка 12 450 ₸ Magnum Cash&Carry. Доступно 90 000 ₸"}).json()
    assert r["saved"] and r["amount"] == -12450 and r["category"] == "Продукты"
    # то же уведомление пришло второй раз — дубля нет
    assert client.post(f"/api/ingest?token={token}", json={"text": "Покупка 12 450 ₸ Magnum Cash&Carry. Доступно 90 000 ₸"}).json()["duplicate"]
    assert client.post(f"/api/ingest?token={token}", data={"text": "Покупка 330 ₸ ONAY"}).json()["category"] == "Транспорт"
    assert client.post("/api/ingest", content="Перевод 5 000 ₸ Айгерим К.".encode(),
                       headers={"X-Aqsha-Token": token, "Content-Type": "text/plain"}).json()["amount"] == -5000
    # iPhone: Apple Wallet присылает сумму и продавца отдельно
    r = client.post(f"/api/ingest?token={token}", json={"amount": "₸1,250.00", "merchant": "Coffee Boom"}).json()
    assert r["amount"] == -1250 and r["description"] == "Покупка: Coffee Boom"
    assert client.post(f"/api/ingest?token={token}", json={"text": "Привет"}).status_code == 422

    # быстрый ввод
    q = client.post("/api/quick", json={"text": "такси 2 000"}).json()
    assert q["amount"] == -2000

    # пользователь поправил категорию у операции из уведомления
    cats = {c["name"]: c["id"] for c in client.get("/api/categories").json()}
    magnum = next(t for t in client.get("/api/transactions").json() if t["amount"] == -12450)
    client.patch(f"/api/transactions/{magnum['id']}", json={"category_id": cats["Кафе и рестораны"]})

    before = len(client.get("/api/transactions").json())
    assert before == 5
    # в конце месяца — выписка Kaspi с теми же покупками
    from datetime import date
    d = date.today().strftime("%d.%m.%y")
    pdf_text = (f"АО «Kaspi Bank» ВЫПИСКА\n{d}   - 12 450,00 ₸   Покупки   Magnum Cash&Carry\n"
                f"{d}   - 330,00 ₸   Покупки   ONAY\n{d}   - 7 000,00 ₸   Покупки   Galmart\n")
    from app.banks.kaspi import parse_kaspi_text
    from app.sync import save_transactions
    txs, _ = parse_kaspi_text(pdf_text)
    with db.get_conn() as conn:
        added = save_transactions(conn, cfg["account_id"] or r["account_id"], txs)
    assert added == 1  # новая только Galmart, две другие слились с уведомлениями
    after = client.get("/api/transactions").json()
    assert len(after) == before + 1
    merged = next(t for t in after if t["amount"] == -12450)
    assert merged["description"] == "Покупки: Magnum Cash&Carry"   # описание из выписки
    assert merged["category"] == "Кафе и рестораны"                # ручная категория сохранилась
    # повторный импорт той же выписки ничего не добавляет
    with db.get_conn() as conn:
        assert save_transactions(conn, r["account_id"], txs) == 0
    assert client.post("/api/ingest/token/reset").json()["ok"]
    assert client.get("/api/ingest/config").json()["token"] != token


def test_literacy_cases_are_complete_and_numbers_add_up():
    from app.literacy_library import CASES, QUIZ
    ids = [c["id"] for c in CASES]
    assert len(CASES) == 10 and len(set(ids)) == len(ids)
    for c in CASES:
        assert c["title"] and c["story"] and c["result"] and len(c["signs"]) >= 3 and len(c["steps"]) >= 4
        for label, target in c["actions"]:
            assert target in ("add", "overview") or target.startswith(("acc:", "more#", "tips:")), target
    assert all(q[2] in ids and q[1] in ("yes", "no") for q in QUIZ)
    # арифметика в историях
    assert 350_000 - (120_000 + 80_000 + 25_000) == 125_000            # от зарплаты до зарплаты
    assert round(150_000 / 400_000 * 100) in (37, 38) and 400_000 * 0.2 == 80_000   # рассрочки
    assert 3 * 420_000 == 1_260_000 and 1_260_000 / 60_000 == 21        # подушка
    assert 680_000 - 80_000 - 40_000 == 560_000 and 600_000 - 560_000 == 40_000 and 320_000 // 4 == 80_000  # траты > доходов
    assert round(400_000 / 220_000) == 2                                # потеря работы
    assert 4_800_000 / 12 == 400_000                                    # нерегулярный доход
    assert 25_000_000 * 0.2 == 5_000_000 and (5_000_000 - 800_000) / 150_000 == 28  # квартира
