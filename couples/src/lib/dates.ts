const MS_PER_DAY = 24 * 60 * 60 * 1000;

/** Разбирает 'YYYY-MM-DD' как локальную дату (без сдвига часового пояса). */
export function parseISODate(value: string): Date {
  const [y, m, d] = value.split('-').map(Number);
  return new Date(y, m - 1, d);
}

export function toISODate(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function today(): Date {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), now.getDate());
}

export function daysBetween(from: Date, to: Date): number {
  const a = Date.UTC(from.getFullYear(), from.getMonth(), from.getDate());
  const b = Date.UTC(to.getFullYear(), to.getMonth(), to.getDate());
  return Math.round((b - a) / MS_PER_DAY);
}

/** Проверяет ввод вида ДД.ММ.ГГГГ и возвращает 'YYYY-MM-DD' или null. */
export function parseUserDate(input: string): string | null {
  const match = input.trim().match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})$/);
  if (!match) return null;
  const [, d, m, y] = match.map(Number);
  const date = new Date(y, m - 1, d);
  if (date.getFullYear() !== y || date.getMonth() !== m - 1 || date.getDate() !== d) return null;
  return toISODate(date);
}

export function formatDate(iso: string): string {
  // «3 июня 2023», без «г.» в конце — короче и не переносится на отдельную строку.
  return parseISODate(iso)
    .toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', year: 'numeric' })
    .replace(/\s*г\.?$/, '');
}

export function formatUserDate(iso: string): string {
  const d = parseISODate(iso);
  return `${String(d.getDate()).padStart(2, '0')}.${String(d.getMonth() + 1).padStart(2, '0')}.${d.getFullYear()}`;
}

/** Ближайшее наступление события (для ежегодных — в этом или следующем году). */
export function nextOccurrence(iso: string, repeatsYearly: boolean, from: Date = today()): Date {
  const date = parseISODate(iso);
  if (!repeatsYearly) return date;
  const candidate = new Date(from.getFullYear(), date.getMonth(), date.getDate());
  if (candidate < from) candidate.setFullYear(from.getFullYear() + 1);
  return candidate;
}

export function pluralDays(n: number): string {
  const abs = Math.abs(n) % 100;
  const last = abs % 10;
  if (abs > 10 && abs < 20) return 'дней';
  if (last === 1) return 'день';
  if (last >= 2 && last <= 4) return 'дня';
  return 'дней';
}

export function relativeDays(n: number): string {
  if (n === 0) return 'сегодня';
  if (n === 1) return 'завтра';
  if (n > 0) return `через ${n} ${pluralDays(n)}`;
  return `${-n} ${pluralDays(-n)} назад`;
}

/** Индекс «вопроса дня» — одинаковый у обоих партнёров в один и тот же день. */
export function dayIndex(date: Date = today()): number {
  return daysBetween(new Date(2024, 0, 1), date);
}

export function formatTime(isoTimestamp: string): string {
  return new Date(isoTimestamp).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
}
