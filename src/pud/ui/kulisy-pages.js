/**
 * Страницы настроек Закулисья внутри окна настроек таверны («Закулисье» на верхней панели).
 * Раньше у Закулисья было своё окно «Настройки»; теперь его страницы стоят здесь: каждая страница — вкладка окна,
 * внутри живёт та же страница Кулис (через bridge.createPage). Пока вкладка не открыта, страница не рисуется и не тратит времени.
 */
import { report } from '../core/guard.js';
import { MOVED_SECTIONS, MOVED_TABS } from '../../ui/layout.js';

export { MOVED_SECTIONS, MOVED_TABS };

/** id вкладки окна → какая страница Кулис в ней живёт (tab; sections — какие разделы настроек показывать). */
export const KULISY_PAGES = [
  { id: 'k-names', title: 'Имена', icon: 'tag', spec: { tab: 'names' } },
  { id: 'k-modules', title: 'Модули', icon: 'grid', spec: { tab: 'settings', section: 'modules', sections: ['modules', 'behaviour', 'relations', 'scene', 'chronicle', 'loregate'] } },
  { id: 'k-journal', title: 'История', icon: 'list', spec: { tab: 'journal' } },
  { id: 'k-diagnostics', title: 'Диагностика', icon: 'chart', spec: { tab: 'settings', section: 'diagnostics', sections: ['diagnostics'] } },
  { id: 'k-checks', title: 'Проверка ответов', icon: 'check', spec: { tab: 'leaks' } },
  { id: 'k-models', title: 'Вспомогательное соединение', icon: 'plug', spec: { tab: 'settings', section: 'models', sections: ['models'] } },
  { id: 'k-prompt', title: 'Что получает модель', icon: 'doc', spec: { tab: 'settings', section: 'prompt', sections: ['prompt'] } },
  { id: 'k-data', title: 'Данные', icon: 'archive', spec: { tab: 'settings', section: 'data', sections: ['data'] } },
  { id: 'k-dice', title: 'Кубик', icon: 'swap', spec: { tab: 'dice' } },
];

/**
 * @param {Document} doc
 * @param {{ bridge: any, shared: any }} deps
 */
export function startKulisyPages(doc, { bridge, shared }) {
  const hub = shared.hub;
  if (!bridge?.createPage || !hub?.addTab || !hub.onShow) return () => {};
  const studios = new Map();
  const undo = [];
  for (const page of KULISY_PAGES) {
    const handle = hub.addTab(page.id, page.title, page.icon);
    const show = () => {
      try {
        let studio = studios.get(page.id);
        if (!studio) {
          studio = bridge.createPage(handle.pane, page.spec, () => hub.isShown(page.id));
          studios.set(page.id, studio);
        } else studio.refresh();
      } catch (error) { report(`настройки Закулисья: ${page.title}`, error); }
    };
    hub.onShow(page.id, show);
    undo.push(() => { try { studios.get(page.id)?.destroy(); } catch { /* уже снято */ } studios.delete(page.id); handle.remove(); });
  }
  /** Открыть вкладку (и раздел настроек, и поле в нём). Кулисы зовут это через bridge, когда ссылка ведёт на переехавшую страницу. */
  const open = (id, { section = '', focus = '' } = {}) => {
    hub.open(id);
    if (section) studios.get(id)?.openSettings?.(section, { focus });
    return true;
  };
  shared.kulisyPages = { open };
  if (bridge) bridge.openSettingsPage = open;
  undo.push(() => { delete shared.kulisyPages; if (bridge?.openSettingsPage === open) delete bridge.openSettingsPage; });
  return () => { for (const fn of undo.reverse()) fn(); };
}
