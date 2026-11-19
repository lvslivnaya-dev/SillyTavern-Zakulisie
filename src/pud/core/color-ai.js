/**
 * Цвета по описанию для маленьких наборов (стикеры отношений, правила темы по настроению).
 * Как «Палитра по описанию», только ответ проще: { id: "#rrggbb" }. Чистая логика: запрос и разбор ответа.
 */
import { normalizeHex } from './palettes.js';
import { parsePaletteReply } from './palette-ai.js';

/**
 * @param {string} description что хочет человек («нежная осень», «ночь и дождь»)
 * @param {{ id: string, label: string, hint?: string, current?: string }[]} roles что надо покрасить
 * @param {string} about для чего эти цвета (одна фраза по-английски)
 */
export function buildColorsPrompt(description, roles, about) {
  const list = roles.map(role => `- ${role.id}: ${role.label}${role.hint ? ` — ${role.hint}` : ''}${role.current ? ` (now ${role.current})` : ''}`).join('\n');
  const systemPrompt = [
    'You are a UI color designer for a cozy chat app. You answer with one JSON object and nothing else.',
    `The colors are for: ${about}.`,
    'Keys of the object are the ids below, every value is a color "#rrggbb". Pick colors that go well together and match the description.',
    'Ids (descriptions are in Russian):',
    list,
  ].join('\n');
  const prompt = `Pick the colors for this description: «${String(description).trim()}». Reply with the JSON object only.`;
  return { systemPrompt, prompt };
}

/** { id: "#rrggbb" } только для нужных id; остальное выбрасывается. */
export function colorsFromReply(reply, ids) {
  const data = parsePaletteReply(reply);
  const out = {};
  for (const id of ids) {
    const hex = normalizeHex(data[id]);
    if (hex) out[id] = hex;
  }
  if (!Object.keys(out).length) throw new Error('в ответе модели нет ни одного цвета');
  return out;
}
