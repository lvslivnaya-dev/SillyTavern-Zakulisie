import { button, characterId, characterName, element } from '../helpers.js';
import { EVENT_KINDS, INTENSITIES, MONTHS, clockOf, comingEvents, eventsWithQuests, upcoming } from '../../core/calendar.js';
import { createCalendarBuilder } from './calendar-builder.js';
import { WEATHER_KINDS, WEATHER_KIND_IDS, WEATHER_PARTS_MAX, WEATHER_TEMPLATES } from '../../core/weather.js';
import { dayOfDate, weatherOnDate } from '../../core/weather-days.js';

/**
 * «Календарь» (Мир → Календарь): the story's dates, a month grid, events of a day,
 * the event editor, templates and the generator. Every change goes through
 * the handlers in index.js (calendarCallbacks).
 */
export function createCalendarPages(ctx) {
  const act = (...args) => ctx.act(...args);
  const render = (...args) => ctx.render(...args);
  const setStatus = (...args) => ctx.setStatus(...args);
  const invoke = (name, payload = {}) => ctx.facade.invoke(name, payload);
  const snapshot = () => ctx.snapshot;

  let month = ''; // 'YYYY-MM' on screen
  let selected = ''; // 'YYYY-MM-DD'
  let draft = null; // the event in the editor
  let generated = null; // { name, startMonth, events } from the generator
  let picked = new Set(); // generated events to take
  let wish = '';
  let busy = false;
  let wx = { kind: '', temp: '', text: '', to: '' }; // the weather being set for the selected day (and up to `to`)
  let showWeather = true;
  // The planner under the month: the days, up to three stretches of weather in a day, the generator.
  let wp = { from: '', to: '', parts: [{ from: '00:00', kind: '', temp: '', text: '' }], wish: '', generated: null, generatedStart: 0, busy: false };
  let genMode = 'year'; // the generator window: 'year' of a life, or only 'holidays'
  let hol = { international: true, place: '', placeOn: false, fandom: '', fandomOn: false };

  const calendar = () => snapshot().calendar ?? { anchor: '', events: [] };
  const today = () => snapshot().calendarToday || '';
  const characters = () => snapshot().characters ?? [];
  const nameOf = id => characterName(characters().find(item => characterId(item) === id), id);
  const yearDrafts = new Map();
  const thisYear = () => Number((today() || calendar().anchor || new Date().toISOString()).slice(0, 4));
  /** The rules of dates of this chat's calendar (earthly or its own). */
  const cal = () => clockOf(calendar());
  const humanDate = (iso, options) => cal().humanDate(iso, options);
  const addDays = (iso, days) => cal().addDays(iso, days);
  const weekdayOf = iso => cal().weekdayOf(iso);
  const parseDate = iso => (cal().valid(iso) ? cal().parse(iso) : null);

  /**
   * A date field: the browser's date picker for the earthly calendar; day, month and year for your own
   * (the browser does not know its months). The returned node has `.value` like an input: 'Y-MM-DD' or ''.
   */
  function dateInput(value, attrs = {}) {
    const clock = cal();
    if (!clock.custom) return element('input', { type: 'date', value: value ?? '', ...attrs });
    const wrapper = element('div', { className: 'ku-cal-date', role: 'group', 'aria-label': attrs['aria-label'] ?? 'Дата' });
    const [y, m, d] = /^\d+-\d+-\d+$/.test(value ?? '') ? value.split('-').map(Number) : [0, 0, 0];
    const day = element('input', { type: 'number', min: 1, max: 99, value: d || '', placeholder: 'день', className: 'ku-short', 'aria-label': 'День месяца' });
    const monthSelect = element('select', { 'aria-label': 'Месяц' }, [element('option', { value: '', text: 'месяц', selected: !m }), ...clock.monthNames.map((name, index) => element('option', { value: index + 1, text: name, selected: m === index + 1 }))]);
    const year = element('input', { type: 'number', min: 1, max: 9999, value: y || '', placeholder: 'год', className: 'ku-short', 'aria-label': 'Год' });
    wrapper.append(day, monthSelect, year);
    Object.defineProperty(wrapper, 'value', {
      get: () => (day.value && monthSelect.value && year.value ? `${String(year.value).padStart(4, '0')}-${String(monthSelect.value).padStart(2, '0')}-${String(day.value).padStart(2, '0')}` : ''),
      set: () => {},
    });
    return wrapper;
  }
  /** Same for events: the editor's draft keeps the text of the field. */
  function dateField(event, key, attrs = {}) {
    const node = dateInput(event[key], attrs);
    node.addEventListener('input', () => { event[key] = node.value; });
    node.addEventListener('change', () => { event[key] = node.value; });
    return node;
  }

  /** What the weather needs from the snapshot: the clock and the set weather (today only), the plan, the climates and the calendar. */
  const weatherCtx = () => ({ world: { clock: snapshot().world?.clock, weather: snapshot().weatherSet }, plan: snapshot().weatherPlan, climates: snapshot().weatherClimates ?? [], calendar: calendar() });
  const tempText = value => (value == null ? '' : `${value > 0 ? '+' : ''}${value}°`);

  async function attempt(run, done) {
    try { const result = await run(); if (done) setStatus(typeof done === 'function' ? done(result) : done); return result; }
    catch (error) { setStatus(error?.message || String(error), true); return undefined; }
  }

  function blankEvent(date) {
    return { title: '', note: '', date, endDate: '', time: '', repeat: 'none', weekdays: [weekdayOf(date) || 1], until: '', who: [], kind: '', intensity: 2, ahead: 0 };
  }

  // ---- «Сегодня в истории» --------------------------------------------------
  function renderToday() {
    const day = snapshot().world?.clock?.day ?? 0;
    const input = dateInput(today(), { 'aria-label': 'Какая сегодня дата в истории' });
    // Time and weekday go with the date into «Сейчас»: the weekday follows from the date, the time is asked.
    const time = element('input', { type: 'text', value: snapshot().world?.clock?.time || '', className: 'ku-short', 'aria-label': 'Время в истории', placeholder: 'ЧЧ:ММ' });
    const weekday = element('span', { className: 'muted ku-small' });
    const showWeekday = () => {
      const found = input.value && cal().valid(input.value) ? cal().humanDate(input.value) : '';
      weekday.textContent = found ? `${found}: это и день недели, и подпись в «Сейчас»` : '';
    };
    input.addEventListener('input', showWeekday);
    input.addEventListener('change', showWeekday);
    showWeekday();
    const save = button('Запомнить', 'btn small primary', () => attempt(() => act('onCalendarSetToday', { date: input.value, time: time.value }, 'calendar-today'), 'Дата и время записаны в «Сейчас»'));
    const text = today()
      ? `Сегодня в истории: ${humanDate(today())}${day ? ` (день ${day})` : ''}. Дальше даты идут сами, вслед за днями истории.`
      : day ? `Сейчас день ${day} истории, но его дата не задана. Укажите её — и у каждого дня появится настоящая дата.`
        : 'Летописец ещё не знает, какой сегодня день истории. Укажите дату: это будет день 1.';
    return element('div', { className: 'card' }, [
      element('h3', { text: 'Дата истории' }),
      element('p', { className: 'muted ku-small', style: { margin: '0 0 8px' }, text }),
      element('div', { className: 'row' }, [input, time, save]),
      weekday,
    ]);
  }

  // ---- Month grid -------------------------------------------------------------
  function renderMonth() {
    const clock = cal();
    const N = clock.monthsCount;
    const W = clock.weekdayCount;
    const pad = (year, monthNumber) => `${String(year).padStart(4, '0')}-${String(monthNumber).padStart(2, '0')}`;
    const fallback = clock.custom ? '0001-01-01' : new Date().toISOString().slice(0, 10);
    const known = value => (clock.valid(value) ? value : '');
    const base = month || (known(selected) || known(today()) || fallback).slice(0, 7);
    month = base;
    const first = `${base}-01`;
    const [year, monthNumber] = base.split('-').map(Number);
    const offset = clock.weekdayOf(first) - 1;
    const start = clock.addDays(first, -offset);
    const length = clock.daysInMonth(year, monthNumber);
    const rows = clock.custom ? Math.ceil((offset + length) / W) : 6;
    // The month and the year are turned apart: the month arrows go round the months of the same year, the year has its own arrows and a list.
    const goMonth = number => { month = pad(year, ((number - 1 + N) % N) + 1); render(); };
    const goYear = value => { month = pad(Math.max(1, Math.min(9999, Math.round(Number(value)) || year)), monthNumber); render(); };
    const monthPick = element('select', { 'aria-label': 'Месяц', className: 'ku-cal-pick' }, Array.from({ length: N }, (_, index) => element('option', { value: String(index + 1), text: clock.monthNames[index] ?? String(index + 1), selected: index + 1 === monthNumber })));
    monthPick.addEventListener('change', () => goMonth(Number(monthPick.value)));
    const from = Math.max(1, year - 30);
    const yearPick = element('select', { 'aria-label': 'Год', className: 'ku-cal-pick' }, Array.from({ length: Math.min(9999, year + 30) - from + 1 }, (_, index) => from + index).map(value => element('option', { value: String(value), text: String(value), selected: value === year })));
    yearPick.addEventListener('change', () => goYear(yearPick.value));
    const grid = element('div', { className: 'ku-cal-grid', role: 'grid', style: { gridTemplateColumns: `repeat(${W}, minmax(0, 1fr))` } });
    for (const label of clock.weekdayShort) grid.append(element('span', { className: 'ku-cal-head', text: label }));
    for (let index = 0; index < rows * W; index += 1) {
      const iso = start ? clock.addDays(start, index) : '';
      if (!iso) { grid.append(element('span', { className: 'ku-cal-cell other', 'aria-hidden': 'true' })); continue; }
      const items = eventsWithQuests(calendar(), iso, snapshot().quests);
      let weather = null;
      if (showWeather) { try { weather = weatherOnDate(weatherCtx(), iso); } catch { weather = null; } }
      const kindInfo = weather ? WEATHER_KINDS[weather.kind] : null;
      const weatherTitle = kindInfo ? `\nПогода: ${kindInfo.label.toLowerCase()}${weather.temp != null ? `, ${tempText(weather.temp)}` : ''}${weather.manual ? ' (вручную)' : ''}` : '';
      const cell = element('button', {
        type: 'button',
        className: ['ku-cal-cell', iso.slice(0, 7) !== base ? 'other' : '', iso === today() ? 'today' : '', iso === selected ? 'on' : '', items.some(item => item.must) ? 'must' : ''].filter(Boolean).join(' '),
        'aria-label': `${humanDate(iso)}${items.length ? `: ${items.map(item => item.title).join(', ')}` : ''}${weatherTitle.replace('\n', '. ')}`,
        title: (items.map(item => `${item.time ? `${item.time} ` : ''}${item.title}`).join('\n') || humanDate(iso)) + weatherTitle,
      }, [
        element('span', { className: 'ku-cal-top' }, [
          element('span', { className: 'ku-cal-num', text: String(Number(iso.slice(8))) }),
          ...(kindInfo ? [element('span', { className: `ku-cal-wx ${weather.manual ? 'hand' : weather.source}` }, [element('span', { text: kindInfo.icon }), element('span', { className: 'ku-cal-wx-t', text: tempText(weather.temp) })])] : []),
        ]),
        ...items.slice(0, 2).map(item => element('span', { className: `ku-cal-dot${item.must ? ' must' : ''}`, text: item.title })),
        ...(items.length > 2 ? [element('span', { className: 'ku-cal-more', text: `+${items.length - 2}` })] : []),
      ]);
      cell.addEventListener('click', () => { selected = iso; draft = null; wp.from = iso; wp.to = ''; wp.generated = null; render(); });
      grid.append(cell);
    }
    const season = clock.custom ? clock.seasonOf(monthNumber) : null;
    return element('div', { className: 'card' }, [
      element('div', { className: 'ku-row' }, [
        button('‹', 'btn small', () => goMonth(monthNumber - 1), 'Предыдущий месяц (год не меняется)'),
        monthPick,
        button('›', 'btn small', () => goMonth(monthNumber + 1), 'Следующий месяц (год не меняется)'),
        element('span', { className: 'ku-cal-sep', 'aria-hidden': 'true' }),
        button('‹', 'btn small', () => goYear(year - 1), 'Предыдущий год'),
        yearPick,
        button('›', 'btn small', () => goYear(year + 1), 'Следующий год'),
        ...(clock.custom && clock.system.era ? [element('span', { className: 'muted ku-small', text: clock.system.era })] : []),
        ...(season ? [element('span', { className: 'muted ku-small', text: season.name })] : []),
        element('span', { className: 'ku-push' }),
        button(showWeather ? '☀ Погода: видна' : '☀ Погода: скрыта', `btn small${showWeather ? ' primary' : ''}`, () => { showWeather = !showWeather; render(); }, 'Показывать погоду в клетках месяца'),
        ...(today() ? [button('К сегодняшнему', 'btn small', () => { month = today().slice(0, 7); selected = today(); render(); })] : []),
      ]),
      grid,
    ]);
  }

  // ---- A day: its events and the editor ---------------------------------------
  function describe(event) {
    const parts = [];
    if (event.repeat === 'weekly') parts.push(`по ${(event.weekdays ?? []).map(day => cal().weekdayShort[day - 1]).join(', ')}`);
    if (event.repeat === 'daily') parts.push('каждый день');
    if (event.repeat === 'yearly') parts.push('каждый год');
    if (event.endDate) parts.push(`${humanDate(event.date, { weekday: false })} – ${humanDate(event.endDate, { weekday: false })}`);
    if (event.until) parts.push(`до ${humanDate(event.until, { weekday: false })}`);
    if (event.who?.length) parts.push(event.who.map(nameOf).join(', '));
    if (event.ahead) parts.push(`знают за ${event.ahead} дн.`);
    return parts.join(' · ');
  }

  function eventRow(event) {
    return element('div', { className: `ku-cal-event${event.must ? ' must' : ''}` }, [
      element('div', { className: 'ku-cal-event-text' }, [
        element('strong', { text: `${event.time ? `${event.time} · ` : ''}${event.title}` }),
        element('span', { className: `ku-tag${event.must ? ' on' : ''}`, text: `${event.kind ? EVENT_KINDS[event.kind] : 'Событие'} · ${INTENSITIES[event.intensity ?? 1]}`, title: 'Что за день и какой у него вес: историю он трогает всегда, вес говорит, насколько громко' }),
        ...(describe(event) ? [element('span', { className: 'muted ku-small', text: describe(event) })] : []),
        ...(event.note ? [element('span', { className: 'ku-small', text: event.note })] : []),
      ]),
      ...(event.fromQuest
        ? [button('К квестам', 'btn small', () => ctx.setTab?.('quests'), 'Срок записан у квеста: менять его нужно там')]
        : event.fromCard
          ? [button('К карточке', 'btn small', () => ctx.setTab?.('cards'), 'День рождения записан в карточке (графа «🎂»): менять его нужно там')]
          : [
          button('Изменить', 'btn small', () => { draft = { ...blankEvent(event.date), ...event }; render(); }),
          button('×', 'btn icon small', () => attempt(() => act('onCalendarRemoveEvent', { id: event.id }, 'calendar-remove'), 'Событие удалено'), 'Удалить событие'),
        ]),
    ]);
  }

  function renderDay() {
    if (!selected) return element('p', { className: 'muted', text: 'Выберите день в календаре, чтобы увидеть и добавить его события.' });
    const items = eventsWithQuests(calendar(), selected, snapshot().quests);
    const card = element('div', { className: 'card' }, [
      element('div', { className: 'ku-row' }, [
        element('h3', { text: humanDate(selected), style: { margin: '0' } }),
        element('span', { className: 'ku-push' }),
        button('+ Событие', 'btn small primary', () => { draft = blankEvent(selected); render(); }),
      ]),
    ]);
    if (!items.length) card.append(element('p', { className: 'muted ku-small', text: 'В этот день ничего не записано.' }));
    for (const event of items) card.append(eventRow(event));
    if (draft) card.append(renderEditor());
    card.append(renderDayWeather());
    return card;
  }

  // ---- The weather of the day, or of a stretch of days -----------------------------------------
  const WX_SOURCE = { lock: 'держится вручную', set: 'выбрана', scenario: 'заготовка', forecast: 'по прогнозу климата' };

  function renderDayWeather() {
    const box = element('div', { className: 'ku-cal-wxbox' }, [element('p', { className: 'section-title', style: { margin: '14px 0 6px' }, text: 'Погода' })]);
    const start = dayOfDate(calendar(), selected);
    if (!start) {
      box.append(element('p', { className: 'muted ku-small', text: calendar().anchor ? 'Этот день раньше начала истории: погоды у него нет.' : 'Чтобы ставить погоду по датам, укажите дату истории (карточка «Дата истории» вверху): от неё считаются дни.' }));
      return box;
    }
    let found = null;
    try { found = weatherOnDate(weatherCtx(), selected); } catch { found = null; }
    const info = found ? WEATHER_KINDS[found.kind] : null;
    box.append(element('p', { className: 'ku-small', style: { margin: '0 0 6px' }, text: info
      ? `${info.icon} ${info.label}${found.temp != null ? `, ${tempText(found.temp)}` : ''} · ${found.manual ? 'вручную' : (WX_SOURCE[found.source] ?? '')}${found.scenario && !found.manual ? ` «${found.scenario}»` : ''}${found.text ? ` · ${found.text}` : ''}`
      : 'Погоды на этот день нет: выберите климат (вкладка «Погода») или поставьте её вручную.' }));
    const scenario = (snapshot().weatherPlan?.scenarios ?? []).find(item => start >= item.startDay && start < item.startDay + item.days);
    if (scenario?.parts?.length) box.append(element('p', { className: 'muted ku-small', style: { margin: '0 0 6px' }, text: `В течение дня: ${scenario.parts.map(part => `с ${part.from} ${WEATHER_KINDS[part.kind].icon}${part.temp != null ? ` ${tempText(part.temp)}` : ''}`).join(' · ')}` }));
    if (!wx.kind) wx.kind = '';
    const kinds = element('div', { className: 'ku-wx-kinds', role: 'group', 'aria-label': 'Какая погода' }, WEATHER_KIND_IDS.map(id => {
      const node = button('', `btn small ku-wx-kind${wx.kind === id ? ' primary' : ''}`, () => { wx.kind = wx.kind === id ? '' : id; render(); });
      node.append(element('span', { className: 'ku-wx-icon', text: WEATHER_KINDS[id].icon }), element('span', { text: WEATHER_KINDS[id].label }));
      node.setAttribute('aria-pressed', String(wx.kind === id));
      return node;
    }));
    const temp = element('input', { type: 'number', min: -60, max: 60, className: 'ku-short', value: wx.temp, placeholder: '°C', 'aria-label': 'Температура, градусы' });
    temp.addEventListener('input', () => { wx.temp = temp.value; });
    const text = element('input', { value: wx.text, placeholder: 'Как выглядит: моросит, лужи', 'aria-label': 'Как выглядит погода' });
    text.addEventListener('input', () => { wx.text = text.value; });
    const to = dateField(wx, 'to', { 'aria-label': 'По какое число (если несколько дней)' });
    const W = cal().weekdayCount;
    const quick = element('div', { className: 'ku-row ku-cal-quick' }, [element('span', { className: 'muted ku-small', text: 'Сколько дней:' }),
      ...[[1, 'этот день'], [3, '3 дня'], [W, 'неделя'], [W * 2, '2 недели'], [30, '30 дней']].map(([count, label]) => button(label, `btn small${(count === 1 && !wx.to) || (count > 1 && wx.to && wx.to === addDays(selected, count - 1)) ? ' primary' : ''}`, () => { wx.to = count === 1 ? '' : addDays(selected, count - 1); render(); }))]);
    const run = (work, done) => attempt(async () => {
      const endIso = wx.to && wx.to > selected ? wx.to : selected;
      const last = dayOfDate(calendar(), endIso);
      if (!last || last < start) throw new Error('Не получилось посчитать, до какого дня.');
      await work(start, last - start + 1);
      wx = { kind: '', temp: '', text: '', to: '' };
      render();
    }, done);
    box.append(
      kinds,
      element('div', { className: 'ku-wx-fields' }, [temp, text]),
      quick,
      element('div', { className: 'ku-cal-field' }, [element('span', { text: 'По какое число (пусто — только этот день)' }), to]),
      element('div', { className: 'row', style: { marginTop: '8px' } }, [
        button('Поставить погоду', 'btn primary small', () => run((first, days) => act('onWeatherPaint', { startDay: first, days, kind: wx.kind || found?.kind || '', temp: wx.temp, text: wx.text }, 'weather-paint'), 'Погода поставлена')),
        button('Вернуть прогнозу', 'btn small', () => run((first, days) => act('onWeatherClear', { startDay: first, days }, 'weather-clear'), 'Эти дни снова считаются по прогнозу')),
      ]),
      element('p', { className: 'muted ku-small', style: { margin: '6px 0 0' }, text: 'Ручная погода сильнее климата и заготовок. Всё, что напишет история в ответах, сильнее неё в день, когда оно написано.' }),
    );
    return box;
  }

  function renderEditor() {
    const event = draft;
    const field = (label, control, hint) => element('label', { className: 'ku-cal-field' }, [element('span', { text: label }), control, ...(hint ? [element('small', { className: 'muted', text: hint })] : [])]);
    const input = (key, attrs = {}) => {
      const node = element('input', { value: event[key] ?? '', ...attrs });
      node.addEventListener('input', () => { event[key] = node.value; });
      return node;
    };
    const note = element('textarea', { value: event.note ?? '', rows: 2, placeholder: 'Подробности для модели: что проверяют, где, кто строгий, что взять с собой' });
    note.addEventListener('input', () => { event.note = note.value; });
    const repeat = element('select', {}, [['none', 'Один раз / отрезок'], ['weekly', 'По дням недели'], ['daily', 'Каждый день'], ['yearly', 'Каждый год']]
      .map(([value, text]) => element('option', { value, text, selected: event.repeat === value })));
    repeat.addEventListener('change', () => { event.repeat = repeat.value; render(); });
    const weekdays = element('div', { className: 'ku-cal-weekdays' }, cal().weekdayShort.map((label, index) => {
      const box = element('input', { type: 'checkbox', checked: (event.weekdays ?? []).includes(index + 1) });
      box.addEventListener('change', () => {
        const set = new Set(event.weekdays ?? []);
        if (box.checked) set.add(index + 1); else set.delete(index + 1);
        event.weekdays = [...set].sort();
      });
      return element('label', {}, [box, label]);
    }));
    const who = element('div', { className: 'ku-knowers' }, characters().map(character => {
      const id = characterId(character);
      const on = (event.who ?? []).includes(id);
      const chip = button(characterName(character), `ku-chip ku-knower${on ? ' seen' : ''}`, () => {
        event.who = on ? event.who.filter(item => item !== id) : [...(event.who ?? []), id];
        render();
      });
      chip.setAttribute('aria-pressed', String(on));
      return chip;
    }));
    const kind = element('select', { 'aria-label': 'Вид события' }, [['', 'Обычное событие'], ...Object.entries(EVENT_KINDS)].map(([value, text]) => element('option', { value, text, selected: (event.kind ?? '') === value })));
    kind.addEventListener('change', () => { event.kind = kind.value; });
    const intensity = element('select', { 'aria-label': 'Вес события' }, Object.entries(INTENSITIES).map(([value, text]) => element('option', { value, text: `${value} · ${text}`, selected: Number(event.intensity ?? 2) === Number(value) })));
    intensity.addEventListener('change', () => { event.intensity = Number(intensity.value); });
    const ahead = element('input', { type: 'number', min: 0, max: 14, value: event.ahead ?? 0, className: 'ku-short' });
    ahead.addEventListener('input', () => { event.ahead = Number(ahead.value) || 0; });
    return element('div', { className: 'ku-cal-editor' }, [
      field('Что', input('title', { placeholder: 'Контрольная по анатомии', maxlength: 120 })),
      field('Подробности', note),
      element('div', { className: 'ku-cal-fields' }, [
        field('Дата', dateField(event, 'date')),
        field('По какое (если несколько дней)', dateField(event, 'endDate')),
        field('Время', input('time', { type: 'time' })),
      ]),
      element('div', { className: 'ku-cal-fields' }, [
        field('Повтор', repeat),
        ...(event.repeat !== 'none' ? [field('До какого числа', dateField(event, 'until'), 'пусто — без конца')] : []),
      ]),
      ...(event.repeat === 'weekly' ? [weekdays] : []),
      field('Кого касается', who, 'никто не выбран — события мира, для всех'),
      element('div', { className: 'ku-cal-fields' }, [
        field('Вид', kind, 'Праздник, день рождения, квест (обязательное дело) или сентиментальный день (важный для кого-то из героев)'),
        field('Вес', intensity, 'Модель реагирует на событие всегда; вес говорит, насколько громко: слабо — мимоходом, сильно — вокруг этого строится день'),
      ]),
      field('За сколько дней персонажи уже знают о нём', ahead, '0 — узнают в сам день; 7 — неделю готовятся к экзамену'),
      element('div', { className: 'row' }, [
        button('Сохранить', 'btn primary', () => attempt(async () => {
          await act('onCalendarSaveEvent', { event: { ...event, weekdays: event.weekdays } }, 'calendar-save');
          selected = event.date || selected;
          draft = null;
          render();
        }, 'Событие сохранено')),
        button('Отмена', 'btn', () => { draft = null; render(); }),
      ]),
    ]);
  }

  // ---- What is coming ----------------------------------------------------------
  function renderSoon() {
    if (!today()) return null;
    const list = comingEvents(calendar(), today(), snapshot().quests);
    const known = new Set(upcoming(calendar(), today()).map(item => item.event.id));
    return element('div', { className: 'card' }, [
      element('h3', { text: 'Ближайшие две недели' }),
      ...(list.length ? list.slice(0, 30).map(({ event, date, inDays }) => element('div', { className: 'ku-fact' }, [
        element('span', { className: 'ku-fact-text' }, [
          element('strong', { text: inDays === 0 ? 'сегодня' : inDays === 1 ? 'завтра' : humanDate(date, { year: false }) }),
          ` · ${event.time ? `${event.time} ` : ''}${event.title}`,
          ...(inDays > 0 && known.has(event.id) ? [element('span', { className: 'muted', text: ' · модель знает, что скоро' })] : []),
          ...(inDays === 0 ? [element('span', { className: 'muted', text: event.must ? ' · модель введёт сегодня' : ' · фон дня' })] : []),
        ]),
      ])) : [element('p', { className: 'muted ku-small', text: 'Ничего не запланировано.' })]),
    ]);
  }

  // ---- Templates and the generator -----------------------------------------------
  const CUSTOM_NOTE = 'Шаблоны и генератор года сделаны для земного календаря. У календаря этого чата свои месяцы, события добавляйте на нужные дни вручную. Повторы («каждый год», «по дням недели») работают.';

  // ---- The generator: opens from a small button; a year of a life, or only holidays ----------
  function renderGenerator() {
    if (cal().custom) return element('div', { className: 'ku-cal-modal-body' }, [element('p', { className: 'muted ku-small', text: CUSTOM_NOTE })]);
    const card = element('div', { className: 'ku-cal-modal-body' });
    const yearInput = element('input', { type: 'number', min: 1, max: 9999, value: thisYear(), className: 'ku-short', 'aria-label': 'Год, с которого начинается шаблон' });
    const modes = element('div', { className: 'ku-row' }, [['year', 'Год жизни'], ['holidays', 'Только праздники']].map(([id, label]) => {
      const node = button(label, `btn small${genMode === id ? ' primary' : ''}`, () => { if (genMode !== id) { genMode = id; generated = null; render(); } });
      node.setAttribute('aria-pressed', String(genMode === id));
      return node;
    }));
    card.append(modes);
    if (genMode === 'holidays') {
      const check = (label, key, hint) => {
        const box = element('input', { type: 'checkbox', checked: hol[key] });
        box.addEventListener('change', () => { hol[key] = box.checked; render(); });
        return element('label', { className: 'ku-cal-check', title: hint }, [box, element('span', { text: label })]);
      };
      const field = (key, placeholder, label) => {
        const input = element('input', { value: hol[key], placeholder, 'aria-label': label });
        input.addEventListener('input', () => { hol[key] = input.value; });
        return input;
      };
      const generateHolidays = button(busy ? 'Ищу праздники…' : 'Найти праздники', 'btn primary', () => attempt(async () => {
        if (hol.placeOn && !hol.place.trim()) throw new Error('Впишите город или страну.');
        if (hol.fandomOn && !hol.fandom.trim()) throw new Error('Впишите фандом: без него праздники вселенной не найти.');
        busy = true; render();
        try {
          generated = await invoke('onCalendarGenerateHolidays', { international: hol.international, place: hol.placeOn ? hol.place : '', fandom: hol.fandomOn ? hol.fandom : '' });
          generated.holidays = true;
          picked = new Set(generated.events.map((_, index) => index));
        } finally { busy = false; render(); }
      }, () => (generated ? `Праздников: ${generated.events.length}. Отметьте нужные и добавьте в календарь.` : '')));
      generateHolidays.disabled = busy;
      card.append(
        element('p', { className: 'muted ku-small', style: { margin: '0 0 6px' }, text: 'Только праздники и памятные даты, без учёбы, дел и событий жизни. Отметьте, какие нужны.' }),
        check('Международные праздники', 'international', 'Новый год, Рождество, 8 марта, Хэллоуин и подобные'),
        check('Праздники города или страны', 'placeOn', 'Государственные и местные праздники места'),
        ...(hol.placeOn ? [field('place', 'Например: Токио, или Санкт-Петербург', 'Город или страна')] : []),
        check('Праздники вселенной фандома', 'fandomOn', 'Только каноничные даты и внутримировые праздники'),
        ...(hol.fandomOn ? [field('fandom', 'Какой фандом: например, Магическая битва', 'Фандом')] : []),
        element('div', { className: 'row', style: { marginTop: '6px' } }, [generateHolidays]),
      );
    } else {
      const description = element('textarea', { rows: 2, value: wish, placeholder: 'Для кого год. Например: студентка 3 курса ветеринарного факультета Токийского университета, подрабатывает в кафе' });
      description.addEventListener('input', () => { wish = description.value; });
      const generate = button(busy ? 'Планирую год…' : 'Сгенерируй', 'btn primary', () => attempt(async () => {
        busy = true; render();
        try {
          generated = await invoke('onCalendarGenerate', { description: wish });
          picked = new Set(generated.events.map((_, index) => index));
        } finally { busy = false; render(); }
      }, () => (generated ? `Событий: ${generated.events.length}. Отметьте нужные и добавьте в календарь или сохраните шаблоном.` : '')));
      generate.disabled = busy;
      card.append(
        element('p', { className: 'muted ku-small', style: { margin: '0 0 6px' }, text: 'Модель планирует год по реальному календарю места: учебный год, сессии, практики, праздники, фестивали. Сначала вы смотрите список, потом решаете, что взять.' }),
        description,
        element('div', { className: 'row', style: { marginTop: '6px' } }, [generate]),
      );
    }
    if (generated) {
      const name = element('input', { value: generated.name, 'aria-label': 'Название шаблона' });
      const rows = element('div', { className: 'ku-cal-drafts' }, generated.events.map((event, index) => {
        const box = element('input', { type: 'checkbox', checked: picked.has(index) });
        box.addEventListener('change', () => { if (box.checked) picked.add(index); else picked.delete(index); });
        const when = `${event.date.split('-').reverse().join('.')}${event.endDate ? `–${event.endDate.split('-').reverse().join('.')}` : ''}${event.repeat === 'weekly' ? ` · по ${(event.weekdays ?? []).map(day => ['пн', 'вт', 'ср', 'чт', 'пт', 'сб', 'вс'][day - 1]).join(', ')}` : event.repeat === 'yearly' ? ' · каждый год' : ''}`;
        return element('label', { className: `ku-cal-draft${event.must ? ' must' : ''}` }, [
          box,
          element('span', { className: 'ku-cal-draft-text' }, [element('strong', { text: event.title }), element('span', { className: 'muted ku-small', text: ` · ${when}${event.time ? ` · ${event.time}` : ''}` }), ...(event.note ? [element('br'), element('small', { text: event.note })] : [])]),
        ]);
      }));
      card.append(
        element('div', { className: 'ku-row', style: { marginTop: '10px' } }, [
          button('Отметить все', 'btn small', () => { picked = new Set(generated.events.map((_, index) => index)); render(); }),
          button('Снять все', 'btn small', () => { picked = new Set(); render(); }),
        ]),
        rows,
        element('div', { className: 'row', style: { marginTop: '8px' } }, [
          element('span', { className: 'muted ku-small', text: generated.holidays ? 'В какой год поставить' : `Учебный год с ${MONTHS[(generated.startMonth || 1) - 1].toLocaleLowerCase('ru-RU')}` }),
          yearInput,
          button('Добавить отмеченные в календарь', 'btn primary', () => attempt(() => act('onCalendarApplyTemplate', { template: generated, year: yearInput.value, indexes: [...picked] }, 'calendar-apply'), count => `Добавлено событий: ${count}`)),
        ]),
        element('div', { className: 'row', style: { marginTop: '6px' } }, [
          name,
          button('Сохранить шаблоном', 'btn', () => attempt(() => act('onCalendarSaveTemplate', {
            name: name.value, startMonth: generated.startMonth, year: Number(yearInput.value) || 0, description: wish, events: generated.events.filter((_, index) => picked.has(index)),
          }, 'calendar-template'), 'Шаблон сохранён: он есть во всех чатах')),
          button('Убрать список', 'btn small', () => { generated = null; render(); }),
        ]),
      );
    }
    return card;
  }

  // ---- Saved templates: tucked into their own window ------------------------------------------
  function renderSaved() {
    if (cal().custom) return element('div', { className: 'ku-cal-modal-body' }, [element('p', { className: 'muted ku-small', text: CUSTOM_NOTE })]);
    const card = element('div', { className: 'ku-cal-modal-body' });
    // Saved templates.
    const templates = snapshot().calendarTemplates ?? [];
    card.append(element('p', { className: 'section-title', style: { margin: '14px 0 6px' }, text: `Сохранённые шаблоны · ${templates.length}` }));
    if (!templates.length) card.append(element('p', { className: 'muted ku-small', text: 'Пока нет. Сохраните сгенерированный список или свой календарь.' }));
    for (const template of templates) {
      // The year the template was saved with (what was typed meanwhile is kept through redraws).
      const year = element('input', { type: 'number', min: 1, max: 9999, value: yearDrafts.get(template.id) ?? template.year ?? thisYear(), className: 'ku-short', 'aria-label': `Год для шаблона ${template.name}` });
      year.addEventListener('input', () => yearDrafts.set(template.id, year.value));
      card.append(element('div', { className: 'ku-fact' }, [
        element('span', { className: 'ku-fact-text' }, [element('strong', { text: template.name }), element('span', { className: 'muted', text: ` · ${template.events.length} событий · с ${MONTHS[(template.startMonth || 1) - 1].toLocaleLowerCase('ru-RU')}` })]),
        year,
        button('В календарь', 'btn small primary', () => attempt(() => { month = `${String(Number(year.value) || thisYear()).padStart(4, '0')}-${String(template.startMonth || 1).padStart(2, '0')}`; return act('onCalendarApplyTemplate', { templateId: template.id, year: year.value }, 'calendar-apply'); }, count => `Добавлено событий: ${count}`)),
        button('×', 'btn icon small', () => attempt(() => act('onCalendarRemoveTemplate', { id: template.id }, 'calendar-template-remove'), 'Шаблон удалён'), `Удалить шаблон ${template.name}`),
      ]));
    }
    // This chat's calendar as a template.
    const own = element('input', { placeholder: 'Название шаблона', 'aria-label': 'Название шаблона из этого календаря' });
    const startMonth = element('select', { 'aria-label': 'С какого месяца начинается год' }, MONTHS.map((label, index) => element('option', { value: index + 1, text: `год с: ${label.toLocaleLowerCase('ru-RU')}` })));
    card.append(element('div', { className: 'row', style: { marginTop: '10px' } }, [
      own, startMonth,
      button('Сохранить этот календарь шаблоном', 'btn', () => attempt(() => act('onCalendarSaveTemplate', { name: own.value, startMonth: Number(startMonth.value), year: Number(String(month || '').slice(0, 4)) || thisYear() }, 'calendar-template'), 'Шаблон сохранён: он есть во всех чатах')),
    ]));
    if (calendar().events.some(event => !event.fromCard)) {
      card.append(element('div', { className: 'row', style: { marginTop: '6px' } }, [
        button(`Очистить календарь чата (${calendar().events.filter(event => !event.fromCard).length})`, 'btn small', () => attempt(() => act('onCalendarClear', {}, 'calendar-clear'), 'Календарь чата очищен')),
      ]));
    }
    return card;
  }

  // ---- The little window over the calendar (generator, own calendar, templates) -----------------
  let modal = '';
  function renderModal() {
    if (!modal) return null;
    const titles = { gen: 'Сгенерировать год', builder: 'Свой календарь', tpl: 'Сохранённые шаблоны' };
    const body = modal === 'gen' ? renderGenerator() : modal === 'tpl' ? renderSaved() : builder.renderBuilder();
    const close = () => { modal = ''; render(); };
    const layer = element('div', { className: 'ku-cal-layer', role: 'dialog', 'aria-modal': 'true', 'aria-label': titles[modal] }, [
      element('div', { className: 'ku-cal-sheet' }, [
        element('div', { className: 'ku-row' }, [element('h3', { text: titles[modal], style: { margin: '0' } }), element('span', { className: 'ku-push' }), button('×', 'btn icon small', close, 'Закрыть')]),
        body,
      ]),
    ]);
    layer.addEventListener('click', event => { if (event.target === layer) close(); });
    layer.addEventListener('keydown', event => { if (event.key === 'Escape') { event.stopPropagation(); close(); } });
    return layer;
  }

  // ---- The planner under the month: the days, stretches of a day, ready templates, the generator ------------------
  const PLAN_PLURAL = { 1: 'день', 3: 'дня', 7: 'дней' };
  const stretchesOf = days => days.map(item => item.parts.map(part => `${part.from === '00:00' ? '' : `${part.from} `}${WEATHER_KINDS[part.kind].icon}`).join('→')).join(' ');

  function renderWeatherPlanner() {
    const card = element('div', { className: 'card ku-wxplan' }, [element('h3', { text: 'Погода на дни' })]);
    if (!wp.from) wp.from = selected || today();
    const fromIso = wp.from;
    const start = dayOfDate(calendar(), fromIso);
    if (!start) {
      card.append(element('p', { className: 'muted ku-small', text: calendar().anchor ? 'Выбранный день раньше начала истории: погоды у него нет. Выберите день позже.' : 'Чтобы ставить погоду по датам, укажите дату истории (карточка «Дата истории» вверху): от неё считаются дни.' }));
      return card;
    }
    const toIso = wp.to && wp.to > fromIso ? wp.to : fromIso;
    const last = dayOfDate(calendar(), toIso);
    const count = Math.max(1, last - start + 1);
    const W = cal().weekdayCount;
    card.append(
      element('p', { className: 'muted ku-small', style: { margin: '0 0 8px' }, text: 'Выберите дни (нажмите число в календаре или впишите «с» и «по»), потом поставьте погоду, возьмите заготовку или сочините прогноз.' }),
      element('div', { className: 'ku-wxplan-dates' }, [
        element('label', { className: 'ku-cal-field' }, [element('span', { text: 'С' }), dateField(wp, 'from', { 'aria-label': 'С какого числа' })]),
        element('label', { className: 'ku-cal-field' }, [element('span', { text: 'По (пусто — один день)' }), dateField(wp, 'to', { 'aria-label': 'По какое число' })]),
      ]),
      element('div', { className: 'ku-row ku-cal-quick' }, [element('span', { className: 'muted ku-small', text: 'Сколько:' }),
        ...[[1, 'день'], [3, '3 дня'], [W, 'неделя'], [W * 2, '2 недели'], [30, '30 дней']].map(([n, label]) => button(label, `btn small${count === n ? ' primary' : ''}`, () => { wp.to = n === 1 ? '' : addDays(fromIso, n - 1); render(); })),
        element('span', { className: 'muted ku-small', text: `Выбрано дней: ${count}` })]),
    );

    // Up to three stretches of weather in a day.
    card.append(element('p', { className: 'section-title', style: { margin: '14px 0 6px' }, text: 'Вручную' }));
    const partsBox = element('div', { className: 'ku-wx-parts' });
    wp.parts.forEach((part, index) => {
      const kind = element('select', { 'aria-label': `Погода ${index + 1}` }, [element('option', { value: '', text: '— какая погода —', selected: !part.kind }),
        ...WEATHER_KIND_IDS.map(id => element('option', { value: id, text: `${WEATHER_KINDS[id].icon} ${WEATHER_KINDS[id].label}`, selected: part.kind === id }))]);
      kind.addEventListener('change', () => { part.kind = kind.value; });
      const time = index === 0 ? element('span', { className: 'muted ku-small ku-wx-from', text: 'с начала дня' })
        : element('input', { type: 'time', value: part.from === '00:00' ? '' : part.from, className: 'ku-wx-from', 'aria-label': `С какого часа погода ${index + 1}` });
      if (index) time.addEventListener('input', () => { part.from = time.value || '00:00'; });
      const temp = element('input', { type: 'number', min: -60, max: 60, className: 'ku-short', value: part.temp, placeholder: '°C', 'aria-label': `Температура ${index + 1}` });
      temp.addEventListener('input', () => { part.temp = temp.value; });
      const text = element('input', { value: part.text, placeholder: 'как выглядит', 'aria-label': `Как выглядит ${index + 1}` });
      text.addEventListener('input', () => { part.text = text.value; });
      partsBox.append(element('div', { className: 'ku-wx-part' }, [time, kind, temp, text, ...(index ? [button('×', 'btn icon small', () => { wp.parts.splice(index, 1); render(); }, 'Убрать эту погоду')] : [])]));
    });
    card.append(partsBox);
    const run = (work, done) => attempt(async () => { await work(); render(); }, done);
    card.append(element('div', { className: 'row', style: { marginTop: '8px' } }, [
      ...(wp.parts.length < WEATHER_PARTS_MAX ? [button('+ погода меняется в течение дня', 'btn small', () => { wp.parts.push({ from: '12:00', kind: '', temp: '', text: '' }); render(); }, `До ${WEATHER_PARTS_MAX} видов погоды в один день: укажите час, с которого она меняется`)] : []),
      button('Поставить погоду', 'btn primary small', () => run(async () => {
        const chosen = wp.parts.filter(part => part.kind);
        if (!chosen.length || !wp.parts[0].kind) throw new Error('Выберите погоду на начало дня.');
        await act('onWeatherPaint', { startDay: start, days: count, parts: chosen.map((part, index) => ({ from: index ? part.from : '00:00', kind: part.kind, temp: part.temp, text: part.text })) }, 'weather-paint');
        wp.parts = [{ from: '00:00', kind: '', temp: '', text: '' }];
      }, `Погода поставлена на дней: ${count}`)),
      button('Вернуть прогнозу', 'btn small', () => run(() => act('onWeatherClear', { startDay: start, days: count }, 'weather-clear'), 'Эти дни снова считаются по прогнозу')),
    ]));
    card.append(element('p', { className: 'muted ku-small', style: { margin: '6px 0 0' }, text: 'Если погода в течение дня меняется, рассказчик знает об этом заранее и повернёт её, когда время истории дойдёт до часа. Повторяется в каждый из выбранных дней.' }));

    // Ready templates: one day, three, seven.
    card.append(element('p', { className: 'section-title', style: { margin: '14px 0 6px' }, text: 'Готовые заготовки' }));
    for (const span of [1, 3, 7]) {
      card.append(element('div', { className: 'ku-wxtpl' }, [
        element('span', { className: 'muted ku-small ku-wxtpl-head', text: span === 1 ? 'На 1 день' : `На ${span} ${PLAN_PLURAL[span]}` }),
        ...WEATHER_TEMPLATES.filter(item => item.span === span).map(template => button(`${template.name}`, 'btn small', () => run(() => act('onWeatherTemplate', { templateId: template.id, startDay: start }, 'weather-template'), `«${template.name}» лёг с выбранного дня`), `${stretchesOf(template.days)} · ляжет с первого выбранного дня`)),
      ]));
    }

    // The generator.
    card.append(element('p', { className: 'section-title', style: { margin: '14px 0 6px' }, text: 'Сочинить погоду' }));
    const wish = element('textarea', { rows: 2, value: wp.wish, placeholder: 'Город (например, Санкт-Петербург) или чего хочется: неделя холодных дождей, потом первый мороз' });
    wish.addEventListener('input', () => { wp.wish = wish.value; });
    const make = button(wp.busy ? 'Сочиняю погоду…' : `Сочинить на ${count} ${count === 1 ? 'день' : count < 5 ? 'дня' : 'дней'}`, 'btn small', () => attempt(async () => {
      wp.busy = true; render();
      try { const found = await invoke('onWeatherGenerateDays', { description: wp.wish, startDay: start, count }); wp.generated = found.days; wp.generatedStart = start; }
      finally { wp.busy = false; render(); }
    }, 'Прогноз готов: посмотрите и поставьте'));
    make.disabled = wp.busy;
    card.append(wish, element('div', { className: 'row', style: { marginTop: '6px' } }, [make]));
    if (wp.generated) {
      const list = element('div', { className: 'ku-wxgen' }, wp.generated.map((item, index) => {
        const iso = cal().addDays(calendar().anchor, wp.generatedStart + index - 1);
        return element('div', { className: 'ku-wxgen-day' }, [
          element('strong', { text: iso ? cal().shortDate(iso) : `день ${wp.generatedStart + index}` }),
          element('span', { text: item.parts.map(part => `${part.from === '00:00' ? '' : `с ${part.from} `}${WEATHER_KINDS[part.kind].icon}${part.temp != null ? ` ${tempText(part.temp)}` : ''}${part.text ? ` ${part.text}` : ''}`).join(' → ') }),
        ]);
      }));
      card.append(list, element('div', { className: 'row', style: { marginTop: '8px' } }, [
        button('Поставить эту погоду', 'btn primary small', () => run(async () => { const found = wp.generated; await act('onWeatherDays', { startDay: wp.generatedStart, days: found }, 'weather-days'); wp.generated = null; }, 'Погода поставлена')),
        button('Сочинить заново', 'btn small', () => { wp.generated = null; render(); }),
      ]));
    }

    // The climate of the place (the forecast between the hand-set days).
    const climate = ctx.renderClimate?.();
    if (climate) card.append(element('details', { className: 'ku-wxclimate' }, [element('summary', { text: 'Климат места (по нему считается погода там, где вы её не ставили)' }), climate]));
    return card;
  }

  function renderTools() {
    const templates = snapshot().calendarTemplates ?? [];
    return element('div', { className: 'ku-row ku-cal-tools' }, [
      button('✨ Сгенерировать год', 'btn small', () => { modal = 'gen'; render(); }, 'Модель спланирует год: учёба, праздники, события'),
      button('Свой календарь', 'btn small', () => { modal = 'builder'; render(); }, 'Месяцы, дни недели и сезоны своего мира'),
      button(`Шаблоны · ${templates.length}`, 'btn small', () => { modal = 'tpl'; render(); }, 'Сохранённые шаблоны годов'),
    ]);
  }

  const builder = createCalendarBuilder(ctx, { attempt });

  function renderCalendar() {
    if (!selected && today()) selected = today();
    if (draft && !parseDate(draft.date)) draft.date = selected;
    const view = element('div', { className: 'records-view ku-calendar' });
    view.append(renderToday(), renderTools(), element('div', { className: 'ku-cal-split' }, [renderMonth(), renderDay()]), renderWeatherPlanner(), ...[renderSoon()].filter(Boolean), ...[renderModal()].filter(Boolean));
    return view;
  }

  return { renderCalendar };
}

export const CALENDAR_STYLE = `
.ku-calendar{container-type:inline-size}
.ku-cal-title{min-width:130px;text-align:center}
.ku-cal-pick{width:auto;min-width:112px}
.ku-cal-split{display:grid;grid-template-columns:minmax(0,1.7fr) minmax(280px,1fr);gap:14px;align-items:start}
.ku-cal-split>.card{min-width:0}
@container (max-width:860px){.ku-cal-split{grid-template-columns:minmax(0,1fr)}}
.ku-cal-sep{width:1px;height:20px;margin:0 6px;background:var(--k-line)}
.ku-cal-tools{gap:8px;flex-wrap:wrap}
.ku-cal-layer{position:fixed;inset:0;z-index:30;background:color-mix(in srgb,var(--k-shadow) 80%,transparent);display:grid;place-items:center;padding:16px}
.ku-cal-sheet{width:min(760px,100%);max-height:100%;overflow:auto;display:flex;flex-direction:column;gap:12px;padding:16px;border:1px solid var(--k-line);border-radius:16px;background:var(--k-panel);box-shadow:0 20px 60px var(--k-shadow)}
.ku-cal-modal-body{display:flex;flex-direction:column;gap:6px}
.ku-cal-date{display:flex;gap:6px;flex-wrap:wrap}.ku-cal-date select{width:auto;min-width:0;flex:1 1 120px}
.ku-cal-grid{display:grid;grid-template-columns:repeat(7,minmax(0,1fr));gap:4px;margin:8px auto 0;max-width:720px}
.ku-cal-head{font-size:11px;text-align:center;color:var(--k-muted);text-transform:uppercase}
.ku-cal-cell{display:flex;flex-direction:column;gap:2px;align-items:stretch;aspect-ratio:1;min-height:0;min-width:0;padding:4px;border:1px solid var(--k-line);border-radius:10px;background:var(--k-panel);color:var(--k-text);font:inherit;text-align:left;cursor:pointer;overflow:hidden}
.ku-cal-cell.other{opacity:.45}
.ku-cal-cell.today{border-color:var(--k-accent);box-shadow:inset 0 0 0 1px var(--k-accent)}
.ku-cal-cell.on{background:var(--k-inset)}
.ku-cal-cell.must .ku-cal-num{color:var(--k-warn)}
.ku-cal-num{font-weight:700;font-size:12px}
.ku-cal-top{display:flex;align-items:center;justify-content:space-between;gap:2px;min-width:0}
.ku-cal-wx{display:inline-flex;align-items:center;gap:2px;font-size:11px;line-height:1;opacity:.85;white-space:nowrap}
.ku-cal-wx.hand{opacity:1;text-shadow:0 0 6px var(--k-accent)}
.ku-cal-wx.scenario{color:var(--k-warn)}
.ku-cal-wx-t{font-size:10px;color:var(--k-muted)}
.ku-cal-wxbox{display:flex;flex-direction:column;gap:6px;margin-top:6px;padding-top:6px;border-top:1px dashed var(--k-line)}
.ku-cal-quick{gap:6px;flex-wrap:wrap}
.ku-cal-dot{font-size:10px;line-height:1.2;padding:1px 4px;border-radius:6px;background:var(--k-inset);overflow-wrap:anywhere;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden}
.ku-cal-dot.must{color:var(--k-warn);font-weight:700}
.ku-cal-more{font-size:10px;color:var(--k-muted)}
.ku-cal-event{display:flex;gap:8px;align-items:flex-start;padding:8px 0;border-top:1px solid var(--k-line)}
.ku-cal-event-text{display:flex;flex-direction:column;gap:2px;flex:1;min-width:0;overflow-wrap:anywhere}
.ku-cal-event.must strong{color:var(--k-warn)}
.ku-cal-editor{display:flex;flex-direction:column;gap:8px;margin-top:10px;padding-top:10px;border-top:1px dashed var(--k-line)}
.ku-cal-field{display:flex;flex-direction:column;gap:3px;font-size:12px;min-width:0}
.ku-cal-fields{display:grid;grid-template-columns:repeat(auto-fill,minmax(150px,1fr));gap:8px}
.ku-cal-weekdays{display:flex;flex-wrap:wrap;gap:8px;font-size:12px}
.ku-cal-drafts{display:flex;flex-direction:column;gap:6px;max-height:420px;overflow-y:auto;overflow-x:hidden;margin-top:6px;padding-right:4px}
.ku-cal-draft{display:grid;grid-template-columns:20px minmax(0,1fr);column-gap:8px;align-items:start;font-size:12.5px;overflow-wrap:anywhere}
.ku-cal-draft input[type=checkbox]{width:16px;height:16px;min-width:0;margin:2px 0 0;padding:0;justify-self:center}
.ku-cal-draft-text{min-width:0}
.ku-cal-sheet{min-width:0;overflow-x:hidden}
.ku-cal-check{display:grid;grid-template-columns:20px minmax(0,1fr);column-gap:8px;align-items:center;font-size:13px}
.ku-cal-check input[type=checkbox]{width:16px;height:16px;min-width:0;margin:0;padding:0;justify-self:center}
.ku-wxplan-dates{display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:8px}
.ku-wx-parts{display:flex;flex-direction:column;gap:6px}
.ku-wx-part{display:grid;grid-template-columns:100px minmax(190px,230px) 84px minmax(0,1fr) auto;gap:8px;align-items:center}
.ku-wx-part input,.ku-wx-part select{min-width:0;width:100%;max-width:none;box-sizing:border-box}
.ku-wx-part .ku-short{width:100%}
.ku-wx-from{font-size:12px}
@container (max-width:640px){.ku-wx-part{grid-template-columns:minmax(0,1fr) minmax(0,1fr);}}
.ku-wxtpl{display:flex;flex-wrap:wrap;gap:6px;align-items:center;margin-bottom:6px}
.ku-wxtpl-head{flex:0 0 100%}
.ku-wxgen{display:flex;flex-direction:column;gap:4px;margin-top:8px;max-height:340px;overflow-y:auto}
.ku-wxgen-day{display:grid;grid-template-columns:90px minmax(0,1fr);gap:8px;font-size:12.5px;overflow-wrap:anywhere}
.ku-wxclimate{margin-top:14px}
.ku-wxclimate>summary{cursor:pointer;font-weight:600}
.ku-cal-draft.must strong{color:var(--k-warn)}
@container (max-width:520px){.ku-cal-wx-t{display:none}.ku-cal-dot{display:none}.ku-cal-cell.must::after{content:'';width:6px;height:6px;border-radius:50%;background:var(--k-warn)}}
`;
