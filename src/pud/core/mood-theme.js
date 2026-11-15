/**
 * Тема по настроению сцены: лёгкий цветной налёт поверх экрана по ПРАВИЛАМ, которые человек задаёт сам:
 * «с 22 до 5 часов в сюжете: тёмно-синий», «накал от 40: красноватый снизу», «гроза: серо-фиолетовый».
 * Каждое правило: когда (часы в сюжете, накал, погода), какой цвет, насколько заметно, какой формы.
 * Подходящие правила накладываются слоями. Палитру таверны налёт не меняет.
 */

export const WEATHER_CHOICES = Object.freeze({
  '': 'любая', clear: 'ясно', cloudy: 'пасмурно', rain: 'дождь', storm: 'гроза', snow: 'снег', fog: 'туман', wind: 'ветер', heat: 'жара',
});

export const TINT_STYLES = Object.freeze({
  flat: 'ровным слоем',
  bottom: 'градиент снизу вверх',
  edges: 'по краям (виньетка)',
});

/** Правила, с которых человек начинает: можно менять, выключать и удалять. */
export const DEFAULT_RULES = Object.freeze([
  { id: 'night', name: 'Ночь', on: true, hourFrom: 22, hourTo: 5, heatMin: 0, heatMax: 100, weather: '', color: '#162260', alpha: 46, style: 'bottom', grow: false },
  { id: 'dawn', name: 'Рассвет', on: true, hourFrom: 5, hourTo: 8, heatMin: 0, heatMax: 100, weather: '', color: '#ffb08c', alpha: 38, style: 'bottom', grow: false },
  { id: 'dusk', name: 'Закат', on: true, hourFrom: 17, hourTo: 22, heatMin: 0, heatMax: 100, weather: '', color: '#ff9646', alpha: 40, style: 'bottom', grow: false },
  { id: 'heat', name: 'Накал', on: true, hourFrom: null, hourTo: null, heatMin: 40, heatMax: 100, weather: '', color: '#d62846', alpha: 46, style: 'bottom', grow: true },
  { id: 'storm', name: 'Гроза', on: true, hourFrom: null, hourTo: null, heatMin: 0, heatMax: 100, weather: 'storm', color: '#38386a', alpha: 46, style: 'bottom', grow: false },
  { id: 'rain', name: 'Дождь', on: true, hourFrom: null, hourTo: null, heatMin: 0, heatMax: 100, weather: 'rain', color: '#4a6a8a', alpha: 42, style: 'bottom', grow: false },
  { id: 'snow', name: 'Снег', on: true, hourFrom: null, hourTo: null, heatMin: 0, heatMax: 100, weather: 'snow', color: '#cfe4ff', alpha: 38, style: 'bottom', grow: false },
  { id: 'fog', name: 'Туман', on: true, hourFrom: null, hourTo: null, heatMin: 0, heatMax: 100, weather: 'fog', color: '#b8bcc4', alpha: 42, style: 'bottom', grow: false },
  { id: 'cloudy', name: 'Пасмурно', on: true, hourFrom: null, hourTo: null, heatMin: 0, heatMax: 100, weather: 'cloudy', color: '#7a8088', alpha: 34, style: 'bottom', grow: false },
  { id: 'hotday', name: 'Жара', on: true, hourFrom: null, hourTo: null, heatMin: 0, heatMax: 100, weather: 'heat', color: '#ffb347', alpha: 38, style: 'bottom', grow: false },
]);

/** Версия набора начальных правил: у кого правила уже сохранены, недостающие погодные дописываются один раз. */
export const RULES_VERSION = 3;

export const MOOD_THEME_DEFAULTS = Object.freeze({ enabled: false, strength: 100, rules: DEFAULT_RULES });

const clamp = (value, min, max) => Math.min(max, Math.max(min, value));
const hourOrNull = value => (value === null || value === '' || value === undefined || !Number.isFinite(Number(value)) ? null : clamp(Math.round(Number(value)), 0, 23));
const HEX = /^#[0-9a-f]{6}$/i;
let counter = 0;

/** Час из строки «14:20», «9.05»; null, если не нашёлся. */
export function hourFromText(text) {
  const match = /(\d{1,2})\s*[:.]\s*(\d{2})/.exec(String(text ?? ''));
  if (!match) return null;
  const hour = Number(match[1]);
  return hour >= 0 && hour < 24 ? hour : null;
}

/** Одно правило → аккуратное (чужое выбрасывается, границы зажимаются). */
export function normalizeRule(raw, fallbackId = '') {
  const rule = raw && typeof raw === 'object' ? raw : {};
  const heatMin = clamp(Math.round(Number(rule.heatMin) || 0), 0, 100);
  const heatMax = clamp(Math.round(Number.isFinite(Number(rule.heatMax)) && rule.heatMax !== '' ? Number(rule.heatMax) : 100), 0, 100);
  return {
    id: typeof rule.id === 'string' && rule.id ? rule.id : (fallbackId || `rule-${Date.now().toString(36)}${(counter++).toString(36)}`),
    name: String(rule.name ?? '').trim().slice(0, 40) || 'Правило',
    on: rule.on !== false,
    hourFrom: hourOrNull(rule.hourFrom),
    hourTo: hourOrNull(rule.hourTo),
    heatMin: Math.min(heatMin, heatMax),
    heatMax: Math.max(heatMin, heatMax),
    weather: Object.hasOwn(WEATHER_CHOICES, rule.weather) ? rule.weather : '',
    color: HEX.test(String(rule.color)) ? String(rule.color).toLowerCase() : '#888888',
    alpha: clamp(Math.round(Number(rule.alpha) || 0), 0, 60),
    style: Object.hasOwn(TINT_STYLES, rule.style) ? rule.style : 'flat',
    grow: rule.grow === true,
  };
}

/** Все настройки темы. Пока человек ничего не менял, правила — начальные. */
export function normalizeMoodTheme(raw) {
  const source = raw && typeof raw === 'object' ? raw : {};
  let rules = Array.isArray(source.rules) ? source.rules.slice(0, 20).map(item => normalizeRule(item)) : DEFAULT_RULES.map(item => ({ ...item }));
  if (Array.isArray(source.rules) && (Number(source.rulesVersion) || 1) < RULES_VERSION && rules.some(item => ['night', 'dawn', 'dusk', 'heat', 'storm'].includes(item.id))) {
    // раньше погодных правил почти не было: дописываем недостающие (удалённые человеком позже не возвращаются)
    // начальные правила становятся градиентом снизу и заметнее (цвет и «включено» остаются её)
    if ((Number(source.rulesVersion) || 1) < 3) rules = rules.map(item => { const base = DEFAULT_RULES.find(found => found.id === item.id); return base ? { ...item, style: base.style, alpha: base.alpha } : item; });
    const have = new Set(rules.map(item => item.id));
    rules = [...rules, ...DEFAULT_RULES.filter(item => item.weather && !have.has(item.id)).map(item => ({ ...item }))].slice(0, 20);
  }
  return {
    rulesVersion: RULES_VERSION,
    enabled: source.enabled === true,
    strength: clamp(Math.round(Number(source.strength) || 100), 10, 100),
    rules,
  };
}

/** Попадает ли час в промежуток [from, to) (через полночь тоже); если одна из границ пустая, часы не важны. */
export function hourInRange(hour, from, to) {
  if (from === null || to === null || from === undefined || to === undefined || from === to) return true;
  if (hour === null || hour === undefined) return false;
  return from < to ? hour >= from && hour < to : hour >= from || hour < to;
}

/** Подходит ли правило к сцене { hour, heat, weather }. */
export function ruleMatches(rule, scene) {
  if (!rule.on) return false;
  if (!hourInRange(scene.hour ?? null, rule.hourFrom, rule.hourTo)) return false;
  const heat = Number(scene.heat) || 0;
  if (heat < rule.heatMin || heat > rule.heatMax) return false;
  if (rule.weather && rule.weather !== (scene.weather ?? '')) return false;
  return true;
}

const rgbOf = hex => [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16));

/** Слой налёта для правила: CSS-градиент и итоговая прозрачность. */
export function layerFor(rule, scene, master = 100) {
  const share = rule.grow ? clamp(((Number(scene.heat) || 0) - rule.heatMin) / Math.max(1, rule.heatMax - rule.heatMin), 0, 1) : 1;
  const alpha = (rule.alpha / 100) * share * (clamp(master, 0, 100) / 100);
  if (alpha < 0.004) return null;
  const rgb = rgbOf(rule.color).join(' ');
  const solid = `rgb(${rgb} / ${alpha.toFixed(3)})`;
  if (rule.style === 'bottom') return `linear-gradient(to top, ${solid} 0%, rgb(${rgb} / ${(alpha * 0.55).toFixed(3)}) 30%, rgb(${rgb} / 0) 78%)`;
  if (rule.style === 'edges') return `radial-gradient(ellipse at 50% 50%, rgb(${rgb} / 0) 45%, ${solid} 100%)`;
  return `linear-gradient(${solid}, ${solid})`;
}

/**
 * Налёт для сцены по правилам. Возвращает { css, opacity, matched }: matched — названия сработавших правил.
 * scene: { hour (число или null), heat, weather }.
 */
export function tintFor(theme, scene) {
  if (!theme?.enabled) return { css: '', opacity: 0, matched: [] };
  const layers = [];
  const matched = [];
  for (const rule of theme.rules ?? []) {
    if (!ruleMatches(rule, scene)) continue;
    const layer = layerFor(rule, scene, theme.strength);
    if (!layer) continue;
    layers.push(layer);
    matched.push(rule.name);
  }
  return { css: layers.join(', '), opacity: layers.length ? 1 : 0, matched };
}
