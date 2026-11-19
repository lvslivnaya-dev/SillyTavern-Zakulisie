/**
 * «Слива выглядывает»: картинка-маскот иногда выезжает из-за верхнего края строки ввода и говорит в облачке.
 * Два источника реплик:
 *   - напоминания (отдых, еда, вода, сон, погода): когда говорить, решает core/peek.js, без модели;
 *   - комментарии моделью: она читает последние сообщения чата и шутит в своём характере (core/peek.js, PEEK_PERSONA).
 * Сама картинка не анимирована, только плавный выезд и уход. Настройки живут во вкладке «Слива» окна Закулисья.
 */
import { report } from '../core/guard.js';
import {
  PEEK_FACES, PEEK_KINDS, commentFace, defaultPeekSettings, decide, noteActivity, pickLine, holdMs, pruneMeals, clockParts, zoneOf,
  buildCommentMessages, cleanComment, commentDue, commentTokens, bubbleMaxWidth, countWords, tidyMessage, normalizeReminders, newReminder,
} from '../core/peek.js';
import { findPlace, currentWeather } from '../core/peek-weather.js';
import { askModel, listProfiles } from '../integration/peek-api.js';

export const PEEK_ID = 'pud-peek';
export const CITY_MIRROR_KEY = 'pud-peek-city';
const FACE_BASE = new URL('../../../assets/peek/', import.meta.url);
/** Пикселей на пиксель исходной картинки при размере 100%. */
const SCALE = 0.42;
const TICK_MS = 30 * 1000;
const WEATHER_REFRESH_MS = 30 * 60 * 1000;
const COMMENT_BACKOFF_MS = 10 * 60 * 1000;
const escapeHtml = text => String(text ?? '').replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[ch]);
const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

const KIND_ORDER = ['rest', 'meal', 'water', 'sleep', 'hello', 'cheer'];
const KIND_LABELS = {
  rest: 'Напоминать об отдыхе', meal: 'Напоминать поесть', water: 'Напоминать пить воду', sleep: 'Напоминать про сон',
  weather: 'Рассказывать про погоду (нужен город)', hello: 'Здороваться', cheer: 'Иногда подбодрить',
};

/**
 * @param {Document} doc
 * @param {{ context: any, settings: any, save: () => void, shared?: any }} deps
 */
export function startPeek(doc, { context, settings, save, shared = {} }) {
  const form = doc.getElementById('send_form');
  if (!form) return () => {};
  const view = doc.defaultView;
  const cfg = () => (settings.peek ??= defaultPeekSettings());
  const persist = () => { try { save(); } catch (error) { report('Слива: сохранение', error); } };
  const liveContext = () => globalThis.SillyTavern?.getContext?.() ?? context;

  // ───────── картинка и облачко
  const root = doc.createElement('div');
  root.id = PEEK_ID;
  root.dataset.side = cfg().side;
  root.innerHTML = `
    <div class="pud-peek-clip"><img class="pud-peek-img" alt="" draggable="false"></div>
    <div class="pud-peek-bubble" role="status">
      <button type="button" class="pud-peek-x" data-do="close" title="Закрыть" aria-label="Закрыть облачко">×</button>
      <span class="pud-peek-emoji" aria-hidden="true"></span><span class="pud-peek-text"></span>
      <div class="pud-peek-menu" hidden>
        <button type="button" data-do="thanks">Спасибо!</button>
        <button type="button" data-do="later">Напомни через полчаса</button>
        <button type="button" data-do="quiet">Тихо на три часа</button>
        <button type="button" data-do="settings">Настройки</button>
      </div>
    </div>`;
  form.append(root);
  const img = root.querySelector('.pud-peek-img');
  const emoji = root.querySelector('.pud-peek-emoji');
  const textNode = root.querySelector('.pud-peek-text');
  const menu = root.querySelector('.pud-peek-menu');

  let shown = false;
  let hideTimer = 0;
  let busy = false;
  let lastShownAt = 0;
  const session = { start: 0, last: 0 };
  let weather = null;
  let weatherAt = 0;
  let weatherError = '';
  const counters = { waiting: 0, reply: 0 };
  let commenting = false;
  let commentBackoffUntil = 0;
  let commentStatus = '';
  const timers = [];

  const applyLook = () => {
    const c = cfg();
    root.dataset.side = c.side === 'right' || c.side === 'center' ? c.side : 'left';
    root.style.setProperty('--peek-k', String(clamp(Number(c.size) || 100, 50, 160) / 100));
  };

  const setFace = face => {
    const meta = PEEK_FACES[face] ?? PEEK_FACES.normal;
    const name = PEEK_FACES[face] ? face : 'normal';
    root.style.setProperty('--peek-w', `${meta.w * SCALE}px`);
    root.style.setProperty('--peek-h', `${meta.h * SCALE}px`);
    // ручки свешиваются за линию края: на столько картинка заходит на панель
    root.style.setProperty('--peek-over', `${(meta.h - meta.ledge) * SCALE}px`);
    return new Promise(resolve => {
      let done = false;
      const finish = () => { if (!done) { done = true; resolve(); } };
      img.onload = finish;
      img.onerror = finish;
      img.src = new URL(`${name}.webp`, FACE_BASE).href;
      view.setTimeout(finish, 1500);
    });
  };

  const clearHold = () => { view.clearTimeout(hideTimer); hideTimer = 0; };
  const hide = () => {
    clearHold();
    menu.hidden = true;
    if (!shown) return;
    shown = false;
    root.classList.remove('on');
  };
  const armHide = ms => {
    clearHold();
    hideTimer = view.setTimeout(hide, ms);
  };

  /** Показывает маскота: spec = { kind } (из PEEK_KINDS) или { face, text, emoji }. */
  const show = async spec => {
    try {
      const kind = PEEK_KINDS[spec.kind];
      const face = spec.face ?? kind?.face ?? 'normal';
      const text = spec.text ?? pickLine(spec.kind, cfg(), Math.random, { t: spec.temp ?? '' });
      if (!text) return;
      if (shown) { root.classList.remove('on'); shown = false; await new Promise(resolve => view.setTimeout(resolve, 350)); }
      applyLook();
      textNode.textContent = text;
      emoji.textContent = spec.emoji ?? kind?.emoji ?? '';
      // чем длиннее реплика, тем шире облачко (до предела)
      root.style.setProperty('--peek-maxw', `${bubbleMaxWidth(countWords(text))}px`);
      await setFace(face);
      menu.hidden = true;
      shown = true;
      // следующий кадр: чтобы переход сработал, а не применился сразу
      view.requestAnimationFrame?.(() => root.classList.add('on'));
      if (!view.requestAnimationFrame) root.classList.add('on');
      armHide(holdMs(cfg(), text));
    } catch (error) {
      report('Слива: показ', error);
    }
  };

  // ───────── клики
  const onRootClick = event => {
    const action = event.target.closest?.('[data-do]')?.dataset.do;
    if (action) {
      const c = cfg();
      // «Закрыть»: просто прячет облачко, ничего не откладывает
      if (action === 'later') c.snoozeUntil = Date.now() + 30 * 60 * 1000;
      if (action === 'quiet') c.snoozeUntil = Date.now() + 3 * 60 * 60 * 1000;
      if (action === 'later' || action === 'quiet') persist();
      hide();
      if (action === 'settings') shared.hub?.open?.('peek');
      return;
    }
    if (event.target.closest?.('.pud-peek-clip, .pud-peek-bubble')) {
      menu.hidden = !menu.hidden;
      if (!menu.hidden) clearHold(); else armHide(4000);
    }
  };
  const onOver = () => { if (shown && menu.hidden) clearHold(); };
  const onOut = () => { if (shown && menu.hidden) armHide(3500); };
  const onDocDown = event => { if (shown && !menu.hidden && !root.contains(event.target)) { menu.hidden = true; armHide(3000); } };
  root.addEventListener('click', onRootClick);
  root.addEventListener('pointerover', onOver);
  root.addEventListener('pointerout', onOut);
  doc.addEventListener('pointerdown', onDocDown, true);

  // ───────── город: запоминается в настройках и дублируется в браузере, чтобы пережить сброс после обновления
  const readMirror = () => {
    try { const data = JSON.parse(view.localStorage?.getItem(CITY_MIRROR_KEY) ?? 'null'); return data?.city ? data : null; } catch { return null; }
  };
  const writeMirror = () => {
    try {
      const c = cfg();
      if (c.city) view.localStorage?.setItem(CITY_MIRROR_KEY, JSON.stringify({ city: c.city, place: c.place ?? null }));
      else view.localStorage?.removeItem(CITY_MIRROR_KEY);
    } catch { /* браузер без хранилища: остаётся только сохранение в настройках */ }
  };

  // ───────── погода
  const refreshWeather = async (force = false) => {
    const c = cfg();
    if (!c.place || c.kinds?.weather === false) return;
    if (!force && weather && Date.now() - weatherAt < WEATHER_REFRESH_MS) return;
    weatherAt = Date.now();
    try {
      weather = await currentWeather(c.place, undefined, view);
      weatherError = '';
    } catch (error) {
      weatherError = String(error?.message ?? error);
      report('Слива: погода', error);
    }
    paintStatus();
  };

  // ───────── напоминания
  const evaluate = () => {
    try {
      const c = cfg();
      if (shown || doc.hidden || (busy && !c.whileWaiting)) return;
      refreshWeather();
      const choice = decide({ now: new Date(), session, cfg: c, weather, lastShownAt });
      if (!choice) return;
      const nowMs = Date.now();
      lastShownAt = nowMs;
      c.last = { ...c.last, [choice.kind === 'custom' ? `r:${choice.reminderId}` : choice.kind]: nowMs };
      if (choice.doneKey) c.remindersDone = { ...pruneMeals(c.remindersDone, new Date(), zoneOf(c)), [choice.doneKey]: true };
      if (choice.mealKey) c.mealsDone = { ...pruneMeals(c.mealsDone, new Date(), zoneOf(c)), [choice.mealKey]: true };
      persist();
      show(choice);
    } catch (error) {
      report('Слива: проверка', error);
    }
  };

  // ───────── комментарии моделью
  const readChat = ctx => (ctx.chat ?? [])
    .filter(item => item && !item.is_system && String(item.mes ?? '').trim())
    .slice(-clamp(Number(cfg().commentMessages) || 6, 2, 20))
    .map(item => ({ name: item.name, text: tidyMessage(item.mes), isUser: Boolean(item.is_user) }))
    .filter(item => item.text);

  /** force: из кнопки «Прокомментировать сейчас» — без проверки частоты. */
  const comment = async ({ force = false } = {}) => {
    const c = cfg();
    if (commenting) return;
    if (!force && shown) return;
    try {
      const ctx = liveContext();
      const chat = readChat(ctx);
      if (!chat.length) { commentStatus = 'В чате пока нечего комментировать.'; paintStatus(); return; }
      if (!c.commentProfile) { commentStatus = 'Выберите, чем писать комментарии.'; paintStatus(); return; }
      if (c.commentProfile === 'main' && busy) { commentStatus = 'Модель чата сейчас занята ответом: подожду.'; paintStatus(); return; }
      commenting = true;
      const chatId = ctx.chatId;
      const maxWords = clamp(Number(c.commentMaxWords) || 25, 5, 80);
      c.last = { ...c.last, comment: Date.now() };
      commentStatus = 'Читаю чат…';
      paintStatus();
      const raw = await askModel(ctx, c.commentProfile, buildCommentMessages({ chat, maxWords, author: ctx.name1 }), commentTokens(maxWords));
      const text = cleanComment(raw, maxWords);
      // чат успели сменить или Сливе уже сказали замолчать: не показываем
      if (!text) { commentStatus = String(raw ?? '').trim() ? 'Модель выдала рассуждения вместо реплики, поэтому Слива промолчала. Возьмите профиль без «режима размышлений» (reasoning) или поднимите ему лимит токенов.' : 'Модель ответила пусто.'; return; }
      if (liveContext().chatId !== chatId && !force) { commentStatus = ''; return; }
      commentStatus = `Последний комментарий: ${countWords(text)} слов.`;
      persist();
      if (force || !shown) show({ text, face: commentFace(raw), emoji: '' });
    } catch (error) {
      commentBackoffUntil = Date.now() + COMMENT_BACKOFF_MS;
      commentStatus = `Не вышло: ${String(error?.message ?? error)}`;
      report('Слива: комментарий', error);
    } finally {
      commenting = false;
      paintStatus();
    }
  };
  /** Событие чата → считаем и, если пора, комментируем. type: waiting | reply. */
  const maybeComment = type => {
    try {
      const c = cfg();
      counters[type]++;
      if (type === 'waiting' ? !c.commentWaiting : !c.commentReply) return;
      if (Date.now() < commentBackoffUntil || commenting) return;
      if (!commentDue({ cfg: c, count: counters[type], lastAt: c.last?.comment ?? 0, now: new Date(), busy })) return;
      counters[type] = 0;
      comment();
    } catch (error) {
      report('Слива: когда комментировать', error);
    }
  };

  const act = () => { noteActivity(session, Date.now()); };
  let lastTyped = 0;
  const onTyping = () => { const now = Date.now(); if (now - lastTyped > 10000) { lastTyped = now; act(); } };

  const types = context.eventTypes ?? {};
  const events = context.eventSource;
  const listeners = [];
  const listen = (name, fn) => { if (types[name] && events?.on) { events.on(types[name], fn); listeners.push([types[name], fn]); } };
  listen('MESSAGE_SENT', act);
  listen('MESSAGE_RECEIVED', () => { act(); maybeComment('reply'); });
  listen('CHAT_CHANGED', act);
  listen('GENERATION_STARTED', () => { busy = true; maybeComment('waiting'); });
  for (const name of ['GENERATION_ENDED', 'GENERATION_STOPPED']) listen(name, () => { busy = false; });
  const textarea = doc.getElementById('send_textarea');
  textarea?.addEventListener('input', onTyping);
  act();
  const timer = view.setInterval(evaluate, TICK_MS);

  // ───────── вкладка настроек
  const tab = shared.hub?.addTab?.('peek', 'Слива', 'heart');
  const pane = tab?.pane;
  const num = (path, value, min, max, step = 1) => `<input type="number" data-path="${path}" value="${escapeHtml(value)}" min="${min}" max="${max}" step="${step}">`;
  const check = (path, label, on) => `<label class="pud-opt"><span>${label}</span><input type="checkbox" data-path="${path}"${on ? ' checked' : ''}></label>`;
  const pad = n => String(n).padStart(2, '0');

  function paintStatus() {
    if (!pane) return;
    const c = cfg();
    const node = pane.querySelector('[data-status]');
    if (node) {
      if (!c.place) node.textContent = c.city ? 'Город ещё не найден: нажмите «Найти».' : 'Город не задан: рассказов о погоде не будет.';
      else {
        const where = [c.place.name, c.place.country].filter(Boolean).join(', ');
        if (weatherError) node.textContent = `${where}. Погоду получить не вышло: ${weatherError}`;
        else node.textContent = weather ? `${where}: сейчас ${Math.round(weather.temp)}° (ощущается как ${Math.round(weather.feels ?? weather.temp)}°).` : `${where}. Погода ещё не загружена.`;
      }
    }
    const clock = pane.querySelector('[data-clock]');
    if (clock) {
      const zone = zoneOf(c);
      const { minute } = clockParts(new Date(), zone);
      clock.textContent = `Сейчас для напоминаний ${pad(Math.floor(minute / 60))}:${pad(minute % 60)} (${zone || 'часы этого устройства'}).`;
    }
    const cs = pane.querySelector('[data-comment-status]');
    if (cs) cs.textContent = commentStatus;
  }

  const FACE_NAMES = { normal: 'обычная', sleepy: 'сонная', happy: 'радостная', cold: 'мёрзнет', hungry: 'голодная', wink: 'подмигивает', sad: 'грустная', stern: 'строгая', shy: 'смущается', smug: 'ехидничает', approve: 'одобряет (табличка)', love: 'сердечки в глазах', pout: 'надулась', grumpy: 'недовольная', scared: 'испуганная', panic: 'в панике' };
  let remHelp = false;
  function render() {
    if (!pane) return;
    const c = cfg();
    c.reminders = normalizeReminders(c.reminders);
    const own = kind => (Array.isArray(c.phrases?.[kind]) ? c.phrases[kind].join('\n') : '');
    const kindList = [...KIND_ORDER.slice(0, 4), 'weather', ...KIND_ORDER.slice(4)];
    const profiles = listProfiles(liveContext());
    const profileOptions = [
      `<option value="">— не выбрано: комментариев не будет —</option>`,
      `<option value="main">Модель чата (только когда чат не пишет ответ)</option>`,
      ...profiles.map(item => `<option value="${escapeHtml(item.id)}">Профиль: ${escapeHtml(item.name)}</option>`),
      ...(c.commentProfile && c.commentProfile !== 'main' && !profiles.some(item => item.id === c.commentProfile) ? [`<option value="${escapeHtml(c.commentProfile)}">Профиль не найден</option>`] : []),
    ].join('');
    pane.innerHTML = `
      <h3>Слива</h3>
      <p class="pud-hint">Маскот выглядывает из-за строки ввода и напоминает про отдых, еду, воду, сон и погоду, а ещё читает чат и ехидно его комментирует. Картинка не двигается, только плавно выезжает и уходит. Клик по ней открывает меню «отложить».</p>
      <div class="pud-card pud-card-col">
        ${check('enabled', '<b>Слива выглядывает</b>', c.enabled)}
        ${check('whileWaiting', 'Выглядывать и пока жду ответа от чата', c.whileWaiting)}
        <div class="pud-peek-fields">
          <label>Где<select data-path="side"><option value="left">слева</option><option value="center">по центру</option><option value="right">справа</option></select></label>
          <label>Размер, %${num('size', c.size, 50, 160, 5)}</label>
          <label>Напоминания не чаще, чем раз в (мин)${num('minGapMin', c.minGapMin, 1, 600)}</label>
          <label>Облачко держится (сек)${num('showSec', c.showSec, 3, 120)}</label>
        </div>
      </div>
      <div class="pud-card pud-card-col">
        <b>Комментарии: Слива читает чат</b>
        <p class="pud-hint">Слива берёт последние сообщения чата, отправляет их выбранной модели и показывает её реплику. Характер у неё один и тот же: хитрая, ехидная, с пошлыми шуточками, сентиментальная и чувственная. Текст чата уходит выбранной вами модели, поэтому по умолчанию выключено.</p>
        ${check('commentEnabled', '<b>Комментировать чат</b>', c.commentEnabled)}
        <div class="pud-peek-fields">
          <label>Чем писать<select data-path="commentProfile">${profileOptions}</select></label>
          <label>Предел длины, слов<input type="number" data-path="commentMaxWords" value="${escapeHtml(c.commentMaxWords)}" min="5" max="80" step="1"></label>
          <label>Читать последних сообщений${num('commentMessages', c.commentMessages, 2, 20)}</label>
          <label>Каждые N событий${num('commentEvery', c.commentEvery, 1, 30)}</label>
          <label>Не чаще, чем раз в (мин)${num('commentGapMin', c.commentGapMin, 1, 240)}</label>
        </div>
        ${check('commentWaiting', 'Пока жду ответа: комментировать то, что только что написано', c.commentWaiting)}
        ${check('commentReply', 'После ответа: комментировать его', c.commentReply)}
        <p class="pud-hint">Предел длины Слива знает заранее и сама подбирает такую мысль, которая в него укладывается, так что фраза не обрывается. Чем длиннее реплика, тем шире облачко, но не шире предела. «Модель чата» не подходит, пока чат печатает ответ: лучше отдельный профиль подключения, он работает параллельно.</p>
        <div class="pud-peek-city"><button type="button" class="menu_button" data-act="comment-now">Прокомментировать сейчас</button><span class="pud-hint" data-comment-status></span></div>
      </div>
      <div class="pud-card pud-card-col">
        <b>О чём напоминать</b>
        ${kindList.map(kind => check(`kinds.${kind}`, KIND_LABELS[kind], c.kinds?.[kind] !== false)).join('')}
        <div class="pud-peek-fields">
          <label>Отдых после (мин сидения)${num('restAfterMin', c.restAfterMin, 10, 600)}</label>
          <label>Повторять отдых каждые (мин)${num('restAgainMin', c.restAgainMin, 10, 600)}</label>
          <label>Вода каждые (мин)${num('waterEveryMin', c.waterEveryMin, 15, 600)}</label>
          <label>Время еды<input type="text" data-path="meals" value="${escapeHtml(c.meals)}" placeholder="09:00, 13:30, 19:00"></label>
          <label>Напоминать про сон после<input type="text" data-path="bedtime" value="${escapeHtml(c.bedtime)}" placeholder="01:00 (пусто: не напоминать)"></label>
          <label>Тихие часы с<input type="text" data-path="quietFrom" value="${escapeHtml(c.quietFrom)}" placeholder="23:00"></label>
          <label>до<input type="text" data-path="quietTo" value="${escapeHtml(c.quietTo)}" placeholder="08:00"></label>
          <label>Часы<select data-path="tz"><option value="device">по этому устройству</option><option value="city">по часовому поясу города</option></select></label>
        </div>
        <div class="pud-hint" data-clock></div>
        <p class="pud-hint">Время считается по часам вашего устройства, поэтому у каждого человека своё и в девять утра никто не услышит «пора спать». Если вы за пределами родного часового пояса, выберите «по городу». Напоминания приходят, только пока вы что-то делаете в чате.</p>
      </div>
      <div class="pud-card pud-card-col">
        <b>Погода по городу</b>
        <p class="pud-hint">Название города уйдёт на open-meteo.com (бесплатный сервис погоды, ключ не нужен), чтобы найти место и узнать погоду. Больше ничего не отправляется. Город запоминается; если после обновления настройки сбросятся, Слива вернёт его из браузера и скажет об этом. Пустое поле: сеть не используется.</p>
        <div class="pud-peek-city"><input type="text" data-path="city" value="${escapeHtml(c.city)}" placeholder="Например: Казань"><button type="button" class="menu_button" data-act="find">Найти</button></div>
        <div class="pud-hint" data-status></div>
      </div>
      <div class="pud-card pud-card-col">
        <div class="pud-inforow"><b>Свои напоминания</b><button type="button" class="pud-info-dot" data-rhelp aria-expanded="${remHelp}" title="Пояснение" aria-label="Пояснение">?</button></div>
        <p class="pud-hint pud-info-note" data-rnote${remHelp ? '' : ' hidden'}>Слива напомнит вашими словами. «Каждый день в» принимает одно время или несколько через запятую (09:00, 21:30): напомнит один раз в день, когда вы в чате, в течение полутора часов после этого времени. «Каждые N минут» повторяет, пока вы сидите в чате. Время считается по часам из блока выше, тихие часы напоминания не пропускают.</p>
        ${(c.reminders ?? []).map(item => `<div class="pud-rem" data-rid="${escapeHtml(item.id)}">
          <label class="pud-opt pud-rem-on" title="Включено"><input type="checkbox" data-rf="on"${item.on ? ' checked' : ''} aria-label="Включено"></label>
          <input type="text" class="pud-rem-text" data-rf="text" maxlength="200" value="${escapeHtml(item.text)}" placeholder="Что напомнить, например: Выпить таблетки" aria-label="Текст напоминания">
          <button type="button" class="menu_button pud-rem-del" data-act="rem-del" title="Удалить напоминание" aria-label="Удалить">×</button>
          <div class="pud-rem-f"><span class="pud-rem-fl">Когда</span><select data-rf="mode"><option value="daily"${item.mode === 'daily' ? ' selected' : ''}>каждый день в</option><option value="every"${item.mode === 'every' ? ' selected' : ''}>каждые N минут</option></select></div>
          <div class="pud-rem-f">${item.mode === 'every'
    ? `<span class="pud-rem-fl">Минут</span><input type="number" data-rf="everyMin" min="5" max="1440" value="${item.everyMin}">`
    : `<span class="pud-rem-fl">Время</span><input type="text" data-rf="times" maxlength="80" value="${escapeHtml(item.times)}" placeholder="09:00, 21:30">`}</div>
          <div class="pud-rem-f"><span class="pud-rem-fl">Лицо</span><select data-rf="face">${Object.entries(FACE_NAMES).map(([key, label]) => `<option value="${key}"${item.face === key ? ' selected' : ''}>${label}</option>`).join('')}</select></div>
          <div class="pud-rem-f pud-rem-fe"><span class="pud-rem-fl">Значок</span><input type="text" data-rf="emoji" maxlength="8" value="${escapeHtml(item.emoji)}" aria-label="Значок в облачке"></div>
          <button type="button" class="menu_button pud-rem-test" data-act="rem-test" title="Показать это напоминание сейчас">Показать</button>
        </div>`).join('') || '<p class="pud-lib-empty">Своих напоминаний пока нет.</p>'}
        <div class="pud-peek-city"><button type="button" class="menu_button" data-act="rem-add"${(c.reminders ?? []).length >= 20 ? ' disabled' : ''}>Добавить напоминание</button></div>
      </div>
      <div class="pud-card pud-card-col">
        <b>Посмотреть, как выглядит</b>
        <div class="pud-peek-previews">${Object.entries(PEEK_KINDS).map(([kind, item]) => `<button type="button" class="menu_button" data-preview="${kind}">${item.emoji} ${escapeHtml(item.title)}</button>`).join('')}</div>
      </div>
      <details class="pud-card pud-card-col">
        <summary><b>Свои фразы для напоминаний</b></summary>
        <p class="pud-hint">По одной фразе в строке. Они добавляются к встроенным, и Слива выбирает случайную. В фразах про погоду можно написать {t}: подставится температура.</p>
        ${Object.entries(PEEK_KINDS).map(([kind, item]) => `<label class="pud-peek-own">${escapeHtml(item.title)}<textarea rows="2" data-phrase="${kind}" placeholder="свои фразы">${escapeHtml(own(kind))}</textarea></label>`).join('')}
      </details>`;
    for (const key of ['side', 'tz', 'commentProfile']) {
      const select = pane.querySelector(`[data-path="${key}"]`);
      if (select) select.value = c[key] ?? '';
    }
    paintStatus();
  }

  const setPath = (obj, path, value) => {
    const keys = path.split('.');
    const last = keys.pop();
    let target = obj;
    for (const key of keys) target = target[key] ??= {};
    target[last] = value;
  };
  /** Поле своего напоминания: пишем в настройки; перерисовка только там, где меняется вид строки. */
  const onRemField = event => {
    const field = event.target;
    const row = field.closest?.('[data-rid]');
    const key = field.dataset?.rf;
    if (!row || !key) return false;
    const value = field.type === 'checkbox' ? field.checked : field.value;
    cfg().reminders = normalizeReminders(cfg().reminders.map(item => (item.id === row.dataset.rid ? { ...item, [key]: value } : item)));
    persist();
    if (event.type === 'change' && (key === 'mode' || key === 'face')) render();
    return true;
  };
  const onInput = event => { if (event.target.matches?.('[data-rf]') && event.target.type !== 'checkbox' && event.target.tagName !== 'SELECT') onRemField(event); };
  const onChange = event => {
    if (onRemField(event)) return;
    const field = event.target;
    const c = cfg();
    if (field.dataset?.phrase) {
      c.phrases = { ...c.phrases, [field.dataset.phrase]: field.value.split('\n').map(line => line.trim()).filter(Boolean) };
      persist();
      return;
    }
    const path = field.dataset?.path;
    if (!path) return;
    let value;
    if (field.type === 'checkbox') value = field.checked;
    else if (field.type === 'number') value = clamp(Number(field.value) || Number(field.min) || 0, Number(field.min), Number(field.max));
    else value = field.value.trim();
    setPath(c, path, value);
    if (path === 'city') { c.place = null; weather = null; weatherError = ''; writeMirror(); }
    persist();
    applyLook();
    paintStatus();
    if (path === 'enabled' && !value) hide();
  };
  const onPaneClick = async event => {
    if (event.target.closest?.('[data-rhelp]')) {
      remHelp = !remHelp;
      const note = pane.querySelector('[data-rnote]');
      if (note) note.hidden = !remHelp;
      event.target.closest('[data-rhelp]').setAttribute('aria-expanded', String(remHelp));
      return;
    }
    if (event.target.closest?.('[data-act="rem-add"]')) { cfg().reminders = normalizeReminders([...cfg().reminders, newReminder()]); persist(); render(); return; }
    const remRow = event.target.closest?.('[data-rid]');
    if (remRow && event.target.closest('[data-act="rem-del"]')) { cfg().reminders = cfg().reminders.filter(item => item.id !== remRow.dataset.rid); persist(); render(); return; }
    if (remRow && event.target.closest('[data-act="rem-test"]')) {
      const item = cfg().reminders.find(found => found.id === remRow.dataset.rid);
      if (item) show({ text: item.text.trim() || 'Тут будет ваше напоминание.', face: item.face, emoji: item.emoji });
      return;
    }
    const preview = event.target.closest?.('[data-preview]')?.dataset.preview;
    if (preview) {
      const temp = Math.round(weather?.feels ?? weather?.temp ?? -5);
      show({ kind: preview, temp });
      return;
    }
    if (event.target.closest?.('[data-act="comment-now"]')) { await comment({ force: true }); return; }
    if (!event.target.closest?.('[data-act="find"]')) return;
    const c = cfg();
    const status = pane.querySelector('[data-status]');
    const input = pane.querySelector('[data-path="city"]');
    c.city = (input?.value ?? c.city).trim();
    if (!c.city) { c.place = null; weather = null; persist(); writeMirror(); paintStatus(); return; }
    if (status) status.textContent = 'Ищу…';
    try {
      const place = await findPlace(c.city, undefined, view);
      if (!place) { c.place = null; weather = null; persist(); if (status) status.textContent = 'Такого города не нашлось. Попробуйте написать по-другому.'; return; }
      c.place = place;
      persist();
      writeMirror();
      weather = null;
      await refreshWeather(true);
      paintStatus();
    } catch (error) {
      report('Слива: поиск города', error);
      if (status) status.textContent = 'Не удалось связаться с Open-Meteo. Проверьте интернет.';
    }
  };
  pane?.addEventListener('change', onChange);
  pane?.addEventListener('input', onInput);
  pane?.addEventListener('click', onPaneClick);
  render();
  const paneObserver = pane ? new view.MutationObserver(() => { if (!pane.hidden) render(); }) : null;
  paneObserver?.observe(pane, { attributes: true, attributeFilter: ['hidden'] });
  applyLook();

  // ───────── город после запуска: вернуть из браузера, если настройки сбросились, или подсказать
  const c0 = cfg();
  if (!c0.city) {
    const mirror = readMirror();
    if (mirror) {
      c0.city = mirror.city;
      c0.place = mirror.place ?? null;
      persist();
      timers.push(view.setTimeout(() => show({ face: 'normal', emoji: '🏙️', text: `После обновления настройки сбросились, но город «${mirror.city}» я помню.` }), 8000));
    } else if (!c0.cityHintShown) {
      timers.push(view.setTimeout(() => {
        cfg().cityHintShown = true;
        persist();
        show({ face: 'wink', emoji: '🏙️', text: 'Впиши свой город во вкладке «Слива», и я буду говорить про погоду.' });
      }, 20000));
    }
  }
  refreshWeather(true);

  shared.peek = { show, hide, preview: kind => show({ kind }), comment };

  return () => {
    view.clearInterval(timer);
    for (const id of timers) view.clearTimeout(id);
    clearHold();
    for (const [type, fn] of listeners) events?.removeListener?.(type, fn);
    textarea?.removeEventListener('input', onTyping);
    doc.removeEventListener('pointerdown', onDocDown, true);
    paneObserver?.disconnect();
    pane?.removeEventListener('change', onChange);
    pane?.removeEventListener('click', onPaneClick);
    delete shared.peek;
    tab?.remove?.();
    root.remove();
  };
}
