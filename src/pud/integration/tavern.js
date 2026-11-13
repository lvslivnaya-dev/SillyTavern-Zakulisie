/**
 * Действия с чатами через родные функции таверны: открыть, новый, переименовать, удалить, временный чат.
 * Модули таверны подгружаются лениво: в тестах сюда подставляется заглушка через deps.api.
 * Пути считаются от этого файла: /scripts/extensions/third-party/<папка>/src/integration/tavern.js.
 */
import { chatName } from '../core/library.js';

let modules = null;

async function load() {
  if (!modules) {
    modules = Promise.all([
      import('../../../../../../../script.js'),
      import('../../../../../../group-chats.js'),
    ]).then(([script, groups]) => ({ script, groups }));
  }
  return modules;
}

const live = () => globalThis.SillyTavern?.getContext?.();

/** Индекс персонажа по аватару (у таверны characterId — это индекс в массиве). */
const characterIndex = avatar => (live()?.characters ?? []).findIndex(character => character.avatar === avatar);

/** Свежий список всех чатов (как у приветственного экрана таверны, но без лимита). */
export async function fetchRecent(context = live()) {
  const response = await fetch('/api/chats/recent', {
    method: 'POST',
    headers: context.getRequestHeaders(),
    body: JSON.stringify({ max: 5000, pinned: [] }),
    cache: 'no-cache',
  });
  if (!response.ok) throw new Error(`/api/chats/recent ответил ${response.status}`);
  const data = await response.json();
  return Array.isArray(data) ? data : [];
}

/** Открывает чат так же, как приветственный экран таверны. */
export async function openChat(entry, file) {
  const { script, groups } = await load();
  const context = live();
  const name = chatName(file);
  if (entry.kind === 'group') {
    await groups.openGroupById(entry.groupId);
    script.setActiveGroup(entry.groupId);
    context.saveSettingsDebounced();
    if (live().getCurrentChatId() !== name) await groups.openGroupChat(entry.groupId, name);
    return;
  }
  const index = characterIndex(entry.avatar);
  if (index === -1) throw new Error('персонаж не найден');
  await context.selectCharacterById(index);
  script.setActiveCharacter(entry.avatar);
  context.saveSettingsDebounced();
  if (live().getCurrentChatId() !== name) await live().openCharacterChat(name);
}

/** Новый чат: открывает владельца и создаёт пустой чат с приветствием. */
export async function newChat(entry) {
  const { script } = await load();
  if (entry.chats[0]) await openChat(entry, entry.chats[0].file);
  await script.doNewChat({ deleteCurrentChat: false });
}

export async function renameChat(entry, file, newName) {
  const { script } = await load();
  const characterId = entry.kind === 'char' ? characterIndex(entry.avatar) : undefined;
  await script.renameGroupOrCharacterChat({
    characterId: characterId === -1 ? undefined : characterId,
    groupId: entry.kind === 'group' ? entry.groupId : undefined,
    oldFileName: chatName(file),
    newFileName: newName,
    loader: true,
  });
}

export async function deleteChat(entry, file) {
  const { script, groups } = await load();
  if (entry.kind === 'group') return groups.deleteGroupChatByName(entry.groupId, chatName(file));
  const index = characterIndex(entry.avatar);
  if (index === -1) throw new Error('персонаж не найден');
  return script.deleteCharacterChatByName(String(index), chatName(file));
}

/** Временный чат с ассистентом: не сохраняется в файл. */
export async function temporaryChat() {
  const { script } = await load();
  await script.newAssistantChat({ temporary: true });
}

/** Закрыть чат: родная кнопка из меню «Ещё». */
export function closeChat(doc) {
  const buttons = doc.querySelectorAll('#option_close_chat');
  buttons[buttons.length - 1]?.click();
}

export const tavernApi = { fetchRecent, openChat, newChat, renameChat, deleteChat, temporaryChat, closeChat };
