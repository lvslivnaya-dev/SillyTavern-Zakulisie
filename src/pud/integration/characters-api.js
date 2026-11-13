/**
 * Персонажи через родной код и API таверны, без открытия чата.
 * Поля чужого (не открытого) персонажа пишутся через /api/characters/merge-attributes, как writeExtensionField.
 * У открытого персонажа правка идёт через родное поле редактора: таверна сама сохраняет карточку,
 * и её форма не перетрёт нашу правку старым текстом.
 */
import { CHAR_FIELDS, isFav, mergePayload } from '../core/characters.js';
import { tavernApi } from './tavern.js';

let mods = null;
let loading = null;
const live = () => globalThis.SillyTavern?.getContext?.();
const index = avatar => (live()?.characters ?? []).findIndex(character => character.avatar === avatar);
const byAvatar = avatar => live()?.characters?.[index(avatar)];

async function post(url, body) {
  const response = await fetch(url, { method: 'POST', headers: live().getRequestHeaders(), body: JSON.stringify(body), cache: 'no-cache' });
  if (!response.ok) throw new Error(`${url}: ${response.status}`);
  return response;
}

export const characterApi = {
  async ready() {
    if (mods) return;
    loading ??= Promise.all([
      import('../../../../../../../script.js'),
      import('../../../../../../personas.js'),
    ]).then(([script, personas]) => { mods = { script, personas }; });
    await loading;
  },
  imageUrl: avatar => `characters/${encodeURIComponent(avatar)}`,
  thumbUrl: avatar => `/thumbnail?type=avatar&file=${encodeURIComponent(avatar)}`,

  /** Открыт ли сейчас чат именно с этим персонажем (не в группе). */
  isCurrent(avatar) {
    const ctx = live();
    return !ctx?.groupId && ctx?.characterId !== undefined && ctx.characters?.[Number(ctx.characterId)]?.avatar === avatar;
  },

  /** Полные данные карточки (в ленивом режиме таверна держит только краткие). */
  async full(avatar) {
    const id = index(avatar);
    if (id === -1) return null;
    if (live().characters[id].shallow) await mods.script.unshallowCharacter(String(id));
    return live().characters[index(avatar)];
  },

  async setField(doc, avatar, field, value) {
    const spec = CHAR_FIELDS[field];
    if (!spec) throw new Error(`неизвестное поле ${field}`);
    const native = doc.querySelector(spec.native);
    if (characterApi.isCurrent(avatar) && live().menuType !== 'create' && native) {
      native.value = value;
      native.dispatchEvent(new doc.defaultView.Event('input', { bubbles: true }));
      const character = byAvatar(avatar);
      if (character) {
        if (spec.v1) character[spec.v1] = value;
        character.data = { ...(character.data ?? {}), [spec.v2]: value };
      }
      return;
    }
    await post('/api/characters/merge-attributes', mergePayload(avatar, field, value));
    await mods.script.getOneCharacter(avatar);
  },

  async setWorld(avatar, name) {
    const id = index(avatar);
    if (id === -1) throw new Error('персонаж не найден');
    await live().writeExtensionField(id, 'world', name);
  },

  async toggleFav(doc, avatar) {
    const character = byAvatar(avatar);
    if (!character) return false;
    const next = !isFav(character);
    const nativeButton = doc.getElementById('favorite_button');
    if (characterApi.isCurrent(avatar) && nativeButton) {
      nativeButton.click();
    } else {
      await post('/api/characters/merge-attributes', { avatar, fav: next, data: { extensions: { fav: next } } });
      await mods.script.getOneCharacter(avatar);
    }
    const fresh = byAvatar(avatar);
    if (fresh) {
      fresh.fav = next;
      fresh.data = { ...(fresh.data ?? {}), extensions: { ...(fresh.data?.extensions ?? {}), fav: next } };
    }
    mods.script.printCharactersDebounced();
    return next;
  },

  /** Открыть чат: последний чат персонажа (или новый с приветствием, если чатов нет). */
  async openChat(avatar) {
    const character = byAvatar(avatar);
    if (!character) throw new Error('персонаж не найден');
    await tavernApi.openChat({ kind: 'char', avatar, chats: [] }, `${character.chat}.jsonl`);
  },

  async create(name, description = '') {
    const form = new FormData();
    form.append('ch_name', name);
    // the text goes in with the card itself: no second write that could lose it
    if (description) form.append('description', description);
    const response = await fetch('/api/characters/create', { method: 'POST', headers: live().getRequestHeaders({ omitContentType: true }), body: form, cache: 'no-cache' });
    if (!response.ok) throw new Error(`/api/characters/create: ${response.status}`);
    const avatar = (await response.text()).trim();
    await mods.script.getCharacters();
    return avatar;
  },

  async duplicate(avatar) {
    const data = await (await post('/api/characters/duplicate', { avatar_url: avatar })).json();
    if (!data?.path) throw new Error('таверна не вернула имя копии');
    await mods.script.getCharacters();
    return data.path;
  },

  /** Скачать карточку: png (картинка с данными) или json. */
  async exportCard(doc, avatar, format = 'png') {
    const blob = await (await post('/api/characters/export', { format, avatar_url: avatar })).blob();
    const link = doc.createElement('a');
    link.href = doc.defaultView.URL.createObjectURL(blob);
    link.download = avatar.replace(/\.png$/i, `.${format}`);
    link.click();
    doc.defaultView.setTimeout(() => doc.defaultView.URL.revokeObjectURL(link.href), 1000);
  },

  async remove(avatars, deleteChats = true) {
    return mods.script.deleteCharacter(avatars, { deleteChats });
  },

  /** Сменить картинку: кадрирование, как у таверны, и загрузка в карточку. */
  async changeImage(avatar, file) {
    const ctx = live();
    const dataUrl = await new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result));
      reader.onerror = () => reject(reader.error);
      reader.readAsDataURL(file);
    });
    let url = '/api/characters/edit-avatar';
    if (!ctx.powerUserSettings?.never_resize_avatars) {
      const popup = new ctx.Popup('Выбери кадр', ctx.POPUP_TYPE.CROP, '', { cropImage: dataUrl });
      if (!await popup.show()) return false;
      if (popup.cropData !== undefined) url += `?crop=${encodeURIComponent(JSON.stringify(popup.cropData))}`;
    }
    const form = new FormData();
    form.append('avatar', file);
    form.append('avatar_url', avatar);
    const response = await fetch(url, { method: 'POST', headers: ctx.getRequestHeaders({ omitContentType: true }), body: form, cache: 'no-cache' });
    if (!response.ok) throw new Error(`/api/characters/edit-avatar: ${response.status}`);
    await Promise.allSettled([fetch(characterApi.imageUrl(avatar), { cache: 'reload' }), fetch(characterApi.thumbUrl(avatar), { cache: 'reload' })]);
    mods.script.printCharactersDebounced();
    return true;
  },

  async toPersona(avatar) {
    const id = index(avatar);
    if (id === -1) throw new Error('персонаж не найден');
    return mods.personas.convertCharacterToPersona(id);
  },

  /** Пункты родного меню «Ещё…» (и добавленные другими расширениями) — работают у открытого персонажа. */
  nativeOptions(doc) {
    const select = doc.getElementById('char-management-dropdown');
    return select ? [...select.options].filter(option => option.id && !option.disabled && option.id !== 'set_as_assistant' && option.id !== 'convert_to_persona')
      .map(option => ({ id: option.id, title: option.textContent.trim() })) : [];
  },
  runNative(doc, id) {
    const select = doc.getElementById('char-management-dropdown');
    const option = select && [...select.options].find(item => item.id === id);
    if (!option) throw new Error(`нет пункта ${id}`);
    select.selectedIndex = option.index;
    select.dispatchEvent(new doc.defaultView.Event('change', { bubbles: true }));
  },
  /** Родная панель персонажей (группы, создание по форме, всё остальное). */
  openNativePanel(doc) { doc.getElementById('unimportantYes')?.click(); },
  importFiles(doc) { doc.getElementById('character_import_button')?.click(); },
};
