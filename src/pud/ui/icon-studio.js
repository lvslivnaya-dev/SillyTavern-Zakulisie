/**
 * Вкладка «Иконки» в окне настроек Закулисья: заменить любую иконку своей картинкой (панели Закулисья и окно Кулис).
 * Файл любого вида (PNG, JPG, WebP, GIF, SVG) сжимается в маленький PNG 96×96 и хранится в настройках;
 * у гифки берётся первый кадр. Сбросить можно одну иконку или все.
 */
import { report } from '../core/guard.js';
import { ICONS } from './icon-data.js';
import { applyCustomIcons, icon } from './icons.js';
import { ICON_LIMITS, isIconData, normalizeIcons, setCustomIcons } from '../../shared/custom-icons.js';
import { ICON_NAMES, iconSvg } from '../../ui/icons.js';

export const ICON_COPYRIGHT = 'Загружайте только то, на что у вас есть права: свои рисунки, материалы с подходящей лицензией или работы, которые автор разрешил использовать. Чужие картинки без разрешения брать нельзя, будьте внимательны к авторскому праву. Файлы остаются только в настройках вашей таверны.';

const SOURCE_LIMIT = 6 * 1024 * 1024;

/** Файл → маленькая PNG/WebP data-ссылка в рамке 96×96 (с запасом по полям) или ошибка с понятной фразой. */
export async function iconFromFile(file, doc) {
  if (!file || !/^image\//.test(file.type || '') && !/\.(png|jpe?g|webp|gif|svg|avif)$/i.test(file.name || '')) throw new Error('Нужна картинка: PNG, JPG, WebP, GIF или SVG.');
  if (file.size > SOURCE_LIMIT) throw new Error('Файл слишком большой для иконки: до 6 МБ.');
  const view = doc.defaultView;
  const url = view.URL.createObjectURL(file);
  try {
    const image = await new Promise((resolve, reject) => {
      const node = new view.Image();
      node.onload = () => resolve(node);
      node.onerror = () => reject(new Error('Картинка не открылась: файл повреждён или формат не поддерживается.'));
      node.src = url;
    });
    const width = image.naturalWidth || image.width || ICON_LIMITS.side;
    const height = image.naturalHeight || image.height || ICON_LIMITS.side;
    const scale = Math.min(ICON_LIMITS.side / width, ICON_LIMITS.side / height, 1) || 1;
    const canvas = doc.createElement('canvas');
    canvas.width = Math.max(1, Math.round(width * scale));
    canvas.height = Math.max(1, Math.round(height * scale));
    const context = canvas.getContext('2d');
    if (!context) throw new Error('Не удалось подготовить картинку.');
    context.drawImage(image, 0, 0, canvas.width, canvas.height);
    for (const [type, quality] of [['image/png'], ['image/webp', 0.9], ['image/webp', 0.7]]) {
      const data = canvas.toDataURL(type, quality);
      if (isIconData(data)) return data;
    }
    throw new Error('Иконка получилась слишком тяжёлой: возьмите картинку попроще.');
  } finally { view.URL.revokeObjectURL(url); }
}

const escapeHtml = text => String(text ?? '').replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[ch]);

/**
 * @param {Document} doc
 * @param {{ settings: any, save: () => void, hub?: { addTab: Function } }} deps
 */
export function startIconStudio(doc, { settings, save, hub }) {
  const apply = () => {
    settings.icons = normalizeIcons(settings.icons);
    applyCustomIcons(doc, settings.icons.pud);
    setCustomIcons(settings.icons);
  };
  apply();
  const tab = hub?.addTab('icons', 'Иконки', 'image');
  if (!tab) return () => {};
  const pane = tab.pane;
  let notice = '';
  const persist = () => { try { save(); } catch (error) { report('иконки: сохранение', error); } };

  const tile = (scope, name) => {
    const own = settings.icons[scope][name];
    const preview = own ? `<img src="${own}" alt="" draggable="false">` : (scope === 'pud' ? icon(name) : iconSvg(name));
    return `<div class="pud-icotile${own ? ' own' : ''}">
      <div class="pud-icoprev">${preview}</div>
      <code>${escapeHtml(name)}</code>
      <label class="menu_button pud-icopick" title="Выбрать свою картинку">Заменить<input type="file" accept="image/*,.svg" hidden data-scope="${scope}" data-name="${escapeHtml(name)}"></label>
      ${own ? `<button type="button" class="menu_button" data-reset="${scope}:${escapeHtml(name)}">Сбросить</button>` : ''}
    </div>`;
  };
  const render = () => {
    const customCount = Object.keys(settings.icons.pud).length + Object.keys(settings.icons.studio).length;
    pane.innerHTML = `
      <div class="pud-card pud-card-col">
        <div>
          <b>Свои иконки</b>
          <p class="pud-hint">Нажмите «Заменить» под иконкой и выберите картинку: PNG, JPG, WebP, GIF (будет первый кадр) или SVG. Она ужмётся до маленького значка и встанет везде, где была эта иконка. Цвет темы на своих картинках не действует: рисуйте то, что нужно, сразу в цвете.</p>
          <p class="pud-hint pud-copyright"><b>Об авторском праве.</b> ${escapeHtml(ICON_COPYRIGHT)}</p>
          ${notice ? `<p class="pud-hint pud-icon-note">${escapeHtml(notice)}</p>` : ''}
        </div>
        ${customCount ? `<div class="pud-native-btns"><button type="button" class="menu_button" data-reset-all>Сбросить все свои иконки (${customCount})</button></div>` : ''}
      </div>
      <h4 class="pud-icohead">Панели и окна Закулисья</h4>
      <div class="pud-icogrid">${Object.keys(ICONS).map(name => tile('pud', name)).join('')}</div>
      <h4 class="pud-icohead">Окно Кулис (отношения, мир, библиотеки)</h4>
      <p class="pud-hint">Эти иконки меняются при следующем открытии окна.</p>
      <div class="pud-icogrid">${ICON_NAMES.map(name => tile('studio', name)).join('')}</div>`;
  };
  render();

  const onChange = async event => {
    const input = event.target.closest?.('input[type="file"][data-name]');
    if (!input) return;
    const [file] = input.files ?? [];
    const { scope, name } = input.dataset;
    input.value = '';
    if (!file) return;
    try {
      const data = await iconFromFile(file, doc);
      settings.icons = normalizeIcons({ ...settings.icons, [scope]: { ...settings.icons[scope], [name]: data } });
      notice = `Иконка «${name}» заменена.`;
      persist();
      apply();
    } catch (error) { notice = error?.message || 'Иконка не заменилась.'; }
    render();
  };
  const onClick = event => {
    const one = event.target.closest?.('[data-reset]');
    const all = event.target.closest?.('[data-reset-all]');
    if (!one && !all) return;
    if (all) settings.icons = { pud: {}, studio: {} };
    else {
      const [scope, name] = one.dataset.reset.split(':');
      const next = { ...settings.icons[scope] };
      delete next[name];
      settings.icons = { ...settings.icons, [scope]: next };
    }
    notice = all ? 'Все иконки вернулись.' : '';
    persist();
    apply();
    render();
  };
  pane.addEventListener('change', onChange);
  pane.addEventListener('click', onClick);

  return () => {
    pane.removeEventListener('change', onChange);
    pane.removeEventListener('click', onClick);
    tab.remove?.();
    applyCustomIcons(doc, {});
    setCustomIcons(null);
  };
}
