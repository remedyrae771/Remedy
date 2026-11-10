"use strict";

const $ = (s) => document.querySelector(s);
const $$ = (s) => document.querySelectorAll(s);
const state = { categories: [], accounts: [], charts: {} };

// основная валюта — самая частая среди счетов (для итогов и графиков)
function mainCurrency() {
  const count = {};
  state.accounts.forEach((a) => (count[a.currency] = (count[a.currency] || 0) + a.tx_count + 1));
  return Object.keys(count).sort((a, b) => count[b] - count[a])[0] || "KZT";
}
const fmt = (n, cur = mainCurrency()) =>
  new Intl.NumberFormat("ru-RU", { style: "currency", currency: cur, currencyDisplay: "narrowSymbol", minimumFractionDigits: 0, maximumFractionDigits: 2 }).format(n);
const iso = (d) => d.toISOString().slice(0, 10);
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

async function api(path, opts = {}) {
  const init = { ...opts };
  if (opts.json !== undefined) {
    init.body = JSON.stringify(opts.json);
    init.headers = { "Content-Type": "application/json" };
  }
  const r = await fetch(path, init);
  const data = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(typeof data.detail === "string" ? data.detail : JSON.stringify(data.detail || r.statusText));
  return data;
}

let toastTimer;
function toast(msg, error = false) {
  const t = $("#toast");
  t.textContent = msg;
  t.className = error ? "error" : "";
  t.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => (t.hidden = true), 4000);
}
const guard = (fn) => async (...a) => { try { await fn(...a); } catch (e) { toast(e.message, true); } };

// --- Вкладки -----------------------------------------------------------------------------
$$("nav button").forEach((b) =>
  b.addEventListener("click", () => {
    $$("nav button").forEach((x) => {
      x.classList.toggle("active", x === b);
      if (x === b) x.setAttribute("aria-current", "page"); else x.removeAttribute("aria-current");
    });
    $$(".tab").forEach((t) => t.classList.toggle("active", t.id === "tab-" + b.dataset.tab));
    window.scrollTo(0, 0);
    refresh();
  })
);
const activeTab = () => $("nav button.active").dataset.tab;

async function refresh() {
  await loadRefs();
  const tab = activeTab();
  if (tab === "overview") await loadOverview();
  if (tab === "transactions") await loadTransactions();
  if (tab === "accounts") await loadAccounts();
  if (tab === "categories") await loadCategories();
  if (tab === "tips") await loadAllTips();
}

// --- Справочники -------------------------------------------------------------------------
function fillSelect(sel, items, first) {
  const prev = sel.value;
  sel.innerHTML = (first ?? "") + items.map((i) => `<option value="${i.id}">${esc(i.name)}</option>`).join("");
  if ([...sel.options].some((o) => o.value === prev)) sel.value = prev;
}
function categoryOptions(selectedId, kind) {
  return state.categories
    .filter((c) => !kind || c.kind === kind)
    .map((c) => `<option value="${c.id}" ${c.id === selectedId ? "selected" : ""}>${esc(c.name)}</option>`)
    .join("");
}

async function loadRefs() {
  [state.categories, state.accounts] = await Promise.all([api("/api/categories"), api("/api/accounts")]);
  fillSelect($("#tx-form [name=account_id]"), state.accounts);
  fillSelect($("#tx-form [name=category_id]"), state.categories, '<option value="">Авто-категория</option>');
  fillSelect($("#f-account"), state.accounts, '<option value="">Все счета</option>');
  fillSelect($("#f-category"), state.categories, '<option value="">Все категории</option>');
  fillSelect($("#import-form [name=account_id]"), state.accounts.filter((a) => a.provider !== "gocardless" && a.provider !== "demo"), '<option value="">➕ Новый счёт</option>');
  fillSelect($("#rule-form [name=category_id]"), state.categories);
}

// --- Обзор -------------------------------------------------------------------------------
function setPeriod(kind) {
  const now = new Date();
  let from, to;
  if (kind === "month") { from = new Date(now.getFullYear(), now.getMonth(), 1); to = new Date(now.getFullYear(), now.getMonth() + 1, 0); }
  if (kind === "prev") { from = new Date(now.getFullYear(), now.getMonth() - 1, 1); to = new Date(now.getFullYear(), now.getMonth(), 0); }
  if (kind === "year") { from = new Date(now.getFullYear(), 0, 1); to = new Date(now.getFullYear(), 11, 31); }
  const local = (d) => iso(new Date(d.getTime() - d.getTimezoneOffset() * 60000));
  $("#ov-from").value = local(from);
  $("#ov-to").value = local(to);
}
$$("[data-period]").forEach((b) => b.addEventListener("click", () => { setPeriod(b.dataset.period); loadOverview(); }));
["#ov-from", "#ov-to"].forEach((s) => $(s).addEventListener("change", () => loadOverview()));

function chart(id, config) {
  state.charts[id]?.destroy();
  if (typeof Chart === "undefined") return;
  state.charts[id] = new Chart($(id), config);
}

async function loadOverview() {
  const params = new URLSearchParams({ from: $("#ov-from").value, to: $("#ov-to").value });
  const s = await api("/api/summary?" + params);
  $("#sum-income").textContent = fmt(s.income);
  $("#sum-expense").textContent = fmt(s.expense);
  $("#sum-net").textContent = fmt(s.net);
  $("#sum-net").style.color = s.net >= 0 ? "var(--income)" : "var(--expense)";

  const exp = s.by_category.filter((c) => c.kind === "expense");
  const text = getComputedStyle(document.body).color;
  const css = getComputedStyle(document.documentElement);
  const incomeColor = css.getPropertyValue("--income").trim(), expenseColor = css.getPropertyValue("--expense").trim();
  chart("#chart-categories", {
    type: "doughnut",
    data: { labels: exp.map((c) => c.name), datasets: [{ data: exp.map((c) => c.total), backgroundColor: exp.map((c) => c.color), borderWidth: 0 }] },
    options: { maintainAspectRatio: false, plugins: { legend: { position: window.innerWidth < 700 ? "bottom" : "right", labels: { color: text } }, tooltip: { callbacks: { label: (c) => `${c.label}: ${fmt(c.raw)}` } } } },
  });
  chart("#chart-months", {
    type: "bar",
    data: {
      labels: s.by_month.map((m) => new Date(m.month + "-01T00:00:00").toLocaleDateString("ru-RU", { month: "short", year: "numeric" })),
      datasets: [
        { label: "Доходы", data: s.by_month.map((m) => m.income), backgroundColor: incomeColor, borderRadius: 4 },
        { label: "Расходы", data: s.by_month.map((m) => m.expense), backgroundColor: expenseColor, borderRadius: 4 },
      ],
    },
    options: {
      locale: "ru-RU",
      scales: { x: { ticks: { color: text } }, y: { ticks: { color: text, callback: (v) => v.toLocaleString("ru-RU") } } },
      plugins: { legend: { labels: { color: text } }, tooltip: { callbacks: { label: (c) => `${c.dataset.label}: ${fmt(c.raw)}` } } },
    },
  });
  const max = Math.max(1, ...exp.map((c) => c.total));
  $("#top-categories").innerHTML = exp.length
    ? exp.slice(0, 8).map((c) => `<li><span><span class="dot" style="background:${esc(c.color)}"></span>${esc(c.name)}</span>
        <div class="bar" style="width:${(c.total / max) * 100}%;background:${esc(c.color)}"></div><span class="num">${fmt(c.total)}</span></li>`).join("")
    : '<li class="hint">Нет расходов за период. Подключите банк или импортируйте выписку на вкладке «Счета и банки».</li>';
}

// --- Финансовые советы ------------------------------------------------------------------
const SEEN_KEY = "aqsha.seenTips";
function seenTips() {
  try { return JSON.parse(localStorage.getItem(SEEN_KEY) || "[]"); } catch { return []; }
}
function saveSeen(list) {
  try { localStorage.setItem(SEEN_KEY, JSON.stringify(list.slice(-300))); } catch { /* приватный режим */ }
}
let tipSeenThisSession = [];
async function loadTip() {
  const seen = [...new Set([...seenTips(), ...tipSeenThisSession])];
  const t = await api("/api/tip?seen=" + encodeURIComponent(seen.join(",")));
  const next = t.reset ? [t.id] : [...seen, t.id];
  tipSeenThisSession = next;
  saveSeen(next);
  $("#tip-icon").textContent = t.icon;
  $("#tip-label").textContent = t.kind === "personal" ? "Совет по вашим расходам" : `Финансовый совет · ${t.topic_name}`;
  $("#tip-nodata").hidden = t.has_data !== false;
  $("#tip").classList.toggle("personal", t.kind === "personal");
  $("#tip-title").textContent = t.title;
  $("#tip-text").textContent = t.text;
  $("#tip").hidden = false;
}
$("#tip-next").addEventListener("click", guard(loadTip));

// переход на вкладку по ссылке/кнопке с data-goto
document.addEventListener("click", (e) => {
  const el = e.target.closest("[data-goto]");
  if (!el) return;
  e.preventDefault();
  $(`nav [data-tab=${el.dataset.goto}]`).click();
  window.scrollTo(0, 0);
});

// --- Вкладка «Советы» --------------------------------------------------------------------
let tipsTopic = "";
const tipCard = (t) => `<div class="tip ${t.kind === "personal" ? "personal" : ""}">
  <div class="tip-icon">${esc(t.icon)}</div>
  <div class="tip-body">${t.topic_name ? `<div class="tip-label">${esc(t.topic_name)}</div>` : ""}
    <b>${esc(t.title)}</b><p>${esc(t.text)}</p></div></div>`;

async function loadAllTips() {
  const d = await api("/api/tips");
  $("#tips-personal-block").hidden = !d.personal.length;
  $("#tips-personal").innerHTML = d.personal.map(tipCard).join("");
  $("#tips-nodata").hidden = d.has_data;
  const counts = {};
  d.general.forEach((t) => (counts[t.topic] = (counts[t.topic] || 0) + 1));
  $("#tips-topics").innerHTML = [["", `Все · ${d.general.length}`],
    ...Object.entries(d.topics).map(([k, v]) => [k, `${v} · ${counts[k] || 0}`])]
    .map(([k, label]) => `<button data-topic="${k}" class="${k === tipsTopic ? "active" : ""}">${esc(label)}</button>`).join("");
  // в каждом открытии вкладки — новый порядок
  const list = d.general.filter((t) => !tipsTopic || t.topic === tipsTopic).sort(() => Math.random() - 0.5);
  $("#tips-general").innerHTML = list.map(tipCard).join("");
}
$("#tips-topics").addEventListener("click", guard(async (e) => {
  const b = e.target.closest("[data-topic]");
  if (!b) return;
  tipsTopic = b.dataset.topic;
  await loadAllTips();
}));

// --- Операции ----------------------------------------------------------------------------
async function loadTransactions() {
  const p = new URLSearchParams();
  const add = (k, v) => v && p.set(k, v);
  add("q", $("#f-q").value); add("account_id", $("#f-account").value); add("category_id", $("#f-category").value);
  add("kind", $("#f-kind").value); add("from", $("#f-from").value); add("to", $("#f-to").value);
  const txs = await api("/api/transactions?" + p);
  $("#tx-body").innerHTML = txs.length ? txs.map((t) => `
    <tr data-id="${t.id}" class="row-tx">
      <td class="c-date">${t.date.split("-").reverse().join(".")}</td>
      <td class="c-desc">${esc(t.description)}</td>
      <td class="c-acc">${esc(t.account)}</td>
      <td class="c-cat"><select class="tx-cat"><option value="">—</option>${categoryOptions(t.category_id, t.amount > 0 ? "income" : "expense")}</select></td>
      <td class="num c-amount ${t.amount > 0 ? "pos" : "neg"}">${t.amount > 0 ? "+" : ""}${fmt(t.amount, t.currency)}</td>
      <td class="c-del"><button class="link tx-del" title="Удалить">✕</button></td>
    </tr>`).join("")
    : '<tr><td colspan="6" class="hint">Операций нет</td></tr>';
}

let searchTimer;
$("#f-q").addEventListener("input", () => { clearTimeout(searchTimer); searchTimer = setTimeout(guard(loadTransactions), 300); });
["#f-account", "#f-category", "#f-kind", "#f-from", "#f-to"].forEach((s) => $(s).addEventListener("change", guard(loadTransactions)));

$("#tx-body").addEventListener("change", guard(async (e) => {
  if (!e.target.classList.contains("tx-cat") || !e.target.value) return;
  const id = e.target.closest("tr").dataset.id;
  const remember = confirm("Запомнить для похожих операций? (будет создано правило автокатегоризации)");
  const r = await api(`/api/transactions/${id}`, { method: "PATCH", json: { category_id: +e.target.value, remember } });
  toast(remember ? `Категория назначена ${r.updated} операциям` : "Категория изменена");
  if (remember) loadTransactions();
}));
$("#tx-body").addEventListener("click", guard(async (e) => {
  if (!e.target.classList.contains("tx-del") || !confirm("Удалить операцию?")) return;
  await api(`/api/transactions/${e.target.closest("tr").dataset.id}`, { method: "DELETE" });
  loadTransactions();
}));

$("#tx-form").addEventListener("submit", guard(async (e) => {
  e.preventDefault();
  const f = new FormData(e.target);
  if (!f.get("account_id")) throw new Error("Сначала создайте счёт на вкладке «Счета и банки»");
  await api("/api/transactions", { method: "POST", json: {
    account_id: +f.get("account_id"), date: f.get("date"),
    amount: +f.get("sign") * +f.get("amount"), description: f.get("description"),
    category_id: f.get("category_id") ? +f.get("category_id") : null,
  } });
  e.target.amount.value = ""; e.target.description.value = "";
  toast("Операция добавлена");
  $("#add-tx").open = window.innerWidth >= 700;
  loadTransactions();
}));

// --- Быстрый ввод -------------------------------------------------------------------------
const signed = (n) => (n > 0 ? "+" : "") + fmt(n);
$("#quick-form").addEventListener("submit", guard(async (e) => {
  e.preventDefault();
  const r = await api("/api/quick", { method: "POST", json: { text: e.target.text.value } });
  toast(`Добавлено: ${r.description} ${signed(r.amount)} → ${r.category || "без категории"}`);
  e.target.reset();
  await loadRefs();
  loadTransactions();
}));

// --- Уведомления Kaspi → Aqsha -------------------------------------------------------------
async function loadPushPanel() {
  const c = await api("/api/ingest/config");
  fillSelect($("#push-account"), state.accounts);
  $("#push-account").value = String(c.account_id);
  $("#push-url").value = c.url;
  $("#push-count").textContent = c.received ? `Получено из уведомлений: ${c.received}` : "Пока ни одного уведомления";
}
$("#push-account").addEventListener("change", guard(async (e) => {
  await api("/api/ingest/account", { method: "POST", json: { account_id: +e.target.value } });
  toast("Счёт для уведомлений сохранён");
}));
$("#push-copy").addEventListener("click", guard(async () => {
  try { await navigator.clipboard.writeText($("#push-url").value); toast("Адрес скопирован"); }
  catch { $("#push-url").select(); toast("Выделите адрес и скопируйте вручную"); }
}));
$("#push-reset").addEventListener("click", guard(async () => {
  if (!confirm("Сделать новый ключ? Старый адрес перестанет работать — его нужно будет заменить на телефоне.")) return;
  await api("/api/ingest/token/reset", { method: "POST" });
  await loadPushPanel();
  toast("Новый адрес готов — обновите его на телефоне");
}));
$("#push-test").addEventListener("submit", guard(async (e) => {
  e.preventDefault();
  const out = $("#push-test-result");
  try {
    const r = await api("/api/ingest/preview", { method: "POST", json: { text: e.target.text.value } });
    out.textContent = `✓ Распознано: ${r.description} · ${signed(r.amount)} · ${r.date.split("-").reverse().join(".")} · ${r.category || "без категории"}`;
  } catch (err) { out.textContent = "✗ " + err.message; }
  out.hidden = false;
}));

// --- Счета и банки -----------------------------------------------------------------------
const PROVIDERS = { manual: "Вручную", file: "Выписка", demo: "Демо-банк", gocardless: "Open Banking" };

async function loadAccounts() {
  $("#acc-body").innerHTML = state.accounts.length ? state.accounts.map((a) => {
    const syncable = !["manual", "file"].includes(a.provider);
    return `<tr data-id="${a.id}" class="row-acc">
      <td class="c-desc">${esc(a.name)}</td><td class="c-prov">${PROVIDERS[a.provider] || a.provider}</td><td class="c-count">${a.tx_count} опер.</td>
      <td class="num c-amount ${a.balance >= 0 ? "pos" : "neg"}">${fmt(a.balance, a.currency)}</td>
      <td class="c-sync">${syncable ? `<button class="acc-sync">⟳</button> <span class="hint">${a.last_synced_at ? new Date(a.last_synced_at).toLocaleString("ru-RU") : "никогда"}</span>` : ""}</td>
      <td class="c-del"><button class="link acc-del" title="Удалить счёт и его операции">✕</button></td></tr>`;
  }).join("") : '<tr><td colspan="6" class="hint">Счетов пока нет — подключите банк, загрузите выписку или создайте счёт вручную.</td></tr>';

  await loadPushPanel();
  const providers = await api("/api/banks/providers");
  fillSelect($("#bank-provider"), providers.map((p) => ({ id: p.id, name: p.name + (p.configured ? "" : " — не настроен") })));
}

$("#acc-body").addEventListener("click", guard(async (e) => {
  const id = e.target.closest("tr")?.dataset.id;
  if (e.target.classList.contains("acc-sync")) {
    e.target.disabled = true;
    const r = await api(`/api/accounts/${id}/sync`, { method: "POST" }).finally(() => (e.target.disabled = false));
    toast(`Новых операций: ${r.added}`);
    refresh();
  }
  if (e.target.classList.contains("acc-del") && confirm("Удалить счёт вместе со всеми операциями?")) {
    await api(`/api/accounts/${id}`, { method: "DELETE" });
    refresh();
  }
}));

let institutions = [];
function renderBanks() {
  const q = $("#bank-search").value.toLowerCase();
  $("#bank-list").innerHTML = institutions.filter((i) => i.name.toLowerCase().includes(q)).slice(0, 200)
    .map((i) => `<li data-id="${esc(i.id)}">${i.logo ? `<img src="${esc(i.logo)}" alt="">` : "🏦"} ${esc(i.name)}</li>`).join("");
}
$("#bank-load").addEventListener("click", guard(async () => {
  const p = $("#bank-provider").value;
  institutions = await api(`/api/banks/${p}/institutions?country=${encodeURIComponent($("#bank-country").value)}`);
  $("#bank-search").hidden = institutions.length < 8;
  renderBanks();
}));
$("#bank-search").addEventListener("input", renderBanks);
$("#bank-list").addEventListener("click", guard(async (e) => {
  const li = e.target.closest("li");
  if (!li) return;
  const r = await api(`/api/banks/${$("#bank-provider").value}/connect`, { method: "POST", json: { institution_id: li.dataset.id } });
  window.location.href = r.link; // переходим в банк для подтверждения доступа
}));

$("#import-form").addEventListener("submit", guard(async (e) => {
  e.preventDefault();
  const f = new FormData(e.target);
  if (!f.get("account_id")) f.delete("account_id");
  const r = await api("/api/import", { method: "POST", body: f });
  toast(`Найдено операций: ${r.parsed}, добавлено новых: ${r.added}`);
  e.target.reset();
  refresh();
}));

$("#account-form").addEventListener("submit", guard(async (e) => {
  e.preventDefault();
  const f = new FormData(e.target);
  await api("/api/accounts", { method: "POST", json: { name: f.get("name"), currency: f.get("currency") } });
  e.target.name.value = "";
  refresh();
}));

$("#sync-all").addEventListener("click", guard(async (e) => {
  e.target.disabled = true;
  try {
    const r = await api("/api/sync", { method: "POST" });
    const vals = Object.values(r.results);
    const errors = vals.filter((v) => typeof v === "string");
    const added = vals.filter((v) => typeof v === "number").reduce((a, b) => a + b, 0);
    if (!vals.length) toast("Нет подключённых банков — добавьте на вкладке «Счета и банки»");
    else toast(`Новых операций: ${added}` + (errors.length ? `; ошибок: ${errors.length}` : ""), errors.length > 0);
    refresh();
  } finally { e.target.disabled = false; }
}));

// --- Категории и правила -----------------------------------------------------------------
async function loadCategories() {
  const kinds = { income: "доход", expense: "расход" };
  $("#cat-list").innerHTML = state.categories.map((c) => `<li data-id="${c.id}"><span><span class="dot" style="background:${esc(c.color)}"></span>${esc(c.name)} <small class="hint">${kinds[c.kind]}</small></span><button class="link cat-del">✕</button></li>`).join("");
  const rules = await api("/api/rules");
  $("#rule-list").innerHTML = rules.map((r) => `<li data-id="${r.id}"><span>«${esc(r.pattern)}» → ${esc(r.category)}</span><button class="link rule-del">✕</button></li>`).join("");
}
$("#cat-list").addEventListener("click", guard(async (e) => {
  if (!e.target.classList.contains("cat-del") || !confirm("Удалить категорию? Операции останутся без категории.")) return;
  await api(`/api/categories/${e.target.closest("li").dataset.id}`, { method: "DELETE" });
  refresh();
}));
$("#rule-list").addEventListener("click", guard(async (e) => {
  if (!e.target.classList.contains("rule-del")) return;
  await api(`/api/rules/${e.target.closest("li").dataset.id}`, { method: "DELETE" });
  loadCategories();
}));
$("#cat-form").addEventListener("submit", guard(async (e) => {
  e.preventDefault();
  const f = new FormData(e.target);
  await api("/api/categories", { method: "POST", json: Object.fromEntries(f) });
  e.target.name.value = "";
  refresh();
}));
$("#rule-form").addEventListener("submit", guard(async (e) => {
  e.preventDefault();
  const f = new FormData(e.target);
  await api("/api/rules", { method: "POST", json: { pattern: f.get("pattern"), category_id: +f.get("category_id") } });
  e.target.pattern.value = "";
  loadCategories();
}));
$("#recategorize").addEventListener("click", guard(async () => {
  if (!confirm("Пересчитать категории всех операций по правилам? Ручные изменения будут перезаписаны.")) return;
  const r = await api("/api/recategorize", { method: "POST" });
  toast(`Обновлено операций: ${r.updated}`);
}));

// --- Старт -------------------------------------------------------------------------------
(function init() {
  setPeriod("month");
  $("#add-tx").open = window.innerWidth >= 700;
  $("#tx-form [name=date]").value = iso(new Date());
  const params = new URLSearchParams(location.search);
  if (params.has("bank_linked")) toast(`Банк подключён, счетов: ${params.get("bank_linked")}`);
  if (params.has("bank_error")) toast(`Не удалось подключить банк: ${params.get("bank_error")}`, true);
  if (params.has("bank_linked") || params.has("bank_error")) history.replaceState(null, "", "/");
  guard(refresh)();
  guard(loadTip)();
})();
