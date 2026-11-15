/**
 * The tab «Плеер» of the scene drawer: the library's list to scroll through and pick from, and what plays now. The player itself
 * is media-dock.js (it hangs on the page, so the music goes on whatever tab is open); here a click on a row only starts it.
 * Plain DOM, no state of its own: every call draws the whole page from `library` and `nowId`; the typed search lives in the caller.
 */
import { MEDIA_SERVICES, searchMedia } from '../core/media-library.js';

export function renderMediaPane(container, { library, nowId = '', nowTitle = '', query = '', suggestion = null, onQuery, onPlay, onStop, onPin, onOpenPage, onDismiss }) {
  const doc = container.ownerDocument;
  const make = (tag, className, text) => { const node = doc.createElement(tag); if (className) node.className = className; if (text != null) node.textContent = text; return node; };
  const items = searchMedia(library, query);
  const root = make('div', 'pud-media-pane');

  const now = make('div', 'pud-media-now');
  if (nowId) {
    now.append(make('span', 'pud-media-nowtext', `▶ ${nowTitle}`));
    const stop = make('button', 'pud-media-stop', '■');
    stop.type = 'button'; stop.dataset.mp = 'stop'; stop.title = 'Остановить и закрыть плеер'; stop.setAttribute('aria-label', 'Остановить');
    now.append(stop);
  } else now.append(make('span', 'pud-media-nowtext pud-media-idle', 'Ничего не играет'));
  root.append(now);

  // what suits the scene now: one line with «играть» and «не то»
  if (suggestion) {
    const offer = make('div', 'pud-media-offer');
    const text = make('span', 'pud-media-offertext');
    text.append(make('span', 'pud-media-ask', 'Подходит под вайб, включить?'), make('b', null, `♪ ${suggestion.title}`), make('span', 'pud-media-why', suggestion.reason ? ` · ${suggestion.reason}` : ''));
    const go = make('button', 'pud-media-offergo', '▶'); go.type = 'button'; go.dataset.mp = 'suggest'; go.dataset.id = suggestion.id; go.title = 'Включить'; go.setAttribute('aria-label', `Включить: ${suggestion.title}`);
    const no = make('button', 'pud-media-offerno', '✕'); no.type = 'button'; no.dataset.mp = 'dismiss'; no.dataset.id = suggestion.id; no.title = 'Не то: больше не предлагать в этой сцене'; no.setAttribute('aria-label', 'Не то');
    offer.append(text, go, no);
    root.append(offer);
  }

  const search = make('input', 'text_pole pud-media-search');
  search.type = 'search'; search.value = query; search.placeholder = 'Поиск по названию и настроению'; search.setAttribute('aria-label', 'Поиск по плейлисту');
  search.dataset.mp = 'search';
  root.append(search);

  const list = make('div', 'pud-media-list');
  if (!library.items.length) list.append(make('p', 'pud-media-empty', 'Плейлист пуст. Добавьте ссылку на странице «Медиа → Плеер».'));
  else if (!items.length) list.append(make('p', 'pud-media-empty', 'Ничего не нашлось.'));
  for (const item of items) {
    const row = make('div', `pud-media-row${item.pinned ? ' pinned' : ''}${item.id === nowId ? ' playing' : ''}`);
    const play = make('button', 'pud-media-play');
    play.type = 'button'; play.dataset.mp = 'play'; play.dataset.id = item.id;
    play.title = 'Играть'; play.setAttribute('aria-label', `Играть: ${item.title}`);
    play.append(make('span', 'pud-media-title', item.title), make('span', 'pud-media-sub', [MEDIA_SERVICES[item.service], item.mood].filter(Boolean).join(' · ')));
    const pin = make('button', 'pud-media-pin', item.pinned ? '★' : '☆');
    pin.type = 'button'; pin.dataset.mp = 'pin'; pin.dataset.id = item.id;
    pin.title = item.pinned ? 'Открепить' : 'Закрепить наверху'; pin.setAttribute('aria-label', pin.title);
    row.append(play, pin);
    list.append(row);
  }
  root.append(list);

  const add = make('button', 'pud-media-add', '+ Добавить ссылку');
  add.type = 'button'; add.dataset.mp = 'add'; add.title = 'Открыть «Медиа → Плеер»';
  root.append(add);

  container.replaceChildren(root);
  container.onclick = event => {
    const target = event.target.closest?.('[data-mp]');
    if (!target) return;
    const { mp, id } = target.dataset;
    if (mp === 'play' || mp === 'suggest') onPlay?.(id);
    else if (mp === 'dismiss') onDismiss?.(id);
    else if (mp === 'pin') onPin?.(id);
    else if (mp === 'stop') onStop?.();
    else if (mp === 'add') onOpenPage?.();
  };
  container.onchange = event => { if (event.target?.dataset?.mp === 'search') onQuery?.(event.target.value); };
}
