/**
 * «График отношений»: как менялись шкалы линии «А → Б» по ходу чата. Вкладка рисует график,
 * а любую линию можно закрепить маленьким виджетом на экране или мини-графиком в шторке сцены.
 * Данные приходят из моста Кулис (bridge.scene.lines / scales / series), состояние не меняется.
 */
import { report } from '../core/guard.js';
import { SERIES_COLORS, chartPath, zeroY, normalizeRelGraph } from '../core/relgraph.js';
import { watchRail, railHost } from './rail-extras.js';

export const WIDGET_CLASS = 'pud-relw';
export const RAIL_CLASS = 'pud-relrail';
const escapeHtml = text => String(text ?? '').replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[ch]);

/** SVG с нулевой линией и ломаными выбранных шкал. */
export function chartSvg(seriesList, { width = 260, height = 90, small = false } = {}) {
  const paths = seriesList.map((item, i) => `<path d="${chartPath(item.points, { width, height })}" fill="none" stroke="${SERIES_COLORS[i % SERIES_COLORS.length]}" stroke-width="${small ? 1.6 : 2}" stroke-linejoin="round" stroke-linecap="round"/>`).join('');
  const zero = zeroY({ height });
  return `<svg class="pud-relchart" viewBox="0 0 ${width} ${height}" width="${width}" height="${height}" role="img" aria-label="График отношений">
    <line x1="0" y1="${zero}" x2="${width}" y2="${zero}" stroke="currentColor" stroke-opacity="0.25" stroke-dasharray="3 3"/>${paths}</svg>`;
}

/**
 * @param {Document} doc
 * @param {{ context: any, settings: any, save: () => void, shared?: any, bridge?: any }} deps
 */
export function startRelGraph(doc, { context, settings, save, shared = {}, bridge = null }) {
  const api = bridge?.scene;
  const tab = shared.hub?.addTab?.('relgraph', 'Отношения', 'chart');
  const view = doc.defaultView;
  const pane = tab?.pane;
  settings.relGraph = { ...normalizeRelGraph(settings.relGraph), positions: settings.relGraph?.positions && typeof settings.relGraph.positions === 'object' ? settings.relGraph.positions : {} };
  const cfg = () => settings.relGraph;
  const persist = () => { try { save(); } catch (error) { report('график отношений: сохранение', error); } };
  const lines = () => { try { return api?.lines?.() ?? []; } catch { return []; } };
  const scales = () => { try { return api?.scales?.() ?? []; } catch { return []; } };
  const seriesFor = (lineId, scaleIds) => scaleIds.map(id => ({ id, label: scales().find(item => item.id === id)?.label ?? id, points: (() => { try { return api?.series?.(lineId, id) ?? []; } catch { return []; } })() })).filter(item => item.points.length);
  const labelOf = lineId => lines().find(item => item.id === lineId)?.label ?? 'линия';

  /** Значок шкалы из Кулис (с её собственной картинкой, если задана); без значка — первая буква названия. */
  const iconOf = id => scales().find(item => item.id === id)?.icon || '';
  const markOf = (id, label) => iconOf(id) || `<span class="pud-scale-letter">${escapeHtml(String(label).slice(0, 1))}</span>`;
  const scaleButton = (item, on, attr) => `<button type="button" class="pud-scale-btn${on ? ' on' : ''}" ${attr}="${escapeHtml(item.id)}" title="${escapeHtml(item.label)}" aria-label="${escapeHtml(item.label)}" aria-pressed="${on}">${markOf(item.id, item.label)}</button>`;
  const legend = list => `<ul class="pud-rellegend">${list.map((item, i) => `<li title="${escapeHtml(item.label)}"><i style="background:${SERIES_COLORS[i % SERIES_COLORS.length]}"></i><span class="pud-scale-mark">${markOf(item.id, item.label)}</span><b>${Math.round(item.points[item.points.length - 1].value)}</b></li>`).join('')}</ul>`;

  const overviewOf = () => { try { return api?.overview?.(cfg().scaleIds.filter(id => scales().some(item => item.id === id))) ?? []; } catch { return []; } };
  const shiftsOf = limit => { try { return api?.shifts?.(limit) ?? []; } catch { return []; } };
  const trendHtml = delta => (delta > 0 ? `<em class="pud-rel-trend up">↑${delta}</em>` : delta < 0 ? `<em class="pud-rel-trend down">↓${-delta}</em>` : '<em class="pud-rel-trend">·</em>');
  const signed = value => `${value > 0 ? '+' : ''}${Math.round(value)}`;
  /** Одна шкала одной линии: значок, полоска от −100 до 100 (ноль посередине), число и тренд. */
  const cellHtml = cell => {
    const width = Math.min(50, Math.abs(cell.value) / 2);
    const bar = cell.value >= 0 ? `left:50%;width:${width}%` : `left:${50 - width}%;width:${width}%`;
    return `<span class="pud-rel-cell" title="${escapeHtml(cell.label)}: ${Math.round(cell.value)} (${signed(cell.delta)} за последние изменения)"><span class="pud-scale-mark">${markOf(cell.id, cell.label)}</span><span class="pud-rel-bar"><i class="${cell.value < 0 ? 'neg' : 'pos'}" style="${bar}"></i></span><b>${Math.round(cell.value)}</b>${trendHtml(cell.delta)}</span>`;
  };
  const scalesFor = lineId => { const own = cfg().lineScales[lineId]; return own ?? cfg().scaleIds; };
  let editingLine = '';
  const overviewHtml = () => {
    const c = cfg();
    const union = [...new Set([...c.scaleIds, ...Object.values(c.lineScales).flat()])].filter(id => scales().some(item => item.id === id));
    let rows = [];
    try { rows = api?.overview?.(union) ?? []; } catch { rows = []; }
    if (!rows.length) return '<p class="pud-lib-empty">Линий отношений пока нет: они появятся, когда в Кулисах будет связь «А → Б».</p>';
    const shown = rows.filter(row => !c.hidden.includes(row.id));
    const rank = id => { const at = c.top.indexOf(id); return at < 0 ? 999 : at; };
    shown.sort((a, b) => rank(a.id) - rank(b.id));
    const hidden = rows.filter(row => c.hidden.includes(row.id));
    const act = (kind, row, text, title, extra = '') => `<button type="button" class="pud-rel-act${(kind === 'top' && c.top.includes(row.id)) || (kind === 'edit' && editingLine === row.id) ? ' on' : ''}" data-rel="${kind}" data-id="${escapeHtml(row.id)}"${extra} title="${title}" aria-label="${title}">${text}</button>`;
    const picker = row => `<span class="pud-rel-picker"><span class="pud-relscales">${scales().map(item => `<button type="button" class="pud-scale-btn${scalesFor(row.id).includes(item.id) ? ' on' : ''}" data-rel="scale" data-id="${escapeHtml(row.id)}" data-sid="${escapeHtml(item.id)}" title="${escapeHtml(item.label)}" aria-label="${escapeHtml(item.label)}" aria-pressed="${scalesFor(row.id).includes(item.id)}">${markOf(item.id, item.label)}</button>`).join('')}</span>${c.lineScales[row.id] ? act('reset', row, 'Как у всех', 'Вернуть общий набор шкал') : '<small class="pud-hint">Набор общий. Измените, чтобы у этой линии был свой.</small>'}</span>`;
    const list = shown.length
      ? `<ul class="pud-rel-over">${shown.map(row => {
        const mine = scalesFor(row.id);
        const cells = row.scales.filter(cell => mine.includes(cell.id));
        return `<li class="pud-rel-line${c.top.includes(row.id) ? ' top' : ''}"><span class="pud-rel-head"><span class="pud-rel-name">${escapeHtml(row.label)}${c.lineScales[row.id] ? ' <small title="У линии свой набор шкал">✎</small>' : ''}</span><span class="pud-rel-acts">${act('top', row, '📌', c.top.includes(row.id) ? 'Открепить от верха' : 'Закрепить наверху')}${act('edit', row, '⚙', 'Какие шкалы отслеживать у этой линии')}${act('hide', row, '🙈', 'Не отслеживать эту линию')}</span></span>${editingLine === row.id ? picker(row) : ''}<span class="pud-rel-cells">${cells.map(cellHtml).join('') || '<small class="pud-hint">Шкалы не выбраны: нажмите ⚙.</small>'}</span></li>`;
      }).join('')}</ul>`
      : '<p class="pud-lib-empty">Все линии скрыты: верните нужные ниже.</p>';
    const back = hidden.length
      ? `<details class="pud-rel-hidden"><summary>Не отслеживаются (${hidden.length})</summary><ul class="pud-rel-shifts">${hidden.map(row => `<li class="pud-rel-restore"><span class="pud-rel-shift-line">${escapeHtml(row.label)}</span>${act('show', row, 'Вернуть', 'Снова отслеживать')}</li>`).join('')}</ul></details>`
      : '';
    return list + back;
  };
  const shiftsHtml = limit => {
    const list = shiftsOf(limit * 4).filter(item => !cfg().hidden.includes(item.lineId)).slice(0, limit);
    if (!list.length) return '<p class="pud-lib-empty">Сдвигов пока не было.</p>';
    return `<ul class="pud-rel-shifts">${list.map(item => `<li${Number.isInteger(item.index) ? ` data-msg="${item.index}" title="Показать сообщение №${item.index}"` : ''}><span class="pud-scale-mark">${markOf(item.scaleId, scales().find(s => s.id === item.scaleId)?.label ?? item.scaleId)}</span><b class="${item.delta < 0 ? 'neg' : 'pos'}">${signed(item.delta)}</b><span class="pud-rel-shift-line">${escapeHtml(item.label)}</span><small>${Number.isInteger(item.index) ? `#${item.index}` : ''}</small></li>`).join('')}</ul>`;
  };
  const toMessage = node => {
    const found = node.closest?.('[data-msg]');
    if (!found) return false;
    doc.querySelector(`#chat .mes[mesid="${found.dataset.msg}"]`)?.scrollIntoView?.({ block: 'center', behavior: 'smooth' });
    return true;
  };

  // ───────── виджеты на экране
  const widgets = new Map();
  function paintWidget(entry) {
    const list = seriesFor(entry.lineId, entry.scaleIds);
    const box = entry.node.querySelector('.pud-relw-body');
    box.innerHTML = list.length ? `${chartSvg(list, { width: 230, height: 80, small: true })}${legend(list)}` : '<p class="pud-lib-empty">Пока нет изменений.</p>';
  }
  function syncWidgets() {
    const wanted = cfg().pinned.filter(item => item.place === 'widget');
    for (const [id, entry] of widgets) {
      if (!wanted.some(item => item.lineId === id)) { entry.node.remove(); widgets.delete(id); }
    }
    for (const item of wanted) {
      let entry = widgets.get(item.lineId);
      if (!entry) {
        const node = doc.createElement('section');
        node.className = WIDGET_CLASS;
        node.dataset.line = item.lineId;
        node.innerHTML = `<header class="pud-relw-head"><span class="pud-relw-title"></span><button type="button" class="pud-relw-x" title="Убрать виджет" aria-label="Убрать виджет">×</button></header><div class="pud-relw-body"></div>`;
        const pos = cfg().positions[item.lineId] ?? { left: 14 + widgets.size * 20, top: 130 + widgets.size * 20 };
        node.style.left = `${pos.left}px`;
        node.style.top = `${pos.top}px`;
        doc.body.append(node);
        entry = { node, lineId: item.lineId, scaleIds: item.scaleIds };
        widgets.set(item.lineId, entry);
        dragify(node, item.lineId);
      }
      entry.scaleIds = item.scaleIds;
      entry.node.querySelector('.pud-relw-title').textContent = labelOf(item.lineId);
      paintWidget(entry);
    }
  }
  function dragify(node, lineId) {
    const head = node.querySelector('.pud-relw-head');
    let start = null;
    head.addEventListener('pointerdown', event => {
      if (event.target.closest('button')) return;
      start = { x: event.clientX, y: event.clientY, left: node.offsetLeft, top: node.offsetTop };
      head.setPointerCapture?.(event.pointerId);
    });
    head.addEventListener('pointermove', event => {
      if (!start) return;
      const left = Math.max(0, Math.min(view.innerWidth - 60, start.left + event.clientX - start.x));
      const top = Math.max(0, Math.min(view.innerHeight - 40, start.top + event.clientY - start.y));
      node.style.left = `${left}px`;
      node.style.top = `${top}px`;
    });
    const end = () => {
      if (!start) return;
      start = null;
      cfg().positions[lineId] = { left: node.offsetLeft, top: node.offsetTop };
      persist();
    };
    head.addEventListener('pointerup', end);
    head.addEventListener('pointercancel', end);
  }
  const onWidgetClick = event => {
    const close = event.target.closest?.(`.${WIDGET_CLASS} .pud-relw-x`);
    if (!close) return;
    unpin(close.closest(`.${WIDGET_CLASS}`).dataset.line);
  };
  doc.addEventListener('click', onWidgetClick);

  // ───────── мини-графики в шторке
  function paintRail(rail = doc.getElementById('ku-scene-chips')) {
    if (!rail) return;
    const wanted = cfg().pinned.filter(item => item.place === 'rail');
    for (const node of rail.querySelectorAll(`.${RAIL_CLASS}`)) if (!wanted.some(item => item.lineId === node.dataset.line)) node.remove();
    for (const item of wanted) {
      let node = [...rail.querySelectorAll(`.${RAIL_CLASS}`)].find(found => found.dataset.line === item.lineId);
      if (!node) {
        node = doc.createElement('div');
        node.className = RAIL_CLASS;
        node.dataset.line = item.lineId;
        railHost(rail).append(node);
      }
      const row = (api?.overview?.(item.scaleIds) ?? []).find(found => found.id === item.lineId);
      const html = row?.scales?.length ? `<div class="pud-relrail-title">${escapeHtml(labelOf(item.lineId))}</div>${row.scales.map(cell => `<div class="pud-relrail-cell" title="${escapeHtml(cell.label)}: ${Math.round(cell.value)}"><span class="pud-scale-mark">${markOf(cell.id, cell.label)}</span><b>${Math.round(cell.value)}</b>${trendHtml(cell.delta)}</div>`).join('')}` : '';
      if (node.dataset.sig !== html) { node.innerHTML = html; node.dataset.sig = html; }
    }
  }
  const stopRail = watchRail(doc, paintRail, api);

  function pin(lineId, scaleIds, place) {
    const rest = cfg().pinned.filter(item => item.lineId !== lineId);
    cfg().pinned = [...rest, { lineId, scaleIds: [...scaleIds], place }].slice(-8);
    persist();
    syncWidgets();
    paintRail();
    render();
  }
  function unpin(lineId) {
    cfg().pinned = cfg().pinned.filter(item => item.lineId !== lineId);
    persist();
    syncWidgets();
    paintRail();
    render();
  }

  // ───────── вкладка
  function render() {
    if (!pane) return;
    const all = lines();
    const sc = scales();
    const c = cfg();
    const lineId = all.some(item => item.id === c.lineId) ? c.lineId : (all[0]?.id ?? '');
    const picked = scalesFor(lineId).filter(id => sc.some(item => item.id === id));
    const list = lineId ? seriesFor(lineId, picked) : [];
    const pinnedHere = c.pinned.find(item => item.lineId === lineId);
    pane.innerHTML = `
      <h3>Отношения</h3>
      <p class="pud-hint">Сводка «сейчас»: у каждой пары значения выбранных шкал и сдвиг за последние изменения (стрелка). Ниже последние сдвиги: нажмите на строку, чтобы перейти к сообщению. График по шагам спрятан в раскрывающийся блок.</p>
      ${api ? '' : '<p class="pud-lib-empty">Модуль Кулис не подключён: данных нет.</p>'}
      <div class="pud-card pud-card-col">
        <b>Сейчас</b>
        <p class="pud-hint">Шкалы у каждой линии свои: нажмите ⚙ у линии и выберите значки. Не больше пяти шкал на линию.</p>
        ${overviewHtml()}
      </div>
      <div class="pud-card pud-card-col"><b>Последние сдвиги</b>${shiftsHtml(12)}</div>
      <details class="pud-card pud-card-col pud-rel-detail">
        <summary><b>График по шагам</b></summary>
        <label class="pud-peek-fields"><span>Линия</span><select data-field="line">${all.map(item => `<option value="${escapeHtml(item.id)}"${item.id === lineId ? ' selected' : ''}>${escapeHtml(item.label)}</option>`).join('') || '<option value="">— линий пока нет —</option>'}</select></label>
        <div class="pud-relbox">${list.length ? `${chartSvg(list, { width: 520, height: 160 })}${legend(list)}` : '<p class="pud-lib-empty">Для этой линии пока нет изменений выбранных шкал.</p>'}</div>
        <div class="pud-peek-city">
          <button type="button" class="menu_button" data-act="widget"${lineId ? '' : ' disabled'}>Закрепить виджетом</button>
          <button type="button" class="menu_button" data-act="rail"${lineId ? '' : ' disabled'}>Закрепить в шторке</button>
          ${pinnedHere ? '<button type="button" class="menu_button" data-act="unpin">Открепить</button>' : ''}
        </div>
      </details>
      ${c.pinned.length ? `<div class="pud-card pud-card-col"><b>Закреплено</b><ul class="pud-thread-list">${c.pinned.map(item => `<li class="pud-thread"><span class="pud-thread-text">${escapeHtml(labelOf(item.lineId))} · ${item.place === 'rail' ? 'в шторке' : 'виджет'}</span><button type="button" class="menu_button" data-act="unpin-id" data-id="${escapeHtml(item.lineId)}">Открепить</button></li>`).join('')}</ul></div>` : ''}`;
  }
  /** Закрепить линию наверху сводки, скрыть, вернуть или задать ей свой набор шкал. */
  function relAction(node) {
    const button = node.closest?.('[data-rel]');
    if (!button) return false;
    const id = button.dataset.id;
    const c = cfg();
    const kind = button.dataset.rel;
    if (kind === 'top') c.top = c.top.includes(id) ? c.top.filter(item => item !== id) : [...c.top, id].slice(-20);
    else if (kind === 'hide') { c.hidden = [...new Set([...c.hidden, id])].slice(-100); c.top = c.top.filter(item => item !== id); if (editingLine === id) editingLine = ''; }
    else if (kind === 'show') c.hidden = c.hidden.filter(item => item !== id);
    else if (kind === 'edit') editingLine = editingLine === id ? '' : id;
    else if (kind === 'reset') delete c.lineScales[id];
    else if (kind === 'scale') {
      const set = new Set(scalesFor(id));
      if (set.has(button.dataset.sid)) set.delete(button.dataset.sid); else set.add(button.dataset.sid);
      c.lineScales[id] = scales().map(item => item.id).filter(sid => set.has(sid)).slice(0, 5);
    } else return false;
    persist();
    render();
    shared.quick?.refresh('relgraph');
    return true;
  }

  /** Быстрая панель в шторке: линия, шкалы, график и закрепление. */
  function renderQuick(el) {
    const all = lines();
    const sc = scales();
    const c = cfg();
    const lineId = all.some(item => item.id === c.lineId) ? c.lineId : (all[0]?.id ?? '');
    const picked = scalesFor(lineId).filter(id => sc.some(item => item.id === id));
    const list = lineId ? seriesFor(lineId, picked) : [];
    el.innerHTML = `
      ${api ? '' : '<p class="pud-lib-empty">Нет связи с Кулисами.</p>'}
      ${overviewHtml()}
      <b>Последние сдвиги</b>
      ${shiftsHtml(6)}
      <details class="pud-rel-detail">
        <summary>График по шагам</summary>
        <select data-q="line">${all.map(item => `<option value="${escapeHtml(item.id)}"${item.id === lineId ? ' selected' : ''}>${escapeHtml(item.label)}</option>`).join('') || '<option value="">— линий пока нет —</option>'}</select>
        <div class="pud-relbox">${list.length ? `${chartSvg(list, { width: 280, height: 110 })}${legend(list)}` : '<p class="pud-lib-empty">Пока нет изменений.</p>'}</div>
        <div class="pud-peek-city"><button type="button" class="menu_button" data-q="widget"${lineId ? '' : ' disabled'}>Виджетом</button><button type="button" class="menu_button" data-q="rail"${lineId ? '' : ' disabled'}>В шторку</button></div>
      </details>`;
    el.onchange = event => {
      const target = event.target;
      if (target.dataset?.q === 'line') { cfg().lineId = target.value; persist(); render(); shared.quick?.refresh('relgraph'); }
    };
    el.onclick = event => {
      if (relAction(event.target) || toMessage(event.target)) return;
      const target = event.target.closest?.('[data-q]');
      if (!target || !lineId) return;
      if (target.dataset.q === 'widget') pin(lineId, cfg().scaleIds, 'widget');
      else if (target.dataset.q === 'rail') pin(lineId, cfg().scaleIds, 'rail');
    };
  }
  const unregisterQuick = shared.quick?.register({ id: 'relgraph', icon: '💞', title: 'Отношения', render: renderQuick });

  const currentLineId = () => {
    const all = lines();
    return all.some(item => item.id === cfg().lineId) ? cfg().lineId : (all[0]?.id ?? '');
  };
  const onChange = event => {
    const target = event.target;
    if (target.dataset?.field === 'line') { cfg().lineId = target.value; persist(); render(); }
  };
  const onClick = event => {
    if (relAction(event.target) || toMessage(event.target)) return;
    const target = event.target.closest?.('[data-act]');
    if (!target) return;
    const lineId = currentLineId();
    if (target.dataset.act === 'widget' && lineId) pin(lineId, cfg().scaleIds, 'widget');
    else if (target.dataset.act === 'rail' && lineId) pin(lineId, cfg().scaleIds, 'rail');
    else if (target.dataset.act === 'unpin' && lineId) unpin(lineId);
    else if (target.dataset.act === 'unpin-id') unpin(target.dataset.id);
  };
  pane?.addEventListener('change', onChange);
  pane?.addEventListener('click', onClick);
  const paneObserver = pane ? new view.MutationObserver(() => { if (!pane.hidden) render(); }) : null;
  paneObserver?.observe(pane, { attributes: true, attributeFilter: ['hidden'] });

  const types = context.eventTypes ?? {};
  const events = context.eventSource;
  const refresh = () => { syncWidgets(); paintRail(); if (pane && !pane.hidden) render(); shared.quick?.refresh('relgraph'); };
  if (types.CHAT_CHANGED && events?.on) events.on(types.CHAT_CHANGED, refresh);
  const unsubscribeScene = api?.subscribe?.(refresh) ?? (() => {});
  syncWidgets();
  render();

  return () => {
    unregisterQuick?.();
    stopRail();
    unsubscribeScene();
    paneObserver?.disconnect();
    pane?.removeEventListener('change', onChange);
    pane?.removeEventListener('click', onClick);
    doc.removeEventListener('click', onWidgetClick);
    if (types.CHAT_CHANGED) events?.removeListener?.(types.CHAT_CHANGED, refresh);
    for (const entry of widgets.values()) entry.node.remove();
    widgets.clear();
    for (const node of doc.querySelectorAll(`.${RAIL_CLASS}`)) node.remove();
    tab?.remove?.();
  };
}
