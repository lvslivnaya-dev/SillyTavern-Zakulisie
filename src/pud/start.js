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
import { startMessenger } from './ui/messenger.js';
import { startAssistants } from './ui/assistants.js';
import { startWalkCat } from './ui/walkcat.js';
import { startHub } from './ui/hub.js';
import { startKulisyPages } from './ui/kulisy-pages.js';
import { startConnection } from './ui/connection.js';
import { startChips } from './ui/chips.js';
import { startPalette } from './ui/palette.js';
import { startPrompts } from './ui/prompts.js';
import { startHome } from './ui/home.js';
import { startPersonas } from './ui/personas.js';
import { startPersonaSwitch } from './ui/persona-switch.js';
import { startPersonaEntry } from './ui/persona-entry.js';
import { startCharacters } from './ui/characters.js';
import { startExtensions } from './ui/extensions.js';
import { startLorebooks } from './ui/lorebooks.js';
import { startLoreEditor } from './ui/lore-editor.js';
import { startLoreTrace } from './ui/lore-trace.js';
import { startPeek } from './ui/peek.js';
import { startQuick } from './ui/quick.js';
import { startMoodTheme } from './ui/mood-theme.js';
import { startRepeats } from './ui/repeats.js';
import { startThreads } from './ui/threads.js';
import { startMood } from './ui/mood.js';
import { startWeatherSound } from './ui/weather-sound.js';
import { startRelGraph } from './ui/relgraph.js';
import { startVisualPresets } from './ui/visual-presets.js';

const FONT_BASE = new URL('../../assets/fonts/', import.meta.url);

/** start({ context, settings }) может вернуть функцию отката: она снимает всё, что модуль добавил. */
const MODULES = [
  { name: 'шрифты', start: () => injectFonts(document, FONT_BASE) },
  { name: 'иконки', start: () => injectSprite(document) },
  { name: 'тема', start: ({ context }) => startTheme(document, context) },
  { name: 'чат', start: () => startChat(document) },
  { name: 'кнопки поля ввода', start: ({ shared, bridge }) => startInputBar(document, { shared, chronicleHidden: () => bridge?.chronicleHidden?.() ?? 0 }) },
  { name: 'скрыть сообщения', start: ({ context }) => startHider(document, { context }) },
  { name: 'котик при стриминге', start: ({ context }) => startWalkCat(document, { context }) },
  {
    name: 'окно Закулисья',
    start: ({ context, settings, stopAll, shared }) => startHub(document, { settings, save: () => context.saveSettingsDebounced?.(), stopAll, shared }),
  },
  {
    name: 'настройки Закулисья в окне настроек',
    start: ({ bridge, shared }) => startKulisyPages(document, { bridge, shared }),
  },
  {
    name: 'профили соединения',
    start: ({ context, settings }) => startConnection(document, { context, settings, save: () => context.saveSettingsDebounced?.() }),
  },
  {
    name: 'палитра',
    start: ({ context, settings, shared, bridge }) => startPalette(document, { settings, save: () => context.saveSettingsDebounced?.(), shared, generate: opts => (bridge?.routedContext?.('generation') ?? context).generateRaw(opts) }),
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
    start: ({ settings, shared }) => startIconStudio(document, { settings, save: () => globalThis.SillyTavern?.getContext?.().saveSettingsDebounced?.(), hub: shared.hub, shared }),
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
    name: 'выбор персоны при входе в чат',
    start: ({ context }) => startPersonaEntry(document, { context }),
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
    start: ({ context, settings, shared, bridge }) => startLoreEditor(document, { context, settings, save: () => context.saveSettingsDebounced?.(), shared, bridge }),
  },
  {
    name: 'что сработало из лорбуков',
    start: ({ context, settings, shared }) => startLoreTrace(document, { context, settings, save: () => context.saveSettingsDebounced?.(), shared }),
  },
  {
    name: 'Слива выглядывает',
    start: ({ context, settings, shared }) => startPeek(document, { context, settings, save: () => context.saveSettingsDebounced?.(), shared }),
  },
  {
    name: 'быстрое меню шторки',
    start: ({ shared, bridge }) => startQuick(document, { shared, bridge }),
  },
  {
    name: 'повторы',
    start: ({ context, settings, shared }) => startRepeats(document, { context, settings, save: () => context.saveSettingsDebounced?.(), shared }),
  },
  {
    name: 'нити',
    start: ({ context, settings, shared }) => startThreads(document, { context, settings, save: () => context.saveSettingsDebounced?.(), shared }),
  },
  {
    name: 'настроение',
    start: ({ context, settings, shared, bridge }) => startMood(document, { context, settings, save: () => context.saveSettingsDebounced?.(), shared, bridge }),
  },
  {
    name: 'тема по настроению',
    start: ({ context, settings, shared, bridge }) => startMoodTheme(document, { context, settings, save: () => context.saveSettingsDebounced?.(), shared, bridge }),
  },
  {
    name: 'звуки погоды',
    start: ({ context, settings, shared, bridge }) => startWeatherSound(document, { context, settings, save: () => context.saveSettingsDebounced?.(), shared, bridge }),
  },
  {
    name: 'визуальные пресеты',
    start: ({ context, settings, shared }) => startVisualPresets(document, { context, settings, save: () => context.saveSettingsDebounced?.(), shared }),
  },
  {
    name: 'график отношений',
    start: ({ context, settings, shared, bridge }) => startRelGraph(document, { context, settings, save: () => context.saveSettingsDebounced?.(), shared, bridge }),
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
  const shared = { kulisyLore: bridge?.lore ?? null };
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
