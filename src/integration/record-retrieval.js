/**
 * Meaning-based choice for the records the narrator gets: memories, tensions, the records of the library and the chronicle.
 *
 * The scene decides first (who is on stage, who knows a record: core/prompt.js, core/bond-records.js). Meaning only ranks what already fits,
 * so that when the budget is short the lines closest to the last posts stay. Pure parts here; the model call is embedTexts.
 */
import { cosine, embedTexts } from './embeddings.js';
export { relativeScores } from '../core/semantic.js';

/** Most texts embedded at once for one scene: the vectors are cached, so the next reply costs only what is new. */
export const SEMANTIC_TEXT_LIMIT = 400;

/**
 * { text → cosine similarity to the scene } for the given texts, or throws when the model is slow or off.
 * `waitMs`: past it this generation goes without meaning (the vectors keep loading in the background and are cached).
 */
export async function textSimilarities(config, sceneText, texts, waitMs = 8000) {
  const unique = [...new Set(texts.map(text => String(text ?? '').trim()).filter(Boolean))].slice(0, SEMANTIC_TEXT_LIMIT);
  if (!unique.length) return new Map();
  const work = (async () => {
    const [scene] = await embedTexts(config, [String(sceneText ?? '').slice(-1500) || ' '], 'query');
    const vectors = await embedTexts(config, unique, 'passage');
    return new Map(unique.map((text, index) => [text, cosine(scene, vectors[index])]));
  })();
  work.catch(() => {});
  return Promise.race([work, new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), waitMs))]);
}
