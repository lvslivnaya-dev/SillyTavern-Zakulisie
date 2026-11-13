/**
 * Лорбуки через родной код таверны (world-info.js).
 * Переименование повторяет родное: сохранить под новым именем, удалить старое и перевязать ссылки
 * (доп. лорбуки персонажей, лорбуки персон, лорбук чата, основной лорбук персонажей, глобальное включение).
 */
let mods = null;
let loading = null;
const live = () => globalThis.SillyTavern?.getContext?.();

export const loreApi = {
  async ready() {
    if (mods) return;
    loading ??= Promise.all([
      import('../../../../../../world-info.js'),
      import('../../../../../../utils.js'),
      import('../../../../../../personas.js'),
      import('../../../../../../../script.js'),
    ]).then(([world, utils, personas, script]) => { mods = { world, utils, personas, script }; });
    await loading;
  },
  names: () => [...(mods?.world.world_names ?? [])],
  selected: () => [...(mods?.world.selected_world_info ?? [])],

  /** Файлы лорбуков с их extensions (там лежат метки My lorebook manager). */
  async files() {
    const response = await fetch('/api/worldinfo/list', { method: 'POST', headers: live().getRequestHeaders(), body: '{}' });
    if (!response.ok) throw new Error(`/api/worldinfo/list: ${response.status}`);
    return response.json();
  },

  async entries(name) {
    const data = await mods.world.loadWorldInfo(name);
    return data?.entries ? Object.keys(data.entries).length : 0;
  },

  /** Глобальное включение — через родной список #world_info, чтобы таверна сама всё сохранила и обновила. */
  setGlobal(doc, name, on) {
    const select = doc.getElementById('world_info');
    const option = select && [...select.options].find(item => item.textContent === name);
    if (!option) throw new Error(`нет лорбука ${name} в списке`);
    option.selected = on;
    const $ = globalThis.jQuery;
    if ($) $(select).trigger('change');
    else select.dispatchEvent(new doc.defaultView.Event('change', { bubbles: true }));
  },

  async create(name) {
    const ok = await mods.world.createNewWorldInfo(name, { interactive: true });
    if (!ok) return '';
    return mods.world.world_names.includes(name) ? name : (mods.world.world_names.find(item => item.toLowerCase() === name.toLowerCase()) ?? name);
  },

  async remove(name) { return mods.world.deleteWorldInfo(name); },

  async rename(doc, oldName, newName) {
    const { world, personas, script } = mods;
    const data = await world.loadWorldInfo(oldName);
    if (!data) throw new Error(`не загрузился лорбук ${oldName}`);
    const wasGlobal = world.selected_world_info.includes(oldName);
    await world.saveWorldInfo(newName, structuredClone(data), true);
    if (!await world.deleteWorldInfo(oldName)) throw new Error(`не удалился старый файл ${oldName}`);
    const ctx = live();
    const power = ctx.powerUserSettings;
    // доп. лорбуки персонажей
    for (const lore of world.world_info?.charLore ?? []) {
      if (lore.extraBooks?.includes(oldName)) lore.extraBooks = lore.extraBooks.map(item => (item === oldName ? newName : item));
    }
    // лорбуки персон, включая надетую
    for (const descriptor of Object.values(power.persona_descriptions ?? {})) if (descriptor?.lorebook === oldName) descriptor.lorebook = newName;
    if (power.persona_description_lorebook === oldName) { power.persona_description_lorebook = newName; personas.setPersonaDescription(); }
    // лорбук открытого чата
    if (ctx.chatMetadata?.[world.METADATA_KEY] === oldName) { ctx.chatMetadata[world.METADATA_KEY] = newName; await ctx.saveMetadata(); }
    // основной лорбук персонажей
    let current = false;
    for (const character of ctx.characters) {
      if (character?.data?.extensions?.world !== oldName) continue;
      const response = await fetch('/api/characters/merge-attributes', { method: 'POST', headers: ctx.getRequestHeaders(), body: JSON.stringify({ avatar: character.avatar, data: { extensions: { world: newName } } }) });
      if (response.ok) await script.getOneCharacter(character.avatar);
      if (ctx.characterId !== undefined && ctx.characters[Number(ctx.characterId)]?.avatar === character.avatar) current = true;
    }
    if (current) script.select_selected_character(ctx.characterId, { switchMenu: false });
    ctx.saveSettingsDebounced();
    await world.updateWorldInfoList();
    if (wasGlobal) loreApi.setGlobal(doc, newName, true);
  },

  async exportBook(doc, name) {
    const data = await mods.world.loadWorldInfo(name);
    if (!data) throw new Error(`не загрузился лорбук ${name}`);
    const blob = new doc.defaultView.Blob([JSON.stringify(data, null, 4)], { type: 'application/json' });
    const link = doc.createElement('a');
    link.href = doc.defaultView.URL.createObjectURL(blob);
    link.download = `${name}.json`;
    link.click();
    doc.defaultView.setTimeout(() => doc.defaultView.URL.revokeObjectURL(link.href), 1000);
  },

  async importFile(file) { await mods.world.importWorldInfo(file); },

  /** Обложка: картинка в user/images/pudrenitsa-covers, путь от корня сайта. */
  async uploadCover(file, name) {
    const dataUrl = await new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result));
      reader.onerror = () => reject(reader.error);
      reader.readAsDataURL(file);
    });
    const [head, base64] = dataUrl.split(',');
    const ext = (head.match(/image\/(\w+)/)?.[1] ?? 'png').replace('jpeg', 'jpg');
    const safe = String(name).replace(/[^\p{L}\p{N}_-]+/gu, '_').slice(0, 40) || 'book';
    const path = await mods.utils.saveBase64AsFile(base64, 'pudrenitsa-covers', `${safe}-${Date.now()}`, ext);
    return `/${String(path).replace(/\\/g, '/').replace(/^\/+/, '')}`;
  },

  open(name) { mods.world.openWorldInfoEditor(name); },

  // ── для своего редактора записей ──
  /** Данные лорбука (копия из кэша таверны) или null. */
  async load(name) { return (await mods.world.loadWorldInfo(name)) ?? null; },
  /** Сохранить сразу: таверна кладёт объект в кэш и шлёт WORLDINFO_UPDATED. */
  async save(name, data) { await mods.world.saveWorldInfo(name, data, true); },
  newEntry(name, data) { return mods.world.createWorldInfoEntry(name, data) ?? null; },
  keyMap: () => mods?.world.originalWIDataKeyMap ?? {},
  setOriginal(data, uid, key, value) { mods.world.setWIOriginalDataValue(data, uid, key, value); },
  deleteOriginal(data, uid) { mods.world.deleteWIOriginalDataValue(data, uid); },
  splitKeys: text => mods.world.splitKeywordsAndRegexes(String(text ?? '')),
  async tokens(text) {
    const count = live()?.getTokenCountAsync;
    return typeof count === 'function' ? count(String(text ?? '')) : null;
  },
  /** Перенести или скопировать запись в другой лорбук (родная функция сама сохраняет оба). */
  async moveEntry(source, target, uid, copy) {
    return mods.world.moveWorldInfoEntry(source, target, uid, { deleteOriginal: !copy });
  },
  /** Закрыть лорбук в скрытом родном редакторе, чтобы он не держал свою копию данных. */
  closeNativeEditor(doc) {
    const select = doc.getElementById('world_editor_select');
    if (!select || select.value === '') return;
    select.value = '';
    const $ = globalThis.jQuery;
    if ($) $(select).trigger('change'); else select.dispatchEvent(new doc.defaultView.Event('change', { bubbles: true }));
  },
  /** Какой лорбук таверна выбрала в своём (скрытом) редакторе. */
  editorBook(doc) {
    const select = doc.getElementById('world_editor_select');
    const option = select?.selectedOptions?.[0];
    return option && option.value !== '' ? option.textContent.trim() : '';
  },
};
