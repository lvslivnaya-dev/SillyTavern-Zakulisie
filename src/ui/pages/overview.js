import { icon, ICON_NAMES } from '../icons.js';
import { button, clamp, element, infoDot, infoRow, metricDefinitions, nextControlId, pairId, pairLabel, pairSource, pairTarget, visibleMetricDefinitions } from '../helpers.js';

/**
 * All relationship lines: cards, scales, bulk removal.
 * Moved verbatim out of studio.js. `ctx` is the Studio frame: its functions,
 * objects, and the state it owns (ctx.snapshot, ctx.tab, …) through getters.
 */
export function createOverviewPage(ctx) {
  const { facade } = ctx;
  const act = (...args) => ctx.act(...args);
  const openFactors = (...args) => ctx.openFactors(...args);
  const openHeadcanonViewer = (...args) => ctx.openHeadcanonViewer(...args);
  const render = (...args) => ctx.render(...args);
  const renderCharacterManager = (...args) => ctx.renderCharacterManager(...args);
  const setStatus = (...args) => ctx.setStatus(...args);

  // Overview sections; character-to-character lines start collapsed to keep the screen clean.
  const folds = { characters: false, personaLines: true, characterLines: false, allLines: true, newMemory: false, newTension: false, newHeadcanon: true };
  let scaleEditorPairId = null; // overview card whose scale checklist is open
  let selectedPairs = new Set(); // overview lines ticked for bulk removal

  function fold(key, title, note, body, actions = null) {
    const details = element('details', { className: 'fold' });
    details.open = folds[key];
    details.addEventListener('toggle', () => { folds[key] = details.open; });
    const summary = element('summary', { text: title });
    if (note) summary.append(element('span', { className: 'muted', text: note }));
    if (actions) summary.append(element('span', { className: 'fold-actions' }, [actions]));
    details.append(summary, element('div', { className: 'fold-body' }, [body]));
    return details;
  }

  /** Trash button in a section header: removes the selected lines of that section. */
  function bulkRemoveButton(pairs) {
    const ids = pairs.map(pair => pairId(pair)).filter(id => selectedPairs.has(id));
    const trash = button(ids.length ? `🗑 ${ids.length}` : '🗑', 'icon bulk-trash', async event => {
      // The button sits inside <summary>: keep the click from folding the section.
      event.preventDefault();
      event.stopPropagation();
      if (!ids.length) return;
      try {
        const removed = await facade.invoke('onRemovePairsBulk', { relationshipIds: ids });
        if (removed) {
          for (const id of ids) selectedPairs.delete(id);
          setStatus(`Удалено линий: ${ids.length}`);
          render();
        }
      } catch (error) { setStatus(error?.message || 'Не удалось удалить линии', true); }
    }, ids.length ? `Удалить выбранные линии: ${ids.length}` : 'Отметьте линии галочкой, чтобы удалить их');
    trash.disabled = !ids.length;
    return trash;
  }

  function renderAllRelationships() {
    const container = element('div', { style: { display: 'grid', gap: '16px' } });
    const characterCount = (ctx.snapshot.characters || []).length;
    container.append(fold('characters', 'Персонажи', `· ${characterCount}`, renderCharacterManager()));
    const pairs = ctx.snapshot.pairs || [];
    if (!pairs.length) {
      container.append(element('p', { className: 'empty', text: 'Пока нет связей: выберите пару в левой панели или запустите анализ истории.' }));
      return container;
    }
    // Forget selections of lines that no longer exist.
    selectedPairs = new Set([...selectedPairs].filter(id => pairs.some(pair => pairId(pair) === id)));
    const personaId = ctx.snapshot.personaId || ctx.snapshot.ui?.personaId || '';
    if (!personaId) {
      container.append(fold('allLines', 'Линии отношений', `· ${pairs.length}`, renderPairCards(pairs), bulkRemoveButton(pairs)));
      return container;
    }
    const withPersona = pairs.filter(pair => pairTarget(pair) === personaId);
    const between = pairs.filter(pair => pairTarget(pair) !== personaId);
    container.append(
      fold('personaLines', 'Линии с персоной', `· ${withPersona.length}`, withPersona.length
        ? renderPairCards(withPersona) : element('p', { className: 'empty', text: 'Пока никто не испытывает чувств к персоне.' }), bulkRemoveButton(withPersona)),
      fold('characterLines', 'Линии между персонажами', `· ${between.length}`, between.length
        ? renderPairCards(between) : element('p', { className: 'empty', text: 'Линий между персонажами пока нет.' }), bulkRemoveButton(between)),
    );
    return container;
  }

  function renderPairCards(pairs) {
    const grid = element('div', { className: 'relationship-cards', style: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(min(100%,350px),1fr))', gap: '16px' } });
    for (const pair of pairs) {
      const hiddenFromWidget = (ctx.snapshot.ui?.hiddenRelationshipIds ?? []).includes(pairId(pair));
      const editingScales = scaleEditorPairId === pairId(pair);
      const hiddenCount = (pair.hiddenScales ?? []).length;
      const strangerKey = [pairSource(pair), pairTarget(pair)].sort().join('|');
      // Who has met whom now lives in the character dossiers (Персонажи → Знакомства).
      // Headcanons belong to the unordered pair, the same key as strangers.
      const headcanonCount = (ctx.snapshot.ui?.headcanons?.[strangerKey]?.items ?? []).length;
      const autoHeadInput = element('input', { type: 'checkbox', checked: Boolean(facade.invoke('onAutoHeadcanons', { key: strangerKey })) });
      autoHeadInput.addEventListener('change', () => act('onSetHeadcanonAuto', { key: strangerKey, auto: autoHeadInput.checked }, 'headcanon-auto'));
      const autoHead = element('label', { className: 'strangers-toggle', title: 'Автозаполнение хедканонов этой пары по ходу игры' }, [autoHeadInput, 'Авто-хедканоны']);
      const isSelected = selectedPairs.has(pairId(pair));
      const selectInput = element('input', { type: 'checkbox', checked: isSelected, className: 'pair-select', 'aria-label': `Выбрать линию ${pairLabel(ctx.snapshot, pair)}` });
      selectInput.addEventListener('change', () => {
        if (selectInput.checked) selectedPairs.add(pairId(pair)); else selectedPairs.delete(pairId(pair));
        render();
      });
      // Corner icons: the eye is crossed out while the line is hidden from the widget.
      const eye = button('👁', `icon eye-toggle${hiddenFromWidget ? ' off' : ''}`, () => act('onToggleWidgetPair', { relationshipId: pairId(pair) }, 'widget-pair-toggle'),
        hiddenFromWidget ? 'Не показывается в виджете — показать' : 'Показывается в виджете — скрыть');
      eye.setAttribute('aria-pressed', String(!hiddenFromWidget));
      const gearOpen = scaleEditorPairId === pairId(pair);
      const hiddenCount0 = (pair.hiddenScales ?? []).length;
      const gear = element('button', { type: 'button', className: `icon gear-toggle${gearOpen ? ' on' : ''}`, 'aria-expanded': String(gearOpen), 'aria-label': 'Настройки линии: факторы роста, темп, какие шкалы показывать', title: `Настройки линии: факторы роста, темп, шкалы${hiddenCount0 ? ` (скрыто ${hiddenCount0})` : ''}` }, [icon('gear')]);
      gear.addEventListener('click', () => { scaleEditorPairId = gearOpen ? null : pairId(pair); render(); });
      const removeLine = button('×', 'icon remove-line', () => act('onRemovePair', {
        sourceId: pairSource(pair), targetId: pairTarget(pair),
      }, 'pair-remove'), 'Удалить линию');
      const card = element('article', { className: `card relationship-card${isSelected ? ' selected' : ''}` }, [
        element('div', { className: 'card-corner' }, [eye, gear, removeLine]),
        element('div', { className: 'pair-card-head' }, [
          element('label', { className: 'pair-title', title: 'Отметить для удаления' }, [selectInput, element('h3', { text: pairLabel(ctx.snapshot, pair) })]),
        ]),
        ...(editingScales ? [renderLineSettings(pair)] : []),
        renderOverview(pair),
        element('div', { className: 'pair-foot' }, [
          button(`Хедканоны (${headcanonCount})`, 'btn small', () => openHeadcanonViewer(strangerKey), 'Посмотреть хедканоны этой пары'),
          autoHead,
        ]),
      ]);
      grid.append(card);
    }
    return grid;
  }

  const TEMPO_CHOICES = [['', 'Как во всём чате'], ['very-slow', 'Очень медленно'], ['slow', 'Медленно'], ['normal', 'Обычно'], ['fast', 'Быстро']];

  /** The gear of a line: its tempo (each pair has its own), the growth factors and which scales to show. */
  function renderLineSettings(pair) {
    const id = pairId(pair);
    const current = ctx.snapshot.ui?.pairTempo?.[id] ?? '';
    const tempo = element('select', { 'aria-label': 'Темп этой линии' }, TEMPO_CHOICES.map(([value, text]) => element('option', { value, text, selected: value === current })));
    tempo.addEventListener('change', () => act('onSetPairTempo', { relationshipId: id, tempo: tempo.value }, 'pair-tempo'));
    const note = element('p', { className: 'ku-hint', text: '' });
    note.textContent = 'Насколько сильно каждый ответ двигает шкалы именно этой линии. Очень медленно: ×0,4 и не больше ±3 за ответ; медленно: ×0,65 и не больше ±6; быстро: ×1,5. У каждой линии свой темп. Темп отдельной шкалы ставится в «Факторах роста», рядом с ростом и падением.';
    const dot = infoDot(note, 'Пояснение про темп');
    return element('div', { className: 'line-settings' }, [
      element('div', { className: 'line-settings-row' }, [icon('speed'), element('span', { className: 'line-settings-label', text: 'Темп линии' }), dot, tempo]),
      note,
      element('div', { className: 'line-settings-row' }, [button('Факторы роста…', 'btn small', () => openFactors(id), 'Что двигает чувства этой линии, конечная точка, генерация'), element('span', { className: 'muted', style: { fontSize: '12px' }, text: `факторов: ${(pair.factors ?? []).length}` })]),
      renderScaleEditor(pair),
    ]);
  }

  /** Per-line scale visibility: hidden scales are not shown, sent to the model or changed by analysis. */
  function renderScaleEditor(pair) {
    const hidden = new Set(pair.hiddenScales ?? []);
    const definitions = metricDefinitions(ctx.snapshot, pair);
    const box = element('div', { className: 'scale-editor' }, [
      infoRow('Какие шкалы показывать', 'Отметьте шкалы, которые нужны этой линии. Скрытые шкалы не показываются, не отправляются модели и не меняются анализом. Значения сохраняются: шкалу можно вернуть.'),
    ]);
    const list = element('div', { className: 'scale-editor-list' });
    for (const definition of definitions) {
      const input = element('input', { type: 'checkbox', checked: !hidden.has(definition.key) });
      input.addEventListener('change', async () => {
        const next = new Set(hidden);
        if (input.checked) next.delete(definition.key); else next.add(definition.key);
        if (next.size >= definitions.length) {
          input.checked = true;
          setStatus('Хотя бы одна шкала должна остаться', true);
          return;
        }
        try { await act('onSetHiddenScales', { relationshipId: pairId(pair), hiddenScales: [...next] }, 'scales-hide'); }
        catch (error) { input.checked = !input.checked; setStatus(error?.message || 'Не удалось изменить шкалы', true); }
      });
      list.append(element('label', { className: 'scale-editor-item' }, [input, definition.label]));
    }
    box.append(list);
    return box;
  }

  function renderOverview(pair) {
    const metrics = element('div', { className: 'card relationship-metrics' }, []);
    const values = pair.metrics || pair.scales || {};
    for (const definition of visibleMetricDefinitions(ctx.snapshot, pair)) {
      const value = Number(values[definition.key] ?? definition.default ?? 0);
      const range = element('input', { id: nextControlId('rs-metric'), type: 'range', min: definition.min, max: definition.max, step: definition.step || 1, value });
      const output = element('output', { text: value });
      let current = value;
      const send = next => {
        const clamped = clamp(next, Number(definition.min), Number(definition.max));
        const previous = current;
        current = clamped;
        range.value = String(clamped);
        output.textContent = String(clamped);
        return act('onMetricChange', { pairId: pairId(pair), sourceId: pairSource(pair), targetId: pairTarget(pair), metric: definition.key, value: clamped, previousValue: previous }, 'metric-change');
      };
      range.addEventListener('input', () => { output.textContent = range.value; });
      range.addEventListener('change', () => send(Number(range.value)));
      // − and + on both sides of the slider: a click moves the scale by a step (Shift: by ten steps)
      const step = Number(definition.step) || 1;
      const nudge = (sign, label) => {
        const node = button(sign > 0 ? '+' : '−', 'metric-step', event => send(current + sign * step * (event.shiftKey ? 10 : 5)), label);
        return node;
      };
      // the name stays on the screen: a big pointer hides the pop-up hint
      const mark = element('label', { className: 'metric-icon', htmlFor: range.id, title: definition.label }, [icon(ICON_NAMES.includes(`m-${definition.key}`) ? `m-${definition.key}` : 'letter'), element('span', { className: 'metric-name', text: definition.label })]);
      metrics.append(element('div', { className: 'metric metric-compact' }, [
        element('div', { className: 'metric-head' }, [mark, output]),
        element('div', { className: 'metric-track' }, [nudge(-1, `${definition.label}: меньше`), range, nudge(1, `${definition.label}: больше`)]),
      ]));
    }
    return element('div', { className: 'grid' }, [metrics]);
  }

  return { fold, bulkRemoveButton, renderAllRelationships, renderPairCards, renderScaleEditor, renderOverview };
}
