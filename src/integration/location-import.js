/**
 * Turning outside material into location drafts for the library (see addDrafts):
 *   - entries of a SillyTavern lorebook (any book, no Obsidian needed);
 *   - Markdown notes, e.g. an Obsidian folder picked in the browser.
 * Pure functions: reading files and books is the caller's job.
 */

const MARKDOWN = /\.(md|markdown)$/i;

function clip(value, max) {
  return String(value ?? '').replace(/\s+/g, ' ').trim().slice(0, max);
}

/** Entries of a lorebook a user can pick from: [{ uid, name, keys, preview, disabled }]. */
export function listLorebookEntries(book) {
  return Object.entries(book?.entries ?? {}).map(([uid, entry]) => {
    const keys = (Array.isArray(entry?.key) ? entry.key : []).map(key => clip(key, 60)).filter(Boolean);
    return {
      uid: String(entry?.uid ?? uid),
      name: clip(entry?.comment, 120) || keys[0] || `Запись ${uid}`,
      keys,
      preview: clip(entry?.content, 160),
      disabled: Boolean(entry?.disable),
    };
  }).filter(entry => entry.preview || entry.keys.length);
}

/** Drafts from the chosen entries (all enabled ones when `uids` is not given). */
export function draftsFromLorebook(book, uids = null) {
  const wanted = uids ? new Set(uids.map(String)) : null;
  const entries = book?.entries ?? {};
  return listLorebookEntries(book)
    .filter(entry => (wanted ? wanted.has(entry.uid) : !entry.disabled))
    .map(entry => {
      const raw = Object.values(entries).find(item => String(item?.uid) === entry.uid) ?? entries[entry.uid] ?? {};
      return {
        name: entry.name,
        aliases: entry.keys.filter(key => key.toLocaleLowerCase('ru-RU') !== entry.name.toLocaleLowerCase('ru-RU')),
        description: markdownToText(String(raw.content ?? '')),
      };
    });
}

/** A minimal YAML front matter reader: `key: value`, `key: [a, b]`, and `key:` + `- item` lines. */
export function readFrontMatter(text) {
  const match = /^﻿?---\r?\n([\s\S]*?)\r?\n---[ \t]*(?:\r?\n|$)/.exec(String(text ?? ''));
  if (!match) return { data: {}, body: String(text ?? '') };
  const data = {};
  let listKey = '';
  const unquote = value => value.trim().replace(/^(["'])(.*)\1$/, '$2').trim();
  for (const line of match[1].split(/\r?\n/)) {
    const item = /^\s+-\s+(.*)$/.exec(line);
    if (item && listKey) { data[listKey].push(unquote(item[1])); continue; }
    const pair = /^([A-Za-zА-Яа-яЁё_][\wЀ-ӿ -]*):\s*(.*)$/.exec(line);
    if (!pair) { listKey = ''; continue; }
    const key = pair[1].trim().toLowerCase();
    const value = pair[2].trim();
    if (!value) { data[key] = []; listKey = key; continue; }
    listKey = '';
    data[key] = value.startsWith('[') && value.endsWith(']')
      ? value.slice(1, -1).split(',').map(unquote).filter(Boolean)
      : unquote(value);
  }
  return { data, body: String(text).slice(match[0].length) };
}

/**
 * Obsidian/Markdown → plain prose for the model: no embeds, comments or HTML;
 * [[link|shown]] → shown; ==mark== and **bold** → their text; heading marks dropped.
 */
export function markdownToText(text) {
  return String(text ?? '')
    .replace(/%%[\s\S]*?%%/g, '')
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/!\[\[[^\]]*\]\]/g, '')
    .replace(/!\[[^\]]*\]\([^)]*\)/g, '')
    .replace(/\[\[([^\]|#]+)(?:#[^\]|]*)?\|([^\]]+)\]\]/g, '$2')
    .replace(/\[\[([^\]|#]+)(?:#[^\]]*)?\]\]/g, '$1')
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
    .replace(/<[^>]+>/g, '')
    .replace(/==([^=]+)==/g, '$1')
    .replace(/(\*\*|__)(.+?)\1/g, '$2')
    .replace(/^[ \t]{0,3}#{1,6}[ \t]+/gm, '')
    .replace(/^[ \t]*>[ \t]?(\[![^\]]*\][+-]?[ \t]*)?/gm, '')
    .replace(/\r\n?/g, '\n')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function asList(value) {
  if (Array.isArray(value)) return value.map(item => clip(item, 300)).filter(Boolean);
  return value ? String(value).split(',').map(item => clip(item, 300)).filter(Boolean) : [];
}

/**
 * One note → one draft. `relativePath` is the browser's path inside the picked folder
 * ("Локации/Токио/Сибуя/Бар.md"): the picked folder itself is dropped, the folders
 * below it become library folders. Front matter may give title, aliases, traits and
 * parent ("находится в"). Returns null for non-Markdown files and empty notes.
 */
export function draftFromMarkdown(relativePath, text) {
  const parts = String(relativePath ?? '').split(/[\\/]/).filter(Boolean);
  const file = parts.pop() ?? '';
  if (!MARKDOWN.test(file)) return null;
  const folderPath = parts.slice(1).filter(part => !part.startsWith('.'));
  const { data, body } = readFrontMatter(text);
  const name = clip(data.title || data['название'] || file.replace(MARKDOWN, ''), 120);
  const description = markdownToText(body);
  if (!name || (!description && !data.traits)) return null;
  const parent = data.parent || data['находится в'] || data['где'] || '';
  return {
    folderPath,
    name,
    aliases: asList(data.aliases ?? data.alias ?? data.keys ?? data['ключи']),
    description,
    traits: asList(data.traits ?? data['черты']),
    parentName: markdownToText(Array.isArray(parent) ? parent[0] : parent),
    ...thingFields(data),
  };
}

/** For things: «владелец» / owner and «важность» / importance from the front matter. */
function thingFields(data) {
  const owner = data.owner ?? data['владелец'] ?? data['чьё'] ?? '';
  const raw = clip(Array.isArray(data.importance ?? data['важность']) ? (data.importance ?? data['важность'])[0] : (data.importance ?? data['важность'] ?? ''), 30).toLowerCase();
  const importance = { key: 'key', important: 'important', 'ключевая': 'key', 'важная': 'important' }[raw];
  return {
    ...(owner ? { ownerName: markdownToText(Array.isArray(owner) ? owner[0] : owner) } : {}),
    ...(importance ? { importance } : {}),
  };
}

const SECTION_HEADING = /^#{2,4}[ \t]+(.+?)[ \t]*#*[ \t]*$/;
/** «Бар «Алиби»» ≈ «Бар Алиби», «Общий дом» ≈ «Общий дом (уни)»: same words, quotes and brackets aside. */
const squash = value => String(value).toLocaleLowerCase('ru-RU').replace(/[^\p{L}\p{N} ]+/gu, ' ').replace(/\s+/g, ' ').trim();
const alike = (left, right) => { const a = squash(left); const b = squash(right); return Boolean(a && b) && (a === b || a.includes(b) || b.includes(a)); };
const SAME = (left, right) => String(left).trim().toLocaleLowerCase('ru-RU') === String(right).trim().toLocaleLowerCase('ru-RU');

/** The words of `%% основные: слово, слово %%` lines (what lorebook_builder reads as the keys of an entry). */
function keyWordsOf(text) {
  const words = [];
  for (const match of String(text ?? '').matchAll(/%%\s*основные\s*:([\s\S]*?)%%/gi)) {
    for (const word of match[1].split(/[,\n]/)) {
      const clean = clip(word.replace(/\*|!/g, ''), 60);
      if (clean && !words.some(have => SAME(have, clean))) words.push(clean);
    }
  }
  return words;
}

/**
 * One note → the place and its parts. A `###` heading (levels 2–4) is a part of the place: its own
 * place inside the main one ("Прихожая (Дом Галлагеров)"), found by the words of its `%% основные: … %%` line.
 * The text before the first heading — or the first section when it is named like the note — is the main place.
 * A note with no headings stays one place. Returns [] for non-Markdown files and empty notes.
 * Names of the parts end with the note's name in brackets: "Ванная" is in every house, and a name is
 * unique in a folder.
 */
export function draftsFromMarkdownNote(relativePath, text) {
  const whole = draftFromMarkdown(relativePath, text);
  if (!whole) return [];
  const { body } = readFrontMatter(text);
  const sections = [];
  const preface = [];
  let current = null;
  let inCode = false;
  for (const line of String(body).split(/\r?\n/)) {
    if (/^\s*```/.test(line)) inCode = !inCode;
    const heading = !inCode && SECTION_HEADING.exec(line);
    if (heading && !/^(translate|перевод)\b/i.test(heading[1].replace(/\*/g, ''))) { current = { title: markdownToText(heading[1]), lines: [] }; sections.push(current); continue; }
    if (/^#\s+(translate|перевод)\b/i.test(line)) break; // the English copy lorebook_builder keeps under «# Translate» is not a part of the place
    (current ? current.lines : preface).push(line);
  }
  if (!sections.length) return [whole];
  const mainText = markdownToText(preface.join('\n'));
  let parts = sections;
  let main = { ...whole, description: mainText };
  if (!mainText && alike(sections[0].title, whole.name)) {
    main = { ...whole, description: markdownToText(sections[0].lines.join('\n')), aliases: [...whole.aliases, ...keyWordsOf(sections[0].lines.join('\n'))] };
    parts = sections.slice(1);
  }
  const children = parts.map(part => ({
    folderPath: whole.folderPath,
    name: clip(alike(part.title, whole.name) ? part.title : `${part.title} (${whole.name})`, 120),
    aliases: keyWordsOf(part.lines.join('\n')).slice(0, 12),
    description: markdownToText(part.lines.join('\n')),
    traits: [],
    parentName: whole.name,
    ...(whole.ownerName ? { ownerName: whole.ownerName } : {}),
    ...(whole.importance ? { importance: whole.importance } : {}),
  })).filter(child => child.description);
  if (!main.description && !children.length) return [];
  main.aliases = [...new Set(main.aliases)].slice(0, 12);
  return [main, ...children];
}

/** Many notes at once: [{ path, text }] → drafts, skipping what is not a location note. `split: false` keeps every note whole; `longerThan` (things): only a note longer than that is cut into parts. */
export function draftsFromMarkdownFiles(files, { split = false, longerThan = 0 } = {}) {
  return (files ?? []).flatMap(file => {
    const whole = draftFromMarkdown(file.path, file.text);
    if (!whole) return [];
    // `longerThan`: a thing is cut into parts only when it would not fit into one card.
    if (split && (!longerThan || whole.description.length > longerThan)) return draftsFromMarkdownNote(file.path, file.text);
    return [whole];
  });
}
