/**
 * Журнал того, что показала бы консоль браузера (F12): ошибки и предупреждения, сбои запросов к серверу и к модели, остановки
 * генерации. Его читает ассистент, когда автор спрашивает, что сломалось.
 *
 * Всё, что попадает в журнал, сначала чистится: ключи, токены, адреса с параметрами и картинки не должны уйти модели.
 * Pure: no DOM, no SillyTavern.
 */

export const CONSOLE_LIMITS = Object.freeze({ entries: 80, message: 400, report: 3200 });

/** Из текста убирается то, что нельзя показывать модели: ключи, токены, данные картинок, параметры адреса. */
export function sanitize(value, max = CONSOLE_LIMITS.message) {
  let text = String(value ?? '');
  text = text.replace(/data:[a-z]+\/[a-z0-9.+-]+;base64,[A-Za-z0-9+/=]+/gi, '[данные]');
  text = text.replace(/\b(bearer|basic)\s+[A-Za-z0-9._~+/=-]{8,}/gi, '$1 [скрыто]');
  text = text.replace(/\b(sk|pk|rk|key|gsk|xai|AIza)[-_][A-Za-z0-9_-]{16,}/g, '[ключ]');
  text = text.replace(/\bAIza[A-Za-z0-9_-]{20,}/g, '[ключ]');
  text = text.replace(/(\b(?:api[_-]?key|apikey|key|access[_-]?token|token|secret|password|authorization|x-api-key)["']?\s*[:=]\s*["']?)[^\s"',;&}]+/gi, '$1[скрыто]');
  text = text.replace(/(https?:\/\/[^\s"'<>?#]+)\?[^\s"'<>]*/gi, '$1?…');
  text = text.replace(/[A-Za-z0-9+/=_-]{40,}/g, '[длинная строка]');
  text = text.replace(/\s+/g, ' ').trim();
  return text.length > max ? `${text.slice(0, max)}…` : text;
}

/** Адрес запроса для журнала: без параметров; для чужого сервера (модель) виден только хост. */
export function shortUrl(url, origin = '') {
  const raw = String(url ?? '');
  try {
    const parsed = new URL(raw, origin || 'http://localhost');
    const own = origin && parsed.origin === origin;
    return own || !origin ? parsed.pathname : `${parsed.host}${parsed.pathname.length > 1 ? '/…' : ''}`;
  } catch {
    return sanitize(raw, 120);
  }
}

/** Журнал в памяти: подряд идущие одинаковые записи складываются в одну со счётчиком. */
export function createConsoleLog({ limit = CONSOLE_LIMITS.entries, now = () => Date.now() } = {}) {
  let entries = [];
  return {
    add(kind, message, details = '') {
      const text = sanitize(message);
      if (!text) return null;
      const extra = sanitize(details, 300);
      const last = entries.at(-1);
      if (last && last.kind === kind && last.message === text && last.details === extra) { last.count += 1; last.time = now(); return last; }
      const entry = { time: now(), kind, message: text, details: extra, count: 1 };
      entries.push(entry);
      if (entries.length > limit) entries = entries.slice(-limit);
      return entry;
    },
    list: () => entries.map(entry => ({ ...entry })),
    clear() { entries = []; },
  };
}

const KIND = Object.freeze({ error: 'ошибка', warn: 'предупреждение', request: 'запрос', event: 'событие', toast: 'сообщение таверны', crash: 'сбой скрипта' });

/** Автор говорит о поломке? Только тогда журнал прикладывается к вопросу: он стоит токенов и нужен не всегда. */
export function looksLikeProblem(text) {
  return /ошибк|не работает|не работают|сломал|слома|сбо[йи]|не (?:приход|генерир|отвеча|подключ|грузит|загруж|сохран)|пуст(?:ой|ое|о)|api|апи|подключ|соединен|консол|f12|ф12|прерва|прервал|оборва|оборв|остановил|зависа|завис|тормоз|таймаут|timeout|лимит|401|403|404|429|500|502|503|504|failed|error|cors|ключ|токен/i.test(String(text ?? ''));
}

const GUIDE = [
  'Как читать: 401/403 — ключ не подошёл или не хватает прав; 404 — неверный адрес или модели нет; 429 — лимит запросов или кончились деньги; 5xx — сбой на стороне сервера модели;',
  '«Failed to fetch» или «NetworkError» — запрос не дошёл (нет связи, неверный адрес, блокировщик, VPN, закрытый сервер таверны); «aborted» — запрос оборвали (кнопка «стоп», смена чата, таймаут).',
].join('\n');

const clock = time => { try { return new Date(time).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit', second: '2-digit' }); } catch { return ''; } };

/** Журнал текстом для ассистента: свежее внизу, без лишнего, с памяткой, как читать коды. */
export function formatConsoleReport(entries, { max = CONSOLE_LIMITS.report } = {}) {
  const list = Array.isArray(entries) ? entries : [];
  if (!list.length) return 'Журнал ошибок браузера пуст: с момента загрузки страницы ничего не сломалось. Если автор видит сбой, значит он случился не в браузере (например, на стороне сервера или модели), и это нужно сказать честно.';
  const lines = [];
  let used = 0;
  for (const entry of [...list].reverse()) {
    const line = `${clock(entry.time)} ${KIND[entry.kind] ?? entry.kind}: ${entry.message}${entry.details ? ` — ${entry.details}` : ''}${entry.count > 1 ? ` (×${entry.count})` : ''}`;
    if (used + line.length > max) break;
    lines.unshift(line);
    used += line.length;
  }
  return `${GUIDE}\n${lines.join('\n')}`;
}
