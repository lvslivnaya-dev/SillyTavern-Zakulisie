import { button, element } from './helpers.js';

const people = text => String(text ?? '').split(/[,;\n]/).map(part => part.trim()).filter(Boolean);

/** Records as the editor holds them (people as text, so typing is never cut). */
export const recordsToDraft = records => (records ?? []).map(record => ({ ...record, about: (record.about ?? []).join(', '), knows: (record.knows ?? []).join(', ') }));
/** …and back to what the card stores. */
export const recordsFromDraft = draft => (draft ?? []).map(record => ({ ...record, about: people(record.about), knows: people(record.knows) }));

/**
 * The records about a persona: each has its text, whom it concerns, who knows it, «секрет» and a switch.
 * `records` is the draft's own array, edited in place; `cards` = the cards of characters of the library
 * [{ id, name }] a record can be tied to straight (besides names typed in); `redraw` draws the window again.
 * The records are a list in the card's side column; this pane edits the `selected` one. `add()` / `remove(index)` are the card's own
 * (they also move the selection); without them the pane adds and removes by itself.
 */
export function renderPersonaRecords({ records, cards = [], redraw, selected = 0, add = null, remove = null }) {
  const nameOf = new Map(cards.map(card => [card.id, card.name]));
  const field = (label, node) => element('label', { className: 'field' }, [element('span', { className: 'muted ku-small', text: label }), node]);
  const input = (value, label, onInput, placeholder = '') => {
    const node = element('input', { type: 'text', value, 'aria-label': label, placeholder });
    node.addEventListener('input', () => onInput(node.value));
    return node;
  };

  /** Characters of the library tied to a record: chips with their names and a list to add one more. */
  const tied = (record, key, label) => {
    const ids = record[key] ?? (record[key] = []);
    const add = element('select', { 'aria-label': `${label}: добавить героя` }, [
      element('option', { value: '', text: 'добавить героя…' }),
      ...cards.filter(card => !ids.includes(card.id)).map(card => element('option', { value: card.id, text: card.name })),
    ]);
    add.addEventListener('change', () => { if (add.value) { ids.push(add.value); redraw(); } });
    return element('div', { className: 'ku-row' }, [
      ...ids.map(id => {
        const chip = element('button', { type: 'button', className: 'ku-chip told', text: `${nameOf.get(id) ?? 'карточка удалена'} ×`, title: 'Убрать привязку' });
        chip.addEventListener('click', () => { record[key] = ids.filter(item => item !== id); redraw(); });
        return chip;
      }),
      ...(cards.length ? [add] : []),
    ]);
  };

  const rows = records.map((record, index) => {
    const text = element('textarea', { rows: 3, value: record.text, 'aria-label': `Запись ${index + 1}`, placeholder: 'Например: Рэн видит в ней младшую сестру' });
    text.addEventListener('input', () => { record.text = text.value; });
    // the list on the left names a record by its text: it follows when the field is left
    text.addEventListener('change', () => redraw());
    const secret = element('input', { type: 'checkbox', checked: Boolean(record.secret), 'aria-label': 'Секретная запись' });
    secret.addEventListener('change', () => { record.secret = secret.checked; });
    const on = element('input', { type: 'checkbox', checked: !record.off, 'aria-label': 'Запись включена' });
    on.addEventListener('change', () => { record.off = !on.checked; });
    // «Раскроется, когда»: for a secret record only
    const condition = input(record.condition ?? '', 'Условие раскрытия секрета', value => { record.condition = value; }, 'например: Ран увидит шрам на её спине');
    const conditionField = field('Раскроется, когда (необязательно)', condition);
    conditionField.hidden = !record.secret;
    secret.addEventListener('change', () => { conditionField.hidden = !secret.checked; });
    return element('div', { className: 'ku-prec' }, [
      text,
      element('div', { className: 'ku-row' }, [
        element('div', { className: 'field' }, [
          field('Кого касается', input(record.about, 'Кого касается запись', value => { record.about = value; }, 'или впишите имя или кличку')),
          tied(record, 'aboutIds', 'Кого касается'),
        ]),
        element('div', { className: 'field' }, [
          field('Кто знает', input(record.knows, 'Кто знает запись', value => { record.knows = value; }, 'или впишите имя или кличку')),
          tied(record, 'knowsIds', 'Кто знает'),
        ]),
      ]),
      conditionField,
      element('p', { className: 'ku-hint', hidden: !record.secret, text: 'Секретные записи сами попадают в «Секреты» сцены, когда ты открываешь чат с этой персоной. Знают их ты и те, кого впишешь в «Кто знает».' }),
      element('div', { className: 'ku-row' }, [
        element('label', { className: 'ku-inline' }, [on, 'включена']),
        element('label', { className: 'ku-inline', title: 'Знают только названные: остальные не знают и не догадываются' }, [secret, 'секрет']),
        element('span', { className: 'ku-push' }),
        button('×', 'btn icon small', () => { if (remove) remove(index); else { records.splice(index, 1); redraw(); } }, 'Удалить запись'),
      ]),
    ]);
  });

  const addRecord = () => { if (add) add(); else { records.push({ id: '', text: '', about: '', knows: '', secret: false, off: false }); redraw(); } };
  const index = Math.min(Math.max(Number(selected) || 0, 0), records.length - 1);
  return element('div', { className: 'ku-cpane' }, [
    element('div', { className: 'ku-ctitlerow' }, [
      element('h3', { className: 'ku-ctitle', text: records.length ? `Запись ${index + 1} из ${records.length}` : 'Записи о персоне' }),
      ...(records.length ? [] : [button('+ Запись', 'btn small', addRecord)]),
    ]),
    element('p', { className: 'ku-hint', text: 'Запись идёт модели, когда на сцене кто-то из тех, кого она касается или кто о ней знает. Новая запись — плюс у названия «Записи о персоне» в списке слева.' }),
    ...(records.length ? [rows[index]] : [element('p', { className: 'ku-hint', text: 'Записей пока нет.' })]),
  ]);
}
