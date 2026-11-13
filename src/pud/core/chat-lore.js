/**
 * «Лорбуки чата»: какие лорбуки работают в открытом чате и через кого они подключены.
 * Чистая логика: на вход то, что таверна знает о чате, на выход — сводка по книгам.
 *
 * sources = {
 *   global: [имя],                                      включены глобально
 *   cards: [{ avatar, name, world, extras: [имя] }],    персонаж чата или все участники группы
 *   persona: { avatar, name, book } | null,             надетая персона
 *   chat: имя | '',                                     лорбук самого чата
 *   known: [имя],                                       какие файлы вообще есть
 * }
 */

/** Книги чата: [{ name, via: [{ kind, label }], missing }], по алфавиту. */
export function chatLoreBooks(sources) {
  const books = new Map();
  const add = (name, kind, label) => {
    if (!name) return;
    if (!books.has(name)) books.set(name, { name, via: [] });
    books.get(name).via.push({ kind, label });
  };
  for (const name of sources.global ?? []) add(name, 'global', 'глобально');
  for (const card of sources.cards ?? []) {
    add(card.world, 'card', `карточка «${card.name}»`);
    for (const name of card.extras ?? []) add(name, 'extra', `доп. у «${card.name}»`);
  }
  if (sources.persona?.book) add(sources.persona.book, 'persona', `персона «${sources.persona.name}»`);
  add(sources.chat, 'chat', 'этот чат');
  const known = new Set(sources.known ?? []);
  return [...books.values()]
    .map(book => ({ ...book, missing: known.size > 0 && !known.has(book.name) }))
    .sort((left, right) => left.name.localeCompare(right.name, 'ru'));
}

/** Короткая подсказка о повторах: книга подключена дважды — таверна возьмёт её один раз. */
export function duplicateNote(book) {
  return book.via.length > 1 ? 'подключён несколько раз — таверна читает его один раз' : '';
}
