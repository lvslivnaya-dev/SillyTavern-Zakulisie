/**
 * Палитра по описанию: «молочно-розовая» → запрос к подключённой модели → своя палитра.
 * Здесь только чистая логика: текст запроса, разбор ответа и подтяжка контраста,
 * чтобы модель не выдала светлый текст на светлом фоне.
 */
import { COLOR_GROUPS, COLOR_KEYS, makeCustomPalette, normalizeHex, setCustomDark } from './palettes.js';

/** Запрос к модели. base — текущая палитра, она же образец того, как цвета связаны между собой. */
export function buildPalettePrompt(description, base) {
  const roles = COLOR_GROUPS.flatMap(group => group.fields.map(([key, label, where]) => `- ${key}: ${label} — ${where}`)).join('\n');
  const sample = { title: base.title, dark: base.dark, ...Object.fromEntries(COLOR_KEYS.map(key => [key, base[key]])) };
  const systemPrompt = [
    'You are a UI color designer for a cozy chat app theme. You answer with one JSON object and nothing else.',
    'Keys of the object: "title" (short theme name in Russian, 1-3 words), "dark" (true for a dark theme), and every color key below as "#rrggbb".',
    'Color roles (descriptions are in Russian):',
    roles,
    'Rules: text colors (ink, ink2, narr, speech, think) must be clearly readable on "card" and on "lilacSoft".',
    '"onAccent" must be readable on "accent" and "accent2". "tint", "tint2", "accent3", "lilacSoft", "mintSoft", "butterSoft" are soft backgrounds close to "card".',
    'narr, speech and think must differ from each other so a reader can tell narration, speech and thoughts apart.',
    `Example of a finished palette (the current one):\n${JSON.stringify(sample)}`,
  ].join('\n');
  const prompt = `Make a palette for this description: «${String(description).trim()}». Reply with the JSON object only.`;
  return { systemPrompt, prompt };
}

/** Достаёт объект из ответа модели: снимает ```json, берёт от первой { до последней }. */
export function parsePaletteReply(text) {
  const raw = String(text ?? '');
  const start = raw.indexOf('{');
  const end = raw.lastIndexOf('}');
  if (start < 0 || end <= start) throw new Error('в ответе модели нет JSON');
  const data = JSON.parse(raw.slice(start, end + 1));
  if (!data || typeof data !== 'object' || Array.isArray(data)) throw new Error('ответ модели — не объект');
  return data;
}

const channel = value => {
  const c = value / 255;
  return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
};
const rgb = hex => [1, 3, 5].map(index => parseInt(hex.slice(index, index + 2), 16));
const toHex = parts => `#${parts.map(v => Math.round(Math.min(255, Math.max(0, v))).toString(16).padStart(2, '0')).join('')}`;
const luminance = hex => {
  const [r, g, b] = rgb(hex).map(channel);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};

/** Контраст по WCAG: 1 — одинаковые цвета, 21 — чёрный на белом. */
export function contrast(a, b) {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

/** Тянет цвет к чёрному или белому (куда дальше от фонов), пока он не станет читаемым на всех фонах. */
function pushReadable(color, backgrounds, min) {
  if (backgrounds.every(bg => contrast(color, bg) >= min)) return color;
  const avgBg = backgrounds.reduce((sum, bg) => sum + luminance(bg), 0) / backgrounds.length;
  const target = avgBg > 0.4 ? [0, 0, 0] : [255, 255, 255];
  const from = rgb(color);
  let out = color;
  for (let step = 1; step <= 20; step++) {
    const t = step / 20;
    out = toHex(from.map((v, i) => v + (target[i] - v) * t));
    if (backgrounds.every(bg => contrast(out, bg) >= min)) break;
  }
  return out;
}

/** Пары «текст — фоны — минимальный контраст», которые проверяются у сгенерированной палитры. */
const READABLE = [
  ['ink', ['card', 'lilacSoft'], 4.5],
  ['narr', ['card', 'lilacSoft'], 3.5],
  ['speech', ['card', 'lilacSoft'], 3.5],
  ['think', ['card', 'lilacSoft'], 3.5],
  ['ink2', ['card'], 3.5],
  ['tech', ['card'], 2.5],
  ['accent2', ['card'], 2.5],
  ['onAccent', ['accent', 'accent2'], 2.5],
  ['mintInk', ['mintSoft'], 3.5],
  ['butterInk', ['butterSoft'], 3.5],
];

/** Подтягивает нечитаемые цвета. Возвращает ключи, которые пришлось поправить. */
export function ensureReadable(palette) {
  const fixed = [];
  for (const [key, bgKeys, min] of READABLE) {
    const next = pushReadable(palette[key], bgKeys.map(bg => palette[bg]), min);
    if (next !== palette[key]) { palette[key] = next; fixed.push(key); }
  }
  return fixed;
}

/**
 * Своя палитра из ответа модели. Цвет, которого нет или который битый, берётся из base.
 * @returns {{ palette: object, missing: string[], fixed: string[] }}
 */
export function paletteFromReply(data, base, custom = [], description = '') {
  const palette = makeCustomPalette(base, custom);
  if (typeof data.dark === 'boolean') setCustomDark(palette, data.dark);
  const missing = [];
  for (const key of COLOR_KEYS) {
    const hex = normalizeHex(data[key]);
    if (hex) palette[key] = hex; else missing.push(key);
  }
  const title = typeof data.title === 'string' && data.title.trim() ? data.title : description;
  palette.title = String(title || palette.title).trim().slice(0, 60);
  palette.hint = 'своя, по описанию';
  const fixed = ensureReadable(palette);
  return { palette, missing, fixed };
}
