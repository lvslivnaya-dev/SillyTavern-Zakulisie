/**
 * Расширения через родной код таверны: включить и выключить (без перезагрузки, пока не нажмут «Перезагрузить»),
 * удалить (таверна сама перезагрузит страницу), проверить и поставить обновление, установить новое.
 */
import { PREFIX, externalId, folderName } from '../core/extensions.js';

let mods = null;
let loading = null;
const live = () => globalThis.SillyTavern?.getContext?.();
const REMOVE_ATTEMPTS = 4;

async function post(url, body) {
  return fetch(url, { method: 'POST', headers: live().getRequestHeaders(), body: JSON.stringify(body), cache: 'no-cache' });
}

export const extensionApi = {
  async ready() {
    if (mods) return;
    loading ??= import('../../../../../../extensions.js').then(ext => { mods = { ext }; });
    await loading;
  },
  names: () => [...(mods?.ext.extensionNames ?? [])],
  manifest: id => mods?.ext.getExtensionManifest(id) ?? null,
  disabled: () => [...(live()?.extensionSettings?.disabledExtensions ?? [])],
  types: () => ({ ...(mods?.ext.extensionTypes ?? {}) }),
  isGlobal: id => (mods?.ext.extensionTypes?.[id] ?? '') === 'global',

  async setEnabled(id, on) {
    if (on) await mods.ext.enableExtension(id, false);
    else await mods.ext.disableExtension(id, false);
  },

  /**
   * Удаление. Родная deleteExtension не смотрит на ответ сервера: если Windows не отдала папку (её держит
   * проводник, редактор кода, антивирус), она всё равно пишет «удалено» и перезагружает страницу, а папка остаётся.
   * Поэтому папку удаляем сами, проверяем ответ и пробуем ещё (сервер стирает по кусочкам, второй заход добивает остаток).
   * Когда папки нет, зовём родную функцию: она вызовет хуки расширения, сохранит настройки и перезагрузит страницу.
   */
  async remove(id) {
    const extensionName = externalId(id);
    const global = extensionApi.isGlobal(id);
    let failure = '';
    for (let attempt = 1; attempt <= REMOVE_ATTEMPTS; attempt += 1) {
      const response = await post('/api/extensions/delete', { extensionName, global });
      // 404: папки уже нет (предыдущий заход успел) — это то, что нужно
      if (response.ok || response.status === 404) { failure = ''; break; }
      failure = `${response.status} ${(await response.text().catch(() => '')).slice(0, 200)}`.trim();
      console.warn(`[Закулисье] Удаление «${extensionName}», попытка ${attempt}/${REMOVE_ATTEMPTS}: ${failure}`);
      if (attempt < REMOVE_ATTEMPTS) await new Promise(resolve => setTimeout(resolve, 700 * attempt));
    }
    if (failure) throw new Error(`Папка «${folderName(id)}» не удалилась (${failure}). Скорее всего, её держит другая программа: закрой проводник и редактор кода в этой папке и повтори. Что осталось на диске, видно в окне расширений после перезагрузки.`);
    await mods.ext.deleteExtension(extensionName);
  },

  /**
   * Когда папка расширения появилась: время изменения его manifest.json (так отдаёт сервер, Last-Modified).
   * Клон из git ставит одно время на все файлы, так что это день установки; обновление, которое правит манифест, сдвигает его.
   * 0 — не узнать (встроенные, нет манифеста).
   */
  async installedAt(id) {
    if (!id.startsWith(`${PREFIX}/`)) return 0;
    try {
      const response = await fetch(`/scripts/extensions/${id}/manifest.json`, { method: 'HEAD', cache: 'no-cache' });
      if (!response.ok) return 0;
      const stamp = Date.parse(response.headers.get('Last-Modified') ?? '');
      return Number.isFinite(stamp) ? stamp : 0;
    } catch { return 0; }
  },

  /** true — есть обновление, false — свежее, null — не git или ошибка. */
  async hasUpdate(id) {
    if (!id.startsWith(`${PREFIX}/`)) return null;
    try {
      const response = await post('/api/extensions/version', { extensionName: folderName(id), global: extensionApi.isGlobal(id) });
      if (!response.ok) return null;
      const data = await response.json();
      return typeof data?.isUpToDate === 'boolean' ? !data.isUpToDate : null;
    } catch { return null; }
  },

  /** Обновить из git. Возвращает короткий хеш нового коммита или '' если уже свежее. */
  async update(id) {
    const response = await post('/api/extensions/update', { extensionName: folderName(id), global: extensionApi.isGlobal(id) });
    if (!response.ok) throw new Error((await response.text()) || `/api/extensions/update: ${response.status}`);
    const data = await response.json();
    return data.isUpToDate ? '' : String(data.shortCommitHash ?? 'новая версия');
  },

  install: () => mods.ext.openThirdPartyExtensionMenu(),
  reload: () => globalThis.location?.reload(),
};
