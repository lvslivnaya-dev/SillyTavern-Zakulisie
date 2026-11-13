/**
 * Turning outside material into character card drafts for the library (see addCharacterDrafts):
 *   - a SillyTavern lorebook whose character sheets are titled «[ Name ] - Section» (what lorebook_builder writes);
 *   - Markdown questionnaires, e.g. an Obsidian folder picked in the browser (### Section headings; the Russian original is loaded,
 *     the English part under «# Translate» is left to the in-card translation).
 * Pure functions: reading files and books is the caller's job.
 */
import { keyNames } from './name-sources.js';
import { GATE_SECTIONS, splitGateTitle } from './lore-gate.js';
import { markdownToText, readFrontMatter } from './location-import.js';

const MARKDOWN = /\.(md|markdown)$/i;

function clip(value, max) {
  return String(value ?? '').replace(/\s+/g, ' ').trim().slice(0, max);
}

/** Characters of a lorebook a user can pick from: [{ uid: name, name, keys, preview, disabled }]. */
export function listLorebookCharacters(book) {
  const found = new Map();
  for (const entry of Object.values(book?.entries ?? {})) {
    if (entry?.disable) continue;
    const title = splitGateTitle(entry?.comment);
    if (!title || !String(entry.content ?? '').trim()) continue;
    if (!found.has(title.name)) found.set(title.name, []);
    found.get(title.name).push(title.tail);
  }
  return [...found].map(([name, tails]) => ({
    uid: name, name, keys: [], preview: `${tails.length} разд.: ${tails.slice(0, 5).join(', ')}${tails.length > 5 ? '…' : ''}`, disabled: false,
  }));
}

/** Drafts from the lorebook: one per character name; `names` picks some (all when not given). */
export function draftsFromLorebookCharacters(book, names = null) {
  const wanted = names ? new Set(names.map(String)) : null;
  const drafts = new Map();
  for (const entry of Object.values(book?.entries ?? {})) {
    if (entry?.disable) continue;
    const title = splitGateTitle(entry?.comment);
    const text = String(entry?.content ?? '').trim();
    if (!title || !text || (wanted && !wanted.has(title.name))) continue;
    if (!drafts.has(title.name)) drafts.set(title.name, { name: title.name, aliases: [], sections: [] });
    const draft = drafts.get(title.name);
    // The words the entry is found by are how the character is called in the chat.
    for (const key of Array.isArray(entry.key) ? entry.key : []) {
      for (const alias of keyNames(key)) {
        if (!draft.aliases.some(have => have.toLocaleLowerCase('ru-RU') === alias.toLocaleLowerCase('ru-RU'))) draft.aliases.push(alias);
      }
    }
    draft.sections.push({ kind: title.section, title: clip(title.tail, 80), text: markdownToText(text) });
  }
  for (const draft of drafts.values()) {
    draft.aliases = draft.aliases.filter(alias => alias.toLocaleLowerCase('ru-RU') !== draft.name.toLocaleLowerCase('ru-RU')).slice(0, 12);
  }
  return [...drafts.values()];
}

function asList(value) {
  if (Array.isArray(value)) return value.map(item => clip(item, 60)).filter(Boolean);
  return value ? String(value).split(',').map(item => clip(item, 60)).filter(Boolean) : [];
}

/** Questions of the questionnaire left unanswered («- **Имя:** » and nothing after it) are not text. */
function withoutEmptyBullets(text) {
  return String(text ?? '').split(/\r?\n/).filter(line => !/^[\t ]*[-*+][\t ]*\*\*[^*\n]+\*\*[\t ]*:?[\t ]*$/.test(line)).join('\n');
}

const TRANSLATE_HEADING = /^#[ \t]+Translate\b.*$/im;
const SEPARATOR = /^\s*---\s*$/;
const SECTION_HEADING = /^###\s+(.+?)\s*$/;
const ANY_HEADING = /^#{1,2}\s/;

/** Russian part: «### Voice» starts a section → [{ title, lines }]. */
function writtenSections(part) {
  const sections = [];
  let current = null;
  for (const line of part.split(/\r?\n/)) {
    const heading = SECTION_HEADING.exec(line);
    if (heading) { current = { title: clip(heading[1], 80), lines: [] }; sections.push(current); continue; }
    if (SEPARATOR.test(line) || ANY_HEADING.test(line)) { current = null; continue; }
    current?.lines.push(line);
  }
  return sections;
}

/** English part: «[ Satoru Gojo ] - Basic Info» starts a section → { name, sections: [{ tail, kind, lines }] }. */
function translatedSections(part) {
  const sections = [];
  let open = null;
  let name = '';
  for (const line of part.split(/\r?\n/)) {
    const title = splitGateTitle(line);
    if (title) { open = { tail: clip(title.tail, 80), kind: title.section, lines: [] }; sections.push(open); name ||= clip(title.name, 120); continue; }
    if (SEPARATOR.test(line) || ANY_HEADING.test(line)) { open = null; continue; }
    open?.lines.push(line);
  }
  return { name, sections };
}

/** A short fingerprint of a text (FNV-1a, 32 bits, hex): enough to tell «the note changed» from «the note is the same». */
export function hashText(value) {
  let hash = 0x811c9dc5;
  for (const char of String(value ?? '')) {
    hash ^= char.codePointAt(0);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash.toString(16).padStart(8, '0');
}

/**
 * One questionnaire note → one draft, in Russian as written. The note keeps the Russian questionnaire first (headings of level 3,
 * «### Voice»: the sections; text before the first one is the template's hints). The English part under «# Translate» is NOT loaded:
 * the note stays the Russian original, and the card is translated in Kulisy («Перевести на английский») once it has been loaded.
 * Only if a note has no Russian sections at all, its English ones are taken as they are.
 * `relativePath` is the browser's path inside the picked folder: the picked folder itself is dropped, the folders below it become
 * library folders. Front matter may give aliases, keys (how the character is called) and name_en.
 * source = { path (inside the picked folder), hash (of the name and the sections read) } lets the card notice that the note has changed.
 */
export function draftFromQuestionnaire(relativePath, text) {
  const parts = String(relativePath ?? '').split(/[\\/]/).filter(Boolean);
  const file = parts.pop() ?? '';
  if (!MARKDOWN.test(file)) return null;
  const folderPath = parts.slice(1).filter(part => !part.startsWith('.'));
  const { data, body } = readFrontMatter(text);
  const name = clip(data.title || data['название'] || file.replace(MARKDOWN, ''), 120);
  const cleaned = String(body ?? '').replace(/%%[\s\S]*?%%/g, '');
  const cut = cleaned.search(TRANSLATE_HEADING);
  const written = writtenSections(cut >= 0 ? cleaned.slice(0, cut) : cleaned);
  const english = translatedSections(cut >= 0 ? cleaned.slice(cut) : '');
  const clean = lines => markdownToText(withoutEmptyBullets(lines.join('\n')));

  const drafted = written.map(section => ({
    kind: Object.entries(GATE_SECTIONS).find(([, item]) => item.match?.test(section.title))?.[0] ?? 'other',
    title: section.title,
    text: clean(section.lines),
  })).filter(section => section.text);
  const filled = drafted.length ? drafted : english.sections.map(item => ({ kind: item.kind, title: item.tail, text: clean(item.lines) })).filter(section => section.text);
  if (!name || !filled.length) return null;
  const plain = name.replace(/\s*\([^)]*\)\s*$/, '').trim();
  const aliases = [...asList(data.aliases ?? data.alias), ...asList(data.name_en), ...asList(data.keys), ...(english.name ? [english.name] : []), ...(plain && plain !== name ? [plain] : [])];
  const source = { path: [...parts.slice(1), file].join('/'), hash: hashText(`${name}\n${filled.map(section => `${section.title}\n${section.text}`).join('\n\n')}`) };
  return { folderPath, name, aliases, sections: filled, source };
}

/** Many notes at once: [{ path, text }] → drafts, skipping what is not a questionnaire. */
export function draftsFromQuestionnaires(files) {
  return (files ?? []).map(file => draftFromQuestionnaire(file.path, file.text)).filter(Boolean);
}

/**
 * A persona's note (the Obsidian «Person» folder) → a draft of a persona card, in Russian as written. The note is the name on the first
 * line (a nickname in «ёлочках» becomes an alias), then short lines about her (age, role: Public Info), then the paragraph of her looks and
 * the paragraph of her voice; or, if the note has «### …» headings, those are the sections («Внешность» / «Voice» are the looks and the voice).
 * Same source = { path, hash } as for a character, so a changed note is noticed.
 */
export function draftFromPersonaNote(relativePath, text) {
  const parts = String(relativePath ?? '').split(/[\\/]/).filter(Boolean);
  const file = parts.pop() ?? '';
  if (!MARKDOWN.test(file)) return null;
  const folderPath = parts.slice(1).filter(part => !part.startsWith('.'));
  const { data, body } = readFrontMatter(text);
  const cleaned = String(body ?? '').replace(/%%[\s\S]*?%%/g, '');
  const cut = cleaned.search(TRANSLATE_HEADING);
  const lines = (cut >= 0 ? cleaned.slice(0, cut) : cleaned).split(/\r?\n/);

  const kindOf = title => (/^(внешность|visual|looks?)(?![\p{L}\d])/iu.test(title) ? 'visual' : /^(голос|voice|речь)(?![\p{L}\d])/iu.test(title) ? 'voice' : 'other');
  const sections = [];
  let headline = '';
  const headings = lines.some(line => SECTION_HEADING.test(line));
  if (headings) {
    for (const item of writtenSections(lines.join('\n'))) {
      const body = markdownToText(withoutEmptyBullets(item.lines.join('\n')));
      if (body) sections.push({ kind: kindOf(item.title), title: kindOf(item.title) === 'visual' ? 'Visual' : kindOf(item.title) === 'voice' ? 'Voice' : item.title, text: body });
    }
    headline = clip(lines.find(line => line.trim() && !ANY_HEADING.test(line) && !SEPARATOR.test(line)) ?? '', 120);
  } else {
    const blocks = [];
    let current = [];
    for (const raw of lines) {
      if (SEPARATOR.test(raw)) { if (current.length) blocks.push(current); current = []; continue; }
      if (!raw.trim()) { if (current.length) blocks.push(current); current = []; continue; }
      current.push(raw.trim());
    }
    if (current.length) blocks.push(current);
    // The first block is the name and what is said of her at a glance; the next two are the looks and the voice; the rest is public.
    const [head = [], looks, voice, ...rest] = blocks;
    headline = clip(head[0] ?? '', 120);
    const about = head.slice(1).join('\n');
    const text = block => markdownToText((block ?? []).join(' '));
    const extra = [about, ...rest.map(text)].filter(Boolean).join('\n\n');
    if (looks) sections.push({ kind: 'visual', title: 'Visual', text: text(looks) });
    if (voice) sections.push({ kind: 'voice', title: 'Voice', text: text(voice) });
    if (extra) sections.push({ kind: 'other', title: 'Public Info', text: extra });
  }
  const filled = sections.filter(section => section.text);
  // «**Кобаяси Ая**», «Имя: Веспер, Весп, Пера», «Фамилия Имя «кличка»»: the first name is the name, the rest are nicknames.
  const plain = headline.replace(/[*_`]/g, '').replace(/^(имя|name)\s*:\s*/i, '').trim();
  const named = /^(.*?)\s*[«"“]([^»"”]+)[»"”]\s*$/.exec(plain);
  const listed = (named ? named[1] : plain).split(',').map(part => clip(part, 120)).filter(Boolean);
  const name = listed[0] || clip(data.title || data['название'] || file.replace(MARKDOWN, ''), 120);
  if (!name || !filled.length) return null;
  const aliases = [...asList(data.aliases ?? data.alias), ...listed.slice(1), ...(named ? [clip(named[2], 60)] : [])];
  const source = { path: [...parts.slice(1), file].join('/'), hash: hashText(`${name}\n${filled.map(section => `${section.title}\n${section.text}`).join('\n\n')}`) };
  return { folderPath, name, aliases, sections: filled, source, persona: true };
}

/** Many persona notes at once: [{ path, text }] → drafts, skipping what is not a persona note. */
export function draftsFromPersonaNotes(files) {
  return (files ?? []).map(file => draftFromPersonaNote(file.path, file.text)).filter(Boolean);
}
