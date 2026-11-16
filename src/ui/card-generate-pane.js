/**
 * Writing a card with the model, one process: the picture (looks), then the sections.
 *
 *  - the page «Написать разделы»: pick the sections, say where the character comes from (a fandom with a dial of strictness, or an
 *    original), tick «описать по картинке» (the looks come from the picture with its own wishes), write the wishes, press the button;
 *  - the bar of one section: «Написать с нуля» / «Править по пожеланиям» for just this section, with the same origin.
 *
 * Everything goes into the DRAFT of the card (saved only by «Сохранить»); the old texts are kept for «Вернуть прежние тексты».
 */
import { button, element } from './helpers.js';
import { CARD_SECTION_KINDS, auSummary, makeSection } from '../core/index.js';
import { DEFAULT_STRICTNESS, STRICTNESS } from '../integration/card-generate.js';

/** Sections that are not ticked by themselves: they need a decision of the user. */
const MANUAL = new Set(['nsfw', 'private']);

export const sectionTitle = section => section.title || CARD_SECTION_KINDS[section.kind] || 'Раздел';

export function freshGeneration(draft, { persona = false, fandom = '', hasPicture = false } = {}) {
  return {
    mode: persona ? 'original' : 'canon',
    strictness: DEFAULT_STRICTNESS,
    fandom, frame: '', au: '', wishes: '',
    rewrite: 'edit',
    picture: hasPicture, lookWishes: '', voice: false, voiceWishes: '',
    sectionWishes: {},
    picked: new Set(draft.sections.filter(section => !section.text.trim() && !MANUAL.has(section.kind)).map(section => section.id)),
    running: false, progress: '', notes: [], backup: null, message: '',
  };
}

/** The origin of the character, as the prompt wants it. `where` = { fandom(), folderAu() } of the folder the card is in (what the folder says wins over the typed fandom). */
const originOf = (gen, where = {}) => ({ mode: gen.mode, fandom: where.fandom?.() || gen.fandom, frame: gen.frame, au: gen.au, strictness: gen.strictness, folderAu: where.folderAu?.() ?? null });

/**
 * One run: the picture (if asked), then the sections. `jobs` = [{ section, fresh }]: `fresh` writes from nothing, otherwise a section with
 * text is edited by the wishes. The texts go into the draft sections; what was there is kept in gen.backup.
 * deps: { draft, card, entryId, wishesFor(section) → string, picture: { on, wishes }, generate, describe, setStatus, redraw }
 */
export async function runGeneration(gen, { draft, card, entryId, jobs, wishes, picture, generate, describe, setStatus, redraw, where, adapt = null, save = null }) {
  if (gen.running) return;
  if (!String(card.name ?? '').trim()) { setStatus('Сначала впишите имя героя наверху карточки.', true); return; }
  const paint = () => {
    if (gen.progressEl) gen.progressEl.textContent = gen.progress;
    if (gen.badgeEl) gen.badgeEl.textContent = gen.progress;
  };
  gen.running = true;
  gen.notes = [];
  gen.message = '';
  gen.backup = new Map();
  const remember = section => { if (!gen.backup.has(section.id)) gen.backup.set(section.id, section.text); };
  gen.progress = 'Начинаю…';
  redraw();

  let written = 0;
  const lines = [];
  let failure = '';
  const toWrite = jobs.filter(job => !(picture?.on && job.section.kind === 'visual' && !job.manualVisual) && !(picture?.on && picture.voice && job.section.kind === 'voice'));

  try {
    // 1. The looks from the picture: they become the Visual section, which the other sections then lean on.
    if (picture?.on) {
      gen.progress = 'Смотрю на картинку… Если модель думает, это может занять несколько минут.';
      paint();
      const done = await describe({ cardId: entryId, wishes: picture.wishes, voice: Boolean(picture.voice), voiceWishes: picture.voiceWishes ?? '' });
      let visual = draft.sections.find(item => item.kind === 'visual');
      if (!visual) { visual = makeSection({ kind: 'visual', title: 'Visual', text: '' }); draft.sections.push(visual); }
      remember(visual);
      visual.text = done.looks;
      written += 1;
      lines.push('внешность по картинке');
      // The voice goes to its own section, only when it was asked for and the model really wrote it.
      if (picture.voice && done.voice) {
        let voice = draft.sections.find(item => item.kind === 'voice');
        if (!voice) { voice = makeSection({ kind: 'voice', title: 'Voice', text: '' }); draft.sections.push(voice); }
        remember(voice);
        voice.text = done.voice;
        gen.picked.delete(voice.id);
        written += 1;
      }
    }

    // 2. The sections
    if (toWrite.length) {
      const applied = new Set();
      // A written section goes into the draft at once (the page shows it while the next one is being written).
      const apply = result => {
        if (applied.has(result.id)) return;
        applied.add(result.id);
        const section = draft.sections.find(item => item.id === result.id);
        if (!section) return;
        if (result.skip) { skipped.push(`«${result.title}»: ${result.skip}`); return; }
        remember(section);
        section.text = result.text;
        written += 1;
        if (result.note) gen.notes.push({ title: result.title, note: result.note });
        gen.picked.delete(section.id);
      };
      const skipped = [];
      const outcome = await generate({
        card,
        sections: toWrite.map(({ section, fresh }) => ({ id: section.id, kind: section.kind, title: sectionTitle(section), text: fresh ? '' : section.text, wishes: wishes(section) })),
        others: draft.sections.map(section => ({ id: section.id, kind: section.kind, title: sectionTitle(section), text: section.text })),
        origin: originOf(gen, where),
        adapt,
        wishes: gen.wishes,
        onProgress: (index, total, name) => { gen.progress = `Пишу «${name}» (${index + 1} из ${total})…`; paint(); },
        onSection: result => { apply(result); redraw(); },
      });
      for (const result of outcome.results) apply(result);
      if (skipped.length) lines.push(`пропущено: ${skipped.join('; ')}`);
      if (outcome.failed) failure = `Остановилось на разделе${outcome.failed.title ? ` «${outcome.failed.title}»` : ''}: ${outcome.failed.message}`;
    }
  } catch (error) {
    failure = error?.message || String(error);
  }

  // What the model wrote goes into the card at once: a long run must not be lost when the card is closed without «Сохранить».
  let kept = false;
  if (written && save) { try { await save(); kept = true; } catch (error) { failure = failure || `Написано, но не сохранилось: ${error?.message || error}`; } }
  gen.running = false;
  const head = written ? `${adapt ? 'Перестроено' : 'Написано'}: ${written}. ${kept ? 'Сохранено в карточке: проверьте и поправьте.' : 'Это черновик: проверьте и нажмите «Сохранить».'}` : '';
  gen.message = [head, ...lines.filter(line => !line.startsWith('внешность')).map(line => `${line[0].toUpperCase()}${line.slice(1)}.`), failure].filter(Boolean).join(' ');
  if (!written) gen.backup = null;
  setStatus(head || failure || gen.message || 'Ничего не написано', Boolean(failure) && !written);
  redraw();
}

/** The «Вернуть прежние тексты» button (nothing when there is nothing to return). */
function undoButton(gen, draft, redraw, only = null) {
  if (!gen.backup || gen.running) return [];
  if (only && !gen.backup.has(only)) return [];
  return [button(only ? 'Вернуть прежний текст' : 'Вернуть прежние тексты', 'btn small', () => {
    for (const [id, text] of gen.backup) {
      if (only && id !== only) continue;
      const section = draft.sections.find(item => item.id === id);
      if (section) section.text = text;
      gen.backup.delete(id);
    }
    if (!gen.backup.size) gen.backup = null;
    gen.notes = [];
    gen.message = 'Прежний текст возвращён: нажмите «Сохранить», чтобы он остался.';
    redraw();
  }, 'Вернёт тексты такими, какими они были до последней генерации')];
}

/**
 * The page. deps: { gen, draft, card, entryId, hasPicture, redraw, generate(request), describe(request), modelField(state) → node, setStatus }
 */
export function renderGeneratePane({ gen, draft, card, entryId, hasPicture, redraw, generate, describe, modelField, setStatus, where, folders, setFolder, newFolder, rebuild, moved }) {
  const radio = (name, value, current, label, hint, onPick) => {
    const input = element('input', { type: 'radio', name, checked: current === value, disabled: gen.running });
    input.addEventListener('change', () => { if (input.checked) { onPick(value); redraw(); } });
    return element('label', { className: `ku-copt${current === value ? ' on' : ''}` }, [input, element('span', {}, [
      element('strong', { text: label }),
      ...(hint ? [element('span', { className: 'ku-hint', text: hint })] : []),
    ])]);
  };
  const text = (label, value, placeholder, onInput, hint = '') => {
    const input = element('input', { type: 'text', value, placeholder, 'aria-label': label, disabled: gen.running });
    input.addEventListener('input', () => onInput(input.value));
    return element('label', { className: 'ku-label' }, [element('span', { text: label }), input, ...(hint ? [element('span', { className: 'ku-hint', text: hint })] : [])]);
  };
  const area = (label, value, rows, placeholder, onInput, hint = '') => {
    const input = element('textarea', { rows, value, placeholder, 'aria-label': label, disabled: gen.running });
    input.addEventListener('input', () => onInput(input.value));
    return element('label', { className: 'ku-label' }, [element('span', { text: label }), input, ...(hint ? [element('span', { className: 'ku-hint', text: hint })] : [])]);
  };

  // 1. Where the character comes from
  const origin = element('div', { className: 'ku-copts' }, [
    element('div', { className: 'ku-clabel', text: '1. Откуда герой' }),
    radio('ku-gen-mode', 'canon', gen.mode, 'Из фандома', 'Модель опирается на канон, а насколько строго, регулирует ползунок ниже.', value => { gen.mode = value; }),
    radio('ku-gen-mode', 'original', gen.mode, 'Оригинальный персонаж', 'Канона нет. Модель придумывает по пожеланиям и по уже написанным разделам: чем больше пожеланий, тем точнее. Для героя вашего АУ без канона тоже сюда.', value => { gen.mode = value; }),
  ]);
  // The folder is the fandom and its AU: the card lives in it, and what the folder says about its AU is read by every card written into it.
  const newFolderInput = element('input', { type: 'text', value: gen.newFolderName ?? '', placeholder: 'Название фандома или АУ', 'aria-label': 'Название новой папки', disabled: gen.running });
  newFolderInput.addEventListener('input', () => { gen.newFolderName = newFolderInput.value; });
  const folderSelect = element('select', { 'aria-label': 'Папка карточки (фандом и АУ)', disabled: gen.running }, [
    ...folders().map(item => element('option', { value: item.id, text: item.text, selected: item.id === draft.folderId })),
    element('option', { value: '__new', text: '＋ Новый фандом (папка)…', selected: gen.creatingFolder === true }),
  ]);
  folderSelect.addEventListener('change', () => {
    if (folderSelect.value === '__new') { gen.creatingFolder = true; redraw(); return; }
    gen.creatingFolder = false;
    setFolder(folderSelect.value);
  });
  const folderAu = where.folderAu();
  const folderSummary = auSummary(folderAu, 260);
  const folderBox = element('div', { className: 'ku-label' }, [
    element('span', { text: 'Папка карточки: фандом и АУ' }),
    folderSelect,
    ...(gen.creatingFolder ? [element('div', { className: 'ku-row' }, [newFolderInput, button('Создать папку', 'btn small primary', async () => {
      try { await newFolder(gen.newFolderName ?? ''); gen.newFolderName = ''; gen.creatingFolder = false; redraw(); } catch (error) { setStatus(error?.message || 'Папка не создалась', true); }
    })])] : []),
    element('span', { className: 'ku-hint', text: folderSummary
      ? `АУ этой папки (читается при написании): ${folderSummary}. Правится в самой папке, кнопкой «АУ» над списком карточек.`
      : 'У этой папки нет АУ: пишется чистый канон. Описать АУ можно в самой папке, кнопкой «АУ» над списком карточек; тогда оно будет учитываться для всех её карточек.' }),
    ...(moved ? [element('span', { className: 'ku-hint', text: 'Карточка переедет в эту папку после «Сохранить».' })] : []),
  ]);
  const needFandom = gen.mode === 'canon' && !where.fandom();
  const canon = gen.mode === 'canon' ? [
    ...(needFandom ? [text('Фандом', gen.fandom, 'Токийские мстители', value => { gen.fandom = value; }, 'Папка не называет фандом (она «Без папки»): впишите его здесь.')] : []),
    text('Момент канона', gen.frame, folderAu.frame || 'до арки Поднебесья', value => { gen.frame = value; }, folderAu.frame ? `Папка уже говорит: «${folderAu.frame}». Впишите свой, только если для этой карточки он другой.` : 'Герой не знает событий после этого момента. Пусто: самая узнаваемая версия.'),
    text('Изменения только для этой карточки', gen.au, 'мягче, не вступал в банду, живёт в Осаке', value => { gen.au = value; }, 'Поверх АУ папки. Общие для всех героев изменения лучше вписать в папку.'),
    element('div', { className: 'ku-copts' }, [
      element('div', { className: 'ku-clabel', text: 'Насколько держаться канона' }),
      ...Object.entries(STRICTNESS).map(([id, item]) => radio('ku-gen-strict', id, gen.strictness, item.label, item.hint, value => { gen.strictness = value; })),
    ]),
  ] : [];

  // 2. The picture
  const picture = element('div', { className: 'ku-copts' }, [
    element('div', { className: 'ku-clabel', text: '2. Картинка' }),
    element('label', { className: `ku-copt${gen.picture && hasPicture ? ' on' : ''}` }, [
      Object.assign(element('input', { type: 'checkbox', checked: gen.picture && hasPicture, disabled: gen.running || !hasPicture, 'aria-label': 'Описать внешность по картинке' }), {
        onchange: event => { gen.picture = event.target.checked; redraw(); },
      }),
      element('span', {}, [
        element('strong', { text: 'Описать внешность по картинке карточки' }),
        element('span', { className: 'ku-hint', text: hasPicture
          ? 'Модель посмотрит на картинку и запишет в «Visual» то, что не меняется: лицо, глаза, волосы, рост, сложение. Остальные разделы пишутся уже с этой внешностью. Раздел «Visual» из списка ниже тогда не пишется отдельно.'
          : 'У карточки нет картинки: добавьте её слева от имени.' }),
      ]),
    ]),
    ...(gen.picture && hasPicture ? [
      modelField({ busy: gen.running }),
      text('Пожелания к внешности', gen.lookWishes, 'рост 156, веснушки, клыки; подчеркни глаза', value => { gen.lookWishes = value; }, 'Факты о герое: они сильнее картинки.'),
      element('label', { className: `ku-copt${gen.voice ? ' on' : ''}` }, [
        Object.assign(element('input', { type: 'checkbox', checked: gen.voice, disabled: gen.running, 'aria-label': 'Описать голос' }), { onchange: event => { gen.voice = event.target.checked; redraw(); } }),
        element('span', {}, [
          element('strong', { text: 'Описать и голос' }),
          element('span', { className: 'ku-hint', text: 'Запишется в раздел «Voice»: только звучание (тембр, высота, темп) и как оно может действовать на окружающих. Без фраз, словечек и придуманных привычек. Раздел «Voice» из списка ниже тогда не пишется отдельно.' }),
        ]),
      ]),
      ...(gen.voice ? [text('Пожелания к голосу', gen.voiceWishes, 'низкий, с хрипотцой', value => { gen.voiceWishes = value; })] : []),
    ] : []),
  ]);

  // 3. Which sections
  const pictureTakesVisual = section => gen.picture && hasPicture && (section.kind === 'visual' || (gen.voice && section.kind === 'voice'));
  const rows = draft.sections.map(section => {
    const length = section.text.trim().length;
    const taken = pictureTakesVisual(section);
    const on = gen.picked.has(section.id) && !taken;
    const box = element('input', { type: 'checkbox', checked: on, disabled: gen.running || taken, 'aria-label': `Написать раздел ${sectionTitle(section)}` });
    box.addEventListener('change', () => { if (box.checked) gen.picked.add(section.id); else gen.picked.delete(section.id); redraw(); });
    const state = taken ? 'пишется по картинке' : length ? `есть текст, ${length} зн. — ${gen.rewrite === 'fresh' ? 'будет написан с нуля' : 'будет правиться по пожеланиям'}` : 'пусто — будет написан';
    return element('label', { className: `ku-closet-row${on ? ' on' : ''}` }, [
      box,
      element('span', { className: 'ku-closet-name' }, [
        element('strong', { text: sectionTitle(section) }),
        element('span', { className: 'muted ku-small', text: ` · ${state}${section.kind === 'nsfw' ? ' · только для взрослых героев' : ''}` }),
      ]),
    ]);
  });
  const setPicked = pick => { gen.picked = new Set(draft.sections.filter(pick).map(section => section.id)); redraw(); };
  const sections = [
    element('div', { className: 'ku-clabel', text: '3. Какие разделы' }),
    element('div', { className: 'ku-row' }, [
      button('Пустые', 'btn small', () => setPicked(section => !section.text.trim() && !MANUAL.has(section.kind)), 'Только те, где ещё нет текста'),
      button('Все', 'btn small', () => setPicked(section => !MANUAL.has(section.kind)), 'Все, кроме NSFW и скрытого характера: их отмечают отдельно'),
      button('Снять все', 'btn small', () => setPicked(() => false)),
    ]),
    element('div', { className: 'ku-closet' }, rows),
    element('div', { className: 'ku-copts' }, [
      element('div', { className: 'ku-clabel', text: 'Что делать с разделами, где уже есть текст' }),
      radio('ku-gen-rewrite', 'edit', gen.rewrite, 'Править по пожеланиям', 'Текст берётся за основу, меняется только то, что просят пожелания.', value => { gen.rewrite = value; }),
      radio('ku-gen-rewrite', 'fresh', gen.rewrite, 'Написать с нуля', 'Прежний текст не учитывается, раздел пишется заново (его можно вернуть кнопкой).', value => { gen.rewrite = value; }),
    ]),
  ];

  // 4. Wishes
  const wishesBox = area('4. Пожелания', gen.wishes, 6, gen.mode === 'canon'
    ? 'Например: сделай мягче; он не знаком с главным героем; больше про привычки и быт'
    : 'Например: двадцать пять лет, бывший военный медик, живёт в портовом городе, скрытный, но заботливый; говорит редко и сухо',
  value => { gen.wishes = value; }, 'Относятся ко всем выбранным разделам. Для одного раздела есть своя строка в самом разделе.');

  const progress = element('p', { className: 'ku-hint', role: 'status', text: gen.running ? gen.progress : gen.message });
  // the page is drawn again when the run starts: progress is written to the line that is on screen NOW
  gen.progressEl = progress;

  const jobs = draft.sections.filter(section => gen.picked.has(section.id) && !pictureTakesVisual(section)).map(section => ({ section, fresh: gen.rewrite === 'fresh' }));
  const doPicture = gen.picture && hasPicture;
  const steps = jobs.length + (doPicture ? 1 : 0);
  const run = Object.assign(button(gen.running ? 'Пишу…' : steps ? `Написать${doPicture ? ' (с картинкой)' : ''}: шагов ${steps}` : 'Выберите, что писать', 'btn primary', () => runGeneration(gen, {
    draft, card, entryId, jobs,
    wishes: section => gen.sectionWishes[section.id] ?? '',
    picture: { on: doPicture, wishes: gen.lookWishes, voice: gen.voice, voiceWishes: gen.voiceWishes },
    generate, describe, setStatus, redraw, where,
  }), 'Сначала картинка, потом разделы по очереди: каждый следующий видит предыдущие'), { disabled: gen.running || !steps });

  return element('div', { className: 'ku-cpane' }, [
    element('h3', { text: 'Написать карточку' }),
    element('p', { className: 'ku-hint', text: 'Один процесс: откуда герой, картинка, разделы и пожелания. Всё идёт в черновик карточки: пока не нажмёте «Сохранить», ничего не потеряется, а «Вернуть прежние тексты» откатит последний запуск.' }),
    origin, folderBox, ...canon,
    picture,
    ...sections,
    wishesBox,
    element('div', { className: 'ku-row' }, [run,
      Object.assign(button('Перестроить заполненные под АУ папки', 'btn small', () => rebuild(), 'Модель перепишет заполненные разделы так, чтобы они подходили АУ этой папки; остальное сохранится'), { disabled: gen.running || !draft.sections.some(section => section.text.trim() && !['nsfw', 'private'].includes(section.kind)) }),
      ...undoButton(gen, draft, redraw)]),
    progress,
    ...(gen.notes.length ? [
      element('div', { className: 'ku-clabel', text: 'Заметки модели (в карточку не попали)' }),
      element('ul', { className: 'ku-hint' }, gen.notes.map(item => element('li', { text: `«${item.title}»: ${item.note}` }))),
    ] : []),
  ]);
}

/**
 * The bar in the pane of ONE section: its own wishes and two buttons. The origin is the one of the page «Написать разделы»
 * (shown as a line with a link to it), so a section is written the same way as the rest of the card.
 * deps: { gen, draft, section, card, entryId, redraw, generate, describe, openPage(), setStatus }
 */
export function renderSectionBar({ gen, draft, section, card, entryId, redraw, generate, describe, openPage, setStatus, where }) {
  const has = Boolean(section.text.trim());
  const auNote = auSummary(where.folderAu(), 80) ? ' · есть АУ папки' : '';
  const origin = gen.mode === 'original'
    ? `оригинальный герой${auNote}`
    : `${where.fandom() || gen.fandom || 'фандом не указан'}${gen.frame ? `, ${gen.frame}` : ''} · ${STRICTNESS[gen.strictness]?.label.toLowerCase() ?? ''}${auNote}`;
  const wishes = element('input', { type: 'text', value: gen.sectionWishes[section.id] ?? '', placeholder: 'Пожелания к этому разделу (необязательно)', 'aria-label': `Пожелания к разделу ${sectionTitle(section)}`, disabled: gen.running });
  wishes.addEventListener('input', () => { gen.sectionWishes[section.id] = wishes.value; });
  const go = fresh => runGeneration(gen, {
    draft, card, entryId, jobs: [{ section, fresh, manualVisual: true }],
    wishes: item => gen.sectionWishes[item.id] ?? '',
    picture: { on: false }, generate, describe, setStatus, redraw, where,
  });
  const line = element('p', { className: 'ku-hint', role: 'status', text: gen.running ? gen.progress : gen.message });
  gen.progressEl = line;
  return element('div', { className: 'ku-gbar' }, [
    element('div', { className: 'ku-row' }, [
      wishes,
      Object.assign(button(has ? 'Написать с нуля' : 'Написать', 'btn small primary', () => go(true), 'Модель напишет раздел заново, не глядя на текущий'), { disabled: gen.running }),
      ...(has ? [Object.assign(button('Править по пожеланиям', 'btn small', () => go(false), 'Текст берётся за основу, меняется только то, о чём пожелания'), { disabled: gen.running })] : []),
      ...undoButton(gen, draft, redraw, section.id),
    ]),
    element('p', { className: 'ku-hint' }, [`Как писать: ${origin}. `, Object.assign(element('a', { href: '#', text: 'Изменить' }), { onclick: event => { event.preventDefault(); openPage(); } })]),
    line,
  ]);
}
