import test from 'node:test';
import assert from 'node:assert/strict';
import { STICKER_THRESHOLD, cleanStickerColor, normalizeRelGraph, normalizeStickers, stickerCss, stickerLook } from '../src/pud/core/relgraph.js';

test('цвет стикера: только hex или цвет палитры, остальное — ничего', () => {
  assert.equal(cleanStickerColor('#ABC'), '#aabbcc');
  assert.equal(cleanStickerColor('#e8899f'), '#e8899f');
  assert.equal(cleanStickerColor('pal:mint'), 'pal:mint');
  assert.equal(cleanStickerColor('pal:nope'), '');
  assert.equal(cleanStickerColor('red; background:url(x)'), '');
  assert.equal(stickerCss('pal:danger'), 'var(--pud-danger)');
  assert.equal(stickerCss('#112233'), '#112233');
  assert.equal(stickerCss(''), '');
});

test('стикер заполняется по модулю значения; рост и падение — свои цвета; выше 90 — дополнительные, если заданы', () => {
  const cfg = normalizeStickers({ colors: { grow: '#00ff00', fall: '#ff0000', growMax: '#00ffff' } });
  assert.deepEqual(stickerLook(40, 'trust', cfg), { fill: 40, dir: 'up', extra: false, color: '#00ff00' });
  assert.deepEqual(stickerLook(-25, 'trust', cfg), { fill: 25, dir: 'down', extra: false, color: '#ff0000' });
  assert.equal(stickerLook(0, 'trust', cfg).dir, 'none');
  assert.equal(stickerLook(0, 'trust', cfg).fill, 0);
  assert.equal(stickerLook(STICKER_THRESHOLD, 'trust', cfg).extra, false, 'ровно 90 — ещё обычный цвет');
  const high = stickerLook(95, 'trust', cfg);
  assert.equal(high.extra, true);
  assert.equal(high.color, '#00ffff');
  const low = stickerLook(-95, 'trust', cfg);
  assert.equal(low.extra, false, 'дополнительного цвета падения нет: берётся обычный');
  assert.equal(low.color, '#ff0000');
  assert.equal(stickerLook(500, 'trust', cfg).fill, 100, 'зажимается');
});

test('у значка могут быть свои цвета (рост, падение, выше 90): они важнее общих, остальное берётся общее', () => {
  const cfg = normalizeStickers({ colors: { grow: '#111111', fall: '#222222' }, perScale: { love: { grow: 'pal:accent', fallMax: '#abcdef' }, junk: { grow: 'zzz' } } });
  assert.deepEqual(Object.keys(cfg.perScale), ['love'], 'пустые и битые не хранятся');
  assert.equal(stickerLook(30, 'love', cfg).color, 'var(--pud-rose)');
  assert.equal(stickerLook(-30, 'love', cfg).color, '#222222', 'падение — общее');
  assert.equal(stickerLook(-99, 'love', cfg).color, '#abcdef', 'своё «падение выше 90»');
  assert.equal(stickerLook(30, 'trust', cfg).color, '#111111', 'у другого значка — общее');
});

test('настройки стикеров: по умолчанию стикеры, рост — мята, падение — опасное; дополнительные цвета можно снять; шкал на линию сколько угодно', () => {
  const n = normalizeRelGraph({});
  assert.equal(n.stickers.mode, 'stickers');
  assert.equal(n.stickers.colors.grow, 'pal:mint');
  assert.equal(n.stickers.colors.fall, 'pal:danger');
  assert.equal(n.stickers.colors.growMax, '');
  assert.equal(normalizeStickers({ mode: 'bars' }).mode, 'bars');
  assert.equal(normalizeStickers({ mode: 'что-то' }).mode, 'stickers');
  const many = Array.from({ length: 12 }, (_, index) => `s${index}`);
  assert.equal(normalizeRelGraph({ lineScales: { a: many } }).lineScales.a.length, 12, 'больше пяти');
  assert.equal(normalizeRelGraph({ scaleIds: many }).scaleIds.length, 12);
});
