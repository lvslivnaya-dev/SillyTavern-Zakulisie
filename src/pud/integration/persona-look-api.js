/**
 * Запросы для «Внешности по картинке»: модель смотрит на картинку, потом переводит текст.
 *   - 'profile': профиль Connection Manager таверны (ключ остаётся у таверны);
 *   - 'main':    модель чата таверны (только Chat Completion).
 * Картинка уходит как часть image_url (OpenAI-стиль): сервер таверны переводит её для Claude, Gemini и остальных.
 */
import { lookSettings } from '../core/persona-look.js';

/** Профили подключений, пригодные для запросов: [{ id, name }]. */
export function listProfiles(context) {
  try {
    return (context.ConnectionManagerRequestService?.getSupportedProfiles?.() ?? []).map(profile => ({ id: profile.id, name: profile.name || profile.id }));
  } catch { return []; }
}

function contentOf(result) {
  const content = typeof result === 'string' ? result : result?.content;
  if (typeof content !== 'string' || !content.trim()) throw new Error('Модель вернула пустой ответ.');
  return content;
}

async function viaProfile(context, settings, messages) {
  const service = context.ConnectionManagerRequestService;
  if (!service) throw new Error('В этой версии таверны нет профилей подключений.');
  if (!settings.profileId) throw new Error('Выбери профиль подключения, которым описывать.');
  return contentOf(await service.sendRequest(settings.profileId, messages, settings.maxTokens));
}

/** Модель чата таверны. С картинкой: только Chat Completion API. */
async function viaMain(context, settings, messages, { image }) {
  if (!image) {
    const raw = await context.generateRaw({ prompt: messages, trimNames: false });
    return contentOf(raw);
  }
  if (context.mainApi !== 'openai') throw new Error('«Как у таверны» с картинками работает только с Chat Completion API. Выбери профиль подключения.');
  const service = context.ChatCompletionService;
  const oai = context.chatCompletionSettings;
  if (!service || !oai) throw new Error('Эта версия таверны не даёт расширениям запросы к модели чата. Выбери профиль подключения.');
  const result = await service.processRequest({
    stream: false,
    messages,
    max_tokens: settings.maxTokens,
    model: context.getChatCompletionModel?.(),
    chat_completion_source: oai.chat_completion_source,
    custom_url: oai.custom_url || undefined,
    reverse_proxy: oai.reverse_proxy || undefined,
    proxy_password: oai.proxy_password || undefined,
  }, {}, true);
  return contentOf(result);
}

/** Спросить про картинку (data: URL). Возвращает сырой текст модели. */
export async function askAboutPicture(context, rawSettings, dataUrl, prompt) {
  if (!/^data:image\//.test(String(dataUrl ?? ''))) throw new TypeError('Нужна картинка.');
  const settings = lookSettings(rawSettings);
  const messages = [{ role: 'user', content: [{ type: 'text', text: prompt }, { type: 'image_url', image_url: { url: dataUrl } }] }];
  return settings.mode === 'main' ? viaMain(context, settings, messages, { image: true }) : viaProfile(context, settings, messages);
}

/** Обычный текстовый запрос (перевод). */
export async function askText(context, rawSettings, prompt) {
  const settings = lookSettings(rawSettings);
  const messages = [{ role: 'user', content: prompt }];
  return settings.mode === 'main' ? viaMain(context, settings, messages, { image: false }) : viaProfile(context, settings, messages);
}

const readAsDataUrl = (view, blob) => new Promise((resolve, reject) => {
  const reader = new view.FileReader();
  reader.onload = () => resolve(String(reader.result));
  reader.onerror = () => reject(reader.error ?? new Error('Не прочиталась картинка.'));
  reader.readAsDataURL(blob);
});

/**
 * Картинка (файл или адрес) → data: URL не больше maxSide по длинной стороне: меньше токенов и быстрее.
 * Если уменьшить нельзя (нет canvas), уходит как есть.
 */
export async function pictureDataUrl(doc, source, { maxSide = 1024 } = {}) {
  const view = doc.defaultView;
  let blob = source;
  if (typeof source === 'string') {
    const response = await view.fetch(source, { cache: 'reload' });
    if (!response.ok) throw new Error(`Картинка не открылась (${response.status}).`);
    blob = await response.blob();
  }
  const original = await readAsDataUrl(view, blob);
  try {
    const image = new view.Image();
    await new Promise((resolve, reject) => { image.onload = resolve; image.onerror = reject; image.src = original; });
    const scale = Math.min(1, maxSide / Math.max(image.naturalWidth, image.naturalHeight, 1));
    if (scale >= 1) return original;
    const canvas = doc.createElement('canvas');
    canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
    canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
    canvas.getContext('2d').drawImage(image, 0, 0, canvas.width, canvas.height);
    return canvas.toDataURL('image/jpeg', 0.88);
  } catch { return original; }
}
