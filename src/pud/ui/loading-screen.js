/**
 * Свой экран загрузки: вместо крутящейся шестерёнки таверны (оверлей #loader: старт страницы, загрузка чата и персонажей)
 * показывается картинка, гифка или видео, по желанию с подписью и своим фоном. Вкладка «Загрузка» в окне настроек Закулисья.
 * Файл кладётся на сервер таверны (/api/files/upload, папка файлов пользователя), в настройках только путь.
 * Расширение подключается уже во время запуска, поэтому самые первые мгновения страницы ещё показывают стандартный экран.
 */
import { report } from '../core/guard.js';
import { LOADING_BACKGROUNDS, LOADING_LIMITS, LOADING_SIZES, mediaKindOf, mediaProblem, normalizeLoading, splashCss } from '../core/custom-media.js';

export const LOADING_COPYRIGHT = 'Загружайте только то, на что у вас есть права: свои работы, материалы с подходящей лицензией или те, что автор разрешил использовать. Чужие гифки, видео и картинки без разрешения брать нельзя, будьте внимательны к авторскому праву. Файл хранится только в папке файлов вашей таверны и никуда не отправляется.';

const SIZE_CSS = { s: '120px', m: '240px', l: '420px' };
const BACKGROUND_CSS = { dark: '#0e0c12', light: '#fbf8f4' };
const escapeHtml = text => String(text ?? '').replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[ch]);

/** Разметка медиа и подписи для настроек (src уже проверен в normalizeLoading: только свой /user/files/…). */
export function loadingMarkup(options) {
  const o = normalizeLoading(options);
  if (!o.src) return '';
  const media = o.kind === 'video'
    ? `<video class="pud-load-media" src="${escapeHtml(o.src)}" autoplay muted loop playsinline disablepictureinpicture></video>`
    : `<img class="pud-load-media" src="${escapeHtml(o.src)}" alt="" draggable="false">`;
  return `${media}${o.text ? `<p class="pud-load-text">${escapeHtml(o.text)}</p>` : ''}`;
}

/** Стиль самого оверлея: фон и размер. Возвращает объект свойств для style. */
export function loadingStyle(options) {
  const o = normalizeLoading(options);
  const background = o.bg === 'color' ? o.color : BACKGROUND_CSS[o.bg] ?? '';
  const [r, g, b] = [1, 3, 5].map(i => Number.parseInt((background || '#000000').slice(i, i + 2), 16));
  const dark = (0.299 * r + 0.587 * g + 0.114 * b) / 255 < 0.55;
  return {
    '--pud-load-size': o.size === 'full' ? '100%' : SIZE_CSS[o.size], '--pud-load-fit': o.size === 'full' ? o.fit : 'contain',
    ...(background ? { '--pud-load-bg': background, '--pud-load-ink': dark ? '#f3eef6' : '#2a2430' } : {}),
  };
}

/**
 * Свой экран: отдельный слой поверх всего (popover в верхнем слое страницы). Внутри #loader его делать нельзя: окно загрузки
 * таверны — это <dialog> с собственными отступами и преобразованиями, и «на весь экран» там съезжало бы.
 * Возвращает слой (с методом close) или null.
 */
export function showLoadingOverlay(doc, options, { clickToClose = false } = {}) {
  const o = normalizeLoading(options);
  if (!o.src) return null;
  const overlay = doc.createElement('div');
  overlay.className = 'pud-load-overlay';
  overlay.classList.toggle('pud-load-full', o.size === 'full');
  for (const [name, value] of Object.entries(loadingStyle(o))) overlay.style.setProperty(name, value);
  overlay.innerHTML = `${loadingMarkup(o)}${o.spinner ? '<div class="pud-load-gear fa-solid fa-gear fa-spin fa-2x" aria-hidden="true"></div>' : ''}`;
  overlay.setAttribute('popover', 'manual');
  doc.body.append(overlay);
  // верхний слой страницы: выше окна загрузки таверны; в браузерах без popover просто самый высокий z-index (см. css)
  try { overlay.showPopover?.(); } catch { /* ничего */ }
  overlay.close = () => { try { overlay.hidePopover?.(); } catch { /* ничего */ } overlay.remove(); };
  if (clickToClose) {
    overlay.classList.add('pud-load-preview');
    overlay.title = 'Нажмите, чтобы закрыть';
    overlay.addEventListener('click', () => overlay.close());
  }
  return overlay;
}

/**
 * Оверлей #loader таверны: прячем её шестерёнку и ставим поверх свой слой. Слой гаснет вместе с загрузчиком
 * (таверна гасит его прозрачностью) и исчезает, когда загрузчик убран. Возвращает слой или null.
 */
export function decorateLoader(loader, options) {
  if (!loader || loader.dataset.pudLoad === '1') return null;
  const o = normalizeLoading(options);
  if (!o.enabled) return null;
  const doc = loader.ownerDocument;
  // заставка уже сменена через data/_css/user.css (--pud-splash-css): второй слой поверх не нужен, шестерёнка прячется самим css
  if (doc.defaultView.getComputedStyle(doc.documentElement).getPropertyValue('--pud-splash-css').trim() === '1') {
    loader.dataset.pudLoad = '1';
    return null;
  }
  const overlay = showLoadingOverlay(doc, o);
  if (!overlay) return null;
  loader.dataset.pudLoad = '1';
  loader.classList.add('pud-load-custom');
  const mirror = () => { overlay.style.opacity = loader.style.opacity || ''; };
  const watcher = new doc.defaultView.MutationObserver(() => {
    if (!loader.isConnected) { watcher.disconnect(); overlay.close(); return; }
    mirror();
  });
  watcher.observe(loader, { attributes: true, attributeFilter: ['style'] });
  // убрали самого загрузчика (родитель за ним) — проверяем и по документу
  const gone = new doc.defaultView.MutationObserver(() => {
    if (!loader.isConnected) { gone.disconnect(); watcher.disconnect(); overlay.close(); }
  });
  gone.observe(doc.body, { childList: true, subtree: true });
  overlay.stopWatching = () => { watcher.disconnect(); gone.disconnect(); };
  return overlay;
}

let watching = null;

/**
 * Следит за оверлеем #loader таверны и ставит на него свой слой. Один наблюдатель на страницу: его можно запустить рано
 * (до всех модулей, как только загрузится расширение), а вкладка «Загрузка» потом просто подхватывает его.
 * getOptions() каждый раз отдаёт свежие настройки. Возвращает функцию остановки.
 */
export function watchLoader(doc, getOptions) {
  if (watching) { watching.getOptions = getOptions; return watching.stop; }
  const view = doc.defaultView;
  const handle = node => {
    const loader = node?.id === 'loader' ? node : node?.querySelector?.('#loader');
    if (!loader) return;
    try { decorateLoader(loader, (watching?.getOptions ?? getOptions)()); } catch (error) { report('экран загрузки', error); }
  };
  const observer = new view.MutationObserver(records => {
    for (const record of records) for (const node of record.addedNodes) if (node.nodeType === 1) handle(node);
  });
  observer.observe(doc.body, { childList: true, subtree: true });
  const state = { getOptions, stop() { observer.disconnect(); watching = null; } };
  const handleNow = () => handle(doc.body);
  watching = state;
  state.getOptions = getOptions;
  handleNow();
  return state.stop;
}

/**
 * @param {Document} doc
 * @param {{ context: any, settings: any, save: () => void, hub?: { addTab: Function } }} deps
 */
export function startLoadingScreen(doc, { context, settings, save, hub }) {
  const view = doc.defaultView;
  const options = () => normalizeLoading(settings.loading);
  const persist = () => { try { save(); } catch (error) { report('экран загрузки: сохранение', error); } };

  // оверлей создаёт таверна, и не один раз (старт, чат, персонажи): смотрим за появлением #loader
  const stopWatching = watchLoader(doc, () => settings.loading);

  const tab = hub?.addTab('loading', 'Загрузка', 'update');
  const pane = tab?.pane;
  let notice = '';
  let busy = false;
  let previewing = null;

  const post = async (url, body) => {
    const headers = context?.getRequestHeaders?.() ?? { 'Content-Type': 'application/json' };
    const response = await view.fetch(url, { method: 'POST', headers, body: JSON.stringify(body) });
    if (!response.ok) throw new Error(`Таверна ответила ${response.status}`);
    return response;
  };
  const toBase64 = file => new Promise((resolve, reject) => {
    const reader = new view.FileReader();
    reader.onload = () => resolve(String(reader.result).slice(String(reader.result).indexOf(',') + 1));
    reader.onerror = () => reject(new Error('Файл не прочитался.'));
    reader.readAsDataURL(file);
  });
  const removeFile = async path => { if (path) { try { await post('/api/files/delete', { path }); } catch (error) { report('экран загрузки: старый файл не удалился', error); } } };

  const upload = async file => {
    const problem = mediaProblem(file);
    if (problem) throw new Error(problem);
    const { kind, ext } = mediaKindOf(file);
    const name = `zakulisie-loading-${Date.now().toString(36)}.${ext}`;
    const response = await post('/api/files/upload', { name, data: await toBase64(file) });
    const data = await response.json().catch(() => null);
    const path = String(data?.path ?? `user/files/${name}`).replace(/\\/g, '/').replace(/^\/+/, '');
    const previous = options().path;
    settings.loading = { ...settings.loading, enabled: true, src: `/${path}`, path, kind, name: String(file.name ?? name).slice(0, 120) };
    persist();
    if (previous && previous !== path) await removeFile(previous);
  };

  const preview = () => {
    previewing?.close?.();
    const o = options();
    if (!o.src) return;
    const overlay = showLoadingOverlay(doc, { ...o, enabled: true }, { clickToClose: true });
    previewing = overlay;
    view.setTimeout(() => { if (previewing === overlay) { overlay.close(); previewing = null; } }, 6000);
  };

  const render = () => {
    if (!pane) return;
    const o = options();
    const sizeOptions = Object.entries(LOADING_SIZES).map(([key, title]) => `<option value="${key}"${o.size === key ? ' selected' : ''}>${title}</option>`).join('');
    const bgOptions = Object.entries(LOADING_BACKGROUNDS).map(([key, title]) => `<option value="${key}"${o.bg === key ? ' selected' : ''}>${title}</option>`).join('');
    pane.innerHTML = `
      <div class="pud-card pud-card-col">
        <div>
          <b>Свой экран загрузки</b>
          <p class="pud-hint">Вместо шестерёнки, которая крутится при запуске таверны и загрузке чатов, можно показывать свою картинку, гифку или короткое видео (MP4, WebM; видео идёт без звука и по кругу). Самые первые мгновения страницы всё равно покажут стандартный экран: расширение включается чуть позже.</p>
          <p class="pud-hint pud-copyright"><b>Об авторском праве.</b> ${escapeHtml(LOADING_COPYRIGHT)}</p>
          ${notice ? `<p class="pud-hint pud-icon-note">${escapeHtml(notice)}</p>` : ''}
        </div>
        <div class="pud-native-btns">
          <label class="menu_button" title="Картинка до ${LOADING_LIMITS.imageBytes / 1048576} МБ, видео до ${LOADING_LIMITS.videoBytes / 1048576} МБ">${busy ? 'Загружаю…' : (o.src ? 'Заменить файл' : 'Выбрать файл')}<input type="file" accept="image/*,video/mp4,video/webm" hidden data-load-file ${busy ? 'disabled' : ''}></label>
          ${o.src ? '<button type="button" class="menu_button" data-load-preview>Посмотреть</button><button type="button" class="menu_button" data-load-remove>Убрать файл</button>' : ''}
        </div>
        ${o.src ? `<p class="pud-hint">Сейчас: ${escapeHtml(o.name || o.src)} (${o.kind === 'video' ? 'видео' : 'картинка'}). <b>${o.enabled ? 'Экран загрузки включён.' : 'Экран загрузки ВЫКЛЮЧЕН: поставьте галочку ниже, иначе при запуске будет стандартная шестерёнка (кнопка «Посмотреть» показывает картинку и выключенной).'}</b></p>
        <div class="pud-native-btns"><label class="pud-opt"><span>Показывать вместо шестерёнки</span><input type="checkbox" data-load="enabled" ${settings.loading?.enabled ? 'checked' : ''}></label></div>
        <div class="pud-lookrow">
          <label class="pud-field"><span>Размер</span><select class="text_pole" data-load="size">${sizeOptions}</select></label>
          ${o.size === 'full' ? `<label class="pud-field"><span>Как вписать</span><select class="text_pole" data-load="fit"><option value="contain"${o.fit === 'contain' ? ' selected' : ''}>Целиком, с полями</option><option value="cover"${o.fit === 'cover' ? ' selected' : ''}>Во весь экран, с обрезкой</option></select></label>` : ''}
          <label class="pud-field"><span>Фон</span><select class="text_pole" data-load="bg">${bgOptions}</select></label>
          ${o.bg === 'color' ? `<label class="pud-field"><span>Цвет фона</span><input type="color" data-load="color" value="${o.color}"></label>` : ''}
          <label class="pud-field"><span>Подпись под картинкой</span><input type="text" class="text_pole" maxlength="${LOADING_LIMITS.text}" data-load="text" value="${escapeHtml(o.text)}" placeholder="Например: Подождите, занавес поднимается"></label>
          <label class="pud-opt"><span>Оставить и шестерёнку</span><input type="checkbox" data-load="spinner" ${o.spinner ? 'checked' : ''}></label>
        </div>` : ''}
      </div>
      ${o.src ? `<div class="pud-card pud-card-col">
        <div>
          <b>Самое начало загрузки</b>
          <p class="pud-hint">Первая заставка таверны (значок ST, шестерёнка, «Инициализация…») появляется раньше, чем загружаются расширения, поэтому расширение её изменить не может. Таверна для этого сама подключает файл <code>data/_css/user.css</code> в самом начале страницы. Скопируйте текст ниже и вставьте в конец этого файла (старый блок Закулисья в нём заменяется), потом обновите страницу. Работает с картинкой и гифкой, для видео поменяются только фон и подпись. Настройки размера, фона и подписи берутся отсюда; изменили их: скопируйте текст заново.</p>
          <textarea class="text_pole pud-splash-css" rows="9" readonly data-splash-css>${escapeHtml(splashCss(o))}</textarea>
        </div>
        <div class="pud-native-btns"><button type="button" class="menu_button" data-splash-copy>Скопировать</button></div>
      </div>` : ''}`;
  };
  render();

  const onChange = async event => {
    const input = event.target.closest?.('[data-load-file]');
    if (input) {
      const [file] = input.files ?? [];
      input.value = '';
      if (!file) return;
      busy = true; notice = ''; render();
      try { await upload(file); notice = 'Файл загружен. Нажмите «Посмотреть», чтобы увидеть, как будет.'; }
      catch (error) { notice = error?.message || 'Файл не загрузился.'; }
      busy = false; render();
      return;
    }
    const field = event.target.closest?.('[data-load]');
    if (!field) return;
    const key = field.dataset.load;
    const value = field.type === 'checkbox' ? field.checked : field.value;
    settings.loading = { ...settings.loading, [key]: value };
    persist();
    render();
  };
  const onClick = async event => {
    if (event.target.closest?.('[data-load-preview]')) { preview(); return; }
    if (event.target.closest?.('[data-splash-copy]')) {
      const area = pane.querySelector('[data-splash-css]');
      try { await view.navigator.clipboard.writeText(area.value); notice = 'Скопировано. Вставьте в конец data/_css/user.css и обновите страницу.'; }
      catch { area.focus(); area.select(); notice = 'Текст выделен: нажмите Ctrl+C.'; }
      render();
      return;
    }
    if (!event.target.closest?.('[data-load-remove]')) return;
    const path = options().path;
    settings.loading = { ...settings.loading, enabled: false, src: '', path: '', kind: '', name: '' };
    persist();
    await removeFile(path);
    notice = 'Файл убран, вернулась стандартная шестерёнка.';
    render();
  };
  pane?.addEventListener('change', onChange);
  pane?.addEventListener('click', onClick);

  return () => {
    stopWatching();
    previewing?.close?.();
    pane?.removeEventListener('change', onChange);
    pane?.removeEventListener('click', onClick);
    tab?.remove?.();
  };
}
