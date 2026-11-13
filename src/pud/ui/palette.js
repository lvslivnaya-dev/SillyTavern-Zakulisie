/**
 * Палитра Пудреницы: переменные цветов на body и вкладка «Палитра» в окне «Пудреница».
 * Выбор — как радиокнопка: нажала на палитру, и она сразу применилась и запомнилась.
 * Свои палитры: копия любой палитры, у которой каждый цвет можно поправить пипеткой или кодом,
 * или палитра по описанию, которую подбирает подключённая модель (deps.generate).
 */
import { report } from '../core/guard.js';
import {
  COLOR_GROUPS, DEFAULT_PALETTE, PALETTES,
  makeCustomPalette, normalizeHex, paletteById, paletteVars, sanitizeCustomPalettes, setCustomDark,
} from '../core/palettes.js';
import { buildPalettePrompt, paletteFromReply, parsePaletteReply } from '../core/palette-ai.js';

export const DARK_CLASS = 'pud-dark';
/** Классы на body, которые убирают лапки: ключ настройки settings.paws → класс. */
export const NO_PAW_CLASSES = { background: 'pud-nopaw-bg', chat: 'pud-nopaw-chat' };
const PAW_OPTIONS = [
  ['background', 'Лапки на фоне', 'бледный узор из лапок поверх картинки фона'],
  ['chat', 'Лапки в чате', 'кружок с лапкой у аватарки и лапка у имени в каждом сообщении'],
];
const escapeHtml = text => String(text ?? '').replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[ch]);

/** Ставит палитру на body. Возвращает имена переменных, которые поставила. */
export function applyPalette(doc, id, previous = [], custom = []) {
  const body = doc.body;
  for (const name of previous) body.style.removeProperty(name);
  const vars = paletteVars(id, custom);
  for (const [name, value] of Object.entries(vars)) body.style.setProperty(name, value);
  body.classList.toggle(DARK_CLASS, paletteById(id, custom).dark);
  return Object.keys(vars);
}

const swatchHtml = p => `<span class="pud-pal-swatch" style="background:${p.bg}">
    <span style="background:${p.card};border-color:${p.line}"></span>
    <span style="background:${p.accent}"></span>
    <span style="background:${p.accent3}"></span>
    <span style="background:${p.ink}"></span>
  </span>`;

const cardHtml = (p, current) => `<button type="button" class="pud-pal${p.id === current ? ' on' : ''}" data-palette="${escapeHtml(p.id)}" role="radio" aria-checked="${p.id === current}">
    ${swatchHtml(p)}
    <b>${escapeHtml(p.title)}</b>
    <small>${escapeHtml(p.hint)}</small>
  </button>`;

const editorHtml = (p, openGroups, deleteArmed) => `
  <div class="pud-paledit" data-editing="${escapeHtml(p.id)}">
    <div class="pud-field-row">
      <label class="pud-field"><span>Название</span>
        <input type="text" class="text_pole" data-pal-name maxlength="60" value="${escapeHtml(p.title)}">
      </label>
      <label class="checkbox_label pud-paldark"><input type="checkbox" data-pal-dark${p.dark ? ' checked' : ''}><span>Тёмная</span></label>
      <button type="button" class="menu_button pud-paldel${deleteArmed ? ' armed' : ''}" data-pal-del>${deleteArmed ? 'Точно удалить?' : 'Удалить'}</button>
    </div>
    <p class="pud-hint">Цвет можно взять пипеткой из кружка или вписать кодом: <code>#e8899f</code>, <code>e8899f</code> или короткий <code>#f8c</code>. Меняется сразу, сохраняется само.</p>
    ${COLOR_GROUPS.map((group, index) => `<details class="pud-palgroup" data-group="${index}"${openGroups.has(index) ? ' open' : ''}>
      <summary>${escapeHtml(group.title)}</summary>
      <div class="pud-palcolors">
        ${group.fields.map(([key, label, where]) => `<label class="pud-palcolor" data-color="${key}">
            <input type="color" data-color-pick value="${p[key]}" aria-label="${escapeHtml(label)}">
            <span><b>${escapeHtml(label)}</b><small>${escapeHtml(where)}</small></span>
            <input type="text" class="text_pole" data-color-text value="${p[key]}" spellcheck="false" maxlength="7" aria-label="${escapeHtml(label)}, код">
          </label>`).join('')}
      </div>
    </details>`).join('')}
  </div>`;

/**
 * @param {Document} doc
 * @param {{ settings: any, save: () => void, shared?: any, generate?: (opts: object) => Promise<string> }} deps
 */
export function startPalette(doc, { settings, save, shared = {}, generate }) {
  settings.customPalettes = sanitizeCustomPalettes(settings.customPalettes);
  const custom = () => settings.customPalettes;
  const known = id => [...PALETTES, ...custom()].some(item => item.id === id);
  if (!known(settings.palette)) settings.palette = DEFAULT_PALETTE;
  let applied = applyPalette(doc, settings.palette, [], custom());
  const applyPaws = () => {
    for (const [key, cls] of Object.entries(NO_PAW_CLASSES)) doc.body.classList.toggle(cls, settings.paws?.[key] === false);
  };
  applyPaws();
  const reapply = () => { applied = applyPalette(doc, settings.palette, applied, custom()); };
  const undo = [() => {
    applyPalette(doc, DEFAULT_PALETTE, applied);
    doc.body.classList.remove(DARK_CLASS, ...Object.values(NO_PAW_CLASSES));
  }];

  const tab = shared.hub?.addTab?.('palette', 'Палитра', 'wand');
  if (tab) {
    undo.push(() => tab.remove());
    const openGroups = new Set(COLOR_GROUPS.map((group, index) => group.open ? index : -1).filter(index => index >= 0));
    let deleteArmed = false;
    const ai = { desc: '', busy: false, note: '' };
    const labelOf = key => COLOR_GROUPS.flatMap(group => group.fields).find(([k]) => k === key)?.[1] ?? key;
    const editing = () => custom().find(item => item.id === settings.palette);

    const render = () => {
      const mine = editing();
      tab.pane.innerHTML = `
        <h3>Палитра</h3>
        <p class="pud-hint">Цвета всей Пудреницы: окна, кнопки, чат. Нажми на палитру, и она сразу включится.</p>
        <div class="pud-palettes" role="radiogroup" aria-label="Палитра">
          ${PALETTES.map(p => cardHtml(p, settings.palette)).join('')}
        </div>
        <div class="pud-tabs-sub pud-palmine">Лапки</div>
        <div class="pud-palpaws">
          ${PAW_OPTIONS.map(([key, label, where]) => `<label class="checkbox_label">
              <input type="checkbox" data-paws="${key}"${settings.paws?.[key] !== false ? ' checked' : ''}>
              <span><b>${label}</b> <small>${where}</small></span>
            </label>`).join('')}
        </div>
        <div class="pud-tabs-sub pud-palmine">Мои палитры</div>
        ${generate ? `<div class="pud-palai">
          <input type="text" class="text_pole" data-pal-desc maxlength="200" value="${escapeHtml(ai.desc)}"
            placeholder="Опиши палитру: молочно-розовая, лавандовый вечер, мятное мороженое…"${ai.busy ? ' disabled' : ''}>
          <button type="button" class="menu_button" data-pal-gen${ai.busy ? ' disabled' : ''}>${ai.busy ? 'Подбираю…' : 'Подобрать'}</button>
        </div>
        <p class="pud-hint pud-palai-note">${escapeHtml(ai.note || 'Цвета подберёт модель, которая сейчас подключена, и получится новая своя палитра. Её потом можно подправить руками.')}</p>` : ''}
        <div class="pud-palettes" role="radiogroup" aria-label="Мои палитры">
          ${custom().map(p => cardHtml(p, settings.palette)).join('')}
          <button type="button" class="pud-pal pud-palnew" data-pal-new>
            <span class="pud-pal-swatch"><i class="fa-solid fa-plus" aria-hidden="true"></i></span>
            <b>Своя палитра</b>
            <small>копия той, что включена сейчас</small>
          </button>
        </div>
        ${mine ? editorHtml(mine, openGroups, deleteArmed) : ''}`;
    };

    /** Палитру поправили: перекрасить тему и её карточку, не трогая поля (чтобы не терялся фокус). */
    const repaint = palette => {
      reapply();
      const card = tab.pane.querySelector(`.pud-pal[data-palette="${palette.id}"]`);
      if (!card) return;
      card.querySelector('.pud-pal-swatch').outerHTML = swatchHtml(palette);
      card.querySelector('b').textContent = palette.title;
    };

    const setColor = (row, value, from) => {
      const palette = editing();
      const key = row?.dataset.color;
      if (!palette || !key) return;
      const hex = normalizeHex(value);
      row.classList.toggle('bad', !hex);
      if (!hex) return;
      palette[key] = hex;
      if (from !== 'pick') row.querySelector('[data-color-pick]').value = hex;
      if (from !== 'text') row.querySelector('[data-color-text]').value = hex;
      repaint(palette);
    };

    /** Палитра по описанию: запрос к модели → новая своя палитра на основе текущей. */
    const generateFromText = async () => {
      const description = ai.desc.trim();
      if (ai.busy) return;
      if (!description) { ai.note = 'Сначала опиши, какую палитру хочешь.'; render(); return; }
      ai.busy = true;
      ai.note = 'Модель подбирает цвета, это может занять до минуты.';
      render();
      try {
        const base = paletteById(settings.palette, custom());
        const reply = await generate({ ...buildPalettePrompt(description, base), responseLength: 2000 });
        const { palette, missing, fixed } = paletteFromReply(parsePaletteReply(reply), base, custom(), description);
        custom().push(palette);
        settings.palette = palette.id;
        deleteArmed = false;
        reapply();
        save();
        ai.note = [
          `Готово: «${palette.title}».`,
          missing.length ? `Модель не дала ${missing.length} цв., их взял из прошлой палитры.` : '',
          fixed.length ? `Подправил, чтобы читалось: ${fixed.map(labelOf).join(', ')}.` : '',
        ].filter(Boolean).join(' ');
      } catch (error) {
        report('палитра по описанию', error);
        ai.note = `Не вышло: ${error?.message ?? error}. Проверь, что модель подключена, и попробуй ещё раз.`;
      } finally {
        ai.busy = false;
        render();
      }
    };

    render();

    tab.pane.addEventListener('keydown', event => {
      if (event.key === 'Enter' && event.target.matches('[data-pal-desc]')) { event.preventDefault(); generateFromText(); }
    });

    tab.pane.addEventListener('click', event => {
      try {
        const target = event.target;
        if (target.closest('[data-pal-gen]')) { generateFromText(); return; }
        if (target.closest('[data-pal-new]')) {
          const base = paletteById(settings.palette, custom());
          const fresh = makeCustomPalette(base, custom());
          custom().push(fresh);
          settings.palette = fresh.id;
          deleteArmed = false;
          reapply();
          save();
          render();
          tab.pane.querySelector('[data-pal-name]')?.focus();
          return;
        }
        if (target.closest('[data-pal-del]')) {
          if (!deleteArmed) { deleteArmed = true; render(); return; }
          const palette = editing();
          if (!palette) return;
          settings.customPalettes = custom().filter(item => item.id !== palette.id);
          settings.palette = paletteById(palette.base).id;
          deleteArmed = false;
          reapply();
          save();
          render();
          return;
        }
        const choice = target.closest('[data-palette]')?.dataset.palette;
        if (!choice || choice === settings.palette) return;
        settings.palette = choice;
        deleteArmed = false;
        reapply();
        save();
        render();
      } catch (error) { report('палитра', error); }
    });

    tab.pane.addEventListener('input', event => {
      try {
        const target = event.target;
        if (target.matches('[data-color-pick]')) setColor(target.closest('[data-color]'), target.value, 'pick');
        else if (target.matches('[data-color-text]')) setColor(target.closest('[data-color]'), target.value, 'text');
        else if (target.matches('[data-pal-desc]')) ai.desc = target.value;
        else if (target.matches('[data-pal-name]')) {
          const palette = editing();
          if (!palette) return;
          palette.title = target.value.trim().slice(0, 60) || 'Моя палитра';
          repaint(palette);
        }
      } catch (error) { report('палитра', error); }
    });

    tab.pane.addEventListener('change', event => {
      try {
        const target = event.target;
        if (target.matches('[data-paws]')) {
          settings.paws = { ...settings.paws, [target.dataset.paws]: target.checked };
          applyPaws();
          save();
          return;
        }
        if (target.matches('[data-pal-dark]')) {
          const palette = editing();
          if (!palette) return;
          setCustomDark(palette, target.checked);
          repaint(palette);
        }
        if (target.matches('[data-color-text]')) {
          // недописанный код при уходе с поля возвращается к действующему цвету
          const row = target.closest('[data-color]');
          const palette = editing();
          if (palette && row && !normalizeHex(target.value)) { target.value = palette[row.dataset.color]; row.classList.remove('bad'); }
        }
        if (editing()) save();
      } catch (error) { report('палитра', error); }
    });

    tab.pane.addEventListener('toggle', event => {
      const group = event.target.closest?.('[data-group]');
      if (!group) return;
      const index = Number(group.dataset.group);
      if (group.open) openGroups.add(index); else openGroups.delete(index);
    }, true);
  }
  return () => { for (const fn of undo.reverse()) fn(); };
}

