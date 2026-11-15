/**
 * Запрос к модели для реплик Сливы.
 *   - id профиля подключения: отдельный запрос через Connection Manager таверны (ключ остаётся у таверны), идёт параллельно с ответом чата;
 *   - 'main': модель чата таверны. Её вызывают только когда чат не пишет ответ: у таверны один общий слот длины ответа.
 */
export { listProfiles } from './persona-look-api.js';

function contentOf(result) {
  const content = typeof result === 'string' ? result : result?.content;
  if (typeof content !== 'string' || !content.trim()) throw new Error('Модель вернула пустой ответ.');
  return content;
}

/**
 * @param {any} context getContext() таверны
 * @param {string} profile id профиля или 'main'
 * @param {Array<{role:string,content:string}>} messages
 * @param {number} maxTokens
 */
export async function askModel(context, profile, messages, maxTokens) {
  if (!profile) throw new Error('Не выбрано, чем писать комментарии.');
  if (profile === 'main') return contentOf(await context.generateRaw({ prompt: messages, trimNames: false }));
  const service = context.ConnectionManagerRequestService;
  if (!service) throw new Error('В этой версии таверны нет профилей подключений.');
  return contentOf(await service.sendRequest(profile, messages, maxTokens));
}

/**
 * Чем «помощники Сливы» (нити, настроения героев) пишут запросы: тем же, что комментарии Сливы
 * (вкладка «Слива» → «Чем писать»). Пусто — понятная ошибка, куда идти.
 */
export function helperProfile(settings) {
  const profile = settings?.peek?.commentProfile ?? '';
  if (!profile) throw new Error('Сначала выберите модель во вкладке «Слива» (поле «Чем писать»).');
  return profile;
}
