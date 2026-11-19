/**
 * Studio navigation and window layout — pure data and rules, no DOM.
 *
 * Navigation is grouped the way the narrator thinks about a scene:
 * who is on stage and what they know, how they feel about each other,
 * and the machinery behind it.
 */
export const NAV_GROUPS = Object.freeze([
  Object.freeze({ id: 'scene', title: 'Сцена', items: Object.freeze([
    ['scene', 'Сейчас', 'stage'],
    ['characters', 'Персонажи', 'people'],
    ['chronicle', 'Хроника', 'scroll'],
    ['events', 'События', 'list'],
    ['secrets', 'Секреты', 'lock'],
  ]) }),
  Object.freeze({ id: 'world', title: 'Мир', items: Object.freeze([
    ['places', 'Локации', 'pin'],
    ['cards', 'Карточки', 'card'],
    ['wardrobe', 'Гардероб', 'shirt'],
    ['calendar', 'Календарь', 'calendar'],
    ['quests', 'Квесты', 'flag'],
    ['dice', 'Кубик', 'dice'],
    ['names', 'Имена', 'tag'],
    ['songs', 'Песни', 'music'],
    ['player', 'Плеер', 'play'],
  ]) }),
  Object.freeze({ id: 'relations', title: 'Отношения', items: Object.freeze([
    ['overview', 'Обзор пар', 'heart'],
    ['headcanons', 'Записи', 'spark'],
    ['triangles', 'Треугольники', 'triangle'],
  ]) }),
  Object.freeze({ id: 'system', title: 'Система', items: Object.freeze([
    ['setup', 'Настройка чата', 'check'],
    ['journal', 'История', 'history'],
    ['lorebooks', 'Лорбуки', 'book'],
    ['leaks', 'Проверка', 'alert'],
    ['settings', 'Настройки', 'gear'],
  ]) }),
]);

/** Flat [id, label, icon] list in menu order. */
export const NAV_TABS = Object.freeze(NAV_GROUPS.flatMap(group => group.items));

/** Tabs whose pages are not built yet; the menu marks them and the page says so. Empty since 0.1.0. */
export const PENDING_TABS = Object.freeze(new Set());

/** Tabs of the relationship group: they need the persona/pair tools at hand. */
export const RELATION_TABS = Object.freeze(new Set(NAV_GROUPS.find(group => group.id === 'relations').items.map(([id]) => id)));

/**
 * The separate windows of the top bar. Every tab belongs to exactly one window; a window shows only
 * its own tabs. «iconClass» is a FontAwesome class (SillyTavern ships it) for the top bar button.
 */
export const WINDOWS = Object.freeze([
  Object.freeze({ id: 'scene', title: 'Сцена', iconClass: 'fa-clapperboard', tabs: Object.freeze(['scene', 'characters', 'chronicle', 'events', 'secrets', 'lorebooks', 'setup']) }),
  Object.freeze({ id: 'relations', title: 'Отношения', subtitle: 'Что герои чувствуют друг к другу', iconClass: 'fa-heart', tabs: Object.freeze(['overview', 'headcanons', 'triangles']) }),
  Object.freeze({ id: 'cards', title: 'Карточки персонажей', subtitle: 'Кто они, как выглядят и что о них известно', iconClass: 'fa-address-card', tabs: Object.freeze(['cards']) }),
  Object.freeze({ id: 'places', title: 'Локации', subtitle: 'Где происходит сцена', iconClass: 'fa-location-dot', tabs: Object.freeze(['places']) }),
  Object.freeze({ id: 'wardrobe', title: 'Гардероб', subtitle: 'Во что одеты герои и что у них с собой', iconClass: 'fa-shirt', tabs: Object.freeze(['wardrobe']) }),
  Object.freeze({ id: 'quests', title: 'Квесты', subtitle: 'Что герои ведут и что откладывают', iconClass: 'fa-flag', tabs: Object.freeze(['quests']) }),
  Object.freeze({ id: 'calendar', title: 'Календарь и погода', subtitle: 'Время, даты, праздники и погода истории', iconClass: 'fa-calendar-days', tabs: Object.freeze(['calendar']) }),
  Object.freeze({ id: 'media', title: 'Медиа', subtitle: 'музыка, видео и другое', iconClass: 'fa-music', tabs: Object.freeze(['player', 'songs']) }),
]);

/**
 * Pages that moved out of the Studio into the settings window of the tavern («Закулисье» on the top bar): Studio tab -> tab of that window.
 * The Studio does not show them any more: a link to one opens the settings window on the right tab (options.onMoved).
 */
export const MOVED_TABS = Object.freeze({ names: 'k-names', journal: 'k-journal', leaks: 'k-checks', dice: 'k-dice', settings: 'k-modules' });
/** Sections of the old settings page -> tab of the settings window of the tavern. */
export const MOVED_SECTIONS = Object.freeze({ modules: 'k-modules', behaviour: 'k-modules', relations: 'k-modules', scene: 'k-modules', chronicle: 'k-modules', loregate: 'k-modules', diagnostics: 'k-diagnostics', models: 'k-models', prompt: 'k-prompt', data: 'k-data' });

/** The window a tab lives in (the first one, «Сцена», for anything unknown). */
export function windowOf(tabId) {
  if (tabId === 'weather') tabId = 'calendar'; // the weather is part of the calendar page
  return WINDOWS.find(item => item.tabs.includes(tabId)) ?? WINDOWS[0];
}

export const LAYOUT_MODES = Object.freeze(['window', 'dock']);
export const DEFAULT_TAB = 'overview';

/** Docked panel width in px: dragged by its handle, stored with the layout. */
export const DOCK_WIDTH = Object.freeze({ default: 520, min: 360, max: 1200, step: 20 });
/** The chat keeps at least this much room beside the docked panel. */
export const DOCK_CHAT_ROOM = 320;

/** Clamp a dock width to the allowed range and to what the window can spare. */
export function clampDockWidth(width, viewportWidth = Infinity) {
  const value = Number(width);
  if (!Number.isFinite(value)) return DOCK_WIDTH.default;
  const roomy = Math.max(DOCK_WIDTH.min, viewportWidth - DOCK_CHAT_ROOM);
  return Math.round(Math.min(Math.max(value, DOCK_WIDTH.min), DOCK_WIDTH.max, roomy));
}

/** Sanitise a stored layout: unknown modes and tabs fall back to the defaults. */
export function normalizeLayout(value) {
  const source = value && typeof value === 'object' ? value : {};
  const mode = LAYOUT_MODES.includes(source.mode) ? source.mode : 'window';
  const tab = NAV_TABS.some(([id]) => id === source.tab) ? source.tab : DEFAULT_TAB;
  const width = clampDockWidth(source.width ?? DOCK_WIDTH.default);
  // Was the panel open when the page went away? Only the docked panel comes back by
  // itself after a reload: a window over the chat would just be in the way.
  // Menu groups the user folded away (only known ids, no repeats).
  const folded = [...new Set(Array.isArray(source.folded) ? source.folded : [])].filter(id => NAV_GROUPS.some(group => group.id === id));
  return { mode, tab, width, open: Boolean(source.open), folded };
}

/** Whether to open the Studio right after the page (re)loads. */
export function reopenOnLoad(layout, isPhone) {
  return Boolean(layout?.open) && effectiveMode(layout?.mode, isPhone) === 'dock';
}

/** The dock needs room beside the chat; on a phone the Studio is always a full-screen window. */
export function effectiveMode(mode, isPhone) {
  return mode === 'dock' && !isPhone ? 'dock' : 'window';
}
