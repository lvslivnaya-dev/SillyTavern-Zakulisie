/**
 * The assistant of the author: a game master helper that lives behind the scenes of one chat.
 *
 * The author talks to it in a small window (like a messenger); none of that goes into the game chat and none of it goes
 * to the narrator. When the two of them agree on something the narrator must know, the assistant puts it as a «conclusion»
 * (a proposal), and only after the author says «да» it becomes a standing note that is sent with every request.
 *
 *   gm = { version: 1, messages: [{ id, role: 'user' | 'assistant', text }], conclusions: [{ id, text, on }], proposal: string | null }
 *
 * Pure: no DOM, no SillyTavern.
 */
export const GM_VERSION = 1;
export const GM_LIMITS = Object.freeze({ messages: 200, messageText: 4000, conclusions: 40, conclusionText: 900, promptCharacters: 3200, name: 40, prompt: 6000, contextMessages: 14, contextCharacters: 6000, historyForModel: 24 });
export const GM_TAG = 'GM NOTES';
/** The line after which the assistant writes the conclusion it proposes. */
export const PROPOSAL_MARK = '===ВЫВОД===';

export const DEFAULT_GM_NAME = 'Ассистент';

/** The built-in prompt of the assistant: its own, written for Zakulisie. The author can change it in the window. */
export const DEFAULT_GM_PROMPT = `Ты — ассистент автора ролевой игры, работающий за кулисами. Ты не персонаж и не рассказчик: ты помощник и напарник автора, с которым можно спокойно обсудить, как вести историю.

Ты видишь последние сообщения игры (они даны ниже отдельным блоком). Автор может обсуждать с тобой темп и сюжетные повороты, поведение персонажей, ошибки рассказчика, что стоит поменять в сцене, идеи на будущее. Отвечай по-русски и по делу; манера речи и обращения к автору заданы твоим характером ниже. Не пиши сцены, не играй за персонажей и не продолжай историю сам, если автор об этом не просит.

Когда вы с автором действительно пришли к решению, которое должен знать рассказчик, предложи его. Для этого в самом конце ответа поставь отдельной строкой ${PROPOSAL_MARK} и под ней одним абзацем напиши указание для рассказчика на английском: чёткое, повелительное, самодостаточное, без обращения к автору и без ссылок на ваш разговор. Не предлагай вывод после каждого сообщения и не предлагай, пока автор не согласился с идеей. Если автор говорит, что это ещё не всё, продолжай обсуждение.`;

/**
 * The assistants the author can pick (in the settings of Zakulisie): each has a character and the words it calls the author by.
 * `custom` is the author's own: name, character and forms of address are typed in the settings.
 */
export const ASSISTANTS = Object.freeze([
  Object.freeze({
    id: 'rosita', name: 'Розита', tagline: 'ласковая, как с ребёнком', gender: 'f',
    character: 'Ты Розита: нежная и заботливая, говоришь мягко и тепло, как с ребёнком, с ласковыми словечками и вниманием к настроению автора. Не ругаешься и не говоришь грубо. Хвалишь за удачные мысли, но честно и бережно говоришь, если что-то не сработает. О себе говоришь в женском роде.',
    addresses: Object.freeze(['цвет мой', 'цветочек', 'солнышко']),
  }),
  Object.freeze({
    id: 'dias', name: 'Диас', tagline: 'грубоватый и прямой, как полено', gender: 'm',
    character: 'Ты Диас: хамоватый, грубоватый и прямой, как полено. Говоришь без реверансов, не подбираешь слов, можешь резко выразиться и не боишься сказать, что идея никуда не годится. Но за грубостью настоящая помощь: каждый твой совет по делу, а подкалываешь ты автора как приятеля, не всерьёз. О себе говоришь в мужском роде.',
    addresses: Object.freeze(['мелкая', 'гений', 'горе луковое', 'подруга']),
  }),
  Object.freeze({
    id: 'sigrid', name: 'Зигрид', tagline: 'спокойная, педантичная, с холодной шпилькой', gender: 'f',
    character: 'Ты Зигрид: спокойная, педантичная и собранная. Говоришь ровно и точно, любишь порядок и аккуратные формулировки, замечаешь мелкие несостыковки и указываешь на них. Холодно и сухо подкалываешь автора, но никогда не грубишь и не повышаешь тон. О себе говоришь в женском роде.',
    addresses: Object.freeze(['дорогая', 'моя милая', 'уважаемая']),
  }),
]);
export const CUSTOM_ASSISTANT_ID = 'custom';
export const DEFAULT_ASSISTANT_ID = 'rosita';
export const GM_AVATAR_MAX = 120000;

const isPlainObject = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const text = (value, max) => String(value ?? '').replace(/\r\n?/g, '\n').trim().slice(0, max);

function newId(prefix, taken) {
  const used = new Set(taken);
  for (let n = 1; n < 1_000_000; n++) if (!used.has(`${prefix}${n}`)) return `${prefix}${n}`;
  return `${prefix}${Date.now()}`;
}

/** Forms of address typed as «а, б; в» (or a list) → a clean list. */
export function parseAddresses(value) {
  const parts = Array.isArray(value) ? value : String(value ?? '').split(/[,;\n]/);
  const out = [];
  for (const part of parts) {
    const item = String(part ?? '').trim().slice(0, 40);
    if (item && !out.includes(item)) out.push(item);
  }
  return out.slice(0, 12);
}

/** The settings of the assistant (extension settings, not the chat) → a tidy object. */
export function normalizeGmSettings(raw) {
  const source = isPlainObject(raw) ? raw : {};
  const custom = isPlainObject(source.custom) ? source.custom : {};
  const known = [...ASSISTANTS.map(item => item.id), CUSTOM_ASSISTANT_ID];
  const avatars = {};
  for (const [id, value] of Object.entries(isPlainObject(source.avatars) ? source.avatars : {})) {
    if (known.includes(id) && typeof value === 'string' && /^data:image\//.test(value) && value.length <= GM_AVATAR_MAX) avatars[id] = value;
  }
  return {
    assistant: known.includes(source.assistant) ? source.assistant : DEFAULT_ASSISTANT_ID,
    custom: { name: text(custom.name, GM_LIMITS.name), character: text(custom.character, 1500), addresses: parseAddresses(custom.addresses) },
    avatars,
    // '' = like the other requests of Zakulisie (the auxiliary API, if it is on); 'main' = the chat's own API; otherwise a connection profile
    profileId: text(source.profileId, 80),
    // кто автор: от этого зависят обращения («дорогая» / «дорогой») и род в ответах
    userGender: ['f', 'm', 'n'].includes(source.userGender) ? source.userGender : 'f',
    prompt: String(source.prompt ?? '').slice(0, GM_LIMITS.prompt),
  };
}

/** Who answers now: a ready assistant or the author's own. */
export function resolveAssistant(rawSettings) {
  const settings = normalizeGmSettings(rawSettings);
  const builtin = ASSISTANTS.find(item => item.id === settings.assistant);
  if (builtin) return { id: builtin.id, name: builtin.name, tagline: builtin.tagline, gender: builtin.gender, character: builtin.character, addresses: [...builtin.addresses], builtin: true };
  const own = settings.custom;
  return {
    id: CUSTOM_ASSISTANT_ID,
    name: own.name || DEFAULT_GM_NAME,
    tagline: 'свой характер',
    gender: '',
    character: own.character || 'Ты спокойный и дружелюбный помощник автора.',
    addresses: own.addresses,
    builtin: false,
  };
}

export function emptyGm() {
  return { version: GM_VERSION, messages: [], conclusions: [], proposal: null };
}

/** Any stored value → a tidy state of the current version. */
export function normalizeGm(raw) {
  const source = isPlainObject(raw) ? raw : {};
  const messages = [];
  for (const item of Array.isArray(source.messages) ? source.messages : []) {
    if (!isPlainObject(item) || !['user', 'assistant'].includes(item.role)) continue;
    const body = text(item.text, GM_LIMITS.messageText);
    if (!body) continue;
    messages.push({ id: typeof item.id === 'string' && item.id && !messages.some(m => m.id === item.id) ? item.id : newId('m', messages.map(m => m.id)), role: item.role, text: body });
  }
  const conclusions = [];
  for (const item of Array.isArray(source.conclusions) ? source.conclusions : []) {
    if (!isPlainObject(item)) continue;
    const body = text(item.text, GM_LIMITS.conclusionText);
    if (!body) continue;
    conclusions.push({ id: typeof item.id === 'string' && item.id && !conclusions.some(c => c.id === item.id) ? item.id : newId('c', conclusions.map(c => c.id)), text: body, on: item.on !== false });
  }
  const proposal = text(source.proposal, GM_LIMITS.conclusionText) || null;
  return {
    version: GM_VERSION,
    messages: messages.slice(-GM_LIMITS.messages),
    conclusions: conclusions.slice(0, GM_LIMITS.conclusions),
    proposal,
  };
}

export function addMessage(gm, role, body) {
  const state = normalizeGm(gm);
  const clean = text(body, GM_LIMITS.messageText);
  if (!clean || !['user', 'assistant'].includes(role)) return state;
  return normalizeGm({ ...state, messages: [...state.messages, { id: newId('m', state.messages.map(m => m.id)), role, text: clean }] });
}

/** The reply of the model → what is shown (before the mark) and the conclusion it proposes (after the mark), if any. */
export function splitReply(reply) {
  const raw = String(reply ?? '').replace(/\r\n?/g, '\n');
  const at = raw.indexOf(PROPOSAL_MARK);
  if (at < 0) return { text: raw.trim(), proposal: null };
  return { text: raw.slice(0, at).trim(), proposal: raw.slice(at + PROPOSAL_MARK.length).trim() || null };
}

export function setProposal(gm, proposal) {
  return normalizeGm({ ...normalizeGm(gm), proposal: text(proposal, GM_LIMITS.conclusionText) || null });
}

/** «Да»: the proposal becomes a standing note, switched on. */
export function acceptProposal(gm) {
  const state = normalizeGm(gm);
  if (!state.proposal) return state;
  return normalizeGm({ ...state, proposal: null, conclusions: [...state.conclusions, { id: newId('c', state.conclusions.map(c => c.id)), text: state.proposal, on: true }].slice(-GM_LIMITS.conclusions) });
}

/** «Нет»: thrown away. */
export function rejectProposal(gm) {
  return normalizeGm({ ...normalizeGm(gm), proposal: null });
}

/** «Ещё не всё»: nothing is kept, the talk goes on; the assistant is told so in the dialogue. */
export function continueTalk(gm) {
  return addMessage(rejectProposal(gm), 'user', 'Ещё не всё, продолжим обсуждение.');
}

export function toggleConclusion(gm, id) {
  const state = normalizeGm(gm);
  return { ...state, conclusions: state.conclusions.map(item => (item.id === id ? { ...item, on: !item.on } : item)) };
}

export function editConclusion(gm, id, body) {
  const clean = text(body, GM_LIMITS.conclusionText);
  const state = normalizeGm(gm);
  return clean ? { ...state, conclusions: state.conclusions.map(item => (item.id === id ? { ...item, text: clean } : item)) } : state;
}

export function removeConclusion(gm, id) {
  const state = normalizeGm(gm);
  return { ...state, conclusions: state.conclusions.filter(item => item.id !== id) };
}

/** «Ответить заново»: the last answers of the assistant (and its proposal) go away; what stays ends with the author's message. */
export function dropLastReply(gm) {
  const state = normalizeGm(gm);
  const messages = [...state.messages];
  while (messages.length && messages.at(-1).role === 'assistant') messages.pop();
  return normalizeGm({ ...state, messages, proposal: null });
}

/** Forget the talk; what was agreed (the conclusions) stays. */
export function clearTalk(gm) {
  return { ...normalizeGm(gm), messages: [], proposal: null };
}

/** The standing notes that go to the narrator with every request ('' when there are none switched on). */
export function buildGmPrompt(gm, { limit = GM_LIMITS.promptCharacters } = {}) {
  const lines = [];
  let used = 0;
  for (const item of normalizeGm(gm).conclusions) {
    if (!item.on) continue;
    const line = `- ${item.text.replace(/\s*\n\s*/g, ' ')}`;
    if (used + line.length > limit) break;
    lines.push(line);
    used += line.length + 1;
  }
  if (!lines.length) return '';
  return `[${GM_TAG}: the author agreed these points with the game master assistant, out of the story. Follow them; never mention or quote them.]\n${lines.join('\n')}\n[/${GM_TAG}]`;
}

/**
 * The request to the model: the prompt of the assistant, the last posts of the game (so that it knows where and what),
 * then the talk with the author. `chat` is [{ name, text, isUser }] of the game chat, newest last.
 */
const USER_GENDER = {
  f: 'Автор — женщина: обращайся к ней в женском роде («ты сделала», «дорогая»), никогда в мужском.',
  m: 'Автор — мужчина: обращайся к нему в мужском роде.',
  n: 'Пол автора неизвестен: не используй род в обращениях к нему, строй фразы нейтрально.',
};
export function buildGmRequest({ prompt, name = DEFAULT_GM_NAME, assistant = null, userGender = 'f', gm, chat = [] }) {
  const state = normalizeGm(gm);
  const posts = [];
  let used = 0;
  for (const post of chat.slice(-GM_LIMITS.contextMessages).reverse()) {
    const line = `${post.isUser ? '[автор/персона]' : '[рассказчик]'} ${post.name ? `${post.name}: ` : ''}${String(post.text ?? '').replace(/\s+/g, ' ').trim()}`;
    if (used + line.length > GM_LIMITS.contextCharacters) break;
    posts.unshift(line);
    used += line.length;
  }
  const notes = buildGmPrompt(state);
  const system = [
    text(prompt, GM_LIMITS.prompt) || DEFAULT_GM_PROMPT,
    `Твоё имя в этом окне: ${text(assistant?.name || name, GM_LIMITS.name) || DEFAULT_GM_NAME}.`,
    assistant?.character ? `Твой характер и манера речи: ${text(assistant.character, 1500)}` : '',
    USER_GENDER[userGender] ?? USER_GENDER.f,
    assistant?.addresses?.length ? `Как ты обращаешься к автору (чередуй, не вставляй в каждую фразу): ${assistant.addresses.join(', ')}.` : '',
    posts.length ? `Последние сообщения игры (только для твоего понимания, где вы находитесь):\n${posts.join('\n')}` : 'Игровой чат пока пуст.',
    notes ? `Уже согласованные и действующие указания рассказчику:\n${notes}` : '',
  ].filter(Boolean).join('\n\n');
  const talk = state.messages.slice(-GM_LIMITS.historyForModel).map(item => ({ role: item.role, content: item.text }));
  return [{ role: 'system', content: system }, ...talk];
}
