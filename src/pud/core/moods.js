import { isIconData } from '../../shared/custom-icons.js';
/**
 * Настроение героев сцены: маленький значок на плашке героя (рука автора или «определить по чату»).
 * Живёт в метаданных чата: имя героя → id настроения. Настроения уходят модели одной короткой строкой.
 */

export const MOODS = Object.freeze([
  { id: 'calm', label: 'спокоен', emoji: '😌', en: 'calm' },
  { id: 'happy', label: 'радуется', emoji: '😊', en: 'happy' },
  { id: 'love', label: 'влюблён', emoji: '🥰', en: 'smitten' },
  { id: 'shy', label: 'смущён', emoji: '😳', en: 'embarrassed' },
  { id: 'smirk', label: 'ехидничает', emoji: '😏', en: 'smug and teasing' },
  { id: 'angry', label: 'злится', emoji: '😠', en: 'angry' },
  { id: 'sad', label: 'грустит', emoji: '😢', en: 'sad' },
  { id: 'scared', label: 'боится', emoji: '😨', en: 'afraid' },
  { id: 'jealous', label: 'ревнует', emoji: '😒', en: 'jealous' },
  { id: 'tense', label: 'напряжён', emoji: '😬', en: 'tense' },
  { id: 'aroused', label: 'возбуждён', emoji: '🔥', en: 'aroused' },
  { id: 'tired', label: 'устал', emoji: '😴', en: 'tired' },
]);

const BY_ID = new Map(MOODS.map(item => [item.id, item]));
const byId = list => (list === MOODS ? BY_ID : new Map(list.map(item => [item.id, item])));
export const moodOf = (id, list = MOODS) => byId(list).get(id) ?? null;

export const MOOD_EMOJI_LIMIT = 8;
export const MOOD_CUSTOM_LIMIT = 12;
const HEX = /^#[0-9a-f]{6}$/i;

/** Настройки настроений: свои значки встроенных ({ id: эмодзи }) и свои настроения ([{ id, label, emoji, en, color }]). */
export function normalizeMoodConfig(raw) {
  const source = raw && typeof raw === 'object' ? raw : {};
  const icons = {};
  for (const item of MOODS) {
    const value = String(source.icons?.[item.id] ?? '').trim().slice(0, MOOD_EMOJI_LIMIT);
    if (value && value !== item.emoji) icons[item.id] = value;
  }
  const seen = new Set(MOODS.map(item => item.id));
  const custom = [];
  for (const entry of Array.isArray(source.custom) ? source.custom : []) {
    if (!entry || typeof entry !== 'object' || custom.length >= MOOD_CUSTOM_LIMIT) continue;
    const label = String(entry.label ?? '').trim().slice(0, 24);
    if (!label) continue;
    let id = /^c-[a-z0-9]{1,12}$/.test(String(entry.id)) ? String(entry.id) : '';
    if (!id || seen.has(id)) id = `c-${Math.random().toString(36).slice(2, 8)}`;
    seen.add(id);
    custom.push({
      id,
      label,
      emoji: String(entry.emoji ?? '').trim().slice(0, MOOD_EMOJI_LIMIT) || '🙂',
      en: String(entry.en ?? '').trim().slice(0, 80),
      color: HEX.test(String(entry.color)) ? String(entry.color).toLowerCase() : '#9a8fb0',
    });
  }
  // свои картинки вместо значков: { id настроения: data-ссылка }, только для существующих настроений
  const images = {};
  for (const [id, data] of Object.entries(source.images && typeof source.images === 'object' ? source.images : {})) {
    if ((seen.has(id)) && isIconData(data)) images[id] = data;
  }
  // убранные из шаблонов встроенные настроения: на плашках, в автоопределении и в промпте их нет, вернуть можно в «Иконках»
  const hidden = (Array.isArray(source.hidden) ? source.hidden : []).filter(id => MOODS.some(item => item.id === id));
  return { icons, custom, images, hidden: [...new Set(hidden)] };
}

/** Полный список настроений: встроенные (с её значками) и свои. */
export function moodList(config, { all = false } = {}) {
  const { icons, custom, images, hidden } = normalizeMoodConfig(config);
  const withImage = item => (images[item.id] ? { ...item, image: images[item.id] } : item);
  return [...MOODS.filter(item => all || !hidden.includes(item.id)).map(item => withImage(icons[item.id] ? { ...item, emoji: icons[item.id] } : item)), ...custom.map(item => withImage({ ...item, en: item.en || item.label }))];
}

/** Заготовка нового своего настроения. */
export const newCustomMood = () => ({ id: `c-${Math.random().toString(36).slice(2, 8)}`, label: 'Новое', emoji: '🙂', en: '', color: '#9a8fb0' });

/** { имя: { mood } } из метаданных → то же без мусора. */
export function normalizeMoods(raw, list = MOODS) {
  const known = byId(list);
  const out = {};
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return out;
  for (const [name, value] of Object.entries(raw)) {
    const key = String(name).trim().slice(0, 80);
    if (key && known.has(value?.mood)) out[key] = { mood: value.mood, at: Number.isFinite(value.at) ? value.at : 0 };
  }
  return out;
}

/** Ставит или (mood пустой) снимает настроение. */
export function setMood(moods, name, mood, at = Date.now(), list = MOODS) {
  const key = String(name ?? '').trim().slice(0, 80);
  if (!key) return moods;
  const next = { ...moods };
  if (byId(list).has(mood)) next[key] = { mood, at };
  else delete next[key];
  return next;
}

/** Строка про настроения для модели ('' — ни у кого нет). Только те, кто на сцене, если список передан. */
export function moodsBlock(moods, cast = null, list = MOODS) {
  const known = byId(list);
  const names = Object.keys(moods).filter(name => known.has(moods[name]?.mood) && (!cast || cast.some(item => item.toLowerCase() === name.toLowerCase())));
  if (!names.length) return '';
  return `[Current moods: ${names.map(name => `${name} is ${known.get(moods[name].mood).en}`).join('; ')}. Let it colour their words and body language; do not announce it.]`;
}

/** Запрос «какое сейчас настроение у героев» по последним сообщениям. */
export function buildMoodMessages({ chat, names, list = MOODS }) {
  const lines = chat.map(item => (item.isUser ? `[пост автора, ${item.name || 'персона'}] ${item.text}` : `[ответ, ${item.name || 'Рассказчик'}] ${item.text}`));
  const ids = list.map(item => `${item.id} (${item.label}${item.en && item.en !== item.label ? `: ${item.en}` : ''})`).join(', ');
  return [
    { role: 'system', content: 'Ты помощник автора ролевого чата. По последним сообщениям ты определяешь, в каком настроении сейчас находится каждый из перечисленных героев. Читай и посты автора (там настроение героя часто видно по тому, что автор о нём пишет или как к нему обращается), и ответы рассказчика; побеждает то, что произошло позже. Опирайся на слова, поступки, мимику и реакцию других героев. Если по тексту настроение не видно, пропусти героя.' },
    { role: 'user', content: `Переписка (старое выше, новое ниже):\n\n${lines.join('\n\n')}\n\nГерои: ${names.join(', ')}.\nДопустимые настроения: ${ids}.\nВерни СТРОГО JSON-объект без пояснений и markdown: {"Имя героя":"id настроения"}.` },
  ];
}

/** Ответ модели → { имя: id } только для известных имён и настроений. */
/** Имя для сравнения: без регистра, «ё» как «е», без скобок («Имя (АУ агентство)» → «имя»). */
const nameKey = value => String(value ?? '').toLowerCase().replace(/ё/g, 'е').replace(/\([^)]*\)|\[[^\]]*\]/g, ' ').replace(/[^\p{L}\p{N} ]+/gu, ' ').replace(/\s+/g, ' ').trim();

/**
 * Какой из героев имеется в виду: точное имя, потом имя без скобок, потом слова имени (модель часто отвечает «Мина» вместо «Асидо Мина»),
 * но только если так подходит один-единственный герой: лучше пропустить, чем перепутать.
 */
function matchName(name, names) {
  const exact = names.find(item => item.toLowerCase() === String(name).trim().toLowerCase());
  if (exact) return exact;
  const key = nameKey(name);
  if (!key) return '';
  const same = names.filter(item => nameKey(item) === key);
  if (same.length === 1) return same[0];
  const part = names.filter(item => { const words = nameKey(item).split(' '); return key.split(' ').every(word => words.includes(word)) || words.every(word => key.split(' ').includes(word)); });
  return part.length === 1 ? part[0] : '';
}

/** Настроение, названное моделью: id, русское название или значок-эмодзи. */
function matchMood(value, list, known) {
  const raw = String(value ?? '').trim();
  if (known.has(raw)) return raw;
  const low = raw.toLowerCase();
  return list.find(item => item.id.toLowerCase() === low || String(item.label ?? '').toLowerCase() === low || (item.emoji && item.emoji === raw))?.id ?? '';
}

export function parseMoodAnswer(raw, names, list = MOODS) {
  const known = byId(list);
  const text = String(raw ?? '').replace(/<(think|thinking|reasoning)>[\s\S]*?<\/\1>/gi, ' ');
  const start = text.indexOf('{');
  if (start < 0) return {};
  let pairs = [];
  const end = text.lastIndexOf('}');
  try {
    if (end <= start) throw new Error('no closing brace');
    pairs = Object.entries(JSON.parse(text.slice(start, end + 1)) ?? {});
  } catch {
    // Не разобралось как JSON (обрезано по токенам, лишняя запятая): выбираем пары "имя": "настроение" по одной, ответ не пропадает целиком.
    pairs = [...text.slice(start).matchAll(/"([^"\n]{1,80})"\s*:\s*"([^"\n]{1,40})"/g)].map(match => [match[1], match[2]]);
  }
  const out = {};
  for (const [name, value] of pairs) {
    const who = matchName(name, names);
    const id = matchMood(value, list, known);
    if (who && id) out[who] = id;
  }
  return out;
}
