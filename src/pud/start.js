/** Пудреница: точка входа. Каждый модуль стартует отдельно, и ошибка одного не мешает остальным. */
import { TAG, report } from './core/guard.js';
import { getSettings } from './core/settings.js';
import { injectFonts } from './ui/fonts.js';
import { injectSprite } from './ui/icons.js';
import { startTheme } from './ui/theme.js';
import { startChat } from './ui/chat.js';
import { startInputBar } from './ui/inputbar.js';
import { startHider } from './ui/hider.js';
import { startWandMenu } from './ui/wand-menu.js';
import { startIconStudio } from './ui/icon-studio.js';
import { startLoadingScreen } from './ui/loading-screen.js';
import { startMessenger } from './ui/messenger.js';
import { startAssistants } from './ui/assistants.js';
import { startWalkCat } from './ui/walkcat.js';
import { startHub } from './ui/hub.js';
import { startChips } from './ui/chips.js';
import { startPalette } from './ui/palette.js';
import { startPrompts } from './ui/prompts.js';
import { startHome } from './ui/home.js';
import { startPersonas } from './ui/personas.js';
import { startPersonaSwitch } from './ui/persona-switch.js';
import { startCharacters } from './ui/characters.js';
import { startExtensions } from './ui/extensions.js';
import { startLorebooks } from './ui/lorebooks.js';
import { startLoreEditor } from './ui/lore-editor.js';
import { startLoreTrace } from './ui/lore-trace.js';

const FONT_BASE = new URL('../../assets/fonts/', import.meta.url);

/** start({ context, settings }) может вернуть функцию отката: она снимает всё, что модуль добавил. */
const MODULES = [
  { name: 'шрифты', start: () => injectFonts(document, FONT_BASE) },
  { name: 'иконки', start: () => injectSprite(document) },
  { name: 'тема', start: ({ context }) => startTheme(document, context) },
  { name: 'чат', start: () => startChat(document) },
  { name: 'кнопки поля ввода', start: ({ shared }) => startInputBar(document, { shared }) },
  { name: 'скрыть сообщения', start: ({ context }) => startHider(document, { context }) },
  { name: 'котик при стриминге', start: ({ context }) => startWalkCat(document, { context }) },
  {
    name: 'окно Пудреница',
    start: ({ context, settings, stopAll, shared }) => startHub(document, { settings, save: () => context.saveSettingsDebounced?.(), stopAll, shared }),
  },
  {
    name: 'палитра',
    start: ({ context, settings, shared }) => startPalette(document, { settings, save: () => context.saveSettingsDebounced?.(), shared, generate: opts => context.generateRaw(opts) }),
  },
  {
    name: 'кнопки пресета',
    start: ({ context, settings, shared }) => startChips(document, { context, settings, save: () => context.saveSettingsDebounced?.(), hub: shared.hub }),
  },
  {
    name: 'мессенджер ассистента',
    start: ({ context, settings, bridge, shared }) => startMessenger(document, { bridge, shared, settings, save: () => context.saveSettingsDebounced?.() }),
  },
  {
    name: 'ассистенты',
    start: ({ context, bridge, shared }) => startAssistants(document, { bridge, shared, hub: shared.hub }),
  },
  {
    name: 'свои иконки',
    start: ({ settings, shared }) => startIconStudio(document, { settings, save: () => globalThis.SillyTavern?.getContext?.().saveSettingsDebounced?.(), hub: shared.hub }),
  },
  {
    name: 'экран загрузки',
    start: ({ context, settings, shared }) => startLoadingScreen(document, { context, settings, save: () => context.saveSettingsDebounced?.(), hub: shared.hub }),
  },
  {
    name: 'меню палочки',
    start: ({ settings, shared }) => startWandMenu(document, { settings, save: () => globalThis.SillyTavern?.getContext?.().saveSettingsDebounced?.(), hub: shared.hub }),
  },
  {
    name: 'промпты нарратора',
    start: ({ settings, shared }) => startPrompts(document, { settings, save: () => globalThis.SillyTavern?.getContext?.().saveSettingsDebounced?.(), hub: shared.hub }),
  },
  {
    name: 'библиотека чатов',
    start: ({ context, settings, shared }) => startHome(document, { context, settings, save: () => context.saveSettingsDebounced?.(), shared }),
  },
  {
    name: 'персоны',
    start: ({ context, settings, bridge, shared }) => startPersonas(document, { context, settings, save: () => context.saveSettingsDebounced?.(), bridge, shared }),
  },
  {
    name: 'быстрая смена персоны',
    start: ({ context, settings }) => startPersonaSwitch(document, { context, settings }),
  },
  {
    name: 'персонажи',
    start: ({ context, settings, shared }) => startCharacters(document, { context, settings, save: () => context.saveSettingsDebounced?.(), shared }),
  },
  {
    name: 'расширения',
    start: ({ context, settings }) => startExtensions(document, { context, settings, save: () => context.saveSettingsDebounced?.() }),
  },
  {
    name: 'лорбуки',
    start: ({ context, settings, shared }) => startLorebooks(document, { context, settings, save: () => context.saveSettingsDebounced?.(), shared }),
  },
  {
    name: 'редактор лорбука',
    start: ({ context, settings, shared }) => startLoreEditor(document, { context, settings, save: () => context.saveSettingsDebounced?.(), shared }),
  },
  {
    name: 'что сработало из лорбуков',
    start: ({ context, settings, shared }) => startLoreTrace(document, { context, settings, save: () => context.saveSettingsDebounced?.(), shared }),
  },
];

let controller = null;

export async function initPudrenitsa({ bridge = null } = {}) {
  if (controller) return controller;
  const context = globalThis.SillyTavern?.getContext?.();
  if (!context) {
    report('запуск', new Error('нет SillyTavern.getContext()'));
    return null;
  }
  const settings = getSettings(context);
  const running = [];
  const failed = [];
  const stopAll = () => controller?.stop();
  const shared = {};
  if (settings.enabled) {
    for (const module of MODULES) {
      try {
        const undo = await module.start({ context, settings, stopAll, shared, bridge });
        if (typeof undo === 'function') running.push({ name: module.name, undo });
      } catch (error) {
        failed.push(module.name);
        report(`модуль «${module.name}»`, error);
      }
    }
  }
  controller = {
    settings,
    failed,
    modules: () => running.map(item => item.name),
    stop() {
      for (const { name, undo } of running.splice(0).reverse()) {
        try { undo(); } catch (error) { report(`откат «${name}»`, error); }
      }
    },
  };
  if (failed.length) console.warn(`${TAG} не запустились: ${failed.join(', ')}`);
  return controller;
}
