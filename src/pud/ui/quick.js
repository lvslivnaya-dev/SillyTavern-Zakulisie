/**
 * Страницы шторки от Закулисья («Повторы», «Нити», «Эмоции», «График»): обычные вкладки рейки, как «Время» и «Погода».
 * Модули регистрируют их через shared.quick.register(panel); панель = { id, icon (значок-эмодзи), title, render(container) }.
 * render заполняет container (страница в шторке) и вешает свои обработчики (container.onclick / onchange);
 * при изменении данных модуль зовёт shared.quick.refresh(id). Сама шторка и реестр страниц живут в Кулисах (chat-overlay.js).
 * Здесь же боковая планка у края шторки: «пнуть» (нажимает спрятанную плитку Кулис) и звук погоды.
 */
import { watchRail, RAIL_ID, sidebarOf } from './rail-extras.js';

const TILE_NAMES = { repeats: 'Повторы', threads: 'Нити', mood: 'Эмоции', relgraph: 'Связи' };

/**
 * @param {Document} doc
 * @param {{ shared: any, bridge?: any }} deps
 */
export function startQuick(doc, { shared, bridge = null }) {
  const panes = bridge?.panes ?? null;
  const hooks = bridge?.paneHooks ?? {};
  const own = new Set();

  function decorate(rail = doc.getElementById(RAIL_ID)) {
    if (!rail) return;
    // «Пнуть» переехало с рейки в боковую планку: настоящая плитка спрятана, планка нажимает её
    const kickTile = rail.querySelector('.ku-rail .ku-tile.kick') ?? rail.querySelector('.ku-tile.kick');
    const bar = rail.querySelector('.pud-sidebar');
    let kick = bar?.querySelector('.pud-kick-btn');
    if (!kickTile) { kick?.remove(); return; }
    if (!kick) {
      kick = doc.createElement('button');
      kick.type = 'button';
      kick.className = 'pud-kick-btn';
      kick.textContent = '▶';
      kick.setAttribute('aria-label', 'Пнуть');
      sidebarOf(rail).append(kick);
    }
    kick.title = `Пнуть. ${kickTile.title ?? ''}`.trim();
  }
  const stopRail = watchRail(doc, decorate, bridge?.scene);

  const onClick = event => {
    if (!event.target.closest?.('.pud-kick-btn')) return;
    event.preventDefault();
    event.stopPropagation();
    doc.querySelector('#ku-scene-chips .ku-tile.kick')?.click();
  };
  doc.addEventListener('click', onClick, true);

  const redraw = () => { try { hooks.rerender?.(); } catch { /* шторка ещё не нарисована */ } };
  shared.quick = {
    register(panel) {
      if (!panes) return () => {};
      panes.set(panel.id, { id: panel.id, icon: panel.icon, name: TILE_NAMES[panel.id] ?? panel.title, title: panel.title, render: panel.render });
      own.add(panel.id);
      redraw();
      return () => { panes.delete(panel.id); own.delete(panel.id); redraw(); };
    },
    /** Страница показывается сейчас: перерисовать её. */
    refresh(id) { if (hooks.current?.() === id) redraw(); },
    /** Открыть страницу: нажать её плитку в рейке. */
    open(id) { doc.querySelector(`#ku-scene-chips .ku-tile[data-pane="${id}"]`)?.click(); },
    close() {},
    isOpen: id => hooks.current?.() === id,
  };

  return () => {
    stopRail();
    doc.removeEventListener('click', onClick, true);
    for (const id of own) panes?.delete(id);
    for (const node of doc.querySelectorAll('.pud-kick-btn')) node.remove();
    redraw();
    delete shared.quick;
  };
}
