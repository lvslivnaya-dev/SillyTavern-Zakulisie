/** Свои иконки и свой экран загрузки: что проверяется до того, как попасть в разметку, и как это встаёт на место. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import { ICON_LIMITS, customIcon, isIconData, normalizeIcons, setCustomIcons } from '../src/shared/custom-icons.js';
import { mediaKindOf, mediaProblem, normalizeLoading } from '../src/pud/core/custom-media.js';
import { applyCustomIcons, injectSprite } from '../src/pud/ui/icons.js';
import { ICON_COPYRIGHT, startIconStudio } from '../src/pud/ui/icon-studio.js';
import { LOADING_COPYRIGHT, decorateLoader, loadingMarkup, startLoadingScreen } from '../src/pud/ui/loading-screen.js';

const PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==';

test('своя иконка: только маленькая png/webp/jpeg в base64, svg, скрипты и чужие ссылки не проходят', () => {
  assert.equal(isIconData(PNG), true);
  for (const bad of ['data:image/svg+xml;base64,PHN2Zz48L3N2Zz4=', 'javascript:alert(1)', 'https://example.com/a.png', 'data:image/png;base64,AAAA"onload="x', `data:image/png;base64,${'A'.repeat(ICON_LIMITS.bytes)}`, 5, null]) {
    assert.equal(isIconData(bad), false, String(bad).slice(0, 30));
  }
  const map = normalizeIcons({ pud: { gear: PNG, 'bad name': PNG, user: 'https://x/y.png' }, studio: { chevron: PNG }, other: { a: PNG } });
  assert.deepEqual(Object.keys(map.pud), ['gear']);
  assert.deepEqual(Object.keys(map.studio), ['chevron']);
  setCustomIcons(map);
  assert.equal(customIcon('studio', 'chevron'), PNG);
  setCustomIcons(null);
  assert.equal(customIcon('studio', 'chevron'), '');
});

test('спрайт: своя картинка встаёт на место рисунка в символе, сброс возвращает рисунок', () => {
  const { document } = new JSDOM('<body></body>').window;
  injectSprite(document);
  const symbol = () => document.getElementById('pud-i-gear');
  const original = symbol().innerHTML;
  applyCustomIcons(document, { gear: PNG });
  assert.match(symbol().innerHTML, /<image/);
  assert.ok(symbol().innerHTML.includes(PNG));
  applyCustomIcons(document, {});
  assert.equal(symbol().innerHTML, original);
  applyCustomIcons(document, { gear: 'javascript:alert(1)' });
  assert.equal(symbol().innerHTML, original, 'непроверенная ссылка в разметку не попадает');
});

test('вкладка «Иконки»: подпись про авторское право, плитки обоих наборов, сброс одной и всех', () => {
  const { document } = new JSDOM('<body></body>').window;
  injectSprite(document);
  const settings = { icons: { pud: { gear: PNG }, studio: { chevron: PNG } } };
  let saved = 0;
  const pane = document.createElement('div');
  const hub = { addTab: () => ({ pane, remove() {} }) };
  const undo = startIconStudio(document, { settings, save: () => { saved += 1; }, hub });
  assert.ok(pane.textContent.includes(ICON_COPYRIGHT.slice(0, 40)), 'авторское право упомянуто');
  assert.ok(pane.querySelectorAll('.pud-icotile').length > 80, 'иконки Закулисья и окна Кулис');
  assert.equal(pane.querySelectorAll('.pud-icotile.own').length, 2);
  assert.match(document.getElementById('pud-i-gear').innerHTML, /<image/, 'своя иконка сразу в спрайте');
  pane.querySelector('[data-reset="pud:gear"]').click();
  assert.equal(settings.icons.pud.gear, undefined);
  assert.equal(saved, 1);
  assert.ok(!document.getElementById('pud-i-gear').innerHTML.includes('<image'));
  pane.querySelector('[data-reset-all]').click();
  assert.deepEqual(settings.icons, { pud: {}, studio: {} });
  undo();
});

test('файл для экрана загрузки: картинка, гифка и видео подходят, остальное и слишком большое нет', () => {
  assert.deepEqual(mediaKindOf({ name: 'a.gif', type: 'image/gif' }), { kind: 'image', ext: 'gif' });
  assert.deepEqual(mediaKindOf({ name: 'a.mp4', type: 'video/mp4' }), { kind: 'video', ext: 'mp4' });
  assert.deepEqual(mediaKindOf({ name: 'clip.WEBM', type: '' }), { kind: 'video', ext: 'webm' });
  assert.equal(mediaKindOf({ name: 'a.exe', type: 'application/x-msdownload' }), null);
  assert.equal(mediaKindOf({ name: 'a.svg', type: 'image/svg+xml' }), null, 'svg сюда не берём');
  assert.match(mediaProblem({ name: 'a.exe', type: '' }), /не подходит/);
  assert.match(mediaProblem({ name: 'a.mp4', type: 'video/mp4', size: 90 * 1024 * 1024 }), /слишком большой/);
  assert.equal(mediaProblem({ name: 'a.gif', type: 'image/gif', size: 1000 }), null);
});

test('настройки загрузки: чужая ссылка не принимается, без файла выключено, мусор приводится к нормальному', () => {
  assert.equal(normalizeLoading({ enabled: true, src: 'https://example.com/a.gif' }).enabled, false);
  assert.equal(normalizeLoading({ enabled: true, src: '/user/files/../../x.gif' }).src, '');
  const ok = normalizeLoading({ enabled: true, src: '/user/files/zakulisie-loading-a1.mp4', kind: 'video', size: 'huge', bg: 'neon', text: '  Привет   мир ' });
  assert.deepEqual([ok.enabled, ok.kind, ok.size, ok.bg, ok.text], [true, 'video', 'm', 'theme', 'Привет мир']);
});

test('экран загрузки: свой слой поверх загрузчика — видео без звука по кругу, подпись текстом, размер; выключено — не тронуто; слой уходит вместе с загрузчиком', async () => {
  const dom = new JSDOM('<body><div id="loader"><div id="load-spinner"></div></div></body>', { pretendToBeVisual: true });
  const { document } = dom.window;
  const loader = document.getElementById('loader');
  const options = { enabled: true, src: '/user/files/zakulisie-loading-a1.mp4', kind: 'video', size: 'l', text: 'Занавес <b>поднимается</b>', bg: 'dark' };
  assert.equal(decorateLoader(loader, { ...options, enabled: false }), null);
  assert.equal(document.querySelector('.pud-load-overlay'), null);
  const overlay = decorateLoader(loader, options);
  assert.ok(overlay && overlay.parentNode === document.body, 'слой лежит в body, а не внутри окна загрузки таверны');
  assert.ok(loader.classList.contains('pud-load-custom'));
  const video = overlay.querySelector('video.pud-load-media');
  assert.ok(video && video.hasAttribute('muted') && video.hasAttribute('loop') && video.hasAttribute('autoplay'));
  assert.equal(overlay.querySelector('.pud-load-text').textContent, 'Занавес <b>поднимается</b>', 'подпись текстом, не разметкой');
  assert.equal(overlay.querySelector('.pud-load-text b'), null);
  assert.equal(overlay.style.getPropertyValue('--pud-load-size'), '420px');
  assert.equal(decorateLoader(loader, options), null, 'второй раз не дублируется');
  assert.equal(document.querySelectorAll('.pud-load-overlay').length, 1);
  assert.match(loadingMarkup({ ...options, kind: 'image', src: '/user/files/a.gif' }), /<img class="pud-load-media" src="\/user\/files\/a\.gif"/);
  loader.style.opacity = '0';
  await new Promise(resolve => setTimeout(resolve, 20));
  assert.equal(overlay.style.opacity, '0', 'слой гаснет вместе с загрузчиком');
  loader.remove();
  await new Promise(resolve => setTimeout(resolve, 20));
  assert.equal(document.querySelector('.pud-load-overlay'), null, 'загрузчик убран — слой тоже');
});

test('вкладка «Загрузка»: авторское право, оверлей, который таверна создаст позже, получает свою картинку', async () => {
  const dom = new JSDOM('<body></body>', { pretendToBeVisual: true });
  const { document } = dom.window;
  const settings = { loading: { enabled: true, src: '/user/files/zakulisie-loading-a1.gif', kind: 'image', path: 'user/files/zakulisie-loading-a1.gif', name: 'a.gif', size: 'm' } };
  const pane = document.createElement('div');
  const undo = startLoadingScreen(document, { context: {}, settings, save() {}, hub: { addTab: () => ({ pane, remove() {} }) } });
  assert.ok(pane.textContent.includes(LOADING_COPYRIGHT.slice(0, 40)), 'авторское право упомянуто');
  assert.ok(pane.querySelector('[data-load-preview]') && pane.querySelector('[data-load-remove]'));
  const loader = document.createElement('div');
  loader.id = 'loader';
  document.body.append(loader);
  await new Promise(resolve => setTimeout(resolve, 20));
  assert.ok(document.querySelector('.pud-load-overlay img.pud-load-media'), 'загрузчик, появившийся позже, получает свой слой');
  undo();
});

test('заставка запуска: css для data/_css/user.css меняет значок, шестерёнку и подпись; подпись и ссылка не ломают css; блок заменяется, а не копится', async () => {
  const { splashCss, mergeSplashCss, SPLASH_BEGIN, SPLASH_END } = await import('../src/pud/core/custom-media.js');
  const full = splashCss({ src: '/user/files/a1.png', kind: 'image', size: 'full', fit: 'cover', bg: 'dark', text: 'Занавес "поднимается"; } body { display: none' });
  assert.match(full, /#preloader \{[^}]*background-image: url\("\/user\/files\/a1\.png"\)/);
  assert.match(full, /\.splash-logo \{ display: none; \}/);
  assert.match(full, /#loader\.splash-screen #load-spinner \{ display: none; \}/);
  assert.ok(!full.includes('} body'), 'подпись не может вырваться из строки css');
  const small = splashCss({ src: '/user/files/a1.gif', kind: 'image', size: 'm', spinner: true });
  assert.match(small, /\.splash-logo \{ content: url\("\/user\/files\/a1\.gif"\); width: min\(240px/);
  assert.ok(!small.includes('load-spinner'), 'шестерёнка оставлена');
  assert.match(small, /\.splash-message \{ display: none; \}/, 'без подписи сообщение прячется');
  assert.equal(splashCss({ src: 'https://example.com/a.gif' }), '', 'чужая ссылка не попадает в css');
  const once = mergeSplashCss('/* мои стили */\nbody { color: red; }\n', full);
  assert.ok(once.includes('body { color: red; }') && once.includes(SPLASH_BEGIN));
  const twice = mergeSplashCss(once, small);
  assert.equal(twice.split(SPLASH_BEGIN).length, 2, 'блок один');
  assert.ok(twice.includes('body { color: red; }') && twice.includes('a1.gif') && !twice.includes('a1.png'));
  const removed = mergeSplashCss(twice, '');
  assert.ok(!removed.includes(SPLASH_END) && removed.includes('body { color: red; }'));
});
