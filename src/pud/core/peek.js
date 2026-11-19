/**
 * «Слива выглядывает»: когда и что говорит маскот. Здесь только чистая логика без DOM и сети:
 * фразы, настройки по умолчанию, выбор напоминания по времени, длине сессии и погоде.
 * Тексты написаны без родов обращения («пора перекусить»), чтобы подходили любому человеку.
 */

/** Размеры вырезанных картинок (px) и линия «края», на котором лежат ручки: картинка ставится так, чтобы линия совпала с краем панели. */
export const PEEK_FACES = {
  normal: { w: 358, h: 337, ledge: 315.8 },
  sleepy: { w: 401, h: 403, ledge: 383.8 },
  happy: { w: 360, h: 369, ledge: 347.0 },
  cold: { w: 410, h: 424, ledge: 404.5 },
  hungry: { w: 416, h: 381, ledge: 359.5 },
  wink: { w: 397, h: 393, ledge: 368.0 },
  sad: { w: 451, h: 395, ledge: 371.8 },
  stern: { w: 402, h: 415, ledge: 391.8 },
  shy: { w: 360, h: 406, ledge: 392.5 },
  smug: { w: 360, h: 406, ledge: 392.5 },
  approve: { w: 425, h: 406, ledge: 393.0 },
  love: { w: 380, h: 396, ledge: 393.2 },
  pout: { w: 360, h: 406, ledge: 393.2 },
  grumpy: { w: 360, h: 406, ledge: 393.2 },
  scared: { w: 360, h: 407, ledge: 393.7 },
  panic: { w: 386, h: 355, ledge: 352.1 },
};

/**
 * Лица, которые Слива может выбрать для своего комментария, и когда какое подходит (это читает модель).
 * Холод, голод и сонливость сюда не входят: они только для напоминаний.
 */
export const COMMENT_MOODS = {
  smug: 'ехидничаешь, подкалываешь, ухмыляешься, довольна чужой неловкостью или хитрым ходом',
  approve: 'одобряешь пикантную, милую или «правильную» сцену: поддерживаешь, как болельщик (слегка пошло и очень довольно)',
  love: 'восхищаешься заботой, нежностью, любовью, красивым признанием или близостью: тают сердечки',
  shy: 'смущаешься: неловкий момент, комплимент, откровенная сцена, из-за которой хочется спрятаться',
  pout: 'недовольна и надулась: обижена, ревнуешь, кто-то глупит или упрямится',
  grumpy: 'недовольна устало и кисло: скучно, душно, бесит, сколько можно',
  scared: 'испугалась: тревожный поворот, угроза, плохое предчувствие',
  panic: 'в панике: катастрофа, кто-то в беде, смерть, кровь, крик',
  sad: 'грустно: потеря, расставание, одиночество, тоскливая сцена',
  stern: 'строго и серьёзно: упрекаешь, предупреждаешь, «так нельзя»',
  happy: 'радуешься: хороший поворот, победа, тёплый и весёлый момент',
  wink: 'шутишь по-доброму, мимоходом подбадриваешь, лёгкая ирония',
  normal: 'спокойно комментируешь, ничего особого не чувствуешь',
};
/** Если модель не назвала лицо (или назвала неизвестное), берётся случайное из мягких. */
export const COMMENT_FACES = ['wink', 'wink', 'normal', 'happy'];

/** Лицо комментария по ответу модели: тег в начале реплики, например «[smug] Ну-ну». Нет тега → случайное мягкое. */
export function commentFace(raw, rand = Math.random) {
  const source = String(raw ?? '').replace(/<(think|thinking|reasoning)>[\s\S]*?<\/\1>/gi, ' ');
  const marked = [...source.matchAll(/<<<([\s\S]*?)>>>/g)].at(-1)?.[1] ?? /<<<([\s\S]*)$/.exec(source)?.[1] ?? source;
  const tag = /^[\s"«“*_]*\[([a-z]+)\]/i.exec(marked)?.[1]?.toLowerCase();
  if (tag && Object.hasOwn(COMMENT_MOODS, tag)) return tag;
  return COMMENT_FACES[Math.min(COMMENT_FACES.length - 1, Math.floor(rand() * COMMENT_FACES.length))];
}

/** Виды реплик: подпись для настроек, лицо, значок в облачке и варианты фраз. {t} — температура за окном. */
export const PEEK_KINDS = {
  rest: {
    title: 'Пора отдохнуть', face: 'sleepy', emoji: '😴',
    lines: ['Не пора ли отдохнуть?', 'Давно сидим. Потянись и поморгай, ладно?', 'Глазки устали? Давай маленький перерыв.', 'Встань, пройдись, разомни плечи. Я подожду здесь.'],
  },
  meal: {
    title: 'Пора поесть', face: 'hungry', emoji: '🍙',
    lines: ['Пора перекусить! Что-нибудь вкусное и тёплое.', 'Животик урчит. Давай поедим?', 'Не пропусти обед: чат никуда не убежит.', 'Чай с бутербродом — тоже еда. Идём?'],
  },
  water: {
    title: 'Выпей воды', face: 'stern', emoji: '💧',
    lines: ['Стакан воды, пожалуйста. Потом продолжим.', 'Не забывай пить воду!', 'Глоток воды — и дальше в сюжет.'],
  },
  sleep: {
    title: 'Пора спать', face: 'sleepy', emoji: '🌙',
    lines: ['Уже поздно. Не пора ли спать?', 'Глазки слипаются. Давай отложим до завтра?', 'Сон — тоже часть сюжета. Ложись!', 'Сюжет подождёт. Отдыхать!'],
  },
  cold: {
    title: 'Холодно за окном', face: 'cold', emoji: '🧣',
    lines: ['На улице {t}°. Не замёрз? Выпей горячего чая.', 'Там холодно ({t}°). Укутайся потеплее и налей чаю.', 'Брр, {t}°! Плед и горячий чай, срочно.'],
  },
  hot: {
    title: 'Жарко за окном', face: 'grumpy', emoji: '☀️',
    lines: ['Жарко ({t}°)! Пей побольше воды.', 'На улице {t}°. Не перегрейся, ладно?'],
  },
  rain: {
    title: 'Дождь', face: 'normal', emoji: '🌧️',
    lines: ['За окном дождь. Самое время для чая и пледа.', 'Дождик! Если пойдёшь на улицу, возьми зонт.'],
  },
  snow: {
    title: 'Снег', face: 'happy', emoji: '❄️',
    lines: ['Идёт снег! Если выйдешь, оденься потеплее.', 'Снежок на улице. Красиво, да?'],
  },
  storm: {
    title: 'Гроза', face: 'scared', emoji: '⛈️',
    lines: ['Там гроза. Сохрани всё важное и держись подальше от окна.', 'Гремит! Береги технику и себя.'],
  },
  hello: {
    title: 'Приветствие', face: 'happy', emoji: '👋',
    lines: ['Привет! Я здесь, если что.', 'С возвращением!', 'Ура, снова вместе! Я скучала.'],
  },
  cheer: {
    title: 'Подбодрить', face: 'wink', emoji: '💜',
    lines: ['Хороший получается сюжет!', 'Ты молодец. Про себя тоже не забывай.', 'Всё хорошо. Я рядом.'],
  },
};

/** Какие виды реплик связаны с погодой (включаются одной галочкой «погода»). */
export const WEATHER_KINDS = ['storm', 'snow', 'rain', 'cold', 'hot'];

export function defaultPeekSettings() {
  return {
    enabled: true,
    // left | center | right — над какой частью строки ввода выглядывать
    side: 'left',
    // размер в процентах
    size: 100,
    // не чаще, чем раз в столько минут
    minGapMin: 25,
    // сколько секунд держится облачко (плюс время на чтение)
    showSec: 10,
    // какие виды реплик включены
    kinds: { rest: true, meal: true, water: true, sleep: true, weather: true, hello: true, cheer: false },
    restAfterMin: 90,
    restAgainMin: 60,
    waterEveryMin: 120,
    cheerEveryMin: 180,
    // время еды, через запятую: 09:00, 13:30, 19:00
    meals: '09:00, 13:30, 19:00',
    // после этого времени (и несколько часов) напоминает про сон; пусто = не напоминать
    bedtime: '01:00',
    // тихие часы: ни одной реплики; пусто = нет
    quietFrom: '',
    quietTo: '',
    // выглядывать и пока ждёшь ответ ИИ
    whileWaiting: true,
    // часы: 'device' = по часам этого устройства (у каждого свои), 'city' = по часовому поясу найденного города
    tz: 'device',
    // город для погоды (пусто = без погоды) и найденное место {name, country, lat, lon, tz}
    city: '',
    place: null,
    // подсказка про город уже показывалась
    cityHintShown: false,
    // комментарии моделью: читает последние сообщения чата и шутит в своём характере
    commentEnabled: false,
    // '' = не выбрано, 'main' = модель чата (только когда чат не пишет ответ), иначе id профиля подключения
    commentProfile: '',
    commentWaiting: true,
    commentReply: true,
    commentEvery: 3,
    commentGapMin: 4,
    commentMaxWords: 25,
    commentMessages: 6,
    // свои фразы: вид → массив (добавляются к встроенным)
    phrases: {},
    // служебное: когда что в последний раз показывалось, отложено ли, какие приёмы пищи уже были
    last: {},
    snoozeUntil: 0,
    mealsDone: {},
    // свои напоминания (см. normalizeReminders) и отметки «уже напомнила сегодня»
    reminders: [],
    remindersDone: {},
  };
}

/** «13:30» → минуты от полуночи; не время → null. */
export function parseClock(text) {
  const match = /^\s*(\d{1,2})[:.](\d{2})\s*$/.exec(String(text ?? ''));
  if (!match) return null;
  const h = Number(match[1]);
  const m = Number(match[2]);
  return h < 24 && m < 60 ? h * 60 + m : null;
}

/** «09:00, 13:30» → [540, 810] без повторов, по возрастанию. */
export function parseClockList(text) {
  const seen = new Set();
  for (const part of String(text ?? '').split(/[,;\s]+/)) {
    const value = parseClock(part);
    if (value !== null) seen.add(value);
  }
  return [...seen].sort((a, b) => a - b);
}

export const minutesOfDay = date => date.getHours() * 60 + date.getMinutes();

const pad2 = n => String(n).padStart(2, '0');
const dayKeyOf = date => `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`;

/**
 * Часы пользователя: минута суток и ключ дня. tz пустой — по часам устройства (так у каждого человека своё время),
 * иначе по названию часового пояса («Europe/Berlin»). Неизвестный пояс тихо заменяется часами устройства.
 */
export function clockParts(date, tz = '') {
  if (tz) {
    try {
      const parts = Object.fromEntries(new Intl.DateTimeFormat('en-CA', { timeZone: tz, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })
        .formatToParts(date).filter(part => part.type !== 'literal').map(part => [part.type, part.value]));
      return { minute: Number(parts.hour) * 60 + Number(parts.minute), day: `${parts.year}-${parts.month}-${parts.day}` };
    } catch { /* неизвестный пояс: ниже часы устройства */ }
  }
  return { minute: minutesOfDay(date), day: dayKeyOf(date) };
}

/** Какой пояс брать по настройкам: найденного города или пусто (устройство). */
export const zoneOf = cfg => (cfg?.tz === 'city' && cfg?.place?.tz ? cfg.place.tz : '');

/** Попадает ли минута суток в промежуток [from, to) (через полночь тоже); пустые границы — нет. */
export function inWindow(minute, from, to) {
  if (from === null || to === null || from === undefined || to === undefined || from === to) return false;
  return from < to ? minute >= from && minute < to : minute >= from || minute < to;
}

/** Пишет «сессию»: промежуток, пока пользователь что-то делает; пауза дольше gapMs обрывает её. */
export function noteActivity(session, now, gapMs = 20 * 60 * 1000) {
  if (!session.start || now - session.last > gapMs) session.start = now;
  session.last = now;
  return session;
}

/** Код погоды WMO + температура ощущаемая → вид реплики или null. */
export function weatherKind(weather) {
  if (!weather || !Number.isFinite(weather.code)) return null;
  const code = weather.code;
  if (code >= 95) return 'storm';
  if ((code >= 71 && code <= 77) || code === 85 || code === 86) return 'snow';
  if ((code >= 51 && code <= 67) || (code >= 80 && code <= 82)) return 'rain';
  const feels = Number.isFinite(weather.feels) ? weather.feels : weather.temp;
  if (Number.isFinite(feels) && feels <= 3) return 'cold';
  if (Number.isFinite(feels) && feels >= 28) return 'hot';
  return null;
}

const MIN = 60 * 1000;
const WEATHER_AGAIN_MS = 5 * 60 * MIN;
const RECENT_MS = 30 * MIN;

/** Реплика по умолчанию + свои фразы. */
export function linesFor(kind, cfg) {
  const own = Array.isArray(cfg?.phrases?.[kind]) ? cfg.phrases[kind].map(line => String(line).trim()).filter(Boolean) : [];
  return [...(PEEK_KINDS[kind]?.lines ?? []), ...own];
}

/** Подставляет {t} и берёт случайную фразу. rand() → [0,1). */
export function pickLine(kind, cfg, rand = Math.random, vars = {}) {
  const lines = linesFor(kind, cfg);
  if (!lines.length) return '';
  const line = lines[Math.min(lines.length - 1, Math.floor(rand() * lines.length))];
  return line.replace(/\{(\w+)\}/g, (_, key) => String(vars[key] ?? ''));
}

/**
 * Решает, что сказать сейчас (или промолчать).
 * @param {{ now: Date, session: {start:number,last:number}, cfg: object, weather?: object|null, lastShownAt?: number }} input
 * @returns {{ kind: string, mealKey?: string } | null}
 */
export function decide({ now, session, cfg, weather = null, lastShownAt = 0 }) {
  if (!cfg?.enabled) return null;
  const nowMs = now.getTime();
  if (nowMs < (cfg.snoozeUntil || 0)) return null;
  // общая пауза между репликами касается только встроенных; свои напоминания идут по своему расписанию
  const gapOk = !(lastShownAt && nowMs - lastShownAt < cfg.minGapMin * MIN);
  const { minute, day } = clockParts(now, zoneOf(cfg));
  if (inWindow(minute, parseClock(cfg.quietFrom), parseClock(cfg.quietTo))) return null;
  const on = kind => cfg.kinds?.[kind] !== false;
  const last = cfg.last ?? {};
  const since = kind => nowMs - (last[kind] ?? 0);
  const active = session.last && nowMs - session.last <= RECENT_MS;
  if (!active) return null;
  const sessionMs = nowMs - session.start;

  // свои напоминания: по времени (раз в день, в течение полутора часов после него) или через равные промежутки
  for (const item of cfg.reminders ?? []) {
    if (!item?.on || !String(item.text ?? '').trim()) continue;
    const spec = { kind: 'custom', reminderId: item.id, text: String(item.text).trim(), face: item.face, emoji: item.emoji };
    if (item.mode === 'every') {
      if (nowMs - Math.max(last[`r:${item.id}`] ?? 0, session.start) >= (Number(item.everyMin) || 60) * MIN) return spec;
      continue;
    }
    for (const slot of parseClockList(item.times)) {
      const key = `${day}|r:${item.id}|${slot}`;
      if (minute >= slot && minute < slot + 90 && !(cfg.remindersDone ?? {})[key]) return { ...spec, doneKey: key };
    }
  }
  if (!gapOk) return null;

  // сон: после времени отбоя и ещё четыре часа
  const bed = parseClock(cfg.bedtime);
  if (on('sleep') && bed !== null && inWindow(minute, bed, (bed + 240) % 1440) && since('sleep') >= 45 * MIN) return { kind: 'sleep' };

  // еда: в течение полутора часов после назначенного времени, один раз за день
  if (on('meal')) {
    const done = cfg.mealsDone ?? {};
    for (const slot of parseClockList(cfg.meals)) {
      const key = `${day}|${slot}`;
      if (minute >= slot && minute < slot + 90 && !done[key]) return { kind: 'meal', mealKey: key };
    }
  }

  // отдых: сессия длиннее restAfterMin, потом каждые restAgainMin
  if (on('rest') && sessionMs >= cfg.restAfterMin * MIN && since('rest') >= cfg.restAgainMin * MIN) return { kind: 'rest' };

  // погода: раз в пять часов на каждый вид
  if (on('weather')) {
    const kind = weatherKind(weather);
    if (kind && on(kind) && since(kind) >= WEATHER_AGAIN_MS) return { kind, temp: Math.round(weather.feels ?? weather.temp) };
  }

  if (on('water') && nowMs - Math.max(last.water ?? 0, session.start) >= cfg.waterEveryMin * MIN) return { kind: 'water' };

  // приветствие: первое действие после долгого перерыва
  if (on('hello') && since('hello') >= 6 * 60 * MIN && sessionMs < 5 * MIN) return { kind: 'hello' };

  if (on('cheer') && since('cheer') >= cfg.cheerEveryMin * MIN && sessionMs >= 30 * MIN) return { kind: 'cheer' };
  return null;
}

/** Убирает отметки приёмов пищи старше трёх дней, чтобы список не рос. */
export function pruneMeals(done, now, tz = '') {
  const keep = new Set([0, 1, 2].map(back => clockParts(new Date(now.getTime() - back * 24 * 60 * MIN), tz).day));
  return Object.fromEntries(Object.entries(done ?? {}).filter(([key]) => keep.has(key.split('|')[0])));
}

/** Сколько миллисекунд держать облачко: базовое время + по 45 мс на символ. */
export const holdMs = (cfg, text) => Math.max(3000, (cfg.showSec ?? 10) * 1000 + String(text ?? '').length * 45);

// ───────── комментарии моделью

/**
 * Характер Сливы. Он один и тот же у всех и не настраивается: это маскот, а не персонаж чата.
 * Слива взрослая женщина.
 */
export const PEEK_PERSONA = [
  'Ты — Слива, маскот-хранительница этого чата: дух сливового саженца, взрослая женщина с вечной ухмылкой. Ты не участвуешь в сюжете: ты смотришь на него из-за края строки ввода и комментируешь то, что только что случилось в чате, как зритель, у которого есть мнение обо всём.',
  'Твой характер неизменен: ты хитрая и очень ехидная, обожаешь подкалывать. Ты отпускаешь пошлые и порой вульгарные шуточки, двусмысленности и намёки, не стесняясь грубоватого слова, когда оно в тему. При этом ты сентиментальная и чувственная: можешь внезапно растрогаться, умилиться или томно вздохнуть над красивой сценой.',
  'Шути над сюжетом и героями, а не унижай автора всерьёз.',
].join('\n');

/** Сколько слов в тексте. */
export const countWords = text => (String(text ?? '').match(/[\p{L}\p{N}][\p{L}\p{N}'’-]*/gu) ?? []).length;

/** Токенов на ответ: с запасом на русский, чтобы лимит слов, а не лимит токенов, решал длину. */
export const commentTokens = maxWords => Math.max(160, Math.ceil(maxWords * 4.5) + 60);

/** Максимальная ширина облачка (px): короткая реплика узкая, длинная шире, но не больше предела. */
export function bubbleMaxWidth(words) {
  if (words <= 5) return 230;
  if (words <= 12) return 300;
  if (words <= 22) return 380;
  return 460;
}

/** Убирает служебное из текста сообщения: теги, думающие блоки, картинки, лишние пробелы; длинное обрезает по краям. */
export function tidyMessage(text, limit = 700) {
  let out = String(text ?? '')
    .replace(/<(think|thinking|reasoning)>[\s\S]*?<\/\1>/gi, ' ')
    .replace(/!\[[^\]]*\]\([^)]*\)/g, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  if (out.length > limit) out = `${out.slice(0, Math.floor(limit * 0.65)).trim()} … ${out.slice(-Math.floor(limit * 0.3)).trim()}`;
  return out;
}

/**
 * Запрос к модели: характер + правила и последние сообщения чата.
 * Лимит слов сказан заранее: модель сама выбирает мысль, которая уложится целиком.
 * @param {{ chat: Array<{name:string,text:string,isUser?:boolean}>, maxWords: number, author?: string }} input
 */
export function buildCommentMessages({ chat, maxWords, author = '' }) {
  const words = Math.max(3, Math.round(maxWords));
  const rules = [
    `Объём: не больше ${words} слов. Лимит известен заранее, поэтому выбери такую мысль, которая уложится в него целиком и закончится законченной фразой. Ничего не обрывай и не заканчивай многоточием вместо конца.`,
    words <= 12 ? 'Одно короткое предложение.' : 'От одного до трёх коротких предложений.',
    'Опирайся на конкретные детали последних сообщений: имена, поступки, реплики. Не пересказывай, а реагируй.',
    'К автору (тому, кто пишет в чате) обращайся на «ты» без указания рода: не «ты написала» и не «ты написал», а «ну ты даёшь», «вот это поворот». О себе говори в женском роде.',
    `Лицо: первым в реплике, до текста, поставь тег с лицом в квадратных скобках, например [smug]. Выбери то, что точно подходит к твоей реплике и к тому, что происходит в сцене. Доступные лица:\n${Object.entries(COMMENT_MOODS).map(([name, when]) => `[${name}] — ${when}`).join('\n')}\nТег не считается в слова и не показывается. Не повторяй всё время одно и то же лицо, подбирай по смыслу.`,
    'Пиши по-русски, одной репликой. Не пиши рассуждений, плана и разбора задачи: только готовая реплика между маркерами <<< и >>>. Без кавычек, без звёздочек и описаний действий, без пояснений и вступлений вроде «Комментарий:». В конце можно поставить один эмодзи.',
  ];
  const lines = chat.map(item => `${item.isUser ? `${item.name || author || 'Автор'} (автор)` : item.name || 'Рассказчик'}: ${item.text}`);
  return [
    { role: 'system', content: `${PEEK_PERSONA}\n\n${rules.join('\n')}` },
    { role: 'user', content: `Последние сообщения чата (старые выше, новые ниже):\n\n${lines.join('\n\n')}\n\nПрокомментируй как Слива. Не больше ${words} слов, мысль законченная. Выведи только реплику с тегом лица между маркерами: <<<[лицо] реплика>>>; ничего вне маркеров.` },
  ];
}

/**
 * Ответ модели → готовая реплика. Лишнее снимается; если модель всё же написала длиннее лимита (с запасом в треть),
 * реплика обрезается по последнему законченному предложению, а не посреди фразы.
 * Пустое → ''.
 */
const REASONING_START = /^(мы должны|нам нужно|нужно |надо |хорошо[,.!]|итак[,.]|так[,.] |для начала|сначала |посмотрим|давай(?:те)? |okay|ok[,.]|let me|let's|the user|we need|we must|i need|i should|first[,.]|пользователь )/i;

export function cleanComment(raw, maxWords) {
  const unquote = value => value.replace(/^["«»“”„']+|["«»“”„']+$/g, '').trim();
  let source = String(raw ?? '').replace(/<(think|thinking|reasoning)>[\s\S]*?<\/\1>/gi, ' ');
  // реплика между маркерами <<< … >>>: всё остальное (рассуждения модели) отбрасывается
  const marked = [...source.matchAll(/<<<([\s\S]*?)>>>/g)].at(-1)?.[1] ?? (/<<<([\s\S]*)$/.exec(source)?.[1]);
  const hadMarkers = marked !== undefined;
  if (hadMarkers) source = marked;
  let text = source
    .replace(/[*_`]+/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  text = unquote(unquote(text).replace(/^(слива|комментарий)\s*[:—-]\s*/i, ''));
  // тег лица («[smug]») в начале уходит из текста: лицо берёт commentFace
  text = text.replace(/^\[([a-z]+)\]\s*/i, (all, tag) => (Object.hasOwn(COMMENT_MOODS, tag.toLowerCase()) ? '' : all)).trim();
  if (!text) return '';
  // модель с «размышлениями» выложила ход мыслей вместо реплики: лучше промолчать, чем показать это
  if (!hadMarkers && REASONING_START.test(text)) return '';
  const cap = Math.ceil(maxWords * 1.34);
  if (countWords(text) > cap) {
    const sentences = text.match(/[^.!?…]+[.!?…]+(?:\s|$)|[^.!?…]+$/g) ?? [text];
    let kept = '';
    for (const sentence of sentences) {
      if (countWords(`${kept} ${sentence}`) > cap) break;
      kept = `${kept} ${sentence}`.trim();
    }
    if (kept && /[.!?…]$/.test(kept)) text = kept;
    else {
      const words = text.split(' ').slice(0, cap).join(' ').replace(/[,;:\s-]+$/, '');
      text = `${words}…`;
    }
  }
  return text;
}

/**
 * Пора ли комментировать: включено, выбран способ, прошло достаточно времени и ответов, не тихие часы и не «отложено».
 * @param {{ cfg: object, count: number, lastAt: number, now: Date, busy: boolean }} input
 */
export function commentDue({ cfg, count, lastAt, now, busy }) {
  if (!cfg?.enabled || !cfg.commentEnabled || !cfg.commentProfile) return false;
  if (cfg.commentProfile === 'main' && busy) return false;
  const nowMs = now.getTime();
  if (nowMs < (cfg.snoozeUntil || 0)) return false;
  if (nowMs - (lastAt || 0) < cfg.commentGapMin * MIN) return false;
  if (count < cfg.commentEvery) return false;
  const { minute } = clockParts(now, zoneOf(cfg));
  return !inWindow(minute, parseClock(cfg.quietFrom), parseClock(cfg.quietTo));
}

// ───────── свои напоминания

export const REMINDER_LIMIT = 20;
const REMINDER_ID = /^r-[a-z0-9]{1,12}$/;
const newReminderId = () => `r-${Math.random().toString(36).slice(2, 8)}`;

/** Свои напоминания человека → аккуратный список (чужое выбрасывается, границы зажимаются). */
export function normalizeReminders(raw) {
  const seen = new Set();
  const out = [];
  for (const entry of Array.isArray(raw) ? raw : []) {
    if (!entry || typeof entry !== 'object' || out.length >= REMINDER_LIMIT) continue;
    let id = REMINDER_ID.test(String(entry.id)) ? String(entry.id) : '';
    if (!id || seen.has(id)) id = newReminderId();
    seen.add(id);
    out.push({
      id,
      on: entry.on !== false,
      text: String(entry.text ?? '').slice(0, 200),
      // daily — в назначенное время (раз в день), every — через равные промежутки, пока человек в чате
      mode: entry.mode === 'every' ? 'every' : 'daily',
      times: String(entry.times ?? '').slice(0, 80),
      everyMin: Math.min(1440, Math.max(5, Math.round(Number(entry.everyMin) || 60))),
      face: Object.hasOwn(PEEK_FACES, entry.face) ? entry.face : 'wink',
      emoji: String(entry.emoji ?? '').trim().slice(0, 8) || '⏰',
    });
  }
  return out;
}

/** Заготовка нового напоминания. */
export const newReminder = () => ({ id: newReminderId(), on: true, text: '', mode: 'daily', times: '12:00', everyMin: 60, face: 'wink', emoji: '⏰' });
