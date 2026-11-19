/**
 * Kulisy inside SillyTavern's own chat, outside the Studio:
 *   - the scene drawer above the message box: who is on stage, and the stage directions
 *     («пнуть» a character, a scene event). Opened, it stays open until its arrow is clicked;
 *   - a note under a reply where the chronicler found a leak, with its three answers;
 *   - a note under a reply where a character seems to die: mark it, or not;
 *   - a note under a reply where someone seems to learn a lorebook secret: mark it, or not;
 *   - a note under a reply where the chronicler thinks something is a secret: open the window to check it, or not.
 *
 * It lives in ST's DOM (not a shadow root), so it is styled by style.css with
 * ST theme variables only. All markup is built with textContent: names and
 * quotes come from the chat and are never parsed as HTML.
 */

const CHIPS_ID = 'ku-scene-chips';

/** Страницы шторки от других модулей (Закулисье): { id, icon, name, title, render(container) }. Плитки в рейке и страницы панели. */
export const extraPanes = new Map();
/** The buttons of the drawer that can be switched off in the settings (the scene's own is always there). */
export const DRAWER_TILES = [
  { id: 'scene', label: 'Новый кадр' }, { id: 'calendar', label: 'Календарь / погода' }, { id: 'sent', label: 'Что уходит' }, { id: 'quests', label: 'Квесты' },
  { id: 'songs', label: 'Медиа' }, { id: 'wardrobe', label: 'Одежда' }, { id: 'narrator', label: 'Рассказчику / повторы' },
];
const TILE_OF_PANE = { 'wardrobe-persona': 'wardrobe', 'wardrobe-heroes': 'wardrobe', note: 'narrator', repeats: 'narrator' };
/** One button of the drawer with tabs inside: the pages it holds (the ones that are there) and the names of the tabs. */
const PANE_GROUPS = [
  { id: 'wardrobe', icon: '👗', name: 'Одежда', title: 'Гардеробная: во что одеты персона и герои и что можно надеть', members: { 'wardrobe-persona': 'Персона', 'wardrobe-heroes': 'Герои' } },
  { id: 'narrator', icon: '📝', name: 'Рассказчику / повторы', title: 'Указание рассказчику на следующий ответ и повторы в тексте', members: { note: 'Указание', repeats: 'Повторы' } },
];
/** Связь с отрисовкой шторки: перерисовать и узнать, какая страница открыта. */
export const extraPaneHooks = { rerender: null, current: () => '', show: null };
/** The playlist of the media library, drawn under the songs on the tab «Медиа» of the drawer (index.js sets render and now). */
export const mediaSection = { render: null, now: () => '', suggest: null };

function extraPaneBody(item) {
  const box = node('div', 'pud-pane-host');
  try { item.render(box); } catch (error) { console.error('[Kulisy] Extra pane failed.', error); box.textContent = 'Не получилось показать страницу.'; }
  return box;
}
const STRIP_ID = 'ku-scene-strip';
const KIND_LABELS = { holiday: 'Праздник', birthday: 'День рождения', quest: 'Квест', sentimental: 'Сентиментальный день' };
/** The steps shown in the drawer's «Настройка» page (the full list is on the page «Настройка чата»). */
const BANNER_STEPS = new Set(['persona', 'characters', 'lorebooks', 'calendar', 'weather', 'wardrobe']);

const LEAK_CLASS = 'ku-leak';
const SLIP_CLASS = 'ku-slip';
const DEATH_CLASS = 'ku-death-note-chat';
const QUEST_HINT_CLASS = 'ku-quest-note-chat';
const MEDIA_OFFER_CLASS = 'ku-media-note-chat';
const REVEAL_CLASS = 'ku-reveal-note';
const SECRET_HINT_CLASS = 'ku-secret-hint';

function node(tag, className, text) {
  const element = document.createElement(tag);
  if (className) element.className = className;
  if (text != null) element.textContent = String(text);
  return element;
}

function actionButton(label, action, data, title) {
  const button = node('button', 'menu_button ku-leak-button', label);
  button.type = 'button';
  button.dataset.kuAction = action;
  for (const [key, value] of Object.entries(data)) button.dataset[key] = String(value);
  if (title) button.title = title;
  return button;
}

import { WEATHER_KINDS, WEATHER_KIND_IDS } from '../core/weather.js';
import { EVENT_GENRES } from '../core/direction.js';
import { PLAN_UNITS, PLAN_UNIT_IDS, plural } from '../core/event-plan.js';
import { attachTimeMask } from '../shared/time-mask.js';

const MODE_LABEL = { calm: 'Быт', fight: 'Бой', intim: 'Близость' };
const MODE_MARK = { calm: '☕', fight: '⚔', intim: '🔥' };
const MODE_HINT = {
  calm: 'Обычная сцена: быт и разговор',
  fight: 'Бой: модели уходят боевые разделы анкет',
  intim: 'Близость: модели уходят разделы анкет для интимных сцен',
};

/** The two lists of the «Рассказчику» tab: the pinned ones are open until folded, the saved ones are folded until opened. */
function noteIsOpen(ui, which) {
  return which === 'lib' ? ui.noteFold?.lib === true : ui.noteFold?.pins !== false;
}

function chipButton(text, action, data = {}, title = '', className = 'ku-dir-btn') {
  const button = node('button', className, text);
  button.type = 'button';
  button.dataset.kuAction = action;
  for (const [key, value] of Object.entries(data)) button.dataset[key] = String(value);
  if (title) button.title = title;
  return button;
}

/**
 * view = {
 *   chips: boolean,                       // the setting
 *   cast: [{ id, name, present, persona, silent, badges }],
 *   dice: { groups: [{ id, label, icon, multi, options: [{ id, text, custom }] }], picks: [{ group, id, text }], locked: [groupId], sent } | null,
 *   clock: { time: 'HH:MM', day, label },            // the story clock the «Время» panel edits
 *   weather: { kind, temp, source, badge } | null,   // the weather in force; the drawer shows it and sets it
 *   sceneMode: 'calm' | 'fight' | 'intim',   // the kind of scene (decides which lorebook sections go out)
 *   location: string, time: string, secrets: number, waitingReveals: number,
 *   director: { open, silenceAfter, hotkeys, canKick, favorites: [text],
 *               cues: [{ id, entityId, label, badge, used, wait }], others: [{ id, name }] },
 *   leaks: [{ messageIndex, entityId, eventId, name, eventText, quote, canSwipe }],
 * }
 * describe(id) → { persona, present, name, reactTargets: [{ id, name }],
 *                  lines: [{ targetId, targetName, factors: [{ label, text }] }],
 *                  secrets: [{ eventId, label, text }] }
 * eventIdeas() → [text]: today's calendar events, offered as ready scene events.
 */
export function mountChatOverlay({ onDiceRelease, onStage, onHeat, onQuestHint, onMediaOffer, onQuestStep, onSong, onQuestPush, onDiceRoll, onDiceToggle, onDiceLock, onDiceAdd, onDiceSend, onDiceClear, onSetTime, onWeather, onSceneMode, onTogglePresent, onLeak, onSlip, onDeath, onReveal, onSecretHint, onOpenStudio, onOpenPersonas, onSetupOff, onCalendarSave, onCalendarRemove,
  onCue, onRemoveCue, onKickNow, onToggleOpen, onCastLook, onFavorite, onNotes, onPlan, describe, eventIdeas }) {
  // The panel's own state: what is selected and typed survives every re-render.
  const fresh = () => ({ stageNote: null, diceAdd: '', diceDraft: '', clock: null, selected: '', pane: '', wait: 0, draft: '', eventDraft: '', sceneDraft: '', noteDraft: '', noteEvery: 0, frameMore: false, noteFold: {}, noteEdit: null, planAmount: 1, planUnit: 'day', planWithin: false, planText: '', planGenre: '', wxFrom: 0, wxDays: 1, wxTemp: '', wxText: '', placeDraft: '', placeId: '', skip: 'none', sceneCast: [], songFind: '', calDay: '', calForm: null });
  const ui = fresh();
  let lastView = null;
  let lastChatId = null; // a new chat opens with a clean drawer: no pane, no drafts, no selected hero of the old one
  let lastMenu = null;

  const resetMenu = () => Object.assign(ui, fresh());
  /** Arm a cue; then (optionally) send right away, like «▶ Пнуть сейчас». */
  const arm = (cue, { now = false } = {}) => {
    Promise.resolve(onCue?.({ ...cue, wait: ui.wait })).then(ok => {
      if (ok === false) return;
      resetMenu();
      rerender();
      if (now) onKickNow?.();
    }).catch(error => console.error('[Kulisy] Cue failed.', error));
  };
  const sceneCue = () => {
    const place = ui.placeDraft.trim();
    const known = (lastView?.director?.places ?? []).find(item => item.id === ui.placeId);
    return {
      kind: 'scene', text: ui.sceneDraft.trim(), skip: ui.skip, castIds: [...ui.sceneCast],
      ...(known ? { placeId: known.id, place: place || known.name } : place ? { place } : {}),
    };
  };

  /**
   * «Новый кадр»: the one function that was «Сцена» and «Событие». A time jump, a place or a cast makes it a new scene;
   * without them it is an event in the scene that goes on (the text only, or nothing: the narrator invents it).
   */
  const frameCue = () => {
    const scene = sceneCue();
    if (scene.skip !== 'none' || scene.place || scene.castIds.length) return scene;
    return { kind: 'event', ...(scene.text ? { text: scene.text } : {}) };
  };

  /** The drafts of the «Время» panel; they start from the clock and survive re-renders. */
  const clockDraft = () => {
    ui.clock ??= { time: lastView?.clock?.time ?? '', day: lastView?.clock?.day ? String(lastView.clock.day) : '', label: lastView?.clock?.label ?? '' };
    return ui.clock;
  };
  function saveClock() {
    const draft = clockDraft();
    Promise.resolve(onSetTime?.({ time: draft.time.trim(), day: draft.day.trim(), label: draft.label.trim() }))
      .then(ok => { if (ok !== false) { ui.clock = null; rerender(); } });
  }
  /** «+1 ч»: whole minutes forward; past midnight the day goes up too (when the day is known). */
  function shiftClock(minutes) {
    const draft = clockDraft();
    const match = /^(\d{1,2}):(\d{2})$/.exec(draft.time.trim());
    if (!match || !Number.isFinite(minutes)) return;
    const total = Number(match[1]) * 60 + Number(match[2]) + minutes;
    const days = Math.floor(total / 1440);
    const within = ((total % 1440) + 1440) % 1440;
    draft.time = `${String(Math.floor(within / 60)).padStart(2, '0')}:${String(within % 60).padStart(2, '0')}`;
    if (days && Number(draft.day) > 0) draft.day = String(Number(draft.day) + days);
    saveClock();
  }

  /** The weather the user picked goes onto the chosen days (from today by default, one day); the typed temperature and words go with it. */
  function applyWeather(kind) {
    const temp = ui.wxTemp.trim();
    const single = ui.wxFrom === 0 && ui.wxDays === 1;
    Promise.resolve(onWeather?.({ kind, temp: temp === '' || !Number.isFinite(Number(temp)) ? '' : Number(temp), text: ui.wxText.trim(), lock: single && lastView?.weather?.source === 'lock', from: ui.wxFrom, days: ui.wxDays }))
      .then(() => { ui.wxTemp = ''; ui.wxText = ''; ui.wxFrom = 0; ui.wxDays = 1; rerender(); });
  }

  function directorAction(action, data) {
    switch (action) {
      case 'dir-weather': applyWeather(data.kind); return true;
      case 'dir-wx-apply': if (lastView?.weather?.kind) applyWeather(lastView.weather.kind); return true;
      case 'dir-wx-from': ui.wxFrom = Math.max(0, Math.round(Number(data.from)) || 0); rerender(); return true;
      case 'dir-wx-days': ui.wxDays = Math.max(1, Math.round(Number(data.days)) || 1); rerender(); return true;
      case 'dir-weather-clear': Promise.resolve(onWeather?.({ clear: true, from: ui.wxFrom, days: ui.wxDays })).then(() => { ui.wxFrom = 0; ui.wxDays = 1; rerender(); }); return true;
      case 'dir-weather-lock': Promise.resolve(onWeather?.({ kind: lastView?.weather?.kind, temp: lastView?.weather?.temp, lock: lastView?.weather?.source !== 'lock' })).then(() => rerender()); return true;
      case 'dir-dice-roll': Promise.resolve(onDiceRoll?.({ only: data.group || '' })).then(() => rerender()); return true;
      case 'dir-dice-pick': Promise.resolve(onDiceToggle?.({ group: data.group, option: data.option })).then(() => rerender()); return true;
      case 'dir-dice-lock': Promise.resolve(onDiceLock?.({ group: data.group })).then(() => rerender()); return true;
      case 'dir-heat': {
        const payload = data.value !== undefined ? { value: Number(data.value) } : { delta: Number(data.delta) };
        Promise.resolve(onHeat?.(payload)).then(() => rerender());
        return true;
      }
      case 'dir-dice-release': Promise.resolve(onDiceRelease?.({ group: data.group, option: data.option })).then(() => rerender()); return true;
      case 'dir-stage-note': {
        const text = (ui.stageNote ?? lastView?.dice?.stage?.note ?? '').trim();
        Promise.resolve(onStage?.({ note: text })).then(() => { ui.stageNote = null; rerender(); });
        return true;
      }
      case 'dir-stage': Promise.resolve(onStage?.({ stage: data.stage })).then(() => rerender()); return true;
      case 'dir-stage-step': Promise.resolve(onStage?.({ delta: Number(data.delta) })).then(() => rerender()); return true;
      case 'dir-stage-lock': Promise.resolve(onStage?.({ lock: !lastView?.dice?.stage?.lock })).then(() => rerender()); return true;
      case 'dir-stage-clear': Promise.resolve(onStage?.({ clear: true })).then(() => rerender()); return true;
      case 'dir-heat-lock': Promise.resolve(onHeat?.({ lock: !lastView?.heat?.lock })).then(() => rerender()); return true;
      case 'dir-heat-clear': Promise.resolve(onHeat?.({ clear: true })).then(() => rerender()); return true;
      case 'dir-quest-step': Promise.resolve(onQuestStep?.({ questId: data.questId, stepId: data.stepId, done: true })).then(() => rerender()); return true;
      case 'dir-song-fav': Promise.resolve(onSong?.({ op: 'favorite', songId: data.songId })).then(() => rerender()); return true;
      case 'dir-song-pin': Promise.resolve(onSong?.({ op: 'pin', songId: data.songId, mode: data.mode || 'sound', singerId: data.singerId || '' })).then(() => rerender()); return true;
      case 'dir-song-unpin': Promise.resolve(onSong?.({ op: 'unpin', songId: data.songId })).then(() => rerender()); return true;
      case 'dir-song-mute': Promise.resolve(onSong?.({ op: 'mute', songId: data.songId })).then(() => rerender()); return true;
      case 'dir-song-unmute': Promise.resolve(onSong?.({ op: 'unmute', songId: data.songId })).then(() => rerender()); return true;
      case 'dir-quest-push': Promise.resolve(onQuestPush?.({ questId: data.questId })).then(() => rerender()); return true;
      case 'dir-dice-send': Promise.resolve(onDiceSend?.()).then(() => rerender()); return true;
      case 'dir-dice-clear': Promise.resolve(onDiceClear?.()).then(() => rerender()); return true;
      case 'dir-dice-add-open': ui.diceAdd = ui.diceAdd === data.group ? '' : data.group; ui.diceDraft = ''; rerender(); return true;
      case 'dir-dice-add-save': {
        const text = ui.diceDraft.trim();
        if (!text) return true;
        const group = ui.diceAdd;
        Promise.resolve(onDiceAdd?.({ group, text })).then(() => { ui.diceAdd = ''; ui.diceDraft = ''; rerender(); });
        return true;
      }
      case 'dir-clock-save': saveClock(); return true;
      case 'dir-clock-shift': shiftClock(Number(data.minutes)); return true;
      case 'dir-mode': Promise.resolve(onSceneMode?.(data.mode)).then(() => rerender()); return true;
      case 'dir-toggle': onToggleOpen?.(!lastView?.director?.open); return true;
      case 'dir-castlook': onCastLook?.(lastView?.castLook === 'icons' ? 'list' : 'icons'); return true;
      case 'dir-select':
        if (ui.selected === data.entityId) resetMenu(); else Object.assign(ui, { selected: data.entityId, pane: '', draft: '' });
        rerender();
        return true;
      case 'dir-pane': {
        const open = Boolean(lastView?.director?.open);
        // The tab that is already on: a second press folds the panel back into the rail.
        // «+ Позвать» is a part of «Сцена»: its second press only closes the list of those to call.
        if (open && !ui.selected && data.pane === 'others' && ui.pane === 'others') { ui.pane = 'who'; rerender(); return true; }
        if (open && !ui.selected && (ui.pane || 'who') === data.pane) { onToggleOpen?.(false); return true; }
        ui.pane = data.pane;
        if (['others', 'scene', 'note', 'who', 'calendar', 'quests', 'songs'].includes(data.pane) || extraPanes.has(data.pane)) ui.selected = '';
        if (data.pane === 'who') ui.clock = null;
        if (!open) onToggleOpen?.(true);
        rerender();
        return true;
      }
      case 'dir-media-tab': ui.mediaTab = data.tab; rerender(); return true;
      case 'dir-tab': ui.pane = data.pane; ui.selected = ''; rerender(); return true;
      case 'dir-wait': ui.wait = Number(data.wait) || 0; rerender(); return true;
      case 'dir-cue': {
        const cue = { kind: data.kind, entityId: ui.selected };
        if (data.target) cue.targetId = data.target;
        if (data.kind === 'factor') {
          const factor = lastMenu?.lines?.[Number(data.line)]?.factors?.[Number(data.index)];
          if (!factor) return true;
          const line = lastMenu.lines[Number(data.line)];
          Object.assign(cue, { targetId: line.targetId, text: factor.text, label: factor.label });
          if (line.side === 'out') cue.side = 'out';
        }
        if (data.kind === 'secret') {
          const secret = lastMenu?.secrets?.[Number(data.index)];
          if (!secret) return true;
          Object.assign(cue, { eventId: secret.eventId, text: secret.text, label: secret.label });
        }
        if (data.kind === 'event') { delete cue.entityId; if (data.text) cue.text = data.text; if (data.genre) cue.genre = data.genre; }
        arm(cue);
        return true;
      }
      case 'dir-custom': {
        const text = (data.text ?? ui.draft).trim();
        if (text) arm({ kind: 'custom', entityId: ui.selected, text });
        return true;
      }
      case 'dir-frame': {
        if (ui.skip === 'plan') {
          Promise.resolve(onPlan?.({ action: 'add', text: ui.sceneDraft.trim(), genre: ui.planGenre, amount: ui.planAmount, unit: ui.planUnit, within: ui.planWithin })).then(ok => { if (ok) { ui.sceneDraft = ''; ui.planGenre = ''; rerender(); } });
        } else arm(frameCue(), { now: data.now === 'true' });
        return true;
      }
      case 'dir-skip': ui.skip = data.skip; rerender(); return true;
      case 'dir-cast': {
        const id = data.entityId;
        ui.sceneCast = ui.sceneCast.includes(id) ? ui.sceneCast.filter(item => item !== id) : [...ui.sceneCast, id];
        rerender();
        return true;
      }
      case 'dir-cal-day': { ui.calDay = ui.calDay === data.iso ? '' : data.iso; ui.calForm = null; rerender(); return true; }
      case 'dir-cal-new': { ui.calForm = { title: '', date: ui.calDay, kind: '', intensity: 2, time: '', repeat: 'none' }; rerender(); return true; }
      case 'dir-cal-edit': {
        const found = (lastView?.calendar?.days?.[ui.calDay] ?? []).find(item => item.id === data.id);
        if (found) { ui.calForm = { ...found }; rerender(); }
        return true;
      }
      case 'dir-cal-cancel': { ui.calForm = null; rerender(); return true; }
      case 'dir-cal-save': {
        const form = ui.calForm;
        if (!form || !String(form.title ?? '').trim()) return true;
        Promise.resolve(onCalendarSave?.({ ...form, title: form.title.trim(), date: form.date || ui.calDay })).then(() => { ui.calForm = null; rerender(); }).catch(error => globalThis.toastr?.error?.(error?.message || String(error), 'Закулисье'));
        return true;
      }
      case 'dir-cal-del': Promise.resolve(onCalendarRemove?.({ id: data.id })).then(() => rerender()); return true;
      case 'dir-note': {
        const text = ui.noteDraft.trim();
        if (text) arm({ kind: 'note', text });
        return true;
      }
      case 'dir-note-save': { const text = ui.noteDraft.trim(); if (text) Promise.resolve(onNotes?.({ action: 'save', text, every: ui.noteEvery })).then(ok => { if (ok) { ui.noteDraft = ''; rerender(); } }); return true; }
      case 'dir-note-pin-all': { const text = ui.noteDraft.trim(); if (text) Promise.resolve(onNotes?.({ action: 'pin-all', text, every: ui.noteEvery })).then(ok => { if (ok) { ui.noteDraft = ''; rerender(); } }); return true; }
      case 'dir-note-pin-all-saved': Promise.resolve(onNotes?.({ action: 'pin-all-saved', id: data.id })).then(() => rerender()); return true;
      case 'dir-note-unpin-all': Promise.resolve(onNotes?.({ action: 'unpin-all', id: data.id })).then(() => rerender()); return true;
      case 'dir-note-fold': ui.noteFold = { ...ui.noteFold, [data.which]: !noteIsOpen(ui, data.which) }; rerender(); return true;
      case 'dir-note-pin': { const text = ui.noteDraft.trim(); if (text) Promise.resolve(onNotes?.({ action: 'pin', text, every: ui.noteEvery })).then(ok => { if (ok) { ui.noteDraft = ''; rerender(); } }); return true; }
      case 'dir-note-send': Promise.resolve(onNotes?.({ action: 'send', id: data.id, wait: ui.wait })).then(() => rerender()); return true;
      case 'dir-note-pin-saved': Promise.resolve(onNotes?.({ action: 'pin-saved', id: data.id })).then(() => rerender()); return true;
      case 'dir-note-unpin': Promise.resolve(onNotes?.({ action: 'unpin', id: data.id })).then(() => rerender()); return true;
      case 'dir-note-del': Promise.resolve(onNotes?.({ action: 'delete', id: data.id })).then(() => rerender()); return true;
      case 'dir-note-edit': ui.noteEdit = { scope: data.scope, id: data.id, text: data.text ?? '', every: Math.max(0, Math.round(Number(data.every)) || 0) }; rerender(); return true;
      case 'dir-note-edit-cancel': ui.noteEdit = null; rerender(); return true;
      case 'dir-note-edit-save': {
        const edit = ui.noteEdit;
        if (!edit || !edit.text.trim()) return true;
        Promise.resolve(onNotes?.({ action: 'edit', scope: edit.scope, id: edit.id, text: edit.text.trim(), every: edit.every })).then(ok => { if (ok) { ui.noteEdit = null; rerender(); } });
        return true;
      }
      case 'dir-plan-when': ui.planWithin = data.within === 'true'; rerender(); return true;
      case 'dir-plan-genre': ui.planGenre = ui.planGenre === data.genre ? '' : data.genre; rerender(); return true;
      case 'dir-plan-del': Promise.resolve(onPlan?.({ action: 'remove', id: data.id })).then(() => rerender()); return true;
      case 'dir-note-load': ui.noteDraft = data.text ?? ''; ui.noteEvery = Math.max(0, Math.round(Number(data.every)) || 0); rerender(); return true;
      case 'dir-fav-save': if (ui.draft.trim()) onFavorite?.(ui.draft.trim(), true); return true;
      case 'dir-fav-del': onFavorite?.(data.text, false); return true;
      case 'dir-remove': onRemoveCue?.(data.cueId); return true;
      case 'dir-kick': onKickNow?.(); return true;
      default: return false;
    }
  }

  const onClick = event => {
    const target = event.target instanceof Element ? event.target.closest('[data-ku-action]') : null;
    if (!target) return;
    event.preventDefault();
    event.stopPropagation();
    const { kuAction: action, entityId, eventId, messageIndex, slipIndex } = target.dataset;
    try {
      if (action.startsWith('dir-')) directorAction(action, target.dataset);
      else if (action === 'present') onTogglePresent(entityId, target.dataset.present !== 'true');
      else if (action === 'studio') onOpenStudio?.(target.dataset.tab);
      else if (action === 'open-personas') onOpenPersonas?.(target.dataset.avatar ?? '');
      else if (action.startsWith('reveal-')) onReveal?.(action.slice(7), { messageIndex: Number(messageIndex), entityId, eventId });
      else if (action.startsWith('secret-')) onSecretHint?.(action.slice(7), { messageIndex: Number(messageIndex), eventId });
      else if (action.startsWith('media-')) onMediaOffer?.(action.slice(6), { id: target.dataset.mediaId });
      else if (action.startsWith('quest-')) onQuestHint?.(action.slice(6), { messageIndex: Number(messageIndex), hintId: target.dataset.hintId });
      else if (action.startsWith('death-')) onDeath?.(action.slice(6), { messageIndex: Number(messageIndex), entityId });
      else if (action.startsWith('slip-')) onSlip?.(action.slice(5), { messageIndex: Number(messageIndex), slipIndex: Number(slipIndex) });
      else onLeak(action, { messageIndex: Number(messageIndex), entityId, eventId });
    } catch (error) {
      console.error('[Kulisy] Chat overlay action failed.', error);
    }
  };
  document.addEventListener('click', onClick, true);

  // Typing in the panel's fields: kept in ui, Enter sends.
  const onInput = event => {
    const field = event.target?.dataset?.kuField;
    if (field === 'custom') ui.draft = event.target.value;
    if (field === 'scene') ui.sceneDraft = event.target.value;
    if (field === 'note') ui.noteDraft = event.target.value;
    if (field === 'note-edit' && ui.noteEdit) ui.noteEdit.text = event.target.value;
    if (field === 'note-edit-every' && ui.noteEdit) ui.noteEdit.every = Math.max(0, Math.min(99, Math.round(Number(event.target.value)) || 0));
    if (field === 'plan-amount') ui.planAmount = Math.max(1, Math.min(99, Math.round(Number(event.target.value)) || 1));
    if (field === 'plan-unit' && PLAN_UNIT_IDS.includes(event.target.value)) { ui.planUnit = event.target.value; rerender(); }
    if (field === 'wx-temp') ui.wxTemp = event.target.value;
    if (field === 'wx-text') ui.wxText = event.target.value;
    if (field === 'note-every') ui.noteEvery = Math.max(0, Math.min(99, Math.round(Number(event.target.value)) || 0));
    if (field === 'place') ui.placeDraft = event.target.value;
    if (field === 'song-find') {
      ui.songFind = event.target.value;
      ui.mediaTab = 'songs';
      rerender();
      const again = event.target.ownerDocument?.querySelector?.('[data-ku-field="song-find"]');
      if (again) { again.focus(); try { again.setSelectionRange(again.value.length, again.value.length); } catch { /* not a text field */ } }
    }
    if (field === 'dice-add') ui.diceDraft = event.target.value;
    if (field === 'stage-note') ui.stageNote = event.target.value;
    if (field === 'cal-title' && ui.calForm) ui.calForm.title = event.target.value;
    if (field === 'cal-time' && ui.calForm) ui.calForm.time = event.target.value;
    if (field === 'cal-kind' && ui.calForm) ui.calForm.kind = event.target.value;
    if (field === 'cal-intensity' && ui.calForm) ui.calForm.intensity = Number(event.target.value) || 2;
    if (field === 'clock-time') clockDraft().time = event.target.value;
    if (field === 'clock-day') clockDraft().day = event.target.value;
    if (field === 'clock-label') clockDraft().label = event.target.value;
    if (field === 'place-id') {
      ui.placeId = event.target.value;
      const place = (lastView?.director?.places ?? []).find(item => item.id === ui.placeId);
      ui.placeDraft = place ? place.name : '';
      rerender();
    }
  };
  // Enter sends from one-line fields; the scene's text is a textarea, Enter there is a new line.
  const ENTER_ACTIONS = { custom: 'dir-custom', scene: 'dir-frame', note: 'dir-note', 'note-edit': 'dir-note-edit-save', 'note-edit-every': 'dir-note-edit-save', 'wx-text': 'dir-wx-apply', 'wx-temp': 'dir-wx-apply', 'dice-add': 'dir-dice-add-save', 'stage-note': 'dir-stage-note', 'clock-time': 'dir-clock-save', 'clock-day': 'dir-clock-save', 'clock-label': 'dir-clock-save', 'cal-title': 'dir-cal-save' };
  const onKey = event => {
    const action = ENTER_ACTIONS[event.target?.dataset?.kuField];
    if (action && event.key === 'Enter' && !event.shiftKey && !event.isComposing) {
      event.preventDefault();
      event.stopPropagation();
      directorAction(action, {});
    }
  };
  // Alt+1…9: the n-th character on stage steps in (again: the kick is taken back).
  const onHotkey = event => {
    if (!event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return;
    const digit = /^Digit([1-9])$/.exec(event.code ?? '')?.[1];
    if (!digit || !lastView?.chips || !lastView.director?.hotkeys) return;
    const kickable = lastView.cast.filter(person => person.present && !person.persona);
    const person = kickable[Number(digit) - 1];
    if (!person) return;
    event.preventDefault();
    event.stopPropagation();
    const armed = (lastView.director.cues ?? []).find(cue => cue.kind === 'enter' && cue.entityId === person.id && !cue.used);
    if (armed) onRemoveCue?.(armed.id);
    else Promise.resolve(onCue?.({ kind: 'enter', entityId: person.id, wait: 0 })).catch(error => console.error('[Kulisy] Hotkey cue failed.', error));
  };
  document.addEventListener('keydown', onHotkey, true);

  function rerender() { if (lastView) renderChips(lastView); }
  extraPaneHooks.rerender = rerender;
  extraPaneHooks.current = () => ui.pane || 'who';
  extraPaneHooks.show = id => { ui.pane = id; ui.selected = ''; if (!lastView?.director?.open) onToggleOpen?.(true); rerender(); };

  function pill(text, title, tab = 'scene') {
    return chipButton(text, 'studio', { tab }, title, 'ku-chips-place');
  }

  // «На сцене» as big faces (the name shows when you point at one) instead of a list of names; set from the view at every draw.
  let castIcons = false;
  function personChip(person, director) {
    const chip = chipButton('', 'dir-select', { entityId: person.id }, '', `ku-chip${person.present ? ' on' : ''}${ui.selected === person.id ? ' selected' : ''}`);
    chip.setAttribute('aria-pressed', String(ui.selected === person.id));
    if (person.portrait) {
      const face = node('img', 'ku-chip-ava');
      face.src = person.portrait;
      face.alt = '';
      face.draggable = false;
      chip.append(face);
    } else if (castIcons) chip.append(node('span', 'ku-chip-initial', (person.name || '?').slice(0, 1).toUpperCase()));
    chip.setAttribute('aria-label', person.name);
    if (!castIcons) chip.append(node('span', 'ku-chip-name', person.name));
    if (person.persona && !castIcons) chip.append(node('span', 'ku-chip-note', 'персона'));
    for (const cue of (director.cues ?? []).filter(item => item.entityId === person.id)) {
      const badge = node('span', `ku-chip-badge${cue.used ? ' used' : ''}`, `${cue.wait ? `⏳${cue.wait}` : ''}${cue.badge}`);
      badge.title = cue.used ? `${cue.label} — действует для свайпов этого ответа` : cue.label;
      chip.append(badge);
    }
    const sleepy = person.present && !person.persona && director.silenceAfter > 0 && person.silent >= director.silenceAfter;
    if (sleepy) {
      chip.classList.add('sleepy');
      chip.append(node('span', 'ku-chip-badge', `💤${person.silent}`));
    }
    chip.title = [
      person.present ? `${person.name}: на сцене` : `${person.name}: не на сцене`,
      sleepy ? `молчит уже ${person.silent} ${person.silent < 5 ? 'хода' : 'ходов'}` : '',
      'нажмите — что сделать',
    ].filter(Boolean).join(' · ');
    return chip;
  }

  function waitRow() {
    const row = node('div', 'ku-dir-row ku-dir-when');
    row.append(node('span', 'ku-dir-caption', 'Когда:'));
    for (const [value, text] of [[0, 'в этом ответе'], [1, 'через 1'], [2, 'через 2'], [3, 'через 3']]) {
      const button = chipButton(text, 'dir-wait', { wait: value }, value ? `Пропустить ${value} ${value === 1 ? 'ответ' : 'ответа'}, потом сработать` : 'В следующем ответе', `ku-dir-seg${ui.wait === value ? ' on' : ''}`);
      row.append(button);
    }
    return row;
  }

  /** Fields whose text may be long: they wrap onto new lines and grow, instead of running sideways. Enter still sends, Shift+Enter breaks the line. */
  const WRAP_FIELDS = new Set(['custom', 'note', 'stage-note', 'dice-add', 'place', 'wx-text', 'scene']);

  function textField(field, value, placeholder) {
    const wrap = WRAP_FIELDS.has(field);
    const input = node(wrap ? 'textarea' : 'input', `text_pole ku-dir-input${wrap ? ' ku-dir-wrap' : ''}`);
    if (wrap) {
      input.rows = 1;
      const fit = () => { if (input.scrollHeight > 0) { input.style.height = 'auto'; input.style.height = `${input.scrollHeight}px`; } };
      input.addEventListener('input', fit);
      globalThis.requestAnimationFrame?.(fit);
    } else input.type = 'text';
    input.dataset.kuField = field;
    input.value = value;
    input.placeholder = placeholder;
    input.maxLength = 400;
    return input;
  }

  function characterMenu(director) {
    let info = null;
    try { info = describe?.(ui.selected) ?? null; } catch (error) { console.error('[Kulisy] Character menu failed.', error); }
    lastMenu = info;
    if (!info) { ui.selected = ''; return null; }
    const card = node('div', 'ku-dir-card');
    const head = node('div', 'ku-dir-card-head');
    head.append(node('b', null, info.name), node('span', 'ku-dir-caption', info.present ? 'на сцене' : 'не на сцене'));
    card.append(head);
    const presentToggle = chipButton(info.present ? '✖ Убрать тихо' : '➕ Отметить тихо', 'present', { entityId: ui.selected, present: info.present },
      info.present ? 'Просто снять с площадки, рассказчику ничего не говорить' : 'Просто отметить на площадке, рассказчику ничего не говорить');
    if (info.persona) {
      card.append(node('p', 'ku-dir-caption', 'Персону не пинают: за неё играешь ты.'), presentToggle);
      return card;
    }
    const row = node('div', 'ku-dir-row');
    if (info.present) {
      row.append(
        chipButton('👟 Вступить', 'dir-cue', { kind: 'enter' }, 'Сам заговорит или что-то сделает'),
        chipButton('💬 Отреагировать…', 'dir-pane', { pane: 'react' }, 'На кого-то из сцены или на последнюю реплику', `ku-dir-btn${ui.pane === 'react' ? ' on' : ''}`),
        chipButton('✍ Своё…', 'dir-pane', { pane: 'custom' }, 'Написать, что ему сделать', `ku-dir-btn${ui.pane === 'custom' ? ' on' : ''}`),
      );
      if (info.lines.length) row.append(chipButton('❤ Двинуть отношения…', 'dir-pane', { pane: 'factor' }, 'Поступок из факторов роста линии', `ku-dir-btn${ui.pane === 'factor' ? ' on' : ''}`));
      if (info.secrets.length) row.append(chipButton('🔒 На грани секрета…', 'dir-pane', { pane: 'secret' }, 'Почти проговорится, но не раскроет', `ku-dir-btn${ui.pane === 'secret' ? ' on' : ''}`));
      const quiet = node('div', 'ku-dir-row');
      quiet.append(
        chipButton('🤐 Молчит', 'dir-cue', { kind: 'hold' }, 'В сцене, но в этом ответе без реплик'),
        chipButton('🎯 Только он', 'dir-cue', { kind: 'focus' }, 'Ответ про него, остальные на фоне'),
        chipButton('🚪 Увести', 'dir-cue', { kind: 'leave' }, 'Уйдёт со сцены с понятной причиной'),
        presentToggle,
      );
      card.append(row, quiet);
    } else {
      row.append(chipButton('🚪 Позвать в сцену', 'dir-cue', { kind: 'call' }, 'Рассказчик введёт его и объяснит, откуда он взялся'), presentToggle);
      card.append(row);
    }
    if (ui.pane === 'react') {
      const targets = node('div', 'ku-dir-row ku-dir-sub');
      targets.append(chipButton('на последнее', 'dir-cue', { kind: 'react', target: 'last' }, 'На то, что только что произошло'));
      for (const target of info.reactTargets) targets.append(chipButton(target.name, 'dir-cue', { kind: 'react', target: target.id }));
      card.append(targets);
    }
    if (ui.pane === 'custom') {
      const sub = node('div', 'ku-dir-sub');
      const line = node('div', 'ku-dir-row ku-dir-field');
      line.append(textField('custom', ui.draft, 'пусть приревнует…'),
        chipButton('👟', 'dir-custom', {}, 'Пнуть с этим текстом (Enter)'),
        chipButton('⭐', 'dir-fav-save', {}, 'Сохранить в избранные'));
      sub.append(line);
      if (director.favorites?.length) {
        const favorites = node('div', 'ku-dir-row');
        for (const text of director.favorites) {
          const item = node('span', 'ku-dir-fav');
          item.append(chipButton(text, 'dir-custom', { text }, 'Пнуть с этим текстом', 'ku-dir-fav-text'), chipButton('×', 'dir-fav-del', { text }, 'Убрать из избранных', 'ku-dir-fav-del'));
          favorites.append(item);
        }
        sub.append(favorites);
      }
      card.append(sub);
    }
    if (ui.pane === 'factor') {
      const sub = node('div', 'ku-dir-sub');
      info.lines.forEach((line, lineIndex) => {
        sub.append(node('div', 'ku-dir-caption', line.side === 'out'
          ? `Его линия к ${line.targetName} — будет открыт к такому моменту:`
          : `Что он может сделать, чтобы сдвинулся ${line.targetName}:`));
        const row2 = node('div', 'ku-dir-row');
        line.factors.forEach((factor, index) => row2.append(chipButton(factor.label, 'dir-cue', { kind: 'factor', line: lineIndex, index }, factor.text)));
        sub.append(row2);
      });
      card.append(sub);
    }
    if (ui.pane === 'secret') {
      const sub = node('div', 'ku-dir-row ku-dir-sub');
      info.secrets.forEach((secret, index) => sub.append(chipButton(`🔒 ${secret.label}`, 'dir-cue', { kind: 'secret', index }, secret.text)));
      card.append(sub);
    }
    card.append(waitRow());
    return card;
  }

  /** «Новый кадр»: what happens next, when, and (if you want) where and who. One form for what were «Сцена» and «Событие». */
  function frameMenu(director) {
    const planning = ui.skip === 'plan';
    const card = node('div', 'ku-dir-card ku-dir-frame');
    card.append(node('div', 'ku-dir-card-head', '🎬 Новый кадр'));
    card.querySelector('.ku-dir-card-head').title = 'Что происходит дальше. Срок, место или состав делают это новой сценой, без них это событие в текущей.';
    const field = node('div', 'ku-dir-row ku-dir-field');
    field.append(textField('scene', ui.sceneDraft, planning ? 'что случится (пусто — рассказчик придумает сам)' : 'утро после драки… в дверь звонят… Зоро чинит катану… (можно пусто: рассказчик придумает сам)'));
    card.append(field);

    // Ideas: ready events (sent at once), or, while planning, the genre of the planned one.
    const ideas = node('div', 'ku-dir-row ku-dir-genres');
    ideas.append(node('span', 'ku-dir-caption', 'Идеи:'));
    if (!planning) ideas.append(chipButton('🎲 Что-нибудь случится', 'dir-cue', { kind: 'event' }, 'Рассказчик сам выберет: звонок, гость, погода, шум, новость'));
    for (const [id, genre] of Object.entries(EVENT_GENRES)) {
      if (planning) {
        const on = ui.planGenre === id;
        const chip = chipButton(`${genre.icon} ${genre.label}`, 'dir-plan-genre', { genre: id }, `Событие в жанре «${genre.label.toLowerCase()}»; ещё раз — снять`, `ku-dir-btn${on ? ' on' : ''}`);
        chip.setAttribute('aria-pressed', String(on));
        ideas.append(chip);
      } else ideas.append(chipButton(`${genre.icon} ${genre.label}`, 'dir-cue', { kind: 'event', genre: id }, `Пусть в сцене случится что-то в жанре «${genre.label.toLowerCase()}»`));
    }
    if (!planning) {
      let fromCalendar = [];
      try { fromCalendar = eventIdeas?.() ?? []; } catch (error) { console.error('[Kulisy] Calendar ideas failed.', error); }
      for (const text of fromCalendar) ideas.append(chipButton(`📅 ${text}`, 'dir-cue', { kind: 'event', text }, 'Из календаря на сегодня'));
    }
    card.append(ideas);

    // When: at once, a jump in the story time, or a plan by the story clock.
    const when = node('div', 'ku-dir-row');
    when.append(node('span', 'ku-dir-caption', 'Когда:'));
    for (const [value, label] of [['none', 'сразу'], ['hour', 'через час'], ['evening', 'вечером'], ['nextday', 'на следующий день'], ['week', 'неделю спустя'], ['plan', 'запланировать…']]) {
      when.append(chipButton(label, 'dir-skip', { skip: value }, value === 'plan' ? 'Кадр придёт, когда время ИСТОРИИ дойдёт до срока' : '', `ku-dir-seg${ui.skip === value ? ' on' : ''}`));
    }
    card.append(when);

    if (planning) {
      const mode = node('div', 'ku-dir-row ku-dir-when');
      mode.append(
        chipButton('Ровно через', 'dir-plan-when', { within: 'false' }, 'В точно назначенный срок', `ku-dir-seg${ui.planWithin ? '' : ' on'}`),
        chipButton('В любой момент в течение', 'dir-plan-when', { within: 'true' }, 'Случайный момент внутри срока: заранее неизвестно, когда', `ku-dir-seg${ui.planWithin ? ' on' : ''}`),
      );
      const span = node('div', 'ku-dir-row ku-dir-planspan');
      const amount = node('input', 'text_pole ku-dir-input ku-dir-every');
      amount.type = 'number';
      amount.min = '1';
      amount.max = '99';
      amount.value = String(ui.planAmount);
      amount.dataset.kuField = 'plan-amount';
      amount.setAttribute('aria-label', 'Сколько');
      const unit = node('select', 'text_pole ku-dir-plan-unit');
      unit.dataset.kuField = 'plan-unit';
      unit.setAttribute('aria-label', 'В чём считать срок');
      for (const id of PLAN_UNIT_IDS) {
        const option = node('option', null, plural(ui.planAmount, PLAN_UNITS[id].forms));
        option.value = id;
        option.selected = id === ui.planUnit;
        unit.append(option);
      }
      span.append(amount, unit);
      card.append(mode, span);
    } else {
      // Where and who are optional: they make the frame a new scene.
      const more = node('details', 'ku-dir-more');
      more.open = Boolean(ui.frameMore);
      more.addEventListener('toggle', () => { ui.frameMore = more.open; });
      more.append(node('summary', null, 'Уточнить: где и кто'));
      const where = node('div', 'ku-dir-row ku-dir-field');
      where.append(node('span', 'ku-dir-caption', 'Где:'));
      if (director.places?.length) {
        const select = node('select', 'text_pole ku-dir-select');
        select.dataset.kuField = 'place-id';
        select.setAttribute('aria-label', 'Место из чата');
        select.append(node('option', null, '— место чата —'));
        select.firstChild.value = '';
        for (const place of director.places) {
          const option = node('option', null, place.name);
          option.value = place.id;
          option.selected = place.id === ui.placeId;
          select.append(option);
        }
        where.append(select);
      }
      where.append(textField('place', ui.placeDraft, 'или словами: камбуз «Санни»'));
      const who = node('div', 'ku-dir-row');
      who.append(node('span', 'ku-dir-caption', 'Кто:'));
      for (const person of director.people ?? []) {
        const on = ui.sceneCast.includes(person.id);
        const chip = chipButton(`${on ? '✓ ' : ''}${person.name}`, 'dir-cast', { entityId: person.id }, on ? 'Убрать из кадра' : 'Будет в кадре', `ku-chip${on ? ' on' : ''}`);
        chip.setAttribute('aria-pressed', String(on));
        who.append(chip);
      }
      who.append(node('span', 'ku-dir-caption', ui.sceneCast.length ? '' : '(не отмечено — решит рассказчик)'));
      more.append(where, who, waitRow());
      card.append(more);
    }

    const go = node('div', 'ku-dir-row');
    if (planning) go.append(chipButton('🗓 Запланировать', 'dir-frame', { now: false }, 'Поставить в план (Enter в поле)', 'ku-dir-btn ku-dir-kick'));
    else go.append(
      chipButton('▶ Сейчас', 'dir-frame', { now: true }, 'Отправить сразу: с текстом из поля ввода, а если оно пустое — рассказчик продолжит сам', 'ku-dir-btn ku-dir-kick'),
      chipButton('С моим постом', 'dir-frame', { now: false }, 'Уйдёт вместе с твоим следующим постом (Enter в поле)'),
    );
    card.append(go);
    if (planning) {
      const hint = !director.planClock ? 'Сначала нужен день истории: задайте его в «Сцене» (время).'
        : ui.planUnit === 'hour' && !director.planHours ? 'Для часов нужно время истории: задайте его в «Сцене».'
          : ui.sceneDraft.trim() ? 'Кадр будет твой: рассказчик подаст его через сюжет.'
            : ui.planGenre ? `Рассказчик придумает событие в жанре «${EVENT_GENRES[ui.planGenre].label.toLowerCase()}».` : 'Событие придумает рассказчик.';
      card.append(node('span', 'ku-dir-caption', hint));
      const plans = director.plans ?? [];
      if (plans.length) {
        card.append(node('span', 'ku-dir-caption ku-dir-gap', `В плане · ${plans.length}`));
        const list = node('div', 'ku-dir-notelist');
        for (const plan of plans) {
          const row = node('div', 'ku-dir-noterow');
          const body = node('div', 'ku-dir-notebody');
          const line = node('div', 'ku-dir-notetext', plan.title);
          line.title = plan.title;
          body.append(line, node('div', 'ku-dir-notemeta', `${plan.when}${plan.left ? ` · ${plan.left}` : ''}`));
          const buttons = node('div', 'ku-dir-notebtns');
          buttons.append(chipButton('✕', 'dir-plan-del', { id: plan.id }, 'Убрать из плана', 'ku-dir-btn ku-dir-mini'));
          row.append(node('span', 'ku-dir-plan-ico', plan.within ? '🎲' : '🗓'), body, buttons);
          list.append(row);
        }
        card.append(list);
      }
    }
    return card;
  }

  function noteMenu(director) {
    const card = node('div', 'ku-dir-card ku-dir-notes');
    const head = node('div', 'ku-dir-card-head', '📝 Рассказчику');
    head.title = 'Указание модели. 📝 уйдёт один раз; 📌 закрепит в этом чате (идёт с каждым ответом, а с кд раз в N ответов); 🌐 закрепит во всех чатах; 💾 только сохранит в «Мои указания».';
    card.append(head);
    const field = node('div', 'ku-dir-row ku-dir-field');
    field.append(textField('note', ui.noteDraft, 'что сказать рассказчику…'));
    const actions = node('div', 'ku-dir-row ku-dir-noteacts');
    actions.append(
      chipButton('📝 раз', 'dir-note', {}, 'Отправить один раз (Enter)'),
      chipButton('📌 чат', 'dir-note-pin', {}, 'Закрепить в этом чате: идёт с ответами, пока не открепите'),
      chipButton('🌐 все', 'dir-note-pin-all', {}, 'Закрепить во всех чатах'),
      chipButton('💾', 'dir-note-save', {}, 'Только сохранить в «Мои указания» (в чат не отправляется)'));
    const timing = node('div', 'ku-dir-row ku-dir-notetiming');
    const every = node('input', 'text_pole ku-dir-input ku-dir-every');
    every.type = 'number';
    every.min = '0';
    every.max = '99';
    every.value = String(ui.noteEvery);
    every.dataset.kuField = 'note-every';
    every.title = 'Кулдаун: раз в сколько ответов указание может уйти. 0 — без кулдауна (закреплённое идёт с каждым ответом)';
    timing.append(node('span', 'ku-dir-caption', 'кд'), every);
    for (const [value, text] of [[0, 'сейчас'], [1, '+1'], [2, '+2'], [3, '+3']]) {
      timing.append(chipButton(text, 'dir-wait', { wait: value }, value ? `Для разовой отправки: пропустить ${value} ${value === 1 ? 'ответ' : 'ответа'}, потом сработать` : 'Разовое: в следующем ответе', `ku-dir-btn ku-dir-mini${ui.wait === value ? ' on' : ''}`));
    }
    card.append(field, actions, timing);

    const notes = director.notes ?? { library: [], pins: [] };
    const everyText = value => (value > 0 ? `раз в ${value}` : 'каждый');
    const section = (which, title, count, rows) => {
      const open = noteIsOpen(ui, which);
      const header = chipButton(`${open ? '▾' : '▸'} ${title} · ${count}`, 'dir-note-fold', { which }, open ? 'Свернуть' : 'Развернуть', 'ku-dir-btn ku-dir-fold');
      card.append(header);
      if (open) {
        const list = node('div', 'ku-dir-notelist');
        if (!count) list.append(node('div', 'ku-dir-caption', which === 'lib' ? 'Пока пусто: впишите указание и нажмите 💾.' : 'Ничего не закреплено.'));
        list.append(...rows);
        card.append(list);
      }
    };
    const rowOf = (lead, text, meta, buttons, scope = '', id = '', every = 0) => {
      // The row being edited turns into a small form: a text, a cooldown, «save» and «cancel». The save changes the note in place.
      if (ui.noteEdit && ui.noteEdit.scope === scope && ui.noteEdit.id === id && id) {
        const form = node('div', 'ku-dir-noteedit');
        const area = node('textarea', 'text_pole ku-dir-input ku-dir-noteedit-text');
        area.dataset.kuField = 'note-edit';
        area.value = ui.noteEdit.text;
        area.rows = 3;
        area.maxLength = 400;
        const foot = node('div', 'ku-dir-row');
        const cooldown = node('input', 'text_pole ku-dir-input ku-dir-every');
        cooldown.type = 'number';
        cooldown.min = '0';
        cooldown.max = '99';
        cooldown.value = String(ui.noteEdit.every);
        cooldown.dataset.kuField = 'note-edit-every';
        cooldown.title = 'Кулдаун: раз в сколько ответов указание может уйти. 0 — без кулдауна';
        foot.append(node('span', 'ku-dir-caption', 'кд'), cooldown,
          chipButton('✓ Сохранить', 'dir-note-edit-save', {}, 'Сохранить правку (Enter)', 'ku-dir-btn ku-dir-kick'),
          chipButton('Отмена', 'dir-note-edit-cancel', {}, 'Не менять', 'ku-dir-btn'));
        form.append(area, foot);
        return form;
      }
      const row = node('div', 'ku-dir-noterow');
      const body = node('div', 'ku-dir-notebody');
      const line = node('div', 'ku-dir-notetext', text);
      line.title = text;
      body.append(line, node('div', 'ku-dir-notemeta', meta));
      row.append(...(lead ? [lead] : []), body, node('div', 'ku-dir-notebtns'));
      row.lastChild.append(...buttons);
      return row;
    };
    const mini = (text, action, data, title) => chipButton(text, action, data, title, 'ku-dir-btn ku-dir-mini');
    section('pins', '📌 Закреплено', notes.pins.length, notes.pins.map(pin => rowOf(null, pin.text,
      `${pin.scope === 'all' ? '🌐 все чаты' : 'этот чат'} · ${everyText(pin.every)} · ${pin.left > 0 ? `через ${pin.left}` : 'со следующим ответом'}`,
      [mini('✎', 'dir-note-edit', { scope: pin.scope, id: pin.id, text: pin.text, every: pin.every }, 'Поправить здесь же: правка сохранится в этом закреплении'),
        mini('✕', pin.scope === 'all' ? 'dir-note-unpin-all' : 'dir-note-unpin', { id: pin.id }, pin.scope === 'all' ? 'Открепить от всех чатов' : 'Открепить в этом чате')], pin.scope, pin.id, pin.every)));
    section('lib', '💾 Мои указания', notes.library.length, notes.library.map(item => {
      const cooling = item.left > 0;
      const send = mini(cooling ? `⏳${item.left}` : '▶', 'dir-note-send', { id: item.id }, cooling ? `Остывает: ещё ${item.left} отв.` : 'Отправить сейчас (со следующим ответом)');
      send.disabled = cooling;
      return rowOf(send, item.text, item.every > 0 ? `кд ${item.every}` : 'без кд',
        [mini('📌', 'dir-note-pin-saved', { id: item.id }, 'Закрепить в этом чате'),
          mini('🌐', 'dir-note-pin-all-saved', { id: item.id }, 'Закрепить во всех чатах'),
          mini('✎', 'dir-note-edit', { scope: 'lib', id: item.id, text: item.text, every: item.every }, 'Поправить здесь же: правка сохранится в этом указании'),
          mini('✕', 'dir-note-del', { id: item.id }, 'Удалить из сохранённых')], 'lib', item.id, item.every);
    }));
    return card;
  }

  function othersMenu(director) {
    const card = node('div', 'ku-dir-card');
    card.append(node('div', 'ku-dir-card-head', 'Кого позвать'));
    const row = node('div', 'ku-dir-row');
    if (!director.others?.length) row.append(node('span', 'ku-dir-caption', 'Все известные персонажи уже здесь.'));
    for (const person of director.others ?? []) row.append(chipButton(person.name, 'dir-select', { entityId: person.id }, 'Выбрать'));
    card.append(row);
    return card;
  }

  /** The dice window's content: the ladder of the scene, the roll, the groups with their chips. */
  function diceCard(view) {
    const dice = view.dice ?? { groups: [], picks: [], locked: [], sent: false };
    const card = node('div', 'ku-dir-card ku-dir-dice');
    const ladderCol = node('div', 'ku-dice-ladder');
    const rollCol = node('div', 'ku-dice-rollcol');
    const foot = node('div', 'ku-dice-foot');
      // The ladder: where the scene stands. The narrator writes only that stage (core/intimacy-stage.js).
    if (dice.stage) {
      const stage = dice.stage;
      const ladder = node('div', 'ku-dir-row ku-stage-row');
      ladder.append(node('span', 'ku-dir-caption ku-dice-label', 'Стадия'));
      const chips = node('span', 'ku-dice-chips');
      for (const item of stage.stages) {
        const on = item.id === stage.id;
        const chip = chipButton(`${item.icon} ${item.label}`, 'dir-stage', { stage: item.id }, item.hint, `ku-dir-btn ku-stage-chip${on ? ' on' : ''}`);
        chip.setAttribute('aria-pressed', String(on));
        chips.append(chip);
      }
      ladder.append(chips);
      ladderCol.append(ladder);
      const moves = node('div', 'ku-dir-row');
      moves.append(
        chipButton('◂ Назад', 'dir-stage-step', { delta: -1 }, 'Стадия назад', 'ku-dir-btn'),
        chipButton('Дальше ▸', 'dir-stage-step', { delta: 1 }, 'Следующая стадия: рассказчик подводит к ней', 'ku-dir-btn ku-dir-kick'),
      );
      if (stage.id) {
        const hold = chipButton(stage.lock ? '🔒 Держу' : '🔓 Держать', 'dir-stage-lock', {}, stage.lock ? 'Летописец стадию не предлагает: нажми, чтобы отдать ему' : 'Не давать летописцу предлагать стадию', `ku-dir-btn${stage.lock ? ' on' : ''}`);
        hold.setAttribute('aria-pressed', String(Boolean(stage.lock)));
        moves.append(hold, chipButton('Сцена закончена', 'dir-stage-clear', {}, 'Снять лесенку: рассказчик пишет сцену как раньше'));
      }
      ladderCol.append(moves);
      const hint = node('span', 'ku-dir-caption ku-dice-hint', stage.id ? `Рассказчик получает: ${stage.ru || stage.hint}` : 'Лесенка не запущена: сцена пишется как обычно. Выбери стадию или нажми «Дальше ▸».');
      if (stage.id) hint.title = 'Один шаг за ответ. Летописец сам предложит следующую стадию плашкой под ответом, а ты можешь нажать «Дальше».';
      rollCol.append(hint);
    if (stage.id) {
      // The user's own line for the scene: it goes to the narrator with the stage until it is changed or emptied.
      const note = node('div', 'ku-dir-row ku-dir-field');
      note.append(textField('stage-note', ui.stageNote ?? stage.note ?? '', 'заметка к сцене, например: пусть он замирает, когда она касается шеи'), chipButton('Записать', 'dir-stage-note', {}, 'Заметка уйдёт рассказчику со стадией (Enter). Пустая снимает её'));
      rollCol.append(note);
    }
    }
    const top = node('div', 'ku-dir-row');
    top.append(
      chipButton(dice.picks.length ? '🎲 Перебросить' : '🎲 Бросить', 'dir-dice-roll', {}, 'Бросить заново всё, кроме закреплённого замком', 'ku-dir-btn ku-dir-kick'),
      chipButton(dice.sent ? '✓ Отправлено' : '▶ Отправить', 'dir-dice-send', {}, 'Поставить выбранное направлением на следующий ответ', `ku-dir-btn${dice.sent ? ' on' : ''}`),
      chipButton('Сбросить', 'dir-dice-clear', {}, 'Убрать выбранное и снять направление'),
    );
    // «Начало» has its own button unless the dice roll it by the stage.
    if (dice.rollMode !== 'stage' && dice.groups.some(group => group.id === 'start')) top.prepend(chipButton('✨ Начало', 'dir-dice-roll', { group: 'start' }, 'Бросить только «Начало»: как всё начинается', 'ku-dir-btn'));
    foot.append(top);
    // Picks from a later stage wait here: «сейчас» lets one through at once.
    const held = dice.picks.filter(pick => pick.ahead);
    if (held.length) {
      const waiting = node('div', 'ku-dir-row ku-dice-held');
      waiting.append(node('span', 'ku-dir-caption ku-dice-label', '⏳ В запасе'));
      const chips = node('span', 'ku-dice-chips');
      for (const pick of held) chips.append(chipButton(`${pick.text} · сейчас`, 'dir-dice-release', { group: pick.group, option: pick.id }, 'Это дальше текущей стадии, рассказчик только подводит к нему. Нажми, чтобы он писал это уже сейчас', 'ku-dir-btn'));
      waiting.append(chips);
      rollCol.append(waiting);
    }
    const burning = new Set(dice.picks.map(pick => `${pick.group}:${pick.id}`));
    const aheadKeys = new Set(dice.picks.filter(pick => pick.ahead).map(pick => `${pick.group}:${pick.id}`));
    for (const group of dice.groups) {
      const row = node('div', 'ku-dir-row ku-dir-dice-row');
      const locked = dice.locked.includes(group.id);
      row.append(node('span', 'ku-dir-caption ku-dice-label', `${group.icon} ${group.label}`));
      const chips = node('span', 'ku-dice-chips');
      for (const option of group.options) {
        const on = burning.has(`${group.id}:${option.id}`);
        const chip = chipButton(option.text, 'dir-dice-pick', { group: group.id, option: option.id }, aheadKeys.has(`${group.id}:${option.id}`) ? 'Впереди текущей стадии: в запасе, пока сцена не дойдёт' : group.multi ? 'Можно выбрать несколько' : 'Выбрать (ещё раз: снять)', `ku-dir-btn ku-dice-chip${on ? ' on' : ''}${on && aheadKeys.has(`${group.id}:${option.id}`) ? ' ahead' : ''}`);
        chip.setAttribute('aria-pressed', String(on));
        chips.append(chip);
      }
      chips.append(chipButton('+', 'dir-dice-add-open', { group: group.id }, 'Добавить свой вариант', `ku-dir-btn ku-dir-add${ui.diceAdd === group.id ? ' on' : ''}`));
      row.append(chips,
        chipButton(locked ? '🔒' : '🔓', 'dir-dice-lock', { group: group.id }, locked ? 'Закреплено: бросок это не меняет' : 'Закрепить: бросок это не меняет', `ku-dir-btn${locked ? ' on' : ''}`),
        chipButton('↻', 'dir-dice-roll', { group: group.id }, 'Бросить заново только эту группу'));
      rollCol.append(row);
      if (ui.diceAdd === group.id) {
        const add = node('div', 'ku-dir-row ku-dir-field');
        add.append(textField('dice-add', ui.diceDraft, 'свой вариант: например, «под дождём»'), chipButton('Добавить', 'dir-dice-add-save', {}, 'Добавить в группу и выбрать (Enter)'));
        rollCol.append(add);
      }
    }
    rollCol.append(node('span', 'ku-dir-caption ku-dice-hint', dice.sent ? 'Выбранное ушло и действует на следующий ответ.' : 'Выбери или брось. «Отправить» поставит выбранное на следующий ответ.'));
    const cols = node('div', `ku-dice-cols${dice.stage ? ' with-ladder' : ''}`);
    cols.append(...(dice.stage ? [ladderCol] : []), rollCol);
    card.append(cols, foot);
    return card;
  }

  /**
   * «Что уходит модели»: what goes out with the next post, what went with the last request, which library entries went.
   * It lives in a tile of the panel (the strip above the message box is too small a target for it).
   */
  function sentDetails(view) {
    const director = view.director ?? {};
    // What goes out with the next post.
    const out = [];
    const stage = view.dice?.stage;
    if (stage?.id) out.push(`${stage.label}: ${stage.ru || stage.hint}${stage.note ? ` · заметка: ${stage.note}` : ''}`);
    const picks = view.dice?.picks ?? [];
    // Sent, it already stands among the queued directions above; only a roll that has not gone out is listed here.
    if (picks.length && !view.dice?.sent) {
      const text = picks.map(pick => pick.text).join(' · ');
      out.push(`🎲 ${text.length > 90 ? `${text.slice(0, 89)}…` : text}${view.dice.sent ? '' : ' (не отправлен)'}`);
    }
    const sendLine = node('span', 'ku-ss-out');
    sendLine.append(node('b', null, 'Уйдёт модели: '));
    if (out.length) for (const text of out) sendLine.append(node('span', 'ku-ss-tag', text));
    else if (!(director.cues ?? []).length) sendLine.append(node('span', 'ku-ss-none', 'ничего заготовленного'));
    const details = [sendLine];
    // What really went with the last request (read back from the prompt when it was built).
    if (view.lastSent) {
      const last = view.lastSent;
      const sent = [];
      if (last.stage) sent.push(`стадия «${last.stage.label}»${last.stage.note ? `, заметка «${last.stage.note}»` : ''}`);
      sent.push(...last.cues);
      const line = node('span', 'ku-ss-last');
      line.append(node('b', null, 'В последний запрос ушло: '), node('span', sent.length ? 'ku-ss-tag' : 'ku-ss-none', sent.length ? sent.join(' · ') : 'ничего от Закулисья, кроме обычной сцены'));
      details.push(line);
      // Library entries: the sections of the character cards and the place, so that «was it used» is seen, not guessed.
      const lib = node('span', 'ku-ss-last ku-ss-lib');
      lib.append(node('b', null, 'Из библиотеки ушло: '));
      let any = false;
      for (const card of last.cards ?? []) {
        const tag = node('span', card.sent.length ? 'ku-ss-tag' : 'ku-ss-none', card.sent.length ? `📇 ${card.name}: ${card.sent.join(', ')}` : `📇 ${card.name}: ничего`);
        if (card.held.length) tag.setAttribute('title', `Не ушло: ${card.held.map(item => `${item.title}${item.why ? ` (${item.why})` : ''}`).join('; ')}`);
        lib.append(tag);
        any = true;
      }
      if (last.cardsLimit) {
        const lost = (last.cardsLimit.parts ?? []).map(part => `${part.name}: ${part.title} (${part.size} зн.)`).join('; ');
        const tag = node('span', 'ku-ss-tag', `⚠ карточки упёрлись в лимит: занято ${last.cardsLimit.used} из ${last.cardsLimit.limit} зн.${lost ? `, не влезло: ${lost}` : `, не всё ушло у ${last.cardsLimit.names.join(', ')}`}. Лимит: Настройки → Знания и сцена → Карточки`);
        tag.setAttribute('title', 'Поднять можно в «Настройки → Знания и сцена → Карточки → Объём карточек» (до 60000)');
        lib.append(tag);
        any = true;
      }
      if (last.cardsOff) { lib.append(node('span', 'ku-ss-none', '📇 карточки выключены в настройках')); any = true; }
      for (const miss of last.noCard ?? []) {
        const tag = node('span', 'ku-ss-none', miss.inLibrary ? `📇 ${miss.name}: карточка есть, но не подключена к нему` : `📇 ${miss.name}: карточки нет`);
        tag.setAttribute('title', miss.inLibrary ? 'Мир → Карточки: включите переключатель на карточке, и она привяжется к этому персонажу чата' : 'В библиотеке нет карточки с таким именем или прозвищем');
        lib.append(tag);
        any = true;
      }
      if (last.place) { lib.append(node('span', 'ku-ss-tag', `📍 ${last.place.name || 'место'}${last.place.parts.length ? `: ${last.place.parts.join(', ')}` : ': только название'}`)); any = true; }
      for (const thing of last.things ?? []) { lib.append(node('span', 'ku-ss-tag', `👗 ${thing}`)); any = true; }
      if (!any) lib.append(node('span', 'ku-ss-none', 'ни одной карточки или локации'));
      details.push(lib);
    }
    if (view.build) details.push(node('span', 'ku-ss-ver', `Закулисье ${view.build}`));
    return details;
  }

  /** The strip above the message box is gone: everything it said (time, place, who is here) lives in the drawer. Old copies are taken off. */
  function renderStrip() {
    document.getElementById(STRIP_ID)?.remove();
  }

  /** The drawer: a slim bar when closed; opened, it stays until its arrow is clicked. */
  function renderChips(view) {
    let bar = document.getElementById(CHIPS_ID);
    const show = view.chips && view.chatId !== '' && (view.cast.length || view.director?.others?.length);
    if (!show) {
      bar?.remove();
      document.documentElement.style.removeProperty('--ku-rail-left');
      document.documentElement.style.removeProperty('--ku-rail-right');
      return;
    }
    if (!bar) {
      bar = node('div', 'ku-director ku-side');
      bar.id = CHIPS_ID;
      bar.setAttribute('role', 'region');
      bar.setAttribute('aria-label', 'Сцена и режиссура');
      const panel = node('div', 'ku-panel');
      const headElement = node('div', 'ku-dir-head');
      const body = node('div', 'ku-dir-body');
      body.append(node('div', 'ku-dir-inner'));
      panel.append(headElement, body);
      // One column of tabs beside the panel (all the tiles, in groups); under the tiles the little buttons of Закулисье (the sound, «пнуть») live in .pud-sidebar.
      const column = node('div', 'ku-rail2');
      column.append(node('div', 'ku-rail'), node('div', 'pud-sidebar'));
      bar.append(column, panel);
      bar.addEventListener('input', onInput);
      bar.addEventListener('keydown', onKey);
      document.body.append(bar);
    }
    const director = { cues: [], others: [], favorites: [], silenceAfter: 0, ...(view.director ?? {}) };
    const open = Boolean(director.open);
    bar.classList.toggle('open', open);
    // The side of the rail; the docked panels of the Studio keep clear of it (they read these two lengths).
    const right = view.railSide === 'right';
    castIcons = view.castLook === 'icons';
    bar.classList.toggle('ku-side-right', right);
    document.documentElement.style.setProperty('--ku-rail-left', right ? '0px' : '78px');
    document.documentElement.style.setProperty('--ku-rail-right', right ? '78px' : '0px');
    const focused = document.activeElement?.dataset?.kuField ?? '';
    const caret = focused ? document.activeElement.selectionStart : null;

    const headElement = bar.querySelector('.ku-dir-head');
    const places = [
      ...(view.time ? [pill(view.time, 'Время сцены — открыть пульт')] : []),
      ...(view.location ? [pill(`📍 ${view.location}`, 'Место сцены — открыть пульт')] : []),
      ...(view.weather?.badge ? [pill(view.weather.badge, 'Погода — открыть страницу «Погода»', 'weather')] : []),
      ...(view.sceneMode && view.sceneMode !== 'calm' ? [pill(`${MODE_MARK[view.sceneMode] ?? ''} ${MODE_LABEL[view.sceneMode] ?? view.sceneMode}`, 'Тип сцены: от него зависит, какие разделы анкет уходят модели')] : []),
      ...(view.secrets ? [pill(`🔒 ${view.secrets}${view.waitingReveals ? ` · ждут ${view.waitingReveals}` : ''}`, 'Секреты — кто что знает', 'secrets')] : []),
    ];
    const cast = [...view.cast].sort((left, right) => Number(right.present) - Number(left.present));
    const inner = bar.querySelector('.ku-dir-inner');
    const stage = node('div', `ku-dir-row ku-dir-cast${castIcons ? ' icons' : ''}`);
    stage.append(node('span', 'ku-dir-caption', 'На сцене:'));
    const here = cast.filter(item => item.present);
    if (!here.length) stage.append(node('span', 'ku-dir-caption', 'никого'));
    for (const person of here) stage.append(personChip(person, director));
    const nearby = cast.filter(item => !item.present);
    if (nearby.length) {
      stage.append(node('span', 'ku-dir-caption ku-dir-gap', 'Рядом:'));
      for (const person of nearby) stage.append(personChip(person, director));
    }
    stage.append(chipButton(castIcons ? '☰' : '▦', 'dir-castlook', {}, castIcons ? 'Показывать героев на сцене списком с именами' : 'Показывать героев на сцене одними иконками (имя видно, если навести)', 'ku-dir-btn ku-dir-castlook'));
    stage.append(chipButton('+ Позвать', 'dir-pane', { pane: 'others' }, 'Позвать того, кого сейчас нет', `ku-dir-btn ku-dir-add${ui.pane === 'others' ? ' on' : ''}`));
    const LEGACY_PANE = { time: 'who', mode: 'who', heat: 'who', dice: 'who', weather: 'calendar', event: 'scene' };
    const hiddenTiles = new Set(view.drawerHidden ?? []);
    const wanted = LEGACY_PANE[ui.pane] ?? (ui.pane || 'who');
    // a switched-off page is not shown, even when it was the open one
    const pane = hiddenTiles.has(TILE_OF_PANE[wanted] ?? wanted) ? 'who' : wanted;
    const mode = view.sceneMode || 'calm';
    const kindInfo = view.weather ? WEATHER_KINDS[view.weather.kind] : null;
    const tile = (icon, name, value, action, data, { on = false, kick = false, title = '' } = {}) => {
      const button = chipButton('', action, data, title, `ku-tile${on ? ' on' : ''}${kick ? ' kick' : ''}`);
      button.append(node('span', 'ku-tile-ico', icon), node('span', 'ku-tile-name', name), node('span', 'ku-tile-val', value));
      if (action === 'dir-pane') button.setAttribute('aria-pressed', String(on));
      return button;
    };
    // Secrets: a thin strip that opens their page (time and place are in «Сцена»; the «Место» button is gone).
    const strip = (icon, value, action, data, { on = false, title = '' } = {}) => {
      const button = chipButton('', action, data, title, `ku-strip${on ? ' on' : ''}`);
      button.append(node('span', 'ku-strip-ico', icon), node('span', 'ku-strip-val', value));
      if (action === 'dir-pane') button.setAttribute('aria-pressed', String(on));
      return button;
    };
    const stack = node('div', 'ku-tile-stack');
    stack.append(
      ...(view.secrets ? [strip('🔒', `${view.secrets}${view.waitingReveals ? ` · ждут ${view.waitingReveals}` : ''}`, 'studio', { tab: 'secrets' }, { title: 'Секреты: кто что знает' })] : []),
    );
    // The tiles that hold tabs: one button for several pages (the pages that exist now), it opens the tab used last.
    const setupProgressText = () => (view.setup && view.setup.total ? `${view.setup.done}/${view.setup.total}` : '');
    const hasPage = id => id === 'note' || extraPanes.has(id);
    const groupOf = id => PANE_GROUPS.find(group => id in group.members);
    const groupedIds = new Set(PANE_GROUPS.flatMap(group => Object.keys(group.members)));
    const groupTiles = () => PANE_GROUPS.flatMap(group => {
      const ids = Object.keys(group.members).filter(hasPage);
      if (!ids.length) return [];
      const current = ids.includes(pane) ? pane : (ids.includes(ui.groupTab?.[group.id]) ? ui.groupTab[group.id] : ids[0]);
      const button = tile(group.icon, group.name, '', 'dir-pane', { pane: current }, { on: ids.includes(pane), title: group.title });
      button.dataset.members = ids.join(' ');
      return [button];
    });
    const grid = node('div', 'ku-dir-grid');
    grid.append(
      tile('👥', 'Сцена', here.length ? `${here.length} на сцене` : 'никого', 'dir-pane', { pane: 'who' }, { on: pane === 'who' || Boolean(ui.selected), title: 'Сцена: кто на месте, время, тип сцены и накал' }),
      tile('🎬', 'Новый кадр', 'дальше', 'dir-pane', { pane: 'scene' }, { on: pane === 'scene', title: 'Что происходит дальше: новая сцена или событие, сразу или по плану' }),
      ...(view.secrets ? [stack] : []),
      tile(kindInfo ? kindInfo.icon : '📅', 'Календарь / погода', kindInfo ? `${view.weather.temp != null ? `${view.weather.temp}° ` : ''}${kindInfo.label.toLowerCase()}` : (view.calendar?.next?.[0] ? view.calendar.next[0].when : (view.calendar ? 'пусто' : 'не задан')), 'dir-pane', { pane: 'calendar' }, { on: pane === 'calendar', title: 'Календарь, ближайшие события и погода' }),
      tile('📤', 'Что уходит', 'модели', 'dir-pane', { pane: 'sent' }, { on: pane === 'sent', title: 'Что уйдёт модели с твоим следующим постом, что ушло в последний запрос и какие карточки из библиотеки' }),
      tile('🧭', 'Квесты', view.quests?.length ? `${view.quests.length} идут` : 'нет', 'dir-pane', { pane: 'quests' }, { on: pane === 'quests', title: 'Квесты: отметить шаг, ввести его в сюжет' }),
      tile('🎵', 'Медиа', view.songs?.playing?.length ? `▶ ${view.songs.playing.length}` : view.songs?.found?.some(item => !item.muted) ? 'слышно' : 'тихо', 'dir-pane', { pane: 'songs' }, { on: pane === 'songs', title: 'Песни: что звучит, кто поёт, какая узнана в постах' }),
      ...groupTiles(),
      ...[...extraPanes.values()].filter(item => !groupedIds.has(item.id)).map(item => tile(item.icon, item.name, '', 'dir-pane', { pane: item.id }, { on: pane === item.id, title: item.title })),
      tile('📋', 'Настройка', setupProgressText(), 'dir-pane', { pane: 'setup' }, { on: pane === 'setup', title: 'Настройка чата: что уже сделано и что осталось' }),
      tile('▶', 'Пнуть', 'сейчас', 'dir-kick', {}, { kick: true, title: director.canKick ? 'Отправить: с твоим текстом из поля, а если оно пустое — без поста' : 'Сейчас идёт генерация' }),
    );
    const modeCard = () => {
      const card = node('div', 'ku-dir-card ku-dir-mode');
      card.append(node('span', 'ku-dir-caption', 'Тип сцены:'));
      const row = node('div', 'ku-dir-row');
      for (const [id, label] of Object.entries(MODE_LABEL)) {
        const on = mode === id;
        const button = chipButton(`${MODE_MARK[id]} ${label}`, 'dir-mode', { mode: id }, MODE_HINT[id], `ku-dir-btn${on ? ' on' : ''}`);
        button.setAttribute('aria-pressed', String(on));
        row.append(button);
      }
      card.append(row, node('span', 'ku-dir-caption', MODE_HINT[mode]));
      return card;
    };
    const heatCard = () => {
      const heat = view.heat ?? { value: 0, label: 'спокойно', lock: false, why: '' };
      const card = node('div', 'ku-dir-card ku-dir-heat');
      card.append(node('div', 'ku-dir-card-head', `🔥 Накал сцены: ${heat.value} · ${heat.label}`));
      const bar = node('div', 'ku-heat-bar');
      bar.setAttribute('role', 'img');
      bar.setAttribute('aria-label', `Накал ${heat.value} из 100`);
      const fill = node('div', 'ku-heat-fill');
      fill.style.width = `${Math.max(0, Math.min(100, heat.value))}%`;
      bar.append(fill);
      card.append(bar);
      if (heat.why) card.append(node('span', 'ku-dir-caption', heat.why));
      const row = node('div', 'ku-dir-row');
      for (const delta of [-10, -5, 5, 10]) row.append(chipButton(`${delta > 0 ? '+' : '−'}${Math.abs(delta)}`, 'dir-heat', { delta }, 'Поправить накал', 'ku-dir-btn'));
      for (const value of [0, 30, 60, 90]) row.append(chipButton(String(value), 'dir-heat', { value }, `Поставить ${value}`, 'ku-dir-btn'));
      card.append(row);
      const foot = node('div', 'ku-dir-row');
      const lock = chipButton(heat.lock ? '🔒 Держу' : '🔓 Держать', 'dir-heat-lock', {}, heat.lock ? 'Летописец накал не трогает: нажмите, чтобы отдать ему' : 'Не давать летописцу менять накал', `ku-dir-btn${heat.lock ? ' on' : ''}`);
      lock.setAttribute('aria-pressed', String(Boolean(heat.lock)));
      foot.append(lock, chipButton('Сбросить', 'dir-heat-clear', {}, 'Убрать накал и вернуть его летописцу'));
      card.append(foot, node('span', 'ku-dir-caption', 'Летописец сам оценивает накал после каждого ответа и снижает его только по причине в сюжете.'));
      return card;
    };
    const questsCard = () => {
      const card = node('div', 'ku-dir-card ku-dir-quests');
      card.append(node('div', 'ku-dir-card-head', '🧭 Квесты'));
      if (!view.quests?.length) card.append(node('span', 'ku-dir-caption', 'Сейчас ничего не идёт. Квесты добавляются на странице «Мир → Квесты».'));
      for (const quest of view.quests ?? []) {
        const row = node('div', 'ku-dir-quest');
        const title = node('div', 'ku-dir-quest-title');
        title.append(node('b', null, `${quest.secret ? '🔒 ' : ''}${quest.name}`), node('span', 'ku-dir-caption', [quest.progress, quest.due].filter(Boolean).join(' · ')));
        row.append(title);
        if (quest.step) row.append(node('span', 'ku-dir-quest-step', quest.step));
        const buttons = node('div', 'ku-dir-row');
        if (quest.stepId) buttons.append(chipButton('☑ Шаг выполнен', 'dir-quest-step', { questId: quest.id, stepId: quest.stepId }, 'Отметить текущий шаг сделанным', 'ku-dir-btn'));
        buttons.append(
          chipButton('▶ Ввести сейчас', 'dir-quest-push', { questId: quest.id }, 'Следующий ответ подаст этот шаг через сюжет', `ku-dir-btn${quest.pushed ? ' on' : ''}`),
          chipButton('Открыть', 'studio', { tab: 'quests' }, 'Страница квестов: закрыть, править, награда'),
        );
        row.append(buttons);
        card.append(row);
      }
      return card;
    };
    /** The calendar at a glance: a small month, the next events; the big window is for editing. */
    const calendarCard = () => {
      const card = node('div', 'ku-dir-card ku-dir-calendar');
      card.append(node('div', 'ku-dir-card-head', '📅 Календарь'));
      const data = view.calendar;
      if (!data) {
        card.append(node('span', 'ku-dir-caption', 'Дата истории не задана: поставьте её в окне «Календарь».'), chipButton('Открыть календарь', 'studio', { tab: 'calendar' }, 'Окно календаря', 'ku-dir-btn'));
        return card;
      }
      card.append(node('span', 'ku-dir-caption', `${data.month.title}${data.today ? ` · сегодня ${data.today}` : ''}`));
      const grid = node('div', 'ku-cal-mini');
      grid.style.gridTemplateColumns = `repeat(${data.month.weekdays.length}, minmax(0, 1fr))`;
      for (const label of data.month.weekdays) grid.append(node('span', 'ku-cal-mini-head', label));
      for (const cell of data.month.cells) {
        if (!cell.iso) { grid.append(node('span', 'ku-cal-mini-cell other', '')); continue; }
        const item = chipButton(String(cell.day), 'dir-cal-day', { iso: cell.iso }, cell.count ? `Событий: ${cell.count}` : 'Открыть день', `ku-cal-mini-cell${cell.other ? ' other' : ''}${cell.today ? ' today' : ''}${cell.count ? ' has' : ''}${ui.calDay === cell.iso ? ' on' : ''}`);
        grid.append(item);
      }
      card.append(grid);
      if (ui.calDay) {
        const day = node('div', 'ku-cal-day');
        day.append(node('b', null, ui.calDay.split('-').reverse().join('.')));
        const events = data.month.days?.[ui.calDay] ?? [];
        if (!events.length) day.append(node('span', 'ku-dir-caption', ' ничего не записано'));
        for (const event of events) {
          const row = node('div', 'ku-dir-row');
          row.append(node('span', null, `${event.time ? `${event.time} ` : ''}${event.title}`), node('span', 'ku-dir-caption', event.kind ? ` · ${KIND_LABELS[event.kind] ?? ''}` : ''));
          if (event.fromQuest) row.append(chipButton('К квестам', 'studio', { tab: 'quests' }, 'Срок записан у квеста', 'ku-dir-btn'));
          else row.append(chipButton('✎', 'dir-cal-edit', { id: event.id }, 'Изменить', 'ku-dir-btn'), chipButton('×', 'dir-cal-del', { id: event.id }, 'Удалить событие', 'ku-dir-btn'));
          day.append(row);
        }
        const form = ui.calForm;
        if (form) {
          const field = (name, value, placeholder, type = 'text') => { const input = node('input', 'text_pole ku-dir-input'); input.type = type; input.value = value ?? ''; input.placeholder = placeholder; input.dataset.kuField = name; return input; };
          const select = (name, options, value) => { const box = node('select', 'text_pole'); box.dataset.kuField = name; for (const [key, label] of options) { const option = node('option', null, label); option.value = String(key); option.selected = String(key) === String(value); box.append(option); } return box; };
          const row = node('div', 'ku-dir-row');
          row.append(
            field('cal-title', form.title, 'Что случится'), field('cal-time', form.time, 'время', 'time'),
            select('cal-kind', [['', 'Обычное'], ...Object.entries(KIND_LABELS)], form.kind ?? ''), select('cal-intensity', [[1, 'слабо'], [2, 'заметно'], [3, 'сильно']], form.intensity ?? 2),
            chipButton(form.id ? 'Сохранить' : 'Добавить', 'dir-cal-save', {}, 'Записать событие', 'ku-dir-btn ku-sb-go'), chipButton('Отмена', 'dir-cal-cancel', {}, 'Закрыть форму', 'ku-dir-btn'),
          );
          day.append(row);
        } else day.append(chipButton('+ Событие', 'dir-cal-new', {}, 'Добавить событие на этот день', 'ku-dir-btn'));
        card.append(day);
      }
      if (!data.next.length) card.append(node('span', 'ku-dir-caption', 'Ближайшие две недели: ничего не запланировано.'));
      for (const event of data.next) {
        const row = node('div', 'ku-dir-cal-row');
        row.append(node('b', null, event.when), node('span', null, ` ${event.title}`), ...(event.kind ? [node('span', 'ku-dir-caption', ` · ${event.kind}`)] : []));
        card.append(row);
      }
      card.append(chipButton('Открыть календарь', 'studio', { tab: 'calendar' }, 'Окно календаря: править события, шаблоны, свой календарь', 'ku-dir-btn'));
      return card;
    };
    /** «Песни для рассказчика» looks like the player: the line of what sounds, a search, one list (pinned, noticed, favorites, the rest) with a star on each. */
    const songsCard = () => {
      const songs = view.songs ?? { enabled: false, playing: [], found: [], muted: [], library: [] };
      const people = [...(director.people ?? [])].sort((left, right) => Number(Boolean(right.persona)) - Number(Boolean(left.persona))).slice(0, 24);
      const root = node('div', 'pud-media-pane ku-dir-songs');
      const now = node('div', 'pud-media-now');
      now.append(node('span', `pud-media-nowtext${songs.playing.length ? '' : ' pud-media-idle'}`, songs.enabled ? (songs.playing.length ? `♪ ${songs.playing.map(item => item.title).join(', ')}` : 'Ничего не закреплено') : 'Песни выключены: «Мир → Песни»'));
      root.append(now);
      root.append(node('p', 'pud-media-hint', 'Песня подхватывается сама, когда в постах цитируют её строки или называют её. Закрепить нужно, если она звучит или поётся без цитат.'));
      const find = textField('song-find', ui.songFind, 'Поиск по названию и исполнителю');
      find.classList.add('pud-media-search');
      find.setAttribute('aria-label', 'Найти песню в библиотеке');
      root.append(find);
      const playing = new Map(songs.playing.map(item => [item.songId, item]));
      const found = new Map(songs.found.map(item => [item.songId, item]));
      const silenced = new Set(songs.muted.map(item => item.songId));
      const WHY = { lyrics: 'узнана по словам', title: 'узнана по названию', key: 'узнана по ключу' };
      const rank = item => (playing.has(item.songId) ? 0 : found.has(item.songId) ? 1 : item.favorite ? 2 : 3);
      const query = ui.songFind.trim().toLocaleLowerCase('ru-RU');
      const items = songs.library
        .filter(item => !query || `${item.title} ${item.artist}`.toLocaleLowerCase('ru-RU').includes(query))
        .map((item, index) => ({ item, index }))
        .sort((left, right) => rank(left.item) - rank(right.item) || left.index - right.index)
        .map(entry => entry.item);
      const list = node('div', 'pud-media-list');
      if (!songs.library.length) list.append(node('p', 'pud-media-empty', 'В библиотеке пока нет песен. Добавьте их на странице «Мир → Песни».'));
      else if (!items.length) list.append(node('p', 'pud-media-empty', 'Ничего не нашлось.'));
      for (const item of items) {
        const pin = playing.get(item.songId);
        const seen = found.get(item.songId);
        const muted = silenced.has(item.songId);
        const row = node('div', `pud-media-row${pin ? ' playing' : ''}${item.favorite ? ' pinned' : ''}`);
        const state = pin ? (pin.mode === 'sung' ? `поёт ${pin.singerId ? (people.find(person => person.id === pin.singerId)?.name ?? 'кто-то') : 'кто-то'}` : 'звучит')
          : muted ? 'заглушена в этом чате' : seen ? WHY[seen.why] ?? 'узнана' : '';
        const main = chipButton('', pin ? 'dir-song-unpin' : 'dir-song-pin', { songId: item.songId, mode: 'sound' }, pin ? 'Песня закреплена: нажми, чтобы убрать' : 'Закрепить: песня играет в сцене', 'pud-media-play');
        main.append(node('span', 'pud-media-title', item.title), node('span', 'pud-media-sub', [item.artist, state].filter(Boolean).join(' · ')));
        row.append(main);
        if (muted) row.append(chipButton('↺', 'dir-song-unmute', { songId: item.songId }, 'Снова узнавать эту песню в этом чате', 'pud-media-pin'));
        else if (seen && !pin) row.append(chipButton('✕', 'dir-song-mute', { songId: item.songId }, 'Это не та песня: не узнавать её в этом чате', 'pud-media-pin'));
        const star = chipButton(item.favorite ? '★' : '☆', 'dir-song-fav', { songId: item.songId }, item.favorite ? 'Убрать из избранного' : 'В избранное: песня выше в списке', 'pud-media-pin');
        star.setAttribute('aria-pressed', String(Boolean(item.favorite)));
        row.append(star);
        list.append(row);
        if (pin) {
          // who sings it: a line of chips under the song
          const how = node('div', 'ku-dir-row ku-song-how');
          const pressed = (button, on) => { button.setAttribute('aria-pressed', String(on)); return button; };
          how.append(pressed(chipButton('🔊 Звучит', 'dir-song-pin', { songId: item.songId, mode: 'sound' }, 'Песня играет в сцене: из колонки, на улице, по радио', `ku-dir-btn${pin.mode === 'sound' ? ' on' : ''}`), pin.mode === 'sound'));
          how.append(pressed(chipButton('🎤 Кто-то', 'dir-song-pin', { songId: item.songId, mode: 'sung', singerId: '' }, 'Её поёт кто-то из героев, модель решит кто', `ku-dir-btn${pin.mode === 'sung' && !pin.singerId ? ' on' : ''}`), pin.mode === 'sung' && !pin.singerId));
          for (const person of people) {
            const on = pin.mode === 'sung' && pin.singerId === person.id;
            how.append(pressed(chipButton(`🎤 ${person.name}`, 'dir-song-pin', { songId: item.songId, mode: 'sung', singerId: person.id }, `${person.name} поёт эту песню`, `ku-dir-btn${on ? ' on' : ''}`), on));
          }
          list.append(how);
        }
      }
      root.append(list);
      const add = chipButton('Библиотека ▸', 'studio', { tab: 'songs' }, 'Страница песен: описания, слова, ключи', 'pud-media-add');
      root.append(add);
      return root;
    };
    /** «Настройка чата» in the drawer: the steps of the guide, each one opens its page. */
    const setupCard = () => {
      const setup = view.setup;
      const card = node('div', 'ku-dir-card ku-dir-setup');
      card.append(node('div', 'ku-dir-card-head', '📋 Настройка чата'));
      if (!setup) { card.append(node('span', 'ku-dir-caption', 'Закулисье для этого чата выключено.')); return card; }
      card.append(node('span', 'ku-dir-caption', setup.done >= setup.total ? 'Обязательное настроено. Остальные шаги по желанию.' : `Обязательных шагов сделано: ${setup.done} из ${setup.total}.`));
      for (const step of setup.steps ?? []) {
        if (step.done === null || !BANNER_STEPS.has(step.id)) continue;
        const row = chipButton(`${step.done ? '✓ ' : '○ '}${step.title}${step.done || step.required ? '' : ' (по желанию)'}`, 'studio', { tab: step.tab }, 'Открыть страницу этого шага', `ku-dir-btn ku-sb-step${step.done ? ' done' : ''}`);
        card.append(row);
      }
      card.append(chipButton('Подробно ▸', 'studio', { tab: 'setup' }, 'Открыть «Настройка чата»: что нажать и зачем', 'ku-dir-btn ku-sb-go'));
      return card;
    };
    const timeCard = () => {
      const draft = clockDraft();
      const card = node('div', 'ku-dir-card ku-dir-time');
      card.append(node('div', 'ku-dir-card-head', '🕑 Время сцены'));
      const fields = node('div', 'ku-dir-row ku-dir-field');
      const field = (name, value, placeholder, label, width) => {
        const input = textField(name, value, placeholder);
        input.setAttribute('aria-label', label);
        input.style.maxWidth = width;
        return input;
      };
      fields.append(
        attachTimeMask(field('clock-time', draft.time, '__:__', 'Время, часы и минуты', '6.5em')),
        field('clock-day', draft.day, 'день', 'Номер дня истории', '5.5em'),
        field('clock-label', draft.label, 'вторник, 8 апреля (если известно)', 'Дата или день недели', '100%'),
        chipButton('Сохранить', 'dir-clock-save', {}, 'Записать время (Enter)', 'ku-dir-btn ku-dir-kick'),
      );
      const quick = node('div', 'ku-dir-row');
      quick.append(node('span', 'ku-dir-caption', 'Сдвинуть:'));
      for (const [label, minutes] of [['+15 мин', 15], ['+30 мин', 30], ['+1 ч', 60], ['+3 ч', 180], ['+8 ч', 480]]) quick.append(chipButton(label, 'dir-clock-shift', { minutes }, `Сдвинуть время вперёд: ${label}`));
      card.append(fields, quick, node('span', 'ku-dir-caption', 'Время идёт вперёд само по ходу ответов. Здесь можно поправить его вручную.'));
      return card;
    };
    /**
     * The drawer's weather: what is in force, the week ahead (click a day to start from it), how many days, the temperature and words,
     * and the eight kinds: a kind goes onto every chosen day. By default it is «today, one day», like before.
     */
    const weatherCard = () => {
      const card = node('div', 'ku-dir-card ku-dir-weather');
      const now = view.weather;
      const info = now ? WEATHER_KINDS[now.kind] : null;
      const SOURCE = { lock: 'держится', set: 'выбрана', scenario: 'заготовка', forecast: 'по прогнозу' };
      const tempOf = value => (value == null ? '' : `${value > 0 ? '+' : ''}${value}°`);
      card.append(node('div', 'ku-dir-card-head', info
        ? `${info.icon} ${info.label}${now.temp != null ? ` · ${tempOf(now.temp)}` : ''} · ${now.manual ? 'вручную' : (SOURCE[now.source] ?? '')}${now.scenario && !now.manual ? ` «${now.scenario}»` : ''}`
        : '🌤 Погоды пока нет'));
      const today = view.weatherDay ?? 0;
      const week = view.weatherWeek ?? [];
      if (today > 0 && week.length) {
        card.append(node('span', 'ku-dir-caption', 'Для каких дней (нажми день, с которого начать):'));
        const strip = node('div', 'ku-wx-strip');
        for (const item of week) {
          const offset = item.day - today;
          const inside = offset >= ui.wxFrom && offset < ui.wxFrom + ui.wxDays;
          const day = chipButton('', 'dir-wx-from', { from: offset }, `${offset === 0 ? 'Сегодня' : item.label}: начать с этого дня`, `ku-wx-day${inside ? ' on' : ''}${offset === ui.wxFrom ? ' first' : ''}`);
          day.setAttribute('aria-pressed', String(inside));
          day.append(node('span', 'ku-wx-lab', offset === 0 ? 'сегодня' : offset === 1 ? 'завтра' : item.label), node('span', 'ku-wx-ico', WEATHER_KINDS[item.kind]?.icon ?? '·'), node('span', 'ku-wx-t', tempOf(item.temp)));
          strip.append(day);
        }
        const spans = node('div', 'ku-dir-row');
        spans.append(node('span', 'ku-dir-caption', 'Сколько дней:'));
        for (const [days, label] of [[1, '1'], [2, '2'], [3, '3'], [5, '5'], [7, 'неделя'], [14, '2 нед.']]) {
          spans.append(chipButton(label, 'dir-wx-days', { days }, days === 1 ? 'Только этот день' : `${days} дней подряд`, `ku-dir-seg${ui.wxDays === days ? ' on' : ''}`));
        }
        card.append(strip, spans);
      }
      const fields = node('div', 'ku-dir-row ku-dir-field');
      const temp = node('input', 'text_pole ku-dir-input ku-wx-temp');
      temp.type = 'number';
      temp.min = '-60';
      temp.max = '60';
      temp.value = ui.wxTemp;
      temp.placeholder = '°C';
      temp.dataset.kuField = 'wx-temp';
      temp.setAttribute('aria-label', 'Температура, градусы');
      temp.title = 'Температура. Пусто — как даёт прогноз';
      const words = textField('wx-text', ui.wxText, 'как выглядит: моросит, лужи');
      words.setAttribute('aria-label', 'Как выглядит погода');
      fields.append(temp, words, chipButton('✓', 'dir-wx-apply', {}, now ? 'Применить температуру и слова к текущей погоде на выбранные дни (Enter)' : 'Сначала выберите, какая погода', 'ku-dir-btn'));
      const row = node('div', 'ku-dir-row ku-wx-kinds');
      for (const id of WEATHER_KIND_IDS) {
        const on = now?.kind === id && ui.wxFrom === 0;
        const button = chipButton(WEATHER_KINDS[id].icon, 'dir-weather', { kind: id }, `${WEATHER_KINDS[id].label}: на выбранные дни`, `ku-dir-btn ku-wx-kind${on ? ' on' : ''}`);
        button.setAttribute('aria-pressed', String(on));
        button.setAttribute('aria-label', WEATHER_KINDS[id].label);
        row.append(button);
      }
      const tools = node('div', 'ku-dir-row ku-wx-tools');
      if (now && ui.wxFrom === 0 && ui.wxDays === 1) {
        const locked = now.source === 'lock';
        const lockButton = chipButton(locked ? '🔒 Держится' : '🔓 Держать', 'dir-weather-lock', {}, locked ? 'Погода держится: нажмите, чтобы отпустить' : 'Держать эту погоду: летописец и прогноз её не меняют', `ku-dir-btn${locked ? ' on' : ''}`);
        lockButton.setAttribute('aria-pressed', String(locked));
        tools.append(lockButton);
      }
      tools.append(chipButton('↺ Сбросить', 'dir-weather-clear', {}, 'Снять ручную погоду и заготовки с выбранных дней: они снова считаются по прогнозу', 'ku-dir-btn'));
      const calendarButton = chipButton('📅', 'studio', { tab: 'calendar' }, 'Календарь с погодой по дням: на любое число или промежуток, заготовки на 1, 3 и 7 дней, сочинить прогноз', 'ku-dir-btn ku-wx-calendar');
      calendarButton.setAttribute('aria-label', 'Открыть календарь и погоду');
      const corner = node('div', 'ku-dir-row ku-wx-corner');
      corner.append(calendarButton);
      card.append(fields, row, tools, corner);
      if (today > 0) card.append(node('span', 'ku-dir-caption', ui.wxFrom === 0 && ui.wxDays === 1 ? 'Выбери погоду: она встанет на сегодня. Чтобы на несколько дней или на завтра — выбери дни выше.' : 'Выбери погоду: она встанет на отмеченные дни.'));
      return card;
    };
    // The rail: always there, one button per tab; the first one folds and unfolds the panel.
    const pending = (director.cues ?? []).length;
    const toggle = chipButton(open ? '◂' : '▸', 'dir-toggle', {}, open ? 'Свернуть панель в рейку' : 'Развернуть панель сцены', 'ku-rail-toggle');
    toggle.setAttribute('aria-expanded', String(open));
    if (pending) toggle.append(node('span', 'ku-rail-badge', pending));
    // One column, three groups with a line between them: the state of the scene, the tools, the modules of Закулисье; «Пнуть» at the foot.
    const STATE_PANES = new Set(['who', 'scene', 'calendar']);
    const groupOfTile = (child, before) => child.dataset?.kuAction === 'dir-kick' || child.dataset?.pane === 'setup' ? 4
      : !child.dataset?.pane ? before
        : STATE_PANES.has(child.dataset.pane) ? 1
          : ['sent', 'quests', 'songs', 'note', 'repeats'].includes(child.dataset.pane) || child.dataset.members ? 2 : 3;
    const column = [toggle];
    let last = 0;
    for (const child of grid.children) {
      const key = child.dataset?.members ? (TILE_OF_PANE[child.dataset.pane] ?? child.dataset.pane) : child.dataset?.pane;
      if (key && hiddenTiles.has(key)) continue;
      const group = groupOfTile(child, last || 1);
      if (last && group !== last) column.push(group === 4 ? node('div', 'ku-rail-grow') : node('div', 'ku-rail-sep'));
      column.push(child);
      last = group;
    }
    bar.querySelector('.ku-rail').replaceChildren(...column);
    const TAB_TITLES = { who: 'Сцена', others: 'Позвать', calendar: 'Календарь и погода', quests: 'Квесты', songs: 'Медиа', scene: 'Новый кадр', setup: 'Настройка чата', note: 'Рассказчику / повторы', repeats: 'Рассказчику / повторы', 'wardrobe-persona': 'Одежда', 'wardrobe-heroes': 'Одежда', sent: 'Что уходит модели' };
    headElement.replaceChildren(node('strong', 'ku-dir-title', ui.selected ? 'Персонаж' : (TAB_TITLES[pane] ?? extraPanes.get(pane)?.title ?? 'Сцена')), ...places);
    if (!open) { inner.replaceChildren(); return; }
    const parts = [];
    if (ui.selected) {
      parts.push(stage);
      const menu = characterMenu(director);
      if (menu) parts.push(menu);
    } else if (pane === 'who' || pane === 'others') {
      // The whole state of the scene in one place: who is here, the clock, the kind of scene, the heat (and the dice when it is intimate).
      parts.push(stage, ...(pane === 'others' ? [othersMenu(director)] : []), timeCard(), modeCard(), heatCard(), ...(mode === 'intim' || view.dice?.stage?.id ? [diceCard(view)] : []));
    }
    else if (pane === 'quests') parts.push(questsCard());
    else if (pane === 'calendar') {
      // The calendar and the weather share a button: the weather folds under the calendar.
      const weather = node('details', 'ku-weather-fold');
      weather.open = ui.weatherOpen ?? true;
      weather.addEventListener('toggle', () => { ui.weatherOpen = weather.open; });
      weather.append(node('summary', null, `${kindInfo ? kindInfo.icon : '🌤'} Погода`), weatherCard());
      parts.push(calendarCard(), weather);
    }
    else if (pane === 'songs') {
      // «Медиа»: the songs the narrator hears (as before) and, under them, the playlist to play from
      const tab = node('div', 'ku-media-tab');
      // Two tabs, like the wardrobe: the playlist to play from, and the songs the narrator hears (a tab of their own without a player).
      const hasPlayer = Boolean(mediaSection.render);
      const mediaTab = hasPlayer ? (ui.mediaTab === 'songs' ? 'songs' : 'player') : 'songs';
      if (hasPlayer) {
        const tabs = node('div', 'ku-dir-row ku-dir-tabs');
        for (const [id, label] of [['player', 'Плеер'], ['songs', 'Песни для рассказчика']]) tabs.append(chipButton(label, 'dir-media-tab', { tab: id }, '', `ku-dir-seg${id === mediaTab ? ' on' : ''}`));
        tab.append(tabs);
      }
      if (mediaTab === 'player') { const host = node('div', 'pud-pane-host ku-media-host'); try { mediaSection.render(host, view); } catch (error) { console.error('[Kulisy] Media list failed.', error); } tab.append(host); }
      else tab.append(songsCard());
      parts.push(tab);
    }
    else if (pane === 'setup') parts.push(setupCard());
    else if (pane === 'sent') { const card = node('div', 'ku-dir-card ku-dir-sent'); card.append(...sentDetails(view)); parts.push(card); }
    else if (pane === 'scene') parts.push(frameMenu(director));
    else if (pane === 'note') parts.push(noteMenu(director));
    else if (extraPanes.has(pane)) parts.push(extraPaneBody(extraPanes.get(pane)));
    // The queue of directions lives only on «Что уходит»: nowhere else it is in the way.
    if (pane === 'sent' && director.cues?.length) {
      const queue = node('div', 'ku-dir-row ku-dir-queue');
      queue.append(node('span', 'ku-dir-caption', 'Режиссура:'));
      for (const cue of director.cues) {
        const tag = node('span', `ku-dir-tag${cue.used ? ' used' : ''}`);
        tag.title = cue.used ? 'Уже в силе: действует для свайпов этого ответа, сгорит с твоим следующим постом'
          : cue.wait ? `Сработает через ${cue.wait}` : 'Уйдёт с твоим следующим постом';
        tag.append(node('span', null, `${cue.wait ? `⏳${cue.wait} ` : ''}${cue.badge} ${cue.label}${cue.used ? ' ✓' : ''}`), chipButton('×', 'dir-remove', { cueId: cue.id }, 'Снять', 'ku-dir-fav-del'));
        queue.append(tag);
      }
      parts.push(queue);
    }
    const group = ui.selected ? null : groupOf(pane);
    if (group) {
      ui.groupTab = { ...ui.groupTab, [group.id]: pane };
      const ids = Object.keys(group.members).filter(hasPage);
      if (ids.length > 1) {
        const tabs = node('div', 'ku-dir-row ku-dir-tabs');
        for (const id of ids) tabs.append(chipButton(group.members[id], 'dir-tab', { pane: id }, '', `ku-dir-seg${id === pane ? ' on' : ''}`));
        parts.unshift(tabs);
      }
    }
    inner.replaceChildren(...parts);
    if (focused) {
      const field = inner.querySelector(`[data-ku-field="${focused}"]`);
      if (field) {
        field.focus();
        try { if (caret != null && typeof field.setSelectionRange === 'function') field.setSelectionRange(caret, caret); } catch { /* a select has no caret */ }
      }
    }
  }

  function renderLeaks(view) {
    for (const old of document.querySelectorAll(`#chat .${LEAK_CLASS}`)) old.remove();
    const byMessage = new Map();
    for (const leak of view.leaks) {
      if (!byMessage.has(leak.messageIndex)) byMessage.set(leak.messageIndex, []);
      byMessage.get(leak.messageIndex).push(leak);
    }
    for (const [messageIndex, leaks] of byMessage) {
      const block = document.querySelector(`#chat .mes[mesid="${messageIndex}"] .mes_block`);
      if (!block) continue; // not rendered (older messages are loaded on scroll)
      for (const leak of leaks) {
        const data = { messageIndex, entityId: leak.entityId, eventId: leak.eventId };
        const note = node('div', LEAK_CLASS);
        note.setAttribute('role', 'note');
        const text = node('div', 'ku-leak-text');
        text.append(
          node('i', 'fa-solid fa-triangle-exclamation'),
          node('b', null, ' Возможная утечка. '),
          `${leak.name} ведёт себя так, будто знает: «${leak.eventText}». В сцене этого не видел(а), и никто не рассказывал.`,
        );
        if (leak.quote) text.append(node('span', 'ku-leak-quote', ` «${leak.quote}»`));
        const actions = node('div', 'ku-leak-actions');
        if (leak.canSwipe) actions.append(actionButton('Свайп', 'swipe', data, 'Перегенерировать этот ответ'));
        actions.append(
          actionButton('Он знает', 'knows', data, 'Это не ошибка: записать, что он знает'),
          actionButton('Не утечка', 'dismiss', data, 'Убрать отметку, ничего не записывая'),
        );
        note.append(text, actions);
        const anchor = block.querySelector('.mes_text');
        if (anchor?.nextSibling) block.insertBefore(note, anchor.nextSibling); else block.append(note);
      }
    }
  }

  function renderSecretHints(view) {
    for (const old of document.querySelectorAll(`#chat .${SECRET_HINT_CLASS}`)) old.remove();
    for (const hint of view.secretHints ?? []) {
      const block = document.querySelector(`#chat .mes[mesid="${hint.messageIndex}"] .mes_block`);
      if (!block) continue;
      const data = { messageIndex: hint.messageIndex, eventId: hint.eventId };
      const note = node('div', `${LEAK_CLASS} ${SECRET_HINT_CLASS}`);
      note.setAttribute('role', 'note');
      const text = node('div', 'ku-leak-text');
      text.append(node('i', 'fa-solid fa-user-secret'), node('b', null, ' Похоже на секрет: '), `«${hint.text}»`);
      if (hint.names) text.append(node('span', 'ku-leak-quote', ` Знают: ${hint.names}.`));
      const actions = node('div', 'ku-leak-actions');
      actions.append(
        actionButton('Открыть в окне', 'secret-open', data, 'Составить секрет: проверишь текст и знающих, потом сохранишь. Без твоего «Сохранить» ничего не записывается'),
        actionButton('Это не секрет', 'secret-dismiss', data, 'Убрать отметку, ничего не записывая'),
      );
      note.append(text, actions);
      const anchor = block.querySelector('.mes_text');
      if (anchor?.nextSibling) block.insertBefore(note, anchor.nextSibling); else block.append(note);
    }
  }

  function renderSlips(view) {
    for (const old of document.querySelectorAll(`#chat .${SLIP_CLASS}`)) old.remove();
    for (const slip of view.slips ?? []) {
      const block = document.querySelector(`#chat .mes[mesid="${slip.messageIndex}"] .mes_block`);
      if (!block) continue;
      const data = { messageIndex: slip.messageIndex, slipIndex: slip.slipIndex };
      const note = node('div', `${LEAK_CLASS} ${SLIP_CLASS}`);
      note.setAttribute('role', 'note');
      const text = node('div', 'ku-leak-text');
      text.append(node('i', 'fa-solid fa-shirt'), node('b', null, ` Возможный ляп: ${slip.label}${slip.name ? ` — ${slip.name}` : ''}. `), `«${slip.quote}»`);
      if (slip.note) text.append(node('span', 'ku-leak-quote', ` ${slip.note}`));
      const actions = node('div', 'ku-leak-actions');
      actions.append(
        slip.canSwipe ? actionButton('Свайп', 'slip-swipe', data, 'Перегенерировать этот ответ') : actionButton('Править', 'slip-edit', data, 'Открыть сообщение для правки'),
        actionButton('Так и есть', 'slip-accept', data, 'Текст верный: переписать запись под него'),
        actionButton('Не ляп', 'slip-dismiss', data, 'Убрать отметку, ничего не меняя'),
        actionButton('Напомнить', 'slip-remind', data, 'Текст не трогать, но в следующем ответе сказать рассказчику, как на самом деле'),
      );
      note.append(text, actions);
      const anchor = block.querySelector('.mes_text');
      if (anchor?.nextSibling) block.insertBefore(note, anchor.nextSibling); else block.append(note);
    }
  }

  /** The chronicler's guesses about quests: a task taken up, a step done, a quest over. Only proposals. */
  function renderQuestHints(view) {
    for (const old of document.querySelectorAll(`#chat .${QUEST_HINT_CLASS}`)) old.remove();
    for (const hint of view.questHints ?? []) {
      const block = document.querySelector(`#chat .mes[mesid="${hint.messageIndex}"] .mes_block`);
      if (!block) continue;
      const data = { messageIndex: hint.messageIndex, hintId: hint.id };
      const note = node('div', `${LEAK_CLASS} ${QUEST_HINT_CLASS}`);
      note.setAttribute('role', 'note');
      const text = node('div', 'ku-leak-text');
      text.append(node('i', `fa-solid ${hint.icon ?? 'fa-flag'}`), node('b', null, ` ${hint.title} `));
      if (hint.detail) text.append(node('span', 'ku-leak-quote', hint.detail));
      const actions = node('div', 'ku-leak-actions');
      actions.append(
        actionButton(hint.confirm, 'quest-confirm', data, hint.confirmTitle),
        actionButton('Нет', 'quest-dismiss', data, 'Убрать отметку, ничего не записывая'),
      );
      note.append(text, actions);
      const anchor = block.querySelector('.mes_text');
      if (anchor?.nextSibling) block.insertBefore(note, anchor.nextSibling); else block.append(note);
    }
  }

  /** A link of the media library that suits the scene: a note under the last reply, like the quests the chronicler finds. Only a proposal. */
  function renderMediaOffer(view) {
    for (const old of document.querySelectorAll(`#chat .${MEDIA_OFFER_CLASS}`)) old.remove();
    const offer = view.chips === false ? null : mediaSection.suggest?.(view);
    if (!offer) return;
    const last = [...document.querySelectorAll('#chat .mes')].at(-1);
    if (!last || last.getAttribute('is_user') === 'true') return; // the reply is not here yet
    const block = last.querySelector('.mes_block');
    if (!block) return;
    const data = { mediaId: offer.id };
    const note = node('div', `${LEAK_CLASS} ${MEDIA_OFFER_CLASS}`);
    note.setAttribute('role', 'note');
    const text = node('div', 'ku-leak-text');
    text.append(node('i', 'fa-solid fa-music'), node('b', null, ' Подходит под вайб, включить? '), node('span', 'ku-leak-quote', `${offer.title}${offer.reason ? ` · ${offer.reason}` : ''}`));
    const actions = node('div', 'ku-leak-actions');
    actions.append(actionButton('▶ Включить', 'media-play', data, 'Играть в плеере шторки'), actionButton('Нет', 'media-dismiss', data, 'Не предлагать это в этой сцене'));
    note.append(text, actions);
    const anchor = block.querySelector('.mes_text');
    if (anchor?.nextSibling) block.insertBefore(note, anchor.nextSibling); else block.append(note);
  }

  function renderDeaths(view) {
    for (const old of document.querySelectorAll(`#chat .${DEATH_CLASS}`)) old.remove();
    for (const death of view.deaths ?? []) {
      const block = document.querySelector(`#chat .mes[mesid="${death.messageIndex}"] .mes_block`);
      if (!block) continue;
      const data = { messageIndex: death.messageIndex, entityId: death.entityId };
      const note = node('div', `${LEAK_CLASS} ${DEATH_CLASS}`);
      note.setAttribute('role', 'note');
      const text = node('div', 'ku-leak-text');
      text.append(node('i', 'fa-solid fa-cross'), node('b', null, ` Похоже, ${death.name} умирает${death.note ? `: ${death.note}` : ''}. `));
      if (death.quote) text.append(node('span', 'ku-leak-quote', `«${death.quote}»`));
      const actions = node('div', 'ku-leak-actions');
      actions.append(
        actionButton('Отметить', 'death-confirm', data, 'Персонаж умер: уходит со сцены, модель больше не выводит его живым. Удаление или свайп этого ответа снимут отметку.'),
        actionButton('Нет', 'death-dismiss', data, 'Не умер: убрать отметку, ничего не записывая'),
      );
      note.append(text, actions);
      const anchor = block.querySelector('.mes_text');
      if (anchor?.nextSibling) block.insertBefore(note, anchor.nextSibling); else block.append(note);
    }
  }

  function renderReveals(view) {
    for (const old of document.querySelectorAll(`#chat .${REVEAL_CLASS}`)) old.remove();
    for (const reveal of view.reveals ?? []) {
      const block = document.querySelector(`#chat .mes[mesid="${reveal.messageIndex}"] .mes_block`);
      if (!block) continue;
      const data = { messageIndex: reveal.messageIndex, entityId: reveal.entityId, eventId: reveal.eventId };
      const note = node('div', `${LEAK_CLASS} ${REVEAL_CLASS}`);
      note.setAttribute('role', 'note');
      const text = node('div', 'ku-leak-text');
      text.append(node('i', 'fa-solid fa-key'), node('b', null, ` Похоже, ${reveal.name} узнаёт секрет: `), `«${reveal.eventText}»`);
      if (reveal.how) text.append(node('span', 'ku-leak-quote', ` (${reveal.how})`));
      const actions = node('div', 'ku-leak-actions');
      actions.append(
        actionButton('Отметить', 'reveal-confirm', data, 'Да, теперь знает: дальше получает текст секрета. Удаление этого ответа снимет отметку.'),
        actionButton('Нет', 'reveal-dismiss', data, 'Не узнал(а): убрать отметку, ничего не записывая'),
      );
      note.append(text, actions);
      const anchor = block.querySelector('.mes_text');
      if (anchor?.nextSibling) block.insertBefore(note, anchor.nextSibling); else block.append(note);
    }
  }

  return {
    render(view) {
      lastView = view;
      if (view?.chatId !== undefined) {
        if (lastChatId !== null && view.chatId !== lastChatId) resetMenu();
        lastChatId = view.chatId;
      }
      try {
        renderChips(view);
        renderStrip(view);
        renderLeaks(view);
        renderDeaths(view);
        renderQuestHints(view);
        renderMediaOffer(view);
        renderReveals(view);
        renderSecretHints(view);
        renderSlips(view);
      } catch (error) {
        console.error('[Kulisy] Chat overlay render failed.', error);
      }
    },
    unmount() {
      extraPaneHooks.rerender = null;
      extraPaneHooks.current = () => '';
      extraPaneHooks.show = null;
      document.removeEventListener('click', onClick, true);
      document.removeEventListener('keydown', onHotkey, true);
      document.getElementById(CHIPS_ID)?.remove();
      document.getElementById(STRIP_ID)?.remove();
      for (const old of document.querySelectorAll(`.${LEAK_CLASS}`)) old.remove();
      for (const old of document.querySelectorAll(`.${SLIP_CLASS}`)) old.remove();
      for (const old of document.querySelectorAll(`.${DEATH_CLASS}`)) old.remove();
      for (const old of document.querySelectorAll(`.${QUEST_HINT_CLASS}`)) old.remove();
      for (const old of document.querySelectorAll(`.${MEDIA_OFFER_CLASS}`)) old.remove();
      for (const old of document.querySelectorAll(`.${REVEAL_CLASS}`)) old.remove();
      for (const old of document.querySelectorAll(`.${SECRET_HINT_CLASS}`)) old.remove();
    },
  };
}
