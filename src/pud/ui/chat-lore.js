/**
 * Окно «Лорбуки чата» (лапка у поля ввода → «Лорбуки чата»): какие лорбуки работают в открытом
 * чате, через кого они подключены, и тут же поменять: глобальные, основной и доп. лорбуки
 * персонажа (каждого участника группы), лорбук надетой персоны, лорбук чата.
 * Всё меняется сразу, родными функциями таверны; окно перерисовывается после каждой правки.
 */
import { report } from '../core/guard.js';
import { chatLoreBooks, duplicateNote } from '../core/chat-lore.js';
import { characterApi } from '../integration/characters-api.js';
import { loreApi } from '../integration/lorebooks-api.js';
import { personaApi } from '../integration/personas-api.js';

const escapeHtml = text => String(text ?? '').replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[ch]);
const KIND_ICON = { global: 'fa-globe', card: 'fa-address-card', extra: 'fa-book-bookmark', persona: 'fa-user', chat: 'fa-passport' };

/** Что таверна знает о лорбуках открытого чата. */
function gather(persona) {
  const ctx = globalThis.SillyTavern.getContext();
  const power = ctx.powerUserSettings ?? {};
  let cards = [];
  if (ctx.groupId) {
    const group = (ctx.groups ?? []).find(item => String(item.id) === String(ctx.groupId));
    cards = (group?.members ?? []).map(avatar => (ctx.characters ?? []).find(item => item?.avatar === avatar)).filter(Boolean);
  } else if (ctx.characterId !== undefined && ctx.characters?.[Number(ctx.characterId)]) {
    cards = [ctx.characters[Number(ctx.characterId)]];
  }
  const avatar = persona.current();
  return {
    global: loreApi.selected(),
    cards: cards.map(card => ({ avatar: card.avatar, name: card.name, world: String(card.data?.extensions?.world ?? ''), extras: persona.extraBooks(card.avatar) })),
    persona: avatar ? { avatar, name: String(power.personas?.[avatar] ?? avatar), book: String(power.persona_descriptions?.[avatar]?.lorebook ?? power.persona_description_lorebook ?? '') } : null,
    chat: persona.chatBook(),
    known: loreApi.names(),
  };
}

function options(names, current, empty = 'Нет') {
  return `<option value="">${escapeHtml(empty)}</option>${names.map(name => `<option value="${escapeHtml(name)}" ${name === current ? 'selected' : ''}>${escapeHtml(name)}</option>`).join('')}${current && !names.includes(current) ? `<option value="${escapeHtml(current)}" selected>${escapeHtml(current)} (нет файла)</option>` : ''}`;
}

function chip(name, data) {
  const attrs = Object.entries(data).map(([key, value]) => `data-${key}="${escapeHtml(value)}"`).join(' ');
  return `<span class="pud-clore-chip">${escapeHtml(name)}<button type="button" class="pud-clore-x" ${attrs} title="Отключить «${escapeHtml(name)}»" aria-label="Отключить «${escapeHtml(name)}»">×</button></span>`;
}

function render(box, sources) {
  const names = sources.known;
  const books = chatLoreBooks(sources);
  const summary = books.length
    ? books.map(book => `<li class="pud-clore-book${book.missing ? ' missing' : ''}">
        <button type="button" class="pud-clore-open" data-open="${escapeHtml(book.name)}" title="Открыть в редакторе">${escapeHtml(book.name)}</button>
        <span class="pud-clore-via">${book.via.map(item => `<span class="pud-clore-tag"><i class="fa-solid ${KIND_ICON[item.kind]}"></i> ${escapeHtml(item.label)}</span>`).join('')}</span>
        ${book.missing ? '<span class="pud-hint">файла нет — таверна его пропустит</span>' : duplicateNote(book) ? `<span class="pud-hint">${duplicateNote(book)}</span>` : ''}
      </li>`).join('')
    : '<li class="pud-hint">В этом чате не работает ни один лорбук.</li>';
  const addSelect = (act, exclude, extra = '') => `<select class="text_pole" data-add="${act}" ${extra}>${options(names.filter(name => !exclude.includes(name)), '', '+ добавить…')}</select>`;
  const cards = sources.cards.map(card => `
    <div class="pud-clore-row">
      <span class="pud-clore-label"><i class="fa-solid fa-address-card"></i> ${escapeHtml(card.name)}</span>
      <label class="pud-clore-field"><span>основной</span><select class="text_pole" data-set="card" data-avatar="${escapeHtml(card.avatar)}">${options(names, card.world)}</select></label>
      <div class="pud-clore-field"><span>доп.</span><span class="pud-clore-chips">${card.extras.map(name => chip(name, { drop: 'extra', avatar: card.avatar, book: name })).join('')}${addSelect('extra', [card.world, ...card.extras], `data-avatar="${escapeHtml(card.avatar)}"`)}</span></div>
    </div>`).join('');
  box.innerHTML = `<h3>Лорбуки этого чата</h3>
    <ul class="pud-clore-list">${summary}</ul>
    <h4>Где подключены</h4>
    <div class="pud-clore-row">
      <span class="pud-clore-label"><i class="fa-solid fa-globe"></i> Глобально</span>
      <span class="pud-clore-chips">${sources.global.map(name => chip(name, { drop: 'global', book: name })).join('')}${addSelect('global', sources.global)}</span>
      <span class="pud-hint">во всех чатах</span>
    </div>
    ${cards || '<p class="pud-hint">Персонажа у чата нет.</p>'}
    ${sources.persona ? `<div class="pud-clore-row">
      <span class="pud-clore-label"><i class="fa-solid fa-user"></i> Персона «${escapeHtml(sources.persona.name)}»</span>
      <select class="text_pole" data-set="persona">${options(names, sources.persona.book)}</select>
      <span class="pud-hint">во всех её чатах</span>
    </div>` : ''}
    <div class="pud-clore-row">
      <span class="pud-clore-label"><i class="fa-solid fa-passport"></i> Этот чат</span>
      <select class="text_pole" data-set="chat">${options(names, sources.chat)}</select>
      <span class="pud-hint">только здесь</span>
    </div>`;
}

export async function openChatLore(doc, { persona = personaApi, chars = characterApi, lore = loreApi, shared = {} } = {}) {
  await Promise.all([persona.ready(), chars.ready(), lore.ready()]);
  const ctx = globalThis.SillyTavern?.getContext?.();
  if (!ctx || !persona.hasChat()) { globalThis.toastr?.info?.('Сначала открой чат.', 'Пудреница'); return; }
  const box = doc.createElement('div');
  box.className = 'pud-ask pud-clore';
  const redraw = () => render(box, gather(persona));
  const run = async (what, task) => {
    try { await task(); } catch (error) { report(`лорбуки чата: ${what}`, error); globalThis.toastr?.error?.(String(error?.message ?? error), 'Пудреница'); }
    redraw();
  };
  box.addEventListener('change', event => {
    const target = event.target;
    const value = target.value;
    if (target.dataset.add === 'global' && value) run('глобально', () => lore.setGlobal(doc, value, true));
    else if (target.dataset.add === 'extra' && value) run('доп. лорбук', () => persona.setExtraBooks(target.dataset.avatar, [...persona.extraBooks(target.dataset.avatar), value]));
    else if (target.dataset.set === 'card') run('лорбук персонажа', () => chars.setWorld(target.dataset.avatar, value));
    else if (target.dataset.set === 'persona') run('лорбук персоны', () => persona.update(persona.current(), { lorebook: value }));
    else if (target.dataset.set === 'chat') run('лорбук чата', () => persona.setChatBook(doc, value));
  });
  box.addEventListener('click', event => {
    const drop = event.target.closest('[data-drop]');
    if (drop) {
      const { book, avatar } = drop.dataset;
      if (drop.dataset.drop === 'global') run('глобально', () => lore.setGlobal(doc, book, false));
      else run('доп. лорбук', () => persona.setExtraBooks(avatar, persona.extraBooks(avatar).filter(item => item !== book)));
      return;
    }
    const open = event.target.closest('[data-open]');
    if (open) {
      const name = open.dataset.open;
      // окно таверны выше окон Пудреницы: сначала закрываем его, потом открываем редактор
      box.closest('dialog')?.querySelector('.popup-button-ok')?.click();
      if (shared.loreEditor?.open) shared.loreEditor.open(name); else lore.open(name);
    }
  });
  redraw();
  await ctx.callGenericPopup(box, ctx.POPUP_TYPE.TEXT, '', { okButton: 'Готово', wide: true, allowVerticalScrolling: true });
}
