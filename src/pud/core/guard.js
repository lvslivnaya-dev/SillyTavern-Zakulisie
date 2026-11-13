/** Защитные обёртки: ошибка одного модуля пишется в консоль и не роняет остальные. */

export const TAG = '[Пудреница]';

export function report(where, error) {
  console.error(`${TAG} ${where}:`, error);
}

export function safe(where, fn, fallback = undefined) {
  try {
    return fn();
  } catch (error) {
    report(where, error);
    return fallback;
  }
}

export async function safeAsync(where, fn, fallback = undefined) {
  try {
    return await fn();
  } catch (error) {
    report(where, error);
    return fallback;
  }
}
