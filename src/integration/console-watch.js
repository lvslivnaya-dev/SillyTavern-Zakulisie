/**
 * Слушает то, что показала бы консоль (F12), и складывает в журнал (core/console-log.js). Ничего не меняет в поведении страницы:
 * console, fetch и toastr вызываются как раньше, мы только записываем итог. Всё снимается обратно функцией, которую возвращает start.
 */
import { shortUrl } from '../core/console-log.js';

const argText = value => {
  if (value instanceof Error) return `${value.name}: ${value.message}`;
  if (typeof value === 'string') return value;
  try { return JSON.stringify(value); } catch { return String(value); }
};

/** Начать слежение. Возвращает функцию «перестать». Вызывать один раз; повторный вызов ничего не удваивает. */
export function startConsoleWatch(log, win = globalThis) {
  if (!log || win.__zakulisieConsoleWatch) return () => {};
  win.__zakulisieConsoleWatch = true;
  const undo = [];
  const safe = fn => { try { fn(); } catch { /* the journal must never break the page */ } };
  const origin = win.location?.origin ?? '';

  // console.error / console.warn
  for (const level of ['error', 'warn']) {
    const original = win.console?.[level];
    if (typeof original !== 'function') continue;
    win.console[level] = function patched(...args) {
      safe(() => log.add(level, args.map(argText).join(' ')));
      return original.apply(this, args);
    };
    undo.push(() => { win.console[level] = original; });
  }

  // uncaught errors and promises nobody caught
  const onError = event => safe(() => log.add('crash', event.message || 'ошибка скрипта', event.filename ? shortUrl(event.filename, origin) : ''));
  const onRejection = event => safe(() => log.add('crash', `Необработанный сбой: ${argText(event.reason)}`));
  win.addEventListener?.('error', onError);
  win.addEventListener?.('unhandledrejection', onRejection);
  undo.push(() => { win.removeEventListener?.('error', onError); win.removeEventListener?.('unhandledrejection', onRejection); });

  // requests: only the failed ones and the broken ones, no bodies of the good ones
  const originalFetch = win.fetch;
  if (typeof originalFetch === 'function') {
    win.fetch = function patchedFetch(input, init) {
      const started = Date.now();
      const method = String(init?.method ?? input?.method ?? 'GET').toUpperCase();
      const where = shortUrl(typeof input === 'string' ? input : input?.url ?? String(input), origin);
      const result = originalFetch.apply(this, arguments);
      Promise.resolve(result).then(response => {
        if (response?.ok) return;
        safe(() => {
          const clone = response.clone();
          const head = `${method} ${where} → ${response.status}${response.statusText ? ` ${response.statusText}` : ''} (${Date.now() - started} мс)`;
          // the reason the server gave (a short piece), read in the background
          clone.text().then(body => log.add('request', head, body), () => log.add('request', head));
        });
      }, error => safe(() => {
        const aborted = error?.name === 'AbortError';
        log.add('request', `${method} ${where} → ${aborted ? 'прервано (aborted)' : 'не дошёл'}`, aborted ? '' : argText(error));
      }));
      return result;
    };
    undo.push(() => { if (win.fetch !== originalFetch) win.fetch = originalFetch; });
  }

  // the red notices of the tavern itself (what the user sees in the corner of the screen)
  const toastr = win.toastr;
  if (toastr) {
    for (const level of ['error', 'warning']) {
      const original = toastr[level];
      if (typeof original !== 'function') continue;
      toastr[level] = function patchedToast(message, title, ...rest) {
        safe(() => log.add('toast', `${level === 'error' ? 'Ошибка' : 'Предупреждение'}${title ? ` «${argText(title)}»` : ''}: ${argText(message)}`));
        return original.call(this, message, title, ...rest);
      };
      undo.push(() => { toastr[level] = original; });
    }
  }

  return () => {
    for (const fn of undo.reverse()) safe(fn);
    delete win.__zakulisieConsoleWatch;
  };
}
