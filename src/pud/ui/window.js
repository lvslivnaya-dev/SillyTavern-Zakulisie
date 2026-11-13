/**
 * Окна Пудреницы: стеклянные, таскаются за шапку, меняют размер за уголок, сворачиваются в док внизу экрана.
 * Закрываются только крестиком: клик мимо и Esc их не трогают. Позиция и размер запоминаются.
 */
import { icon } from './icons.js';

export const LAYER_ID = 'pud-layer';
export const DOCK_ID = 'pud-dock';

const MIN_W = 360;
const MIN_H = 240;
const MARGIN = 8;

export const clamp = (value, min, max) => Math.min(Math.max(value, min), Math.max(min, max));

/** Держит прямоугольник окна внутри экрана и ниже верхней панели (viewport.top), чтобы шапку всегда можно было схватить. */
export function fitRect(rect, viewport) {
  const top0 = (viewport.top ?? 0) + MARGIN;
  const width = clamp(rect.width, MIN_W, viewport.width - MARGIN * 2);
  const height = clamp(rect.height, MIN_H, viewport.height - top0 - MARGIN);
  return {
    width,
    height,
    left: clamp(rect.left, MARGIN, viewport.width - width - MARGIN),
    top: clamp(rect.top, top0, viewport.height - height - MARGIN),
  };
}

function layer(doc) {
  let root = doc.getElementById(LAYER_ID);
  if (!root) {
    root = doc.createElement('div');
    root.id = LAYER_ID;
    root.innerHTML = `<div id="${DOCK_ID}"></div>`;
    doc.body.append(root);
  }
  return root;
}

let zTop = 10;

/**
 * @param {Document} doc
 * @param {{ id: string, title: string, icon: string, width?: number, height?: number, store?: object, save?: () => void, onToggle?: (open: boolean) => void }} options
 */
export function createWindow(doc, options) {
  const view = doc.defaultView;
  const root = layer(doc);
  const dock = root.querySelector(`#${DOCK_ID}`);
  const store = options.store ?? {};
  const save = options.save ?? (() => {});

  const win = doc.createElement('section');
  win.className = 'pud-win';
  win.dataset.win = options.id;
  win.hidden = true;
  win.setAttribute('role', 'dialog');
  win.setAttribute('aria-label', options.title);
  win.innerHTML = `
    <header class="pud-win-head">
      <span class="pud-win-grip" aria-hidden="true"></span>
      ${icon(options.icon, 'pud-win-icon')}
      <h2 class="pud-win-title"></h2>
      <div class="pud-win-actions"></div>
      <button type="button" class="pud-win-min" title="Свернуть">${icon('min')}</button>
      <button type="button" class="pud-win-close" title="Закрыть">${icon('x')}</button>
    </header>
    <div class="pud-win-body"></div>`;
  win.querySelector('.pud-win-title').textContent = options.title;
  root.append(win);

  // окна лежат под верхней панелью таверны, поэтому их верх не поднимается выше её края
  const viewport = () => ({ width: view.innerWidth, height: view.innerHeight, top: doc.getElementById('top-bar')?.getBoundingClientRect().bottom ?? 0 });
  const saved = store[options.id];
  const startW = saved?.width ?? options.width ?? 860;
  const startH = saved?.height ?? options.height ?? Math.round(viewport().height * 0.8);
  let rect = fitRect({
    width: startW,
    height: startH,
    left: saved?.left ?? (viewport().width - startW) / 2,
    top: saved?.top ?? (viewport().height - startH) / 2,
  }, viewport());

  const apply = () => {
    rect = fitRect(rect, viewport());
    Object.assign(win.style, { left: `${rect.left}px`, top: `${rect.top}px`, width: `${rect.width}px`, height: `${rect.height}px` });
  };
  const remember = () => { store[options.id] = { ...rect }; save(); };
  const front = () => { win.style.zIndex = String(++zTop); };

  // перетаскивание за шапку
  const head = win.querySelector('.pud-win-head');
  head.addEventListener('pointerdown', event => {
    if (event.button !== 0 || event.target.closest('button, input, select, a')) return;
    front();
    const start = { x: event.clientX, y: event.clientY, left: rect.left, top: rect.top };
    head.setPointerCapture?.(event.pointerId);
    win.classList.add('pud-dragging');
    const move = ev => { rect.left = start.left + ev.clientX - start.x; rect.top = start.top + ev.clientY - start.y; apply(); };
    const up = () => {
      head.removeEventListener('pointermove', move);
      head.removeEventListener('pointerup', up);
      head.removeEventListener('pointercancel', up);
      win.classList.remove('pud-dragging');
      remember();
      options.onDragEnd?.();
    };
    head.addEventListener('pointermove', move);
    head.addEventListener('pointerup', up);
    head.addEventListener('pointercancel', up);
  });
  win.addEventListener('pointerdown', front);

  // размер: родной уголок resize, запоминаем после отпускания
  let resizeTimer = null;
  const resizeObserver = view.ResizeObserver ? new view.ResizeObserver(() => {
    if (win.hidden || win.classList.contains('pud-dragging')) return;
    const box = win.getBoundingClientRect();
    if (!box.width || !box.height) return;
    rect.width = box.width; rect.height = box.height;
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(remember, 300);
  }) : null;
  resizeObserver?.observe(win);
  const onViewport = () => { if (!win.hidden) apply(); };
  view.addEventListener('resize', onViewport);

  // док для свёрнутого окна
  const pill = doc.createElement('button');
  pill.type = 'button';
  pill.className = 'pud-dock-pill';
  pill.hidden = true;
  pill.innerHTML = `${icon(options.icon)}<span></span>`;
  pill.querySelector('span').textContent = options.title;
  dock.append(pill);

  const api = {
    element: win,
    body: win.querySelector('.pud-win-body'),
    actions: win.querySelector('.pud-win-actions'),
    get isOpen() { return !win.hidden; },
    /** Where the window is now (a copy). */
    get rect() { return { ...rect }; },
    /** Put the window somewhere (kept inside the screen); the place is not remembered, the user's own drag is. */
    place(next) { rect = { ...rect, ...next }; if (!win.hidden) apply(); },
    get viewport() { return viewport(); },
    open() {
      pill.hidden = true;
      if (win.hidden) { win.hidden = false; apply(); options.onToggle?.(true); }
      front();
    },
    minimize() {
      if (win.hidden) return;
      win.hidden = true;
      pill.hidden = false;
      options.onToggle?.(false);
    },
    close() {
      pill.hidden = true;
      if (win.hidden) return;
      win.hidden = true;
      options.onToggle?.(false);
    },
    toggle() { if (win.hidden) api.open(); else api.close(); },
    destroy() {
      resizeObserver?.disconnect();
      clearTimeout(resizeTimer);
      view.removeEventListener('resize', onViewport);
      win.remove();
      pill.remove();
      if (!root.querySelector('.pud-win')) root.remove();
    },
  };
  win.querySelector('.pud-win-min').addEventListener('click', () => api.minimize());
  win.querySelector('.pud-win-close').addEventListener('click', () => api.close());
  pill.addEventListener('click', () => api.open());
  return api;
}
