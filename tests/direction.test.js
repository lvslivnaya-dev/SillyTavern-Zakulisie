import test from 'node:test';
import assert from 'node:assert/strict';
import {
  activeCues, armCue, buildDirectionPrompt, cueLabel, normalizeDirection, normalizeFavorites,
  editNote, editPin, planEvent, globalPinLeft, markNoteUsed, noteCooldownLeft, normalizeNoteLibrary, pinLeft, pinNote, presenceAfterReply, removeCue, removeNote, replyCountOf, saveNote, silenceCounts, startGeneration, unpinNote,
} from '../src/core/direction.js';
import { createDefaultState, importState } from '../src/core/index.js';

const ids = ['ran', 'rindo', 'suzu'];
const state = { entities: { ran: { id: 'ran', name: 'Ран' }, rindo: { id: 'rindo', name: 'Риндо' }, suzu: { id: 'suzu', name: 'Судзу' } } };

test('an armed cue rides with the next post, holds for swipes, burns with the post after', () => {
  let direction = armCue({ cues: [] }, { id: 'c1', kind: 'enter', entityId: 'ran' }, ids);
  assert.equal(activeCues(direction).length, 0, 'armed, not yet in force');
  assert.equal(buildDirectionPrompt(state, direction), '');

  let step = startGeneration(direction, 'normal');
  assert.deepEqual(step.fired, ['c1']);
  direction = step.direction;
  assert.match(buildDirectionPrompt(state, direction), /Ран steps in/);

  for (const type of ['swipe', 'regenerate', 'continue']) {
    step = startGeneration(direction, type);
    assert.equal(step.changed, false, `${type} keeps it`);
    assert.equal(activeCues(step.direction).length, 1);
  }
  assert.equal(startGeneration(direction, 'quiet').changed, false, 'background requests do not count');
  assert.equal(startGeneration(direction, 'impersonate').changed, false);

  step = startGeneration(direction, 'normal');
  assert.equal(step.direction.cues.length, 0, 'the next turn burns it');
  assert.equal(startGeneration(direction, undefined).direction.cues.length, 0, 'ST sends a plain post with no type');
});

test('a cue armed after the reply joins its swipes', () => {
  let direction = startGeneration(armCue({ cues: [] }, { id: 'a', kind: 'enter', entityId: 'ran' }, ids), 'normal').direction;
  direction = armCue(direction, { id: 'b', kind: 'hold', entityId: 'rindo' }, ids);
  const step = startGeneration(direction, 'swipe');
  assert.deepEqual(step.fired, ['b']);
  assert.equal(activeCues(step.direction).length, 2);
});

test('a waiting cue counts down by posts, not by swipes', () => {
  let direction = armCue({ cues: [] }, { id: 'w', kind: 'call', entityId: 'rindo', wait: 2 }, ids);
  direction = startGeneration(direction, 'normal').direction;
  assert.equal(direction.cues[0].wait, 1);
  direction = startGeneration(direction, 'swipe').direction;
  assert.equal(direction.cues[0].wait, 1, 'a swipe does not count');
  direction = startGeneration(direction, 'normal').direction;
  assert.equal(direction.cues[0].wait, 0);
  assert.equal(activeCues(direction).length, 0);
  const step = startGeneration(direction, 'normal');
  assert.deepEqual(step.fired, ['w']);
  assert.match(buildDirectionPrompt(state, step.direction), /Риндо comes into the scene/);
  assert.deepEqual(presenceAfterReply(step.direction), { add: ['rindo'], remove: [], cast: null, place: null });
});

test('one of enter/hold/call/leave per character, one focus per reply, hold and focus exclude each other', () => {
  let direction = armCue({ cues: [] }, { id: '1', kind: 'enter', entityId: 'ran' }, ids);
  direction = armCue(direction, { id: '2', kind: 'hold', entityId: 'ran' }, ids);
  assert.deepEqual(direction.cues.map(cue => cue.id), ['2']);
  direction = armCue(direction, { id: '3', kind: 'focus', entityId: 'ran' }, ids);
  assert.deepEqual(direction.cues.map(cue => cue.id), ['3']);
  direction = armCue(direction, { id: '4', kind: 'focus', entityId: 'rindo' }, ids);
  assert.deepEqual(direction.cues.map(cue => cue.id), ['4']);
  direction = armCue(direction, { id: '5', kind: 'custom', entityId: 'ran', text: 'пусть приревнует' }, ids);
  direction = armCue(direction, { id: '6', kind: 'custom', entityId: 'ran', text: 'и подколет' }, ids);
  assert.equal(direction.cues.length, 3, 'custom cues add up');
  assert.deepEqual(removeCue(direction, '5').cues.map(cue => cue.id), ['4', '6']);
});

test('bad cues are refused; cues about removed characters are dropped', () => {
  assert.throws(() => armCue({ cues: [] }, { kind: 'enter', entityId: 'ghost' }, ids), /Пинок не понят/);
  assert.throws(() => armCue({ cues: [] }, { kind: 'custom', entityId: 'ran', text: '  ' }, ids));
  assert.throws(() => armCue({ cues: [] }, { kind: 'react', entityId: 'ran' }, ids), 'react needs a target');
  const direction = normalizeDirection({ cues: [{ id: 'x', kind: 'enter', entityId: 'gone' }, { id: 'y', kind: 'event' }, { kind: 'bogus' }] }, ids);
  assert.deepEqual(direction.cues.map(cue => cue.id), ['y']);
});

test('every kind has a narrator line; a secret is sent only while its keeper is on stage', () => {
  const cues = [
    { id: 'a', kind: 'react', entityId: 'ran', targetId: 'last' },
    { id: 'b', kind: 'react', entityId: 'rindo', targetId: 'suzu' },
    { id: 'c', kind: 'factor', entityId: 'ran', targetId: 'suzu', text: 'заступается за неё при всех' },
    { id: 'd', kind: 'secret', entityId: 'rindo', text: 'сломал руку брату', eventId: 'e1' },
    { id: 'e', kind: 'leave', entityId: 'suzu' },
    { id: 'f', kind: 'event' },
    { id: 'g', kind: 'event', text: 'в дверь звонят' },
  ].map(cue => ({ ...cue, used: true }));
  const direction = normalizeDirection({ cues }, ids);
  const text = buildDirectionPrompt(state, direction, { presentIds: ['ran', 'rindo', 'suzu'] });
  assert.match(text, /Ран openly reacts to what has just happened/);
  assert.match(text, /Риндо reacts to Судзу/);
  assert.match(text, /how Судзу feels about Ран.*заступается/);
  assert.match(text, /«сломал руку брату».*do NOT reveal it/);
  assert.match(text, /Судзу leaves the scene/);
  assert.match(text, /pick what fits the place/);
  assert.match(text, /changes the scene: в дверь звонят/);
  assert.match(text, /Never write \{\{user\}\}'s actions/);
  const offstage = buildDirectionPrompt(state, direction, { presentIds: ['ran', 'suzu'] });
  assert.doesNotMatch(offstage, /сломал руку/);
  assert.deepEqual(presenceAfterReply(direction), { add: [], remove: ['suzu'], cast: null, place: null });
  assert.equal(cueLabel(direction.cues[0], id => state.entities[id].name), 'Ран → последнее');
});

test('silence counts bot replies without a mention, newest first; user posts do not count', () => {
  const mentions = text => new Set(ids.filter(id => text.includes(state.entities[id].name)));
  const messages = [
    { isUser: false, text: 'Ран смеётся.' },
    { isUser: false, text: 'Риндо молча курит.' },
    { isUser: true, text: 'Ран, ты чего?' },
    { isUser: false, text: 'Судзу отворачивается.' },
    { isUser: false, text: 'Тишина.' },
  ];
  const counts = silenceCounts(messages, ['ran', 'rindo', 'suzu'], mentions);
  assert.equal(counts.get('suzu'), 1);
  assert.equal(counts.get('rindo'), 2);
  assert.equal(counts.get('ran'), 3, 'her own post naming him is not him speaking');
});

test('favourites: trimmed, unique, capped', () => {
  assert.deepEqual(normalizeFavorites([' пусть приревнует ', 'Пусть приревнует', '', 'подколет']), ['пусть приревнует', 'подколет']);
  assert.equal(normalizeFavorites(Array.from({ length: 50 }, (_, index) => `t${index}`)).length, 30);
});

test('the chat state keeps the cues through save and load', () => {
  const base = createDefaultState();
  const saved = importState({ ...base, ui: { ...base.ui, direction: { cues: [{ id: 'k', kind: 'event', wait: 1, used: false }] } } });
  assert.deepEqual(saved.ui.direction.cues.map(cue => cue.id), ['k']);
});

test('a factor of the kicked one\'s own line: open to the moment, never acting for the other', () => {
  const direction = normalizeDirection({ cues: [{ id: 'o', kind: 'factor', side: 'out', entityId: 'ran', targetId: 'suzu', text: 'она прикрывает его перед братом', used: true }] }, ids);
  assert.equal(direction.cues[0].side, 'out');
  const text = buildDirectionPrompt(state, direction);
  assert.match(text, /Ран's feelings toward Судзу can be moved by moments like this: она прикрывает его/);
  assert.match(text, /Ран is open to such a moment/);
  assert.doesNotMatch(text, /Ран does something like this/);
});

test('a new scene: text, time skip, place and cast reach the narrator; the reply sets who and where', () => {
  let direction = armCue({ cues: [] }, { id: 's1', kind: 'scene', text: 'утро после драки', skip: 'nextday', place: 'палуба', placeId: 'deck', castIds: ['ran', 'ghost', 'suzu'] }, ids);
  assert.deepEqual(direction.cues[0].castIds, ['ran', 'suzu'], 'unknown people are dropped');
  direction = armCue(direction, { id: 's2', kind: 'scene', text: 'вечер в баре' }, ids);
  assert.deepEqual(direction.cues.map(cue => cue.id), ['s2'], 'one new scene per reply');
  direction = armCue(direction, { id: 's3', kind: 'scene', text: 'утро после драки', skip: 'nextday', place: 'палуба', placeId: 'deck', castIds: ['ran', 'suzu'] }, ids);
  direction = startGeneration(direction, 'normal').direction;
  const text = buildDirectionPrompt(state, direction);
  assert.match(text, /Start a NEW scene in this reply, the next day: утро после драки\. Place: палуба\. In the scene: Ран, Судзу\./);
  assert.match(text, /clean break from the previous scene/);
  assert.deepEqual(presenceAfterReply(direction), { add: [], remove: [], cast: ['ran', 'suzu'], place: { location: 'палуба', locationId: 'deck' } });
});

test('an empty new scene is allowed (the narrator decides); a note needs text', () => {
  const direction = startGeneration(armCue({ cues: [] }, { kind: 'scene' }, ids), 'normal').direction;
  assert.match(buildDirectionPrompt(state, direction), /a fresh scene that follows naturally/);
  assert.deepEqual(presenceAfterReply(direction), { add: [], remove: [], cast: null, place: null });
  assert.throws(() => armCue({ cues: [] }, { kind: 'note', text: '' }, ids));
  const note = startGeneration(armCue({ cues: [] }, { kind: 'note', text: 'короче, больше атмосферы' }, ids), 'normal').direction;
  assert.match(buildDirectionPrompt(state, note), /Note for the narrator: короче, больше атмосферы/);
  assert.equal(cueLabel(note.cues[0], () => ''), 'рассказчику: короче, больше атмосферы');
});

test('recall cue: needs text, the same text is armed once, and it tells the narrator to bring it back', async () => {
  const { armCue, startGeneration, buildDirectionPrompt, cueLabel } = await import('../src/core/direction.js');
  assert.throws(() => armCue({ cues: [] }, { kind: 'recall', text: '' }));
  let direction = armCue({ cues: [] }, { kind: 'recall', text: 'Поцелуй под дождём' });
  direction = armCue(direction, { kind: 'recall', text: 'Поцелуй под дождём' });
  direction = armCue(direction, { kind: 'recall', text: 'Клятва на крыше' });
  assert.equal(direction.cues.length, 2);
  assert.equal(cueLabel(direction.cues[0], () => ''), 'вспомнить: Поцелуй под дождём');
  const fired = startGeneration(direction, 'normal').direction;
  const prompt = buildDirectionPrompt({ entities: {} }, fired);
  assert.match(prompt, /Bring this back into play in this reply: «Поцелуй под дождём»/);
  assert.equal(startGeneration(fired, 'normal').direction.cues.length, 0, 'сгорает на следующем ходу');
});

test('an event with a genre tells the narrator the genre and keeps the label for the badge', () => {
  const state = createDefaultState();
  const direction = armCue({ cues: [] }, { kind: 'event', genre: 'pressure' }, []);
  const cue = direction.cues[0];
  assert.equal(cue.genre, 'pressure');
  assert.equal(cue.text, 'Психологическое давление');
  assert.equal(armCue({ cues: [] }, { kind: 'event', genre: 'nonsense' }, []).cues[0].genre, undefined);
  const forced = startGeneration(direction, 'normal').direction;
  assert.match(buildDirectionPrompt(state, forced), /genre: psychological pressure/);
  const detailed = startGeneration(armCue({ cues: [] }, { kind: 'event', genre: 'fight', text: 'за ужином' }, []), 'normal').direction;
  assert.match(buildDirectionPrompt(state, detailed), /Details: за ужином/);
  assert.match(cueLabel(cue, id => id), /Психологическое давление/);
});

test('notes for the narrator: saved ones are unique, carry a cooldown and can be deleted', () => {
  let library = saveNote([], { text: 'Короче и без воды', every: 3 });
  library = saveNote(library, { text: 'Больше атмосферы', every: 0 });
  assert.deepEqual(library.map(note => [note.text, note.every]), [['Больше атмосферы', 0], ['Короче и без воды', 3]], 'newest first');
  const again = saveNote(library, { text: 'короче и без воды', every: 5 });
  assert.equal(again.length, 2, 'the same text is the same note');
  assert.equal(again[0].every, 5, 'only its cooldown changed');
  assert.equal(again[0].id, library[1].id, 'and it kept its id');
  assert.throws(() => saveNote(library, { text: '   ' }), /текст/);
  assert.deepEqual(removeNote(again, again[0].id).map(note => note.text), ['Больше атмосферы']);
  assert.equal(normalizeNoteLibrary('garbage').length, 0);
});

test('a saved note cools down: after it goes, it waits `every` replies before it may go again', () => {
  const note = { id: 'n1', every: 3 };
  assert.equal(noteCooldownLeft({}, 'n1', 3, 10), 0, 'never sent: ready');
  const direction = markNoteUsed({ cues: [] }, 'n1', 10);
  assert.equal(noteCooldownLeft(direction, note.id, note.every, 10), 3);
  assert.equal(noteCooldownLeft(direction, note.id, note.every, 11), 2);
  assert.equal(noteCooldownLeft(direction, note.id, note.every, 13), 0);
  assert.equal(noteCooldownLeft(direction, 'n1', 0, 10), 0, 'no cooldown: always ready');
  assert.deepEqual(normalizeDirection(direction).uses, { n1: 10 }, 'the uses survive a save');
});

test('a pinned note goes with every reply, or once per N replies, and a swipe repeats it without counting', () => {
  let direction = pinNote({ cues: [] }, { text: 'Пиши короче', every: 0 });
  direction = pinNote(direction, { text: 'Напомни про погоду', every: 3 });
  assert.equal(direction.pins.length, 2);
  assert.equal(pinNote(direction, { text: 'пиши КОРОЧЕ', every: 2 }).pins.length, 2, 'the same text is pinned once (only its cooldown changes)');
  const sent = step => activeCues(step.direction).map(cue => cue.text);
  let step = startGeneration(direction, 'normal', { replyCount: 5 });
  assert.deepEqual(sent(step), ['Пиши короче', 'Напомни про погоду'], 'both go with the first reply');
  direction = step.direction;
  step = startGeneration(direction, 'swipe', { replyCount: 5 });
  assert.deepEqual(sent(step), ['Пиши короче', 'Напомни про погоду'], 'a swipe repeats what is in force');
  assert.equal(step.direction.pins.find(pin => pin.text === 'Напомни про погоду').last, 5, 'and counts nothing');
  step = startGeneration(direction, 'normal', { replyCount: 6 });
  assert.deepEqual(sent(step), ['Пиши короче'], 'the cooldown of three holds the other back');
  assert.equal(pinLeft(step.direction.pins[1], 6), 2);
  direction = step.direction;
  step = startGeneration(direction, 'normal', { replyCount: 7 });
  assert.deepEqual(sent(step), ['Пиши короче']);
  step = startGeneration(step.direction, 'normal', { replyCount: 8 });
  assert.deepEqual(sent(step), ['Пиши короче', 'Напомни про погоду'], 'three replies later it goes again');
  assert.deepEqual(startGeneration(step.direction, 'quiet', { replyCount: 9 }).fired, [], 'a background request is not a reply');
  const unpinned = unpinNote(step.direction, step.direction.pins[0].id);
  assert.equal(unpinned.pins.length, 1);
  assert.equal(unpinNote(unpinned, unpinned.pins[0].id).pins, undefined, 'no pins left: no key');
});

test('the reply counter counts replies of the narrator only', () => {
  assert.equal(replyCountOf([{ is_user: true, mes: 'a' }, { mes: 'b' }, { mes: 'c', is_system: true }, { mes: ' ' }, { mes: 'd' }]), 2);
  assert.equal(replyCountOf(null), 0);
});

test('a note pinned just now goes with the reply that is redone (swipe, regenerate): that is how it is tried out', () => {
  const direction = pinNote({ cues: [] }, { text: 'Диалоги в кавычках', every: 0 });
  for (const type of ['regenerate', 'swipe']) {
    const step = startGeneration(direction, type, { replyCount: 4 });
    assert.deepEqual(activeCues(step.direction).map(cue => cue.text), ['Диалоги в кавычках'], type);
    assert.equal(step.changed, true);
    assert.equal(step.direction.pins[0].last, 3, 'it counts as sent with the reply being redone (the 4th)');
    const again = startGeneration(step.direction, type, { replyCount: 4 });
    assert.equal(activeCues(again.direction).length, 1, 'redone once more: still in force, not doubled');
  }
  const next = startGeneration(startGeneration(direction, 'regenerate', { replyCount: 4 }).direction, 'normal', { replyCount: 4 });
  assert.deepEqual(activeCues(next.direction).map(cue => cue.text), ['Диалоги в кавычках'], 'and with the next new reply it goes again');
});

test('a note pinned to ALL chats goes in every chat, each chat counting its own cooldown', () => {
  const globalPins = [{ id: 'g1', text: 'Реплики в кавычках', every: 3 }];
  let chatA = startGeneration({ cues: [] }, 'normal', { replyCount: 10, globalPins });
  assert.deepEqual(activeCues(chatA.direction).map(cue => cue.text), ['Реплики в кавычках']);
  assert.equal(globalPinLeft(chatA.direction, globalPins[0], 11), 2);
  chatA = startGeneration(chatA.direction, 'normal', { replyCount: 11, globalPins });
  assert.deepEqual(activeCues(chatA.direction), [], 'cooling down');
  chatA = startGeneration(chatA.direction, 'normal', { replyCount: 13, globalPins });
  assert.equal(activeCues(chatA.direction).length, 1, 'three replies later again');
  const chatB = startGeneration({ cues: [] }, 'normal', { replyCount: 2, globalPins });
  assert.equal(activeCues(chatB.direction).length, 1, 'another chat has its own counter');
  const regen = startGeneration({ cues: [] }, 'regenerate', { replyCount: 2, globalPins });
  assert.equal(activeCues(regen.direction).length, 1, 'a global note pinned a moment ago goes with a redone reply too');
  const twin = startGeneration(pinNote({ cues: [] }, { text: 'Реплики в кавычках' }), 'normal', { replyCount: 1, globalPins });
  assert.equal(activeCues(twin.direction).length, 1, 'the same words pinned to the chat and to all chats go once');
});

test('editing a saved or pinned note keeps its id (and so its cooldown and its place); an empty text or a twin is refused', () => {
  const library = saveNote(saveNote([], { text: 'Короче', every: 0 }), { text: 'Про погоду', every: 4 });
  const id = library.find(item => item.text === 'Про погоду').id;
  const edited = editNote(library, id, { text: 'Про погоду и ветер', every: 2 });
  assert.deepEqual(edited.find(item => item.id === id), { id, text: 'Про погоду и ветер', every: 2 });
  assert.equal(edited.length, 2, 'edited, not duplicated');
  assert.throws(() => editNote(library, id, { text: '  ' }), /Впишите/);
  assert.throws(() => editNote(library, id, { text: 'короче' }), /уже есть/);
  assert.throws(() => editNote(library, 'nope', { text: 'x' }), /уже нет/);

  let direction = pinNote(pinNote({ cues: [] }, { text: 'Пиши от третьего лица', every: 3 }), { text: 'Короче' });
  const pinId = direction.pins[0].id;
  direction = startGeneration(direction, 'normal', { replyCount: 5 }).direction;
  const last = direction.pins[0].last;
  direction = editPin(direction, pinId, { text: 'Пиши от первого лица', every: 4 });
  assert.equal(direction.pins[0].id, pinId);
  assert.equal(direction.pins[0].text, 'Пиши от первого лица');
  assert.equal(direction.pins[0].every, 4);
  assert.equal(direction.pins[0].last, last, 'the cooldown counts on from the same reply');
  assert.throws(() => editPin(direction, pinId, { text: 'короче' }), /уже закреплено/);
});

test('arming or removing a cue does not wipe the pinned notes, their cooldowns or the planned events', () => {
  let direction = pinNote({ cues: [] }, { text: 'Короче', every: 2 });
  direction = markNoteUsed(direction, 'note-1', 7);
  direction = planEvent(direction, [{ id: 'plan-1', at: 1440 * 5, due: 1440 * 5, unit: 'day', amount: 2, text: 'звонок' }]);
  const armed = armCue(direction, { id: 'c1', kind: 'note', text: 'Тише' }, ids);
  assert.equal(armed.pins.length, 1);
  assert.equal(armed.uses['note-1'], 7);
  assert.equal(armed.plans.length, 1);
  const cleared = removeCue(armed, 'c1');
  assert.equal(cleared.pins.length, 1);
  assert.equal(cleared.plans.length, 1);
});

test('a planned event comes due by the story clock: it becomes an event cue once, not on a swipe, and is gone from the plan', () => {
  const day = n => n * 1440;
  const direction = planEvent({ cues: [] }, [
    { id: 'a', at: day(5) + 9 * 60, due: day(5) + 9 * 60, unit: 'day', amount: 2, text: 'в дверь звонят' },
    { id: 'b', at: day(8), due: day(9), within: true, unit: 'day', amount: 2, genre: 'drama' },
    { id: 'c', at: day(6), due: day(6), unit: 'day', amount: 1 },
  ]);
  let step = startGeneration(direction, 'normal', { nowAbs: day(5) + 8 * 60 });
  assert.deepEqual(step.firedPlans, [], 'not yet');
  assert.equal(step.direction.plans.length, 3);
  step = startGeneration(direction, 'normal', { nowAbs: day(5) + 9 * 60 });
  assert.deepEqual(step.firedPlans.map(plan => plan.id), ['a']);
  assert.equal(step.changed, true);
  assert.equal(step.direction.plans.length, 2);
  const cue = step.direction.cues.find(item => item.id === 'planned-a');
  assert.equal(cue.kind, 'event');
  assert.equal(cue.text, 'в дверь звонят');
  assert.match(buildDirectionPrompt(state, step.direction), /Something happens in this reply that changes the scene: в дверь звонят/);
  // a swipe of the same reply redoes it: nothing new comes due and the plans stay
  const swipe = startGeneration(step.direction, 'swipe', { nowAbs: day(9) });
  assert.deepEqual(swipe.firedPlans, []);
  assert.equal(swipe.direction.plans.length, 2);
  assert.equal(activeCues(swipe.direction).length, 1);
  // days later two plans are due at once: the genre one without a text is told by its genre, the bare one leaves the choice to the narrator
  const late = startGeneration(step.direction, 'normal', { nowAbs: day(9) });
  assert.deepEqual(late.firedPlans.map(plan => plan.id).sort(), ['b', 'c']);
  const prompt = buildDirectionPrompt(state, late.direction);
  assert.match(prompt, /genre: an emotional drama/);
  assert.match(prompt, /pick what fits the place, time and mood/);
  assert.equal(late.direction.plans, undefined, 'the plan list is emptied');
  // the clock is unknown: nothing comes due
  assert.deepEqual(startGeneration(direction, 'normal', { nowAbs: null }).firedPlans, []);
});
