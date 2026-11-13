/**
 * Расширения через родной код таверны: включить и выключить (без перезагрузки, пока не нажмут «Перезагрузить»),
 * удалить (таверна сама перезагрузит страницу), проверить и поставить обновление, установить новое.
 */
import { PREFIX, externalId, folderName } from '../core/extensions.js';

let mods = null;
let loading = null;
const live = () => globalThis.SillyTavern?.getContext?.();

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

  /** Удаление: родная функция, после неё таверна перезагружается сама. */
  async remove(id) { await mods.ext.deleteExtension(externalId(id)); },

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
