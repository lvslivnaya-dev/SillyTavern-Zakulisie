/**
 * The little player of the media library. It hangs on the page itself (not inside the Studio window), so the music goes on
 * while the windows are switched or closed. While the scene drawer is open, the player stands against its panel: at the top,
 * on the free side (to the right of it, or to the left when the rail is on the right); with the drawer shut it stays out of sight
 * (the music goes on); without the drawer at all it floats and can be dragged by its bar.
 * A cover of the track (the picture set in the media library) can be shown with the 🖼 button: it takes the place of the video's picture.
 * A service's own embedded player (YouTube, Spotify, SoundCloud…) or the browser's own player for a direct file sits inside;
 * a link that cannot be embedded opens in a new tab.
 * Colours come from the tavern's theme (--SmartTheme…), so it looks like the rest of the page.
 */
import { MEDIA_SERVICES, parseMediaLink } from '../core/media-library.js';
import { imageUrl } from '../integration/wardrobe-images.js';

const DOCK_ID = 'ku-media-dock';
const STYLE_ID = 'ku-media-dock-style';
const POS_KEY = 'ku-media-dock-pos';
const COVER_KEY = 'ku-media-dock-cover';
const SIDE_WIDTH = 300;

const STYLE = `
#${DOCK_ID}{position:fixed;left:12px;bottom:12px;z-index:3500;width:min(340px,calc(100vw - 24px));display:flex;flex-direction:column;border:1px solid var(--SmartThemeBorderColor);border-radius:14px;background:var(--SmartThemeBlurTintColor);color:var(--SmartThemeBodyColor);box-shadow:0 8px 28px color-mix(in srgb, var(--SmartThemeBodyColor) 22%, transparent);backdrop-filter:blur(12px);overflow:hidden;font-size:13px}
#${DOCK_ID}[hidden]{display:none}
#${DOCK_ID} .ku-md-bar{display:flex;align-items:center;gap:6px;padding:6px 8px 6px 12px;cursor:grab;touch-action:none;user-select:none}
#${DOCK_ID}.ku-md-drag .ku-md-bar{cursor:grabbing}
#${DOCK_ID}.ku-md-drag .ku-md-body{pointer-events:none}
/* against the scene drawer's panel: at its top, on the free side (the place is set in sync()) */
#${DOCK_ID}.ku-md-docked{width:min(${SIDE_WIDTH}px,calc(100vw - 24px))}
#${DOCK_ID}.ku-md-docked .ku-md-bar{cursor:default}
#${DOCK_ID}.ku-md-away{display:none}
#${DOCK_ID} .ku-md-body{position:relative}
#${DOCK_ID} .ku-md-cover{display:none;width:100%;aspect-ratio:16/9;max-height:220px;object-fit:cover;background:var(--SmartThemeBlurTintColor)}
#${DOCK_ID}.ku-md-covered .ku-md-cover{display:block}
/* the picture stands INSTEAD of the video: it lies over the picture of the embedded player (it covers it completely; the sound and the clicks go through to it, so a click on the picture is play / pause) */
#${DOCK_ID} .ku-md-cover.ku-md-over{position:absolute;inset:0;width:100%;height:100%;aspect-ratio:auto;max-height:none;pointer-events:none;z-index:1}
#${DOCK_ID} .ku-md-btn[data-md="cover"]{display:none}
#${DOCK_ID}.ku-md-hascover .ku-md-btn[data-md="cover"]{display:grid}
#${DOCK_ID}.ku-md-covered .ku-md-btn[data-md="cover"]{opacity:1;background:color-mix(in srgb, var(--SmartThemeBodyColor) 16%, transparent)}
#${DOCK_ID} .ku-md-title{flex:1 1 auto;min-width:0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;font-weight:700}
#${DOCK_ID} .ku-md-svc{flex:0 0 auto;font-size:11px;opacity:.7}
#${DOCK_ID} .ku-md-btn{flex:0 0 auto;width:26px;height:26px;display:grid;place-items:center;padding:0;border:0;border-radius:8px;background:transparent;color:inherit;cursor:pointer;opacity:.75;font-size:14px;line-height:1;text-decoration:none}
#${DOCK_ID} .ku-md-btn:hover{opacity:1;background:color-mix(in srgb, var(--SmartThemeBodyColor) 12%, transparent)}
#${DOCK_ID} .ku-md-body{overflow:hidden;line-height:0}
#${DOCK_ID}.ku-md-folded .ku-md-body{height:0}
#${DOCK_ID} .ku-md-body iframe{width:100%;border:0;display:block}
#${DOCK_ID} .ku-md-body audio,#${DOCK_ID} .ku-md-body video{width:100%;display:block}
`;

/** How tall a service's embedded player is at the dock's width (the preview of the add form uses the same; the dock asks for the compact one). */
export function frameHeight(parsed, { compact = false } = {}) {
  if (parsed.service === 'spotify') return /\/embed\/(track|episode)\//.test(parsed.embed) ? 152 : (compact ? 232 : 352);
  if (parsed.service === 'soundcloud') return 166;
  if (parsed.service === 'apple') return /\/(song|album)\//.test(parsed.embed) && /[?&]i=/.test(parsed.embed) ? 175 : (compact ? 232 : 450);
  if (parsed.service === 'yandex') return 180;
  return 192; // YouTube: 16:9 at 340px is about 190
}

export function createMediaDock(doc) {
  const view = doc.defaultView;
  let root = null;
  let current = null;
  let watcher = null;
  let watchedBar = null;

  const readPos = () => { try { const value = JSON.parse(view.localStorage?.getItem(POS_KEY) ?? 'null'); return value && Number.isFinite(value.left) && Number.isFinite(value.top) ? value : null; } catch { return null; } };
  const savePos = pos => { try { view.localStorage?.setItem(POS_KEY, JSON.stringify(pos)); } catch { /* private window: it just does not remember */ } };

  /** Keep the player inside the window: a little of the bar always stays in reach. */
  function place(left, top) {
    const width = root.offsetWidth || 340;
    const maxLeft = Math.max(0, (view.innerWidth || 1024) - Math.min(width, 120));
    const maxTop = Math.max(0, (view.innerHeight || 768) - 40);
    const next = { left: Math.round(Math.min(Math.max(-width + 120, left), maxLeft)), top: Math.round(Math.min(Math.max(0, top), maxTop)) };
    root.style.left = `${next.left}px`;
    root.style.top = `${next.top}px`;
    root.style.bottom = 'auto';
    return next;
  }

  /** Stand against the drawer's panel (open: at its top, on the free side), hide while it is shut, float without it. A move never reloads the player. */
  function sync() {
    if (!root) return;
    const bar = doc.getElementById('ku-scene-chips');
    const panel = bar?.querySelector('.ku-panel');
    if (bar && bar !== watchedBar && watcher) { watchedBar = bar; watcher.observe(bar, { attributes: true, attributeFilter: ['class'] }); }
    if (panel) {
      root.classList.add('ku-md-docked');
      const open = bar.classList.contains('open');
      root.classList.toggle('ku-md-away', !open);
      if (!open) return;
      const box = panel.getBoundingClientRect();
      const width = Math.min(SIDE_WIDTH, (view.innerWidth || 1024) - 24);
      const onRight = !bar.classList.contains('ku-side-right');
      const left = onRight ? box.right + 8 : box.left - 8 - width;
      root.style.left = `${Math.round(Math.max(8, Math.min(left, (view.innerWidth || 1024) - width - 8)))}px`;
      root.style.top = `${Math.round(box.top + 6)}px`;
      root.style.bottom = 'auto';
    } else if (root.classList.contains('ku-md-docked') || root.classList.contains('ku-md-away')) {
      root.classList.remove('ku-md-docked', 'ku-md-away');
      root.style.left = ''; root.style.top = ''; root.style.bottom = '';
      const saved = readPos();
      if (saved) place(saved.left, saved.top);
    }
  }

  function startDrag(event) {
    if (event.button > 0 || event.target.closest('button, a') || root.classList.contains('ku-md-docked')) return;
    const box = root.getBoundingClientRect();
    const dx = event.clientX - box.left;
    const dy = event.clientY - box.top;
    root.classList.add('ku-md-drag');
    let last = { left: box.left, top: box.top };
    const move = moveEvent => { last = place(moveEvent.clientX - dx, moveEvent.clientY - dy); };
    const finish = () => {
      view.removeEventListener('pointermove', move);
      view.removeEventListener('pointerup', finish);
      view.removeEventListener('pointercancel', finish);
      root.classList.remove('ku-md-drag');
      savePos(last);
    };
    view.addEventListener('pointermove', move);
    view.addEventListener('pointerup', finish);
    view.addEventListener('pointercancel', finish);
    event.preventDefault();
  }

  function ensure() {
    if (root) return root;
    if (!doc.getElementById(STYLE_ID)) {
      const style = doc.createElement('style');
      style.id = STYLE_ID;
      style.textContent = STYLE;
      doc.head.append(style);
    }
    root = doc.createElement('div');
    root.id = DOCK_ID;
    root.hidden = true;
    root.setAttribute('role', 'region');
    root.setAttribute('aria-label', 'Плеер');
    root.innerHTML = `
      <div class="ku-md-bar" title="Тяните за эту полосу, чтобы переставить плеер">
        <span class="ku-md-title"></span><span class="ku-md-svc"></span>
        <button type="button" class="ku-md-btn" data-md="cover" title="Показать или спрятать картинку трека (её ставят в медиатеке)" aria-label="Картинка трека">🖼</button>
        <button type="button" class="ku-md-btn" data-md="fold" title="Свернуть или развернуть (музыка не прервётся)" aria-label="Свернуть или развернуть">▾</button>
        <a class="ku-md-btn" data-md="open" target="_blank" rel="noopener noreferrer" title="Открыть на сайте сервиса" aria-label="Открыть на сайте сервиса">↗</a>
        <button type="button" class="ku-md-btn" data-md="close" title="Закрыть плеер" aria-label="Закрыть плеер">×</button>
      </div>
      <div class="ku-md-body"></div>`;
    root.addEventListener('click', event => {
      const action = event.target.closest('[data-md]')?.dataset.md;
      if (action === 'fold') { root.classList.toggle('ku-md-folded'); event.target.closest('button').textContent = root.classList.contains('ku-md-folded') ? '▴' : '▾'; }
      else if (action === 'close') stop();
      else if (action === 'cover') { const on = root.classList.toggle('ku-md-covered'); try { view.localStorage?.setItem(COVER_KEY, on ? '1' : '0'); } catch { /* private window */ } }
    });
    root.querySelector('.ku-md-bar').addEventListener('pointerdown', startDrag);
    doc.body.append(root);
    const saved = readPos();
    if (saved) place(saved.left, saved.top);
    // the drawer comes and goes with the chat: dock when it appears, float again when it is gone
    if (typeof view.MutationObserver === 'function') {
      watcher = new view.MutationObserver(sync);
      watcher.observe(doc.body, { childList: true });
      // the drawer opens, shuts and changes sides by its classes
    }
    view.addEventListener?.('resize', sync);
    return root;
  }

  /** Play a library item. A link that cannot be embedded opens in a new tab instead. Returns true when something started in the dock. */
  function play(item) {
    const parsed = parseMediaLink(item?.url);
    if (!parsed) return false;
    if (parsed.kind === 'link') { view.open?.(parsed.url, '_blank', 'noopener,noreferrer'); return false; }
    const host = ensure();
    const body = host.querySelector('.ku-md-body');
    body.textContent = '';
    // The picture of the track: shown above the player when the 🖼 button is on (off by default: the player looks as it always did).
    const cover = item.image ? imageUrl(item.image) : '';
    if (cover) { const picture = doc.createElement('img'); picture.className = parsed.kind === 'audio' ? 'ku-md-cover' : 'ku-md-cover ku-md-over'; picture.src = cover; picture.alt = ''; picture.draggable = false; body.append(picture); }
    host.classList.toggle('ku-md-hascover', Boolean(cover));
    let wantCover = false;
    try { wantCover = view.localStorage?.getItem(COVER_KEY) === '1'; } catch { /* private window */ }
    host.classList.toggle('ku-md-covered', Boolean(cover) && wantCover);
    if (parsed.kind === 'iframe') {
      const frame = doc.createElement('iframe');
      frame.src = parsed.embed;
      frame.title = item.title || MEDIA_SERVICES[parsed.service];
      frame.height = String(frameHeight(parsed, { compact: true })); // the dock lives under the list: not taller than needed
      frame.allow = 'autoplay; encrypted-media; picture-in-picture; fullscreen; clipboard-write';
      frame.setAttribute('allowfullscreen', '');
      frame.referrerPolicy = 'strict-origin-when-cross-origin';
      body.append(frame);
    } else {
      const media = doc.createElement(parsed.kind === 'video' ? 'video' : 'audio');
      media.controls = true;
      media.autoplay = true;
      media.src = parsed.url;
      body.append(media);
    }
    current = item;
    host.querySelector('.ku-md-title').textContent = item.title || MEDIA_SERVICES[parsed.service];
    host.querySelector('.ku-md-svc').textContent = MEDIA_SERVICES[parsed.service] ?? '';
    host.querySelector('[data-md="open"]').href = parsed.url;
    host.classList.remove('ku-md-folded');
    host.querySelector('[data-md="fold"]').textContent = '▾';
    host.hidden = false;
    sync();
    return true;
  }

  function stop() {
    current = null;
    if (!root) return;
    root.querySelector('.ku-md-body').textContent = ''; // removing the player is what stops the sound
    root.hidden = true;
  }

  return {
    play,
    stop,
    current: () => current,
    destroy() { watcher?.disconnect(); watcher = null; watchedBar = null; view.removeEventListener?.('resize', sync); stop(); root?.remove(); root = null; doc.getElementById(STYLE_ID)?.remove(); },
  };
}
