import test from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import { CAT_ID, WALKING_CLASS, startWalkCat } from '../src/pud/ui/walkcat.js';

test('котик выходит на токенах стрима и уходит по концу генерации', () => {
  const { document } = new JSDOM('<!doctype html><body><div id="send_form"></div></body>').window;
  const handlers = {};
  const context = {
    eventTypes: { STREAM_TOKEN_RECEIVED: 'tok', GENERATION_ENDED: 'end', GENERATION_STOPPED: 'stop', CHAT_CHANGED: 'chat' },
    eventSource: { on: (type, fn) => { (handlers[type] ??= []).push(fn); }, removeListener: (type, fn) => { handlers[type] = handlers[type].filter(item => item !== fn); } },
  };
  const emit = type => { for (const fn of handlers[type] ?? []) fn(); };
  const undo = startWalkCat(document, { context });
  const form = document.getElementById('send_form');
  assert.ok(document.getElementById(CAT_ID));
  assert.equal(form.classList.contains(WALKING_CLASS), false);
  emit('tok');
  assert.ok(form.classList.contains(WALKING_CLASS));
  emit('end');
  assert.equal(form.classList.contains(WALKING_CLASS), false);
  emit('tok');
  emit('stop');
  assert.equal(form.classList.contains(WALKING_CLASS), false);
  undo();
  assert.equal(document.getElementById(CAT_ID), null);
  assert.equal(handlers.tok.length, 0);
});
