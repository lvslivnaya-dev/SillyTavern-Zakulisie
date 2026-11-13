/** Мелочи для перерисовки окон. */

/**
 * Перерисовка без лишней работы: если элементу дают тот же HTML, что уже стоит, DOM не трогается.
 * Окна перерисовываются на каждое событие таверны, а с сотней карточек и картинок это заметно тормозит.
 * @param {Element} el
 */
export function skipSameHtml(el) {
  const view = el.ownerDocument.defaultView;
  const native = Object.getOwnPropertyDescriptor(view.Element.prototype, 'innerHTML');
  if (!native?.set) return el;
  let last = null;
  Object.defineProperty(el, 'innerHTML', {
    configurable: true,
    get() { return native.get.call(el); },
    set(value) {
      const html = String(value);
      if (html === last) return;
      last = html;
      native.set.call(el, html);
    },
  });
  return el;
}
