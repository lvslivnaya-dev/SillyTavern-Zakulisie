import { button, element } from './helpers.js';

const people = text => String(text ?? '').split(/[,;\n]/).map(part => part.trim()).filter(Boolean);

/** Records as the editor holds them (people as text, so typing is never cut). */
export const recordsToDraft = records => (records ?? []).map(record => ({ ...record, about: (record.about ?? []).join(', '), knows: (record.knows ?? []).join(', '), au: [...(record.au ?? [])] }));
/** …and back to what the card stores. */
export const recordsFromDraft = draft => (draft ?? []).map(record => ({ ...record, about: people(record.about), knows: people(record.knows) }));

/**
 * The records about a persona: each has its text, whom it concerns, who knows it, the AU it belongs to, «секрет» and a switch.
 * `records` is the draft's own array, edited in place; `au` = the list of AU [{ id, name }]; `cards` = the cards of characters of the library
 * [{ id, name }] a record can be tied to straight (besides names typed in); `redraw` draws the window again.
 */
export function renderPersonaRecords({ records, au, cards = [], redraw }) {
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
    const chips = au.map(item => {
      const on = record.au.includes(item.id);
      const chip = element('button', { type: 'button', className: `ku-chip${on ? ' told' : ''}`, 'aria-pressed': String(on), text: item.name, title: on ? 'Запись только в этом АУ. Нажмите, чтобы убрать' : 'Привязать запись к этому АУ' });
      chip.addEventListener('click', () => { record.au = on ? record.au.filter(id => id !== item.id) : [...record.au, item.id]; redraw(); });
      return chip;
    });
    const secret = element('input', { type: 'checkbox', checked: Boolean(record.secret), 'aria-label': 'Секретная запись' });
    secret.addEventListener('change', () => { record.secret = secret.checked; });
    const on = element('input', { type: 'checkbox', checked: !record.off, 'aria-label': 'Запись включена' });
    on.addEventListener('change', () => { record.off = !on.checked; });
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
      ...(au.length ? [element('div', { className: 'ku-row' }, [element('span', { className: 'muted ku-small', text: 'АУ:' }), ...chips, ...(record.au.length ? [] : [element('span', { className: 'muted ku-small', text: 'во всех' })])])] : []),
      element('div', { className: 'ku-row' }, [
        element('label', { className: 'ku-inline' }, [on, 'включена']),
        element('label', { className: 'ku-inline', title: 'Знают только названные: остальные не знают и не догадываются' }, [secret, 'секрет']),
        element('span', { className: 'ku-push' }),
        button('×', 'btn icon small', () => { records.splice(index, 1); redraw(); }, 'Удалить запись'),
      ]),
    ]);
  });

  return element('div', { className: 'ku-cpane' }, [
    element('div', { className: 'ku-ctitlerow' }, [
      element('h3', { className: 'ku-ctitle', text: `Записи о персоне · ${records.length}` }),
      button('+ Запись', 'btn small', () => { records.push({ id: '', text: '', about: '', knows: '', au: [], secret: false, off: false }); redraw(); }),
    ]),
    element('p', { className: 'ku-hint', text: 'Запись идёт модели, когда на сцене кто-то из тех, кого она касается или кто о ней знает, и когда включено её АУ. Не названы ни те, ни другие: идёт всегда. Секретную знают только названные.' }),
    ...(au.length ? [] : [element('p', { className: 'ku-hint', text: 'АУ добавляются на странице «Персона».' })]),
    ...rows,
  ]);
}
