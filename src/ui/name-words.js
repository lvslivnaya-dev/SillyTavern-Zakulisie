import { button, element } from './helpers.js';
import { NAME_CASES, syncNameWords, wordsToFill } from '../core/name-library.js';

/**
 * The names of a card, word by word: for every word of the name and of the nicknames, «не склоняется» or its five case forms.
 * `words` is the draft's own array (it is edited in place and saved with the card); it follows the name and the nicknames typed above.
 * `fill({ name, aliases, words })` asks the model for the forms of the empty words → [{ word, same, gen… }].
 */
export function renderNameWords({ name, aliases, words, fill, redraw, setStatus }) {
  const list = syncNameWords(name, aliases, words);
  words.splice(0, words.length, ...list);
  const missing = wordsToFill({ words });

  const rows = words.map(word => {
    const same = element('input', { type: 'checkbox', checked: Boolean(word.same), 'aria-label': `${word.word}: не склоняется` });
    same.addEventListener('change', () => { word.same = same.checked; if (word.same) for (const [key] of NAME_CASES) word[key] = ''; redraw(); });
    const row = element('div', { className: 'ku-names-word' }, [
      element('strong', { className: 'ku-names-w', text: word.word }),
      element('label', { className: 'ku-names-same' }, [same, element('span', { text: 'не склоняется' })]),
    ]);
    if (!word.same) {
      row.append(element('div', { className: 'ku-names-forms' }, NAME_CASES.map(([key, label, ask]) => {
        const input = element('input', { value: word[key] ?? '', placeholder: label, title: `${label} (${ask})`, 'aria-label': `${word.word}: ${label}` });
        input.addEventListener('input', () => { word[key] = input.value; });
        return input;
      })));
    }
    return row;
  });

  let busy = false;
  const ask = button(`Подобрать склонения${missing.length ? ` (${missing.length})` : ''}`, 'btn small', async () => {
    if (busy) return;
    busy = true;
    ask.disabled = true;
    try {
      setStatus?.('Подбираю склонения…');
      const forms = await fill({ name, aliases, words });
      const empty = new Set(wordsToFill({ words }).map(word => word.word));
      let filled = 0;
      for (const form of forms ?? []) {
        const word = words.find(item => item.word === form.word);
        if (!word || !empty.has(word.word)) continue;
        Object.assign(word, form, { word: word.word });
        filled += 1;
      }
      setStatus?.(filled ? 'Склонения подобраны: проверьте их и сохраните карточку' : 'Не получилось подобрать склонения', !filled);
    } catch (error) {
      setStatus?.(error?.message || String(error), true);
    } finally { busy = false; redraw(); }
  }, 'Модель предложит формы для слов, где они ещё пусты. Проверьте их: она может ошибиться');
  ask.disabled = !missing.length;

  return element('div', { className: 'ku-cpane' }, [
    element('div', { className: 'ku-ctitlerow' }, [element('h3', { className: 'ku-ctitle', text: 'Имена и склонения' }), ask]),
    element('p', { className: 'ku-hint', text: 'Слова из имени и прозвищ (они берутся из полей сверху). Для каждого впишите формы или отметьте «не склоняется». Пока герой на сцене, модель получает все слова с формами, даже если его в постах не называли. Если героя только упомянули, идут основное имя и то прозвище, которое прозвучало. Слова без форм не отправляются.' }),
    ...(rows.length ? rows : [element('p', { className: 'muted', text: 'Сначала впишите имя.' })]),
  ]);
}
