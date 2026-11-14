import { button, element, infoDot } from '../helpers.js';

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

  const st = { type: '', cards: [], aus: [], query: '', form: null, pop: '', popQuery: '' };

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

  /**
   * A button «Герои · 2» that opens a little window with a tick for every hero (or AU). `picked` is an array that is changed in place;
   * `key` names the window (only one is open at a time). Under the button the window is drawn by `panel()`.
   */
  function pickButton(key, label, picked, title) {
    const open = st.pop === key;
    const node = element('button', { type: 'button', className: `btn small ku-pickbtn${open || picked.length ? ' on' : ''}`, title, 'aria-expanded': String(open) }, [label, picked.length ? element('span', { className: 'ku-count', text: String(picked.length) }) : null]);
    node.addEventListener('click', () => { st.pop = open ? '' : key; st.popQuery = ''; render(); });
    return node;
  }

  function pickPanel(key, title, items, picked, { search = false, onChange = () => {} } = {}) {
    if (st.pop !== key) return null;
    const box = element('div', { className: 'card ku-bond-pop', role: 'group', 'aria-label': title }, [
      element('div', { className: 'ku-row' }, [
        element('strong', { text: title }),
        element('span', { className: 'ku-push' }),
        ...(picked.length ? [button('Сбросить', 'btn small', () => { picked.splice(0, picked.length); onChange(); render(); })] : []),
        button('Готово', 'btn small', () => { st.pop = ''; render(); }),
      ]),
    ]);
    const list = element('div', { className: 'ku-bond-picks' });
    const fill = () => {
      const q = st.popQuery.trim().toLocaleLowerCase('ru-RU');
      list.replaceChildren(...items.filter(item => !q || item.name.toLocaleLowerCase('ru-RU').includes(q)).map(item => {
        const input = element('input', { type: 'checkbox', checked: picked.includes(item.id), 'aria-label': item.name });
        input.addEventListener('change', () => {
          const at = picked.indexOf(item.id);
          if (input.checked && at < 0) picked.push(item.id);
          if (!input.checked && at >= 0) picked.splice(at, 1);
          onChange();
          render();
        });
        return element('label', { className: `ku-bond-pick${input.checked ? ' on' : ''}` }, [input, item.name]);
      }));
      if (!list.children.length) list.append(element('p', { className: 'muted ku-small', text: items.length ? 'Ничего не найдено.' : 'Список пуст.' }));
    };
    if (search && items.length > 8) {
      const find = element('input', { type: 'search', value: st.popQuery, placeholder: 'Поиск', 'aria-label': 'Поиск' });
      find.addEventListener('input', () => { st.popQuery = find.value; fill(); });
      box.append(find);
    }
    fill();
    box.append(list);
    return box;
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

    box.append(element('div', { className: 'ku-row' }, [
      pickButton('form-who', 'Герои', form.cardIds, 'Кого касается запись: она уходит модели, когда все они на сцене'),
      ...(auList().length ? [pickButton('form-au', 'АУ', form.au, 'В каких АУ запись работает. Ни одного: во всех')] : []),
      element('span', { className: 'ku-small muted', text: form.cardIds.length ? form.cardIds.map(id => names.get(id) ?? '—').join(' · ') : 'выберите героев' }),
    ]));
    for (const panel of [
      pickPanel('form-who', 'Кого касается запись', cards(), form.cardIds, { search: true }),
      pickPanel('form-au', 'В каких АУ (ни одного — во всех)', auList(), form.au),
    ]) if (panel) box.append(panel);
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

  /** «Move to the library»: one line on top, hard to miss and small. Null when the chat has nothing of its own. */
  function renderMigration() {
    const info = snapshot().bondsChat ?? {};
    const types = st.type ? [st.type] : Object.keys(TYPES);
    const ready = types.reduce((sum, key) => sum + (info[key]?.ready ?? 0), 0);
    const skipped = types.reduce((sum, key) => sum + (info[key]?.skipped ?? 0), 0);
    if (!ready && !skipped) return null;
    const plural = { memory: 'воспоминаний', tension: 'напряжений', headcanon: 'хедканонов' };
    const parts = types.filter(key => (info[key]?.ready ?? 0) + (info[key]?.skipped ?? 0)).map(key => `${plural[key]}: ${(info[key]?.ready ?? 0) + (info[key]?.skipped ?? 0)}`).join(', ');
    const note = element('p', { className: 'ku-hint', text: 'Записи этого чата можно перенести в библиотеку: они привяжутся к карточкам героев и будут работать в любом чате. Из чата они при этом уйдут. Что привязать не к чему (нет карточки героя), остаётся здесь.' });
    const move = Object.assign(button(st.type ? `Перенести: ${TYPES[st.type].toLowerCase()}` : 'Перенести в библиотеку', 'btn primary small', () => attempt(() => act('onBondsMigrate', { type: st.type }, 'bonds-migrate'), result => `Перенесено записей: ${result?.moved ?? 0}${result?.skipped ? `, осталось в чате: ${result.skipped}` : ''}`)), { disabled: !ready });
    return element('div', { className: 'ku-migrate' }, [
      element('div', { className: 'ku-migrate-row' }, [
        element('span', { className: 'ku-migrate-text', text: `В этом чате свои записи (${parts}). Перенести в библиотеку?` }),
        infoDot(note, 'Что значит «перенести»'),
        element('span', { className: 'ku-push' }),
        move,
      ]),
      note,
    ]);
  }

  /** The AU that are on in this chat: switched here, on the persona page and anywhere the AU list is shown. */
  function renderAuStrip() {
    const on = new Set(snapshot().personaAu ?? []);
    if (!auList().length) return element('p', { className: 'muted ku-small', text: 'АУ ещё нет: добавьте их на странице «Персона» (Сцена → Персона), и их можно будет включать здесь.' });
    return element('div', { className: 'ku-row ku-austrip' }, [
      element('strong', { className: 'ku-small', text: 'АУ в этом чате' }),
      ...auList().map(item => chip(item.name, on.has(item.id), () => attempt(() => act('onPersonaAuToggle', { id: item.id, on: !on.has(item.id) }, 'persona-au-toggle')), on.has(item.id) ? 'Включено: нажмите, чтобы выключить' : 'Выключено: нажмите, чтобы включить')),
    ]);
  }

  /**
   * «Записи»: one page for memories, tensions and headcanons. The chips choose the type; the library of records (tied to cards) is shown
   * first, and under it, for the chosen type, what this chat holds of its own (`chat` = { memory, tension, headcanon } → a node or null).
   */
  function renderBondsTab(chat = {}) {
    const view = element('div');
    const migration = renderMigration();
    if (migration) view.append(migration);
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
    view.append(element('label', { className: 'ku-inline', style: { margin: '14px 0 10px' } }, [sendSwitch, 'Отправлять записи модели']));
    view.append(element('p', { className: 'ku-hint', text: 'Воспоминания, напряжения и хедканоны между героями: одна запись с типом. Запись привязана к карточкам героев (и к карточке персоны), поэтому работает в любом чате, как бы героев там ни звали, и уходит модели, когда все, кого она касается, на сцене. АУ общие с персоной: ни одного не выбрано — запись для всех АУ.' }));

    const search = element('input', { type: 'search', value: st.query, placeholder: 'Поиск по тексту', 'aria-label': 'Поиск по записям' });
    search.addEventListener('change', () => { st.query = search.value; render(); });
    const tabs = element('div', { className: 'ku-tabs ku-bondtabs', role: 'tablist' });
    for (const [key, label, count] of [['', 'Все', all.length], ...Object.entries(TYPES).map(([key, label]) => [key, label, all.filter(bond => bond.type === key).length])]) {
      const tab = button(`${label} · ${count}`, st.type === key ? 'on' : '', () => { st.type = key; render(); });
      tab.setAttribute('role', 'tab');
      tab.setAttribute('aria-selected', String(st.type === key));
      tabs.append(tab);
    }
    view.append(element('div', { className: 'ku-row ku-bondbar' }, [tabs, element('span', { className: 'ku-push' }), button('+ Запись', 'btn primary', () => { st.form = { id: '', type: st.type || 'headcanon', text: '', cardIds: [...st.cards], au: [], off: false }; render(); })]));
    const heroes = cards().filter(card => all.some(bond => bond.cardIds.includes(card.id)));
    view.append(element('div', { className: 'ku-row' }, [
      search,
      pickButton('filter-who', 'Герои', st.cards, 'Показать записи только про выбранных героев'),
      ...(auList().length ? [pickButton('filter-au', 'АУ', st.aus, 'Показать записи только этих АУ (и без АУ)')] : []),
    ]));
    for (const panel of [
      pickPanel('filter-who', 'Показать записи про', heroes, st.cards, { search: true }),
      pickPanel('filter-au', 'Показать АУ', auList(), st.aus),
    ]) if (panel) view.append(panel);

    if (st.form) view.append(renderForm());

    const query = st.query.trim().toLocaleLowerCase('ru-RU');
    const shown = all.filter(bond => (!st.type || bond.type === st.type)
      && (!st.cards.length || bond.cardIds.some(id => st.cards.includes(id)))
      && (!st.aus.length || !bond.au.length || bond.au.some(id => st.aus.includes(id)))
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
.ku-bondbar{margin:6px 0 14px;gap:12px}
.ku-bondtabs{margin:0;max-width:none;padding:5px;gap:5px}
.ku-bondtabs button{min-height:42px;padding:0 18px;font-size:14.5px;flex:0 1 auto;white-space:nowrap}
.ku-bondtabs button.on{background:var(--k-accent-soft);color:var(--k-accent);box-shadow:inset 0 0 0 1px var(--k-accent-line)}
.ku-migrate{margin:0 0 12px;padding:8px 12px;border:1px solid var(--k-accent-line);border-radius:12px;background:var(--k-accent-soft)}
.ku-migrate-row{display:flex;align-items:center;gap:8px;flex-wrap:wrap}
.ku-migrate-text{font-size:13.5px;font-weight:600}
.ku-austrip{margin:0 0 12px;padding:8px 12px;border:1px solid var(--k-line);border-radius:12px;background:var(--k-inset)}
.ku-pickbtn.on{border-color:var(--k-accent);color:var(--k-accent)}
.ku-count{display:inline-grid;place-items:center;min-width:18px;height:18px;margin-left:6px;padding:0 5px;border-radius:9px;background:var(--k-accent);color:var(--k-bg);font-size:11px;font-weight:700}
.ku-bond-pop{display:flex;flex-direction:column;gap:8px;max-width:460px;margin:8px 0 12px;padding:12px 14px}
.ku-bond-picks{display:grid;grid-template-columns:repeat(auto-fill,minmax(170px,1fr));gap:4px;max-height:260px;overflow:auto}
.ku-bond-pick{display:flex;align-items:center;gap:8px;padding:6px 8px;border:1px solid var(--k-line);border-radius:9px;cursor:pointer;font-size:13px;overflow-wrap:anywhere}
.ku-bond-pick.on{border-color:var(--k-accent);background:var(--k-accent-soft)}
.ku-bond-pick input{width:15px;height:15px;margin:0;flex:0 0 auto}
`;
