import test from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import { addMediaItem, emptyMedia, normalizeMedia, parseMediaLink, removeMediaItem, searchMedia, updateMediaItem } from '../src/core/index.js';
import { createMediaDock } from '../src/ui/media-dock.js';

test('ссылки: сервис узнаётся сам и получает адрес встроенного плеера', () => {
  const cases = [
    ['https://www.youtube.com/watch?v=dQw4w9WgXcQ', 'youtube', 'https://www.youtube.com/embed/dQw4w9WgXcQ'],
    ['https://youtu.be/dQw4w9WgXcQ', 'youtube', 'https://www.youtube.com/embed/dQw4w9WgXcQ'],
    ['https://www.youtube.com/playlist?list=PL123', 'youtube', 'https://www.youtube.com/embed/videoseries?list=PL123'],
    ['https://music.youtube.com/watch?v=abc&list=RD1', 'ytmusic', 'https://www.youtube.com/embed/abc?list=RD1'],
    ['https://open.spotify.com/track/4uLU6hMCjMI75M1A2tKUQC?si=x', 'spotify', 'https://open.spotify.com/embed/track/4uLU6hMCjMI75M1A2tKUQC'],
    ['https://open.spotify.com/intl-ru/playlist/37i9dQZF1DX', 'spotify', 'https://open.spotify.com/embed/playlist/37i9dQZF1DX'],
    ['https://music.yandex.ru/album/123/track/456', 'yandex', 'https://music.yandex.ru/iframe/track/456/123'],
    ['https://music.yandex.ru/users/ann/playlists/1000', 'yandex', 'https://music.yandex.ru/iframe/playlist/ann/1000'],
  ];
  for (const [url, service, embed] of cases) {
    const parsed = parseMediaLink(url);
    assert.equal(parsed.service, service, url);
    assert.equal(parsed.kind, 'iframe', url);
    assert.equal(parsed.embed, embed, url);
  }
  assert.match(parseMediaLink('https://soundcloud.com/artist/track').embed, /^https:\/\/w\.soundcloud\.com\/player\/\?url=https%3A%2F%2Fsoundcloud\.com%2Fartist%2Ftrack/);
  assert.deepEqual([parseMediaLink('https://x.org/a.mp3').service, parseMediaLink('https://x.org/a.mp3').kind], ['file', 'audio']);
  assert.equal(parseMediaLink('https://x.org/a.webm').kind, 'video');
  assert.equal(parseMediaLink('https://bandcamp.com/album/x').kind, 'link', 'что нельзя встроить, открывается отдельно');
  assert.equal(parseMediaLink('youtu.be/abc').embed, 'https://www.youtube.com/embed/abc', 'без https тоже понятно');
  for (const bad of ['', 'просто слова', 'javascript:alert(1)', 'ftp://x.org/a.mp3']) assert.equal(parseMediaLink(bad), null, bad);
});

test('библиотека: добавить, не дублировать, закрепить, найти, изменить адрес, удалить', () => {
  let { library, item } = addMediaItem(emptyMedia(), { url: 'https://youtu.be/abc', title: 'Погоня' });
  assert.equal(item.service, 'youtube');
  const again = addMediaItem(library, { url: 'https://youtu.be/abc' });
  assert.equal(again.existed, true); assert.equal(again.library.items.length, 1);
  const second = addMediaItem(library, { url: 'https://open.spotify.com/track/xyz', note: 'тихая' });
  library = second.library;
  assert.equal(second.item.title, 'Spotify', 'без названия — имя сервиса');
  library = updateMediaItem(library, second.item.id, { pinned: true, mood: 'нежность' });
  assert.deepEqual(searchMedia(library).map(entry => entry.id), [second.item.id, item.id], 'закреплённое сверху');
  assert.deepEqual(searchMedia(library, 'нежн').map(entry => entry.id), [second.item.id]);
  library = updateMediaItem(library, item.id, { url: 'https://soundcloud.com/a/b' });
  assert.equal(library.items.find(entry => entry.id === item.id).service, 'soundcloud');
  assert.throws(() => updateMediaItem(library, item.id, { url: 'не ссылка' }), /не ссылка/);
  assert.throws(() => addMediaItem(library, { url: 'abc' }), /не ссылка/);
  assert.equal(removeMediaItem(library, item.id).items.length, 1);
  assert.deepEqual(normalizeMedia({ items: [{ url: 'мусор' }, { id: 'a', url: 'https://youtu.be/q' }, { id: 'a', url: 'https://youtu.be/w' }] }).items.map(entry => entry.id).length, 2, 'битое уходит, одинаковые id чинятся');
});

test('плеер: встроенный плеер сервиса или файл внутри страницы, ссылка без встраивания открывается отдельно, закрытие убирает звук', () => {
  const { window } = new JSDOM('<!doctype html><head></head><body></body>', { pretendToBeVisual: true });
  const opened = [];
  window.open = (...args) => { opened.push(args[0]); };
  const dock = createMediaDock(window.document);
  const yt = { id: '1', title: 'Погоня', url: 'https://youtu.be/abc' };
  assert.equal(dock.play(yt), true);
  const root = window.document.getElementById('ku-media-dock');
  assert.equal(root.hidden, false);
  assert.equal(root.querySelector('iframe').src, 'https://www.youtube.com/embed/abc');
  assert.equal(root.querySelector('.ku-md-title').textContent, 'Погоня');
  assert.equal(dock.current().id, '1');
  assert.equal(dock.play({ id: '2', title: 'Файл', url: 'https://x.org/a.mp3' }), true);
  assert.equal(root.querySelector('iframe'), null); assert.ok(root.querySelector('audio'));
  assert.equal(dock.play({ id: '3', title: 'Bandcamp', url: 'https://bandcamp.com/album/x' }), false);
  assert.deepEqual(opened, ['https://bandcamp.com/album/x']);
  assert.equal(dock.current().id, '2', 'то, что играло, продолжает играть');
  root.querySelector('[data-md="close"]').click();
  assert.equal(root.hidden, true); assert.equal(root.querySelector('audio'), null); assert.equal(dock.current(), null);
  dock.destroy();
  assert.equal(window.document.getElementById('ku-media-dock'), null);
});

test('название ссылки: сервис говорит его сам, у файла берётся имя, у остальных — пусто, ошибки не страшны', async () => {
  const { lookupMediaTitle, titleFromFile } = await import('../src/integration/media-title.js');
  const answer = data => async () => ({ ok: true, json: async () => data });
  assert.equal(await lookupMediaTitle('https://youtu.be/abc', { fetcher: answer({ title: 'Погоня  (Official)' }) }), 'Погоня (Official)');
  assert.equal(await lookupMediaTitle('https://soundcloud.com/a/b', { fetcher: answer({ title: 'Дождь', author_name: 'Ann' }) }), 'Дождь — Ann');
  assert.equal(await lookupMediaTitle('https://x.org/rain_on%20window.mp3'), 'rain on window');
  assert.equal(titleFromFile('https://x.org/a/Ночной%20город.ogg'), 'Ночной город');
  assert.equal(await lookupMediaTitle('https://bandcamp.com/album/x', { fetcher: answer({ title: 'нет' }) }), '', 'такой сайт не спрашиваем');
  assert.equal(await lookupMediaTitle('https://youtu.be/abc', { fetcher: async () => { throw new Error('сеть'); } }), '');
  assert.equal(await lookupMediaTitle('https://youtu.be/abc', { fetcher: async () => ({ ok: false }) }), '');
  assert.equal(await lookupMediaTitle('не ссылка'), '');
});

test('плеер: полосу можно тащить, место запоминается и не уходит за окно', () => {
  const { window } = new JSDOM('<!doctype html><head></head><body></body>', { pretendToBeVisual: true, url: 'http://localhost/' });
  Object.defineProperty(window, 'innerWidth', { value: 1000, configurable: true });
  Object.defineProperty(window, 'innerHeight', { value: 700, configurable: true });
  const dock = createMediaDock(window.document);
  dock.play({ id: '1', title: 'Погоня', url: 'https://youtu.be/abc' });
  const root = window.document.getElementById('ku-media-dock');
  const bar = root.querySelector('.ku-md-bar');
  const fire = (target, type, x, y) => target.dispatchEvent(new window.MouseEvent(type, { bubbles: true, cancelable: true, clientX: x, clientY: y, button: 0 }));
  fire(bar, 'pointerdown', 10, 10);
  assert.ok(root.classList.contains('ku-md-drag'));
  fire(window, 'pointermove', 310, 210);
  fire(window, 'pointerup', 310, 210);
  assert.equal(root.classList.contains('ku-md-drag'), false);
  assert.equal(root.style.left, '300px'); assert.equal(root.style.top, '200px');
  assert.deepEqual(JSON.parse(window.localStorage.getItem('ku-media-dock-pos')), { left: 300, top: 200 });
  fire(bar, 'pointerdown', 310, 210);
  fire(window, 'pointermove', 9000, 9000);
  fire(window, 'pointerup', 9000, 9000);
  assert.ok(parseInt(root.style.left, 10) < 1000 && parseInt(root.style.top, 10) < 700, 'за окно не уходит');
  dock.destroy();
  const again = createMediaDock(window.document);
  again.play({ id: '1', title: 'Погоня', url: 'https://youtu.be/abc' });
  assert.ok(window.document.getElementById('ku-media-dock').style.left, 'место вспомнилось');
  again.destroy();
});

test('вкладка шторки «Плеер»: список с поиском, играет, закрепляется, останавливается', async () => {
  const { renderMediaPane } = await import('../src/ui/media-pane.js');
  const { window } = new JSDOM('<!doctype html><body><div id="c"></div></body>');
  const box = window.document.getElementById('c');
  let library = emptyMedia();
  library = addMediaItem(library, { url: 'https://youtu.be/a', title: 'Погоня', mood: 'тревога' }).library;
  library = addMediaItem(library, { url: 'https://open.spotify.com/track/x', title: 'Нежность', pinned: true }).library;
  const calls = [];
  const draw = (extra = {}) => renderMediaPane(box, { library, query: '', onPlay: id => calls.push(['play', id]), onStop: () => calls.push(['stop']), onPin: id => calls.push(['pin', id]), onQuery: value => calls.push(['q', value]), onOpenPage: () => calls.push(['page']), ...extra });
  draw();
  const rows = [...box.querySelectorAll('.pud-media-row')];
  assert.deepEqual(rows.map(row => row.querySelector('.pud-media-title').textContent), ['Нежность', 'Погоня'], 'закреплённое сверху');
  assert.equal(box.querySelector('.pud-media-now').textContent, 'Ничего не играет');
  rows[1].querySelector('[data-mp="play"]').click();
  rows[1].querySelector('[data-mp="pin"]').click();
  box.querySelector('[data-mp="add"]').click();
  const search = box.querySelector('input[type="search"]');
  search.value = 'тревог';
  search.dispatchEvent(new window.Event('change', { bubbles: true }));
  assert.deepEqual(calls.map(call => call[0]), ['play', 'pin', 'page', 'q']);
  assert.equal(calls[0][1], library.items[0].id);
  draw({ nowId: library.items[0].id, nowTitle: 'Погоня', query: 'тревог' });
  assert.equal(box.querySelectorAll('.pud-media-row').length, 1, 'поиск по настроению');
  assert.ok(box.querySelector('.pud-media-row.playing'));
  box.querySelector('[data-mp="stop"]').click();
  assert.deepEqual(calls.at(-1), ['stop']);
});

test('плеер: рядом с открытой шторкой стоит у её панели, закрытая прячет, нет шторки — плавает; картинка трека по кнопке', async () => {
  const { window } = new JSDOM('<!doctype html><head></head><body><div id="ku-scene-chips" class="open"><div class="ku-rail"></div><div class="ku-panel"><div class="ku-dir-body"></div></div></div></body>', { pretendToBeVisual: true, url: 'http://localhost/' });
  const doc = window.document;
  const wait = () => new Promise(resolve => setTimeout(resolve, 20));
  const dock = createMediaDock(doc);
  dock.play({ id: '1', title: 'Погоня', url: 'https://youtu.be/abc', image: 'covers/a.png' });
  const root = doc.getElementById('ku-media-dock');
  assert.equal(root.parentElement, doc.body, 'плеер не переезжает внутрь шторки (звук не перезагружается)');
  assert.ok(root.classList.contains('ku-md-docked') && !root.classList.contains('ku-md-away'));
  assert.ok(root.style.left && root.style.top, 'встал у панели');
  root.querySelector('.ku-md-bar').dispatchEvent(new window.MouseEvent('pointerdown', { bubbles: true, cancelable: true, clientX: 5, clientY: 5, button: 0 }));
  assert.equal(root.classList.contains('ku-md-drag'), false, 'прикреплённый не таскается');
  // the picture: there is a button, it is off until asked for
  assert.ok(root.classList.contains('ku-md-hascover'));
  assert.equal(root.classList.contains('ku-md-covered'), false);
  root.querySelector('[data-md="cover"]').click();
  assert.ok(root.classList.contains('ku-md-covered'));
  assert.ok(root.querySelector('img.ku-md-cover'));
  root.querySelector('[data-md="cover"]').click();
  assert.equal(root.classList.contains('ku-md-covered'), false);
  // a track without a picture has no button
  dock.play({ id: '2', title: 'Тихо', url: 'https://youtu.be/def' });
  assert.equal(root.classList.contains('ku-md-hascover'), false);
  // the drawer shut: out of sight, the music goes on
  const bar = doc.getElementById('ku-scene-chips');
  bar.classList.remove('open');
  await wait();
  assert.ok(root.classList.contains('ku-md-away'));
  assert.ok(root.querySelector('iframe'), 'музыка не остановлена');
  bar.classList.add('open', 'ku-side-right');
  await wait();
  assert.equal(root.classList.contains('ku-md-away'), false);
  bar.remove();
  await wait();
  assert.equal(root.classList.contains('ku-md-docked'), false, 'шторки нет — плавает');
  dock.destroy();
});

test('подбор: настроение сцены из героев на сцене, погоды и времени; ссылка подходит по словам своего поля', async () => {
  const { sceneMoods, suggestMedia, MOODS_LIST } = await import('../src/core/index.js').then(async core => ({ ...core, MOODS_LIST: (await import('../src/pud/core/moods.js')).MOODS }));
  const list = MOODS_LIST;
  const moods = { Сатору: { mood: 'scared' }, Гето: { mood: 'tense' }, Нанами: { mood: 'happy' } };
  const scene = sceneMoods({ moods, present: ['Сатору', 'Гето'], list, weather: 'storm', time: '23:40' });
  assert.deepEqual(scene.map(item => item.id).slice(0, 2), ['scared', 'tense'], 'Нанами не на сцене — её радость не считается');
  assert.ok(scene.some(item => item.id === 'tired'), 'ночь добавляет усталость');
  let library = emptyMedia();
  library = addMediaItem(library, { url: 'https://youtu.be/a', title: 'Утро', mood: 'радость, свет' }).library;
  const chase = addMediaItem(library, { url: 'https://youtu.be/b', title: 'Погоня', mood: 'тревога, напряжение' });
  library = chase.library;
  const best = suggestMedia(library, scene);
  assert.equal(best.item.title, 'Погоня');
  assert.equal(suggestMedia(library, scene, { playing: chase.item.id }), null, 'то, что играет, не предлагаем; а «Утро» не подходит');
  assert.equal(suggestMedia(library, scene, { dismissed: [chase.item.id] }), null, 'отклонённое не возвращается');
  assert.equal(suggestMedia(library, []), null, 'нет настроения — нет предложения');
  const calm = sceneMoods({ moods: { Нанами: { mood: 'happy' } }, present: [], list });
  assert.equal(suggestMedia(library, calm).item.title, 'Утро', 'без списка присутствующих считаются все известные');
});

test('вкладка «Медиа» шторки: строка «подходит» включается и отклоняется', async () => {
  const { renderMediaPane } = await import('../src/ui/media-pane.js');
  const { window } = new JSDOM('<!doctype html><body><div id="c"></div></body>');
  const box = window.document.getElementById('c');
  const library = addMediaItem(emptyMedia(), { url: 'https://youtu.be/b', title: 'Погоня', mood: 'тревога' }).library;
  const calls = [];
  renderMediaPane(box, { library, suggestion: { id: library.items[0].id, title: 'Погоня', reason: 'боится' }, onPlay: id => calls.push(['play', id]), onDismiss: id => calls.push(['no', id]) });
  assert.match(box.querySelector('.pud-media-offer').textContent, /Погоня.*боится/);
  box.querySelector('[data-mp="suggest"]').click();
  box.querySelector('[data-mp="dismiss"]').click();
  assert.deepEqual(calls.map(call => call[0]), ['play', 'no']);
  renderMediaPane(box, { library, suggestion: null });
  assert.equal(box.querySelector('.pud-media-offer'), null);
});

test('галерея плеера: у ссылки может быть своя картинка (только своя и только с этого сервера), её можно убрать', () => {
  let { library, item } = addMediaItem(emptyMedia(), { url: 'https://youtu.be/abc', title: 'Погоня' });
  assert.equal(item.image, undefined);
  library = updateMediaItem(library, item.id, { image: '/user/images/kulisy-media/cover-1.png' });
  assert.equal(library.items[0].image, '/user/images/kulisy-media/cover-1.png');
  library = updateMediaItem(library, item.id, { title: 'Новое' });
  assert.equal(library.items[0].image, '/user/images/kulisy-media/cover-1.png', 'другие правки картинку не трогают');
  assert.equal(updateMediaItem(library, item.id, { image: 'https://evil.example/x.png' }).items[0].image, undefined, 'чужая ссылка не принимается');
  assert.equal(updateMediaItem(library, item.id, { image: '' }).items[0].image, undefined, 'пустое убирает');
});

test('плеер в Studio: вид «Галерея» показывает плитки с картинкой, клик играет, переключатель запоминается', async () => {
  const dom = new JSDOM('<!doctype html><body></body>', { pretendToBeVisual: true });
  const { window } = dom;
  const saved = {};
  for (const name of ['window', 'document', 'getComputedStyle']) saved[name] = globalThis[name];
  globalThis.window = window; globalThis.document = window.document; globalThis.getComputedStyle = window.getComputedStyle.bind(window);
  for (const name of Object.getOwnPropertyNames(window)) if (/^[A-Z]/.test(name) && typeof window[name] === 'function') { try { globalThis[name] = window[name]; } catch { /* read-only */ } }
  globalThis.requestAnimationFrame = callback => setTimeout(callback, 0);
  try {
    const { createMediaPages } = await import('../src/ui/pages/media.js');
    const library = addMediaItem(addMediaItem(emptyMedia(), { url: 'https://youtu.be/abc', title: 'Погоня' }).library, { url: 'https://youtu.be/def', title: 'Тишина' }).library;
    const withCover = { ...library, items: library.items.map((item, index) => (index === 0 ? { ...item, image: '/user/images/kulisy-media/c.png' } : item)) };
    const calls = [];
    let redraws = 0;
    const ctx = { snapshot: { media: withCover, mediaNow: '' }, render: () => { redraws += 1; }, setStatus() {}, act: async (name, payload) => { calls.push([name, payload]); }, facade: { invoke: () => '' } };
    const pages = createMediaPages(ctx);
    let view = pages.renderPlayer();
    assert.equal(view.querySelectorAll('.ku-media-row').length, 2, 'the list by default');
    [...view.querySelectorAll('.ku-seg button')].find(node => node.textContent === 'Галерея').click();
    view = pages.renderPlayer();
    assert.equal(view.querySelectorAll('.ku-media-tile').length, 2);
    assert.ok(view.querySelector('.ku-media-tile img[src="/user/images/kulisy-media/c.png"]'), 'the cover is on the tile');
    view.querySelector('.ku-media-face').click();
    await new Promise(resolve => setTimeout(resolve, 0));
    assert.equal(calls[0][0], 'onMediaPlay');
  } finally {
    for (const [name, value] of Object.entries(saved)) { if (value === undefined) delete globalThis[name]; else globalThis[name] = value; }
  }
});
