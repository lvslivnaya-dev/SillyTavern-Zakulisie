import test from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';

const dom = new JSDOM('<!doctype html><html><body><div id="form_sheld"><div id="send_form"><textarea id="send_textarea"></textarea></div></div></body></html>');
globalThis.window = dom.window;
globalThis.document = dom.window.document;
globalThis.Element = dom.window.Element;
const { mountChatOverlay } = await import('../src/integration/chat-overlay.js');

const view = (auWarning) => ({ leaks: [], deaths: [], reveals: [], questHints: [], secretHints: [], slips: [], chips: true, cast: [{ id: 'm', name: 'Майки', present: true, persona: false }], auWarning });

test('«АУ не выбрана»: плашка над полем ввода называет карточки и открывает окно персон; «Позже» прячет её, без предупреждения плашки нет', () => {
  const opened = [];
  const overlay = mountChatOverlay({ onTogglePresent: () => {}, onLeak: () => {}, onOpenPersonas: avatar => opened.push(avatar) });
  try {
    overlay.render(view(null));
    assert.equal(document.getElementById('ku-au-banner'), null, 'nothing to warn about: no banner');
    overlay.render(view({ names: ['Элли', 'Майки'], hidden: 3, chat: 'c1', avatar: 'elli.png' }));
    const banner = document.getElementById('ku-au-banner');
    assert.ok(banner, 'the warning is above the message box');
    assert.equal(banner.nextElementSibling?.id, 'send_form');
    assert.match(banner.textContent, /АУ не выбрана.*«Элли», «Майки».*\(3\)/);
    [...banner.querySelectorAll('button')].find(item => item.textContent === 'Открыть карточку').click();
    assert.deepEqual(opened, ['elli.png']);
    [...banner.querySelectorAll('button')].find(item => item.textContent === 'Позже').click();
    assert.equal(document.getElementById('ku-au-banner'), null, '«Позже» hides it until the page is reloaded');
    overlay.render(view({ names: ['Элли'], hidden: 1, chat: 'c1', avatar: '' }));
    assert.equal(document.getElementById('ku-au-banner'), null, 'it stays hidden in this chat');
    overlay.render(view({ names: ['Элли'], hidden: 1, chat: 'c2', avatar: '' }));
    assert.ok(document.getElementById('ku-au-banner'), 'but another chat gets its own warning');
    overlay.render(view(null));
    assert.equal(document.getElementById('ku-au-banner'), null, 'an AU got chosen: the banner goes');
  } finally { overlay.destroy?.(); }
});
