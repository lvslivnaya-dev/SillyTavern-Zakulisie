/**
 * Контроль повторов: какими оборотами рассказчик пользуется слишком часто.
 * Считается на месте, без модели: в скольких сообщениях встречается каждая фраза из 3–5 слов.
 * Любую фразу можно одним щелчком запретить: запреты уходят модели короткой заметкой.
 */

export const REPEAT_DEFAULTS = Object.freeze({
  // отправлять ли запреты модели
  send: true,
  // сколько последних ответов ИИ смотреть
  lastMessages: 60,
  // фраза считается штампом, если встретилась минимум в стольких сообщениях
  minMessages: 3,
  // запрещённые фразы
  bans: [],
  // фразы, которые не считать («это нормально»)
  ignored: [],
});

/** Слова нижним регистром без разметки и тегов; «ё» как «е». */
export function wordsOf(text) {
  return (String(text ?? '')
    .replace(/<(think|thinking|reasoning)>[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .toLowerCase()
    .replace(/ё/g, 'е')
    .match(/[\p{L}\p{N}]+(?:['’-][\p{L}\p{N}]+)*/gu) ?? []);
}

// слова, из которых фраза не штамп: «и в на он она это …»
const STOP = new Set(('и в во не что он она они оно на я с со как а то все всё его ее ее их но да ты вы мы к у же вы бы был была были было от по за из о об для до при так ну или ли только тоже уже еще ещё там тут это этот эта эти тот та те себя себе ему ей им мне меня тебя тебе нас вас ним ней них'
  + ' the a an of to in is it and or but he she they you we i his her their my your').split(' '));

const isWeak = words => words.every(word => word.length <= 2 || STOP.has(word));

/**
 * Фразы из 3–5 слов, которые встречаются минимум в minMessages сообщений. Одна фраза считается раз на сообщение.
 * Короткая фраза, которая всегда стоит внутри более длинной с тем же счётом, не показывается (остаётся длинная).
 * @param {string[]} messages тексты ответов
 * @returns {Array<{phrase:string, count:number}>} по убыванию «веса» (счёт × длина)
 */
export function findRepeats(messages, { minMessages = REPEAT_DEFAULTS.minMessages, ignored = [], limit = 40 } = {}) {
  const counts = new Map();
  for (const text of messages) {
    const words = wordsOf(text);
    const seen = new Set();
    for (let size = 3; size <= 5; size++) {
      for (let i = 0; i + size <= words.length; i++) {
        const gram = words.slice(i, i + size);
        if (isWeak(gram)) continue;
        seen.add(gram.join(' '));
      }
    }
    for (const gram of seen) counts.set(gram, (counts.get(gram) ?? 0) + 1);
  }
  const skip = new Set(ignored.map(item => wordsOf(item).join(' ')));
  const found = [...counts].filter(([phrase, count]) => count >= minMessages && !skip.has(phrase));
  const byCount = new Map(found);
  // фраза-часть длиннее фразы с тем же счётом не нужна
  const kept = found.filter(([phrase, count]) => {
    for (const [other, otherCount] of byCount) {
      if (other.length > phrase.length && otherCount === count && ` ${other} `.includes(` ${phrase} `)) return false;
    }
    return true;
  });
  return kept
    .map(([phrase, count]) => ({ phrase, count }))
    .sort((a, b) => b.count * b.phrase.split(' ').length - a.count * a.phrase.split(' ').length || b.count - a.count)
    .slice(0, limit);
}

/** Подтянутые настройки: недостающее берётся из умолчаний, лишнее выбрасывается. */
export function normalizeRepeats(raw) {
  const source = raw && typeof raw === 'object' ? raw : {};
  const list = value => (Array.isArray(value) ? [...new Set(value.map(item => String(item ?? '').trim()).filter(Boolean))].slice(0, 200) : []);
  return {
    send: source.send !== false,
    lastMessages: Math.min(300, Math.max(10, Number(source.lastMessages) || REPEAT_DEFAULTS.lastMessages)),
    minMessages: Math.min(20, Math.max(2, Number(source.minMessages) || REPEAT_DEFAULTS.minMessages)),
    bans: list(source.bans),
    ignored: list(source.ignored),
  };
}

/** Заметка модели про запрещённые обороты ('' — запретов нет). */
export function banBlock(bans) {
  const list = (bans ?? []).map(item => String(item).trim()).filter(Boolean).slice(0, 40);
  if (!list.length) return '';
  return `[Style note: the narrator has been overusing these phrases. Do not use them, and avoid close paraphrases of them; find fresh wording each time: ${list.map(item => `"${item}"`).join('; ')}.]`;
}
