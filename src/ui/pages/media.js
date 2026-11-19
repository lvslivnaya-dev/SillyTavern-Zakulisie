import { button, element } from '../helpers.js';
import { MEDIA_SERVICES, parseMediaLink, searchMedia } from '../../core/index.js';
import { frameHeight } from '../media-dock.js';
import { fileToDataUrl, imageUrl } from '../../integration/wardrobe-images.js';
import { icon } from '../icons.js';

/**
 * «Медиа → Плеер»: the library of links to music and videos. A link is pasted, the service is recognised by itself; ▶ plays it in the
 * little player that hangs on the page (media-dock.js) — the music goes on while windows are switched. Pinned links stand on top.
 * Every change goes through the handlers in index.js (mediaCallbacks); text fields save on change, not on every key.
 */
export function createMediaPages(ctx) {
  const render = (...args) => ctx.render(...args);
  const setStatus = (...args) => ctx.setStatus(...args);
  const act = (...args) => ctx.act(...args);
  const invoke = (name, payload = {}) => ctx.facade.invoke(name, payload);
  const snapshot = () => ctx.snapshot;

  const open = new Set(); // ids of the rows unfolded for editing
  let armed = ''; // the id whose delete button was pressed once
  let query = '';
  // the library as a list or as a gallery of covers (only the look; remembered in this browser)
  let viewMode = (() => { try { return globalThis.localStorage?.getItem('kulisy-media-view') === 'gallery' ? 'gallery' : 'list'; } catch { return 'list'; } })();
  const setViewMode = mode => { viewMode = mode; try { globalThis.localStorage?.setItem('kulisy-media-view', mode); } catch { /* no storage: the choice lasts until the page is closed */ } render(); };
  let adding = false; // the window «Новая ссылка» over the page
  let draft = { url: '', parsed: null, title: '', note: '', mood: '', pinned: false, touched: false, looking: false };

  const library = () => ({ items: [], ...(snapshot().media ?? {}) });

  async function attempt(run, done) {
    try { const result = await run(); if (done) setStatus(typeof done === 'function' ? done(result) : done); return result; }
    catch (error) { setStatus(error?.message || String(error), true); return undefined; }
  }

  /**
   * Adding, in one place: paste a link, the page recognises the service, shows the player right here (so the link can be checked at
   * once) and fills the name as the service tells it; then the name, the mood, a note and the pin are written on the same card and
   * «Добавить в библиотеку» saves it all. Nothing is created before that.
   */
  function renderAdd() {
    return draft.parsed ? renderNewCard() : renderPaste();
  }

  function renderPaste() {
    const url = element('input', { type: 'url', value: draft.url, placeholder: 'Вставьте ссылку: YouTube, Spotify, SoundCloud, Яндекс Музыка, Apple Music или файл', 'aria-label': 'Ссылка', className: 'ku-media-paste' });
    const hint = element('p', { className: 'muted ku-small' });
    const take = () => {
      const text = url.value.trim();
      draft.url = url.value;
      if (!text) { hint.textContent = ''; return; }
      const parsed = parseMediaLink(text);
      if (!parsed) { hint.textContent = 'Это не похоже на ссылку: вставьте адрес целиком.'; return; }
      startDraft(parsed);
    };
    url.addEventListener('paste', () => setTimeout(take, 0));
    url.addEventListener('change', take);
    url.addEventListener('keydown', event => { if (event.key === 'Enter') { event.preventDefault(); take(); } });
    return element('div', { className: 'ku-media-new' }, [url, hint]);
  }

  let closeAdd = () => {};
  let titleInput = null;
  let statusNode = null;
  const blankDraft = () => ({ url: '', parsed: null, title: '', note: '', mood: '', pinned: false, touched: false, looking: false });

  function startDraft(parsed) {
    draft = { ...blankDraft(), url: parsed.url, parsed, looking: parsed.service !== 'link' };
    const wanted = parsed.url;
    render();
    Promise.resolve(invoke('onMediaLookup', { url: wanted })).catch(() => '').then(found => {
      if (draft.parsed?.url !== wanted) return;
      draft.looking = false;
      if (found && !draft.touched) { draft.title = found; if (titleInput?.isConnected) titleInput.value = found; }
      if (statusNode?.isConnected) statusNode.textContent = found ? 'Название подставлено, его можно поправить.' : 'Название не нашлось: напишите своё (или оставьте пустым).';
    });
  }

  function renderNewCard() {
    const { parsed } = draft;
    const preview = parsed.kind === 'iframe'
      ? element('iframe', { src: parsed.embed, height: String(frameHeight(parsed)), title: 'Предпросмотр', allow: 'autoplay; encrypted-media; picture-in-picture; fullscreen', allowfullscreen: '', referrerpolicy: 'strict-origin-when-cross-origin', className: 'ku-media-preview' })
      : parsed.kind === 'link' ? element('p', { className: 'muted ku-small', text: `${MEDIA_SERVICES[parsed.service]}: этот сайт нельзя встроить, ссылка будет открываться в новой вкладке.` })
        : element(parsed.kind === 'video' ? 'video' : 'audio', { src: parsed.url, controls: '', className: 'ku-media-preview' });
    titleInput = element('input', { type: 'text', value: draft.title, placeholder: 'Название', 'aria-label': 'Название' });
    titleInput.addEventListener('input', () => { draft.title = titleInput.value; draft.touched = true; });
    statusNode = element('span', { className: 'muted ku-small', text: draft.looking ? 'Ищу название…' : '' });
    const mood = element('input', { type: 'text', value: draft.mood, placeholder: 'например: тревога, нежность, погоня', 'aria-label': 'Для какого настроения' });
    mood.addEventListener('input', () => { draft.mood = mood.value; });
    const note = element('textarea', { rows: 2, value: draft.note, placeholder: 'что это за трек и когда включать', 'aria-label': 'Заметка' });
    note.addEventListener('input', () => { draft.note = note.value; });
    const pin = element('input', { type: 'checkbox', className: 'set-switch', checked: draft.pinned, 'aria-label': 'Закрепить наверху' });
    pin.addEventListener('change', () => { draft.pinned = pin.checked; });
    const save = () => attempt(async () => {
      const made = await act('onMediaAdd', { url: draft.url, title: draft.title, note: draft.note, mood: draft.mood, pinned: draft.pinned }, 'media-add');
      draft = blankDraft();
      adding = false;
      render();
      return made;
    }, made => (made?.existed ? 'Эта ссылка уже есть в библиотеке' : 'Ссылка добавлена'));
    return element('div', { className: 'ku-media-new' }, [
      element('div', { className: 'ku-row' }, [element('strong', { text: MEDIA_SERVICES[parsed.service] }), element('span', { className: 'ku-push' }), button('Другая ссылка', 'btn small', () => { draft = blankDraft(); render(); })]),
      preview,
      element('label', { className: 'ku-media-field' }, [element('span', { text: 'Название' }), titleInput, statusNode]),
      element('label', { className: 'ku-media-field' }, [element('span', { text: 'Для какого настроения' }), mood]),
      element('label', { className: 'ku-media-field' }, [element('span', { text: 'Заметка' }), note]),
      element('label', { className: 'ku-inline ku-small' }, [pin, 'Закрепить наверху']),
      element('div', { className: 'ku-row' }, [button('Добавить в библиотеку', 'btn primary', save), button('Отмена', 'btn', () => closeAdd())]),
    ]);
  }

  function field(label, value, save, { multiline = false, placeholder = '' } = {}) {
    const input = element(multiline ? 'textarea' : 'input', multiline ? { rows: 2, value, placeholder, 'aria-label': label } : { type: 'text', value, placeholder, 'aria-label': label });
    input.addEventListener('change', () => attempt(() => save(input.value)));
    return element('label', { className: 'ku-media-field' }, [element('span', { text: label }), input]);
  }

  /** The fields of one item (title, mood, note, address) and its cover: unfolded by the pencil, in the list and in the gallery. */
  function renderEdit(item) {
    const picker = element('input', { type: 'file', accept: 'image/*', hidden: true, 'aria-label': 'Картинка для галереи' });
    picker.addEventListener('change', () => {
      const [file] = [...(picker.files ?? [])];
      picker.value = '';
      if (file) attempt(async () => act('onMediaSetImage', { id: item.id, imageDataUrl: await fileToDataUrl(file) }, 'media-image'), 'Картинка поставлена');
    });
    const cover = element('div', { className: 'ku-media-coverrow' }, [
      item.image ? element('img', { className: 'ku-media-covermini', src: imageUrl(item.image), alt: '' }) : element('span', { className: 'ku-media-covermini none', 'aria-hidden': 'true' }, [icon('music')]),
      button(item.image ? 'Другая картинка' : 'Картинка для галереи', 'btn small', () => picker.click(), 'Своя картинка: видна только в виде «Галерея»'),
      ...(item.image ? [button('Убрать картинку', 'btn small', () => attempt(() => act('onMediaClearImage', { id: item.id }, 'media-image'), 'Картинка убрана'))] : []),
      picker,
    ]);
    const fields = [
      field('Название', item.title, value => act('onMediaUpdate', { id: item.id, patch: { title: value } }, 'media-title')),
      field('Для какого настроения', item.mood, value => act('onMediaUpdate', { id: item.id, patch: { mood: value } }, 'media-mood'), { placeholder: 'например: тревога, нежность, погоня' }),
      field('Заметка', item.note, value => act('onMediaUpdate', { id: item.id, patch: { note: value } }, 'media-note'), { multiline: true, placeholder: 'что это за трек и когда включать' }),
      field('Ссылка', item.url, value => act('onMediaUpdate', { id: item.id, patch: { url: value } }, 'media-url')),
    ];
    const [titleField, moodField, noteField, urlField] = fields;
    const valueOf = node => node.querySelector('input,textarea').value;
    // one button for everything typed in the fields (each field also saves by itself when it loses focus)
    const save = button('Сохранить', 'btn primary small', () => attempt(async () => {
      await act('onMediaUpdate', { id: item.id, patch: { title: valueOf(titleField), mood: valueOf(moodField), note: valueOf(noteField), url: valueOf(urlField) } }, 'media-edit');
      open.delete(item.id);
      render();
    }, 'Сохранено'));
    return element('div', { className: 'ku-media-edit' }, [
      cover,
      ...fields,
      element('div', { className: 'ku-row' }, [save, button('Закрыть', 'btn small', () => { open.delete(item.id); render(); }), element('span', { className: 'ku-push' }), element('a', { className: 'btn small', href: item.url, target: '_blank', rel: 'noopener noreferrer', text: 'Открыть на сайте ↗' })]),
    ]);
  }

  /** One cover of the gallery: the picture, the name under it, a click plays; the star and the pencil stand in the corners. */
  function renderTile(item, now) {
    const playing = now === item.id;
    const tile = element('div', { className: `ku-media-tile${item.pinned ? ' pinned' : ''}${playing ? ' playing' : ''}` });
    const face = element('button', { type: 'button', className: 'ku-media-face', title: 'Играть в плеере на странице', 'aria-label': `${item.title}: играть` }, [
      item.image ? element('img', { src: imageUrl(item.image), alt: '', loading: 'lazy', draggable: false }) : element('span', { className: 'ku-media-noface', 'aria-hidden': 'true' }, [icon('music')]),
      element('span', { className: 'ku-media-playmark', 'aria-hidden': 'true', text: playing ? '▶ играет' : '▶' }),
    ]);
    face.addEventListener('click', () => attempt(() => act('onMediaPlay', { id: item.id }, 'media-play')));
    const pin = button(item.pinned ? '★' : '☆', `btn icon small${item.pinned ? ' primary' : ''}`, () => attempt(() => act('onMediaUpdate', { id: item.id, patch: { pinned: !item.pinned } }, 'media-pin')), item.pinned ? 'Открепить' : 'Закрепить наверху');
    // in the gallery one editor at a time: it opens right under the tile that was pressed
    const edit = button('✎', 'btn icon small', () => { const was = open.has(item.id); open.clear(); if (!was) open.add(item.id); render(); }, 'Название, заметка, настроение, адрес, картинка');
    tile.append(face, element('span', { className: 'ku-media-cap', text: item.title, title: [MEDIA_SERVICES[item.service], item.mood, item.note].filter(Boolean).join(' · ') }), element('span', { className: 'ku-media-corner' }, [pin, edit]));
    return tile;
  }

  function renderRow(item, now) {
    const unfolded = open.has(item.id);
    const playing = now === item.id;
    const play = button(playing ? '▶ Играет' : '▶', `btn small${playing ? ' primary' : ''}`, () => attempt(() => act('onMediaPlay', { id: item.id }, 'media-play')), 'Играть в плеере на странице');
    const pin = button(item.pinned ? '★' : '☆', `btn icon small${item.pinned ? ' primary' : ''}`, () => attempt(() => act('onMediaUpdate', { id: item.id, patch: { pinned: !item.pinned } }, 'media-pin')), item.pinned ? 'Открепить' : 'Закрепить наверху');
    const edit = button('✎', 'btn icon small', () => { if (open.has(item.id)) open.delete(item.id); else open.add(item.id); render(); }, 'Название, заметка, настроение, адрес');
    const del = button(armed === item.id ? 'Точно удалить?' : '×', `btn icon small${armed === item.id ? ' danger' : ''}`, () => {
      if (armed !== item.id) { armed = item.id; render(); return; }
      armed = '';
      attempt(() => act('onMediaRemove', { id: item.id }, 'media-remove'), 'Ссылка удалена');
    }, 'Удалить из библиотеки');
    const head = element('div', { className: 'ku-media-head' }, [
      play,
      element('div', { className: 'ku-media-main' }, [
        element('strong', { className: 'ku-media-title', text: item.title }),
        element('span', { className: 'muted ku-small', text: [MEDIA_SERVICES[item.service], item.mood, item.note].filter(Boolean).join(' · ') }),
      ]),
      pin, edit, del,
    ]);
    const row = element('div', { className: `ku-media-row${item.pinned ? ' pinned' : ''}${playing ? ' playing' : ''}` }, [head]);
    if (unfolded) row.append(renderEdit(item));
    return row;
  }

  function renderPlayer() {
    const view = element('div', { className: 'records-view ku-media' });
    const lib = library();
    const items = searchMedia(lib, query);
    const now = snapshot().mediaNow ?? '';
    const search = element('input', { type: 'search', value: query, placeholder: 'Поиск по названию, настроению, заметке', 'aria-label': 'Поиск по библиотеке' });
    search.addEventListener('change', () => { query = search.value; render(); });
    const stop = now ? [button('■ Остановить', 'btn small', () => attempt(() => act('onMediaStop', {}, 'media-stop')), 'Закрыть плеер')] : [];
    const list = element('div', { className: 'card' }, [
      element('div', { className: 'ku-row' }, [element('h3', { text: `Библиотека · ${lib.items.length}${query ? ` · найдено ${items.length}` : ''}` }), element('span', { className: 'ku-push' }), ...stop,
        element('span', { className: 'ku-seg', role: 'tablist', 'aria-label': 'Вид библиотеки' }, [['list', 'Список'], ['gallery', 'Галерея']].map(([mode, label]) => {
          const node = button(label, mode === viewMode ? 'on' : '', () => setViewMode(mode));
          node.setAttribute('role', 'tab');
          node.setAttribute('aria-selected', String(mode === viewMode));
          return node;
        })), button('+', 'btn primary small ku-media-plus', () => { adding = true; draft = blankDraft(); render(); }, 'Добавить ссылку')]),
      search,
    ]);
    if (!lib.items.length) list.append(element('p', { className: 'muted ku-small', text: 'Пока пусто. Вставьте ссылку выше: плеер сам поймёт, что это за сервис. Закреплённое будет стоять сверху.' }));
    else if (!items.length) list.append(element('p', { className: 'muted ku-small', text: 'Ничего не нашлось.' }));
    if (viewMode === 'gallery') {
      list.append(element('div', { className: 'ku-media-grid' }, items.flatMap(item => [renderTile(item, now), ...(open.has(item.id) ? [element('div', { className: 'ku-media-row unfolded ku-media-editwide' }, [element('strong', { text: item.title }), renderEdit(item)])] : [])])));
    } else for (const item of items) list.append(renderRow(item, now));
    view.append(list);
    if (adding) {
      const close = () => { adding = false; draft = blankDraft(); render(); };
      closeAdd = close;
      const layer = element('div', { className: 'ku-cal-layer', role: 'dialog', 'aria-modal': 'true', 'aria-label': 'Новая ссылка' }, [
        element('div', { className: 'ku-cal-sheet ku-media-sheet' }, [
          element('div', { className: 'ku-row' }, [element('h3', { text: 'Новая ссылка' }), element('span', { className: 'ku-push' }), button('×', 'btn icon small', close, 'Закрыть')]),
          renderAdd(),
        ]),
      ]);
      layer.addEventListener('click', event => { if (event.target === layer) close(); });
      layer.addEventListener('keydown', event => { if (event.key === 'Escape') { event.stopPropagation(); close(); } });
      view.append(layer);
      setTimeout(() => layer.querySelector('.ku-media-paste')?.focus(), 0);
    }
    return view;
  }

  return { renderPlayer };
}

export const MEDIA_STYLE = `
.ku-media-paste{width:100%;min-height:40px}
.ku-media-new{display:flex;flex-direction:column;gap:10px}
.ku-media-preview{width:100%;max-width:560px;border:0;border-radius:12px;display:block}
.ku-media .ku-row{align-items:center}
.ku-media > .card > .ku-row:first-child{margin-bottom:12px}
.ku-media-plus{min-width:32px;min-height:32px}
.ku-media-row{margin-top:8px;padding:8px 10px;border:1px solid var(--k-line);border-radius:12px;background:var(--k-inset)}
.ku-media-row.pinned{border-color:var(--k-accent-line)}
.ku-media-row.playing{border-color:var(--k-accent);background:var(--k-accent-soft)}
.ku-media-head{display:flex;align-items:center;gap:8px}
.ku-media-main{flex:1 1 auto;min-width:0;display:flex;flex-direction:column}
.ku-media-title{white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.ku-media-main .muted{white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.ku-media-edit{display:flex;flex-direction:column;gap:8px;margin-top:8px}
.ku-media-field{display:flex;flex-direction:column;gap:3px;font-size:12px;color:var(--k-muted)}
.ku-media-field input,.ku-media-field textarea{width:100%}
.ku-media-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(130px,1fr));gap:12px;margin-top:10px}
.ku-media-editwide{grid-column:1/-1}
.ku-media-tile{position:relative;display:flex;flex-direction:column;gap:6px;min-width:0}
.ku-media-face{position:relative;aspect-ratio:1/1;padding:0;border:1px solid var(--k-line);border-radius:14px;overflow:hidden;background:var(--k-inset);color:var(--k-muted);cursor:pointer;display:grid;place-items:center}
.ku-media-face img{width:100%;height:100%;object-fit:cover;display:block}
.ku-media-noface{display:grid;place-items:center;width:44%;height:44%;color:var(--k-muted)}
.ku-media-noface svg{width:100%;height:100%}
.ku-media-playmark{position:absolute;left:8px;bottom:8px;padding:2px 8px;border-radius:999px;background:color-mix(in srgb,var(--k-panel) 85%,transparent);color:var(--k-accent);font-size:12px;font-weight:700}
.ku-media-tile.playing .ku-media-face{border-color:var(--k-accent);box-shadow:0 0 0 2px var(--k-accent-soft)}
.ku-media-tile.pinned .ku-media-face{border-color:var(--k-accent-line)}
.ku-media-cap{font-size:12.5px;line-height:1.25;text-align:center;overflow:hidden;text-overflow:ellipsis;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow-wrap:anywhere}
.ku-media-corner{position:absolute;top:6px;right:6px;display:flex;gap:4px}
.ku-media-coverrow{display:flex;align-items:center;gap:8px;flex-wrap:wrap}
.ku-media-covermini{width:56px;height:56px;border-radius:10px;object-fit:cover;background:var(--k-inset);display:grid;place-items:center;color:var(--k-muted)}
`;
