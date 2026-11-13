import { button, element } from '../helpers.js';

const TYPES = Object.freeze({ memory: 'Воспоминание', tension: 'Напряжение', headcanon: 'Хедканон' });
const HINTS = Object.freeze({
  memory: 'Что они пережили вместе: оба это помнят, но вспоминать не обязаны.',
  tension: 'То, что между ними не решено: проявляется в мелочах, само не разрешается.',
  headcanon: 'Устойчивая привычка или факт о них двоих: всегда верно.',
});

/**
 * «Отношения → Записи»: records tied to the cards of characters (the persona's card too) — a memory, a tension, a headcanon, one kind of
 * record with a type. They live in the library, so they work in every chat; a record goes out when everyone it is tied to is on stage
 * and its AU (the same list as the persona's) is on.
 */
export function createBondsPage(ctx) {
  const snapshot = () => ctx.snapshot;
  const act = (...args) => ctx.act(...args);
  const setStatus = (...args) => ctx.setStatus(...args);
  const render = (...args) => ctx.render(...args);

  const st = { type: '', card: '', au: '', query: '', form: null };

  async function attempt(run, done) {
    try { const result = await run(); if (done) setStatus(typeof done === 'function' ? done(result) : done); return result; }
    catch (error) { setStatus(error?.message || String(error), true); return undefined; }
    finally { render(); }
  }

  const cards = () => (snapshot().locationLibrary?.characters ?? []).map(card => ({ id: card.id, name: card.persona ? `${card.name} (персона)` : card.name }));
  const auList = () => snapshot().personaCards?.au ?? [];
  const nameOf = () => new Map(cards().map(card => [card.id, card.name]));

  function chip(text, on, onClick, title = '') {
    const node = element('button', { type: 'button', className: `ku-chip${on ? ' told' : ''}`, text, title, 'aria-pressed': String(Boolean(on)) });
    node.addEventListener('click', onClick);
    return node;
  }

  function renderForm() {
    const form = st.form;
    const names = nameOf();
    const box = element('div', { className: 'card ku-bond-form' }, [element('h3', { text: form.id ? 'Запись' : 'Новая запись' })]);
    box.append(
      element('div', { className: 'ku-row' }, Object.entries(TYPES).map(([key, label]) => chip(label, form.type === key, () => { form.type = key; render(); }))),
      element('p', { className: 'muted ku-small', text: HINTS[form.type] }),
    );
    const text = element('textarea', { rows: 3, value: form.text, 'aria-label': 'Текст записи', placeholder: 'Например: Ран всегда провожает её до дома, не говоря об этом вслух' });
    text.addEventListener('input', () => { form.text = text.value; });
    box.append(element('div', { className: 'field' }, [element('label', { text: 'Текст' }), text]));

    const add = element('select', { 'aria-label': 'Добавить героя к записи' }, [
      element('option', { value: '', text: 'добавить героя…' }),
      ...cards().filter(card => !form.cardIds.includes(card.id)).map(card => element('option', { value: card.id, text: card.name })),
    ]);
    add.addEventListener('change', () => { if (add.value) { form.cardIds.push(add.value); render(); } });
    box.append(element('div', { className: 'field' }, [
      element('label', { text: 'Кого касается (запись уходит, когда все они на сцене)' }),
      element('div', { className: 'ku-row' }, [
        ...form.cardIds.map(id => chip(`${names.get(id) ?? 'карточка удалена'} ×`, true, () => { form.cardIds = form.cardIds.filter(item => item !== id); render(); }, 'Убрать')),
        add,
      ]),
    ]));
    if (form.type !== 'headcanon') {
      const strength = element('select', { 'aria-label': 'Сила записи' }, [1, 2, 3, 4, 5].map(value => element('option', { value: String(value), text: `${value}${value === 1 ? ' · слабая' : value === 5 ? ' · сильная' : ''}`, selected: value === (form.intensity ?? 3) })));
      strength.addEventListener('change', () => { form.intensity = Number(strength.value); });
      const pin = element('input', { type: 'checkbox', className: 'ku-switch', checked: form.pinned === true, 'aria-label': 'Закрепить запись' });
      pin.addEventListener('change', () => { form.pinned = pin.checked; });
      box.append(element('div', { className: 'ku-row' }, [
        element('label', { className: 'ku-inline', title: 'Сильные записи идут первыми, когда места мало' }, ['Сила', strength]),
        element('label', { className: 'ku-inline', title: 'Закреплённая идёт всегда, мимо лимита объёма' }, [pin, 'Закрепить: уходит всегда']),
      ]));
    }
    if (auList().length) {
      box.append(element('div', { className: 'field' }, [
        element('label', { text: 'В каких АУ (ни одного — во всех)' }),
        element('div', { className: 'ku-row' }, auList().map(item => chip(item.name, form.au.includes(item.id), () => { form.au = form.au.includes(item.id) ? form.au.filter(id => id !== item.id) : [...form.au, item.id]; render(); }))),
      ]));
    }
    box.append(element('div', { className: 'ku-row' }, [
      button('Сохранить', 'btn primary small', () => attempt(async () => {
        await act('onBondSave', { id: form.id, fields: { type: form.type, text: form.text, cardIds: form.cardIds, au: form.au, off: form.off, intensity: form.type === 'headcanon' ? null : form.intensity, pinned: form.type === 'headcanon' ? false : form.pinned === true } }, 'bond-save');
        st.form = null;
      }, 'Запись сохранена')),
      button('Отмена', 'btn small', () => { st.form = null; render(); }),
    ]));
    return box;
  }

  function renderRecord(bond, sent) {
    const names = nameOf();
    const auNames = new Map(auList().map(item => [item.id, item.name]));
    const on = switchOf(bond);
    return element('div', { className: `ku-fact${bond.off ? ' off' : ''}` }, [
      element('div', { className: 'ku-fact-text' }, [
        element('div', { className: 'ku-row' }, [
          element('span', { className: `ku-chip${sent ? ' told' : ''}`, text: TYPES[bond.type] ?? bond.type }),
          element('strong', { className: 'ku-small', text: bond.cardIds.map(id => names.get(id) ?? '—').join(' · ') }),
          ...bond.au.map(id => element('span', { className: 'ku-chip', text: auNames.get(id) ?? 'АУ удалено' })),
          ...(bond.pinned ? [element('span', { className: 'ku-chip', text: 'закреплена' })] : []),
          ...(bond.intensity && bond.type !== 'headcanon' ? [element('span', { className: 'ku-hint', text: `сила ${bond.intensity}` })] : []),
          ...(sent ? [element('span', { className: 'ku-hint', text: 'сейчас уходит модели' })] : []),
        ]),
        element('div', { text: bond.text }),
      ]),
      on.node,
      button('Правка', 'btn small', () => { st.form = { ...bond, cardIds: [...bond.cardIds], au: [...bond.au] }; render(); }),
      button('×', 'btn icon small', () => attempt(() => act('onBondRemove', { id: bond.id }, 'bond-remove'), 'Запись удалена'), 'Удалить запись'),
    ]);
  }

  /** The switch of a record (on / off) as a checkbox. */
  function switchOf(bond) {
    const node = element('input', { type: 'checkbox', className: 'set-switch', checked: !bond.off, 'aria-label': 'Запись включена', title: 'Включить или выключить запись' });
    node.addEventListener('change', () => attempt(() => act('onBondSave', { id: bond.id, fields: { off: !node.checked } }, 'bond-save')));
    return { node };
  }

  function renderMigration() {
    const info = snapshot().bondsChat ?? {};
    const types = st.type ? [st.type] : Object.keys(TYPES);
    const ready = types.reduce((sum, key) => sum + (info[key]?.ready ?? 0), 0);
    const skipped = types.reduce((sum, key) => sum + (info[key]?.skipped ?? 0), 0);
    if (!ready && !skipped) return null;
    const plural = { memory: 'воспоминаний', tension: 'напряжений', headcanon: 'хедканонов' };
    const parts = types.filter(key => (info[key]?.ready ?? 0) + (info[key]?.skipped ?? 0)).map(key => `${plural[key]}: ${(info[key]?.ready ?? 0) + (info[key]?.skipped ?? 0)}`).join(', ');
    return element('div', { className: 'card' }, [
      element('h3', { text: 'Своё у этого чата' }),
      element('p', { className: 'muted ku-small', text: `В чате есть свои записи (${parts}). Их можно перенести в библиотеку: они привяжутся к карточкам героев и будут работать во всех чатах. Готовы к переносу: ${ready}${skipped ? `; останутся в чате ${skipped} (у кого-то из героев нет карточки: подключите её в «Мир → Карточки»)` : ''}. Перенесённое из чата убирается, чтобы не уходить модели дважды. Новые воспоминания и напряжения анализ пишет в чат, их можно переносить сюда по мере появления.` }),
      element('div', { className: 'ku-row' }, [
        Object.assign(button(st.type ? `Перенести: ${TYPES[st.type].toLowerCase()}` : 'Перенести всё в библиотеку', 'btn primary small', () => attempt(() => act('onBondsMigrate', { type: st.type }, 'bonds-migrate'), result => `Перенесено записей: ${result?.moved ?? 0}${result?.skipped ? `, осталось в чате: ${result.skipped}` : ''}`)), { disabled: !ready }),
      ]),
    ]);
  }

  /** The AU that are on in this chat: switched here, on the persona page and anywhere the AU list is shown. */
  function renderAuStrip() {
    const on = new Set(snapshot().personaAu ?? []);
    if (!auList().length) return element('p', { className: 'muted ku-small', text: 'АУ ещё нет: добавьте их на странице «Персона» (Сцена → Персона), и их можно будет включать здесь.' });
    return element('div', { className: 'ku-row' }, [
      element('span', { className: 'muted ku-small', text: 'АУ в этом чате:' }),
      ...auList().map(item => chip(item.name, on.has(item.id), () => attempt(() => act('onPersonaAuToggle', { id: item.id, on: !on.has(item.id) }, 'persona-au-toggle')), on.has(item.id) ? 'Включено: нажмите, чтобы выключить' : 'Выключено: нажмите, чтобы включить')),
    ]);
  }

  /**
   * «Записи»: one page for memories, tensions and headcanons. The chips choose the type; the library of records (tied to cards) is shown
   * first, and under it, for the chosen type, what this chat holds of its own (`chat` = { memory, tension, headcanon } → a node or null).
   */
  function renderBondsTab(chat = {}) {
    const view = element('div');
    view.append(renderAuStrip(), renderBonds());
    const own = chat[st.type]?.();
    if (own) view.append(element('h3', { className: 'ku-bond-chat', text: `${TYPES[st.type]}: в этом чате` }), own);
    return view;
  }

  function renderBonds() {
    const lib = snapshot().locationLibrary ?? {};
    const all = lib.bonds ?? [];
    const sent = new Set(snapshot().bondsNow ?? []);
    const names = nameOf();
    const view = element('div', { className: 'records-view' });
    const sendOn = snapshot().settings?.sendBonds !== false;
    const sendSwitch = element('input', { type: 'checkbox', className: 'set-switch', checked: sendOn, 'aria-label': 'Отправлять записи модели' });
    sendSwitch.addEventListener('change', () => attempt(() => act('onSettingsChange', { settings: { sendBonds: sendSwitch.checked } }, 'settings-change'), sendSwitch.checked ? 'Записи отправляются модели' : 'Записи не отправляются модели'));
    view.append(element('label', { className: 'ku-inline', style: { margin: '18px 0 10px' } }, [sendSwitch, 'Отправлять записи модели']));
    view.append(element('p', { className: 'muted ku-small', text: 'Воспоминания, напряжения и хедканоны между героями: одна запись с типом. Запись привязана к карточкам героев (и к карточке персоны), поэтому работает в любом чате, как бы героев там ни звали, и уходит модели, когда все, кого она касается, на сцене. АУ общие с персоной: ни одного не выбрано — запись для всех АУ.' }));

    const search = element('input', { type: 'search', value: st.query, placeholder: 'Поиск по тексту', 'aria-label': 'Поиск по записям' });
    search.addEventListener('change', () => { st.query = search.value; render(); });
    const who = element('select', { 'aria-label': 'Фильтр по герою' }, [element('option', { value: '', text: 'Все герои' }), ...cards().filter(card => all.some(bond => bond.cardIds.includes(card.id))).map(card => element('option', { value: card.id, text: card.name, selected: card.id === st.card }))]);
    who.addEventListener('change', () => { st.card = who.value; render(); });
    const au = element('select', { 'aria-label': 'Фильтр по АУ' }, [element('option', { value: '', text: 'Все АУ' }), ...auList().map(item => element('option', { value: item.id, text: item.name, selected: item.id === st.au }))]);
    au.addEventListener('change', () => { st.au = au.value; render(); });
    view.append(element('div', { className: 'ku-row' }, [
      chip('Все', !st.type, () => { st.type = ''; render(); }),
      ...Object.entries(TYPES).map(([key, label]) => chip(`${label} · ${all.filter(bond => bond.type === key).length}`, st.type === key, () => { st.type = key; render(); })),
      element('span', { className: 'ku-push' }),
      button('+ Запись', 'btn primary small', () => { st.form = { id: '', type: st.type || 'headcanon', text: '', cardIds: st.card ? [st.card] : [], au: [], off: false }; render(); }),
    ]), element('div', { className: 'ku-row' }, [search, who, ...(auList().length ? [au] : [])]));

    if (st.form) view.append(renderForm());
    const migration = renderMigration();
    if (migration) view.append(migration);

    const query = st.query.trim().toLocaleLowerCase('ru-RU');
    const shown = all.filter(bond => (!st.type || bond.type === st.type)
      && (!st.card || bond.cardIds.includes(st.card))
      && (!st.au || !bond.au.length || bond.au.includes(st.au))
      && (!query || bond.text.toLocaleLowerCase('ru-RU').includes(query) || bond.cardIds.some(id => (names.get(id) ?? '').toLocaleLowerCase('ru-RU').includes(query))));
    const list = element('div', { className: 'card' }, [element('h3', { text: `Записи: ${shown.length}${shown.length === all.length ? '' : ` из ${all.length}`}` })]);
    if (!shown.length) list.append(element('p', { className: 'muted', text: all.length ? 'Ничего не найдено.' : 'Записей пока нет. Нажмите «+ Запись»: выберите тип, героев и напишите факт.' }));
    for (const bond of shown) list.append(renderRecord(bond, sent.has(bond.id)));
    view.append(list);
    return view;
  }

  return { renderBonds, renderBondsTab };
}

export const BONDS_STYLE = `
.ku-bond-form{display:flex;flex-direction:column;gap:10px}
.ku-bond-form textarea{width:100%}
.ku-bond-chat{margin:22px 0 8px;font-size:15px}
`;
