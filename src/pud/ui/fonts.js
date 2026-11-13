/**
 * Шрифты Пудреницы: свободные (SIL OFL 1.1) из Google Fonts через Fontsource, с кириллицей.
 * Файлы лежат в assets/fonts без изменений, лицензии в assets/fonts/licenses, авторы в assets/fonts/README.md.
 */
import { FONT_FACES } from './font-data.js';

/** Семейство в CSS → какой шрифт и за что отвечает. */
export const FONT_ROLES = {
  PudUI: 'Nunito · настройки и окна',
  PudPost: 'Lora · текст постов',
  PudSpeech: 'Comfortaa · прямая речь',
  PudThink: 'Caveat · мысли',
  PudHead: 'Comfortaa · заголовки',
  PudName: 'Lobster · имена в чате',
  PudSkip: 'Marck Script · таймскипы',
};

export { FONT_FACES };
export const FONTS_STYLE_ID = 'pud-fonts';

export function fontFaceCss(baseUrl) {
  return FONT_FACES
    .map(face => `@font-face{font-family:'${face.family}';font-style:normal;font-weight:${face.weight};font-display:swap;src:url('${new URL(face.file, baseUrl).href}') format('woff2');unicode-range:${face.unicodeRange}}`)
    .join('\n');
}

/** Вставляет @font-face один раз. Возвращает функцию, которая их убирает. */
export function injectFonts(doc, baseUrl) {
  let style = doc.getElementById(FONTS_STYLE_ID);
  if (!style) {
    style = doc.createElement('style');
    style.id = FONTS_STYLE_ID;
    style.textContent = fontFaceCss(baseUrl);
    doc.head.append(style);
  }
  return () => style.remove();
}
