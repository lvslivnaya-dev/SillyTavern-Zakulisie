import { button, characterId, characterName, downloadJson, element } from '../helpers.js';
import { icon } from '../icons.js';
import { cardIsEnglish, AU_FIELDS, CARD_SECTION_KINDS, CARD_WHEN, auIsEmpty, auPrompt, auSummary, folderAu, normalizeAu, sameAu, KEY_REGEX_MODES, tidyAlias, WARDROBE_CATEGORIES, WARDROBE_GENDERS, WARDROBE_SHELVES, cardLabel, folderPath, personalPieces, folderWithDescendants, keyFromRegex, keyToRegex, listExport, selectFromExport, makeSection, normalizeAlias, searchLibraryCharacters, searchLibraryItems, searchLocations, splitKeys } from '../../core/index.js';
import { GATE_SECTIONS, GATE_WHEN } from '../../integration/lore-gate.js';
import { fileToDataUrl, imageUrl } from '../../integration/wardrobe-images.js';
import { renderNameWords } from '../name-words.js';
import { freshGeneration, renderGeneratePane, renderSectionBar, runGeneration } from '../card-generate-pane.js';
import { NO_FOLDER_NAME } from '../../core/location-library.js';
import { recordsFromDraft, recordsToDraft, renderPersonaRecords } from '../persona-records.js';
import { access, canRememberFolder, pickFolder, readNotes, recallFolder, rememberFolder } from '../notes-folder.js';

/**
 * The library as a gallery, like the wardrobe: folders on the left, pictures on the
 * right, a card over the window for editing (with «Описать по картинке» — the same
 * picture model as the wardrobe). Two shelves share the folders: places and things;
 * each shelf remembers its open folder, search and card. A third shelf, the character cards, shares the same
 * folders; its card over the window is a sheet of sections (see renderCardEditor).
 */
export function createLibraryPages(ctx) {
  const render = (...args) => ctx.render(...args);
  const setStatus = (...args) => ctx.setStatus(...args);
  const invoke = (name, payload = {}) => ctx.facade.invoke(name, payload);
  const act = (...args) => ctx.act(...args);

  const snapshot = () => ctx.snapshot;
  const library = () => snapshot().locationLibrary ?? { folders: [], locations: [], items: [], characters: [] };
  const IMPORTANCE_RU = { normal: 'обычная', important: 'важная', key: 'ключевая' };
  const KINDS = {
    places: { add: '+ Локация', one: 'локация', many: 'Локации', placeholder: 'Новая локация', icon: 'pin' },
    items: { add: '+ Вещь', one: 'вещь', many: 'Вещи', placeholder: 'Новая вещь', icon: 'bag' },
    characters: { add: '+ Карточка', one: 'карточка', many: 'Карточки', placeholder: 'Новый персонаж', icon: 'card' },
    personas: { add: '+ Персона', one: 'персона', many: 'Персоны', placeholder: 'Новая персона', icon: 'card' },
  };
  const ROOT_LIMIT = 120;

  const fresh = () => ({ creating: false, newName: '', newFolder: '', newFolderName: '', focusedId: '', folderId: '', query: '', openId: '', importMode: '', file: null, lorebook: { book: '', entries: [], picked: new Set() }, renaming: false, draft: null, askReplace: false, showAll: false, selecting: false, picked: new Set(), moveTo: '' });
  const shelves = { places: fresh(), items: fresh(), characters: fresh(), personas: fresh() };
  let kind = 'places';
  // The persona cards are cards of the same library (kind 'characters'); this shelf shows only them.
  let personaMode = false;
  const KIND = () => (personaMode ? KINDS.personas : KINDS[kind]);
  let s = shelves.places;
  let describeOnUpload = false;
  /** Set while the card editor is drawn inside another window (the persona window): no overlay, no close, no folder, a gear instead. */
  let embed = null;

  const things = () => kind === 'items';
  const cards = () => kind === 'characters';
  /** What the link callbacks need to know about the shelf: places are the default, the others say who they are. */
  const shelfArg = () => (kind === 'places' ? {} : { kind });
  const entriesOf = () => (cards() ? (library().characters ?? []).filter(card => Boolean(card.persona) === personaMode) : things() ? library().items ?? [] : library().locations);
  const linkedSet = () => new Set((personaMode ? [snapshot().personaCardId].filter(Boolean) : cards() ? snapshot().linkedCharacterIds : things() ? snapshot().linkedItemIds : snapshot().linkedLocationIds) ?? []);
  const pathText = id => folderPath(library(), id).map(step => step.name).join(' › ');
  /** The folders of this shelf: the personas have their own (and a hidden one for cards with no folder), the other shelves do not see them. */
  const foldersOf = () => library().folders.filter(folder => (personaMode ? folder.persona && !folder.hidden : !folder.persona));

  /** Run an action; a synchronous error lands in the status line too. */
  async function attempt(work, done) {
    try {
      const result = await work();
      if (done) setStatus(typeof done === 'function' ? done(result) : done);
      return result;
    } catch (error) {
      setStatus(error?.message || String(error), true);
      return undefined;
    } finally {
      render();
    }
  }

  function toggle(checked, label, onChange) {
    const input = element('input', { type: 'checkbox', className: 'ku-switch', checked: Boolean(checked), 'aria-label': label, title: label });
    input.addEventListener('change', () => onChange(input.checked));
    return input;
  }

  function iconButton(name, label, onClick) {
    const node = element('button', { type: 'button', className: 'ku-ib', 'aria-label': label, title: label }, [icon(name)]);
    node.addEventListener('click', onClick);
    return node;
  }

  /** A button that opens a hidden file input (a styled «Выбрать файлы» that always reacts). */
  function filePicker(label, { accept = 'image/*', multiple = true, directory = false, className = 'btn small', disabled = false, title = '', onFiles }) {
    const input = element('input', { type: 'file', accept, multiple, hidden: true, 'aria-label': label });
    if (directory) input.setAttribute('webkitdirectory', '');
    input.addEventListener('change', () => { const files = [...(input.files ?? [])]; input.value = ''; if (files.length) onFiles(files); });
    const trigger = button(label, className, () => input.click());
    if (title) trigger.title = title;
    trigger.disabled = disabled;
    return element('span', { className: 'ku-filepick' }, [trigger, input]);
  }

  /** A small picture button that opens the file dialog (for the portrait of a card). */
  function portraitPicker(label, onFiles) {
    const input = element('input', { type: 'file', accept: 'image/*', hidden: true, 'aria-label': label });
    input.addEventListener('change', () => { const files = [...(input.files ?? [])]; input.value = ''; if (files.length) onFiles(files); });
    return element('span', { className: 'ku-filepick' }, [iconButton('image', label, () => input.click()), input]);
  }

  /** New entries from pictures, in the open folder. */
  async function addPictures(files) {
    if (!s.folderId) { setStatus('Сначала откройте папку слева: туда лягут картинки.', true); return; }
    const images = files.filter(file => /^image\//.test(file.type)).slice(0, 30);
    if (!images.length) { setStatus('Это не картинки.', true); return; }
    let added = 0;
    for (const file of images) {
      try {
        const imageDataUrl = await fileToDataUrl(file);
        setStatus(`Сохраняю картинку ${added + 1} из ${images.length}…`);
        await invoke('onLibraryAddFromImage', { kind, folderId: s.folderId, imageDataUrl, describe: describeOnUpload });
        added += 1;
      } catch (error) {
        setStatus(error?.message || 'Картинка не добавилась', true);
      }
    }
    if (added) setStatus(`Добавлено: ${added}${describeOnUpload ? '' : '. Описание — в карточке, кнопкой «Описать по картинке»'}`);
    render();
  }

  /** Pictures dropped into the folder «Библиотека» on the computer become places and things (onLibraryImportInbox). */
  let inboxBusy = false;
  function importInbox() {
    if (inboxBusy) return;
    inboxBusy = true;
    render();
    attempt(async () => {
      await invoke('onWardrobeInboxRefresh', {});
      return act('onLibraryImportInbox', {
        describe: describeOnUpload,
        onProgress: (done, total, stage) => setStatus(stage === 'describe' ? `Описываю картинки из папки: ${done} из ${total}…` : `Делаю записи из папки: ${done} из ${total}…`),
      }, 'library-import-inbox');
    }, result => {
      if (!result) return '';
      const notes = [`новых записей: ${result.added}`];
      if (result.described) notes.push(`описано: ${result.described}`);
      if (result.failed) notes.push(`не вышло: ${result.failed}`);
      if (result.undescribed) notes.push(`не описалось: ${result.undescribed} (опишите в записи)`);
      if (result.skipped.length) notes.push(`пропущено (непонятная папка): ${result.skipped.length} — ${result.skipped[0].problem}`);
      return `Из папки: ${notes.join(', ')}`;
    }).finally(() => { inboxBusy = false; render(); });
  }

  function renderInboxBanner() {
    const inbox = snapshot().libraryInbox;
    if (!inbox?.available || !inbox.count || cards()) return null;
    const take = button(inboxBusy ? 'Забираю…' : 'Забрать', 'btn primary small', importInbox, 'Сделать записи из картинок папки «Библиотека»');
    take.disabled = inboxBusy;
    return element('div', { className: 'ku-row ku-inbox' }, [
      icon('download'),
      element('span', { text: `В папке «Библиотека» новых картинок: ${inbox.count}. Тип и папку записи получат по тому, где лежит картинка («Места» или «Вещи», дальше папки библиотеки); имя возьмётся из названия файла. Сами картинки останутся на месте.${describeOnUpload ? ' Модель сразу их опишет.' : ''}` }),
      element('span', { className: 'ku-push' }),
      take,
    ]);
  }

  // ---- The page ------------------------------------------------------------------

  /** The library of `shelf` ('places' | 'items'). */
  /** Which shelf the page draws: everything below (the notes bar, the gallery, the windows) follows it. */
  function useShelf(shelf) {
    personaMode = shelf === 'personas';
    kind = shelf === 'items' ? 'items' : shelf === 'characters' || personaMode ? 'characters' : 'places';
    s = shelves[personaMode ? 'personas' : kind];
  }

  function renderLibrary(shelf = 'places') {
    useShelf(shelf);
    const lib = library();
    if (s.folderId && !lib.folders.some(folder => folder.id === s.folderId)) { s.folderId = ''; s.renaming = false; }
    if (s.openId && !entriesOf().some(entry => entry.id === s.openId)) { s.openId = ''; s.draft = null; }
    const view = element('div', { className: 'ku-library ku-lib' });

    const search = element('input', { type: 'search', value: s.query, placeholder: 'Поиск', 'aria-label': cards() ? 'Поиск карточки' : things() ? 'Поиск вещи' : 'Поиск локации', className: 'ku-search' });
    search.addEventListener('change', () => { s.query = search.value; render(); });
    const needFolder = s.folderId ? '' : 'Сначала откройте папку слева';
    // A card is made on a small form: its name and its folder (an existing one or a new one), so it works with no folder open too.
    // Locations and things: with a folder open the entry appears there at once; with none open the same small form asks for a name and a folder.
    // «+»: the entry opens EMPTY at once, in every shelf. With a folder open it goes there; in «Вся библиотека» it goes to the folder
    // «Без папки» (made by the library once, when it is first needed); a persona's card needs no folder at all.
    const addEmpty = button(KIND().add, 'btn primary small', () => attempt(async () => {
      const fields = { folderId: s.folderId };
      const entry = cards()
        ? await invoke('onLibraryAddCharacter', { ...fields, name: '', ...(personaMode ? { persona: true } : {}) })
        : things()
          ? await invoke('onLibraryAddItem', { ...fields, name: KIND().placeholder })
          : await invoke('onLibraryAddLocation', { ...fields, name: KIND().placeholder });
      if (entry) { s.openId = entry.id; s.draft = null; s.selSection = ''; s.creating = false; s.focusedId = ''; }
    }), s.folderId || personaMode ? 'Пустая запись откроется сразу: впишите имя и заполните' : 'Пустая запись откроется сразу и ляжет в папку «Без папки» (откройте папку слева, чтобы создавать в ней)');
    const importMenu = element('select', { 'aria-label': 'Импорт' }, [
      element('option', { value: '', text: 'Импорт…' }),
      ...(personaMode ? [] : [element('option', { value: 'lorebook', text: cards() ? 'Из лорбука (анкеты «[ Имя ] - Раздел»)' : 'Из лорбука' })]),
      element('option', { value: 'markdown', text: personaMode ? 'Из папки персон (Obsidian / Markdown)' : cards() ? 'Из папки анкет (Obsidian / Markdown)' : 'Из папки заметок (Obsidian / Markdown)' }),
      ...(personaMode ? [] : [element('option', { value: 'json', text: 'Из файла Закулисья (.json)' })]),
    ]);
    importMenu.value = s.importMode;
    importMenu.addEventListener('change', () => { s.importMode = importMenu.value; render(); });
    const exportButton = button('Экспорт', 'btn small', () => {
      try {
        const text = invoke('onLibraryExport', { folderId: s.folderId });
        downloadJson(JSON.parse(text), s.folderId ? `kulisy-library-${folderPath(lib, s.folderId).at(-1)?.name ?? 'folder'}.json` : 'kulisy-library.json');
      } catch (error) { setStatus(error?.message || 'Не удалось выгрузить', true); }
    }, s.folderId ? 'Выгрузить эту папку (локации, вещи и карточки)' : 'Выгрузить всю библиотеку (локации, вещи и карточки)');
    const auto = element('input', { type: 'checkbox', className: 'ku-switch', checked: describeOnUpload, 'aria-label': 'Описывать картинки сразу' });
    auto.addEventListener('change', () => { describeOnUpload = auto.checked; });
    view.append(element('div', { className: 'ku-row ku-wtools' }, [
      search,
      ...(personaMode ? [] : [filePicker('+ Картинки', { className: 'btn primary small', disabled: !s.folderId, title: needFolder || (cards() ? 'Каждая картинка — новая карточка с этим портретом' : ''), onFiles: addPictures })]),
      addEmpty,
      ...(!cards() && !personaMode && snapshot().libraryInbox?.available ? [button(inboxBusy ? 'Забираю…' : 'Из папки', 'btn small', importInbox, 'Забрать картинки, которые вы положили в папку «Библиотека» на компьютере (Места / Вещи → папки библиотеки)')] : []),
      button(s.selecting ? 'Готово' : 'Выбрать', s.selecting ? 'btn primary small' : 'btn small', () => { s.selecting = !s.selecting; s.picked.clear(); render(); }, `Отметить несколько: ${cards() ? 'карточки' : things() ? 'вещи' : 'локации'}, чтобы перенести их в другую папку, перевести на английский или удалить`),
      ...(personaMode ? [button('Из таверны', 'btn small', () => attempt(() => act('onPersonaTavernImport', {}, 'persona-tavern-import'), result => `Персон из таверны: добавлено ${result?.added ?? 0}, уже были ${result?.skipped ?? 0}`), 'Сделать карточки из персон таверны: имя, картинка и описание (в Public Info). Описание в самой таверне остаётся, его можно очистить на странице «Персона»')] : []),
      importMenu,
      exportButton,
      ...(cards() ? [] : [element('label', { className: 'ku-inline ku-small', title: 'Сразу просить модель описать новые картинки (тратит запрос на каждую)' }, [auto, 'описывать сразу'])]),
    ]));
    if (s.creating && (cards() || !s.folderId)) view.append(renderNewCard());
    if (s.importMode) view.append(renderImport());
    const inboxBanner = personaMode ? null : renderInboxBanner();
    if (inboxBanner) view.append(inboxBanner);

    const body = element('div', { className: 'ku-wbody' });
    body.append(renderFolders(), renderGallery());
    view.append(body);
    const opened = entriesOf().find(entry => entry.id === s.openId);
    if (opened) view.append(renderEditor(opened));
    else s.focusedId = '';
    return view;
  }

  /** The form of a new card: a name and a folder. The card opens at once to be filled in. */
  function renderNewCard() {
    const lib = library();
    const box = element('div', { className: 'card ku-import ku-newcard' });
    if (!s.newFolder) s.newFolder = s.folderId || (personaMode ? '' : foldersOf()[0]?.id ?? '__new');
    const name = element('input', { type: 'text', value: s.newName, 'aria-label': cards() ? 'Имя персонажа' : 'Название', placeholder: cards() ? 'Как зовут: Сано Манджиро' : things() ? 'Например: Старый ключ' : 'Например: Таверна «Белый олень»' });
    name.addEventListener('input', () => { s.newName = name.value; });
    const folder = element('select', { 'aria-label': 'Папка новой карточки' }, [
      ...(personaMode ? [element('option', { value: '', text: 'Без папки', selected: !s.newFolder })] : []),
      ...foldersOf().map(item => element('option', { value: item.id, text: pathText(item.id), selected: item.id === s.newFolder })),
      element('option', { value: '__new', text: '＋ Новая папка…', selected: s.newFolder === '__new' }),
    ]);
    folder.addEventListener('change', () => { s.newFolder = folder.value; render(); });
    const folderName = element('input', { type: 'text', value: s.newFolderName, 'aria-label': 'Название новой папки', placeholder: 'Например, фандом: Токийские мстители' });
    folderName.addEventListener('input', () => { s.newFolderName = folderName.value; });
    const create = () => attempt(async () => {
      let folderId = s.newFolder;
      if (folderId === '__new') {
        const made = await invoke('onLibraryAddFolder', { name: s.newFolderName, parentId: '', ...(personaMode ? { persona: true } : {}) });
        folderId = made.id;
      }
      const entry = cards()
        ? await invoke('onLibraryAddCharacter', { folderId, name: s.newName, ...(personaMode ? { persona: true } : {}) })
        : things()
          ? await invoke('onLibraryAddItem', { folderId, name: s.newName })
          : await invoke('onLibraryAddLocation', { folderId, name: s.newName });
      s.folderId = folderId;
      s.creating = false; s.newName = ''; s.newFolderName = '';
      if (entry) { s.openId = entry.id; s.draft = null; s.selSection = ''; }
    });
    name.addEventListener('keydown', event => { if (event.key === 'Enter') { event.preventDefault(); create(); } });
    box.append(
      element('h3', { text: cards() ? 'Новая карточка' : things() ? 'Новая вещь' : 'Новая локация' }),
      ...(cards() ? [] : [element('p', { className: 'muted ku-small', text: 'Запись появится в выбранной папке и откроется для заполнения.' })]),
      ...(!cards() ? [] : [element('p', { className: 'muted ku-small', text: 'Карточка получит разделы анкеты (основа, внешность, голос…), заполнишь их в следующем окне. В одной папке два персонажа с одним именем не помещаются, в разных папках можно.' })]),
      element('div', { className: 'field' }, [element('label', { text: cards() ? 'Имя' : 'Название' }), name]),
      element('div', { className: 'field' }, [element('label', { text: 'Папка' }), folder]),
      ...(s.newFolder === '__new' ? [element('div', { className: 'field' }, [element('label', { text: 'Название новой папки' }), folderName])] : []),
      element('div', { className: 'ku-row' }, [button('Создать и открыть', 'btn primary small', create), button('Отмена', 'btn small', () => { s.creating = false; render(); })]),
    );
    if (!s.newName) setTimeout(() => { if (name.isConnected) name.focus({ preventScroll: true }); }, 0);
    return box;
  }

  /** Folders as a tree on the left; the new-folder field goes into the open one. */
  function renderFolders() {
    const lib = library();
    const nav = element('nav', { className: 'ku-wsec ku-lsec', 'aria-label': 'Папки' });
    const all = entriesOf();
    const count = folderId => { const ids = folderWithDescendants(lib, folderId); return all.filter(entry => ids.has(entry.folderId)).length; };
    const root = element('button', { type: 'button', className: `ku-wsb ku-lroot${!s.folderId ? ' on' : ''}`, 'aria-current': !s.folderId ? 'true' : null }, [element('span', { text: 'Вся библиотека' }), element('i', { text: String(all.length) })]);
    root.addEventListener('click', () => { s.folderId = ''; s.renaming = false; render(); });
    nav.append(root);
    const walk = (parentId, depth) => {
      for (const folder of foldersOf().filter(item => (item.parentId ?? '') === parentId)) {
        const on = s.folderId === folder.id;
        const node = element('button', { type: 'button', className: `ku-wsb ku-folder${on ? ' on' : ''}`, 'aria-current': on ? 'true' : null, style: { paddingLeft: `${10 + depth * 14}px` } },
          [element('span', { className: 'ku-fname' }, [icon('folder'), element('span', { text: folder.name })]), element('i', { text: String(count(folder.id)) })]);
        node.addEventListener('click', () => { s.folderId = folder.id; s.renaming = false; s.query = ''; render(); });
        nav.append(node);
        if (depth < 6) walk(folder.id, depth + 1);
      }
    };
    walk('', 0);
    const name = element('input', { type: 'text', placeholder: s.folderId ? 'Подпапка…' : 'Новая папка…', 'aria-label': 'Название новой папки' });
    const add = () => attempt(async () => {
      const folder = await invoke('onLibraryAddFolder', { name: name.value, parentId: s.folderId, ...(personaMode ? { persona: true } : {}) });
      if (folder?.id) s.folderId = folder.id;
    }, 'Папка создана');
    name.addEventListener('keydown', event => { if (event.key === 'Enter') { event.preventDefault(); add(); } });
    nav.append(element('div', { className: 'ku-lnew' }, [name, button('+ Папка', 'btn small', add, s.folderId ? 'Создать внутри открытой папки' : 'Создать папку верхнего уровня')]));
    return nav;
  }

  /** The bar of the choosing mode: how many cards are ticked, what to do with them. `list` is what the gallery shows now. */
  function renderPickBar(list) {
    const lib = library();
    const ids = new Set(entriesOf().map(entry => entry.id));
    for (const id of [...s.picked]) if (!ids.has(id)) s.picked.delete(id);
    const folder = element('select', { 'aria-label': 'Папка, куда перенести' }, [
      element('option', { value: '', text: 'Перенести в папку…' }),
      ...foldersOf().map(item => element('option', { value: item.id, text: pathText(item.id), selected: item.id === s.moveTo })),
    ]);
    folder.addEventListener('change', () => { s.moveTo = folder.value; render(); });
    const move = Object.assign(button('Перенести', 'btn small', () => attempt(async () => {
      const result = await invoke('onLibraryMoveEntries', { kind, ids: [...s.picked], folderId: s.moveTo });
      if (!result.skipped.length) s.picked.clear();
      else { s.picked = new Set(result.skipped.map(item => item.id)); throw new Error(`Перенесено: ${result.moved.length}. Остались на месте (имя занято в той папке): ${result.skipped.map(item => item.name).join(', ')}`); }
      return result;
    }, result => `Перенесено: ${result?.moved?.length ?? 0}`)), { disabled: !s.picked.size || !s.moveTo });
    const remove = Object.assign(button('Удалить', 'btn small danger', () => attempt(async () => {
      const removed = await invoke('onLibraryRemoveEntries', { kind, ids: [...s.picked] });
      if (removed) s.picked.clear();
      return removed;
    }, removed => (removed ? `Удалено: ${removed}` : ''))), { disabled: !s.picked.size });
    const translate = Object.assign(button('Перевести на английский', 'btn small', () => attempt(async () => {
      const result = await invoke('onLibraryTranslateEntries', { kind, ids: [...s.picked] });
      if (result?.done?.length) s.picked.clear();
      return result;
    }, result => (result?.done?.length ? `Переведено: ${result.done.length}` : 'Переводить нечего: уже на английском или нет текста'))), { disabled: !s.picked.size });
    translate.title = 'Каждую отмеченную переведёт модель: описание и черты (у карточек разделы); русский текст заменится переводом';
    return element('div', { className: 'ku-pickbar' }, [
      element('strong', { className: 'ku-small', text: `Выбрано: ${s.picked.size}` }),
      button('Все в списке', 'btn small', () => { for (const entry of list) s.picked.add(entry.id); render(); }, 'Отметить все карточки, которые сейчас на экране (открытая папка с подпапками или результат поиска)'),
      button('Снять всё', 'btn small', () => { s.picked.clear(); render(); }),
      element('span', { className: 'ku-push' }),
      translate, folder, move, remove,
    ]);
  }

  function renderGallery() {
    const lib = library();
    const gallery = element('div', { className: 'ku-wgal' });
    const linked = linkedSet();
    const query = s.query.trim();
    let list;
    if (query) {
      list = cards() ? searchLibraryCharacters(lib, query) : things() ? searchLibraryItems(lib, query) : searchLocations(lib, query);
      gallery.append(element('div', { className: 'ku-row' }, [
        element('h3', { className: 'ku-ltitle', text: `Найдено · ${list.length}` }),
        button('Сбросить поиск', 'btn small', () => { s.query = ''; render(); }),
      ]));
    } else if (s.folderId) {
      const ids = folderWithDescendants(lib, s.folderId);
      list = entriesOf().filter(entry => ids.has(entry.folderId));
      const on = list.filter(entry => linked.has(entry.id)).length;
      const total = list.length;
      gallery.append(element('div', { className: 'ku-row ku-lhead' }, [
        ...renderFolderTitle(),
        element('span', { className: 'muted ku-small', text: `${on} из ${total} в этом чате` }),
        element('span', { className: 'ku-push' }),
        button('Включить все', 'btn small', () => attempt(() => act('onLibraryLink', { folderId: s.folderId, on: true, kind }, 'library-link'), result => `Включено: ${result ?? 0}`)),
        button('Выключить все', 'btn small', () => attempt(() => act('onLibraryLink', { folderId: s.folderId, on: false, kind }, 'library-link'))),
      ]));
      if (!personaMode && s.auOpen === s.folderId) gallery.append(renderFolderAu(lib.folders.find(item => item.id === s.folderId)));
    } else {
      list = entriesOf();
      gallery.append(element('div', { className: 'ku-row ku-lhead' }, [
        element('h3', { className: 'ku-ltitle', text: 'Вся библиотека' }),
        element('span', { className: 'muted ku-small', text: personaMode ? '' : lib.folders.length ? 'Откройте папку слева — туда лягут новые картинки и записи.' : '' }),
      ]));
    }
    // Places: a part of a place (a room of a house) is shown inside the card of the house, not in the common gallery — unless it stands alone here.
    if (!query && !cards() && !things()) {
      const here = new Set(list.map(entry => entry.id));
      list = list.filter(entry => !(entry.parentId && here.has(entry.parentId)));
    }
    const shown = !query && !s.folderId && !s.showAll ? list.slice(0, ROOT_LIMIT) : list;
    const grid = element('div', { className: `ku-tiles ku-ltiles ${kind}` }, shown.map(entry => tile(entry, linked)));
    if (s.folderId && !query) {
      grid.append(filePicker('Перетащите картинки сюда или нажмите', { className: 'ku-tile ku-drop', onFiles: addPictures }));
      grid.addEventListener('dragover', event => { event.preventDefault(); grid.classList.add('over'); });
      grid.addEventListener('dragleave', () => grid.classList.remove('over'));
      grid.addEventListener('drop', event => { event.preventDefault(); grid.classList.remove('over'); addPictures([...(event.dataTransfer?.files ?? [])]); });
    }
    if (s.selecting) gallery.append(renderPickBar(list));
    gallery.append(grid);
    if (shown.length < list.length) gallery.append(button(`Показать все (${list.length})`, 'btn small', () => { s.showAll = true; render(); }));
    if (!list.length && !s.folderId && !query) {
      gallery.append(element('div', { className: 'empty', text: personaMode ? 'Персон пока нет. Нажмите «+ Персона» или «Из таверны»: карточки получат имена и описания ваших персон.' : lib.folders.length
        ? `${KIND().many} пока нет. Откройте папку слева и добавьте картинки или «${KIND().add}».`
        : `Библиотека пуста. Создайте папку слева (например, по фандому), потом добавьте в неё картинки — или импортируйте. Папки общие у локаций, вещей и карточек.` }));
    } else if (!list.length && query) {
      gallery.append(element('div', { className: 'empty', text: 'Ничего не найдено.' }));
    }
    return gallery;
  }

  /**
   * The AU of the open folder: four short notes (see core/au-notes.js). Loose notes can be pasted and sorted into the fields by the model.
   * What is written here is read whenever a card is written into this folder or any folder inside it.
   */
  function renderFolderAu(folder) {
    if (s.auDraft?.folderId !== folder.id) s.auDraft = { folderId: folder.id, fields: normalizeAu(folder.au), raw: '', extra: [], busy: false };
    const d = s.auDraft;
    const parent = folder.parentId ? folderAu(library(), folder.parentId) : null;
    const panel = element('div', { className: 'ku-aupanel' }, [
      element('strong', { text: `АУ папки «${folder.name}»` }),
      element('p', { className: 'ku-hint', text: 'По желанию. Это читается, когда карточку пишут в эту папку или в любую папку внутри неё. Подпапка добавляет своё к АУ внешней, так что можно держать папку фандома и в ней папки отдельных АУ. Если карточку переносят сюда из папки с другим АУ, предложат перестроить её.' }),
      ...(parent && !auIsEmpty(parent) ? [element('p', { className: 'ku-hint', text: `Уже действует от внешних папок: ${auSummary(parent, 300)}` })] : []),
    ]);
    const raw = element('textarea', { rows: 4, value: d.raw, placeholder: 'Напишите как удобно, хоть сплошным текстом: «современное АУ, все учатся в одном универе, банд нет, Эмму жив, Майки не знает Дракена»', 'aria-label': 'АУ своими словами', disabled: d.busy });
    raw.addEventListener('input', () => { d.raw = raw.value; });
    const sort = button(d.busy ? 'Разбираю…' : 'Разобрать по полям', 'btn small', async () => {
      if (!d.raw.trim()) { setStatus('Сначала напишите АУ своими словами.', true); return; }
      d.busy = true; render();
      try {
        const done = await invoke('onFolderAuParse', { text: d.raw, folderName: folder.name });
        // what is already in a field stays; the new text is added after it
        for (const field of AU_FIELDS) {
          const add = done.au[field.id];
          if (!add) continue;
          d.fields[field.id] = d.fields[field.id] && !d.fields[field.id].includes(add) ? `${d.fields[field.id]}
${add}` : (d.fields[field.id] || add);
        }
        d.extra = done.extra ?? [];
        d.raw = '';
        setStatus('Разобрано по полям: проверьте и нажмите «Сохранить АУ».');
      } catch (error) { setStatus(error?.message || String(error), true); }
      finally { d.busy = false; render(); }
    }, 'Модель разложит ваш текст по четырём полям ниже; ничего не сохраняется, пока вы не нажмёте «Сохранить АУ»');
    // Templates: an AU written once is kept under a name and taken into any folder (nothing changes in the folder until «Сохранить АУ»).
    const templates = library().auTemplates ?? [];
    const pick = element('select', { 'aria-label': 'Шаблон АУ', disabled: d.busy }, [
      element('option', { value: '', text: templates.length ? '— выбрать шаблон —' : '— шаблонов пока нет —' }),
      ...templates.map(item => element('option', { value: item.id, text: item.name, selected: item.id === d.tplPick })),
    ]);
    pick.addEventListener('change', () => { d.tplPick = pick.value; render(); });
    const chosen = templates.find(item => item.id === d.tplPick);
    const tplName = element('input', { type: 'text', value: d.tplName ?? '', placeholder: chosen ? chosen.name : 'Название шаблона, например «Универ»', 'aria-label': 'Название шаблона АУ', maxLength: 80, disabled: d.busy });
    tplName.addEventListener('input', () => { d.tplName = tplName.value; });
    panel.append(element('div', { className: 'ku-fld ku-autpl' }, [
      element('label', { className: 'ku-clabel', text: 'Шаблоны АУ' }),
      element('div', { className: 'ku-row' }, [
        pick,
        Object.assign(button('Взять шаблон', 'btn small', () => { if (!chosen) return; d.fields = normalizeAu(chosen.au); d.extra = []; setStatus(`Шаблон «${chosen.name}» подставлен в поля. Проверьте и нажмите «Сохранить АУ».`); render(); }, 'Поля ниже заменятся текстом шаблона; в папке ничего не меняется, пока вы не нажмёте «Сохранить АУ»'), { disabled: !chosen || d.busy }),
        Object.assign(button('Удалить шаблон', 'btn small', () => attempt(async () => { await invoke('onLibraryRemoveAuTemplate', { id: chosen.id }); d.tplPick = ''; }, 'Шаблон удалён'), 'Удалить выбранный шаблон (папки, где он уже сохранён, не меняются)'), { disabled: !chosen || d.busy }),
      ]),
      element('div', { className: 'ku-row' }, [
        tplName,
        Object.assign(button('Сохранить как шаблон', 'btn small', () => attempt(async () => {
          const name = (d.tplName ?? '').trim() || chosen?.name || '';
          if (!name) throw new Error('Впишите название шаблона.');
          await invoke('onLibrarySaveAuTemplate', { name, au: d.fields });
          d.tplName = '';
          d.tplPick = (library().auTemplates ?? []).find(item => item.name.toLocaleLowerCase('ru-RU') === name.toLocaleLowerCase('ru-RU'))?.id ?? '';
        }, 'Шаблон сохранён'), 'Сохранить то, что написано в полях ниже. Такое же название заменит старый шаблон'), { disabled: d.busy }),
      ]),
    ]));
    panel.append(
      element('div', { className: 'ku-fld' }, [element('label', { className: 'ku-clabel', text: 'Своими словами' }), raw]),
      element('div', { className: 'ku-row' }, [sort]),
      ...(d.extra.length ? [element('p', { className: 'ku-hint', text: `Про отдельных героев (впишите в их карточки, а не сюда): ${d.extra.join('; ')}` })] : []),
    );
    for (const field of AU_FIELDS) {
      const area = element('textarea', { rows: 2, value: d.fields[field.id], placeholder: field.placeholder, 'aria-label': field.label, disabled: d.busy });
      area.addEventListener('input', () => { d.fields[field.id] = area.value; });
      panel.append(element('div', { className: 'ku-fld' }, [element('label', { className: 'ku-clabel', text: field.label }), area, element('span', { className: 'ku-hint', text: field.hint })]));
    }
    panel.append(element('div', { className: 'ku-row' }, [
      Object.assign(button('Сохранить АУ', 'btn primary small', () => attempt(async () => { await invoke('onLibraryUpdateFolder', { folderId: folder.id, changes: { au: d.fields } }); s.auOpen = ''; s.auDraft = null; }, 'АУ папки сохранено')), { disabled: d.busy }),
      button('Закрыть', 'btn small', () => { s.auOpen = ''; s.auDraft = null; render(); }),
      button('Очистить АУ', 'btn small', () => { d.fields = normalizeAu({}); render(); }, 'Очистить поля (сохранится, когда нажмёте «Сохранить АУ»)'),
    ]));
    return panel;
  }

  /** The open folder's name with rename / delete. */
  function renderFolderTitle() {
    const folder = library().folders.find(item => item.id === s.folderId);
    if (!folder) return [];
    if (s.renaming) {
      const input = element('input', { type: 'text', value: folder.name, 'aria-label': 'Новое название папки' });
      const save = () => { s.renaming = false; attempt(() => invoke('onLibraryUpdateFolder', { folderId: s.folderId, changes: { name: input.value } }), 'Папка переименована'); };
      input.addEventListener('keydown', event => {
        if (event.key === 'Enter') { event.preventDefault(); save(); }
        if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); s.renaming = false; render(); }
      });
      setTimeout(() => { input.focus(); input.select(); }, 0);
      return [element('span', { className: 'ku-rename' }, [input, button('Сохранить', 'btn primary small', save), button('Отмена', 'btn small', () => { s.renaming = false; render(); })])];
    }
    return [
      element('h3', { className: 'ku-ltitle', text: pathText(folder.id) }),
      iconButton('edit', 'Переименовать папку', () => { s.renaming = true; render(); }),
      ...(personaMode ? [] : [button(folder.au ? 'АУ папки ✓' : 'АУ папки', `btn small${s.auOpen === folder.id ? ' primary' : ''}`, () => { s.auOpen = s.auOpen === folder.id ? '' : folder.id; s.auDraft = null; render(); }, 'Изменения АУ: читаются, когда карточку пишут в эту папку; если карточку переносят сюда из другой папки, предложат перестроить её под это АУ')]),
      iconButton('close', 'Удалить папку', async () => {
        const removed = await attempt(() => invoke('onLibraryRemoveFolder', { folderId: s.folderId }));
        if (removed) { s.folderId = folder.parentId ?? ''; render(); }
      }),
    ];
  }

  function cover(entry) {
    return element('span', { className: 'ku-pic ku-nopic', 'aria-hidden': 'true' }, [icon(KIND().icon), element('span', { className: 'ku-letter', text: entry.name.slice(0, 1) })]);
  }

  function picture(entry) {
    // A persona card with no picture of its own shows the picture of the persona in the tavern (as the open card does).
    if (!entry.image && personaMode && entry.avatar) {
      // the file keeps its name when the picture is replaced: a fresh address every half minute shows the new one
      const stamp = Math.floor(Date.now() / 30000);
      const ph = element('img', { className: 'ku-pic', src: `/User Avatars/${encodeURIComponent(entry.avatar)}?t=${stamp}`, alt: '', loading: 'lazy', draggable: false });
      ph.addEventListener('error', () => ph.replaceWith(cover(entry)), { once: true });
      return ph;
    }
    if (!entry.image) return cover(entry);
    const img = element('img', { className: 'ku-pic', src: imageUrl(entry.image), alt: '', loading: 'lazy', draggable: false });
    // A picture from another computer's library (an imported file) is not on this server.
    img.addEventListener('error', () => img.replaceWith(cover(entry)), { once: true });
    return img;
  }

  function tile(entry, linked) {
    const on = linked.has(entry.id);
    const card = element('div', { className: `ku-place-card ku-ltile${s.openId === entry.id ? ' on' : ''}` });
    const sub = cards()
      ? `${(entry.sections ?? []).filter(section => section.text.trim()).length} из ${(entry.sections ?? []).length} разделов заполнено${cardIsEnglish(entry) ? ' · English' : ''}`
      : things()
        ? (entry.ownerName ? `обычно у: ${entry.ownerName}` : 'без хозяина')
        : (() => {
          const parts = library().locations.filter(item => item.parentId === entry.id).length;
          const where = entry.parentId ? `в ${library().locations.find(item => item.id === entry.parentId)?.name ?? '…'}` : (entry.traits[0] ?? 'без места выше');
          return parts ? `подлокаций: ${parts}${entry.parentId ? ` · ${where}` : ''}` : where;
        })();
    const open = element('button', { type: 'button', className: 'ku-place-open', 'aria-label': `${entry.name} — открыть` }, [
      picture(entry),
      element('span', { className: 'ku-ltext' }, [
        element('strong', { text: entry.name }),
        element('span', { className: 'muted ku-small', text: sub }),
        ...(things() && entry.importance !== 'normal' ? [element('span', { className: 'ku-chip told', text: IMPORTANCE_RU[entry.importance] })] : []),
        ...(cards() && entry.source?.stale ? [element('span', { className: 'ku-chip ku-stale', text: 'изменилась в Obsidian' })] : []),
        ...(!cards() && entry.lang === 'en' ? [element('span', { className: 'ku-chip told', text: 'English' })] : []),
      ]),
    ]);
    if (on) open.append(element('span', { className: 'ku-worn', text: 'в чате' }));
    // A picture without opening the card: a small button on the tile, or an image dragged onto it.
    const setPicture = files => attempt(async () => invoke('onLibrarySetImage', { kind, id: entry.id, imageDataUrl: await fileToDataUrl(files[0]) }), 'Картинка сохранена');
    if (!s.selecting) {
      const pick = portraitPicker(entry.image ? 'Заменить картинку' : 'Поставить картинку', setPicture);
      pick.classList.add('ku-tilepic');
      if (!entry.image) pick.classList.add('empty');
      card.append(pick);
      card.addEventListener('dragover', event => { if ([...(event.dataTransfer?.types ?? [])].includes('Files')) { event.preventDefault(); card.classList.add('over'); } });
      card.addEventListener('dragleave', () => card.classList.remove('over'));
      card.addEventListener('drop', event => {
        const files = [...(event.dataTransfer?.files ?? [])].filter(file => /^image\//.test(file.type));
        card.classList.remove('over');
        if (!files.length) return;
        event.preventDefault();
        event.stopPropagation(); // not the gallery's «new entries from pictures»
        setPicture(files);
      });
    }
    if (s.selecting) {
      const mark = element('input', { type: 'checkbox', className: 'ku-pickbox', checked: s.picked.has(entry.id), 'aria-label': `Выбрать ${entry.name}`, tabindex: '-1' });
      open.prepend(mark);
      card.classList.toggle('picked', s.picked.has(entry.id));
      open.addEventListener('click', () => { if (s.picked.has(entry.id)) s.picked.delete(entry.id); else s.picked.add(entry.id); render(); });
    } else open.addEventListener('click', () => { s.openId = entry.id; s.draft = null; s.askReplace = false; render(); });
    card.append(open, element('label', { className: 'ku-inline ku-small' }, [
      toggle(on, personaMode ? `${entry.name}: персона этого чата` : `${entry.name} в этом чате`, value => attempt(() => (personaMode ? act('onPersonaCardUse', { cardId: value ? entry.id : '' }, 'persona-card-use') : act('onLibraryLink', { libraryIds: [entry.id], on: value, ...shelfArg() }, 'library-link')))),
      on ? (personaMode ? 'персона чата' : 'в этом чате') : (personaMode ? 'не выбрана' : 'выключена'),
    ]));
    return card;
  }

  // ---- The card over the window ------------------------------------------------

  /** The parts of a place (rooms of a house): the same gallery of tiles, inside the card; a tile opens the part's own card. */
  function renderParts(entry, saveFirst) {
    const parts = library().locations.filter(item => item.parentId === entry.id);
    const linked = linkedSet();
    const box = element('div', { className: 'field ku-parts' });
    const add = button('+ Подлокация', 'btn small', () => attempt(async () => {
      await saveFirst();
      const made = await invoke('onLibraryAddLocation', { folderId: entry.folderId, name: 'Новая подлокация', parentId: entry.id });
      if (made?.id) { s.openId = made.id; s.draft = null; s.askReplace = false; }
    }), 'Добавить комнату или часть этого места: у неё свои название, слова и описание');
    box.append(element('div', { className: 'ku-row' }, [
      element('label', { text: parts.length ? `Подлокации · ${parts.length}` : 'Подлокации' }), element('span', { className: 'ku-push' }), add,
    ]));
    if (!parts.length) {
      box.append(element('p', { className: 'ku-hint', text: 'Пока нет. Комнаты дома или залы клуба лучше вести отдельными карточками внутри этой: у каждой свои слова, по которым она включается, и рассказчик получает только нужную часть.' }));
      return box;
    }
    const grid = element('div', { className: 'ku-tiles ku-ltiles places ku-subtiles' }, parts.map(part => tile(part, linked)));
    // what was typed in this card is kept before another card opens
    grid.addEventListener('click', event => { if (event.target.closest?.('.ku-place-open')) saveFirst().catch(() => {}); }, true);
    box.append(grid);
    return box;
  }

  function renderEditor(entry) {
    if (cards()) return renderCardEditor(entry);
    const lib = library();
    const isThing = things();
    const layer = element('div', { className: 'ku-wlayer' });
    const close = () => { s.openId = ''; s.draft = null; s.askReplace = false; render(); };
    layer.addEventListener('click', event => { if (event.target === layer) close(); });
    const dialog = element('section', { className: 'ku-wcard', role: 'dialog', 'aria-modal': 'true', 'aria-label': entry.name });
    dialog.addEventListener('keydown', event => { if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); close(); } });
    // Neighbours in the same folder, for ‹ ›.
    const siblings = entriesOf().filter(item => item.folderId === entry.folderId);
    const index = siblings.findIndex(item => item.id === entry.id);
    const go = step => { const next = siblings[index + step]; if (next) { s.openId = next.id; s.draft = null; s.askReplace = false; render(); } };

    const view = element('div', { className: `ku-wview ${kind}` }, [
      entry.image ? element('img', { src: imageUrl(entry.image), alt: entry.name }) : element('span', { className: 'ku-nopic big', 'aria-hidden': 'true' }, [icon(KIND().icon), element('span', { text: 'Нет картинки' })]),
      element('div', { className: 'ku-wview-tools' }, [
        filePicker(entry.image ? 'Заменить' : 'Добавить картинку', { multiple: false, onFiles: async files => {
          await attempt(async () => invoke('onLibrarySetImage', { kind, id: entry.id, imageDataUrl: await fileToDataUrl(files[0]) }), 'Картинка сохранена');
        } }),
        ...(entry.image ? [button('Убрать картинку', 'btn small', () => attempt(() => invoke('onLibraryRemoveImage', { kind, id: entry.id }), 'Картинка убрана'))] : []),
        element('span', { className: 'ku-push' }),
        Object.assign(button('‹', 'btn small', () => go(-1), 'Предыдущая'), { disabled: index <= 0 }),
        Object.assign(button('›', 'btn small', () => go(1), 'Следующая'), { disabled: index < 0 || index >= siblings.length - 1 }),
      ]),
    ]);

    // What the user typed survives any redraw until it is saved or the card is closed.
    const draft = s.draft?.id === entry.id ? s.draft.fields : {};
    const value = (key, fallback) => (draft[key] ?? fallback);
    const controls = {
      name: element('input', { type: 'text', value: value('name', entry.name), 'aria-label': 'Название' }),
      folderId: element('select', { 'aria-label': 'Папка' }, foldersOf().concat(lib.folders.filter(item => item.id === entry.folderId && !foldersOf().includes(item))).map(item => element('option', { value: item.id, text: item.hidden ? 'Без папки' : pathText(item.id), selected: item.id === value('folderId', entry.folderId) }))),
      aliases: element('input', { type: 'text', value: value('aliases', entry.aliases.join(', ')), 'aria-label': 'Другие названия', placeholder: isThing ? 'через запятую: так летописец её узнает' : 'через запятую' }),
      description: element('textarea', { rows: 6, value: value('description', entry.description), 'aria-label': 'Описание', placeholder: isThing ? 'как выглядит, чем особенная — уходит рассказчику, когда вещь в сцене' : 'как выглядит место: можно написать самой или попросить модель по картинке' }),
    };
    if (isThing) {
      controls.ownerName = element('input', { type: 'text', value: value('ownerName', entry.ownerName ?? ''), 'aria-label': 'Обычно у кого', placeholder: 'имя персонажа: в чате вещь сразу окажется у него' });
      controls.importance = element('select', { 'aria-label': 'Важность' }, Object.entries(IMPORTANCE_RU).map(([key, text]) => element('option', { value: key, text, selected: value('importance', entry.importance) === key })));
    } else {
      controls.parentId = element('select', { 'aria-label': 'Находится в' }, [
        element('option', { value: '', text: '— нигде (отдельное место) —' }),
        ...lib.locations.filter(item => item.id !== entry.id).map(item => element('option', { value: item.id, text: item.name, selected: item.id === value('parentId', entry.parentId ?? '') })),
      ]);
      controls.traits = element('textarea', { rows: 3, value: value('traits', entry.traits.join('\n')), 'aria-label': 'Черты', placeholder: 'по одной на строку: камин, скрипучая лестница…' });
    }
    const read = () => Object.fromEntries(Object.entries(controls).map(([key, node]) => [key, node.value]));
    for (const node of Object.values(controls)) {
      node.addEventListener('input', () => { s.draft = { id: entry.id, fields: read() }; });
      node.addEventListener('change', () => { s.draft = { id: entry.id, fields: read() }; });
    }
    const changes = () => {
      const fields = read();
      const common = { name: fields.name, folderId: fields.folderId, aliases: fields.aliases.split(','), description: fields.description };
      return isThing
        ? { ...common, ownerName: fields.ownerName, importance: fields.importance }
        : { ...common, parentId: fields.parentId, traits: fields.traits.split('\n') };
    };
    const save = async () => {
      await (isThing
        ? invoke('onLibraryUpdateItem', { itemId: entry.id, changes: changes() })
        : invoke('onLibraryUpdateLocation', { locationId: entry.id, changes: changes() }));
      s.draft = null;
    };
    // «Сохранить» closes the card; a failed save keeps it open with what was typed.
    const saveAndClose = async () => { await save(); s.openId = ''; s.askReplace = false; };
    const describe = () => attempt(async () => {
      await save(); // what was typed (a name too) is kept, the model only adds
      s.askReplace = false;
      return invoke('onLibraryDescribe', { kind, id: entry.id });
    }, 'Описание готово — проверьте и поправьте, если нужно');
    const describeButton = button('Описать по картинке', 'btn small', () => {
      if (controls.description.value.trim()) { s.askReplace = true; render(); return; }
      describe();
    });
    describeButton.title = entry.image ? 'Попросить модель описать картинку (та же модель, что у гардероба)' : 'Сначала добавьте картинку';
    describeButton.disabled = !entry.image;
    const replaceRow = s.askReplace ? element('div', { className: 'ku-row ku-ask' }, [
      element('span', { className: 'ku-small', text: 'Описание уже есть. Заменить его новым?' }),
      button('Заменить описание', 'btn primary small', describe),
      button('Оставить', 'btn small', () => { s.askReplace = false; render(); }),
    ]) : null;

    const linked = linkedSet().has(entry.id);
    const field = (label, control) => element('div', { className: 'field' }, [element('label', { text: label }), control]);
    const labeled = (label, control, hint) => element('div', { className: 'field ku-wsel' }, [element('label', { text: label }), control, ...(hint ? [element('p', { className: 'ku-hint', text: hint })] : [])]);
    // The translation: a place takes its parts (rooms) with it; when the place itself is English but some parts are not, the button translates them.
    const partsOf = id => lib.locations.filter(item => item.parentId === id).flatMap(item => [item, ...partsOf(item.id)]);
    const russianParts = isThing ? [] : partsOf(entry.id).filter(item => item.lang !== 'en' && (item.description.trim() || (item.traits ?? []).length));
    const translateControls = () => {
      const run = () => attempt(async () => {
        setStatus('Перевожу…');
        await save();
        await invoke('onLibraryTranslateEntry', { kind, id: entry.id });
      }, 'Переведено на английский');
      if (entry.lang === 'en' && !russianParts.length) return [element('span', { className: 'ku-chip told', title: 'Описание' + (isThing ? '' : ' и черты') + ' переведены на английский', text: 'English' })];
      if (entry.lang === 'en') return [button(`Перевести подлокации (${russianParts.length})`, 'btn small', run, 'Само место уже на английском; модель переведёт его подлокации, которые ещё на русском')];
      return [button(russianParts.length ? `Перевести на английский (с подлокациями: ${russianParts.length})` : 'Перевести на английский', 'btn small', run, 'Модель переведёт описание' + (isThing ? '' : ' и черты') + ' один к одному' + (russianParts.length ? ', и так же каждую подлокацию' : '') + '; русский текст в библиотеке заменится переводом (сделайте «Копию», если он нужен)')];
    };
    const upTo = !isThing && entry.parentId ? lib.locations.find(item => item.id === entry.parentId) : null;
    const form = element('div', { className: 'ku-wform' }, [
      element('div', { className: 'ku-row' }, [
        ...(upTo ? [button(`↑ ${upTo.name}`, 'btn small', () => { s.openId = upTo.id; s.draft = null; s.askReplace = false; render(); }, 'К месту, в котором это находится')] : []),
        element('span', { className: 'muted ku-small', text: `${KIND().many} · ${pathText(entry.folderId)}` }),
        element('span', { className: 'ku-push' }),
        Object.assign(element('button', { type: 'button', className: 'ku-ib', 'aria-label': 'Свернуть', title: 'Свернуть окно: запись останется открытой' }, [icon('minimize')]), { onclick: () => ctx.minimize?.() }),
        Object.assign(element('button', { type: 'button', className: 'ku-ib', 'aria-label': 'Закрыть', title: 'Закрыть' }, [icon('close')]), { onclick: close }),
      ]),
      field('Название', controls.name),
      ...(isThing
        ? [element('div', { className: 'ku-row ku-wselects' }, [labeled('Важность', controls.importance, 'Насколько вещь важна для сюжета: важные летописец держит в уме дольше'), labeled('Папка в библиотеке', controls.folderId)]), field('Обычно у кого', controls.ownerName)]
        : [element('div', { className: 'ku-row ku-wselects' }, [labeled('Находится в', controls.parentId, 'Внутри какого места это место: комната внутри дома, дом внутри района. Без этого оно самостоятельное.'), labeled('Папка в библиотеке', controls.folderId, 'Только для порядка в библиотеке; на сюжет не влияет.')])]),
      field('Другие названия', controls.aliases),
      ...(isThing ? [] : [field('Черты', controls.traits)]),
      element('div', { className: 'field' }, [element('div', { className: 'ku-row' }, [element('label', { text: 'Описание' }), element('span', { className: 'ku-push' }), describeButton]), controls.description]),
      replaceRow,
      ...(isThing ? [] : [renderParts(entry, save)]),
      element('label', { className: 'ku-inline ku-wear' }, [
        toggle(linked, `${entry.name} в этом чате`, on => attempt(() => act('onLibraryLink', { libraryIds: [entry.id], on, ...shelfArg() }, 'library-link'))),
        element('span', {}, [element('strong', { className: 'ku-small', text: linked ? 'Включена в этом чате' : 'Выключена в этом чате' }),
          element('span', { className: 'muted ku-small', text: isThing ? ' — летописец и рассказчик знают о ней' : ' — летописец и рассказчик знают это место' })]),
      ]),
      element('div', { className: 'ku-row ku-wfoot' }, [
        button('Удалить', 'btn small danger', () => attempt(async () => {
          const removed = await (isThing ? invoke('onLibraryRemoveItem', { itemId: entry.id }) : invoke('onLibraryRemoveLocation', { locationId: entry.id }));
          if (removed) { s.openId = ''; s.draft = null; }
        })),
        ...(isThing ? [] : [button('Копия', 'btn small', () => attempt(async () => {
          const copy = await invoke('onLibraryDuplicateLocation', { locationId: entry.id });
          if (copy?.id) { s.openId = copy.id; s.draft = null; }
        }, 'Копия создана'))]),
        ...translateControls(),
        element('span', { className: 'ku-push' }),
        button('Сохранить', 'btn primary small', () => attempt(saveAndClose, isThing ? 'Вещь сохранена' : 'Локация сохранена')),
      ]),
    ]);
    dialog.append(view, form);
    layer.append(dialog);
    // Focus the name once, when the card opens — not after every redraw (it looked like an error).
    if (s.focusedId !== entry.id) {
      s.focusedId = entry.id;
      setTimeout(() => { if (dialog.isConnected && !dialog.contains(ctx.shadow?.activeElement)) controls.name.focus({ preventScroll: true }); }, 0);
    }
    return layer;
  }

  // ---- The card of a character ---------------------------------------------------

  /** Where each section stands for the coming reply (card-prompt.js report), by section id. */
  function promptStatus(cardId) {
    const person = (snapshot().cardsReport?.people ?? []).find(item => item.cardId === cardId);
    if (!person) return null;
    return new Map(person.parts.map(part => [part.sectionId, part]));
  }

  const WHEN_LABELS = { ...GATE_WHEN };
  /** The id the list of sections uses for the closet (it is not a section). */
  const CLOSET = '__closet';
  /** And the names of the card (words with their case forms). */
  const NAMES = '__names';
  /** And the records about a persona (persona cards only). */
  const RECORDS = '__records';
  /** And the page that writes sections with the model. */
  const GENERATE = '__generate';

  /**
   * The portrait with its buttons on the picture itself, seen on hover: the whole picture picks a new one, a cross in the corner takes it off
   * (only when the card has its own). Nothing sits beside it, so the picture can be big.
   */
  function portraitFrame(entry, portrait) {
    const input = element('input', { type: 'file', accept: 'image/*', hidden: true, 'aria-label': 'Картинка карточки' });
    input.addEventListener('change', () => {
      const files = [...(input.files ?? [])];
      input.value = '';
      if (files.length) attempt(async () => invoke('onLibrarySetImage', { kind, id: entry.id, imageDataUrl: await fileToDataUrl(files[0]) }), 'Картинка сохранена');
    });
    const label = entry.image ? 'Заменить картинку' : 'Добавить картинку';
    const pick = element('button', { type: 'button', className: 'ku-cport-pick', 'aria-label': label, title: label }, [icon('image')]);
    pick.addEventListener('click', () => input.click());
    const nodes = [portrait, pick, input];
    if (entry.image) {
      const clear = element('button', { type: 'button', className: 'ku-cport-x', 'aria-label': 'Убрать картинку', title: 'Убрать картинку' }, [icon('close')]);
      clear.addEventListener('click', event => { event.stopPropagation(); attempt(() => invoke('onLibraryRemoveImage', { kind, id: entry.id }), 'Картинка убрана'); });
      nodes.push(clear);
    }
    return element('div', { className: 'ku-cport-wrap' }, nodes);
  }

  /** The full-length reference of a character or a persona card: a small picture under the portrait (a click makes it big), a button to attach or change it. */
  function refBox(entry) {
    const input = element('input', { type: 'file', accept: 'image/*', hidden: true, 'aria-label': 'Референс в полный рост' });
    input.addEventListener('change', () => {
      const files = [...(input.files ?? [])];
      input.value = '';
      if (files.length) attempt(async () => invoke('onLibrarySetRefImage', { id: entry.id, imageDataUrl: await fileToDataUrl(files[0]) }), 'Референс сохранён');
    });
    if (!entry.refImage) {
      return element('div', { className: 'ku-refbox' }, [
        Object.assign(button('+ Референс', 'btn small', () => input.click(), 'Прикрепить картинку в полный рост: чтобы всегда была перед глазами. Модели она не отправляется'), { type: 'button' }), input,
      ]);
    }
    const thumb = element('img', { className: 'ku-refthumb', src: imageUrl(entry.refImage), alt: `Референс: ${entry.name}`, title: 'Нажмите, чтобы открыть крупно' });
    thumb.addEventListener('click', () => { s.refZoom = true; render(); });
    return element('div', { className: 'ku-refbox' }, [
      thumb,
      element('div', { className: 'ku-row' }, [
        button('Заменить', 'btn small', () => input.click(), 'Другая картинка в полный рост'),
        button('×', 'btn icon small', () => attempt(() => invoke('onLibraryRemoveRefImage', { id: entry.id }), 'Референс убран'), 'Убрать референс'),
      ]),
      input,
    ]);
  }

  /**
   * The sheet of a card, laid out as: who (a strip on top), the sections (a list on the left), one section at a time (on the right).
   * What was typed lives in `s.draft` until «Сохранить» or the card is closed, so any redraw keeps it.
   */
  /** The state of «Написать карточку» of the open card (one per open card, thrown away when it closes). */
  const hasPictureOf = entry => Boolean(entry.image || (entry.persona && entry.avatar));
  const genState = (entry, draft) => (s.gen ??= freshGeneration(draft, { persona: Boolean(entry.persona), hasPicture: hasPictureOf(entry) }));
  /** The fandom a folder names: the top folder of its path, unless that is «Без папки» (then the user types it). */
  const fandomOf = folderId => { const root = folderPath(library(), folderId)[0]; return root && !root.hidden && root.name !== NO_FOLDER_NAME ? root.name : ''; };
  const folderChoices = (draft) => {
    const list = foldersOf().map(item => ({ id: item.id, text: item.hidden ? NO_FOLDER_NAME : pathText(item.id) }));
    if (draft.folderId && !list.some(item => item.id === draft.folderId)) list.push({ id: draft.folderId, text: pathText(draft.folderId) || NO_FOLDER_NAME });
    return list;
  };
  /** Rebuild the filled sections for the AU of the folder the card is in now (after a move, or on demand). */
  const rebuildForAu = (entry, draft, gen) => {
    const moved = draft.folderId !== entry.folderId;
    const jobs = draft.sections.filter(section => section.text.trim() && !['nsfw', 'private'].includes(section.kind)).map(section => ({ section, fresh: false }));
    if (!jobs.length) { setStatus('Нечего перестраивать: заполненных разделов нет.', true); return Promise.resolve(); }
    gen.dismissedFor = draft.folderId;
    return runGeneration(gen, {
      ...genDeps(entry, draft, gen), jobs, wishes: () => '', picture: { on: false },
      adapt: { from: moved ? auPrompt(folderAu(library(), entry.folderId)) : 'a previous setting that is not known', to: auPrompt(folderAu(library(), draft.folderId)) },
    });
  };
  /** The sections go into the card at once (a text written by the model, a piece moved into a section of its own): nothing waits for «Сохранить». */
  const keepSections = async (entry, draft) => {
    await invoke('onLibraryUpdateCharacter', { cardId: entry.id, changes: { sections: draft.sections } });
    // the sections are saved now: only what is typed after them counts as unsaved
    if (s.draft?.id === entry.id && s.draft.base !== undefined) { const base = JSON.parse(s.draft.base); base.sections = JSON.parse(JSON.stringify(draft.sections)); s.draft.base = JSON.stringify(base); }
  };
  const genDeps = (entry, draft, gen) => ({
    gen, draft, entryId: entry.id,
    card: { name: draft.name, aliases: draft.aliases.split(',').map(value => value.trim()).filter(Boolean), gender: draft.gender },
    redraw: render, setStatus,
    save: () => keepSections(entry, draft),
    generate: request => invoke('onCardGenerate', request),
    describe: request => invoke('onCardDescribe', request),
    where: { fandom: () => fandomOf(draft.folderId), folderAu: () => folderAu(library(), draft.folderId) },
    folders: () => folderChoices(draft),
    setFolder: id => { draft.folderId = id; render(); },
    newFolder: async name => {
      const made = await invoke('onLibraryAddFolder', { name, parentId: '' });
      if (made?.id) draft.folderId = made.id;
    },
    moved: draft.folderId !== entry.folderId,
    rebuild: () => rebuildForAu(entry, draft, gen),
  });

  function renderCardEditor(entry) {
    const lib = library();
    const emb = embed;
    const layer = element('div', { className: `ku-wlayer${emb ? ' ku-embedded' : ''}` });
    const forget = () => { s.draft = null; s.selSection = ''; s.closetFirst = null; s.selRecord = 0; s.gen = null; s.clearing = null; s.refZoom = false; };
    // Typed and not saved: leaving asks first (save / leave without saving / stay), so a card is not lost by a stray click.
    const dirty = () => Boolean(s.draft && s.draft.id === entry.id && s.draft.base !== undefined && JSON.stringify(s.draft.fields) !== s.draft.base);
    const leaveWith = action => { if (dirty()) { s.leaving = action; render(); } else action(); };
    const closeNow = () => { s.leaving = null; s.openId = ''; forget(); render(); };
    // A model is writing: closing would hide it, so the window is folded to the pill instead (the card stays, the work goes on).
    const close = () => { if (s.gen?.running || s.translating?.id === entry.id) { ctx.minimize?.(); return; } leaveWith(closeNow); };
    if (!emb) layer.addEventListener('click', event => { if (event.target === layer) close(); });
    const dialog = element('section', { className: 'ku-wcard ku-ccard', role: emb ? 'region' : 'dialog', ...(emb ? {} : { 'aria-modal': 'true' }), 'aria-label': entry.name });
    if (!emb) dialog.addEventListener('keydown', event => { if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); close(); } });
    const siblings = entriesOf().filter(item => item.folderId === entry.folderId);
    const index = siblings.findIndex(item => item.id === entry.id);
    const go = step => { if (s.gen?.running || s.translating?.id === entry.id) { setStatus('Идёт запись: дождитесь конца или откройте другую карточку позже.', true); return; } const next = siblings[index + step]; if (next) leaveWith(() => { s.leaving = null; s.openId = next.id; forget(); render(); }); };

    // The draft: what the user changed and has not saved yet. Sections are a list of plain objects edited in place.
    if (s.draft?.id !== entry.id) {
      s.draft = { id: entry.id, fields: {
        name: entry.name, folderId: entry.folderId, aliases: entry.aliases.join(', '), gender: entry.gender ?? '',
        sections: entry.sections.map(section => ({ ...section, keys: [...(section.keys ?? [])] })),
        words: (entry.words ?? []).map(word => ({ ...word })),
        records: recordsToDraft(entry.records),
        closet: { cardIds: [...(entry.closet?.cardIds ?? [])], lookIds: [...(entry.closet?.lookIds ?? [])], ownIds: [...(entry.closet?.ownIds ?? [])] },
      } };
      s.draft.base = JSON.stringify(s.draft.fields);
      s.selSection = '';
    }
    const draft = s.draft.fields;
    if (s.selSection !== CLOSET && s.selSection !== NAMES && s.selSection !== RECORDS && s.selSection !== GENERATE && !draft.sections.some(section => section.id === s.selSection)) s.selSection = draft.sections[0]?.id ?? '';
    const status = promptStatus(entry.id);
    // «Очистить разделы»: the footer button opens a list of the sections that have text; tick some or all, empty them in one go.
    const clearPanel = (() => {
      if (!s.clearing) return null;
      const list = draft.sections.filter(section => section.text.trim());
      if (!list.length) { s.clearing = null; return null; }
      const picked = s.clearing.picked;
      for (const id of [...picked]) if (!list.some(section => section.id === id)) picked.delete(id);
      const chosen = list.filter(section => picked.has(section.id));
      const rows = list.map(section => {
        const box = element('input', { type: 'checkbox', checked: picked.has(section.id), 'aria-label': `Очистить раздел ${section.title || CARD_SECTION_KINDS[section.kind] || ''}` });
        box.addEventListener('change', () => { if (box.checked) picked.add(section.id); else picked.delete(section.id); s.clearing.confirm = false; render(); });
        return element('label', { className: 'ku-inline ku-clearrow' }, [box, element('span', { text: ` ${section.title || CARD_SECTION_KINDS[section.kind] || 'Раздел'} ` }), element('span', { className: 'muted ku-small', text: `${section.text.length} зн.` })]);
      });
      const run = () => {
        if (!s.clearing.confirm) { s.clearing.confirm = true; render(); return; }
        const gen = genState(entry, draft);
        gen.backup = gen.backup ?? new Map();
        for (const section of chosen) { if (!gen.backup.has(section.id)) gen.backup.set(section.id, section.text); section.text = ''; }
        s.clearing = null;
        setStatus(`Очищено разделов: ${chosen.length}. Нажмите «Сохранить», чтобы это осталось; вернуть тексты можно на странице «Написать разделы» кнопкой «Вернуть прежние тексты».`);
        render();
      };
      return element('div', { className: 'ku-aunotice ku-clearpanel', role: 'group', 'aria-label': 'Очистить разделы' }, [
        element('p', {}, [element('strong', { text: 'Какие разделы очистить?' }), ' Сами разделы останутся, сотрутся только их тексты.']),
        element('div', { className: 'ku-row' }, [
          button('Все', 'btn small', () => { for (const section of list) picked.add(section.id); s.clearing.confirm = false; render(); }),
          button('Снять все', 'btn small', () => { picked.clear(); s.clearing.confirm = false; render(); }),
        ]),
        element('div', { className: 'ku-clearlist' }, rows),
        element('div', { className: 'ku-row' }, [
          Object.assign(button(s.clearing.confirm ? `Да, очистить ${chosen.length}` : `Очистить${chosen.length ? ` (${chosen.length})` : ''}`, `btn small${s.clearing.confirm ? ' primary' : ''}`, run), { disabled: !chosen.length }),
          button('Закрыть', 'btn small', () => { s.clearing = null; render(); }),
        ]),
      ]);
    })();
    const leaveNotice = s.leaving && dirty() ? element('div', { className: 'ku-aunotice', role: 'alert' }, [
      element('p', { text: 'В карточке есть несохранённые правки. Сохранить перед выходом?' }),
      element('div', { className: 'ku-row' }, [
        button('Сохранить', 'btn primary small', () => attempt(async () => { const action = s.leaving; await persist(); action(); }, 'Карточка сохранена')),
        button('Не сохранять', 'btn small', () => { const action = s.leaving; s.leaving = null; forget(); action(); }),
        button('Остаться', 'btn small', () => { s.leaving = null; render(); }),
      ]),
    ]) : null;
    if (s.leaving && !leaveNotice) s.leaving = null;
    const translateFailed = s.translateError?.id === entry.id ? element('div', { className: 'ku-aunotice', role: 'alert' }, [
      element('p', { text: `Перевод не удался: ${s.translateError.text}. Ничего не переведено наполовину: карточка осталась как была.` }),
      element('div', { className: 'ku-row' }, [button('Понятно', 'btn small', () => { s.translateError = null; render(); })]),
    ]) : null;

    // ---- The strip on top: portrait, name, other names, folder
    const portrait = entry.image
      ? element('img', { className: 'ku-cport', src: imageUrl(entry.image), alt: entry.name })
      : personaMode && entry.avatar ? element('img', { className: 'ku-cport', src: `/User Avatars/${encodeURIComponent(entry.avatar)}`, alt: entry.name })
      : element('span', { className: 'ku-cport ku-cnoport', 'aria-hidden': 'true', text: (draft.name || entry.name).slice(0, 1).toUpperCase() });
    const nameInput = element('input', { type: 'text', value: draft.name, 'aria-label': 'Имя персонажа', className: 'ku-cname', title: 'Имя и «другие имена» — как героя зовут в постах: имя, фамилия, клички, прозвища. Через запятую.' });
    nameInput.addEventListener('input', () => { draft.name = nameInput.value; });
    const aliasInput = element('input', { type: 'text', value: draft.aliases, 'aria-label': 'Другие имена', placeholder: 'Манджиро, Майки', title: 'Имя и «другие имена» — как героя зовут в постах: имя, фамилия, клички, прозвища. Через запятую.' });
    aliasInput.addEventListener('input', () => { draft.aliases = aliasInput.value; });
    const genderPick = element('select', { 'aria-label': 'Пол', className: 'ku-cgender', title: 'Пол героя: модель получает его вместе с остальным о персонаже, а тексты «пришёл / пришла» пишутся в нужном роде.' },
      [['', 'Пол: не указан'], ['female', 'Женский'], ['male', 'Мужской']].map(([value, text]) => element('option', { value, text, selected: value === draft.gender })));
    genderPick.addEventListener('change', () => { draft.gender = genderPick.value; });
    const folderPick = entry.persona || emb ? null : element('select', { 'aria-label': 'Папка карточки', className: 'ku-cfolder', title: 'Папка, в которой лежит карточка (фандом или АУ). Перенести её можно прямо здесь, после «Сохранить» она переедет.' },
      folderChoices(draft).map(item => element('option', { value: item.id, text: item.text, selected: item.id === draft.folderId })));
    if (folderPick) folderPick.addEventListener('change', () => { draft.folderId = folderPick.value; render(); });
    // A card moved into a folder with another AU: offer to rebuild it for that AU.
    const movedGen = folderPick ? genState(entry, draft) : null;
    const auChanged = folderPick && draft.folderId !== entry.folderId && !sameAu(folderAu(lib, entry.folderId), folderAu(lib, draft.folderId))
      && draft.sections.some(section => section.text.trim() && !['nsfw', 'private'].includes(section.kind)) && movedGen.dismissedFor !== draft.folderId;
    const auNotice = auChanged ? element('div', { className: 'ku-aunotice', role: 'status' }, [
      element('p', { text: `В папке «${pathText(draft.folderId) || NO_FOLDER_NAME}» ${auIsEmpty(folderAu(lib, draft.folderId)) ? 'нет АУ (чистый канон)' : `другое АУ: ${auSummary(folderAu(lib, draft.folderId), 200)}`}. Перестроить карточку под него? Заполненные разделы перепишутся (NSFW и скрытый характер не трогаются), прежние тексты можно вернуть.` }),
      element('div', { className: 'ku-row' }, [
        Object.assign(button('Перестроить под АУ', 'btn primary small', () => rebuildForAu(entry, draft, movedGen)), { disabled: movedGen.running }),
        button('Оставить как есть', 'btn small', () => { movedGen.dismissedFor = draft.folderId; render(); }),
      ]),
    ]) : null;
    // A sign that the model is writing: seen on every page of the card, with the step it is on.
    const translatingHere = s.translating?.id === entry.id;
    const writing = s.gen?.running || translatingHere ? element('div', { className: 'ku-genbadge', role: 'status' }, [
      element('span', { className: 'ku-genspin', 'aria-hidden': 'true' }),
      element('span', { text: translatingHere ? s.translating.text : (s.gen.progress || 'Модель пишет карточку…') }),
    ]) : null;
    if (writing && !translatingHere) s.gen.badgeEl = writing.lastChild;
    const top = element('header', { className: 'ku-ctop' }, [
      element('div', { className: 'ku-cport-box' }, [portraitFrame(entry, portrait), refBox(entry)]),
      element('div', { className: 'ku-ctop-main' }, [
        element('div', { className: 'ku-cfields' }, [nameInput, aliasInput, genderPick, ...(folderPick ? [folderPick] : [])]),
        ...(writing ? [writing] : []),
        ...(translateFailed ? [translateFailed] : []),
        ...(leaveNotice ? [leaveNotice] : []),
        ...(auNotice ? [auNotice] : []),
        element('p', { className: 'ku-hint', text: 'Имя и «другие имена» — как героя зовут в постах: имя, фамилия, клички, прозвища. Через запятую. Английские варианты и знаки сами убираются. Склонения каждого слова пишутся слева в разделе «Имена»: оттуда модель берёт написание и падежи, а карточка узнаёт героя в постах. В одной папке имена не повторяются, в разных можно.' }),
      ]),
      element('div', { className: 'ku-ctop-tools' }, emb ? (emb.onGear ? [Object.assign(element('button', { type: 'button', className: 'ku-ib ku-gear', 'aria-label': 'Настройки персоны в таверне', title: 'Настройки персоны в таверне' }, [icon('gear')]), { onclick: emb.onGear })] : []) : [
        Object.assign(element('button', { type: 'button', className: 'ku-ib', 'aria-label': 'Свернуть', title: 'Свернуть окно: карточка останется открытой, а запись (если идёт) продолжится' }, [icon('minimize')]), { onclick: () => ctx.minimize?.() }),
        Object.assign(button('‹', 'btn small', () => go(-1), 'Предыдущая карточка'), { disabled: index <= 0 }),
        Object.assign(button('›', 'btn small', () => go(1), 'Следующая карточка'), { disabled: index < 0 || index >= siblings.length - 1 }),
        Object.assign(element('button', { type: 'button', className: 'ku-ib', 'aria-label': 'Закрыть', title: 'Закрыть' }, [icon('close')]), { onclick: close }),
      ]),
    ]);

    // ---- The records of a persona: a list under the sections; the selected one is edited on the right
    const recordIndex = Math.min(Math.max(Number(s.selRecord) || 0, 0), Math.max(draft.records.length - 1, 0));
    const addRecord = () => {
      draft.records.push({ id: '', text: '', about: '', knows: '', au: [], secret: false, off: false });
      s.selSection = RECORDS;
      s.selRecord = draft.records.length - 1;
      render();
    };
    const removeRecord = index => {
      draft.records.splice(index, 1);
      s.selRecord = Math.max(0, Math.min(index, draft.records.length - 1));
      render();
    };

    // ---- The list of sections (left)
    const filled = draft.sections.filter(section => section.text.trim()).length;
    const nav = element('nav', { className: 'ku-cnavbox', 'aria-label': 'Разделы карточки' }, [
      element('p', { className: 'ku-hint ku-cnavhead', text: `Разделы · ${filled} из ${draft.sections.length}` }),
      ...(s.showSizes ? (() => {
        const sizes = draft.sections.map(section => ({ title: section.title || CARD_SECTION_KINDS[section.kind], length: section.text.trim().length })).filter(item => item.length);
        const total = sizes.reduce((sum, item) => sum + item.length, 0);
        const heaviest = sizes.slice().sort((left, right) => right.length - left.length)[0];
        return [element('p', { className: 'ku-hint ku-cnavhead', text: total ? `Всего ${total.toLocaleString('ru-RU')} зн., ≈${Math.ceil(total / 3.5).toLocaleString('ru-RU')} ток. Тяжелее всех: «${heaviest.title}» — ${Math.round(heaviest.length / total * 100)}%. Целиком в запрос карточка уходит редко: смотрите на основные разделы (Basic, Характер, Голос) и на то, что идёт по правилам.` : 'Разделы пустые.' })];
      })() : []),
      ...draft.sections.map(section => {
        const length = section.text.trim().length;
        const total = s.showSizes ? draft.sections.reduce((sum, item) => sum + item.text.trim().length, 0) : 0;
        const share = total ? Math.round(length / total * 100) : 0;
        const row = element('button', { type: 'button', className: `ku-cnav${section.id === s.selSection ? ' on' : ''}${section.off ? ' off' : ''}`, title: section.off ? 'Раздел выключен: рассказчик его не получает' : null, 'aria-current': section.id === s.selSection ? 'true' : null,
          ...(s.showSizes && length ? { style: { backgroundImage: `linear-gradient(to right, color-mix(in srgb, var(--k-accent) 28%, transparent) ${share}%, transparent ${share}%)` } } : {}) }, [
          element('span', { className: `ku-cdot${length ? '' : ' empty'}`, 'aria-hidden': 'true' }),
          element('span', { className: 'ku-cnav-title', text: section.title || CARD_SECTION_KINDS[section.kind] }),
          element('span', { className: 'ku-hint', text: section.off ? 'выкл' : length ? (s.showSizes ? `${length} · ${share}%` : String(length)) : 'пусто' }),
        ]);
        row.addEventListener('click', () => { s.selSection = section.id; render(); });
        return row;
      }),
      ...(entry.persona ? [
        element('div', { className: 'ku-cnavsep', role: 'separator' }),
        element('div', { className: 'ku-cnavgroup' }, [
          element('span', { className: 'ku-cnavgroup-title', text: 'Записи о персоне' }),
          element('span', { className: 'ku-hint', text: draft.records.length ? String(draft.records.length) : '' }),
          element('span', { className: 'ku-push' }),
          Object.assign(element('button', { type: 'button', className: 'ku-ib ku-cnav-add', 'aria-label': 'Добавить запись', title: 'Добавить запись о персоне' }, [icon('plus')]), { onclick: addRecord }),
        ]),
        ...draft.records.map((record, position) => {
          const first = String(record.text ?? '').trim().split('\n')[0];
          const here = s.selSection === RECORDS && recordIndex === position;
          const row = element('button', { type: 'button', className: `ku-cnav ku-crec${here ? ' on' : ''}${record.off ? ' off' : ''}`, 'aria-current': here ? 'true' : null,
            title: record.off ? 'Запись выключена' : record.secret ? 'Секретная запись' : '' }, [
            element('span', { className: `ku-cnav-title ku-crec-title${first ? '' : ' empty'}`, text: first ? (first.length > 160 ? `${first.slice(0, 159)}…` : first) : 'Пустая запись' }),
            ...(record.secret ? [icon('lock')] : []),
          ]);
          row.addEventListener('click', () => { s.selSection = RECORDS; s.selRecord = position; render(); });
          // a cross at the row: a record goes without scrolling down to its own page (it stays there too)
          const drop = element('button', { type: 'button', className: 'ku-crec-x', 'aria-label': 'Удалить запись', title: 'Удалить запись' }, [icon('close')]);
          drop.addEventListener('click', event => { event.stopPropagation(); removeRecord(position); });
          return element('div', { className: 'ku-crecwrap' }, [row, drop]);
        }),
      ] : []),
      element('span', { className: 'ku-push' }),
      Object.assign(button(s.gen?.running ? '✨ Пишется…' : 'Написать разделы', 'btn small', () => { s.selSection = GENERATE; render(); }, 'Модель напишет выбранные разделы по-русски по вашим пожеланиям: для героя из фандома и для оригинального'), { className: `btn small${s.selSection === GENERATE ? ' primary' : ''}` }),
      button('+ Свой раздел', 'btn small', () => {
        const created = makeSection({ kind: 'other', title: 'Новый раздел', text: '' });
        draft.sections.push(created);
        s.selSection = created.id;
        render();
      }, 'Раздел с любым названием; отправляется по ключевым словам'),
      button('Копия карточки', 'btn small', () => attempt(async () => {
        const copy = await invoke('onLibraryDuplicateCharacter', { cardId: entry.id });
        if (copy?.id) { s.openId = copy.id; forget(); }
      }, 'Копия создана')),
    ]);

    // ---- One section (right)
    const position = draft.sections.findIndex(section => section.id === s.selSection);
    const pane = s.selSection === RECORDS
      ? renderPersonaRecords({ records: draft.records, au: snapshot().personaCards?.au ?? [], cards: (library().characters ?? []).filter(card => !card.persona).map(card => ({ id: card.id, name: card.name })).sort((left, right) => left.name.localeCompare(right.name, 'ru-RU')), redraw: render, selected: recordIndex, add: addRecord, remove: removeRecord })
      : s.selSection === GENERATE ? (() => {
        const gen = genState(entry, draft);
        return renderGeneratePane({ ...genDeps(entry, draft, gen), hasPicture: hasPictureOf(entry), modelField });
      })()
      : s.selSection === NAMES
      ? renderNameWords({ name: draft.name, aliases: draft.aliases.split(','), words: draft.words, redraw: render, setStatus, fill: payload => invoke('onCardNamesFill', payload) })
      : s.selSection === CLOSET ? renderClosetPane(entry, draft.closet) : position < 0
      ? element('div', { className: 'ku-cpane' }, [element('p', { className: 'ku-hint', text: 'В карточке нет разделов. Добавьте свой слева внизу.' })])
      : renderSectionPane(draft.sections[position], position, status, entry);

    // ---- The footer
    const persist = async () => {
      await invoke('onLibraryUpdateCharacter', { cardId: entry.id, changes: {
        name: draft.name, folderId: draft.folderId, aliases: draft.aliases.split(','), gender: draft.gender, sections: draft.sections, words: draft.words, closet: draft.closet, ...(entry.persona ? { records: recordsFromDraft(draft.records) } : {}),
      } });
      forget();
    };
    const linked = linkedSet().has(entry.id);
    const owner = Object.entries(snapshot().cardByEntity ?? {}).find(([, card]) => card.id === entry.id)?.[0];
    const ownerName = owner ? characterName((snapshot().characters ?? []).find(character => characterId(character) === owner), '') : '';
    /** A small square button of the footer, as tall as the switch beside it: opens a page of the card (or flips a view). */
    const footTool = (iconName, label, on, onClick, pressed = false) => {
      const node = element('button', { type: 'button', className: `ku-cfoot-tool${on ? ' on' : ''}`, 'aria-label': label, title: label }, [icon(iconName)]);
      if (pressed) node.setAttribute('aria-pressed', String(on)); else if (on) node.setAttribute('aria-current', 'true');
      node.addEventListener('click', onClick);
      return node;
    };
    /** The AU of the chat: a button with a caption, and the little window over it that switches them (the same list as the cards' sections and records use). */
    const auList = () => snapshot().personaCards?.au ?? [];
    const auOn = () => new Set(snapshot().personaAu ?? []);
    const auButton = () => {
      const count = auList().filter(item => auOn().has(item.id)).length;
      const node = element('button', { type: 'button', className: `ku-cfoot-tool ku-cfoot-au${s.auOpen ? ' on' : ''}`, 'aria-expanded': String(Boolean(s.auOpen)),
        title: count ? `АУ этого чата: включено ${count}. Тексты карточек с меткой АУ уходят рассказчику, только когда нужное АУ включено.` : 'АУ этого чата: сейчас не выбрано ни одного. Тексты карточек с меткой АУ в чат не уходят.' }, [
        element('span', { className: 'ku-au-text', text: 'АУ' }),
        ...(count ? [element('span', { className: 'ku-au-badge', text: String(count) })] : (auList().length ? [element('span', { className: 'ku-au-badge warn', text: '!' })] : [])),
      ]);
      node.addEventListener('click', () => { s.auOpen = !s.auOpen; render(); });
      return node;
    };
    const auWindow = () => {
      const on = auOn();
      const box = element('div', { className: 'ku-aupop', role: 'dialog', 'aria-label': 'АУ этого чата' }, [
        element('div', { className: 'ku-row' }, [
          element('strong', { text: 'АУ этого чата' }),
          element('span', { className: 'ku-push' }),
          Object.assign(element('button', { type: 'button', className: 'ku-ib', 'aria-label': 'Закрыть', title: 'Закрыть' }, [icon('close')]), { onclick: () => { s.auOpen = false; render(); } }),
        ]),
        element('p', { className: 'ku-hint', text: 'Включённые АУ играет этот чат: разделы и записи карточек с этой меткой уходят рассказчику. Без метки уходит всегда. Можно включить несколько сразу.' }),
      ]);
      if (!auList().length) box.append(element('p', { className: 'ku-hint', text: 'АУ пока нет. Добавьте первое, например «Универ» или «Мафия».' }));
      for (const item of auList()) {
        const check = element('input', { type: 'checkbox', className: 'set-switch', checked: on.has(item.id), 'aria-label': `АУ «${item.name}» включено в этом чате` });
        check.addEventListener('change', () => attempt(() => act('onPersonaAuToggle', { id: item.id, on: check.checked }, 'persona-au-toggle'), check.checked ? `АУ «${item.name}» включено` : `АУ «${item.name}» выключено`));
        box.append(element('div', { className: 'ku-fact' }, [
          element('label', { className: 'ku-fact-text' }, [check, ` ${item.name}`]),
          button('×', 'btn icon small', () => attempt(() => act('onPersonaAuRemove', { id: item.id }, 'persona-au-remove'), 'АУ удалено'), `Удалить АУ «${item.name}» (метка пропадёт и с карточек)`),
        ]));
      }
      const name = element('input', { type: 'text', placeholder: 'Название нового АУ', 'aria-label': 'Название нового АУ' });
      box.append(element('div', { className: 'ku-row' }, [name, button('Добавить', 'btn small', () => attempt(async () => { await act('onPersonaAuAdd', { name: name.value }, 'persona-au-add'); name.value = ''; }, 'АУ добавлено'))]));
      return box;
    };

    /** The foot of a persona's card: whether she is the one you wear (nothing to switch: the worn persona is the persona of the chat), and whether her card goes to the model. */
    const personaFoot = card => {
      if (!personaMode) return [];
      const snap = snapshot();
      const mine = snap.personaCardId === card.id;
      const sending = snap.personaCards?.enabled !== false;
      const other = snap.chatPersonaName || snap.personaBoundName;
      return [
        // в таверне (embed) состояние «надета» уже написано вверху окна, второй раз внизу не нужно
        ...(embed ? [] : [element('span', { className: `ku-chip ku-pstate${mine ? ' told' : ''}`,
          title: mine ? 'Эта персона надета в таверне: её карточка и есть карточка твоей персоны в этом чате.' : `Сейчас в этом чате ты${other ? ` — ${other}` : ' другая персона'}. Чтобы эта карточка заработала, нажми «Надеть» вверху окна.`,
          text: mine ? 'Это ты в этом чате' : 'Не надета сейчас' })]),
        element('label', { className: 'ku-inline ku-wear', title: 'Отправлять ли карточку персоны рассказчику (общий выключатель для всех персон)' }, [
          toggle(sending, 'Отправлять карточку персоны модели', on => attempt(() => act('onPersonaCardsEnabled', { enabled: on }, 'persona-card-enabled'), on ? 'Карточка персоны отправляется' : 'Карточка персоны не отправляется')),
          element('strong', { className: 'ku-small', text: sending ? 'Отправляется модели' : 'Не отправляется модели' }),
        ]),
      ];
    };

    const foot = element('footer', { className: 'ku-cfoot' }, [
      ...(personaMode ? [] : [      element('label', { className: 'ku-inline ku-wear' }, [
        toggle(linked, `${entry.name} в этом чате`, on => attempt(() => act('onLibraryLink', { libraryIds: [entry.id], on, kind }, 'library-link'), on ? 'Карточка включена' : 'Карточка выключена')),
        element('span', {}, [
          element('strong', { className: 'ku-small', text: linked ? 'Включена в этом чате' : 'Выключена в этом чате' }),
          element('span', { className: 'muted ku-small', text: linked
            ? ` — рассказчик читает её про ${ownerName || 'этого персонажа'}, когда он в сцене`
            : ' — включите: персонаж с таким именем подключится к карточке, а если его в чате нет, он появится' }),
        ]),
      ])]),
      ...personaFoot(entry),
      element('span', { className: 'ku-cfoot-tools', role: 'group', 'aria-label': 'Разделы карточки' }, [
        footTool('letter', 'Имена и склонения: как героя зовут в постах и в каких падежах', s.selSection === NAMES, () => { s.selSection = NAMES; render(); }),
        footTool('shirt', 'Шкаф: комплекты и вещи героя', s.selSection === CLOSET, () => { s.selSection = CLOSET; s.closetFirst = null; render(); }),
        footTool('bars', 'Размеры: сколько знаков занимает каждый раздел', Boolean(s.showSizes), () => { s.showSizes = !s.showSizes; render(); }, true),
        auButton(),
      ]),
      ...(linked || personaMode ? [] : [attachChoice(entry)]),
      element('span', { className: 'ku-push' }),
      footTool('eraser', 'Очистить разделы: выбрать все или некоторые и стереть их тексты', Boolean(s.clearing), () => { s.clearing = s.clearing ? null : { picked: new Set(), confirm: false }; render(); }),
      Object.assign(element('button', { type: 'button', className: 'ku-cfoot-del', 'aria-label': 'Удалить карточку', title: 'Удалить карточку' }, [icon('trash')]), {
        onclick: () => attempt(async () => {
          const removed = await invoke('onLibraryRemoveCharacter', { cardId: entry.id });
          if (removed) { s.openId = ''; forget(); }
        }),
      }),
      button('Сохранить', 'btn primary', () => attempt(async () => { await persist(); s.openId = ''; }, 'Карточка сохранена')),
    ]);

    // ---- Language and the note the card came from
    const note = entry.source;
    const english = cardIsEnglish(entry);
    const strip = element('div', { className: `ku-cstrip${note?.stale ? ' stale' : ''}` }, [
      element('span', { className: `ku-chip${english ? ' told' : ''}`, text: english ? 'Текст на английском' : 'Текст на русском' }),
      ...(english ? [] : [Object.assign(button(s.translating?.id === entry.id ? 'Перевожу…' : 'Перевести на английский', 'btn small', () => attempt(async () => {
        if (s.translating) return;
        setStatus('Перевожу карточку по разделам, это может занять несколько минут…');
        await persist();
        const job = s.translating = { id: entry.id, text: 'Начинаю перевод…' };
        s.translateError = null;
        render();
        try {
          await invoke('onLibraryTranslateCard', { cardId: entry.id, onProgress: (done, total, title) => { job.text = `Перевожу «${title}» (${done + 1} из ${total})…`; render(); } });
        } catch (error) {
          // a failed translation stays on the card until the next try: a line in the header is easy to miss
          s.translateError = { id: entry.id, text: error?.message || String(error) };
          throw error;
        } finally { s.translating = null; render(); }
        forget();
      }, 'Карточка переведена на английский'), 'Каждый раздел переводится моделью один к одному, без добавлений и пропусков'), { disabled: Boolean(s.translating) })]),
      element('span', { className: 'ku-hint ku-cstrip-note', text: english
        ? (note ? 'Русский оригинал остался в Obsidian. Чтобы перевести заново, загрузите русский текст кнопкой справа.' : 'Это рабочий текст карточки: рассказчик получает его как есть.')
        : (note ? 'Рассказчик читает английский лучше: переведите — русский оригинал останется в Obsidian.' : 'Русский текст в карточке заменится английским, оригинала нигде не останется: сделайте «Копию карточки», если он нужен.') }),
      element('span', { className: 'ku-push' }),
      ...(note ? [
        element('span', { className: note.stale ? 'ku-chip ku-stale' : 'ku-hint', title: note.path, text: note.stale ? 'Анкета в Obsidian изменилась' : `Анкета: ${note.path}` }),
        button(note.stale ? 'Обновить из Obsidian' : 'Загрузить заново', note.stale ? 'btn primary small' : 'btn small', () => refreshFromNotes([entry.id], forget),
          'Русский текст из заметки заменит разделы карточки; свои правила «когда» и ключи сохранятся. После обновления карточку нужно перевести заново.'),
      ] : []),
    ]);

    // Every tick redraws the window: the lists keep where they were scrolled to (per card and section), so nothing jumps to the top.
    const scrollKey = `${entry.id}:${s.selSection}`;
    const remember = (node, name) => node.addEventListener('scroll', () => { s.scroll = { ...(s.scroll?.key === scrollKey ? s.scroll : { key: scrollKey }), [name]: node.scrollTop }; });
    remember(pane, 'pane');
    remember(nav, 'nav');
    const restore = () => { if (s.scroll?.key !== scrollKey) return; if (s.scroll.pane) pane.scrollTop = s.scroll.pane; if (s.scroll.nav) nav.scrollTop = s.scroll.nav; };
    const wearLabel = foot.querySelector('.ku-wear');
    if (wearLabel) wearLabel.title = wearLabel.textContent.replace(/\s+/g, ' ').trim();
    const stripNote = strip.querySelector('.ku-cstrip-note');
    if (stripNote && strip.firstElementChild) strip.firstElementChild.title = stripNote.textContent;
    dialog.append(top, strip, element('div', { className: 'ku-cbodybox' }, [nav, pane]), ...(clearPanel ? [clearPanel] : []), foot);
    if (s.auOpen) foot.append(auWindow());
    queueMicrotask(restore);
    setTimeout(restore, 0);
    layer.append(dialog);
    if (s.refZoom && entry.refImage) {
      const zoom = element('div', { className: 'ku-refzoom', role: 'dialog', 'aria-label': `Референс: ${entry.name}` }, [element('img', { src: imageUrl(entry.refImage), alt: `Референс: ${entry.name}` })]);
      zoom.addEventListener('click', () => { s.refZoom = false; render(); });
      layer.append(zoom);
    }
    if (lookState(entry).open) layer.append(renderLook(entry, draft));
    if (s.focusedId !== entry.id) {
      s.focusedId = entry.id;
      setTimeout(() => { if (dialog.isConnected && !dialog.contains(ctx.shadow?.activeElement)) { nameInput.focus({ preventScroll: true }); if (/^Новый персонаж( \d+)?$/.test(nameInput.value)) nameInput.select(); } }, 0);
    }
    return layer;
  }

  /** «Чем описывать»: the model for the pictures of cards and personas. Empty = the one of the wardrobe pictures. */
  function modelField(st) {
    const snap = snapshot();
    const choices = snap.visionChoices ?? {};
    const profiles = choices.profiles ?? [];
    const now = snap.personaLookModel ?? '';
    const options = [
      { value: '', text: 'Как для картинок гардероба (Настройки → Модели и API → Картинки)' },
      ...profiles.map(profile => ({ value: `profile:${profile.id}`, text: `Профиль: ${profile.name}` })),
      { value: 'main', text: 'Как у таверны (модель текущего чата)' },
    ];
    if (now.startsWith('profile:') && !options.some(option => option.value === now)) options.push({ value: now, text: 'Профиль: (его уже нет)' });
    const select = element('select', { 'aria-label': 'Чем описывать', disabled: st.busy }, options.map(option => element('option', { value: option.value, text: option.text, selected: option.value === now })));
    select.addEventListener('change', () => attempt(() => act('onPersonaLookModel', { value: select.value }, 'persona-look-model')));
    return element('div', { className: 'ku-fld' }, [
      element('label', { className: 'ku-clabel', text: 'Чем описывать' }), select,
      element('p', { className: 'ku-hint', text: `Нужна модель, которая видит картинки. Профили берутся из «Connection Manager» таверны. Для описания ей даётся до 12 000 токенов, чтобы хватило и на размышления.${profiles.length ? '' : ' Профилей подключения нет: будет модель, выбранная для картинок гардероба.'}` }),
    ]);
  }

  const lookState = entry => ((s.looks ??= {})[entry.id] ??= { open: false, wishes: '', voice: false, voiceWishes: '', looks: '', voiceText: '', custom: '', busy: false, note: '', failed: false });

  /**
   * «Внешность по картинке» for a persona card (the same window as in the Pudrenitsa persona page): the picture, the wishes, the voice if
   * asked; the model writes the permanent looks in Russian, the text can be edited and is put into the sections «Внешность» / «Голос» of
   * the card (the draft: the card itself changes with «Сохранить»).
   */
  function renderLook(entry, draft) {
    const st = lookState(entry);
    const layer = element('div', { className: 'ku-wlayer ku-plook-layer' });
    const close = () => { if (st.busy) return; st.open = false; render(); };
    layer.addEventListener('click', event => { if (event.target === layer) close(); });
    const win = element('section', { className: 'ku-wcard ku-plook', role: 'dialog', 'aria-modal': 'true', 'aria-label': 'Внешность по картинке' });
    win.addEventListener('keydown', event => { if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); close(); } });
    const src = st.custom || (entry.image ? imageUrl(entry.image) : entry.avatar ? `/User Avatars/${encodeURIComponent(entry.avatar)}` : '');
    const where = st.custom ? 'выбрана другая картинка, только для этого описания' : entry.image ? 'картинка карточки' : entry.avatar ? 'по умолчанию аватар персоны' : 'у карточки нет картинки: выберите её ниже';
    const field = (label, key, rows, placeholder) => {
      const area = element('textarea', { rows, value: st[key], placeholder, 'aria-label': label, disabled: st.busy });
      area.addEventListener('input', () => { st[key] = area.value; });
      return element('div', { className: 'ku-fld' }, [element('label', { className: 'ku-clabel', text: label }), area]);
    };
    const voice = element('input', { type: 'checkbox', className: 'ku-switch', checked: st.voice, disabled: st.busy, 'aria-label': 'Добавить голос' });
    voice.addEventListener('change', () => { st.voice = voice.checked; render(); });
    const describe = async () => {
      st.busy = true; st.failed = false; st.note = 'Смотрю на картинку… Если модель думает, это может занять несколько минут.'; render();
      try {
        const done = await invoke('onCardDescribe', { cardId: entry.id, picture: st.custom, wishes: st.wishes, voice: st.voice, voiceWishes: st.voiceWishes });
        st.looks = done.looks; st.voiceText = done.voice || '';
        st.note = 'Готово. Поправьте текст и впишите его в карточку.';
      } catch (error) { st.failed = true; st.note = error?.message || String(error); } finally { st.busy = false; render(); }
    };
    const put = (kindName, text, label) => {
      const section = draft.sections.find(item => item.kind === kindName);
      if (!section) { st.failed = true; st.note = `В карточке нет раздела «${label}».`; render(); return; }
      section.text = text.trim(); s.selSection = section.id; st.failed = false;
      st.note = `Вписано в «${label}». Карточка изменится, когда вы нажмёте «Сохранить».`; render();
    };
    const filled = kindName => Boolean(draft.sections.find(item => item.kind === kindName)?.text.trim());
    const lookText = element('textarea', { rows: 7, value: st.looks, placeholder: 'Здесь появится описание', 'aria-label': 'Внешность по-русски', disabled: st.busy });
    lookText.addEventListener('input', () => { st.looks = lookText.value; });
    const voiceText = element('textarea', { rows: 4, value: st.voiceText, placeholder: 'Здесь появится описание голоса', 'aria-label': 'Голос по-русски', disabled: st.busy });
    voiceText.addEventListener('input', () => { st.voiceText = voiceText.value; });
    win.append(
      element('div', { className: 'ku-row' }, [element('h3', { className: 'ku-ltitle', text: 'Внешность по картинке' }), element('span', { className: 'ku-push' }), Object.assign(element('button', { type: 'button', className: 'ku-ib', 'aria-label': 'Закрыть', title: 'Закрыть' }, [icon('close')]), { onclick: close })]),
      element('strong', { text: entry.name }),
      element('div', { className: 'ku-plook-pic' }, [
        src ? element('img', { src, alt: entry.name }) : element('span', { className: 'ku-cport ku-cnoport', 'aria-hidden': 'true', text: entry.name.slice(0, 1).toUpperCase() }),
        element('div', { className: 'ku-plook-picinfo' }, [
          element('b', { text: 'Картинка' }), element('span', { className: 'ku-hint', text: where }),
          element('div', { className: 'ku-row' }, [
            filePicker('Другая картинка…', { multiple: false, className: 'btn small', onFiles: async files => { try { st.custom = await fileToDataUrl(files[0]); } catch (error) { setStatus(error?.message || 'Картинка не открылась', true); } render(); } }),
            ...(st.custom ? [button('Вернуть картинку карточки', 'btn small', () => { st.custom = ''; render(); })] : []),
          ]),
        ]),
      ]),
      modelField(st),
      field('Пожелания к внешности', 'wishes', 3, 'рост 156, веснушки, клыки; подчеркни глаза'),
      element('label', { className: 'ku-inline ku-plook-opt' }, [voice, element('span', {}, [element('strong', { text: 'Добавить голос' }), element('span', { className: 'ku-hint', text: 'только звучание (тембр, высота, темп) и как оно может действовать на окружающих; без словечек, фраз и придуманных привычек' })])]),
      ...(st.voice ? [field('Пожелания к голосу', 'voiceWishes', 2, 'низкий, с хрипотцой; когда злится, становится тише')] : []),
      element('div', { className: 'ku-row' }, [Object.assign(button(st.busy ? 'Описываю…' : 'Описать', 'btn primary small', describe), { disabled: st.busy || !src }), ...(st.note ? [element('span', { className: `ku-small${st.failed ? ' ku-danger' : ' muted'}`, text: st.note })] : [])]),
      element('div', { className: 'ku-fld' }, [element('label', { className: 'ku-clabel', text: 'Внешность по-русски (можно править)' }), lookText]),
      element('div', { className: 'ku-row' }, [
        Object.assign(button('Вписать в «Внешность»', 'btn primary small', () => put('visual', st.looks, 'Внешность'), filled('visual') ? 'В разделе уже есть текст: он будет заменён' : ''), { disabled: st.busy || !st.looks.trim() }),
        ...(filled('visual') && st.looks.trim() ? [element('span', { className: 'ku-hint', text: 'В разделе уже есть текст, он заменится.' })] : []),
      ]),
      ...(st.voice ? [
        element('div', { className: 'ku-fld' }, [element('label', { className: 'ku-clabel', text: 'Голос по-русски (можно править)' }), voiceText]),
        element('div', { className: 'ku-row' }, [
          Object.assign(button('Вписать в «Голос»', 'btn primary small', () => put('voice', st.voiceText, 'Голос')), { disabled: st.busy || !st.voiceText.trim() }),
          ...(filled('voice') && st.voiceText.trim() ? [element('span', { className: 'ku-hint', text: 'В разделе уже есть текст, он заменится.' })] : []),
        ]),
      ] : []),
      element('p', { className: 'ku-hint', text: 'Перевод на английский делается у всей карточки сразу: кнопка «Перевести на английский» вверху окна карточки.' }),
    );
    layer.append(win);
    return layer;
  }

  /**
   * The closet of a card: the things (wardrobe cards) and sets (saved looks) that belong to this character. The chronicler picks a change of
   * clothes from them; here they can also be put on by hand. `closet` is the draft's { cardIds, lookIds }.
   */
  function renderClosetPane(entry, closet) {
    const wardrobe = snapshot().wardrobe ?? { cards: [], looks: [] };
    const owner = Object.entries(snapshot().cardByEntity ?? {}).find(([, card]) => card.id === entry.id)?.[0] ?? '';
    const tie = (list, id, on) => { const at = list.indexOf(id); if (on && at < 0) list.push(id); if (!on && at >= 0) list.splice(at, 1); };
    // A piece that is personal to ANOTHER character is not offered here (and neither is a set that holds one).
    const taken = personalPieces(library());
    const another = id => taken.has(id) && taken.get(id) !== entry.id;
    const wear = (cardIds, mode, done) => attempt(() => act('onWear', { entityId: owner, cardIds, mode }, 'wardrobe-wear'), done);
    const needChat = owner ? '' : 'Включите карточку в этом чате (переключатель внизу): тогда героя можно одеть';
    const order = new Map(WARDROBE_CATEGORIES.map(([id], index) => [id, index]));
    const categoryName = id => WARDROBE_CATEGORIES.find(([key]) => key === id)?.[1] ?? '';

    // Sets
    const looks = (wardrobe.looks ?? []).filter(look => !look.cardIds.some(another));
    // Tied ones go first, by what was tied when the closet was opened: ticking something must not move it under the cursor.
    if (!s.closetFirst || s.closetFirstFor !== entry.id) { s.closetFirst = new Set([...closet.cardIds, ...closet.lookIds]); s.closetFirstFor = entry.id; }
    const first = id => Number(s.closetFirst.has(id));
    const sortedLooks = [...looks].sort((left, right) => first(right.id) - first(left.id));
    const lookRows = sortedLooks.map(look => {
      const on = closet.lookIds.includes(look.id);
      const box = element('input', { type: 'checkbox', checked: on, 'aria-label': `Комплект «${look.name}» у героя` });
      box.addEventListener('change', () => { tie(closet.lookIds, look.id, box.checked); render(); });
      return element('div', { className: `ku-closet-row${on ? ' on' : ''}` }, [
        box,
        element('span', { className: 'ku-closet-name' }, [element('strong', { text: look.name }), element('span', { className: 'muted ku-small', text: ` · вещей: ${look.cardIds.length}` })]),
        ...(on ? [Object.assign(button('Надеть', 'btn small', () => wear(look.cardIds, 'replace', `Надет комплект «${look.name}»`), needChat || 'Надеть весь комплект вместо того, что надето'), { disabled: !owner })] : []),
      ]);
    });

    // Things: tied ones first, a search and a section to narrow the rest down.
    const query = (s.closetQuery ?? '').trim().toLocaleLowerCase('ru-RU');
    const category = s.closetCategory ?? '';
    // Both shelves of the wardrobe (the persona's things too), whatever the gender: the narrowing is done by the lists next to the search.
    const everything = wardrobe.cards ?? [];
    const shelfPick = s.closetShelf ?? '';
    const genderPick = s.closetGender ?? '';
    const hidden = everything.filter(card => another(card.id)).length;
    const all = everything.filter(card => !another(card.id));
    const found = all.filter(card => (!category || card.category === category)
      && (!shelfPick || card.shelf === shelfPick) && (!genderPick || card.gender === genderPick)
      && (!query || `${cardLabel(card)} ${card.description ?? ''}`.toLocaleLowerCase('ru-RU').includes(query)));
    found.sort((left, right) => first(right.id) - first(left.id)
      || (order.get(left.category) ?? 99) - (order.get(right.category) ?? 99));
    const LIMIT = 120;
    const search = element('input', { type: 'search', value: s.closetQuery ?? '', placeholder: 'Найти вещь', 'aria-label': 'Поиск вещи в гардеробе', className: 'ku-search' });
    search.addEventListener('change', () => { s.closetQuery = search.value; render(); });
    const section = element('select', { 'aria-label': 'Раздел гардероба' }, [
      element('option', { value: '', text: 'Все разделы' }),
      ...WARDROBE_CATEGORIES.map(([id, label]) => element('option', { value: id, text: label, selected: id === category })),
    ]);
    section.addEventListener('change', () => { s.closetCategory = section.value; render(); });
    const shelfSelect = element('select', { 'aria-label': 'Полка гардероба' }, [element('option', { value: '', text: 'Все полки' }), ...Object.entries(WARDROBE_SHELVES).map(([id, label]) => element('option', { value: id, text: `Полка: ${label}`, selected: id === shelfPick }))]);
    shelfSelect.addEventListener('change', () => { s.closetShelf = shelfSelect.value; render(); });
    const genderSelect = element('select', { 'aria-label': 'Пол вещей' }, [element('option', { value: '', text: 'Любой пол' }), ...Object.entries(WARDROBE_GENDERS).map(([id, label]) => element('option', { value: id, text: label, selected: id === genderPick }))]);
    genderSelect.addEventListener('change', () => { s.closetGender = genderSelect.value; render(); });
    const tiles = element('div', { className: 'ku-closet-grid' }, found.slice(0, LIMIT).map(card => {
      const on = closet.cardIds.includes(card.id);
      const tile = element('button', { type: 'button', className: `ku-closet-tile${on ? ' on' : ''}`, 'aria-pressed': String(on), 'aria-label': `${cardLabel(card)} — ${on ? 'убрать из шкафа' : 'в шкаф'}`, title: categoryName(card.category) }, [
        card.image ? element('img', { src: imageUrl(card.image), alt: '', loading: 'lazy', draggable: false }) : element('span', { className: 'ku-closet-noimg', text: cardLabel(card).slice(0, 1) }),
        element('span', { className: 'ku-closet-cap', text: cardLabel(card) }),
      ]);
      tile.addEventListener('click', () => { tie(closet.cardIds, card.id, !on); if (on) tie(closet.ownIds, card.id, false); render(); });
      if (on && closet.ownIds.includes(card.id)) tile.append(element('span', { className: 'ku-closet-own', text: 'личная' }));
      return tile;
    }));
    const tiedCards = all.filter(card => closet.cardIds.includes(card.id));
    // The things in the closet, each with a tick «only this character»: nobody else may have it.
    const own = tiedCards.map(card => {
      const box = element('input', { type: 'checkbox', checked: closet.ownIds.includes(card.id), 'aria-label': `${cardLabel(card)}: только у этого героя` });
      box.addEventListener('change', () => { tie(closet.ownIds, card.id, box.checked); render(); });
      return element('label', { className: 'ku-closet-row' }, [box, element('span', { className: 'ku-closet-name' }, [element('strong', { text: cardLabel(card) }), element('span', { className: 'muted ku-small', text: ` · ${categoryName(card.category)}` })])]);
    });
    const wearAll = Object.assign(button(`Надеть отмеченные вещи (${tiedCards.length})`, 'btn small', () => wear(tiedCards.map(card => card.id), 'add', 'Вещи надеты'), needChat || 'Надеть все вещи шкафа поверх того, что надето'), { disabled: !owner || !tiedCards.length });

    return element('div', { className: 'ku-cpane' }, [
      element('div', { className: 'ku-ctitlerow' }, [element('h3', { className: 'ku-ctitle', text: 'Шкаф' }), element('span', { className: 'ku-chip', text: `комплектов ${closet.lookIds.length} · вещей ${closet.cardIds.length}` })]),
      element('p', { className: 'ku-hint', text: 'Что есть у этого героя из «Гардероба». Когда он переодевается в истории, летописец выбирает комплект или вещи отсюда (если подходящего нет, опишет одежду словами). Сами вы тоже можете надеть: кнопки «Надеть». Изменения шкафа сохраняются кнопкой «Сохранить».' }),
      element('div', { className: 'ku-fld' }, [element('label', { className: 'ku-clabel', text: 'Комплекты' }), ...(lookRows.length ? lookRows : [element('p', { className: 'ku-hint', text: 'Комплектов для персонажей пока нет: соберите их в «Гардероб» → образ.' })])]),
      element('div', { className: 'ku-fld' }, [
        element('div', { className: 'ku-closet-sticky' }, [
          element('div', { className: 'ku-row' }, [element('label', { className: 'ku-clabel', text: 'Вещи' }), element('span', { className: 'ku-push' }), wearAll]),
          element('div', { className: 'ku-closet-filters' }, [search, section, shelfSelect, genderSelect]),
        ]),
        ...(own.length ? [element('details', { className: 'ku-cmore' }, [element('summary', { text: `Личные вещи: отметьте, что принадлежит только этому герою (${closet.ownIds.length} из ${own.length})` }), ...own, element('p', { className: 'ku-hint', text: 'Личную вещь не увидят в шкафах других героев, и летописец не наденет её на других. Метка снимается тем же флажком.' })])] : []),
        found.length ? tiles : element('p', { className: 'ku-hint', text: all.length ? 'Ничего не найдено.' : 'В гардеробе пока нет вещей.' }),
        ...(hidden ? [element('p', { className: 'ku-hint', text: `Скрыто вещей, которые личные у других героев: ${hidden}.` })] : []),
        ...(found.length > LIMIT ? [element('p', { className: 'ku-hint', text: `Показано ${LIMIT} из ${found.length}: уточните поиск или раздел.` })] : []),
      ]),
    ]);
  }

  /** The open section: its text, when the narrator gets it, and (folded) its name and kind. */
  function renderSectionPane(section, position, status, entry) {
    const draft = s.draft.fields;
    const own = status?.get(section.id);
    const kindLabel = key => (key === 'other' ? 'Прочее (по ключевым словам)' : CARD_SECTION_KINDS[key]);
    const chip = section.off ? element('span', { className: 'ku-chip', text: 'выключен: не уходит рассказчику' }) : !own ? null : own.action === 'force'
      ? element('span', { className: 'ku-chip told', text: 'сейчас уходит в запрос' })
      : element('span', { className: 'ku-chip', title: own.action === 'trim' ? 'Блок «Карточки» упёрся в лимит объёма' : '', text: own.action === 'trim' ? 'не влезло в лимит объёма' : `сейчас придержан${own.why ? `: ${own.why}` : ''}` });
    const trimmedNote = own?.action === 'trim'
      ? element('p', { className: 'ku-hint', text: `Сейчас этот раздел не уходит рассказчику: все карточки вместе упёрлись в лимит ${snapshot().settings?.cardsPromptCharacters ?? 12000} знаков (в запрос идут те, кто в сцене, и только нужные разделы). Лимит меняется в «Настройки → Знания и сцена → Карточки → Объём карточек, символов» (до 60000). Английский текст короче русского, а целая анкета — около 10 000 знаков.` })
      : null;

    const count = element('p', { className: 'ku-hint' });
    const showCount = () => { count.textContent = `Что рассказчик должен знать об этом: факты, привычки, как говорит. Пустой раздел в запрос не уходит. Сейчас ${section.text.trim().length} зн.`; };
    showCount();
    const text = element('textarea', { rows: 9, value: section.text, id: 'ku-card-text', 'aria-label': `Текст раздела ${section.title}` });
    // grows with its text: one scroll (the pane's), not a scroll inside a scroll
    const fitText = () => { text.style.height = 'auto'; text.style.height = `${Math.max(220, text.scrollHeight + 4)}px`; };
    setTimeout(fitText, 0);
    text.addEventListener('input', () => { section.text = text.value; showCount(); fitText(); hideSplit(); });

    // Select a piece of the text: a plaque «Создать раздел» appears; the piece moves into a new section and goes out of this one.
    const textWrap = element('div', { className: 'ku-textwrap' });
    const splitPlaque = element('div', { className: 'ku-splitplaque', hidden: true, role: 'status' });
    let picked = null;
    function hideSplit() { picked = null; splitPlaque.hidden = true; }
    function showSplit() {
      const start = text.selectionStart;
      const end = text.selectionEnd;
      if (end - start < 1 || !text.value.slice(start, end).trim()) { hideSplit(); return; }
      picked = { start, end };
      splitPlaque.hidden = false;
      splitPlaque.firstElementChild.textContent = `${text.value.slice(start, end).trim().length} зн.`;
      placeSplit(end);
    }
    /** The plaque stands under the end of the selection: the place of that point in the text is measured on a hidden copy of the field. */
    function placeSplit(end) {
      try {
        const look = getComputedStyle(text);
        const mirror = element('div');
        for (const name of ['fontFamily', 'fontSize', 'fontWeight', 'lineHeight', 'letterSpacing', 'textTransform', 'tabSize', 'boxSizing', 'paddingTop', 'paddingRight', 'paddingBottom', 'paddingLeft', 'borderTopWidth', 'borderRightWidth', 'borderBottomWidth', 'borderLeftWidth']) mirror.style[name] = look[name];
        Object.assign(mirror.style, { position: 'absolute', visibility: 'hidden', top: '0', left: '0', width: `${text.offsetWidth}px`, whiteSpace: 'pre-wrap', overflowWrap: 'break-word' });
        const mark = element('span', { text: '​' });
        mirror.append(document.createTextNode(text.value.slice(0, end)), mark);
        textWrap.append(mirror);
        const lineHeight = parseFloat(look.lineHeight) || (parseFloat(look.fontSize) || 14) * 1.4;
        const top = mark.offsetTop - text.scrollTop + lineHeight + 4;
        const left = Math.max(0, Math.min(mark.offsetLeft, text.offsetWidth - splitPlaque.offsetWidth - 8));
        mirror.remove();
        splitPlaque.style.top = `${top}px`;
        splitPlaque.style.left = `${left}px`;
      } catch (error) { splitPlaque.style.top = ''; splitPlaque.style.left = ''; }
    }
    const split = element('button', { type: 'button', className: 'btn small primary', text: 'Создать раздел', title: 'Выделенное перенесётся в новый раздел и исчезнет из этого' });
    split.addEventListener('mousedown', event => event.preventDefault()); // the selection must survive the press
    split.addEventListener('click', () => {
      if (!picked) return;
      const { start, end } = picked;
      const piece = text.value.slice(start, end).trim();
      if (!piece) { hideSplit(); return; }
      const before = text.value.slice(0, start).replace(/[ \t]+$/, '');
      const after = text.value.slice(end).replace(/^[ \t]+/, '');
      // the seam closes without a hole: no more than one empty line where the piece was
      // the LIVE draft of the card, found by the id of the section (not the objects of this drawing)
      const live = s.draft?.id === entry.id ? s.draft.fields : draft;
      const source = live.sections.find(item => item.id === section.id) ?? section;
      source.text = `${before}${after}`.replace(/\n{3,}/g, '\n\n').trim();
      const created = makeSection({ kind: section.kind, title: 'Новый раздел', text: piece, ...(section.when ? { when: section.when } : {}), ...(section.keys?.length ? { keys: [...section.keys] } : {}) });
      live.sections.push(created); // at the end of the list
      s.selSection = created.id;
      setStatus(`Перенесено в новый раздел: ${piece.length} зн. Назовите его в заголовке. Он отправляется так же, как «${section.title || CARD_SECTION_KINDS[section.kind]}». Уже сохранено.`);
      render();
      keepSections(entry, live).catch(error => setStatus(`Перенесено, но не сохранилось: ${error?.message || error}`, true));
    });
    splitPlaque.append(element('span', { className: 'ku-small' }), split);
    textWrap.append(text, splitPlaque);
    for (const type of ['select', 'mouseup', 'keyup']) text.addEventListener(type, () => setTimeout(showSplit, 0));
    text.addEventListener('blur', () => setTimeout(() => { if (!splitPlaque.contains(document.activeElement)) hideSplit(); }, 150));

    // «When»: two plain choices; the second opens the list of own rules.
    const own_when = Boolean(section.when);
    const radio = (value, checked) => {
      const input = element('input', { type: 'radio', name: 'ku-card-when', checked });
      input.addEventListener('change', () => { if (!input.checked) return; if (value === 'default') delete section.when; else section.when = section.when || 'always'; render(); });
      return input;
    };
    const whenSelect = element('select', { 'aria-label': 'Своё правило отправки', disabled: !own_when },
      CARD_WHEN.map(key => element('option', { value: key, text: WHEN_LABELS[key] ?? key, selected: section.when === key })));
    whenSelect.addEventListener('change', () => { section.when = whenSelect.value; render(); });
    const whenBox = element('div', { className: 'ku-copts' }, [
      element('div', { className: 'ku-clabel', text: 'Когда рассказчик получает этот раздел' }),
      element('label', { className: `ku-copt${own_when ? '' : ' on'}` }, [radio('default', !own_when), element('span', {}, [
        element('strong', { text: 'Как у всех разделов этого вида' }),
        element('span', { className: 'ku-hint', text: `Для «${kindLabel(section.kind)}» это правило из «Настройки → Суфлёр лорбуков». Менять его сразу для всех карточек можно там.` }),
      ])]),
      element('label', { className: `ku-copt${own_when ? ' on' : ''}` }, [radio('own', own_when), element('span', {}, [
        element('strong', { text: 'Своё правило для этого раздела' }),
        element('span', { className: 'ku-hint', text: '«Никогда» выключает раздел, не стирая текст; «по ключевым словам» отправляет, только если слово есть в посте.' }),
        whenSelect,
      ])]),
    ]);

    const byKeys = section.when === 'keys' || (!section.when && section.kind === 'other');
    // A field that grows with its text, one key to a line: a regex is long and must be seen whole, not scrolled with the arrow keys.
    const keys = element('textarea', { rows: 2, value: (section.keys ?? []).join('\n'), id: 'ku-card-keys', 'aria-label': 'Ключевые слова раздела', placeholder: 'бабу\nбайк', disabled: !byKeys, className: 'ku-keys' });
    const fitKeys = () => { keys.style.height = 'auto'; keys.style.height = `${Math.min(400, Math.max(48, keys.scrollHeight + 2))}px`; };
    setTimeout(fitKeys, 0);
    const saveKeys = list => { if (list.length) section.keys = list; else delete section.keys; };
    keys.addEventListener('input', () => { saveKeys(splitKeys(keys.value)); fitKeys(); });
    // «Put on a regex»: the words typed become regular expressions of the chosen kind (the form lorebook keys have); «take off» turns them back.
    const regexMode = element('select', { 'aria-label': 'Какой регекс надеть', disabled: !byKeys }, Object.entries(KEY_REGEX_MODES).map(([id, text]) => element('option', { value: id, text, selected: id === (s.regexMode ?? 'endings') })));
    regexMode.addEventListener('change', () => { s.regexMode = regexMode.value; });
    const rewriteKeys = convert => { const list = splitKeys(keys.value).map(convert); saveKeys(list); keys.value = list.join('\n'); fitKeys(); };
    const regexRow = element('div', { className: 'ku-row' }, [
      regexMode,
      Object.assign(button('Надеть регекс', 'btn small', () => rewriteKeys(word => keyToRegex(word, regexMode.value)), 'Каждое слово из поля станет регулярным выражением выбранного вида'), { disabled: !byKeys }),
      Object.assign(button('Снять регекс', 'btn small', () => rewriteKeys(keyFromRegex), 'Вернуть обычные слова там, где регекс надела кнопка'), { disabled: !byKeys }),
    ]);

    // Name and kind, folded away: they rarely need a touch.
    const title = element('input', { type: 'text', value: section.title, 'aria-label': 'Название раздела' });
    title.addEventListener('input', () => { section.title = title.value; });
    title.addEventListener('change', () => render());
    // The same name, right in the heading: a click and type (the list on the left follows when the field is left).
    const titleHead = element('input', { type: 'text', className: 'ku-ctitle ku-ctitle-edit', value: section.title || CARD_SECTION_KINDS[section.kind], 'aria-label': 'Название раздела (можно переименовать)', title: 'Название раздела: нажмите и впишите своё', maxLength: 80 });
    titleHead.addEventListener('input', () => { section.title = titleHead.value; title.value = titleHead.value; });
    titleHead.addEventListener('change', () => { if (!titleHead.value.trim()) { section.title = CARD_SECTION_KINDS[section.kind] ?? 'Раздел'; } render(); });
    const kindSelect = element('select', { 'aria-label': 'Вид раздела' }, Object.keys(CARD_SECTION_KINDS).filter(key => key !== 'private' || section.kind === 'private').map(key => element('option', { value: key, text: kindLabel(key), selected: key === section.kind })));
    kindSelect.addEventListener('change', () => { section.kind = kindSelect.value; render(); });
    const more = element('details', { className: 'ku-cmore' });
    more.open = Boolean(s.moreOpen);
    more.addEventListener('toggle', () => { s.moreOpen = more.open; });
    more.append(
      element('summary', { text: 'Ещё: название и вид раздела' }),
      element('div', { className: 'ku-fld' }, [element('label', { className: 'ku-clabel', text: 'Название раздела' }), title, element('p', { className: 'ku-hint', text: 'Просто подпись на карточке и в запросе. Можно писать как угодно.' })]),
      element('div', { className: 'ku-fld' }, [element('label', { className: 'ku-clabel', text: 'Вид раздела' }), kindSelect, element('p', { className: 'ku-hint', text: 'Нужен только суфлёру: по виду он знает, когда отправлять раздел (Voice — всегда, Skills — только в бою, NSFW — только в близости). Для своих разделов оставьте «Прочее».' })]),
    );

    const tools = element('div', { className: 'ku-ctools' }, [
      Object.assign(button('↑', 'btn small', () => { if (position > 0) { [draft.sections[position - 1], draft.sections[position]] = [draft.sections[position], draft.sections[position - 1]]; render(); } }, 'Раздел выше'), { disabled: position === 0 }),
      Object.assign(button('↓', 'btn small', () => { if (position < draft.sections.length - 1) { [draft.sections[position + 1], draft.sections[position]] = [draft.sections[position], draft.sections[position + 1]]; render(); } }, 'Раздел ниже'), { disabled: position >= draft.sections.length - 1 }),
      Object.assign(button('Убрать раздел', 'btn small danger', () => { draft.sections.splice(position, 1); render(); }, personaMode && ['visual', 'voice', 'private'].includes(section.kind) ? 'Внешность, голос и скрытый характер обязательны у карточки персоны' : 'Убрать раздел'),
        { disabled: personaMode && ['visual', 'voice', 'private'].includes(section.kind) }),
    ]);

    // The AU the section is written for (the list is the persona's: one for all chats); the chat says which are on.
    const auAll = snapshot().personaCards?.au ?? [];
    // One small button with the count instead of a row of chips: the choice opens in a little window of ticks.
    const auCount = (section.au ?? []).length;
    const auHere = section.kind !== 'private' && auAll.length > 0;
    const auButtonHere = auHere ? Object.assign(element('button', { type: 'button', className: `btn small ku-secau${s.secAuOpen ? ' on' : ''}${auCount ? ' set' : ''}`, 'aria-expanded': String(Boolean(s.secAuOpen)),
      title: auCount ? 'Раздел уходит модели только в выбранных АУ' : 'Раздел уходит во всех АУ. Нажмите, чтобы привязать к определённым' }, ['АУ', auCount ? element('span', { className: 'ku-au-badge', text: String(auCount) }) : null]), { onclick: () => { s.secAuOpen = !s.secAuOpen; render(); } }) : null;
    const auRow = auHere && s.secAuOpen ? element('div', { className: 'ku-aupop ku-secaupop', role: 'group', 'aria-label': 'В каких АУ раздел отправляется' }, [
      element('strong', { text: 'В каких АУ раздел отправляется' }),
      element('p', { className: 'ku-hint', text: 'Ни одного: во всех АУ. Раздел для АУ ждёт, пока оно не включено в этом чате (кнопка «АУ» внизу карточки).' }),
      ...auAll.map(item => {
        const on = (section.au ?? []).includes(item.id);
        const box = element('input', { type: 'checkbox', checked: on, 'aria-label': item.name });
        box.addEventListener('change', () => { section.au = box.checked ? [...(section.au ?? []), item.id] : (section.au ?? []).filter(id => id !== item.id); if (!section.au.length) delete section.au; render(); });
        return element('label', { className: 'ku-fact-text' }, [box, ` ${item.name}`]);
      }),
    ]) : (section.kind === 'private' ? element('p', { className: 'ku-hint', text: 'Это раздел для генерации факторов отношений: модель читает его, когда пишет факторы линии с этим героем. Модели в чат он не уходит.' }) : null);

    if (auButtonHere) tools.append(auButtonHere);
    return element('div', { className: 'ku-cpane' }, [
      element('div', { className: 'ku-ctitlerow' }, [titleHead, ...(chip ? [chip] : []),
        ...(section.kind === 'private' ? [] : [element('label', { className: 'ku-inline ku-secoff', title: 'Выключенный раздел остаётся в карточке, но рассказчик его не получает' }, [toggle(!section.off, `Раздел «${section.title || CARD_SECTION_KINDS[section.kind]}» включён`, on => { if (on) delete section.off; else section.off = true; render(); }), element('span', { className: 'ku-small', text: section.off ? 'Выключен' : 'Включён' })])]),
        ...(section.kind === 'voice' ? [button('Заготовка досье голоса', 'btn small', () => { const template = ['Манера речи: темп, громкость, длина фраз, любимые обороты', 'Фирменные фразы: ', 'Ласковые обращения: ', 'Грубости и ругательства: ', 'Как говорит, когда злится: ', 'Как говорит, когда нежничает: ', 'Как говорит, когда смущается: ', 'Привычки в речи (слова-паразиты, междометия, смех): '].join('\n'); section.text = section.text?.trim() ? `${section.text.trim()}\n\n${template}` : template; render(); }, 'Вставляет в текст раздела готовые строки для голоса героя (манера, фирменные фразы, обращения, грубости, речь в гневе, нежности и смущении). Остаётся заполнить.')] : []),
        ...(entry && hasPictureOf(entry) && (section.kind === 'visual' || section.kind === 'voice') ? [element('span', { className: 'ku-push' }), button('Описать по картинке…', 'btn small', () => { lookState(entry).open = true; render(); }, 'Модель опишет по картинке то, что не меняется: лицо, глаза, волосы, рост, сложение (и голос, если отметить)')] : [])]),
      ...(trimmedNote ? [trimmedNote] : []),
      ...(entry ? [renderSectionBar({ ...genDeps(entry, draft, genState(entry, draft)), section, openPage: () => { s.selSection = GENERATE; render(); } })] : []),
      element('div', { className: 'ku-fld' }, [element('label', { className: 'ku-clabel', htmlFor: 'ku-card-text', text: 'Текст раздела' }), textWrap, count]),
      ...(personaMode ? [] : [whenBox]),
      ...(personaMode ? [element('p', { className: 'ku-hint', text: 'Разделы персоны уходят модели всегда: ни правил отправки, ни ключевых слов тут не нужно.' })] : []),
      ...(personaMode ? [] : [element('div', { className: 'ku-fld' }, [element('label', { className: 'ku-clabel', htmlFor: 'ku-card-keys', text: 'Ключевые слова' }), keys, regexRow, element('p', { className: 'ku-hint', text: byKeys ? 'Раздел попадёт в запрос, только если одно из этих слов встретится в вашем последнем посте или в предыдущем ответе. Каждое слово с новой строки (или через запятую). Без слов такой раздел не уйдёт никогда. Обычное слово находится и внутри других слов («байк» найдёт и «байкер»); «Надеть регекс» делает поиск точнее: только слово с окончаниями, только целиком или любое начинающееся так. Свой регекс можно писать вручную: /байк(а|у)?/i.' : 'Поле работает, когда правило раздела — «по ключевым словам». Сейчас у раздела другое правило, слова не нужны: выберите «Своё правило» → «по ключевым словам» выше.' })])]),
      ...(auRow ? [auRow] : []),
      more,
      tools,
    ]);
  }

  // ---- Notes (Obsidian) ----------------------------------------------------------

  /** The notes of the remembered folder; asks the browser (and, with nothing remembered, the user) when `ask` is set. null = not available. */
  const slot = () => (personaMode ? 'personas' : 'cards');
  async function notesFromFolder(ask) {
    if (!canRememberFolder()) return null;
    let handle = await recallFolder(slot());
    if (!handle) {
      if (!ask) return null;
      handle = await pickFolder(slot());
      if (!handle) return null;
      await rememberFolder(handle, slot());
    }
    if (!(await access(handle, ask))) return null;
    return readNotes(handle);
  }

  /** Files of a folder picked with a plain input (browsers without the folder API): [{ path, text }]. */
  async function notesFromPicked(picked) {
    const files = [];
    for (const file of picked) {
      if (!/\.(md|markdown)$/i.test(file.name) || file.size > 1_000_000) continue;
      try { files.push({ path: file.webkitRelativePath || file.name, text: await file.text() }); }
      catch (error) { console.warn('[Kulisy] A note could not be read.', error); }
    }
    return files;
  }

  const NO_FOLDER = 'Папка с анкетами не выбрана или браузер не дал доступ.';
  const afterCheck = result => (result.changed.length ? `В Obsidian изменились анкеты: ${result.changed.length}. Они подсвечены в списке.` : `Изменений нет: сверено ${result.same}${result.missing.length ? `, заметки не найдены: ${result.missing.length}` : ''}.`);

  /** Compare the cards with their notes; `files` are given when the folder was picked just now. */
  async function checkNotes(files) {
    await attempt(async () => {
      const notes = files ?? await notesFromFolder(true);
      if (!notes) throw new Error(NO_FOLDER);
      return invoke('onLibraryCheckNotes', { files: notes, persona: personaMode });
    }, afterCheck);
  }

  /** Load cards again from their notes (all marked changed when ids are not given). */
  async function refreshFromNotes(cardIds, after, files) {
    await attempt(async () => {
      const notes = files ?? await notesFromFolder(true);
      if (!notes) throw new Error(NO_FOLDER);
      const result = await invoke('onLibraryRefreshCards', { files: notes, cardIds, persona: personaMode });
      after?.();
      return result;
    }, result => `Обновлено карточек: ${result?.updated?.length ?? 0}${result?.skipped?.length ? `, заметки не найдены: ${result.skipped.length}` : ''}. Теперь они на русском — переведите.`);
  }

  /** A quiet look at the notes when the page opens, if the browser still lets the remembered folder be read. */
  async function lookAtNotesQuietly() {
    try {
      const handle = await recallFolder(slot());
      if (!handle || !(await access(handle, false))) return;
      const result = await invoke('onLibraryCheckNotes', { files: await readNotes(handle), persona: personaMode });
      if (result?.changed?.length) { setStatus(afterCheck(result)); render(); }
    } catch (error) { console.warn('[Kulisy] The notes could not be checked.', error); }
  }

  /** The row above the cards: check the notes, load the changed ones again, translate. */
  function notesBar() {
    const mine = (library().characters ?? []).filter(card => Boolean(card.persona) === personaMode);
    const withNote = mine.filter(card => card.source);
    const stale = withNote.filter(card => card.source.stale);
    const russian = mine.filter(card => !cardIsEnglish(card) && (card.sections.some(section => section.text.trim()) || (card.records ?? []).length));
    if (!s.looked) { s.looked = true; if (withNote.length) lookAtNotesQuietly(); }
    const check = canRememberFolder()
      ? button('Проверить Obsidian', 'btn small', () => checkNotes(), 'Сверить анкеты в библиотеке с заметками в выбранной папке: изменённые будут подсвечены')
      : filePicker('Проверить Obsidian', { accept: '', directory: true, onFiles: async picked => checkNotes(await notesFromPicked(picked)), title: 'Выбрать папку с анкетами: изменённые будут подсвечены' });
    return element('div', { className: `ku-notesbar${stale.length ? ' stale' : ''}` }, [
      element('span', { className: 'ku-small', text: stale.length ? `В Obsidian изменились анкеты: ${stale.length}` : withNote.length ? `Карточек из Obsidian: ${withNote.length}, изменений не найдено` : 'Карточки из папки анкет Obsidian можно обновлять и сверять' }),
      element('span', { className: 'ku-push' }),
      Object.assign(button('Почистить клички', 'btn small', () => attempt(() => invoke('onLibraryStripLatinAliases', {}), count => (count ? `Почищено кличек: ${count}` : '')), 'Убрать из кличек всех карточек английские варианты (Izana, Mikey…), скобки с содержимым, кавычки и лишние знаки по краям. Имена карточек и склонения не трогаются'),
        { disabled: !(library().characters ?? []).some(card => (card.aliases ?? []).some(alias => tidyAlias(alias) !== alias)) }),
      check,
      ...(stale.length ? [canRememberFolder()
        ? button(`Обновить изменённые (${stale.length})`, 'btn primary small', () => refreshFromNotes(null), 'Загрузить русский текст изменённых анкет заново')
        : filePicker(`Обновить изменённые (${stale.length})`, { accept: '', directory: true, className: 'btn primary small', onFiles: async picked => refreshFromNotes(null, null, await notesFromPicked(picked)) })] : []),
      ...(russian.length ? [button(`Перевести русские (${russian.length})`, 'btn small', () => attempt(() => invoke('onLibraryTranslateCards', { cardIds: russian.map(card => card.id) }), result => `Переведено карточек: ${result?.done?.length ?? 0}${result?.failed?.length ? `, не удалось: ${result.failed.length}` : ''}`), 'Перевести на английский все карточки, которые ещё на русском')] : []),
    ]);
  }

  /** The page «Мир → Карточки»: the gallery of character cards and a line about what they add to the request now. */
  function renderCards() {
    useShelf('characters');
    const view = element('div', { className: 'records-view' });
    const report = snapshot().cardsReport;
    const tokens = Number(snapshot().cardsTokens) || 0;
    const attached = (snapshot().linkedCharacterIds ?? []).length;
    const line = report?.sent
      ? `В запросе сейчас: разделов ${report.sent}, ${(report.used ?? report.characters).toLocaleString('ru-RU')} зн. всего блока (≈${tokens.toLocaleString('ru-RU')} ток., это же число в «Что получает модель»)${report.trimmed ? `, не влезло: ${report.trimmed} (${(report.trimmedNames ?? []).join(', ')}); занято ${report.used} из ${report.limit} зн.` : ''}.`
      : attached ? 'Карточки включены, но сейчас в запрос ничего не уходит: нужные герои не в сцене или их разделы придержаны правилами.' : 'Включите карточку переключателем — она подключится к персонажу чата.';
    view.append(
      element('p', { className: 'muted ku-small', text: 'Персонаж, записанный один раз: разделы анкеты хранятся вне чатов, а в чате рассказчик получает только нужные — по правилам «Суфлёра» (Настройки → «Суфлёр лорбуков»).' }),
      element('p', { className: 'ku-small ku-cline', text: line }),
      notesBar(),
      renderLibrary('characters'),
    );
    return view;
  }

  // ---- Import --------------------------------------------------------------------

  /** The list of anketas of a picked folder with a tick for each: what to load. */
  function renderNotesChooser(importFiles) {
    const { files, list, picked } = s.notes;
    const wanted = s.notes.query.trim().toLocaleLowerCase('ru-RU');
    const shown = list.filter(item => !wanted || `${item.name} ${item.folder}`.toLocaleLowerCase('ru-RU').includes(wanted));
    const search = element('input', { type: 'search', value: s.notes.query, placeholder: 'Найти в списке', 'aria-label': 'Поиск в списке', className: 'ku-search' });
    search.addEventListener('change', () => { s.notes.query = search.value; render(); });
    const rows = element('div', { className: 'ku-import-list' }, shown.map(item => {
      const box = element('input', { type: 'checkbox', checked: picked.has(item.path) });
      box.addEventListener('change', () => { if (box.checked) picked.add(item.path); else picked.delete(item.path); render(); });
      return element('label', { className: 'roster-item' }, [box, element('span', {}, [
        element('strong', { text: item.name }),
        element('span', { className: 'muted ku-small', text: ` ${item.folder ? `${item.folder} · ` : ''}${cards() ? `разделов: ${item.sections}` : `${item.size} зн.`}${item.exists ? ' · уже есть в библиотеке' : ''}` }),
      ])]);
    }));
    const go = button(`Загрузить отмеченные (${picked.size})`, 'btn primary small', async () => {
      const chosen = files.filter(file => picked.has(file.path));
      s.notes = null;
      await importFiles(chosen);
    });
    go.disabled = !picked.size;
    const all = button('Отметить все', 'btn small', () => { for (const item of shown) picked.add(item.path); render(); });
    const none = button('Снять все', 'btn small', () => { for (const item of shown) picked.delete(item.path); render(); });
    return element('div', { className: 'ku-notechoose' }, [
      element('p', { className: 'muted ku-small', text: `${cards() ? 'Анкет' : things() ? 'Вещей' : 'Локаций'} в папке: ${list.length}. Новые уже отмечены; те, что есть в библиотеке, нет: отметьте, если нужна ещё одна копия (в другой папке библиотеки) — в той же папке имя повторить нельзя.` }),
      element('div', { className: 'ku-row' }, [search, all, none]), rows, element('div', { className: 'ku-row' }, [go]),
    ]);
  }

  /** The entries of a picked file of Kulisy with a tick for each: only the ticked ones come in. */
  function renderFileChooser() {
    const { data, list, picked } = s.file;
    const KIND_RU = { places: 'локация', items: 'вещь', characters: 'карточка' };
    const wanted = s.file.query.trim().toLocaleLowerCase('ru-RU');
    const shown = list.filter(item => !wanted || `${item.name} ${item.folder}`.toLocaleLowerCase('ru-RU').includes(wanted));
    const search = element('input', { type: 'search', value: s.file.query, placeholder: 'Найти в списке', 'aria-label': 'Поиск в файле', className: 'ku-search' });
    search.addEventListener('change', () => { s.file.query = search.value; render(); });
    const rows = element('div', { className: 'ku-import-list' }, shown.map(item => {
      const box = element('input', { type: 'checkbox', checked: picked.has(item.id) });
      box.addEventListener('change', () => { if (box.checked) picked.add(item.id); else picked.delete(item.id); render(); });
      return element('label', { className: 'roster-item' }, [box, element('span', {}, [element('strong', { text: item.name }), element('span', { className: 'muted ku-small', text: ` ${item.folder ? `${item.folder} · ` : ''}${KIND_RU[item.kind]}` })])]);
    }));
    const go = button(`Загрузить отмеченные (${picked.size})`, 'btn primary small', async () => {
      const text = JSON.stringify(selectFromExport(data, [...picked]));
      s.file = null;
      await attempt(() => invoke('onLibraryImportJson', { text, folderId: s.folderId }), result => `Добавлено: ${result?.added?.length ?? 0}`);
    });
    go.disabled = !picked.size;
    const all = button('Отметить все', 'btn small', () => { for (const item of shown) picked.add(item.id); render(); });
    const none = button('Снять все', 'btn small', () => { for (const item of shown) picked.delete(item.id); render(); });
    return element('div', { className: 'ku-notechoose' }, [element('p', { className: 'muted ku-small', text: `В файле: ${list.length}. Отмечено всё — снимите лишнее.` }), element('div', { className: 'ku-row' }, [search, all, none]), rows, element('div', { className: 'ku-row' }, [go])]);
  }

  function renderImport() {
    const box = element('div', { className: 'card ku-import' });
    const folderName = s.folderId ? folderPath(library(), s.folderId).at(-1)?.name : '';
    const where = text => element('p', { className: 'muted ku-small', text: s.folderId ? `Импорт в папку «${folderName}»${things() ? ' — как вещи' : ''}.` : text });
    const close = button('Закрыть', 'btn small', () => { s.importMode = ''; s.notes = null; s.file = null; render(); });
    if (s.importMode === 'lorebook') {
      const books = invoke('onLibraryLorebooks', {}) ?? [];
      const select = element('select', { 'aria-label': 'Лорбук' }, [element('option', { value: '', text: 'Выберите лорбук' }), ...books.map(book => element('option', { value: book, text: book, selected: book === s.lorebook.book }))]);
      select.addEventListener('change', async () => {
        s.lorebook = { book: select.value, entries: [], picked: new Set() };
        if (select.value) {
          try { s.lorebook.entries = await invoke('onLibraryLorebookEntries', { book: select.value, kind }); }
          catch (error) { setStatus(error?.message || 'Лорбук не прочитан', true); }
        }
        render();
      });
      const list = element('div', { className: 'ku-import-list' });
      for (const entry of s.lorebook.entries) {
        const box2 = element('input', { type: 'checkbox', checked: s.lorebook.picked.has(entry.uid) });
        box2.addEventListener('change', () => { if (box2.checked) s.lorebook.picked.add(entry.uid); else s.lorebook.picked.delete(entry.uid); });
        list.append(element('label', { className: 'roster-item' }, [box2, element('span', {}, [element('strong', { text: entry.name }), element('span', { className: 'muted ku-small', text: ` ${entry.preview}` })])]));
      }
      const go = button(cards() ? 'Импортировать отмеченных (никого — всех)' : 'Импортировать отмеченные', 'btn primary small', () => attempt(() => invoke('onLibraryImportLorebook', { book: s.lorebook.book, uids: [...s.lorebook.picked], folderId: s.folderId, kind }), result => `Добавлено: ${result?.added?.length ?? 0}`));
      go.disabled = !s.lorebook.book;
      box.append(element('h3', { text: 'Из лорбука' }), where('Папка не открыта — будет папка с названием лорбука.'),
        ...(cards() ? [element('p', { className: 'muted ku-small', text: 'Берутся записи с названием «[ Имя ] - Раздел» (так их пишет lorebook_builder): одна карточка на имя, разделы — по названиям записей. Слова записи (ключи) станут другими именами.' })] : []),
        select, list, element('div', { className: 'ku-row' }, [go, close]));
    } else if (s.importMode === 'markdown') {
      const importFiles = files => attempt(() => invoke('onLibraryImportMarkdown', { files, folderId: s.folderId, kind, persona: personaMode }), result => `Добавлено: ${result?.added?.length ?? 0}, пропущено: ${result?.skipped?.length ?? 0}`);
      // Cards: the folder is read first, then the user ticks the anketas to load (new ones are ticked, the ones already here are not).
      const offer = files => {
        const list = invoke('onLibraryPreviewNotes', { files, persona: personaMode, kind });
        if (!list.length) { setStatus(personaMode ? 'В выбранной папке нет заметок персон: нужны .md с именем в первой строке, абзацем внешности и абзацем голоса.' : 'В выбранной папке нет анкет: нужны заметки .md с разделами «### …».', true); return; }
        s.notes = { files, list, picked: new Set(list.filter(item => !item.exists).map(item => item.path)), query: '' };
        render();
      };
      // Cards remember the folder (where the browser can), so a changed note is noticed later.
      const pick = cards() && canRememberFolder()
        ? button('Выбрать папку заметок', 'btn primary small', async () => {
          try {
            const handle = await pickFolder(slot());
            if (!handle) return;
            await rememberFolder(handle, slot());
            offer(await readNotes(handle));
          } catch (error) { setStatus(error?.message || 'Папка не прочитана', true); }
        })
        : filePicker('Выбрать папку заметок', { accept: '', directory: true, className: 'btn primary small', onFiles: async picked => offer(await notesFromPicked(picked)) });
      const chooser = s.notes ? renderNotesChooser(importFiles) : null;
      box.append(element('h3', { text: personaMode ? 'Из папки персон' : cards() ? 'Из папки анкет' : 'Из папки заметок' }), where('Папка библиотеки не открыта — будет папка с названием выбранной папки заметок.'),
        element('p', { className: 'muted ku-small', text: personaMode
          ? 'Каждая заметка .md из папки персон (Obsidian: Person) — одна карточка, подпапки — папки. Первая строка — имя («кличка» в ёлочках станет прозвищем), строки под ним — «Public Info», затем абзац внешности и абзац голоса. Загружается русский текст: переведите его кнопкой «Перевести русские» над списком.'
          : cards()
          ? 'Каждая заметка .md — одна карточка, подпапки — папки. Загружается русский текст: разделы — заголовки «### …» (Basic Info, Voice…); подсказки %% … %%, пустые вопросы и английская часть «# Translate» не попадут. Имена берутся из aliases, name_en и keys шапки. Перевод на английский делается потом, кнопкой на карточке. Папку Закулисье запомнят и подскажут, если заметка изменилась.'
          : things()
          ? 'Каждая заметка .md — одна вещь, подпапки — папки. В шапке можно указать aliases, «владелец» и «важность» (важная / ключевая).'
          : 'Каждая заметка .md — одна локация, подпапки — папки. В шапке можно указать aliases, traits и «находится в».' }),
        ...(chooser ? [chooser] : []),
        element('div', { className: 'ku-row' }, [pick, close]));
    } else {
      const pick = filePicker('Выбрать файл .json', { accept: 'application/json,.json', multiple: false, className: 'btn primary small', onFiles: async ([file]) => {
        if (file.size > 5_000_000) { setStatus('Файл больше 5 МБ.', true); return; }
        try {
          const data = JSON.parse(await file.text());
          const list = listExport(data);
          if (!list.length) { setStatus('В файле нет ни локаций, ни вещей, ни карточек.', true); return; }
          s.file = { data, list, picked: new Set(list.map(item => item.id)), query: '' };
          render();
        } catch (error) { setStatus(error instanceof SyntaxError ? 'Файл не читается как JSON' : (error?.message || 'Файл не прочитан'), true); }
      } });
      box.append(element('h3', { text: 'Из файла Закулисья' }), element('p', { className: 'muted ku-small', text: `${s.folderId ? `Папки файла лягут в «${folderName}».` : 'Папки файла лягут в корень библиотеки.'} Из файла берутся локации, вещи и карточки: выберите файл, потом отметьте, что загрузить.` }),
        ...(s.file ? [renderFileChooser()] : []), element('div', { className: 'ku-row' }, [pick, close]));
    }
    return box;
  }

  // ---- Ctrl+V of a picture while the library is open -----------------------------

  function onPaste(event) {
    try {
      if (!ctx.shadow?.host?.isConnected || !ctx.shadow.querySelector('.ku-lib') || !s.folderId) return;
      const target = event.composedPath?.()[0];
      if (target && /^(INPUT|TEXTAREA)$/.test(target.tagName) && target.type !== 'file') return;
      const files = [...(event.clipboardData?.files ?? [])].filter(file => /^image\//.test(file.type));
      if (!files.length) return;
      event.preventDefault();
      // An open card takes the picture as its own; otherwise it is a new entry.
      if (s.openId) {
        const id = s.openId;
        attempt(async () => invoke('onLibrarySetImage', { kind, id, imageDataUrl: await fileToDataUrl(files[0]) }), 'Картинка сохранена');
      } else addPictures(files);
    } catch (error) {
      console.error('[Kulisy] Paste into the library failed.', error);
    }
  }
  document.addEventListener('paste', onPaste);
  // A reload or a closed tab with a card that has unsaved typing: the browser asks first.
  const unsavedCard = () => Object.values(shelves).some(shelf => shelf.openId && shelf.draft?.base !== undefined && JSON.stringify(shelf.draft.fields) !== shelf.draft.base);
  function onLeavePage(event) { if (unsavedCard()) { event.preventDefault(); event.returnValue = ''; } }
  window.addEventListener('beforeunload', onLeavePage);

  /**
   * A card that is not on yet finds its character by the exact name. When the chat has SEVERAL characters of that name, the toggle would not know
   * which one is meant, so they are listed here: «Это он» for each (or a new one). With one or none, nothing is asked: the toggle just works.
   */
  function attachChoice(entry) {
    const wanted = new Set([entry.name, ...(entry.aliases ?? [])].map(normalizeAlias));
    const found = (snapshot().characters ?? []).filter(item => characterId(item) !== snapshot().personaId
      && [characterName(item, ''), ...(item.aliases ?? [])].some(name => wanted.has(normalizeAlias(name))));
    if (found.length < 2) return element('span', { className: 'ku-hint' });
    const attach = (value, done) => attempt(() => act('onLibraryLink', { libraryIds: [entry.id], on: true, kind, pick: { [entry.id]: value } }, 'library-link'), done);
    return element('div', { className: 'ku-attach' }, [
      element('span', { className: 'ku-small', text: 'В чате несколько героев с таким именем. Кому эта карточка?' }),
      ...found.map(item => button(characterName(item, characterId(item)), 'btn small', () => attach(characterId(item), `Карточка подключена к «${characterName(item, '')}»`), 'Подключить карточку к этому герою')),
      button('Новый герой', 'btn small', () => attach('__new', 'Добавлен новый герой с этой карточкой'), 'Не к кому-то из них, а к новому герою'),
    ]);
  }

  /** What is open and could be lost from sight when the window is closed: for the pill that stands in for the folded window. */
  function libraryPending() {
    for (const [shelf, windowId] of [['characters', 'cards'], ['places', 'places'], ['items', 'wardrobe']]) {
      const shelfState = shelves[shelf];
      if (!shelfState.openId) continue;
      const entry = (shelf === 'characters' ? library().characters : shelf === 'items' ? library().items : library().locations)?.find(item => item.id === shelfState.openId);
      if (!entry) continue;
      const translating = shelfState.translating?.id === entry.id;
      const running = Boolean(shelfState.gen?.running) || translating;
      return { shelf, windowId, name: shelfState.draft?.fields?.name || entry.name, running, progress: translating ? shelfState.translating.text : running ? (shelfState.gen.progress || 'пишется…') : '' };
    }
    return null;
  }

  /** Open a card of the library (from another page): it shows when the cards page is drawn. */
  const openLibraryCard = id => { shelves.characters.openId = id; shelves.characters.draft = null; shelves.characters.selSection = ''; };

  /**
   * The editor of one persona card, drawn inline for another window (the persona window): no overlay, no close, no folder
   * (the window has its own), a gear for the tavern's settings. A missing card gives a plain note.
   */
  function renderEmbeddedCard(cardId, options = {}) {
    useShelf('personas');
    const entry = entriesOf().find(card => card.id === cardId);
    if (!entry) return element('p', { className: 'muted ku-small', text: 'У этой персоны ещё нет карточки.' });
    s.openId = entry.id;
    embed = { onGear: options.onGear };
    try { return renderCardEditor(entry); }
    finally { embed = null; }
  }

  /** The page «Мир → Персоны»: the cards of personas, in the same library with the same folders. */
  function renderPersonas() {
    useShelf('personas');
    const view = element('div', { className: 'records-view' });
    view.append(
      element('p', { className: 'muted ku-small', text: 'Карточки персон: то, что в персоне заметно со стороны, имена со склонениями и записи о ней (кто что о ней знает, в каком АУ). Папки и окно карточки те же, что у героев. Включённая здесь карточка читается как персона этого чата; не включена ни одна, берётся та, что подходит по имени.' }),
      notesBar(),
      renderLibrary('personas'),
    );
    return view;
  }

  return { renderLibrary, renderCards, renderPersonas, renderEmbeddedCard, openLibraryCard, libraryPending, destroyLibrary: () => { document.removeEventListener('paste', onPaste); window.removeEventListener('beforeunload', onLeavePage); } };
}

/** Styles of the library gallery (the card over the window reuses the wardrobe's). */
export const LIBRARY_STYLE = `
.ku-lib{display:flex;flex-direction:column;gap:12px;container-type:inline-size}
.ku-lib .ku-wsec{width:210px}
.ku-lsec .ku-folder{border:0;border-radius:8px;padding-top:0;padding-bottom:0;background:transparent;color:var(--k-muted)}
.ku-lsec .ku-folder:hover{color:var(--k-text);background:var(--k-inset)}
.ku-lsec .ku-folder.on{background:var(--k-accent-soft);color:var(--k-accent)}
.ku-fname{display:inline-flex;align-items:center;gap:7px;min-width:0}
.ku-fname span{white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.ku-fname .ku-ico{flex:0 0 auto;width:15px;height:15px}
.ku-lnew{display:flex;gap:6px;margin-top:10px;padding-top:10px;border-top:1px solid var(--k-line)}
.ku-lnew input{flex:1 1 auto;min-width:0}
.ku-lhead{gap:8px}
.ku-ltitle{margin:0;font-size:15px}
.ku-ltiles{grid-template-columns:repeat(auto-fill,minmax(150px,1fr))}
.ku-ltile{position:relative;border-radius:13px}
.ku-ltile .ku-place-open{padding:0;gap:0;align-items:stretch;position:relative}
.ku-ltile .ku-tilepic{position:absolute;top:6px;right:6px;z-index:2;opacity:0;transition:opacity .15s}
.ku-ltile .ku-tilepic .ku-ib{background:var(--k-panel);border:1px solid var(--k-line);color:var(--k-text);width:30px;height:30px}
.ku-ltile:hover .ku-tilepic,.ku-ltile:focus-within .ku-tilepic,.ku-ltile .ku-tilepic.empty{opacity:1}
.ku-ltile.over{outline:2px dashed var(--k-accent);outline-offset:-2px}
@media (hover:none){.ku-ltile .ku-tilepic{opacity:1}}
.ku-ltiles.places .ku-pic{aspect-ratio:4/3}
.ku-ltiles.items .ku-pic{aspect-ratio:1/1}
.ku-ltile .ku-nopic{color:var(--k-accent);background:var(--k-accent-soft)}
.ku-letter{font-size:22px;font-weight:800}
.ku-ltext{display:flex;flex-direction:column;gap:2px;padding:7px 10px 8px;min-width:0}
.ku-ltext strong{font-size:12.5px;line-height:1.25;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.ku-ltext .muted{white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.ku-ltext .ku-chip{align-self:flex-start;margin-top:2px}
.ku-ltile .ku-inline{padding:7px 10px}
.ku-ltiles .ku-drop{min-height:150px}
.ku-wview.places img{object-fit:cover}
.ku-import{display:flex;flex-direction:column;gap:8px}
.ku-import h3{margin:0}
.ku-ltiles.characters .ku-pic{aspect-ratio:3/4}
.ku-wview.characters img{object-fit:cover}
.ku-cline{margin:0}
.ku-ccard{flex-direction:column;width:min(1000px,100%);height:min(820px,100%)}
/* the editor inside another window: no overlay, fills the place it is given */
.ku-wlayer.ku-embedded{position:static;inset:auto;z-index:auto;display:block;padding:0;background:none;backdrop-filter:none;height:100%}
.ku-wlayer.ku-embedded .ku-ccard{width:100%;height:100%;max-height:none;border:0;border-radius:0;box-shadow:none;background:transparent}
/* the same editor in a narrow window: a tighter head, a slimmer list (the long hints are tooltips everywhere, see below) */
.ku-embedded .ku-ctop{gap:12px;padding:10px 14px;align-items:flex-start}
.ku-embedded .ku-cport-wrap,.ku-embedded .ku-cport{width:96px;height:120px}
.ku-embedded .ku-cfields input{min-height:38px}
.ku-embedded .ku-cstrip{padding:6px 14px;gap:6px 10px}
.ku-embedded .ku-cnavbox{flex:0 0 196px;padding:10px 8px}
.ku-embedded .ku-cnav{min-height:38px;padding:0 10px;font-size:13px}
.ku-embedded .ku-cpane{padding:16px 18px;gap:16px}
.ku-embedded .ku-cfoot{position:sticky;bottom:0;z-index:2;flex:0 0 auto;gap:10px;padding:8px 14px}
.ku-ctop{display:flex;gap:18px;align-items:flex-start;padding:20px 24px;border-bottom:1px solid var(--k-line)}
.ku-cport-box{flex:0 0 auto;display:block}
.ku-cport-wrap{position:relative;width:124px;height:156px;border-radius:14px;overflow:hidden}
.ku-cport{width:124px;height:156px;border-radius:14px;object-fit:cover;display:block;background:var(--k-inset)}
.ku-cport-pick{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;border:0;border-radius:inherit;background:color-mix(in srgb,var(--k-bg) 62%,transparent);color:var(--k-text);cursor:pointer;opacity:0;transition:opacity .18s ease}
.ku-cport-pick .ku-ico{width:26px;height:26px}
.ku-cport-x{position:absolute;top:5px;right:5px;width:24px;height:24px;display:flex;align-items:center;justify-content:center;padding:0;border:0;border-radius:50%;background:color-mix(in srgb,var(--k-bg) 78%,transparent);color:var(--k-text);cursor:pointer;opacity:0;transition:opacity .18s ease}
.ku-cport-x .ku-ico{width:13px;height:13px}
.ku-cport-wrap:hover .ku-cport-pick,.ku-cport-wrap:focus-within .ku-cport-pick,.ku-cport-wrap:hover .ku-cport-x,.ku-cport-wrap:focus-within .ku-cport-x{opacity:1}
.ku-cport-x:hover{background:var(--k-warn)}
.ku-cnoport{display:grid;place-items:center;font-size:44px;font-weight:700;color:var(--k-accent)}
.ku-ctop-main{flex:1 1 auto;min-width:0;display:flex;flex-direction:column;gap:8px}
.ku-cfields{display:flex;gap:10px;flex-wrap:wrap}
.ku-cfields input,.ku-cfields select{flex:1 1 200px;min-width:0;min-height:42px}
.ku-cfields .ku-cgender{flex:0 1 150px}
.ku-cname{font-size:18px;font-weight:700}
.ku-ctop-tools{display:flex;gap:6px;align-items:center}
.ku-ctop-tools .ku-gear{width:38px;height:38px;min-height:38px;border:1px solid var(--k-line);border-radius:12px;background:var(--k-inset);color:var(--k-muted)}
.ku-ctop-tools .ku-gear:hover{color:var(--k-text);border-color:var(--k-accent-line);background:var(--k-inset)}
.ku-cbodybox{flex:1 1 auto;min-height:0;display:flex}
.ku-cnavbox{flex:0 0 260px;box-sizing:border-box;padding:16px 14px;border-right:1px solid var(--k-line);display:flex;flex-direction:column;gap:4px;overflow:auto}
.ku-cnavhead{padding:0 8px 8px}
.ku-cnavbox>*{flex-shrink:0}
.ku-cnavsep{height:1px;margin:12px 4px 8px;background:var(--k-line)}
.ku-cnavgroup{display:flex;align-items:center;gap:8px;padding:0 4px 4px 8px}
.ku-cnavgroup-title{font-size:12.5px;font-weight:600;color:var(--k-text);overflow-wrap:anywhere}
.ku-cnav-add{width:28px;height:28px;border:1px solid var(--k-line);border-radius:50%}
.ku-cnav-add:hover{color:var(--k-text);border-color:var(--k-accent-line)}
.ku-crec{height:auto;min-height:40px;align-items:flex-start;padding:8px 12px;line-height:1.3}
.ku-crec .ku-crec-title{white-space:normal;overflow:visible;text-overflow:clip;overflow-wrap:anywhere;word-break:break-word}
.ku-crec .ku-crec-title.empty{color:var(--k-muted);font-style:italic}
.ku-crec.off,.ku-cnav.off{opacity:.55}
.ku-secoff{margin-left:auto;display:inline-flex;align-items:center;gap:8px}
.ku-crecwrap{position:relative;flex:0 0 auto}
.ku-crecwrap .ku-crec{padding-right:34px}
.ku-crec-x{position:absolute;top:6px;right:6px;width:22px;height:22px;display:flex;align-items:center;justify-content:center;padding:0;border:0;border-radius:50%;background:transparent;color:var(--k-muted);cursor:pointer;opacity:0;transition:opacity .15s ease,color .15s ease,background-color .15s ease}
.ku-crec-x .ku-ico{width:12px;height:12px}
.ku-crecwrap:hover .ku-crec-x,.ku-crec-x:focus-visible{opacity:1}
.ku-crec-x:hover{color:var(--k-warn);background:var(--k-inset)}
.ku-crec .ku-ico{flex:0 0 auto;width:14px;height:14px;margin-top:2px;color:var(--k-muted)}
.ku-cnav{display:flex;align-items:center;gap:10px;width:100%;box-sizing:border-box;min-height:44px;padding:0 12px;border:0;border-radius:10px;background:transparent;color:var(--k-text);font-size:13.5px;text-align:left;cursor:pointer}
.ku-cnav:hover{background:var(--k-inset)}
.ku-cnav.on{background:var(--k-accent-soft);color:var(--k-accent);font-weight:600;box-shadow:inset 3px 0 0 var(--k-accent)}
.ku-keys{width:100%;box-sizing:border-box;resize:vertical;min-height:48px;font-family:inherit;line-height:1.4;overflow-wrap:anywhere;white-space:pre-wrap}
.ku-wsel{flex:1 1 200px;min-width:0}
.ku-wsel select{width:100%}
.ku-closet-row{display:flex;align-items:center;gap:10px;padding:6px 8px;border:1px solid var(--k-line);border-radius:8px;margin-bottom:6px}
.ku-closet-row.on{border-color:var(--k-accent)}
.ku-genbadge{display:flex;align-items:center;gap:8px;align-self:flex-start;max-width:100%;padding:5px 12px;border:1px solid var(--k-accent);border-radius:999px;background:var(--k-accent-soft);color:var(--k-accent);font-size:12px;font-weight:600}
.ku-genbadge span:last-child{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.ku-genspin{flex:0 0 12px;width:12px;height:12px;border:2px solid var(--k-accent);border-right-color:transparent;border-radius:50%;animation:rs-spin 0.9s linear infinite}
.ku-closet-name{flex:1 1 auto;min-width:0}
.ku-closet-own{position:absolute;top:6px;left:6px;padding:1px 7px;border-radius:20px;background:var(--k-accent);color:var(--k-bg);font-size:10.5px}
.ku-closet-tile{position:relative}
.ku-closet-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(132px,1fr));gap:10px;margin-top:8px}
.ku-closet-sticky{position:sticky;top:-22px;z-index:3;padding:8px 0 10px;display:flex;flex-direction:column;gap:6px;background-color:var(--k-bg);background-image:linear-gradient(var(--k-bg),var(--k-bg)),linear-gradient(var(--k-bg),var(--k-bg)),linear-gradient(var(--k-bg),var(--k-bg))}
.ku-closet-filters{display:flex;gap:6px;flex-wrap:wrap;align-items:center}
.ku-closet-filters .ku-search{flex:1 1 170px;min-width:130px;width:auto}
.ku-closet-filters select{flex:0 1 auto;width:auto;max-width:180px;min-width:0}
.ku-cpane,.ku-cnavbox,.ku-closet-grid{overscroll-behavior:contain}
.ku-wlayer{overscroll-behavior:contain;backdrop-filter:blur(5px)}
.ku-closet-tile{display:flex;flex-direction:column;gap:4px;padding:4px;border:2px solid transparent;border-radius:10px;background:var(--k-inset);color:var(--k-text);cursor:pointer;text-align:center;font:inherit}
.ku-closet-tile.on{border-color:var(--k-accent)}
.ku-closet-tile img,.ku-closet-noimg{width:100%;aspect-ratio:1;object-fit:cover;border-radius:8px;display:flex;align-items:center;justify-content:center;background:var(--k-track)}
.ku-closet-cap{font-size:12.5px;line-height:1.25;overflow:hidden;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical}
.ku-pickbar{display:flex;flex-wrap:wrap;align-items:center;gap:8px;padding:8px 10px;margin:6px 0;border:1px solid var(--k-accent);border-radius:10px;background:var(--k-inset)}
.ku-pickbox{margin:0 8px 0 0;flex:0 0 auto;pointer-events:none}
.ku-place-card.picked{outline:2px solid var(--k-accent)}
.ku-cstrip{display:flex;flex-wrap:wrap;align-items:center;gap:8px 10px;padding:8px 14px;border-bottom:1px solid var(--k-line);background:var(--k-inset)}
.ku-cstrip.stale{background:color-mix(in srgb,var(--k-accent) 16%,transparent)}
.ku-cstrip-note{flex:1 1 220px;min-width:0}
.ku-stale{background:color-mix(in srgb,var(--k-accent) 28%,transparent);color:var(--k-text)}
.ku-notesbar{display:flex;flex-wrap:wrap;align-items:center;gap:8px;padding:8px 10px;margin:6px 0;border:1px solid var(--k-line);border-radius:10px}
.ku-notesbar.stale{border-color:var(--k-accent)}
.ku-cnav-title{flex:1 1 auto;min-width:0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.ku-cdot{flex:0 0 auto;width:9px;height:9px;border-radius:50%;background:var(--k-accent)}
.ku-cdot.empty{background:transparent;border:2px solid var(--k-muted);box-sizing:border-box}
.ku-cnavbox .ku-push{flex:1 1 auto;min-height:10px}
.ku-cnavbox .btn{margin-top:6px;min-height:40px}
.ku-cpane{flex:1 1 auto;min-width:0;box-sizing:border-box;padding:22px 28px;display:flex;flex-direction:column;gap:22px;overflow:auto}
.ku-ctitlerow{display:flex;align-items:center;gap:12px;flex-wrap:wrap}
.ku-closet-row input[type=checkbox],.ku-copt input[type=checkbox],.ku-fact-text input[type=checkbox],.ku-wlayer input[type=checkbox]:not(.ku-switch):not(.set-switch):not(.ku-pickbox),.ku-lib input[type=checkbox]:not(.ku-switch):not(.set-switch):not(.ku-pickbox){width:18px;height:18px;min-height:0;padding:0;margin:0;flex:0 0 auto;accent-color:var(--k-accent)}
.ku-cfolder{max-width:100%}
.ku-aunotice{display:grid;gap:6px;margin-top:8px;padding:8px 10px;border:1px solid var(--k-warn);border-radius:10px;background:var(--k-warn-soft)}
.ku-aunotice p{margin:0;font-size:12.5px}
.ku-pill{position:fixed;left:14px;bottom:14px;z-index:2147483003;display:flex;align-items:center;gap:8px;max-width:min(420px,calc(100vw - 28px));padding:9px 14px;border:1px solid var(--k-line);border-radius:999px;background:var(--k-panel);color:var(--k-text);font:inherit;font-size:13px;cursor:pointer;box-shadow:0 4px 18px var(--k-shadow)}
.ku-pill[hidden]{display:none}
.ku-pill span{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.ku-pill.busy{border-color:var(--k-ok)}
.ku-refbox{display:grid;gap:6px;margin-top:8px;justify-items:start}
.ku-refthumb{max-width:100%;max-height:120px;object-fit:contain;cursor:zoom-in;border:1px solid var(--k-line);border-radius:8px;background:var(--k-inset)}
.ku-refzoom{position:fixed;inset:0;z-index:2147483004;display:grid;place-items:center;padding:16px;background:var(--k-backdrop);cursor:zoom-out}
.ku-refzoom img{max-width:100%;max-height:100%;object-fit:contain;border-radius:10px}
.ku-textwrap{position:relative}
.ku-splitplaque{position:absolute;z-index:3;display:flex;align-items:center;gap:8px;padding:4px 6px 4px 10px;border:1px solid var(--k-line);border-radius:10px;background:var(--k-panel);box-shadow:0 4px 14px var(--k-shadow);white-space:nowrap}
.ku-splitplaque[hidden]{display:none}
.ku-clearpanel{margin:0 12px 6px}
.ku-clearlist{display:grid;gap:2px;max-height:150px;overflow:auto}
.ku-clearrow{display:flex;align-items:center;gap:4px}
.ku-aupanel{display:grid;gap:10px;margin:8px 0 14px;padding:12px 14px;border:1px solid var(--k-line);border-radius:12px}
.ku-aupanel textarea{min-height:60px}
.ku-gbar{display:grid;gap:4px;margin:6px 0 10px;padding:8px 10px;border:1px solid var(--k-line);border-radius:10px}
.ku-gbar .ku-row{display:flex;gap:6px;flex-wrap:wrap;align-items:center}
.ku-gbar .ku-row input[type=text]{flex:1 1 220px;min-width:0}
.ku-gbar p{margin:0}
.ku-plook{flex-direction:column;align-items:stretch;justify-content:flex-start;width:min(680px,100%);gap:12px;padding:18px 20px;overflow:auto;text-align:left;background:var(--k-bg)}
.ku-plook>*{flex:0 0 auto;min-width:0}
.ku-plook .ku-row{align-items:center;flex-wrap:wrap;gap:8px}
.ku-plook p{margin:0}
.ku-plook-opt{display:flex;align-items:center;gap:10px}
.ku-plook-opt>span{display:flex;flex-direction:column;gap:2px}
.ku-plook textarea{width:100%}
.ku-plook-pic{display:flex;gap:14px;align-items:center;text-align:left}
.ku-plook-pic img,.ku-plook-pic .ku-cport{width:84px;height:84px;border-radius:12px;object-fit:cover;flex:0 0 auto}
.ku-plook-picinfo{display:flex;flex-direction:column;gap:6px}
.ku-plook-opt{padding:10px 12px;border:1px solid var(--k-line);border-radius:10px;background:var(--k-inset)}
.ku-plook-layer{z-index:2147483004}
.ku-ctitle{margin:0;font-size:22px}
.ku-ctitle-edit{flex:1 1 220px;min-width:0;font-weight:700;color:inherit;background:transparent;border:1px solid transparent;border-radius:8px;padding:2px 6px}
.ku-ctitle-edit:hover,.ku-ctitle-edit:focus{border-color:var(--k-line);background:var(--k-inset)}
.ku-fld{display:flex;flex-direction:column;gap:6px}
.ku-clabel{font-size:13px;font-weight:700}
.ku-hint{margin:0;font-size:12.5px;line-height:1.5;color:var(--k-muted)}
.ku-cpane textarea{min-height:170px;line-height:1.6;resize:vertical;padding:12px 14px}
.ku-cpane input[type=text],.ku-cpane select{min-height:42px}
.ku-copts{display:flex;flex-direction:column;gap:10px}
.ku-copt{display:flex;gap:12px;align-items:flex-start;padding:12px 14px;border:1px solid var(--k-line);border-radius:12px;cursor:pointer}
.ku-copt.on{border-color:var(--k-accent);background:var(--k-accent-soft)}
.ku-copt input[type=radio]{margin-top:3px;flex:0 0 auto;width:18px;height:18px;accent-color:var(--k-accent)}
.ku-copt>span{display:flex;flex-direction:column;gap:6px;min-width:0;flex:1 1 auto}
.ku-cmore summary{cursor:pointer;font-size:13.5px;font-weight:600;padding:6px 0}
.ku-cmore .ku-fld{margin-top:12px}
.ku-ctools{display:flex;gap:8px;flex-wrap:wrap;margin-top:auto;padding-top:14px;border-top:1px solid var(--k-line)}
.ku-cfoot{display:flex;gap:10px;align-items:stretch;padding:12px 24px;border-top:1px solid var(--k-line)}
.ku-cfoot{position:relative}
.ku-cfoot>.btn{align-self:center}
.ku-cfoot>.ku-chip{align-self:center}
.ku-cfoot-au{width:auto;gap:6px;padding:0 14px;font-weight:800;font-size:14px;letter-spacing:.02em}
.ku-au-badge{min-width:18px;height:18px;padding:0 5px;border-radius:9px;background:var(--k-accent);color:var(--k-bg);font-size:11px;line-height:18px;text-align:center}
.ku-au-badge.warn{background:var(--k-warn)}
.ku-aupop{position:absolute;right:24px;bottom:calc(100% + 8px);z-index:6;width:min(360px,calc(100% - 32px));max-height:min(420px,70vh);overflow:auto;display:flex;flex-direction:column;gap:8px;padding:14px;border:1px solid var(--k-line);border-radius:14px;background:var(--k-bg);box-shadow:0 18px 50px var(--k-shadow)}
.ku-aupop .ku-hint{margin:0}
.ku-pstate{white-space:nowrap}
.ku-secau{gap:6px}.ku-secau.set,.ku-secau.on{border-color:var(--k-accent);color:var(--k-accent)}
.ku-secaupop{position:static;width:auto;max-width:420px;margin:0 0 10px;box-shadow:none}
.ku-cfoot-tools{display:flex;gap:8px;align-items:stretch}
.ku-cfoot-tool,.ku-cfoot-del{flex:0 0 auto;width:auto;height:auto;aspect-ratio:1/1;align-self:stretch;display:flex;align-items:center;justify-content:center;padding:0;border:1px solid var(--k-line);border-radius:12px;background:var(--k-inset);color:var(--k-muted);cursor:pointer;transition:color .15s ease,border-color .15s ease,background-color .15s ease}
.ku-cfoot-tool .ku-ico,.ku-cfoot-del .ku-ico{width:21px;height:21px}
.ku-cfoot-tool:hover{color:var(--k-text);border-color:var(--k-accent-line)}
.ku-cfoot-tool.on{color:var(--k-accent);border-color:var(--k-accent);background:var(--k-accent-soft)}
.ku-cfoot-del:hover{color:var(--k-warn);border-color:var(--k-warn)}
.ku-cstrip-note{display:none}
.ku-cfoot .ku-wear .muted{display:none}
.ku-attach{display:flex;gap:6px;flex-wrap:wrap;align-items:center}
@media (max-width:760px){.ku-ctop{flex-wrap:wrap}.ku-cbodybox{flex-direction:column;overflow:auto}.ku-cnavbox{flex-basis:auto;border-right:0;border-bottom:1px solid var(--k-line)}}
@container (max-width:700px){.ku-lib .ku-wsec{width:100%}.ku-lnew{flex:1 1 100%}}
`;
