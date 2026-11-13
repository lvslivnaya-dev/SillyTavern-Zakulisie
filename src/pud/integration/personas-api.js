/**
 * Персоны через родной код таверны.
 * Правки полей повторяют то, что делает /persona-update (descriptor + копия у текущей персоны),
 * удаление и копия идут родными командами /persona-delete и /persona-duplicate, картинка — родной формой загрузки.
 * Модули таверны грузятся лениво; в тестах сюда подставляется заглушка.
 */
let mods = null;
let loading = null;

const live = () => globalThis.SillyTavern?.getContext?.();
const power = () => live()?.powerUserSettings ?? {};

/** Аватар можно передать в команду в кавычках только без спецсимволов парсера. */
const safeId = avatar => {
  const id = String(avatar ?? '');
  if (!id || /["|{}\\]/.test(id)) throw new Error(`имя файла персоны не подходит для команды: ${id}`);
  return id;
};

async function runSlash(text) {
  const result = await live().executeSlashCommandsWithOptions(text, { handleParserErrors: true, handleExecutionErrors: true, source: 'pudrenitsa' });
  if (result?.isError) throw new Error(result.errorMessage || text);
  return result?.pipe;
}

async function readBlob(url) {
  const response = await fetch(url, { cache: 'reload' });
  if (!response.ok) throw new Error(`${url}: ${response.status}`);
  return response.blob();
}

export const personaApi = {
  async ready() {
    if (mods) return;
    loading ??= Promise.all([
      import('../../../../../../../script.js'),
      import('../../../../../../personas.js'),
      import('../../../../../../world-info.js'),
    ]).then(([script, personas, world]) => { mods = { script, personas, world }; });
    await loading;
  },
  power,
  current: () => mods?.personas.user_avatar ?? '',
  defaultAvatar: () => power().default_persona ?? '',
  allowMulti: () => Boolean(power().persona_allow_multi_connections),
  worldNames: () => [...(mods?.world.world_names ?? [])],
  connection: () => mods?.personas.getCurrentConnectionObj() ?? null,
  imageUrl: avatar => `User Avatars/${encodeURIComponent(avatar)}`,
  thumbUrl: avatar => `/thumbnail?type=persona&file=${encodeURIComponent(avatar)}`,
  isLocked: type => { try { return Boolean(mods?.personas.isPersonaLocked(type)); } catch { return false; } },

  async wear(avatar) { await mods.personas.setUserAvatar(avatar, { navigateToCurrent: true }); },

  /** Правка полей персоны. patch: name, title, description, position, depth, role, lorebook. */
  async update(avatar, patch, { quiet = false } = {}) {
    const p = power();
    const descriptor = p.persona_descriptions[avatar] ??= { description: '', position: 0, depth: 2, role: 0, lorebook: '', connections: [], title: '' };
    const isCurrent = avatar === mods.personas.user_avatar;
    const ctx = live();
    if (patch.name !== undefined) {
      const name = String(patch.name).trim();
      const oldName = p.personas[avatar];
      if (name && name !== oldName) {
        p.personas[avatar] = name;
        if (isCurrent) mods.script.setUserName(name, { toastPersonaNameChange: false });
        await ctx.eventSource.emit(ctx.eventTypes.PERSONA_RENAMED, { avatarId: avatar, oldName, newName: name });
      }
    }
    const copies = { description: 'persona_description', position: 'persona_description_position', depth: 'persona_description_depth', role: 'persona_description_role', lorebook: 'persona_description_lorebook' };
    for (const key of ['title', 'description', 'position', 'depth', 'role', 'lorebook']) {
      if (patch[key] === undefined) continue;
      descriptor[key] = patch[key];
      if (isCurrent && copies[key]) p[copies[key]] = patch[key];
    }
    ctx.saveSettingsDebounced();
    if (isCurrent) mods.personas.setPersonaDescription();
    if (!quiet) {
      await ctx.eventSource.emit(ctx.eventTypes.PERSONA_UPDATED, avatar);
      await mods.personas.getUserAvatars(true, avatar);
    }
  },

  async saveConnections() {
    live().saveSettingsDebounced();
    mods.personas.updatePersonaConnectionsAvatarList();
  },

  async setDefault(avatar, on) {
    const p = power();
    if (on) p.default_persona = avatar;
    else if (p.default_persona === avatar) delete p.default_persona;
    live().saveSettingsDebounced();
    await mods.personas.getUserAvatars(true, avatar);
  },

  /** «Несколько персон на одного персонажа»: родной флажок, чтобы таверна сама сохранила. */
  setMulti(doc, on) {
    const box = doc.getElementById('persona_allow_multi_connections');
    if (box) {
      box.checked = on;
      box.dispatchEvent(new doc.defaultView.Event('input', { bubbles: true }));
    } else {
      power().persona_allow_multi_connections = on;
      live().saveSettingsDebounced();
    }
  },

  async toggleLock(type) { return mods.personas.togglePersonaLock(type); },

  /** Новая персона со стандартной или своей картинкой. Возвращает её аватар. */
  async create({ name, title = '', description = '', position = 0, depth = 2, role = 0, lorebook = '', image = '' }) {
    const clean = String(name).trim();
    const avatar = `${Date.now()}-${clean.replace(/[^a-zA-Z0-9]/g, '')}.png`;
    await mods.personas.initPersona(avatar, clean, description, title, { position, depth, role, lorebook });
    await personaApi.upload(avatar, image || mods.script.default_user_avatar);
    await mods.personas.getUserAvatars(true, avatar);
    return avatar;
  },

  async upload(avatar, url) {
    const blob = await readBlob(url);
    const form = new FormData();
    form.append('avatar', new File([blob], 'avatar.png', { type: blob.type || 'image/png' }));
    form.append('overwrite_name', avatar);
    const response = await fetch('/api/avatars/upload', { method: 'POST', headers: live().getRequestHeaders({ omitContentType: true }), cache: 'no-cache', body: form });
    if (!response.ok) throw new Error(`/api/avatars/upload: ${response.status}`);
    await fetch(personaApi.imageUrl(avatar), { cache: 'reload' }).catch(() => {});
    await fetch(personaApi.thumbUrl(avatar), { cache: 'reload' }).catch(() => {});
  },

  async duplicate(avatar) { return String(await runSlash(`/persona-duplicate persona="${safeId(avatar)}"`) ?? ''); },
  async remove(avatar) { return String(await runSlash(`/persona-delete silent=true persona="${safeId(avatar)}"`)) === 'true'; },

  /** Сменить картинку: родная форма с кадрированием. */
  changeImage(doc, avatar) {
    const overwrite = doc.getElementById('avatar_upload_overwrite');
    const file = doc.getElementById('avatar_upload_file');
    if (!overwrite || !file) throw new Error('нет формы загрузки аватара');
    overwrite.value = avatar;
    file.click();
  },

  async imageData(avatar) {
    try {
      const blob = await readBlob(personaApi.imageUrl(avatar));
      return await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result));
        reader.onerror = () => reject(reader.error);
        reader.readAsDataURL(blob);
      });
    } catch { return ''; }
  },

  /** Бэкап и восстановление всей библиотеки — родные кнопки таверны. */
  backup(doc) { doc.getElementById('personas_backup')?.click(); },
  restore(doc, file) {
    const input = doc.getElementById('personas_restore_input');
    if (!input) throw new Error('нет поля восстановления персон');
    const transfer = new doc.defaultView.DataTransfer();
    transfer.items.add(file);
    input.files = transfer.files;
    input.dispatchEvent(new doc.defaultView.Event('change', { bubbles: true }));
  },

  openLorebook(name) { return mods.world.openWorldInfoEditor?.(name); },

  // ── дополнительные лорбуки персонажа и лорбук чата (как глобус и паспорт в родной панели) ──
  /** Доп. лорбуки таверна держит в world_info.charLore по имени файла персонажа без расширения. */
  extraBooks(avatar) {
    const file = String(avatar ?? '').replace(/\.[^/.]+$/, '');
    return [...(mods?.world.world_info?.charLore?.find(item => item.name === file)?.extraBooks ?? [])];
  },
  setExtraBooks(avatar, books) {
    mods.world.charSetAuxWorlds(String(avatar ?? '').replace(/\.[^/.]+$/, ''), books);
  },
  chatBook: () => String(live()?.chatMetadata?.[mods?.world.METADATA_KEY ?? 'world_info'] ?? ''),
  hasChat: () => Boolean(live()?.getCurrentChatId?.()),
  async setChatBook(doc, name) {
    const ctx = live();
    if (!ctx?.getCurrentChatId?.()) throw new Error('чат не открыт');
    const key = mods.world.METADATA_KEY;
    if (name) ctx.chatMetadata[key] = name; else delete ctx.chatMetadata[key];
    for (const buttonEl of doc.querySelectorAll('.chat_lorebook_button')) buttonEl.classList.toggle('world_set', Boolean(name));
    await ctx.saveMetadata();
  },
};
