/**
 * «Гардеробная» in the drawer above the message box: two tabs of the rail, one for the persona and one for the other characters.
 * Who is dressed, what they wear now (a tap takes a piece off), the outfits of the shelf (a tap dresses in the whole outfit)
 * and the pieces of the wardrobe (a tap puts a piece on, a tap on a worn one takes it off). It is the same wardrobe and the same
 * wearing as the page «Мир → Гардероб»: the changes go through onWear / onTakeOff, so they are journaled like any other.
 *
 * It lives in ST's own DOM (the drawer is not a shadow root): styled by style.css, built with textContent only.
 */
import { WARDROBE_CATEGORIES, WARDROBE_GENDERS, cardsOf, searchCards } from '../core/wardrobe.js';
import { imageUrl } from './wardrobe-images.js';

const SECTION = Object.fromEntries(WARDROBE_CATEGORIES);

function node(tag, className, text) {
  const element = document.createElement(tag);
  if (className) element.className = className;
  if (text != null) element.textContent = String(text);
  return element;
}

function button(label, className, onClick, title = '') {
  const element = node('button', className, label);
  element.type = 'button';
  if (title) element.title = title;
  element.addEventListener('click', event => { event.preventDefault(); onClick(event); });
  return element;
}

function select(label, options, value, onChange) {
  const element = node('select', 'text_pole ku-wr-select');
  element.setAttribute('aria-label', label);
  for (const [key, text] of options) {
    const option = node('option', '', text);
    option.value = key;
    option.selected = key === value;
    element.append(option);
  }
  element.addEventListener('change', () => onChange(element.value));
  return element;
}

/** «Асуи Цую (АУ агентство)» → «Асуи Цую», when the shorter names stay different from each other. */
function shortNames(people) {
  const short = people.map(person => person.name.replace(/\s*\([^)]*\)\s*$/, '').trim() || person.name);
  return new Set(short).size === short.length ? short : people.map(person => person.name);
}

/**
 * @param {{
 *   panes: Map<string, any>, rerender: () => void,
 *   getState: () => any, wardrobe: () => { cards: any[], looks: any[] },
 *   heroes: () => { id: string, name: string, here: boolean }[], persona: () => { id: string, name: string } | null,
 *   closetOf: (id: string) => { hasCard: boolean, cardIds: string[], lookIds: string[] },
 *   wear: (payload: any) => Promise<any>, takeOff: (payload: any) => Promise<any>, notify: (text: string, isError?: boolean) => void,
 * }} deps
 * @returns {() => void} the way to take both tabs away
 */
export function registerWardrobeRooms(deps) {
  const { panes, rerender, getState, wardrobe, heroes, persona, closetOf, wear, takeOff, notify, openCloset } = deps;
  /** What each tab remembers between redraws (the drawer is rebuilt after every change). */
  const memory = {
    persona: { who: '', mode: {}, gender: '', category: '', query: '', busy: false },
    characters: { who: '', mode: {}, gender: '', category: '', query: '', busy: false },
  };

  const wornOf = id => getState().world?.wardrobe?.[id] ?? { cardIds: [], outfit: '' };

  async function act(m, work, done) {
    if (m.busy) return;
    m.busy = true;
    try { await work(); if (done) notify(done); }
    catch (error) { notify(error?.message || String(error), true); }
    finally { m.busy = false; rerender(); }
  }

  function tile(card, { on = false, cap = true } = {}) {
    const box = node('span', `ku-wr-tile${on ? ' on' : ''}`);
    if (card.image) {
      const picture = node('img', 'ku-wr-pic');
      picture.src = imageUrl(card.image);
      picture.alt = '';
      picture.loading = 'lazy';
      picture.draggable = false;
      box.append(picture);
    } else box.append(node('span', 'ku-wr-pic ku-wr-nopic', SECTION[card.category] ?? '—'));
    if (cap) box.append(node('span', 'ku-wr-cap', card.name || SECTION[card.category] || 'Вещь'));
    return box;
  }

  function render(shelf, container) {
    const m = memory[shelf];
    container.replaceChildren();
    const root = node('div', 'ku-wr');
    container.append(root);

    // Who is dressed: the persona's tab has one person, the characters' tab a drop-down list (those on stage first).
    let people;
    if (shelf === 'persona') {
      const me = persona();
      people = me ? [{ id: me.id, name: me.name, here: true }] : [];
      if (!people.length) { root.append(node('p', 'ku-wr-note', 'Персона не привязана к этому чату: выберите её в «Мир → Персона». Тогда здесь можно будет одевать её.')); return; }
    } else {
      people = heroes();
      if (!people.length) { root.append(node('p', 'ku-wr-note', 'В чате пока нет героев, которых можно одеть.')); return; }
    }
    if (!people.some(item => item.id === m.who)) m.who = people[0].id;
    const who = people.find(item => item.id === m.who);

    if (people.length > 1) {
      const labels = shortNames(people);
      root.append(select('Кого одеваем', people.map((person, index) => [person.id, `${labels[index]}${person.here ? '' : ' (не на сцене)'}`]), m.who, id => { m.who = id; render(shelf, container); }));
    } else root.append(node('div', 'ku-wr-who', who.name));

    const lib = wardrobe();
    const byId = new Map(lib.cards.map(card => [card.id, card]));

    // The closet of the card the person has: the pieces and outfits chosen there for them («Мир → Карточки → Шкаф»).
    const closet = closetOf(who.id);
    const closetCards = new Set(closet.cardIds);
    const closetLooks = new Set(closet.lookIds);
    const mode = m.mode[who.id] ?? (closetCards.size ? 'closet' : 'all');

    // Now on: a tap takes the piece off.
    const entry = wornOf(who.id);
    const wornCards = (entry.cardIds ?? []).map(id => byId.get(id)).filter(Boolean);
    const now = node('section', 'ku-wr-sec');
    now.append(node('div', 'ku-wr-title', `Надето${wornCards.length ? ` · ${wornCards.length}` : ''}`));
    if (entry.outfit) now.append(node('p', 'ku-wr-outfit', entry.outfit));
    if (wornCards.length) {
      const row = node('div', 'ku-wr-row');
      for (const card of wornCards) {
        const item = button('', 'ku-wr-worn', () => act(m, () => takeOff({ entityId: who.id, cardId: card.id }), `${who.name} снимает: ${card.name || 'вещь'}`), 'Снять');
        item.append(tile(card, { on: true }), node('span', 'ku-wr-x', '✕'));
        row.append(item);
      }
      now.append(row);
    } else now.append(node('p', 'ku-wr-note', entry.outfit ? 'Одежда записана строкой, без карточек гардероба.' : 'Карточек гардероба на нём нет.'));
    root.append(now);

    // «Шкаф» (what is chosen for them in the card) or the whole wardrobe of the shelf.
    const modes = node('div', 'ku-wr-chips ku-wr-modes');
    modes.append(
      // «Шкаф» opens the wardrobe window on the closet of this character (the big one: look through it, put it together); without that, the small list.
      button(`Шкаф${closetCards.size ? ` · ${closetCards.size}` : ''}`, `ku-wr-chip${mode === 'closet' ? ' on' : ''}`, () => {
        if (openCloset) { openCloset(who.id); return; }
        m.mode[who.id] = 'closet'; render(shelf, container);
      }, 'Открыть окно гардероба на шкафе этого героя: посмотреть его и собрать'),
      button('Вся гардеробная', `ku-wr-chip${mode === 'all' ? ' on' : ''}`, () => { m.mode[who.id] = 'all'; render(shelf, container); }, `Все вещи полки «${shelf === 'persona' ? 'Персона' : 'Персонажи'}»`),
    );
    root.append(modes);

    // Outfits: a tap dresses in the whole outfit (instead of what is worn).
    const looks = mode === 'closet' ? lib.looks.filter(look => closetLooks.has(look.id)) : lib.looks.filter(look => look.shelf === shelf);
    if (looks.length) {
      const sec = node('section', 'ku-wr-sec');
      sec.append(node('div', 'ku-wr-title', 'Образы'));
      const row = node('div', 'ku-wr-chips');
      for (const look of looks) {
        row.append(button(look.name, 'ku-wr-chip', () => act(m, () => wear({ entityId: who.id, lookId: look.id, mode: 'replace' }), `${who.name} надевает образ «${look.name}»`),
          'Надеть образ целиком вместо того, что надето сейчас'));
      }
      sec.append(row);
      root.append(sec);
    }

    // The pieces: the gender, the section and the search are three different things, then the grid. A tap on a piece puts it on
    // (over what is worn), a tap on a worn one takes it off.
    const sec = node('section', 'ku-wr-sec');
    sec.append(node('div', 'ku-wr-title', mode === 'closet' ? 'Вещи из шкафа' : 'Вещи'));
    const genderRow = node('div', 'ku-wr-line');
    genderRow.append(node('span', 'ku-wr-label', 'Пол'));
    const genders = node('div', 'ku-wr-chips ku-wr-inline');
    for (const [key, text] of [['', 'Любой'], ...Object.entries(WARDROBE_GENDERS)]) {
      genders.append(button(text, `ku-wr-chip${m.gender === key ? ' on' : ''}`, () => { m.gender = key; render(shelf, container); }));
    }
    genderRow.append(genders);
    sec.append(genderRow);
    const sectionRow = node('div', 'ku-wr-line');
    sectionRow.append(node('span', 'ku-wr-label', 'Раздел'));
    sectionRow.append(select('Раздел одежды', [['', 'Все разделы'], ...WARDROBE_CATEGORIES], m.category, key => { m.category = key; render(shelf, container); }));
    sec.append(sectionRow);
    const search = node('input', 'text_pole ku-wr-search');
    search.type = 'search';
    search.placeholder = 'Поиск по вещам';
    search.value = m.query;
    sec.append(search);
    const grid = node('div', 'ku-wr-grid');
    sec.append(grid);
    root.append(sec);

    const wornSet = () => new Set(wornOf(who.id).cardIds ?? []);
    const fill = () => {
      grid.replaceChildren();
      const pool = mode === 'closet' ? { ...lib, cards: lib.cards.filter(card => closetCards.has(card.id)) } : lib;
      const scope = mode === 'closet' ? {} : { shelf };
      const base = m.query.trim() ? searchCards(pool, m.query, scope) : cardsOf(pool, { ...scope, gender: m.gender || undefined });
      const list = m.gender && m.query.trim() ? base.filter(card => card.gender === m.gender) : base;
      const shown = m.category ? list.filter(card => card.category === m.category) : list;
      const wornNow = wornSet();
      if (!shown.length) {
        const empty = mode === 'closet' && !closetCards.size
          ? (closet.hasCard ? 'Шкаф пуст: отметьте вещи в карточке (Мир → Карточки → Шкаф).' : 'У них нет карточки: подключите карточку, и её шкаф появится здесь.')
          : mode === 'closet' || lib.cards.some(card => card.shelf === shelf) ? 'Под такие фильтры вещей нет.' : 'На этой полке гардероба пока пусто: добавьте вещи в «Мир → Гардероб».';
        grid.append(node('p', 'ku-wr-note', empty));
        return;
      }
      for (const card of shown) {
        const isOn = wornNow.has(card.id);
        const item = button('', `ku-wr-item${isOn ? ' on' : ''}`, () => act(m, () => (isOn
          ? takeOff({ entityId: who.id, cardId: card.id })
          : wear({ entityId: who.id, cardIds: [card.id], mode: 'add' })), isOn ? `${who.name} снимает: ${card.name || 'вещь'}` : `${who.name} надевает: ${card.name || 'вещь'}`),
        isOn ? 'Снять' : 'Надеть поверх того, что надето');
        item.append(tile(card, { on: isOn }));
        grid.append(item);
      }
    };
    search.addEventListener('input', () => { m.query = search.value; fill(); });
    fill();
  }

  const specs = [
    { id: 'wardrobe-persona', shelf: 'persona', icon: '👗', name: 'Одежда персоны', title: 'Гардеробная персоны: во что она одета и что можно надеть' },
    { id: 'wardrobe-heroes', shelf: 'characters', icon: '👔', name: 'Одежда героев', title: 'Гардеробная героев: во что они одеты и что можно надеть' },
  ];
  for (const spec of specs) {
    panes.set(spec.id, { id: spec.id, icon: spec.icon, name: spec.name, title: spec.title, render: container => render(spec.shelf, container) });
  }
  rerender();
  return () => { for (const spec of specs) panes.delete(spec.id); rerender(); };
}
