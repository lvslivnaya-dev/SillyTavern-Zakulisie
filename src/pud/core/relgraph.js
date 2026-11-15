/**
 * График отношений: как менялась шкала линии «А → Б» по ходу чата.
 * Данные берутся из журнала операций (scale.set / scale.delta / relationship.upsert), заново считаются по порядку.
 * Чистые функции: состояние приходит снаружи, ничего не меняется.
 */
import { relationshipId } from '../../core/ids.js';

/** Цвета линий графика берутся из палитры таверны (--pud-*), здесь только порядок выбора. */
export const SERIES_COLORS = Object.freeze(['var(--pud-rose2)', 'var(--pud-ink)', 'var(--pud-rose3)', 'var(--pud-tech)', 'var(--pud-ink2)']);

const nameOf = (state, id) => state.entities?.[id]?.name ?? id;

/** Список линий: [{ id, label }] — у каждой есть хотя бы одно изменение шкалы или ненулевая шкала. */
export function relationLines(state) {
  const out = [];
  for (const relation of Object.values(state?.relationships ?? {})) {
    if (!relation?.from || !relation?.to) continue;
    out.push({ id: relation.id, label: `${nameOf(state, relation.from)} → ${nameOf(state, relation.to)}` });
  }
  return out.sort((a, b) => a.label.localeCompare(b.label, 'ru'));
}

/** Шкалы настроенные в чате: [{ id, label }]. */
export const scaleList = state => (state?.config?.scales ?? []).map(scale => ({ id: scale.id, label: scale.label ?? scale.id }));

/**
 * Значения одной шкалы одной линии по порядку изменений.
 * @returns {Array<{ step:number, index:number|null, value:number }>} step — номер изменения (0 — начальное значение),
 * index — номер сообщения, если известен
 */
export function scaleSeries(state, lineId, scaleId) {
  const scale = (state?.config?.scales ?? []).find(item => item.id === scaleId);
  if (!scale) return [];
  const base = state?.baseline?.relationships?.[lineId]?.scales?.[scaleId];
  let value = Number.isFinite(base) ? base : (scale.default ?? 0);
  const points = [{ step: 0, index: null, value }];
  let step = 0;
  for (const operation of state?.operations ?? []) {
    const payload = operation?.payload ?? {};
    const id = payload.relationshipId || (payload.from && payload.to ? safeId(payload.from, payload.to) : null);
    if (id !== lineId) continue;
    let next = null;
    if (operation.type === 'scale.set' && payload.scaleId === scaleId) next = Number(payload.value);
    else if (operation.type === 'scale.delta' && payload.scaleId === scaleId) next = value + Number(payload.value);
    else if (operation.type === 'relationship.upsert' && Number.isFinite(payload.scales?.[scaleId])) next = Number(payload.scales[scaleId]);
    if (next === null || !Number.isFinite(next)) continue;
    value = Math.max(-100, Math.min(100, next));
    step += 1;
    points.push({ step, index: Number.isInteger(operation.messageIndex) ? operation.messageIndex : null, value });
  }
  return points;
}

function safeId(from, to) {
  try { return relationshipId(from, to); } catch { return null; }
}

const clampScale = value => Math.max(-100, Math.min(100, value));

/** Что одна операция делает со шкалами: [{ lineId, scaleId, mode: 'set' | 'delta', value }]. */
function effectsOf(operation) {
  const payload = operation?.payload ?? {};
  const lineId = payload.relationshipId || (payload.from && payload.to ? safeId(payload.from, payload.to) : null);
  if (!lineId) return [];
  if (operation.type === 'scale.set' && payload.scaleId) return [{ lineId, scaleId: payload.scaleId, mode: 'set', value: Number(payload.value) }];
  if (operation.type === 'scale.delta' && payload.scaleId) return [{ lineId, scaleId: payload.scaleId, mode: 'delta', value: Number(payload.value) }];
  if (operation.type === 'relationship.upsert') return Object.entries(payload.scales ?? {}).filter(([, value]) => Number.isFinite(value)).map(([scaleId, value]) => ({ lineId, scaleId, mode: 'set', value: Number(value) }));
  return [];
}

const startValue = (state, lineId, scaleId) => {
  const base = state?.baseline?.relationships?.[lineId]?.scales?.[scaleId];
  if (Number.isFinite(base)) return base;
  return (state?.config?.scales ?? []).find(item => item.id === scaleId)?.default ?? 0;
};

/**
 * Последние сдвиги шкал по всем линиям, новые сверху.
 * @returns {Array<{ lineId:string, label:string, scaleId:string, delta:number, value:number, index:number|null }>}
 */
export function recentShifts(state, limit = 10) {
  const values = new Map();
  const shifts = [];
  for (const operation of state?.operations ?? []) {
    for (const effect of effectsOf(operation)) {
      if (!Number.isFinite(effect.value)) continue;
      const key = `${effect.lineId}|${effect.scaleId}`;
      const before = values.has(key) ? values.get(key) : startValue(state, effect.lineId, effect.scaleId);
      const after = clampScale(effect.mode === 'delta' ? before + effect.value : effect.value);
      values.set(key, after);
      if (after === before) continue;
      const relation = state?.relationships?.[effect.lineId];
      shifts.push({
        lineId: effect.lineId,
        label: relation ? `${nameOf(state, relation.from)} → ${nameOf(state, relation.to)}` : effect.lineId,
        scaleId: effect.scaleId,
        delta: after - before,
        value: after,
        index: Number.isInteger(operation.messageIndex) ? operation.messageIndex : null,
      });
    }
  }
  return shifts.slice(-Math.max(1, limit)).reverse();
}

/**
 * Сводка «сейчас»: для каждой линии значение выбранных шкал и сдвиг за последние `window` изменений этой шкалы.
 * @returns {Array<{ id:string, label:string, scales:Array<{ id:string, label:string, value:number, delta:number }> }>}
 */
export function relationOverview(state, scaleIds, window = 5) {
  const defs = state?.config?.scales ?? [];
  const wanted = defs.filter(scale => scaleIds.includes(scale.id));
  return relationLines(state).map(line => ({
    id: line.id,
    label: line.label,
    scales: wanted.map(scale => {
      const points = scaleSeries(state, line.id, scale.id);
      const current = state?.relationships?.[line.id]?.scales?.[scale.id];
      const value = Number.isFinite(current) ? current : (points.at(-1)?.value ?? scale.default ?? 0);
      const older = points[Math.max(0, points.length - 1 - window)]?.value ?? value;
      return { id: scale.id, label: scale.label ?? scale.id, value, delta: Math.round(value - older) };
    }),
  }));
}

/**
 * Серия точек → путь SVG (ломаная) в рамке width×height; ось X — шаги, ось Y — от -100 до 100.
 * Единственная точка рисуется горизонтальной чертой.
 */
export function chartPath(points, { width = 260, height = 90, pad = 4 } = {}) {
  if (!points.length) return '';
  const w = width - pad * 2;
  const h = height - pad * 2;
  const last = Math.max(1, points.length - 1);
  const xy = points.map((point, i) => [pad + (i / last) * w, pad + (1 - (point.value + 100) / 200) * h]);
  if (xy.length === 1) xy.push([pad + w, xy[0][1]]);
  return xy.map(([x, y], i) => `${i ? 'L' : 'M'}${x.toFixed(1)} ${y.toFixed(1)}`).join(' ');
}

/** Координата нулевой линии в той же рамке. */
export const zeroY = ({ height = 90, pad = 4 } = {}) => pad + (height - pad * 2) / 2;

export const RELGRAPH_DEFAULTS = Object.freeze({
  // последняя открытая линия и её шкалы во вкладке
  lineId: '',
  scaleIds: ['affection', 'trust'],
  // закреплённые линии: [{ lineId, scaleIds, place: 'widget' | 'rail' }]
  pinned: [],
  hidden: [],
  top: [],
  lineScales: {},
});

const lineIds = (value, max) => (Array.isArray(value) ? [...new Set(value.filter(item => typeof item === 'string' && item))].slice(0, max) : []);
const lineScaleMap = value => Object.fromEntries(Object.entries(value && typeof value === 'object' ? value : {}).slice(0, 100).map(([id, list]) => [id, lineIds(list, 5)]));

export function normalizeRelGraph(raw) {
  const source = raw && typeof raw === 'object' ? raw : {};
  const ids = value => (Array.isArray(value) ? [...new Set(value.map(String))].slice(0, 5) : []);
  return {
    lineId: typeof source.lineId === 'string' ? source.lineId : '',
    // линии, которые не отслеживаем, и закреплённые наверху сводки
    hidden: lineIds(source.hidden, 100),
    top: lineIds(source.top, 20),
    lineScales: lineScaleMap(source.lineScales),
    scaleIds: ids(source.scaleIds).length ? ids(source.scaleIds) : [...RELGRAPH_DEFAULTS.scaleIds],
    pinned: (Array.isArray(source.pinned) ? source.pinned : []).filter(item => item && typeof item.lineId === 'string')
      .map(item => ({ lineId: item.lineId, scaleIds: ids(item.scaleIds), place: item.place === 'rail' ? 'rail' : 'widget' })).slice(0, 8),
  };
}
