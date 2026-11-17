/**
 * Weather and the calendar together: which story day a date is, and the weather of any date.
 * The pages (the calendar window with its weather, the drawer) and index.js use the same rules here.
 * Pure: no DOM, no SillyTavern.
 */
import { clockOf } from './calendar.js';
import { systemClimate } from './calendar-system.js';
import { weatherFor } from './weather.js';

/** With a calendar of its own the climate comes from its seasons (and its months), not from the earthly climates. */
export function weatherCalendar(calendar) {
  const cal = clockOf(calendar);
  return cal.custom ? { climate: systemClimate(calendar.system) ?? false, monthOf: iso => cal.monthOf(iso) } : {};
}

/** The story day of a date (day 1 = the anchor), or 0 when the date is before the story or there is no anchor. */
export function dayOfDate(calendar, iso) {
  if (!calendar?.anchor) return 0;
  const between = clockOf(calendar).daysBetween(calendar.anchor, iso);
  return between == null || between < 0 ? 0 : between + 1;
}

/**
 * The weather of a date: { kind, temp, text, source, scenario?, manual? } or null.
 * `world` = { clock, weather } as in state.world; what was set by hand or by the chronicler counts for today only.
 */
export function weatherOnDate({ world, plan, climates = [], calendar }, iso) {
  const day = dayOfDate(calendar, iso);
  if (!day) return null;
  const today = world?.clock?.day ?? 0;
  return weatherFor({ world: { clock: world?.clock, weather: day === today ? world?.weather ?? null : null } }, { plan, climates, date: iso, day, part: 'day', time: day === today ? undefined : '', ...weatherCalendar(calendar) });
}
