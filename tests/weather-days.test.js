import test from 'node:test';
import assert from 'node:assert/strict';
import { BUILTIN_CLIMATES, WEATHER_LIMITS, WEATHER_TEMPLATES, cleanWeatherParts, clearWeatherDays, normalizePlan, paintDays, paintWeather, templateDays, weatherFor, weatherLine, weekForecast } from '../src/core/weather.js';
import { parseWeatherDays } from '../src/integration/weather-generation.js';
import { dayOfDate, weatherOnDate } from '../src/core/weather-days.js';

const tokyo = BUILTIN_CLIMATES.find(item => item.id === 'tokyo');

test('painting the weather: one day or a stretch is a hand-set scenario that wins over what was planned before', () => {
  let plan = normalizePlan({ climateId: 'tokyo', scenarios: [{ id: 'long', name: 'Затяжные дожди', startDay: 10, days: 10, kind: 'rain', tempDelta: -2, text: 'сырость' }] });
  plan = paintWeather(plan, { startDay: 13, days: 2, kind: 'clear', temp: 21, text: 'ни облачка' });
  const kinds = plan.scenarios.map(item => `${item.startDay}+${item.days}:${item.kind}${item.manual ? '*' : ''}`);
  assert.deepEqual(kinds, ['10+3:rain', '13+2:clear*', '15+5:rain'], 'the old scenario is cut around the new one');
  const state = { world: { clock: { day: 14, time: '12:00' } } };
  assert.deepEqual(weatherFor(state, { plan, date: '2025-04-14', day: 14 }), { kind: 'clear', temp: 21, text: 'ни облачка', source: 'scenario', scenario: 'Ясно', manual: true });
  assert.equal(weatherFor(state, { plan, date: '2025-04-11', day: 11 }).kind, 'rain');
  assert.equal(weatherFor(state, { plan, date: '2025-04-16', day: 16 }).kind, 'rain');
  // one day inside a hand-set stretch: it splits again
  plan = paintWeather(plan, { startDay: 14, days: 1, kind: 'snow', temp: -3 });
  assert.equal(weatherFor(state, { plan, date: '2025-04-14', day: 14 }).kind, 'snow');
  assert.equal(weatherFor(state, { plan, date: '2025-04-13', day: 13 }).kind, 'clear');
  assert.equal(weatherFor(state, { plan, date: '2025-04-15', day: 15 }).kind, 'rain', 'after the stretch the old scenario goes on');
  // painting the same days with the same kind again does not pile up copies
  const again = paintWeather(plan, { startDay: 14, days: 1, kind: 'snow', temp: -5 });
  assert.equal(again.scenarios.filter(item => item.startDay === 14).length, 1);
});

test('the forecast can be handed back: the painted days go back to the climate, the pieces around stay', () => {
  let plan = normalizePlan({ climateId: 'tokyo', scenarios: [] });
  plan = paintWeather(plan, { startDay: 5, days: 7, kind: 'storm' });
  plan = clearWeatherDays(plan, { startDay: 7, days: 2 });
  assert.deepEqual(plan.scenarios.map(item => [item.startDay, item.days]), [[5, 2], [9, 3]]);
  const state = { world: { clock: { day: 5 } } };
  assert.equal(weatherFor(state, { plan, climates: [], date: '2025-04-08', day: 8 })?.source, 'forecast');
  assert.equal(weatherFor(state, { plan, climates: [], date: '2025-04-05', day: 5 })?.source, 'scenario');
});

test('painting asks for a kind, a start day and a length; a long stretch is allowed up to the limit', () => {
  assert.throws(() => paintWeather({}, { startDay: 3, days: 2, kind: 'sunny' }), /какая погода/);
  assert.throws(() => paintWeather({}, { startDay: 0, days: 2, kind: 'rain' }), /день начала/);
  assert.throws(() => clearWeatherDays({}, { startDay: 3, days: 0 }), /день начала/);
  const long = paintWeather({}, { startDay: 1, days: 9999, kind: 'rain' });
  assert.equal(long.scenarios[0].days, WEATHER_LIMITS.days);
});

test('the week forecast shows the set weather (and a lock) for today only, other days follow the plan', () => {
  const plan = paintWeather({ climateId: 'tokyo' }, { startDay: 4, days: 1, kind: 'fog' });
  const state = { world: { clock: { day: 3 }, weather: { kind: 'snow', temp: -1, text: '', lock: true, day: 3 } } };
  const week = weekForecast(state, { plan, climates: [], dateOfDay: day => `2025-04-${String(day).padStart(2, '0')}`, count: 3 });
  assert.deepEqual(week.map(item => [item.day, item.kind, item.source]), [[3, 'snow', 'lock'], [4, 'fog', 'scenario'], [5, week[2].kind, 'forecast']]);
});

test('the weather of a date goes through the calendar: the story day of a date and the hand-set weather only for today', () => {
  const calendar = { anchor: '2025-04-07', events: [] };
  assert.equal(dayOfDate(calendar, '2025-04-07'), 1);
  assert.equal(dayOfDate(calendar, '2025-04-10'), 4);
  assert.equal(dayOfDate(calendar, '2025-04-06'), 0, 'before the story');
  assert.equal(dayOfDate({ anchor: '', events: [] }, '2025-04-10'), 0, 'no date of the story');
  const plan = paintWeather({ climateId: 'tokyo' }, { startDay: 4, days: 2, kind: 'heat', temp: 35 });
  const world = { clock: { day: 2, time: '10:00' }, weather: { kind: 'rain', temp: 12, text: '', day: 2 } };
  const ctx = { world, plan, climates: [tokyo], calendar };
  assert.equal(weatherOnDate(ctx, '2025-04-08').kind, 'rain', 'today: what is set');
  assert.equal(weatherOnDate(ctx, '2025-04-10').kind, 'heat', 'a painted day');
  assert.equal(weatherOnDate(ctx, '2025-04-10').manual, true);
  assert.equal(weatherOnDate(ctx, '2025-04-12').source, 'forecast');
  assert.equal(weatherOnDate(ctx, '2025-04-01'), null);
});

test('a day in stretches: the weather follows the hour, and what comes later that day is known to the narrator', () => {
  const plan = paintWeather({}, { startDay: 5, days: 1, parts: [
    { from: '00:00', kind: 'clear', temp: 20, text: 'солнечное утро' },
    { from: '18:00', kind: 'rain', temp: 14, text: 'к вечеру дождь' },
    { from: '22:30', kind: 'fog', temp: 12 },
    { from: '25:00', kind: 'storm' },
  ] });
  assert.equal(plan.scenarios[0].parts.length, 3, 'at most three stretches, a broken hour is dropped');
  assert.equal(plan.scenarios[0].manual, true);
  const at = time => weatherFor({ world: { clock: { day: 5, time } } }, { plan, day: 5, date: '2025-04-05', part: 'day', time });
  assert.equal(at('09:00').kind, 'clear');
  assert.deepEqual(at('09:00').later.map(item => [item.at, item.kind, item.temp]), [['18:00', 'rain', 14], ['22:30', 'fog', 12]]);
  assert.equal(at('18:00').kind, 'rain');
  assert.equal(at('23:00').kind, 'fog');
  assert.equal(at('23:00').later, undefined);
  const line = weatherLine(at('09:00'));
  assert.match(line, /weather: clear sky, about \+20°C — солнечное утро/);
  assert.match(line, /planned change later today: from 18:00 rain, about \+14°C \(к вечеру дождь\); from 22:30 fog/);
  assert.match(line, /let the weather turn/);
  assert.equal(weatherLine({ kind: 'rain', temp: 5 }), 'weather: rain, about +5°C', 'no change planned: the old line');
  // one stretch is just the weather of the day; the first stretch always begins the day
  assert.equal(paintWeather({}, { startDay: 1, parts: [{ from: '09:00', kind: 'snow', temp: -2 }] }).scenarios[0].parts, undefined);
  assert.equal(cleanWeatherParts([{ from: '09:00', kind: 'snow' }, { from: '15:00', kind: 'clear' }])[0].from, '00:00');
});

test('ready weather for 1, 3 and 7 days; a row of days lands day by day, equal neighbours become one stretch', () => {
  assert.deepEqual([...new Set(WEATHER_TEMPLATES.map(item => item.span))], [1, 3, 7]);
  for (const template of WEATHER_TEMPLATES) {
    assert.equal(template.days.length, template.span, `${template.name}: one entry per day`);
    for (const item of templateDays(template)) {
      const parts = cleanWeatherParts(item.parts);
      assert.equal(parts.length, item.parts.length, `${template.name}: every stretch is valid`);
      assert.ok(parts.length >= 1 && parts.length <= 3);
    }
  }
  const clear3 = WEATHER_TEMPLATES.find(item => item.id === 't-clear');
  const plan = paintDays({}, 10, templateDays(clear3));
  assert.deepEqual(plan.scenarios.map(item => [item.startDay, item.days, item.kind]), [[10, 3, 'clear']], 'three equal days are one scenario');
  const week = paintDays({}, 20, templateDays(WEATHER_TEMPLATES.find(item => item.id === 'w-rain')));
  assert.equal(weatherFor({ world: { clock: { day: 22, time: '10:00' } } }, { plan: week, day: 22, date: '2025-04-22', part: 'day', time: '10:00' }).kind, 'rain');
  assert.equal(weatherFor({ world: { clock: { day: 22, time: '10:00' } } }, { plan: week, day: 22, date: '2025-04-22', part: 'day', time: '10:00' }).later[0].kind, 'cloudy');
  assert.throws(() => paintDays({}, 5, []), /ни одного дня/);
});

test('the generator answer is checked: a day for every date, each with a valid stretch', () => {
  const ok = parseWeatherDays({ days: [{ parts: [{ from: '00:00', kind: 'rain', temp: 11, text: 'морось' }] }, { parts: [{ from: '00:00', kind: 'clear', temp: 15 }, { from: '16:00', kind: 'wind', temp: 12 }] }] }, 2);
  assert.equal(ok.length, 2);
  assert.equal(ok[1].parts[1].from, '16:00');
  assert.throws(() => parseWeatherDays({ days: [{ parts: [{ kind: 'rain' }] }] }, 2), /не на все дни/);
  assert.throws(() => parseWeatherDays({ days: [{ parts: [] }, { parts: [{ kind: 'rain' }] }] }, 2), /не на все дни/);
});
