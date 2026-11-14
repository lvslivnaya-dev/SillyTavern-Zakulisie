/** The calendar at a glance: quest deadlines stand on their dates, the small month counts them. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { eventsWithQuests, monthView, normalizeCalendar, questDeadlines } from '../src/core/index.js';

const calendar = normalizeCalendar({ anchor: '2026-11-10', events: [{ id: 'e', title: 'Лекция', date: '2026-11-12', repeat: 'none', kind: 'quest' }] });
const quests = [
  { id: 'q1', name: 'Позвонить адвокату', status: 'active', dueDay: 6 },
  { id: 'q2', name: 'Старое', status: 'done', dueDay: 6 },
  { id: 'q3', name: 'Без срока', status: 'active' },
];

test('a quest with a deadline stands on its date; closed ones and ones without a deadline do not', () => {
  const found = questDeadlines(calendar, quests);
  assert.deepEqual(found.map(event => [event.title, event.date, event.fromQuest]), [['Срок: Позвонить адвокату', '2026-11-15', true]]);
  assert.equal(eventsWithQuests(calendar, '2026-11-15', quests).length, 1);
  assert.equal(eventsWithQuests(calendar, '2026-11-12', quests)[0].title, 'Лекция');
});

test('the small month: full weeks, today marked, days with events counted', () => {
  const view = monthView(calendar, '2026-11-12', { today: '2026-11-12', quests });
  assert.match(view.title, /2026/);
  assert.equal(view.cells.length % view.weekdays.length, 0);
  assert.equal(view.cells.find(cell => cell.iso === '2026-11-12').today, true);
  assert.equal(view.cells.find(cell => cell.iso === '2026-11-12').count, 1);
  assert.equal(view.cells.find(cell => cell.iso === '2026-11-15').count, 1);
  assert.equal(view.cells.find(cell => cell.iso === '2026-11-20').count, 0);
});
