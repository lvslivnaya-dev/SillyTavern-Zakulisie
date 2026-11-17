/**
 * «Сгенерировать климат»: twelve months of temperatures and odds of each kind of weather from
 * one line («Санкт-Петербург», «тропический остров», «вымышленный город у холодного моря»).
 * The person looks at it, then saves it as a climate shared by all chats. Nothing is saved here.
 */
import { WEATHER_KIND_IDS, normalizeClimate } from '../core/index.js';
import { cleanWeatherParts } from '../core/weather.js';
import { parseModelObject, requestStructured } from './analyzer.js';

const SYSTEM = `You describe the typical climate of a place for a roleplay weather forecast. Output ONLY valid JSON:
{"name":"short Russian name","months":[{"min":2,"max":10,"kinds":{"clear":6,"cloudy":3,"rain":1}}]}
- Exactly 12 items in "months", January first. min/max: typical daily low and high in °C for that month (whole numbers, min < max).
- kinds: relative odds of each kind of day (any numbers, only the kinds that really happen in that month). Allowed kinds: ${WEATHER_KIND_IDS.join(', ')}.
- clear = sunny or clear sky, cloudy = overcast, rain = rain or drizzle, storm = thunderstorm, snow = snowfall, fog = fog, wind = strong wind, heat = oppressive heat (only for a hot month).
- Follow the real climate of a real place (rainy season, typhoons, monsoon, polar night); for an invented place infer it from the description. snow only when the daily high is near or below 2°C.
Return JSON only.`;

/** The model's answer → a climate { id, name, months }, or an error. */
export function parseClimate(raw, id) {
  const data = typeof raw === 'object' && raw !== null && !('text' in raw) ? raw : parseModelObject(raw);
  const clean = normalizeClimate({ id, name: data.name || 'Климат', months: data.months });
  if (!clean) throw new SyntaxError('Модель вернула не двенадцать месяцев с температурами и видами погоды.');
  return clean;
}

export async function generateClimate(context, { description, id }) {
  const wish = String(description ?? '').trim();
  if (!wish) throw new Error('Опишите место: например «Санкт-Петербург» или «вымышленный город у холодного моря».');
  try {
    return await requestStructured(context, {
      prompt: [{ role: 'system', content: SYSTEM }, { role: 'user', content: `Place: ${wish}\n\nReturn JSON only.` }],
      trimNames: false,
      busyLabel: 'погода: подбираю климат…',
    }, raw => parseClimate(raw, id));
  } catch (error) {
    throw new Error(`Не удалось подобрать климат: ${error?.message ?? error}`);
  }
}

const DAYS_SYSTEM = `You write a day-by-day weather forecast for a roleplay. Output ONLY valid JSON:
{"days":[{"parts":[{"from":"00:00","kind":"clear","temp":18,"text":"солнечное утро"},{"from":"16:00","kind":"rain","temp":14,"text":"к вечеру дождь"}]}]}
- Exactly one item in "days" for every date of the list you are given, in the same order.
- parts: 1 to 3 stretches of that day, each starting at "from" (HH:MM, the first one is always "00:00", later ones are later in the day). The weather does NOT have to change every day: a calm day is ONE part. Change it inside a day only when it is natural (a front coming in, fog clearing, a storm in the afternoon), and let days follow each other in believable spells (rain for two or three days, then it clears), not a random shuffle.
- kind is one of: ${WEATHER_KIND_IDS.join(', ')}. temp: the air temperature in °C for that stretch (a whole number): realistic for the place and the time of year; snow only near or below 0°C.
- text: Russian, at most 60 characters, how it looks (what the characters see and feel), no dates.
- Follow the real climate and season of a real place; for an invented place or a wish ("a week of cold autumn rain, then the first frost") follow the description.
Return JSON only.`;

/** The model's answer → [{ parts }] for exactly `count` days, or an error. */
export function parseWeatherDays(raw, count) {
  const data = typeof raw === 'object' && raw !== null && !('text' in raw) ? raw : parseModelObject(raw);
  const days = (Array.isArray(data.days) ? data.days : []).map(item => ({ parts: cleanWeatherParts(item?.parts) }));
  if (days.length < count || days.slice(0, count).some(item => !item.parts.length)) throw new SyntaxError(`Модель вернула погоду не на все дни (нужно ${count}).`);
  return days.slice(0, count);
}

/** dates: [{ date: '2025-04-08', label: 'вторник, 8 апреля' }]; description: a city or what is wanted. Nothing is saved here. */
export async function generateWeatherDays(context, { description, dates, climateName = '' }) {
  const wish = String(description ?? '').trim();
  if (!wish) throw new Error('Напишите город или то, какую погоду хотите: например «Санкт-Петербург» или «неделя холодных дождей, потом первый мороз».');
  if (!dates?.length) throw new Error('Не получилось посчитать, на какие дни нужна погода.');
  const list = dates.map((item, index) => `${index + 1}. ${item.label}`).join('\n');
  const climate = climateName ? `\nClimate chosen for the chat: ${climateName}` : '';
  try {
    return await requestStructured(context, {
      prompt: [{ role: 'system', content: DAYS_SYSTEM }, { role: 'user', content: `Place or wish: ${wish}${climate}\n\nDates (${dates.length}):\n${list}\n\nReturn JSON only.` }],
      trimNames: false,
      busyLabel: 'погода: пишу прогноз на дни…',
    }, raw => parseWeatherDays(raw, dates.length));
  } catch (error) {
    throw new Error(`Не удалось сочинить погоду: ${error?.message ?? error}`);
  }
}
