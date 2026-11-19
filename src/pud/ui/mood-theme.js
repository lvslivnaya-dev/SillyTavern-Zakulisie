/**
 * «Тема по настроению» (блок «Визуал» окна Закулисья): человек сам задаёт, когда какие цвета применяются.
 * Правило = когда (часы в сюжете, накал, погода) + цвет + насколько заметно + форма. Подходящие правила накладываются
 * слоями поверх экрана; палитру таверны налёт не меняет. Данные сцены приходят из моста Кулис (bridge.scene).
 */
import { buildColorsPrompt, colorsFromReply } from '../core/color-ai.js';
import { report } from '../core/guard.js';
import {
  WEATHER_CHOICES, TINT_STYLES, DEFAULT_RULES, normalizeMoodTheme, normalizeRule, hourFromText, tintFor,
} from '../core/mood-theme.js';

export const TINT_ID = 'pud-mood-tint';
const escapeHtml = text => String(text ?? '').replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[ch]);
const options = (map, current) => Object.entries(map).map(([id, label]) => `<option value="${id}"${id === current ? ' selected' : ''}>${escapeHtml(label)}</option>`).join('');

/**
 * @param {Document} doc
 * @param {{ context: any, settings: any, save: () => void, shared?: any, bridge?: any }} deps
 */
export function startMoodTheme(doc, { context, settings, save, shared = {}, bridge = null }) {
  // a drawer inside the palette («Оформление → Палитра»); without such a hub it is a tab of its own
  const tab = shared.hub?.addFold?.('moodtheme', 'Тема по настроению', 'palette') ?? shared.hub?.addTab?.('moodtheme', 'Тема по настроению', 'moon');
  const view = doc.defaultView;
  const pane = tab?.pane;
  const gen = { desc: '', busy: false, note: '' };
  settings.moodTheme = normalizeMoodTheme(settings.moodTheme);
  const cfg = () => settings.moodTheme;
  const persist = () => { try { save(); } catch (error) { report('тема по настроению: сохранение', error); } };
  const sceneNow = () => {
    let read = null;
    try { read = bridge?.scene?.read?.() ?? null; } catch { /* нет моста: часы устройства */ }
    return {
      hour: hourFromText(read?.time) ?? new Date().getHours(),
      heat: Number(read?.heat) || 0,
      weather: read?.weather?.kind ?? '',
      fromStory: hourFromText(read?.time) !== null,
    };
  };

  // For the visual presets: the rules that are on now and a way to put a set on.
  const presetApi = {
    get: () => structuredClone(cfg()),
    set: value => { settings.moodTheme = normalizeMoodTheme(value); persist(); render(); },
  };
  shared.visual = { ...(shared.visual ?? {}), mood: presetApi };

  const tint = doc.createElement('div');
  tint.id = TINT_ID;
  tint.setAttribute('aria-hidden', 'true');
  doc.body.append(tint);

  let lastMatched = [];
  function paint() {
    const now = sceneNow();
    const result = tintFor(cfg(), now);
    lastMatched = result.matched;
    tint.style.background = result.css;
    tint.style.opacity = String(result.opacity);
    const readout = pane?.querySelector('[data-readout]');
    if (readout) {
      readout.textContent = `Сейчас: ${now.hour} ч ${now.fromStory ? 'по сюжету' : 'по часам устройства'}, накал ${Math.round(now.heat)}, погода ${WEATHER_CHOICES[now.weather] ?? (now.weather || 'не задана')}. Сработало: ${lastMatched.length ? lastMatched.join(', ') : 'ничего'}.`;
    }
  }

  const ruleRow = rule => `
    <div class="pud-rule" data-rule="${escapeHtml(rule.id)}">
      <div class="pud-rule-head">
        <label class="pud-opt"><span><b>Включено</b></span><input type="checkbox" data-f="on"${rule.on ? ' checked' : ''}></label>
        <input type="text" data-f="name" value="${escapeHtml(rule.name)}" aria-label="Название правила">
        <button type="button" class="menu_button" data-act="remove" data-id="${escapeHtml(rule.id)}" title="Удалить правило">✕</button>
      </div>
      <div class="pud-peek-fields">
        <label>Часы в сюжете: с<input type="number" data-f="hourFrom" min="0" max="23" value="${rule.hourFrom ?? ''}" placeholder="любые"></label>
        <label>до<input type="number" data-f="hourTo" min="0" max="23" value="${rule.hourTo ?? ''}" placeholder="любые"></label>
        <label>Накал от<input type="number" data-f="heatMin" min="0" max="100" value="${rule.heatMin}"></label>
        <label>до<input type="number" data-f="heatMax" min="0" max="100" value="${rule.heatMax}"></label>
        <label>Погода<select data-f="weather">${options(WEATHER_CHOICES, rule.weather)}</select></label>
        <label>Форма<select data-f="style">${options(TINT_STYLES, rule.style)}</select></label>
        <label>Цвет<input type="color" data-f="color" value="${escapeHtml(rule.color)}"></label>
        <label>Заметность, %<input type="range" data-f="alpha" min="0" max="60" step="1" value="${rule.alpha}"></label>
      </div>
      <label class="pud-opt"><span>Чем выше накал, тем заметнее (от нижней границы накала до верхней)</span><input type="checkbox" data-f="grow"${rule.grow ? ' checked' : ''}></label>
    </div>`;

  function render() {
    if (!pane) return;
    const c = cfg();
    pane.innerHTML = `
      <h3>Тема по настроению</h3>
      <p class="pud-hint">Лёгкий цветной налёт поверх экрана. Вы сами решаете, когда какие цвета применяются: каждое правило задаёт часы в сюжете (если времени в сюжете нет, берутся часы устройства), накал сцены, погоду, цвет, заметность и форму. Подходящие правила накладываются друг на друга. Палитра таверны не меняется.</p>
      <div class="pud-card pud-card-col">
        <label class="pud-opt"><span><b>Менять цвет по настроению сцены</b></span><input type="checkbox" data-global="enabled"${c.enabled ? ' checked' : ''}></label>
        <label class="pud-peek-fields"><span>Общая сила, %</span><input type="range" data-global="strength" min="10" max="100" step="5" value="${c.strength}"></label>
        <div class="pud-hint" data-readout></div>
      </div>
      <div class="pud-card pud-card-col">
        <b>Цвета правил по описанию</b>
        <div class="pud-palai">
          <input type="text" class="text_pole" data-gen-desc maxlength="200" value="${escapeHtml(gen.desc)}" placeholder="Опиши настроение цветов: тёплый вечер, зимняя ночь, неон…"${gen.busy ? ' disabled' : ''}>
          <button type="button" class="menu_button" data-act="gen"${gen.busy ? ' disabled' : ''}>${gen.busy ? 'Подбираю…' : 'Подобрать'}</button>
        </div>
        <p class="pud-hint">${escapeHtml(gen.note || 'Модель перекрасит цвета ваших правил, а часы, накал и погоду не тронет.')}</p>
      </div>
      <div class="pud-card pud-card-col">
        <b>Правила</b>
        <div class="pud-rules">${c.rules.map(ruleRow).join('') || '<p class="pud-lib-empty">Правил нет: налёта не будет.</p>'}</div>
        <div class="pud-peek-city"><button type="button" class="menu_button" data-act="add">Добавить правило</button><button type="button" class="menu_button" data-act="reset">Вернуть стандартные</button></div>
      </div>`;
    paint();
  }

  /** Правка поля правила на месте: без перерисовки, чтобы не терять фокус и давать мгновенный предпросмотр. */
  const applyField = target => {
    const id = target.closest?.('[data-rule]')?.dataset.rule;
    const f = target.dataset?.f;
    if (!id || !f) return false;
    const rule = cfg().rules.find(item => item.id === id);
    if (!rule) return false;
    const value = target.type === 'checkbox' ? target.checked : target.value;
    const next = normalizeRule({ ...rule, [f]: value });
    Object.assign(rule, next);
    persist();
    paint();
    return true;
  };
  const onInput = event => {
    if (event.target.matches?.('[data-gen-desc]')) { gen.desc = event.target.value; return; }
    if (event.target.type === 'range' || event.target.type === 'color') {
      if (event.target.dataset?.global === 'strength') { cfg().strength = normalizeMoodTheme({ strength: event.target.value }).strength; persist(); paint(); }
      else applyField(event.target);
    }
  };
  const onChange = event => {
    const target = event.target;
    if (target.dataset?.global) {
      if (target.dataset.global === 'enabled') cfg().enabled = target.checked;
      else cfg().strength = normalizeMoodTheme({ strength: target.value }).strength;
      persist();
      paint();
      return;
    }
    applyField(target);
  };
  /** Colours of the rules by a description: the model picks, only valid colours are taken, the rest of a rule stays. */
  async function generateColors() {
    if (gen.busy) return;
    if (!gen.desc.trim()) { gen.note = 'Сначала опиши, какие цвета хочешь.'; render(); return; }
    gen.busy = true;
    gen.note = 'Модель подбирает цвета, это может занять до минуты.';
    render();
    try {
      const rules = cfg().rules;
      const roles = rules.map(rule => ({ id: rule.id, label: rule.name, hint: [rule.hourFrom != null ? `hours ${rule.hourFrom}-${rule.hourTo ?? '…'}` : '', rule.weather ? `weather ${rule.weather}` : '', rule.heatMax > 0 && rule.heatMin > 0 ? `heat ${rule.heatMin}-${rule.heatMax}` : ''].filter(Boolean).join(', '), current: rule.color }));
      // through the auxiliary model when there is one (and it is on for generation), else the chat's own
      const generate = (bridge?.routedContext?.('generation') ?? context)?.generateRaw ?? globalThis.SillyTavern?.getContext?.()?.generateRaw;
      if (typeof generate !== 'function') throw new Error('модель не подключена');
      const reply = await generate({ ...buildColorsPrompt(gen.desc, roles, 'a light colour overlay on the chat screen that changes with the mood of the scene (time of day, heat, weather); one colour per rule'), responseLength: 1200 });
      const colors = colorsFromReply(reply, rules.map(rule => rule.id));
      cfg().rules = rules.map(rule => (colors[rule.id] ? normalizeRule({ ...rule, color: colors[rule.id] }) : rule));
      persist();
      gen.note = `Готово: перекрашено правил — ${Object.keys(colors).length}.`;
    } catch (error) {
      report('тема по настроению: цвета по описанию', error);
      gen.note = `Не вышло: ${error?.message ?? error}. Проверь, что модель подключена, и попробуй ещё раз.`;
    } finally {
      gen.busy = false;
      render();
    }
  }
  const onClick = event => {
    const target = event.target.closest?.('[data-act]');
    if (!target) return;
    if (target.dataset.act === 'gen') { generateColors(); return; }
    if (target.dataset.act === 'add') cfg().rules = [...cfg().rules, normalizeRule({ name: 'Новое правило', color: '#6b3fa0', alpha: 18 })].slice(0, 20);
    else if (target.dataset.act === 'remove') cfg().rules = cfg().rules.filter(item => item.id !== target.dataset.id);
    else if (target.dataset.act === 'reset') cfg().rules = DEFAULT_RULES.map(item => ({ ...item }));
    else return;
    persist();
    render();
  };
  pane?.addEventListener('input', onInput);
  pane?.addEventListener('change', onChange);
  pane?.addEventListener('click', onClick);
  const paneObserver = pane ? new view.MutationObserver(() => { if (!pane.hidden) render(); }) : null;
  paneObserver?.observe(pane, { attributes: true, attributeFilter: ['hidden'] });

  const types = context.eventTypes ?? {};
  const events = context.eventSource;
  if (types.CHAT_CHANGED && events?.on) events.on(types.CHAT_CHANGED, paint);
  const unsubscribeScene = bridge?.scene?.subscribe?.(paint) ?? (() => {});
  const timer = view.setInterval(paint, 60 * 1000);
  render();

  return () => {
    if (shared.visual?.mood === presetApi) delete shared.visual.mood;
    view.clearInterval(timer);
    unsubscribeScene();
    paneObserver?.disconnect();
    pane?.removeEventListener('input', onInput);
    pane?.removeEventListener('change', onChange);
    pane?.removeEventListener('click', onClick);
    if (types.CHAT_CHANGED) events?.removeListener?.(types.CHAT_CHANGED, paint);
    tint.remove();
    tab?.remove?.();
  };
}
