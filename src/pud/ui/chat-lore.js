/**
 * Окно «Лорбуки чата» (лапка у поля ввода → «Лорбуки чата»): какие лорбуки работают в открытом
 * чате и тут же поменять. Две колонки:
 *   слева — лорбуки нарратора (карточки: основной и дополнительные) и лорбук персоны;
 *   справа — лорбук чата и глобальные лорбуки.
 * Всё меняется сразу, родными функциями таверны; окно перерисовывается после каждой правки.
 * Книги, которые читает само Закулисье, настраиваются в «Сцене», здесь их нет.
 */
import { report } from '../core/guard.js';
import { characterApi } from '../integration/characters-api.js';
import { loreApi } from '../integration/lorebooks-api.js';
import { personaApi } from '../integration/personas-api.js';

const escapeHtml = text => String(text ?? '').replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[ch]);

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

function chip(name, data, missing) {
  const attrs = Object.entries(data).map(([key, value]) => `data-${key}="${escapeHtml(value)}"`).join(' ');
  return `<span class="pud-clore-chip${missing ? ' missing' : ''}" title="${missing ? 'файла нет: таверна эту книгу пропустит' : ''}"><button type="button" class="pud-clore-open" data-open="${escapeHtml(name)}" title="Открыть книгу в редакторе">${escapeHtml(name)}</button><button type="button" class="pud-clore-x" ${attrs} title="Отключить «${escapeHtml(name)}»" aria-label="Отключить «${escapeHtml(name)}»">×</button></span>`;
}

function render(box, sources) {
  const names = sources.known;
  const missing = name => names.length > 0 && !names.includes(name);
  const addSelect = (act, exclude, extra = '') => `<select class="text_pole" data-add="${act}" ${extra} aria-label="Добавить лорбук">${options(names.filter(name => !exclude.includes(name)), '', '+ добавить…')}</select>`;
  const cards = sources.cards.map(card => `
    <section class="pud-clore-block">
      <h4>Лорбук нарратора${sources.cards.length > 1 ? `: ${escapeHtml(card.name)}` : ''}</h4>
      <label class="pud-clore-field"><span>основной</span><select class="text_pole" data-set="card" data-avatar="${escapeHtml(card.avatar)}">${options(names, card.world)}</select></label>
      <div class="pud-clore-field"><span>дополнительные</span><span class="pud-clore-chips">${card.extras.map(name => chip(name, { drop: 'extra', avatar: card.avatar, book: name }, missing(name))).join('')}${addSelect('extra', [card.world, ...card.extras], `data-avatar="${escapeHtml(card.avatar)}"`)}</span></div>
    </section>`).join('');
  const personaBlock = sources.persona ? `
    <section class="pud-clore-block">
      <h4>Лорбук персоны «${escapeHtml(sources.persona.name)}»</h4>
      <select class="text_pole" data-set="persona" aria-label="Лорбук персоны">${options(names, sources.persona.book)}</select>
      <span class="pud-hint">во всех чатах этой персоны</span>
    </section>` : '';
  box.innerHTML = `<button type="button" class="pud-clore-close" data-close title="Закрыть" aria-label="Закрыть">×</button>
    <h3>Лорбуки этого чата</h3>
    <div class="pud-clore-cols">
      <div class="pud-clore-col">${cards || '<p class="pud-hint">Персонажа у чата нет.</p>'}${personaBlock}</div>
      <div class="pud-clore-col">
        <section class="pud-clore-block">
          <h4>Лорбук чата</h4>
          <select class="text_pole" data-set="chat" aria-label="Лорбук чата">${options(names, sources.chat)}</select>
          <span class="pud-hint">только в этом чате</span>
        </section>
        <section class="pud-clore-block">
          <h4>Глобальные лорбуки</h4>
          <span class="pud-clore-chips">${sources.global.map(name => chip(name, { drop: 'global', book: name }, missing(name))).join('')}${addSelect('global', sources.global)}</span>
          <span class="pud-hint">во всех чатах</span>
        </section>
      </div>
    </div>`;
}

export async function openChatLore(doc, { persona = personaApi, chars = characterApi, lore = loreApi, shared = {} } = {}) {
  await Promise.all([persona.ready(), chars.ready(), lore.ready()]);
  const ctx = globalThis.SillyTavern?.getContext?.();
  if (!ctx || !persona.hasChat()) { globalThis.toastr?.info?.('Сначала открой чат.', 'Закулисье'); return; }
  const box = doc.createElement('div');
  box.className = 'pud-ask pud-clore';
  const redraw = () => render(box, gather(persona));
  const run = async (what, task) => {
    try { await task(); } catch (error) { report(`лорбуки чата: ${what}`, error); globalThis.toastr?.error?.(String(error?.message ?? error), 'Закулисье'); }
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
    if (event.target.closest('[data-close]')) { box.closest('dialog')?.querySelector('.popup-button-ok')?.click(); return; }
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
