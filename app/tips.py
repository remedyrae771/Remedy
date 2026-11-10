"""Финансовые советы: личные (по операциям пользователя) и общие (подборка).

Личные советы пересчитываются по данным, поэтому меняются вместе с расходами. Каждый совет имеет
стабильный id — фронтенд запоминает показанные и просит следующий, которого ещё не было.
"""
import random
import sqlite3
from calendar import monthrange
from collections import defaultdict
from datetime import date, timedelta
from typing import Optional


def money(n: float) -> str:
    return f"{round(n):,}".replace(",", "\u00a0") + "\u00a0₸"  # неразрывные пробелы


GENERAL_TIPS = [
    ("💰", "Сначала заплатите себе", "В день зарплаты сразу переводите 10–20% на депозит — до того, как начнёте тратить. "
     "Откладывать «то, что останется в конце месяца», почти никогда не работает."),
    ("🛟", "Подушка безопасности", "Цель — запас на 3–6 месяцев обычных расходов на отдельном счёте. "
     "Он спасает от кредитов, если потеряете работу или понадобится срочный ремонт."),
    ("📊", "Правило 50/30/20", "Попробуйте делить доход так: 50% — обязательные расходы (жильё, еда, транспорт), "
     "30% — желания, 20% — накопления и погашение долгов."),
    ("🧾", "Рассрочка — тоже долг", "Рассрочка 0-0-12 удобна, но несколько рассрочек сразу незаметно съедают "
     "бюджет на месяцы вперёд. Перед новой покупкой сложите все текущие ежемесячные платежи."),
    ("⏳", "Правило 72 часов", "Хочется купить что-то дорогое и незапланированное? Добавьте в корзину и подождите "
     "три дня. Половина таких желаний за это время проходит сама."),
    ("🔁", "Проверьте подписки", "Раз в квартал пересматривайте подписки: кино, музыка, облака, приложения. "
     "Часто мы платим за сервисы, которыми не пользовались месяцами."),
    ("🛒", "Список перед магазином", "Покупки по заранее составленному списку обычно на 15–20% дешевле, "
     "чем «зайду и посмотрю, что нужно». И не ходите в магазин голодным."),
    ("🍳", "Доставка vs готовка", "Обед из доставки обычно стоит в 2–3 раза дороже, чем приготовленный дома. "
     "Даже 2–3 домашних обеда в неделю заметно экономят за месяц."),
    ("🏦", "Депозит вместо карты", "Деньги на обычной карте теряют в цене из-за инфляции. "
     "Свободные средства держите на сберегательном депозите — даже краткосрочном."),
    ("🛡️", "Гарантия депозитов", "Вклады физлиц в Казахстане гарантирует KDIF в пределах установленного лимита. "
     "Если сбережения большие, проверьте лимит и при необходимости распределите их по разным банкам."),
    ("🎯", "Цель с суммой и сроком", "«Накопить на отпуск» не работает, а «450 000 ₸ к июлю = 75 000 ₸ в месяц» — работает. "
     "Разделите цель на ежемесячные суммы."),
    ("💳", "Кредитка — не доход", "Если пользуетесь кредитным лимитом, гасите его полностью в льготный период. "
     "Проценты по просрочке легко съедают весь кэшбэк за год."),
    ("📉", "Сначала дорогие долги", "Если кредитов несколько, направляйте лишние деньги в тот, у которого самая высокая ставка, "
     "а по остальным платите минимум. Так вы переплатите меньше всего."),
    ("🎁", "Кэшбэк — не повод тратить", "Кэшбэк приятен, но покупка ради бонусов — это всё равно трата. "
     "Используйте бонусы на то, что купили бы в любом случае."),
    ("📅", "Ежегодные траты", "Страховка, техосмотр, подарки, налоги — их легко забыть. "
     "Посчитайте сумму за год, разделите на 12 и откладывайте её каждый месяц."),
    ("🧮", "Стоимость в часах", "Перед крупной покупкой переведите цену в часы работы: "
     "«эти кроссовки = 14 часов моей работы». Иногда это сразу отвечает на вопрос."),
    ("☕", "Эффект латте", "Кофе за 1 500 ₸ каждый рабочий день — это около 33 000 ₸ в месяц и почти 400 000 ₸ в год. "
     "Не нужно отказываться — просто знайте цену привычки."),
    ("👀", "Раз в неделю — 5 минут", "Короткий еженедельный просмотр расходов полезнее, чем подробный разбор раз в полгода: "
     "вы успеваете скорректировать месяц, пока он не закончился."),
    ("🏷️", "Скидка — не экономия", "«Купи 2 по цене 1» экономит деньги, только если вам действительно нужны две штуки. "
     "Иначе это просто дополнительная трата."),
    ("🤝", "Деньги в долг", "Давайте в долг только ту сумму, которую готовы не получить обратно. "
     "Это сбережёт и бюджет, и отношения."),
    ("📈", "Повышение — в накопления", "Получили прибавку? Направьте хотя бы половину разницы в сбережения, "
     "пока вы не привыкли к новому уровню трат."),
    ("🧹", "Продайте ненужное", "Вещи, которыми не пользовались год, можно продать на OLX или Kaspi Объявлениях "
     "и отправить деньги на цель."),
    ("📱", "Тариф связи", "Проверьте, сколько гигабайт и минут вы реально используете. "
     "Часто можно перейти на тариф дешевле без потери в удобстве."),
    ("⚡", "Коммунальные платежи", "LED-лампы, выключенные из розетки зарядки и счётчики воды обычно окупаются "
     "за несколько месяцев и дальше экономят каждый месяц."),
    ("🧠", "Импульсивные покупки", "Удалите сохранённые карты из приложений магазинов, которыми пользуетесь редко. "
     "Лишний шаг при оплате заметно сокращает спонтанные покупки."),
    ("🗂️", "Отдельные «конверты»", "Заведите отдельные счета или депозиты под цели: «подушка», «отпуск», «ремонт». "
     "Так деньги на разные цели не смешиваются."),
    ("🎓", "Вложения в себя", "Курсы и навыки, которые повышают доход, — одна из самых выгодных инвестиций. "
     "Но сначала подушка безопасности, потом всё остальное."),
    ("📆", "Плановые крупные покупки", "Технику дешевле покупать на распродажах: заранее составьте список "
     "и купите, когда цена упадёт, а не когда старая вещь сломается."),
    ("🧾", "Чеки и гарантии", "Сохраняйте фото чеков на дорогие покупки: по гарантии можно бесплатно починить "
     "или вернуть товар, а без чека это намного сложнее."),
    ("🚕", "Такси против транспорта", "Поездка на такси часто стоит как 10–20 поездок на автобусе. "
     "Посмотрите, сколько поездок в месяц можно было бы заменить."),
]


def _month_bounds(d: date) -> tuple[str, str]:
    return d.replace(day=1).isoformat(), d.replace(day=monthrange(d.year, d.month)[1]).isoformat()


def _prev_month(d: date) -> date:
    return (d.replace(day=1) - timedelta(days=1)).replace(day=1)


def _by_category(conn, start: str, end: str) -> dict[str, float]:
    rows = conn.execute(
        "SELECT COALESCE(c.name, 'Без категории') AS name, -SUM(t.amount) AS total FROM transactions t"
        " LEFT JOIN categories c ON c.id = t.category_id WHERE t.amount < 0 AND t.date BETWEEN ? AND ?"
        " GROUP BY name", (start, end)).fetchall()
    return {r["name"]: r["total"] for r in rows}


def _totals(conn, start: str, end: str) -> tuple[float, float]:
    r = conn.execute(
        "SELECT COALESCE(SUM(CASE WHEN amount > 0 THEN amount END), 0) AS inc,"
        " COALESCE(-SUM(CASE WHEN amount < 0 THEN amount END), 0) AS exp"
        " FROM transactions WHERE date BETWEEN ? AND ?", (start, end)).fetchone()
    return r["inc"], r["exp"]


# переводы и жильё не считаем «урезаемыми» тратами в советах про рост расходов
NOT_ADJUSTABLE = {"Жильё и ЖКХ", "Переводы исходящие", "Без категории"}


def personal_tips(conn: sqlite3.Connection, today: Optional[date] = None) -> list[dict]:
    today = today or date.today()
    tips: list[dict] = []
    month = today.strftime("%Y-%m")

    def add(tid, icon, title, text):
        tips.append({"id": f"{tid}:{month}", "kind": "personal", "icon": icon, "title": title, "text": text})

    if conn.execute("SELECT COUNT(*) FROM transactions").fetchone()[0] == 0:
        add("no-data", "📥", "Загрузите первую выписку",
            "Советы станут личными, когда появятся ваши операции. Загрузите PDF-выписку Kaspi на вкладке «Счета и банки».")
        return tips

    cur_start, cur_end = _month_bounds(today)
    prev = _prev_month(today)
    prev_start, prev_end = _month_bounds(prev)
    cur_cat, prev_cat = _by_category(conn, cur_start, cur_end), _by_category(conn, prev_start, prev_end)
    prev_inc, prev_exp = _totals(conn, prev_start, prev_end)
    cur_inc, cur_exp = _totals(conn, cur_start, cur_end)

    # 1. Норма сбережений за прошлый (полный) месяц
    if prev_inc > 0:
        rate = (prev_inc - prev_exp) / prev_inc
        if rate < 0:
            add("savings-neg", "⚠️", "Расходы больше доходов",
                f"В прошлом месяце вы потратили {money(prev_exp)} при доходе {money(prev_inc)} — "
                f"минус {money(prev_exp - prev_inc)}. Посмотрите на 2–3 самые крупные категории: там проще всего сократить.")
        elif rate < 0.1:
            add("savings-low", "🐷", f"Вы отложили {rate:.0%} дохода",
                f"В прошлом месяце осталось {money(prev_inc - prev_exp)} из {money(prev_inc)}. "
                f"Попробуйте автоматически переводить 10% ({money(prev_inc * 0.1)}) на депозит в день зарплаты.")
        elif rate >= 0.2:
            add("savings-good", "🏆", f"Отлично: отложено {rate:.0%} дохода",
                f"В прошлом месяце у вас осталось {money(prev_inc - prev_exp)}. "
                "Если эти деньги лежат на карте — переведите их на депозит, чтобы они работали.")
        else:
            add("savings-mid", "📈", f"Отложено {rate:.0%} дохода",
                f"Неплохо! До ориентира в 20% не хватает {money(prev_inc * 0.2 - (prev_inc - prev_exp))} в месяц.")

    # 2. Темп трат: сравниваем одинаковое число дней (аренда и т.п. обычно в начале месяца)
    day, days = today.day, monthrange(today.year, today.month)[1]
    same_days_prev_end = prev.replace(day=min(day, monthrange(prev.year, prev.month)[1])).isoformat()
    _, prev_same_exp = _totals(conn, prev_start, same_days_prev_end)
    if prev_same_exp > 0 and cur_exp > 0 and 5 <= day < days:
        diff = cur_exp - prev_same_exp
        if diff > prev_same_exp * 0.15:
            add("pace-high", "🏃", "Траты идут быстрее обычного",
                f"За первые {day} дн. месяца потрачено {money(cur_exp)} — на {money(diff)} больше, "
                "чем за те же дни прошлого месяца. Есть время притормозить до конца месяца.")
        elif -diff > prev_same_exp * 0.1:
            add("pace-low", "🐢", "В этом месяце вы экономнее",
                f"За первые {day} дн. потрачено на {money(-diff)} меньше, чем за те же дни прошлого месяца. "
                "Эту разницу можно сразу отложить на депозит.")

    # 3. Категория, которая выросла сильнее всего (сравниваем одинаковое число дней)
    if day >= 7:
        prev_part = _by_category(conn, prev_start, same_days_prev_end)
        growth = [(name, total - prev_part.get(name, 0), prev_part.get(name, 0))
                  for name, total in cur_cat.items() if name not in NOT_ADJUSTABLE]
        growth = [g for g in growth if g[1] >= 5000 and g[2] > 0 and g[1] / g[2] >= 0.25]
        if growth:
            name, diff, base = max(growth, key=lambda g: g[1])
            add(f"growth-{name}", "📊", f"«{name}» выросли на {diff / base:.0%}",
                f"За первые {day} дн. месяца на «{name}» ушло на {money(diff)} больше, чем за тот же период прошлого месяца.")

    # 4. Самая крупная «гибкая» категория прошлого месяца
    flexible = {k: v for k, v in prev_cat.items() if k not in NOT_ADJUSTABLE}
    if flexible and prev_exp > 0:
        name, total = max(flexible.items(), key=lambda kv: kv[1])
        share = total / prev_exp
        if share >= 0.15:
            add(f"top-{name}", "🔍", f"{share:.0%} расходов — «{name}»",
                f"В прошлом месяце на «{name}» ушло {money(total)}. Сокращение даже на 10% даст {money(total * 0.1)} в месяц "
                f"и {money(total * 1.2)} за год.")

    # 5. Кафе и доставка: число заказов
    r = conn.execute(
        "SELECT COUNT(*) AS n, COALESCE(-SUM(t.amount), 0) AS s FROM transactions t JOIN categories c ON c.id = t.category_id"
        " WHERE c.name = 'Кафе и рестораны' AND t.amount < 0 AND t.date BETWEEN ? AND ?", (prev_start, prev_end)).fetchone()
    if r["n"] >= 8:
        add("cafe-count", "🍔", f"{r['n']} заказов еды и кафе за месяц",
            f"В прошлом месяце — {money(r['s'])}, в среднем {money(r['s'] / r['n'])} за раз. "
            f"Если заменить четверть из них домашней едой, освободится около {money(r['s'] * 0.25 * 0.6)}.")

    # 6. Регулярные платежи (подписки): одинаковое описание и сумма в 2 последних месяцах
    subs = conn.execute(
        "SELECT description, amount FROM transactions WHERE amount < 0 AND amount > -30000 AND date BETWEEN ? AND ?"
        " INTERSECT SELECT description, amount FROM transactions WHERE amount < 0 AND date BETWEEN ? AND ?",
        (prev_start, prev_end, _month_bounds(_prev_month(prev))[0], _month_bounds(_prev_month(prev))[1])).fetchall()
    if subs:
        total = -sum(s["amount"] for s in subs)
        names = ", ".join(s["description"].split(": ", 1)[-1] for s in subs[:4])
        add("subs", "🔁", f"Регулярные платежи: {money(total)} в месяц",
            f"Каждый месяц одинаково списываются: {names}{' и др.' if len(subs) > 4 else ''}. "
            "Всё ли из этого вам ещё нужно?")

    # 7. Подушка безопасности на основе средних расходов
    r = conn.execute(
        "SELECT AVG(exp) AS avg FROM (SELECT -SUM(amount) AS exp FROM transactions WHERE amount < 0 AND date < ?"
        " GROUP BY SUBSTR(date, 1, 7) ORDER BY SUBSTR(date, 1, 7) DESC LIMIT 3)", (cur_start,)).fetchone()
    if r["avg"]:
        add("cushion", "🛟", f"Ваша подушка: {money(r['avg'] * 3)} – {money(r['avg'] * 6)}",
            f"Вы тратите в среднем {money(r['avg'])} в месяц. Запас на 3–6 месяцев защитит от кредитов "
            "в трудной ситуации. Держите его на отдельном депозите.")
    return tips


def pick_tip(conn: sqlite3.Connection, seen: set[str], today: Optional[date] = None,
             rng: Optional[random.Random] = None) -> dict:
    """Случайный совет, которого пользователь ещё не видел. Личные советы показываются чаще."""
    rng = rng or random.Random()
    personal = [t for t in personal_tips(conn, today) if t["id"] not in seen]
    general = [{"id": f"g{i}", "kind": "general", "icon": icon, "title": title, "text": text}
               for i, (icon, title, text) in enumerate(GENERAL_TIPS) if f"g{i}" not in seen]
    if personal and (not general or rng.random() < 0.5):
        tip = rng.choice(personal)
    elif general:
        tip = rng.choice(general)
    else:  # всё показано — начинаем круг заново
        return pick_tip(conn, set(), today, rng) | {"reset": True}
    return tip | {"reset": False}
