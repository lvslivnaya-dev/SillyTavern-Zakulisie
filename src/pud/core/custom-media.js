/**
 * Свой экран загрузки: настройки и разбор файлов. Чистая логика без DOM.
 * Картинка, гифка или короткое видео лежат на сервере таверны (папка файлов пользователя), в настройках только путь.
 */
export const LOADING_LIMITS = Object.freeze({ imageBytes: 12 * 1024 * 1024, videoBytes: 40 * 1024 * 1024, text: 120 });
export const LOADING_SIZES = Object.freeze({ s: 'Маленький', m: 'Средний', l: 'Большой', full: 'На весь экран' });
export const LOADING_BACKGROUNDS = Object.freeze({ theme: 'Как в таверне', dark: 'Тёмный', light: 'Светлый', color: 'Свой цвет' });

const IMAGE_TYPES = { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/webp': 'webp', 'image/gif': 'gif', 'image/avif': 'avif' };
const VIDEO_TYPES = { 'video/mp4': 'mp4', 'video/webm': 'webm' };

/** Что за файл: { kind: 'image' | 'video', ext } или null. Определяется по типу, а если его нет, по расширению. */
export function mediaKindOf(file) {
  const type = String(file?.type ?? '').toLowerCase();
  let byName = String(file?.name ?? '').toLowerCase().match(/\.([a-z0-9]{2,5})$/)?.[1] ?? '';
  if (byName === 'jpeg') byName = 'jpg';
  if (IMAGE_TYPES[type]) return { kind: 'image', ext: IMAGE_TYPES[type] };
  if (VIDEO_TYPES[type]) return { kind: 'video', ext: VIDEO_TYPES[type] };
  if (!type && Object.values(IMAGE_TYPES).includes(byName)) return { kind: 'image', ext: byName };
  if (!type && Object.values(VIDEO_TYPES).includes(byName)) return { kind: 'video', ext: byName };
  return null;
}

/** null, если файл годится, иначе фраза, что не так. */
export function mediaProblem(file) {
  const kind = mediaKindOf(file);
  if (!kind) return 'Такой файл не подходит: нужна картинка (PNG, JPG, WebP, GIF, AVIF) или видео (MP4, WebM).';
  const limit = kind.kind === 'video' ? LOADING_LIMITS.videoBytes : LOADING_LIMITS.imageBytes;
  if (file.size > limit) return `Файл слишком большой: до ${Math.round(limit / 1048576)} МБ для ${kind.kind === 'video' ? 'видео' : 'картинки'}.`;
  return null;
}

export const LOADING_DEFAULTS = Object.freeze({ enabled: false, src: '', path: '', kind: '', name: '', size: 'm', fit: 'contain', bg: 'theme', color: '#fff5f8', text: '', spinner: false });

const hex = value => (/^#[0-9a-f]{6}$/i.test(String(value ?? '').trim()) ? String(value).trim().toLowerCase() : LOADING_DEFAULTS.color);

/** Адрес файла на сервере таверны: только свой каталог файлов, не чужая ссылка. */
export function isOwnFile(value) {
  return typeof value === 'string' && /^\/user\/files\/[A-Za-z0-9_.-]+$/.test(value);
}

export function normalizeLoading(raw) {
  const s = raw && typeof raw === 'object' ? raw : {};
  const src = isOwnFile(s.src) ? s.src : '';
  return {
    enabled: Boolean(s.enabled) && Boolean(src),
    src,
    kind: src ? (s.kind === 'video' ? 'video' : 'image') : '',
    path: src ? String(s.path ?? '').replace(/^\/+/, '').slice(0, 200) : '',
    name: String(s.name ?? '').slice(0, 120),
    size: Object.hasOwn(LOADING_SIZES, s.size) ? s.size : LOADING_DEFAULTS.size,
    fit: s.fit === 'cover' ? 'cover' : 'contain',
    bg: Object.hasOwn(LOADING_BACKGROUNDS, s.bg) ? s.bg : LOADING_DEFAULTS.bg,
    color: hex(s.color),
    text: String(s.text ?? '').replace(/\s+/g, ' ').trim().slice(0, LOADING_LIMITS.text),
    spinner: Boolean(s.spinner),
  };
}

export const SPLASH_BEGIN = '/* ===== Закулисье: заставка запуска (начало) ===== */';
export const SPLASH_END = '/* ===== Закулисье: заставка запуска (конец) ===== */';
const SPLASH_SIZES = { s: 120, m: 240, l: 420 };
const SPLASH_INK = { dark: '#f3eef6', light: '#2a2430' };

/** Текст в строку css: без кавычек, обратных косых и переводов строки. */
const cssText = text => String(text ?? '').replace(/["\\\r\n<>{}]/g, ' ').replace(/\s+/g, ' ').trim();

/**
 * CSS для самой первой заставки таверны (значок ST, шестерёнка, «Инициализация…»). Расширения в этот момент ещё не загружены,
 * поэтому единственный способ её изменить — файл data/_css/user.css, который таверна подключает в самом начале страницы.
 * Работает с картинкой и гифкой; видео в css не показать (для видео меняется только фон и подпись). Возвращает '' без файла.
 */
export function splashCss(options) {
  const o = normalizeLoading({ ...options, enabled: true });
  if (!o.src) return '';
  const isImage = o.kind !== 'video';
  const color = o.bg === 'color' ? o.color : o.bg === 'dark' ? '#0e0c12' : o.bg === 'light' ? '#fbf8f4' : '';
  const ink = o.bg === 'dark' ? SPLASH_INK.dark : o.bg === 'light' ? SPLASH_INK.light : '';
  const lines = [SPLASH_BEGIN, ':root { --pud-splash-css: 1; }'];
  const preloader = [];
  if (color) preloader.push(`background-color: ${color};`);
  if (isImage && o.size === 'full') preloader.push(`background-image: url("${o.src}");`, `background-size: ${o.fit};`, 'background-position: center;', 'background-repeat: no-repeat;', 'backdrop-filter: none;');
  if (preloader.length) lines.push(`#preloader { ${preloader.join(' ')} }`);
  if (isImage && o.size !== 'full') lines.push(`.splash-logo { content: url("${o.src}"); width: min(${SPLASH_SIZES[o.size]}px, 70vw); max-height: 70vh; height: auto; object-fit: contain; border-radius: 12px; filter: none; }`);
  else lines.push('.splash-logo { display: none; }');
  // только у заставки запуска: у загрузчиков чата и персонажей шестерёнка остаётся, пока не включён слой расширения
  if (!o.spinner) lines.push('#loader.splash-screen #load-spinner { display: none; }');
  if (o.text) lines.push(`.splash-message { font-size: 0; }`, `.splash-message::after { content: "${cssText(o.text)}"; font-size: 1.25rem;${ink ? ` color: ${ink};` : ''} }`);
  else lines.push('.splash-message { display: none; }');
  lines.push(SPLASH_END);
  return lines.join('\n');
}

/** Вставить блок в css-файл (заменив прежний блок Закулисья, остальное не трогая) или убрать его, если block пустой. */
export function mergeSplashCss(fileText, block) {
  const text = String(fileText ?? '');
  const start = text.indexOf(SPLASH_BEGIN);
  const end = text.indexOf(SPLASH_END);
  const cleaned = start >= 0 && end > start ? `${text.slice(0, start)}${text.slice(end + SPLASH_END.length)}`.replace(/\n{3,}/g, '\n\n').trimEnd() : text.trimEnd();
  return block ? `${cleaned}${cleaned ? '\n\n' : ''}${block}\n` : `${cleaned}${cleaned ? '\n' : ''}`;
}
