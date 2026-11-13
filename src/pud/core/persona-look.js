/**
 * «Внешность по картинке»: описание постоянной внешности персоны по её картинке, по-русски, с пожеланиями.
 * Потом, когда текст одобрен, он переводится на английский (токенов меньше) и кладётся в описание персоны
 * в свой блок с пометкой, чтобы повторное описание заменяло только его.
 * Чистые функции: запросы к модели делает persona-look-api.js, окно рисует ui/persona-look.js.
 */

export const LOOK_BLOCKS = Object.freeze({
  ru: { open: '[Внешность]', close: '[/Внешность]' },
  en: { open: '[Appearance]', close: '[/Appearance]' },
});

export const LOOK_LIMITS = Object.freeze({ wishes: 1200, text: 12000 });
export const LOOK_MODES = Object.freeze({ profile: 'Профиль подключения', main: 'Как у таверны' });

/** Настройки модели для описания картинок. */
export function lookSettings(raw) {
  const value = raw && typeof raw === 'object' ? raw : {};
  return {
    mode: Object.hasOwn(LOOK_MODES, value.mode) ? value.mode : 'profile',
    profileId: typeof value.profileId === 'string' ? value.profileId : '',
    // 1500 было прежним значением по умолчанию: модели с размышлениями упирались в него и обрывали текст
    maxTokens: Math.max(300, Math.min(32000, ([1500, 6000].includes(Number(value.maxTokens)) ? 0 : Math.round(Number(value.maxTokens))) || 5000)),
  };
}

const clip = (value, max) => String(value ?? '').replace(/\r\n?/g, '\n').trim().slice(0, max);

/** Что запомнено у персоны: пожелания и оба текста. */
export function lookMemory(raw) {
  const value = raw && typeof raw === 'object' ? raw : {};
  return {
    wishes: clip(value.wishes, LOOK_LIMITS.wishes),
    voice: value.voice === true,
    voiceWishes: clip(value.voiceWishes, LOOK_LIMITS.wishes),
    ru: clip(value.ru, LOOK_LIMITS.text),
    en: clip(value.en, LOOK_LIMITS.text),
  };
}

// ---- Запросы ---------------------------------------------------------------------

const APPEARANCE_RULES = `You write the PERMANENT APPEARANCE of a roleplay character from the picture, in Russian, as plain continuous prose: third person, present tense, no lists, no headings, no quotes, no mention of the picture. 4 to 7 sentences.
Include what does not change from scene to scene: the face (shape, eyes and their colour, brows, nose, lips), the hair (natural colour, length, texture; a hairstyle only as a plain fact), skin, build, hands, and lasting marks (freckles, moles, scars, tattoos, fangs, permanent piercings).
Leave out everything that changes: clothes, shoes, bags, jewellery that is taken off, make-up, glasses if they look like an accessory, the pose, a single moment's expression or mood, the background, lighting.
Describe only what the picture shows. Do not invent a personality, a past or a name.`;

const VOICE_RULES = `After the appearance, add 2 to 3 sentences about the VOICE: how it sounds in different moments (calm, excited, angry, tender, tired): pitch, timbre, tempo, volume, how it changes. Do not give catchphrases, speech quirks, example lines or quotes; only how the voice sounds.`;

/** Запрос на описание: текст для модели (картинка идёт отдельной частью). */
export function describePrompt({ wishes = '', voice = false, voiceWishes = '', name = '' } = {}) {
  const parts = [APPEARANCE_RULES];
  if (voice) parts.push(VOICE_RULES);
  if (name) parts.push(`The character is called «${name}»; use the name only where it reads naturally, otherwise pronouns.`);
  const asked = clip(wishes, LOOK_LIMITS.wishes);
  if (asked) parts.push(`The user's wishes about the appearance. They are facts about the character and win over the picture and over the rules above:\n${asked}`);
  const askedVoice = clip(voiceWishes, LOOK_LIMITS.wishes);
  if (voice && askedVoice) parts.push(`The user's wishes about the voice:\n${askedVoice}`);
  parts.push('Answer with the Russian text only: no preface, no markup.');
  return parts.join('\n\n');
}

/** Запрос на перевод одобренного текста. */
export function translatePrompt(text) {
  return `Translate this description of a roleplay character's appearance (and voice, if there is one) from Russian into English.
Keep every fact and every detail. Write compact, natural English as plain continuous prose: third person, present tense, no lists, no headings, the fewest words that lose nothing. Keep proper names as they are written in Latin letters (a Japanese name in the usual Hepburn spelling).
Answer with the English text only: no preface, no markup, no notes.

${clip(text, LOOK_LIMITS.text)}`;
}

/** Ответ модели → чистый текст: без размышлений, ограждений кода и вступлений вроде «Вот описание:». */
export function cleanModelText(raw) {
  let text = String(raw ?? '')
    .replace(/<think(?:ing)?>[\s\S]*?<\/think(?:ing)?>/gi, '')
    .replace(/^```\w*\s*|\s*```$/g, '')
    .trim();
  text = text.replace(/^(?:вот|here(?:'s| is)|description|описание|translation|перевод)[^\n:]{0,60}:\s*\n+/i, '').trim();
  text = text.replace(/^["«»“”]+|["«»“”]+$/g, '').trim();
  return text.slice(0, LOOK_LIMITS.text);
}

// ---- Блок в описании персоны -------------------------------------------------------------

const escapeRegex = value => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const blockPattern = () => new RegExp(`(?:${Object.values(LOOK_BLOCKS).map(block => `${escapeRegex(block.open)}[\\s\\S]*?${escapeRegex(block.close)}`).join('|')})`, 'g');

/** Текст блока внешности в описании (русского или английского), или ''. */
export function readLookBlock(description) {
  const found = String(description ?? '').match(blockPattern());
  if (!found) return '';
  return found[0].replace(/^\[[^\]]+\]\s*/, '').replace(/\s*\[\/[^\]]+\]$/, '').trim();
}

/**
 * Кладёт текст в блок внешности. Блок, который уже есть (на любом языке), заменяется на месте,
 * лишние копии убираются; остальной текст не трогается. Нет блока: добавляется в конец.
 */
export function putLookBlock(description, text, lang = 'en') {
  const block = LOOK_BLOCKS[lang] ?? LOOK_BLOCKS.en;
  const body = `${block.open}\n${clip(text, LOOK_LIMITS.text)}\n${block.close}`;
  const source = String(description ?? '');
  let placed = false;
  const replaced = source.replace(blockPattern(), () => { if (placed) return ''; placed = true; return body; });
  if (placed) return replaced.replace(/\n{3,}/g, '\n\n').trim();
  return source.trim() ? `${source.replace(/\s+$/, '')}\n\n${body}` : body;
}

/** Описание без блока внешности. */
export function removeLookBlock(description) {
  return String(description ?? '').replace(blockPattern(), '').replace(/\n{3,}/g, '\n\n').trim();
}
