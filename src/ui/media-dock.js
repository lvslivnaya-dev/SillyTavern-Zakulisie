/**
 * The little player of the media library. It hangs on the page itself (not inside the Studio window), so the music goes on
 * while the windows are switched or closed. While the scene drawer is there, the player is docked into it: the foot of its panel,
 * under the list; without the drawer it floats and can be dragged by its bar.
 * A service's own embedded player (YouTube, Spotify, SoundCloud…) or the browser's own player for a direct file sits inside;
 * a link that cannot be embedded opens in a new tab.
 * Colours come from the tavern's theme (--SmartTheme…), so it looks like the rest of the page.
 */
import { MEDIA_SERVICES, parseMediaLink } from '../core/media-library.js';

const DOCK_ID = 'ku-media-dock';
const STYLE_ID = 'ku-media-dock-style';
const POS_KEY = 'ku-media-dock-pos';

const STYLE = `
#${DOCK_ID}{position:fixed;left:12px;bottom:12px;z-index:3500;width:min(340px,calc(100vw - 24px));display:flex;flex-direction:column;border:1px solid var(--SmartThemeBorderColor);border-radius:14px;background:var(--SmartThemeBlurTintColor);color:var(--SmartThemeBodyColor);box-shadow:0 8px 28px color-mix(in srgb, var(--SmartThemeBodyColor) 22%, transparent);backdrop-filter:blur(12px);overflow:hidden;font-size:13px}
#${DOCK_ID}[hidden]{display:none}
#${DOCK_ID} .ku-md-bar{display:flex;align-items:center;gap:6px;padding:6px 8px 6px 12px;cursor:grab;touch-action:none;user-select:none}
#${DOCK_ID}.ku-md-drag .ku-md-bar{cursor:grabbing}
#${DOCK_ID}.ku-md-drag .ku-md-body{pointer-events:none}
/* docked into the scene drawer: it is the foot of the drawer's panel, under the list, and takes the panel's width */
#${DOCK_ID}.ku-md-docked{position:static;width:auto;flex:none;border:0;border-top:1px solid var(--SmartThemeBorderColor);border-radius:0;box-shadow:none;backdrop-filter:none}
#${DOCK_ID}.ku-md-docked .ku-md-bar{cursor:default}
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

  /** Dock into the drawer's panel when there is one (a move reloads the player, so only when the place really changes); float otherwise. */
  function sync() {
    if (!root) return;
    const panel = doc.querySelector('#ku-scene-chips .ku-panel');
    if (panel) {
      if (root.parentElement === panel) return;
      root.style.left = ''; root.style.top = ''; root.style.bottom = '';
      root.classList.add('ku-md-docked');
      panel.append(root);
    } else if (root.classList.contains('ku-md-docked') || !root.isConnected) {
      root.classList.remove('ku-md-docked');
      doc.body.append(root);
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
        <button type="button" class="ku-md-btn" data-md="fold" title="Свернуть или развернуть (музыка не прервётся)" aria-label="Свернуть или развернуть">▾</button>
        <a class="ku-md-btn" data-md="open" target="_blank" rel="noopener noreferrer" title="Открыть на сайте сервиса" aria-label="Открыть на сайте сервиса">↗</a>
        <button type="button" class="ku-md-btn" data-md="close" title="Закрыть плеер" aria-label="Закрыть плеер">×</button>
      </div>
      <div class="ku-md-body"></div>`;
    root.addEventListener('click', event => {
      const action = event.target.closest('[data-md]')?.dataset.md;
      if (action === 'fold') { root.classList.toggle('ku-md-folded'); event.target.closest('button').textContent = root.classList.contains('ku-md-folded') ? '▴' : '▾'; }
      else if (action === 'close') stop();
    });
    root.querySelector('.ku-md-bar').addEventListener('pointerdown', startDrag);
    doc.body.append(root);
    const saved = readPos();
    if (saved) place(saved.left, saved.top);
    // the drawer comes and goes with the chat: dock when it appears, float again when it is gone
    if (typeof view.MutationObserver === 'function') { watcher = new view.MutationObserver(sync); watcher.observe(doc.body, { childList: true }); }
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
    destroy() { watcher?.disconnect(); watcher = null; stop(); root?.remove(); root = null; doc.getElementById(STYLE_ID)?.remove(); },
  };
}
