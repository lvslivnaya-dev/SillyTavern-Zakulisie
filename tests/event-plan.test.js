import test from 'node:test';
import assert from 'node:assert/strict';
import { PLAN_LIMITS, absOf, describePlan, duePlans, leftText, makePlan, minutesOf, normalizePlans, plural, removePlan, spanText } from '../src/core/event-plan.js';

test('the story moment is one number; a missing time counts as the start of the day, a missing day as unknown', () => {
  assert.equal(minutesOf('14:20'), 14 * 60 + 20);
  assert.equal(minutesOf('25:00'), null);
  assert.equal(absOf(3, '01:30'), 3 * 1440 + 90);
  assert.equal(absOf(3, ''), 3 * 1440);
  assert.equal(absOf(0, '10:00'), null);
  assert.equal(absOf(undefined, '10:00'), null);
});

test('Russian words for the span and the time left', () => {
  assert.equal(plural(1, ['день', 'дня', 'дней']), 'день');
  assert.equal(plural(3, ['день', 'дня', 'дней']), 'дня');
  assert.equal(plural(11, ['день', 'дня', 'дней']), 'дней');
  assert.equal(plural(22, ['неделя', 'недели', 'недель']), 'недели');
  assert.equal(spanText('hour', 5), 'через 5 часов');
  assert.equal(spanText('week', 2, true), 'в течение 2 недели');
  assert.equal(leftText(150), '2 ч 30 мин');
  assert.equal(leftText(1440 * 3 + 240), '3 дн. 4 ч');
  assert.equal(leftText(0), 'уже пора');
});

test('an exact plan lands at the end of the span; a plan «within» draws a moment inside the window', () => {
  const now = absOf(4, '12:00');
  let plans = makePlan([], { text: 'в дверь звонят', nowAbs: now, minutes: 2 * 1440, unit: 'day', amount: 2, id: 'a' });
  assert.equal(plans[0].at, now + 2 * 1440);
  assert.equal(plans[0].due, plans[0].at);
  assert.equal(plans[0].within, false);
  plans = makePlan(plans, { genre: 'drama', nowAbs: now, minutes: 3 * 1440, unit: 'day', amount: 3, within: true, roll: 0, id: 'b' });
  const early = plans.find(plan => plan.id === 'b');
  assert.equal(early.at, now + 1, 'the earliest moment is a minute from now');
  assert.equal(early.due, now + 3 * 1440);
  plans = makePlan(plans, { nowAbs: now, minutes: 3 * 1440, unit: 'day', amount: 3, within: true, roll: 0.999999, id: 'c' });
  const late = plans.find(plan => plan.id === 'c');
  assert.ok(late.at <= late.due && late.at > early.at);
  assert.deepEqual(plans.map(plan => plan.id), ['b', 'a', 'c'], 'kept in the order the moments come');
  assert.equal(plans.find(plan => plan.id === 'b').text, undefined, 'no text: the narrator invents it');
});

test('a plan needs the story day and a span; the list has a limit', () => {
  assert.throws(() => makePlan([], { nowAbs: null, minutes: 60 }), /день истории/);
  assert.throws(() => makePlan([], { nowAbs: 5000, minutes: 0 }), /больше нуля/);
  let plans = [];
  for (let index = 0; index < PLAN_LIMITS.plans; index += 1) plans = makePlan(plans, { nowAbs: 5000, minutes: 60 + index, id: `p${index}` });
  assert.throws(() => makePlan(plans, { nowAbs: 5000, minutes: 60 }), /уже/);
});

test('due plans are split off by the clock; a within-plan shows the end of its window, never its drawn moment', () => {
  const plans = normalizePlans([
    { id: 'x', at: 1440 * 5, due: 1440 * 5, unit: 'day', amount: 1, text: 'раньше' },
    { id: 'y', at: 1440 * 7, due: 1440 * 9, within: true, unit: 'day', amount: 4, genre: 'fight' },
  ]);
  assert.deepEqual(duePlans(plans, 1440 * 6).due.map(plan => plan.id), ['x']);
  assert.deepEqual(duePlans(plans, null).due, []);
  const shown = describePlan(plans[1], 1440 * 5);
  assert.equal(shown.when, 'в течение 4 дня');
  assert.equal(shown.left, 'не позже, чем через 4 дн.');
  assert.match(shown.title, /Драка/);
  assert.equal(describePlan(plans[0], 1440 * 4).left, 'осталось 1 дн.');
  assert.deepEqual(removePlan(plans, 'x').map(plan => plan.id), ['y']);
  assert.deepEqual(normalizePlans([{ id: '', at: 9000 }, { id: 'z', at: 10 }, null, 'text']), [], 'broken plans are dropped');
});
