/**
 * Данные чата, которые Закулисье хранит само (нити, настроения героев): в метаданных чата под своим ключом.
 * Ссылку на chatMetadata не держим: таверна подменяет объект при смене чата, поэтому читаем и пишем всегда заново.
 */
export const META_KEY = 'zakulisie_pud';

const clone = value => (value === undefined ? value : JSON.parse(JSON.stringify(value)));

/** Значение по ключу или fallback (копия, правки снаружи не попадают в чат). */
export function readMeta(context, key, fallback = null) {
  const value = context?.chatMetadata?.[META_KEY]?.[key];
  return value === undefined ? fallback : clone(value);
}

/** Записывает значение и просит таверну сохранить метаданные. false — чата нет. */
export function writeMeta(context, key, value) {
  const meta = context?.chatMetadata;
  if (!meta || typeof meta !== 'object') return false;
  const bag = (meta[META_KEY] && typeof meta[META_KEY] === 'object' ? meta[META_KEY] : (meta[META_KEY] = {}));
  bag[key] = clone(value);
  try { (context.saveMetadataDebounced ?? context.saveMetadata)?.call(context); } catch { /* сохранится со следующей записью */ }
  return true;
}

/** Блок для `setExtensionPrompt`: position IN_CHAT (1), роль system (0). */
export const PROMPT_POSITION_IN_CHAT = 1;
export const PROMPT_ROLE_SYSTEM = 0;

/** Ставит или снимает (пустой text) свой блок в промпте. */
export function setPromptBlock(context, key, text, depth = 1) {
  try { context.setExtensionPrompt?.(key, text || '', PROMPT_POSITION_IN_CHAT, depth, false, PROMPT_ROLE_SYSTEM); } catch { /* таверна без setExtensionPrompt */ }
}
