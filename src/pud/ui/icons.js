/** Спрайт иконок: один скрытый <svg> в body, кнопки ссылаются на него через <use>. */
import { ICONS } from './icon-data.js';
import { TAG } from '../core/guard.js';
import { isIconData } from '../../shared/custom-icons.js';

export const SPRITE_ID = 'pud-icon-sprite';
export const iconId = name => `pud-i-${name}`;

export function spriteMarkup() {
  const symbols = Object.entries(ICONS)
    .map(([name, [viewBox, body]]) => `<symbol id="${iconId(name)}" viewBox="${viewBox}">${body}</symbol>`)
    .join('');
  return `<svg xmlns="http://www.w3.org/2000/svg" id="${SPRITE_ID}" aria-hidden="true" style="position:absolute;width:0;height:0;overflow:hidden"><defs>${symbols}</defs></svg>`;
}

export function injectSprite(doc) {
  let sprite = doc.getElementById(SPRITE_ID);
  if (!sprite) {
    const holder = doc.createElement('div');
    holder.innerHTML = spriteMarkup();
    sprite = holder.firstElementChild;
    doc.body.append(sprite);
  }
  return () => sprite.remove();
}

/** Свои картинки вместо рисунков в спрайте: все кнопки подхватывают их сразу, перерисовывать ничего не нужно. */
export function applyCustomIcons(doc, map = {}) {
  const sprite = doc.getElementById(SPRITE_ID);
  if (!sprite) return;
  for (const [name, [viewBox, body]] of Object.entries(ICONS)) {
    const symbol = sprite.querySelector(`#${iconId(name)}`);
    if (!symbol) continue;
    const own = map[name];
    if (own && isIconData(own)) {
      const [, , width = 24, height = 24] = String(viewBox).split(/\s+/).map(Number);
      symbol.innerHTML = `<image href="${own}" x="0" y="0" width="${width}" height="${height}" preserveAspectRatio="xMidYMid meet"/>`;
    } else symbol.innerHTML = body;
  }
}

/** Разметка иконки. Неизвестное имя даёт пустую строку и предупреждение, а не сломанную кнопку. */
export function icon(name, extraClass = '') {
  if (!Object.hasOwn(ICONS, name)) {
    console.warn(`${TAG} нет иконки «${name}»`);
    return '';
  }
  const cls = extraClass ? `pud-i ${extraClass}` : 'pud-i';
  return `<svg class="${cls}" aria-hidden="true"><use href="#${iconId(name)}"/></svg>`;
}
