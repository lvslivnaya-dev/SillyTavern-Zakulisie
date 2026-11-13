/**
 * Картинки ассистентов по умолчанию: маленькие нарисованные лица. Каждому ассистенту своё; в настройках можно поставить свою
 * картинку вместо любой из них. Чистая разметка, без запросов: data-ссылка вставляется прямо в <img>.
 */
const FACE = `<ellipse cx="48" cy="53" rx="23" ry="25" fill="#ffe4d2"/>`;
const EYES = (color, ry = 4.2) => `<g fill="${color}"><ellipse cx="39" cy="54" rx="3.2" ry="${ry}"/><ellipse cx="57" cy="54" rx="3.2" ry="${ry}"/></g><g fill="#fff"><circle cx="40.2" cy="52.6" r="1.2"/><circle cx="58.2" cy="52.6" r="1.2"/></g>`;
const BLUSH = `<g fill="#f59fb0" opacity=".55"><ellipse cx="32" cy="63" rx="4.6" ry="2.8"/><ellipse cx="64" cy="63" rx="4.6" ry="2.8"/></g>`;

const ART = {
  rosita: {
    bg: '#ffd9e4',
    svg: `<path d="M20 52C16 28 32 14 48 14s32 14 28 38c-1 14 4 26 8 36-10 4-18 2-22-6l-26 0c-4 8-12 10-22 6 4-10 9-22 8-36z" fill="#8c5b47"/>
      <path d="M12 96c2-16 18-22 36-22s34 6 36 22z" fill="#a9d8b8"/>
      ${FACE}
      <path d="M25 50c2-16 14-24 24-24s22 8 24 24c-8-4-14-10-18-16-3 8-14 14-30 16z" fill="#8c5b47"/>
      ${EYES('#5b3326')}${BLUSH}
      <path d="M42 66c3 4 9 4 12 0" fill="none" stroke="#c4566f" stroke-width="2" stroke-linecap="round"/>
      <g transform="translate(70 28)"><g fill="#ff8fab"><circle cx="0" cy="-6" r="5"/><circle cx="6" cy="-2" r="5"/><circle cx="4" cy="5" r="5"/><circle cx="-4" cy="5" r="5"/><circle cx="-6" cy="-2" r="5"/></g><circle r="3.4" fill="#ffd45e"/></g>`,
  },
  dias: {
    bg: '#46635f',
    svg: `<path d="M10 96c2-16 18-22 38-22s36 6 38 22z" fill="#8a2f3c"/>
      <path d="M38 76l10 8 10-8" fill="none" stroke="#5f1f2a" stroke-width="3" stroke-linecap="round"/>
      ${FACE}
      <path d="M24 50c-3-20 8-32 24-32s28 12 24 32c-4-8-8-12-14-14l-4-8-6 8-8-6-4 8c-6 2-10 6-12 12z" fill="#2c2b36"/>
      <path d="M33 47l9 3M63 47l-9 3" stroke="#2c2b36" stroke-width="2.6" stroke-linecap="round"/>
      ${EYES('#2a2a30', 3.2)}
      <path d="M28 58l10 6" stroke="#c0766a" stroke-width="1.8" stroke-linecap="round"/>
      <path d="M41 67c4 2 10 2 14-3" fill="none" stroke="#a24b3c" stroke-width="2.2" stroke-linecap="round"/>`,
  },
  sigrid: {
    bg: '#dce6f4',
    svg: `<path d="M22 54C18 30 32 16 48 16s30 14 26 38c-1 12 3 22 4 34l-8 4c0-14-4-22-4-32H34c0 10-4 18-4 32l-8-4c1-12 1-22 0-34z" fill="#cfd3e0"/>
      <path d="M10 96c2-16 18-22 38-22s38 6 38 22z" fill="#3c4a6b"/>
      <path d="M36 76l12 10 12-10-4-4H40z" fill="#f3f5fa"/>
      ${FACE}
      <path d="M26 50c2-16 12-26 22-26s22 10 22 26c-6-6-12-12-16-18-4 8-14 14-28 18z" fill="#cfd3e0"/>
      <g fill="none" stroke="#4a5068" stroke-width="2"><circle cx="39" cy="54" r="7.2"/><circle cx="57" cy="54" r="7.2"/><path d="M46.2 54h3.6"/></g>
      ${EYES('#46506e', 3.4)}
      <path d="M43 67h10" stroke="#b86b78" stroke-width="2" stroke-linecap="round"/>
      <circle cx="73" cy="68" r="4.2" fill="#9db4d8"/>`,
  },
  custom: {
    bg: '#e6dcfb',
    svg: `<path d="M22 54C18 30 32 16 48 16s30 14 26 38c-1 14 3 24 6 34-10 4-16 2-20-6H36c-4 8-10 10-20 6 3-10 7-20 6-34z" fill="#9a78d6"/>
      <path d="M12 96c2-16 18-22 36-22s34 6 36 22z" fill="#f6d8e6"/>
      ${FACE}
      <path d="M26 50c2-16 12-24 22-24s20 8 22 24c-8-4-14-10-18-16-3 8-12 14-26 16z" fill="#9a78d6"/>
      ${EYES('#5b3f9e')}${BLUSH}
      <path d="M42 66c3 4 9 4 12 0" fill="none" stroke="#c4566f" stroke-width="2" stroke-linecap="round"/>
      <path d="M48 20c-2-8 2-14 10-16 2 8-2 14-10 16z" fill="#7fc17a"/><path d="M48 20c-1-7-6-11-12-11 0 7 4 11 12 11z" fill="#9bd78f"/>`,
  },
};

/** Разметка круглой картинки ассистента (неизвестный id — как у «своего»). */
export function assistantSvg(id) {
  const art = ART[id] ?? ART.custom;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 96 96"><defs><clipPath id="c"><circle cx="48" cy="48" r="48"/></clipPath></defs><g clip-path="url(#c)"><rect width="96" height="96" fill="${art.bg}"/>${art.svg}</g></svg>`;
}

/** Ссылка для <img src>. */
export function assistantAvatar(id) {
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(assistantSvg(id))}`;
}
