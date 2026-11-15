/**
 * Шторка сцены (плашки героев слева или справа от чата, #ku-scene-chips) принадлежит Кулисам и перерисовывается ими.
 * Здесь модули Закулисья вешают на неё свои мелочи (значки настроения, кнопку звука, мини-график): раз в пару секунд
 * и по сигналу «сцена изменилась» вызываются их decorate(rail), каждая обязана быть идемпотентной (повторный вызов ничего не меняет).
 */
import { report } from '../core/guard.js';

export const RAIL_ID = 'ku-scene-chips';
const TICK_MS = 2000;

/** Куда класть украшения: в узкую рейку шторки (корень шторки — гибкая строка «рейка + панель», лишние дети ломают её вид). */
/** Тонкая боковая планка у края шторки: звук погоды и «пнуть». Лежит в корне шторки, рядом с панелью. */
export const sidebarOf = rail => {
  // the foot of the second rail (Кулисы make it); if the drawer is an old one without it, a bar at the root as before
  let bar = rail.querySelector('.ku-rail2 > .pud-sidebar') ?? rail.querySelector(':scope > .pud-sidebar');
  if (!bar) { bar = rail.ownerDocument.createElement('div'); bar.className = 'pud-sidebar'; rail.append(bar); }
  return bar;
};

export const railHost = rail => rail.querySelector(':scope > .ku-rail') ?? rail;

/**
 * @param {Document} doc
 * @param {(rail: HTMLElement) => void} decorate
 * @param {{ subscribe?: (fn: () => void) => () => void }} [scene] сигнал «сцена изменилась» из моста Кулис
 * @returns {() => void} отмена: снимает слушатели и таймер
 */
export function watchRail(doc, decorate, scene = null) {
  const view = doc.defaultView;
  let timer = 0;
  const run = () => {
    timer = 0;
    const rail = doc.getElementById(RAIL_ID);
    if (!rail) return;
    try { decorate(rail); } catch (error) { report('шторка: украшение', error); }
  };
  const soon = () => { if (!timer) timer = view.setTimeout(run, 60); };
  const interval = view.setInterval(soon, TICK_MS);
  const unsubscribe = scene?.subscribe?.(soon) ?? (() => {});
  soon();
  return () => {
    view.clearInterval(interval);
    view.clearTimeout(timer);
    unsubscribe();
  };
}
