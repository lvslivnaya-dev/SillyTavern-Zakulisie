/**
 * The story calendar: real dates for story days, and events the narrator brings
 * in on their day (or mentions as coming soon).
 *
 * state.ui.calendar = { anchor: 'YYYY-MM-DD' (the date of story day 1), events: [event], system?: the chat's own calendar (core/calendar-system.js) }
 * Without `system` it is the earthly calendar. With it, dates are still 'Y-MM-DD' (year, month number, day) but follow the
 * system's months and weekdays; everything that needs the rules goes through clockOf(calendar).
 * event = {
 *   id, title, note?,                   what happens; note is extra detail for the model
 *   date: 'YYYY-MM-DD', endDate?,        one day, or a span (a session, a trip)
 *   time?: 'HH:MM',
 *   repeat: 'none'|'daily'|'weekly'|'yearly', weekdays?: [1..7] (1 = Monday), until?: 'YYYY-MM-DD',
 *   who?: [entityId],                    empty = the world, everyone
 *   kind?: 'holiday'|'birthday'|'quest'|'sentimental',  what sort of day it is
 *   intensity?: 1..3,                    how much weight it has (1 slight, 2 noticeable, 3 major); the story reacts to every event, the weight says how loudly
 *   must?: true,                         derived: a quest or a major event: the narrator brings it in himself
 *   ahead?: 0..14,                       days before it the characters already know it is coming
 *   disabled?: true,
 * }
 *
 * Templates (saved across chats) keep dates without a year ('MM-DD') and the month
 * their year starts in, so an academic year fits any story year.
 * Everything here is pure: dates are UTC days, never local time.
 */

import { EARTH_CLOCK, makeClock, normalizeSystem } from './calendar-system.js';

export const CALENDAR_LIMITS = Object.freeze({ events: 500, title: 120, note: 500, ahead: 14, templates: 50 });
export const REPEATS = Object.freeze(['none', 'daily', 'weekly', 'yearly']);
/** The kinds of an event and the weights; the labels are the page's own. */
export const EVENT_KINDS = Object.freeze({ holiday: 'Праздник', birthday: 'День рождения', quest: 'Квест', sentimental: 'Сентиментальный день' });
export const INTENSITIES = Object.freeze({ 1: 'слабо', 2: 'заметно', 3: 'сильно' });
const DAY_MS = 86400000;
const WEEKDAYS = ['понедельник', 'вторник', 'среда', 'четверг', 'пятница', 'суббота', 'воскресенье'];
const WEEKDAYS_SHORT = ['пн', 'вт', 'ср', 'чт', 'пт', 'сб', 'вс'];
const MONTHS_OF = ['января', 'февраля', 'марта', 'апреля', 'мая', 'июня', 'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря'];
export const MONTHS = ['Январь', 'Февраль', 'Март', 'Апрель', 'Май', 'Июнь', 'Июль', 'Август', 'Сентябрь', 'Октябрь', 'Ноябрь', 'Декабрь'];

/** Date.UTC reads the years 0–99 as 1900–1999; this one takes the year as it is (year 1 is year 1). */
const utcMs = (year, monthIndex, day) => {
  const date = new Date(0);
  date.setUTCFullYear(year, monthIndex, day);
  return date.getTime();
};

/** 'YYYY-MM-DD' → UTC ms, or null. */
export function parseDate(value) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(value ?? '').trim());
  if (!match) return null;
  const ms = utcMs(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
  const date = new Date(ms);
  return date.getUTCMonth() === Number(match[2]) - 1 && date.getUTCDate() === Number(match[3]) ? ms : null;
}

export function formatDate(ms) {
  const date = new Date(ms);
  // four digits only: a day before year 0 or after year 9999 is not a date of this calendar
  if (!(date.getUTCFullYear() >= 0 && date.getUTCFullYear() <= 9999)) return '';
  return `${String(date.getUTCFullYear()).padStart(4, '0')}-${String(date.getUTCMonth() + 1).padStart(2, '0')}-${String(date.getUTCDate()).padStart(2, '0')}`;
}

export function addDays(iso, days) {
  const ms = parseDate(iso);
  return ms == null ? '' : formatDate(ms + days * DAY_MS);
}

export function daysBetween(fromIso, toIso) {
  const from = parseDate(fromIso);
  const to = parseDate(toIso);
  return from == null || to == null ? null : Math.round((to - from) / DAY_MS);
}

/** 1 = Monday … 7 = Sunday. */
export function weekdayOf(iso) {
  const ms = parseDate(iso);
  return ms == null ? 0 : ((new Date(ms).getUTCDay() + 6) % 7) + 1;
}

/** «вторник, 8 апреля 2025». */
export function humanDate(iso, { year = true, weekday = true } = {}) {
  const ms = parseDate(iso);
  if (ms == null) return '';
  const date = new Date(ms);
  const day = `${date.getUTCDate()} ${MONTHS_OF[date.getUTCMonth()]}${year ? ` ${date.getUTCFullYear()}` : ''}`;
  return weekday ? `${WEEKDAYS[weekdayOf(iso) - 1]}, ${day}` : day;
}

/** «вт 8 апр». */
export function shortDate(iso) {
  const ms = parseDate(iso);
  if (ms == null) return '';
  const date = new Date(ms);
  return `${WEEKDAYS_SHORT[weekdayOf(iso) - 1]} ${date.getUTCDate()} ${MONTHS_OF[date.getUTCMonth()].slice(0, 3)}`;
}

/** The clock (rules of dates) of a chat's calendar: its own system, or the earthly one. */
export function clockOf(calendar) {
  return makeClock(calendar?.system);
}

/** The date of a story day (day 1 = anchor), or '' when the anchor or the day is unknown. */
export function dateOfDay(calendar, day) {
  if (!calendar?.anchor || !Number.isInteger(day) || day < 1) return '';
  return clockOf(calendar).addDays(calendar.anchor, day - 1);
}

/** The anchor that makes `day` fall on `iso`: «today in the story is 8 April». */
export function anchorFor(iso, day, cal = EARTH_CLOCK) {
  return cal.valid(iso) ? cal.addDays(cal.format(cal.parse(iso)), -(Math.max(1, day || 1) - 1)) : '';
}

/** «вт 8 апр» by the rules of the calendar. */
export function calendarShortDate(calendar, iso) {
  return clockOf(calendar).shortDate(iso);
}

function cleanText(value, max) {
  return String(value ?? '').replace(/\s+/g, ' ').trim().slice(0, max);
}

/** A tidy event, or null when it has no title or no valid date. */
export function normalizeEvent(raw, knownIds = null, cal = EARTH_CLOCK) {
  const title = cleanText(raw?.title, CALENDAR_LIMITS.title);
  const tidy = value => (cal.valid(value) ? cal.format(cal.parse(value)) : '');
  const date = tidy(raw?.date);
  if (!title || !date) return null;
  const event = { id: String(raw.id || `cal-${Math.random().toString(36).slice(2, 10)}`), title, date };
  const note = cleanText(raw.note, CALENDAR_LIMITS.note);
  if (note) event.note = note;
  const endDate = tidy(raw.endDate) > date ? tidy(raw.endDate) : '';
  if (endDate) event.endDate = endDate;
  if (/^([01]\d|2[0-3]):[0-5]\d$/.test(String(raw.time ?? '').trim())) event.time = String(raw.time).trim();
  event.repeat = REPEATS.includes(raw.repeat) ? raw.repeat : 'none';
  if (event.repeat === 'weekly') {
    const weekdays = [...new Set((Array.isArray(raw.weekdays) ? raw.weekdays : []).map(Number).filter(day => day >= 1 && day <= cal.weekdayCount))].sort();
    event.weekdays = weekdays.length ? weekdays : [cal.weekdayOf(date)];
  }
  if (event.repeat !== 'none' && tidy(raw.until) && tidy(raw.until) >= date) event.until = tidy(raw.until);
  const who = [...new Set((Array.isArray(raw.who) ? raw.who : []).map(String))].filter(id => !knownIds || knownIds.has(id));
  if (who.length) event.who = who;
  // Older events knew only «must»: it became a quest of major weight, the rest a slight background.
  const kind = Object.hasOwn(EVENT_KINDS, raw.kind) ? raw.kind : (raw.must ? 'quest' : '');
  if (kind) event.kind = kind;
  const weight = Math.round(Number(raw.intensity));
  event.intensity = weight >= 1 && weight <= 3 ? weight : (raw.must || kind === 'quest' ? 3 : kind === 'birthday' || kind === 'sentimental' ? 2 : 1);
  if (kind === 'quest' || event.intensity === 3) event.must = true;
  const ahead = Math.round(Number(raw.ahead));
  if (ahead > 0) event.ahead = Math.min(CALENDAR_LIMITS.ahead, ahead);
  if (raw.disabled) event.disabled = true;
  return event;
}

export function normalizeCalendar(raw, knownIds = null) {
  const system = normalizeSystem(raw?.system);
  const cal = makeClock(system);
  const anchor = cal.valid(raw?.anchor) ? cal.format(cal.parse(raw.anchor)) : '';
  const events = (Array.isArray(raw?.events) ? raw.events : []).map(event => normalizeEvent(event, knownIds, cal)).filter(Boolean).slice(0, CALENDAR_LIMITS.events);
  return { anchor, events, ...(system ? { system } : {}) };
}

/** Does the event happen on this date? A span counts on every day of it. */
export function occursOn(event, iso, cal = EARTH_CLOCK) {
  if (!event || event.disabled || !cal.valid(iso)) return false;
  // A birthday has no «start»: whatever year the card gives, the day comes back in every year of the story (an AU may be set before the birth year).
  const everyYear = event.repeat === 'yearly' && event.kind === 'birthday';
  if ((!everyYear && iso < event.date) || (event.until && iso > event.until)) return false;
  const length = event.endDate ? cal.daysBetween(event.date, event.endDate) : 0;
  const inSpan = start => { const offset = cal.daysBetween(start, iso); return offset != null && offset >= 0 && offset <= length; };
  switch (event.repeat) {
    case 'daily': return true;
    case 'weekly': return (event.weekdays ?? [cal.weekdayOf(event.date)]).includes(cal.weekdayOf(iso));
    case 'yearly': {
      // The span's start in the year of `iso` (or the year before, for a span over New Year).
      for (const shift of [0, -1]) {
        const start = `${String(cal.yearOf(iso) + shift).padStart(4, '0')}${event.date.slice(4)}`;
        if (cal.valid(start) && (everyYear || start >= event.date) && inSpan(start)) return true;
      }
      return false;
    }
    default: return inSpan(event.date);
  }
}

/** Events of a date, timed ones first by time, must-happen first among the rest. */
export function eventsOn(calendar, iso) {
  const cal = clockOf(calendar);
  return (calendar?.events ?? []).filter(event => occursOn(event, iso, cal))
    .sort((left, right) => (left.time ?? '99').localeCompare(right.time ?? '99') || Number(Boolean(right.must)) - Number(Boolean(left.must)));
}

/**
 * The deadlines of the quests of the game as events of the calendar: an active or paused quest with a `dueDay` stands on that date as «Срок: …».
 * They are not stored in the calendar (the quest is the one place that holds them): { id: 'quest:<id>', title, date, kind: 'quest', fromQuest: true }.
 */
export function questDeadlines(calendar, quests = []) {
  const result = [];
  for (const quest of quests ?? []) {
    if (!quest?.dueDay || (quest.status !== 'active' && quest.status !== 'paused')) continue;
    const date = dateOfDay(calendar, Number(quest.dueDay));
    if (!date) continue;
    result.push({ id: `quest:${quest.id}`, title: `Срок: ${quest.name}`, date, repeat: 'none', kind: 'quest', intensity: 2, must: true, fromQuest: true, questId: quest.id, ...(quest.secret ? { secret: true } : {}) });
  }
  return result;
}

/** The events of a date, with the deadlines of the quests among them (the page and the quick view show both). */
export function eventsWithQuests(calendar, iso, quests = []) {
  return [...eventsOn(calendar, iso), ...questDeadlines(calendar, quests).filter(event => event.date === iso)];
}

/**
 * What is coming within `days` days of `today`: [{ event, date, inDays }]. Classes (daily, weekly repeats) are not «coming» after today, and a span
 * counts from its first day. Yearly events (holidays, birthdays) ARE coming: they were skipped before, which left the list empty.
 */
export function comingEvents(calendar, today, quests = [], days = 14) {
  const clock = clockOf(calendar);
  if (!today || !clock.valid(today)) return [];
  const result = [];
  const seen = new Set();
  for (let inDays = 0; inDays <= days; inDays += 1) {
    const date = clock.addDays(today, inDays);
    for (const event of eventsWithQuests(calendar, date, quests)) {
      if (inDays > 0) {
        if (event.repeat === 'daily' || event.repeat === 'weekly') continue;
        const before = clock.addDays(date, -1);
        if (!event.fromQuest && occursOn(event, before, clock)) continue; // a span already going on
      }
      const key = `${event.id}|${date}`;
      if (seen.has(key)) continue;
      seen.add(key);
      result.push({ event, date, inDays });
    }
  }
  return result;
}

/**
 * A month for a small grid: { title, weekdays: [short], cells: [{ iso, day, other, today, count }] }. `iso` is any date of the month;
 * `today` marks the date of the story. Cells run in full weeks (the earthly month in six rows).
 */
export function monthView(calendar, iso, { today = '', quests = [] } = {}) {
  const clock = clockOf(calendar);
  if (!clock.valid(iso)) return null;
  const [year, month] = iso.split('-').map(Number);
  const first = `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}-01`;
  const W = clock.weekdayCount;
  const offset = clock.weekdayOf(first) - 1;
  const length = clock.daysInMonth(year, month);
  const rows = clock.custom ? Math.ceil((offset + length) / W) : 6;
  const start = clock.addDays(first, -offset);
  const cells = [];
  const days = {};
  for (let index = 0; index < rows * W; index += 1) {
    const date = start ? clock.addDays(start, index) : '';
    if (!date) { cells.push({ iso: '', day: 0, other: true, today: false, count: 0 }); continue; }
    const found = eventsWithQuests(calendar, date, quests);
    cells.push({ iso: date, day: Number(date.slice(8)), other: date.slice(0, 7) !== first.slice(0, 7), today: date === today, count: found.length });
    if (found.length) days[date] = found;
  }
  return { days, title: `${clock.monthNames[month - 1] ?? ''} ${year}${clock.custom && clock.system.era ? ` ${clock.system.era}` : ''}`, weekdays: clock.weekdayShort, cells };
}

/** Coming events the characters already know about: { event, date, inDays } for 1..ahead days. */
export function upcoming(calendar, iso, horizon = CALENDAR_LIMITS.ahead) {
  const result = [];
  const seen = new Set();
  const cal = clockOf(calendar);
  for (let inDays = 1; inDays <= horizon; inDays += 1) {
    const date = cal.addDays(iso, inDays);
    for (const event of calendar?.events ?? []) {
      if (seen.has(event.id) || !(event.ahead >= inDays) || !occursOn(event, date, cal)) continue;
      // A repeat already going on today is not «coming»; a span counts from its start.
      if (occursOn(event, iso, cal) && event.repeat !== 'none') continue;
      if (event.repeat === 'none' && event.endDate && occursOn(event, iso, cal)) continue;
      seen.add(event.id);
      result.push({ event, date, inDays });
    }
  }
  return result;
}

/** The narrator's block: today's events and what is coming. '' when there is nothing to say. */
export function buildCalendarPrompt(state, { flashback = false } = {}) {
  const calendar = state.ui?.calendar;
  const day = state.world?.clock?.day ?? 0;
  const today = dateOfDay(calendar, day);
  if (!today || flashback) return '';
  const cal = clockOf(calendar);
  const humanDate = (iso, options) => cal.humanDate(iso, options);
  const shortDate = iso => cal.shortDate(iso);
  const name = id => state.entities?.[id]?.name ?? id;
  const line = event => [
    event.time ? `${event.time} ` : '',
    event.title,
    event.who?.length ? ` (${event.who.map(name).join(', ')})` : '',
    event.endDate ? ` [${humanDate(event.date, { year: false, weekday: false })} – ${humanDate(event.endDate, { year: false, weekday: false })}]` : '',
    event.note ? ` — ${event.note}` : '',
    ` [${[event.kind, ['', 'slight', 'noticeable', 'major'][event.intensity ?? 1]].filter(Boolean).join(', ')}]`,
  ].join('');
  const todays = eventsOn(calendar, today);
  const soon = upcoming(calendar, today);
  const lines = [`today: ${humanDate(today)} (story day ${day})`];
  const season = cal.custom ? cal.seasonOf(cal.monthOf(today)) : null;
  if (season) lines.push(`season: ${season.name}`);
  for (const event of todays.filter(item => item.must)) lines.push(`must-today: ${line(event)}`);
  for (const event of todays.filter(item => !item.must)) lines.push(`background-today: ${line(event)}`);
  for (const { event, date, inDays } of soon) lines.push(`soon (in ${inDays} d., ${shortDate(date)}): ${line(event)}`);
  return `[KULISY — STORY CALENDAR]\n${lines.join('\n')}\n\nRules:\n- today is the story's date; keep weekdays, dates and seasons consistent with it.\n- EVERY event of today is acknowledged by the story, whatever its weight: it is never skipped and never moved to another day. The weight stands in [brackets]: major (must-today): bring it in yourself at its time, shape the day around it; if the scene is elsewhere, let the characters go, be called or talk about it. noticeable: people visibly react to it or mention it. slight (background-today): a passing touch, a detail, one line.\n- kinds: holiday: the whole world marks it; birthday: the named person's day, people congratulate them; quest: an obligation that has to be done; sentimental: matters especially to the characters named in it, a quiet weight on them rather than a public event.\n- soon events are known to those involved: they may plan, prepare, worry or mention them, but they have not happened yet.\n- Never expose this block.${cal.custom ? '\n- This is the world\'s own calendar: write dates, months and weekdays only with the names given above, never the earthly ones.' : ''}\n[/KULISY]`;
}

// ---- Templates ------------------------------------------------------------

/** A chat's events → a template: dates without a year, the year starting at startMonth (1..12). */
export function toTemplate(name, events, startMonth = 1, description = '', personaId = '', year = 0) {
  const strip = iso => (iso ? iso.slice(5) : undefined);
  const start = Math.min(12, Math.max(1, Math.round(Number(startMonth)) || 1));
  // The year it was made for is kept, so that «В календарь» offers it again (not the current one). Not given: the year of the earliest event.
  const first = events.map(event => event.date).filter(Boolean).sort()[0];
  const given = Math.round(Number(year)) || (first ? Number(first.slice(0, 4)) - (Number(first.slice(5, 7)) < start ? 1 : 0) : 0);
  return {
    id: `tpl-${Math.random().toString(36).slice(2, 10)}`,
    name: cleanText(name, 80) || 'Шаблон',
    ...(description ? { description: cleanText(description, 300) } : {}),
    startMonth: start,
    ...(given >= 1 && given <= 9999 ? { year: given } : {}),
    events: events.map(event => {
      const { id, date, endDate, until, who, disabled, ...rest } = event;
      // Characters do not travel between chats; «the persona» does.
      return {
        ...rest, date: strip(date), ...(endDate ? { endDate: strip(endDate) } : {}), ...(until ? { until: strip(until) } : {}),
        ...(personaId && who?.includes(personaId) ? { persona: true } : {}),
      };
    }),
  };
}

/**
 * Template events ('MM-DD') put into a year that starts in `year` at the template's startMonth:
 * a date in an earlier month falls in the next year (an academic year April → March).
 * whoForPersona: entity ID for events the template marks «persona».
 */
export function fromTemplate(template, year, { whoForPersona = '' } = {}) {
  const start = Math.min(12, Math.max(1, Number(template?.startMonth) || 1));
  const place = (monthDay, base) => {
    if (!/^\d{2}-\d{2}$/.test(String(monthDay ?? ''))) return '';
    const month = Number(monthDay.slice(0, 2));
    let y = month < start ? year + 1 : year;
    let iso = `${y}-${monthDay}`;
    if (base && iso < base) { y += 1; iso = `${y}-${monthDay}`; }
    // 29 February in a common year becomes 28 February.
    return parseDate(iso) != null ? iso : (monthDay === '02-29' ? `${y}-02-28` : '');
  };
  return (template?.events ?? []).flatMap(raw => {
    const date = place(raw.date);
    if (!date) return [];
    const event = normalizeEvent({
      ...raw, id: undefined, date,
      endDate: raw.endDate ? place(raw.endDate, date) : undefined,
      until: raw.until ? place(raw.until, date) : undefined,
      who: raw.persona && whoForPersona ? [whoForPersona] : [],
    });
    return event ? [event] : [];
  });
}

export function normalizeTemplates(raw) {
  return (Array.isArray(raw) ? raw : []).filter(item => item && typeof item === 'object' && Array.isArray(item.events))
    .slice(0, CALENDAR_LIMITS.templates)
    .map(item => ({ ...item, name: cleanText(item.name, 80) || 'Шаблон', events: item.events.slice(0, CALENDAR_LIMITS.events) }));
}
