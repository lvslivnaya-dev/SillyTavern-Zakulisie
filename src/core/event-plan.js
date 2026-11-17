/**
 * Planned scene events: «через 3 часа / 2 дня / неделю / месяц случится…».
 *
 * A plan lives in the chat (`state.ui.direction.plans`) and counts STORY time, not replies: the moment is
 * `day * 1440 + minutes of the clock`. When the story clock reaches it, the plan turns into an event cue for
 * the next reply (core/direction.js, startGeneration) and is gone.
 *
 * Two kinds of moment: exact («ровно через 2 дня») and within («в любой момент в течение 2 дней»): the moment is
 * drawn at once, inside the window, and kept hidden from the panel. Two kinds of content: the user's own text,
 * or none: then the narrator invents what happens (optionally in a genre).
 *
 * Pure: no DOM, no SillyTavern, no clock of its own (the caller gives the time and the random roll).
 */
import { EVENT_GENRES } from './event-genres.js';

export const PLAN_UNITS = Object.freeze({
  hour: Object.freeze({ forms: ['час', 'часа', 'часов'], short: 'ч' }),
  day: Object.freeze({ forms: ['день', 'дня', 'дней'], short: 'дн.' }),
  week: Object.freeze({ forms: ['неделя', 'недели', 'недель'], short: 'нед.' }),
  month: Object.freeze({ forms: ['месяц', 'месяца', 'месяцев'], short: 'мес.' }),
});
export const PLAN_UNIT_IDS = Object.freeze(Object.keys(PLAN_UNITS));
export const PLAN_LIMITS = Object.freeze({ plans: 20, amount: 99, text: 400 });

const clip = (value, max) => {
  const text = String(value ?? '').replace(/\s+/g, ' ').trim();
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
};

/** «1 день», «2 дня», «5 дней». */
export function plural(count, forms) {
  const n = Math.abs(Math.round(count)) % 100;
  const last = n % 10;
  if (n > 10 && n < 20) return forms[2];
  if (last === 1) return forms[0];
  if (last >= 2 && last <= 4) return forms[1];
  return forms[2];
}

/** 'HH:MM' → minutes since midnight, or null. */
export function minutesOf(time) {
  const match = /^(\d{1,2}):(\d{2})$/.exec(String(time ?? '').trim());
  if (!match) return null;
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  return hours < 24 && minutes < 60 ? hours * 60 + minutes : null;
}

/** The story moment as one number: null while the story day is unknown. A missing time counts as the morning of the day (00:00). */
export function absOf(day, time) {
  const whole = Math.round(Number(day));
  if (!Number.isFinite(whole) || whole < 1) return null;
  return whole * 1440 + (minutesOf(time) ?? 0);
}

/** «через 3 дня», «в течение 2 недель». */
export function spanText(unit, amount, within = false) {
  const info = PLAN_UNITS[unit] ?? PLAN_UNITS.day;
  return `${within ? 'в течение' : 'через'} ${amount} ${plural(amount, info.forms)}`;
}

/** «2 ч 30 мин», «3 дн. 4 ч», «меньше минуты». */
export function leftText(minutes) {
  const total = Math.round(minutes);
  if (!(total > 0)) return 'уже пора';
  const days = Math.floor(total / 1440);
  const hours = Math.floor((total % 1440) / 60);
  const rest = total % 60;
  if (days) return `${days} дн.${hours ? ` ${hours} ч` : ''}`;
  if (hours) return `${hours} ч${rest ? ` ${rest} мин` : ''}`;
  return `${rest} мин`;
}

/** One tidy plan, or null. */
export function normalizePlan(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const at = Math.round(Number(raw.at));
  const id = typeof raw.id === 'string' && raw.id ? raw.id.slice(0, 60) : '';
  if (!id || !Number.isFinite(at) || at < 1440) return null;
  const due = Math.round(Number(raw.due));
  const plan = {
    id,
    at,
    due: Number.isFinite(due) && due >= at ? due : at,
    within: raw.within === true,
    unit: PLAN_UNIT_IDS.includes(raw.unit) ? raw.unit : 'day',
    amount: Math.max(1, Math.min(PLAN_LIMITS.amount, Math.round(Number(raw.amount)) || 1)),
  };
  const text = clip(raw.text, PLAN_LIMITS.text);
  if (text) plan.text = text;
  if (Object.hasOwn(EVENT_GENRES, raw.genre)) plan.genre = raw.genre;
  const made = Math.round(Number(raw.made));
  if (Number.isFinite(made) && made >= 0) plan.made = made;
  return plan;
}

export function normalizePlans(raw) {
  const seen = new Set();
  const result = [];
  for (const item of Array.isArray(raw) ? raw : []) {
    const plan = normalizePlan(item);
    if (!plan || seen.has(plan.id)) continue;
    seen.add(plan.id);
    result.push(plan);
  }
  return result.sort((left, right) => left.at - right.at).slice(0, PLAN_LIMITS.plans);
}

/**
 * Plan an event. `minutes` is the length of the span in story minutes (the caller turns «2 недели» or «месяц» into minutes by
 * the rules of the story's calendar). `within`: the moment is drawn inside the window, otherwise it is exactly at its end.
 * `roll` is a number in [0, 1) (Math.random by default).
 */
export function makePlan(plans, { text = '', genre = '', nowAbs, minutes, unit = 'day', amount = 1, within = false, id, roll = Math.random() } = {}) {
  if (!Number.isFinite(nowAbs)) throw new Error('Не знаю, какой сейчас день истории: задайте его в «Время».');
  if (!(minutes >= 1)) throw new Error('Срок должен быть больше нуля.');
  const list = normalizePlans(plans);
  if (list.length >= PLAN_LIMITS.plans) throw new Error(`Запланировано уже ${PLAN_LIMITS.plans}: уберите лишнее.`);
  const due = Math.round(nowAbs + minutes);
  const at = within ? Math.round(nowAbs + 1 + Math.min(0.999999, Math.max(0, roll)) * (minutes - 1)) : due;
  const plan = normalizePlan({ id: id || `plan-${Math.random().toString(36).slice(2, 10)}`, text, genre, at, due, within, unit, amount, made: nowAbs });
  if (!plan) throw new Error('План не получился: проверьте срок.');
  return normalizePlans([...list, plan]);
}

export function removePlan(plans, id) {
  return normalizePlans(plans).filter(plan => plan.id !== id);
}

/** Split the plans into those whose moment has come and the rest. */
export function duePlans(plans, nowAbs) {
  const list = normalizePlans(plans);
  if (!Number.isFinite(nowAbs)) return { due: [], rest: list };
  return { due: list.filter(plan => plan.at <= nowAbs), rest: list.filter(plan => plan.at > nowAbs) };
}

/**
 * How the panel shows a plan: { title, when, left }. A plan inside a window never gives away its moment:
 * it shows the end of the window.
 */
export function describePlan(plan, nowAbs) {
  const what = plan.text || (plan.genre ? `${EVENT_GENRES[plan.genre].icon} ${EVENT_GENRES[plan.genre].label}: рассказчик придумает` : '🎲 рассказчик придумает сам');
  const remaining = Number.isFinite(nowAbs) ? (plan.within ? plan.due : plan.at) - nowAbs : null;
  return {
    title: what,
    when: spanText(plan.unit, plan.amount, plan.within),
    left: remaining == null ? '' : plan.within ? `не позже, чем через ${leftText(remaining)}` : `осталось ${leftText(remaining)}`,
  };
}
