/**
 * Котик гуляет по краю поля ввода, пока ИИ печатает ответ (стриминг).
 * Появляется на первом токене стрима, уходит, когда генерация закончилась или остановлена.
 * Цвета — из палитры, анимация — чистый CSS (при «уменьшить движение» котик просто сидит).
 */
export const CAT_ID = 'pud-walkcat';
export const WALKING_CLASS = 'pud-walking';
// если таверна почему-то не прислала «конец», котик уходит сам через столько тишины
const IDLE_MS = 6000;

// пушистость: каждая часть нарисована дважды — снизу толще контуром, сверху заливкой;
// из кружков получается одна мягкая «облачная» шубка без швов внутри
export const fur = shapes => `<g class="pud-fur-o">${shapes}</g><g class="pud-fur-i">${shapes}</g>`;
export const circles = list => list.map(([x, y, r]) => `<circle cx="${x}" cy="${y}" r="${r}"/>`).join('');
const TAIL = circles([[13, 24, 5], [9, 19, 5.2], [7.5, 13, 5], [9, 7.5, 4.4], [12.5, 4.5, 3.2]]);
const BODY = circles([[19, 27, 8], [26, 23, 9], [35, 22.5, 9], [42, 25, 8.5], [30, 29, 8], [22, 31, 6], [39, 31, 6], [47, 26, 6.5]])
  + '<path d="M47 12 L48.5 1.5 L55 8Z"/><path d="M58 8 L64 1.5 L63.5 12.5Z"/>'
  + circles([[55, 17, 10], [47.5, 21, 4.2], [62.5, 21, 4.2], [55, 25, 5.2], [50, 25, 3.5], [60, 25, 3.5]]);
const LEG = x => `<rect x="${x}" y="28" width="6.5" height="15" rx="3.2"/>`;

// на кончике хвоста катушка с плёнкой: хвост виляет, плёнка тянется следом
const FILM = `<g class="pud-film">
  <path class="pud-film-ribbon" d="M9.6 7.2 q-5 3 -2.4 8 q2.2 3.6 -1 7.4"/>
  <g class="pud-film-reel"><circle class="pud-film-disc" cx="11" cy="4.2" r="4"/>
  <circle class="pud-film-hole" cx="11" cy="1.9" r="0.95"/><circle class="pud-film-hole" cx="13" cy="5.3" r="0.95"/><circle class="pud-film-hole" cx="9" cy="5.3" r="0.95"/></g>
</g>`;

const CAT_SVG = `<svg viewBox="0 0 72 44" aria-hidden="true">
  <g class="pud-cat-leg pud-cat-leg-b1">${LEG(16)}</g>
  <g class="pud-cat-leg pud-cat-leg-f1">${LEG(40)}</g>
  <g class="pud-cat-leg pud-cat-leg-b2">${LEG(22)}</g>
  <g class="pud-cat-leg pud-cat-leg-f2">${LEG(34)}</g>
  <g class="pud-cat-tail">${fur(TAIL)}${FILM}</g>
  <g class="pud-cat-bob">
    ${fur(BODY)}
    <path class="pud-cat-earin" d="M49.4 9.6 L50.2 4.6 L53.2 7.9Z"/>
    <path class="pud-cat-earin" d="M59.8 7.9 L62.4 4.6 L62.2 10Z"/>
    <path class="pud-cat-eye" d="M56.2 15.4 q1.6 -1.8 3.2 0"/>
    <circle class="pud-cat-blush" cx="61.2" cy="19.4" r="2"/>
    <path class="pud-cat-nose" d="M64.2 17.2 l1.5 0.5 -1.3 1Z"/>
    <path class="pud-cat-whisk" d="M62 20.6 l5.5 -0.8 M62 21.8 l5.5 0.9"/>
  </g>
</svg>`;

/**
 * @param {Document} doc
 * @param {{ context: any }} deps
 */
export function startWalkCat(doc, { context }) {
  const form = doc.getElementById('send_form');
  const types = context.eventTypes ?? {};
  const events = context.eventSource;
  if (!form || !events?.on || !types.STREAM_TOKEN_RECEIVED) return () => {};
  const view = doc.defaultView;

  const cat = doc.createElement('div');
  cat.id = CAT_ID;
  cat.setAttribute('aria-hidden', 'true');
  cat.innerHTML = `<div class="pud-cat-walker">${CAT_SVG}</div>`;
  form.append(cat);

  let idle = 0;
  const stop = () => {
    view.clearTimeout(idle);
    form.classList.remove(WALKING_CLASS);
  };
  const walk = () => {
    if (!form.classList.contains(WALKING_CLASS)) form.classList.add(WALKING_CLASS);
    view.clearTimeout(idle);
    idle = view.setTimeout(stop, IDLE_MS);
  };

  const listeners = [
    [types.STREAM_TOKEN_RECEIVED, walk],
    ...['GENERATION_ENDED', 'GENERATION_STOPPED', 'CHAT_CHANGED'].filter(name => types[name]).map(name => [types[name], stop]),
  ];
  for (const [type, fn] of listeners) events.on(type, fn);

  return () => {
    stop();
    for (const [type, fn] of listeners) events.removeListener?.(type, fn);
    cat.remove();
  };
}
