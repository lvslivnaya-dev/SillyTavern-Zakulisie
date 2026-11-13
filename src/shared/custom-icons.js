/**
 * Свои иконки: общий для окна Кулис и панелей Пудреницы список замен «имя → картинка».
 * Чистая логика без DOM. Картинка — маленький PNG/WebP в виде data-ссылки (её делает вкладка «Иконки» из любого файла),
 * ничего другого сюда не попадает: ссылка проверяется до того, как лечь в разметку.
 */
export const ICON_SCOPES = Object.freeze(['pud', 'studio']);
export const ICON_LIMITS = Object.freeze({ side: 96, bytes: 60000, perScope: 150 });

const DATA_URL = /^data:image\/(?:png|webp|jpeg);base64,[A-Za-z0-9+/]+={0,2}$/;

/** Годится ли ссылка: маленькая картинка в base64 и ничего больше. */
export function isIconData(value) {
  return typeof value === 'string' && value.length <= ICON_LIMITS.bytes && DATA_URL.test(value);
}

/** Сохранённое → { pud: {имя: ссылка}, studio: {…} }; всё лишнее и странные имена отбрасываются. */
export function normalizeIcons(raw) {
  const out = { pud: {}, studio: {} };
  for (const scope of ICON_SCOPES) {
    const source = raw && typeof raw === 'object' && raw[scope] && typeof raw[scope] === 'object' ? raw[scope] : {};
    for (const [name, data] of Object.entries(source)) {
      if (!/^[A-Za-z0-9_-]{1,40}$/.test(name) || !isIconData(data)) continue;
      if (Object.keys(out[scope]).length >= ICON_LIMITS.perScope) break;
      out[scope][name] = data;
    }
  }
  return out;
}

let current = normalizeIcons(null);
const listeners = new Set();

/** Заменить все свои иконки разом (при запуске и после изменения во вкладке). */
export function setCustomIcons(raw) {
  current = normalizeIcons(raw);
  for (const listener of listeners) {
    try { listener(current); } catch (error) { console.error('[Закулисье] Иконки: слушатель упал.', error); }
  }
}

/** Своя картинка иконки или '' (тогда рисуется обычная). */
export function customIcon(scope, name) {
  return current[scope]?.[name] ?? '';
}

export function onCustomIcons(listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}
