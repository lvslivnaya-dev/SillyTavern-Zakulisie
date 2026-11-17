import { initPudrenitsa } from './src/pud/start.js';
import {
  applyOperation,
  applyOperations,
  createDefaultState,
  createEntity,
  createOperation,
  distinctKey,
  duplicateCandidates,
  importState,
  matchEntity,
  mergeClashes,
  resolveEntityId,
  relationshipId,
  replayBase,
  rollbackMessage,
  addHeadcanons,
  dropAutoHeadcanons,
  headcanonKey,
  headcanonPairIds,
  isAutoHeadcanons,
  listHeadcanonPairs,
  remapAutoHeadcanons,
  selectHeadcanons,
  updateHeadcanons,
  selectRuntimePrompt,
  buildKnowledgePrompt,
  cleanSecretText,
  anchorFor,
  calendarShortDate,
  clockOf,
  EVENT_KINDS,
  comingEvents,
  eventsWithQuests,
  monthView,
  READY_SYSTEMS,
  makeClock,
  normalizeSystem,
  normalizeSystems,
  systemClimate,
  shortDate,
  buildCalendarPrompt,
  dateOfDay,
  fromTemplate,
  normalizeCalendar,
  normalizeEvent,
  normalizeTemplates,
  BUILTIN_CLIMATES,
  BUILTIN_SCENARIOS,
  addScenario,
  findClimate,
  normalizeClimate,
  normalizeClimates,
  normalizePlan,
  removeScenario,
  scenarioFrom,
  weatherBadge,
  weatherFor,
  weekForecast,
  describeGroups,
  diceCue,
  normalizeDice,
  recordDice,
  rollDice,
  updateDice,
  togglePick,
  viewGroups,
  addName,
  addNameFolder,
  changeNames,
  removeNameFolder,
  updateNameFolder,
  buildNamesPrompt,
  addSong, addSongFolder, importSongs, muteSong, normalizeSongState, normalizeSongs, pinSong, planSongs, recentText, removeSongFolder, removeSongs, unmuteSong, unpinSong, updateSong, updateSongFolder,
  INTIMACY_STAGES, aheadGroups, stageOf, heatLevel, buildQuestsPrompt, cleanShifts, closingLine, closingShifts, currentStep, groupQuests, progressOf, questCue, questId, questsOf, dueText, daysLeft, QUEST_STATUSES,
  currentLocation,
  normalizeNames, normalizeAlias,
  cardNameEntry, updateLibraryCharacter, privateText, stripLatinAliases, normalizePersonaCards, addBond, updateBond, removeBond, selectBonds, buildBondsPrompt, buildPersonaPrompt, findPersonaCard, migratePersonaCards, addFolder, addLibraryCharacter, addAu, removeAu,
  personalPieces,
  setupProgress,
  setupReminderDue,
  setupSteps,
  recognitionForms,
  removeName,
  updateName,
  wordsToFill,
  toTemplate,
  loreSecretEvent,
  secretEntriesOf,
  stripSecretEntries,
  presentIds,
  howKnows,
  isDead,
  dossier,
  pairKey,
  uniqueId,
  buildChroniclePrompt,
  chronicleConfig,
  normalizeChronicle,
  eventsOn,
} from './src/core/index.js';
import { addMediaItem, normalizeMedia, removeMediaItem, updateMediaItem, sceneMoods, suggestMedia } from './src/core/index.js';
import { moodList, normalizeMoods } from './src/pud/core/moods.js';
import { createMediaDock } from './src/ui/media-dock.js';
import { renderMediaPane } from './src/ui/media-pane.js';
import { lookupMediaTitle } from './src/integration/media-title.js';
import {
  armCue, buildDirectionPrompt, cueBadge, cueLabel, normalizeDirection, normalizeFavorites,
  globalPinLeft, markNoteUsed, noteCooldownLeft, normalizeNoteLibrary, pinLeft, pinNote, presenceAfterReply, removeCue, removeNote, replyCountOf, saveNote, silenceCounts, startGeneration, unpinNote,
  editNote, editPin, planEvent,
} from './src/core/direction.js';
import { absOf, describePlan, makePlan, normalizePlans, removePlan } from './src/core/event-plan.js';
import { WEATHER_TEMPLATES, clearWeatherDays, paintDays, paintWeather, templateDays } from './src/core/weather.js';
import { analyzeHistoryBatch, analyzeKnowledge, analyzeMessage, discoverHistoryCharacters } from './src/integration/analyzer.js';
import { selectKnowledgeCandidates } from './src/integration/knowledge-analysis.js';
import { detectConflicts } from './src/integration/conflicts.js';
import { applyBackup, backupFilename, buildBackup, parseBackup, summarizeBackup } from './src/integration/backup.js';
import { extensionApi } from './src/pud/integration/extensions-api.js';
import { folderName } from './src/pud/core/extensions.js';
import { createConsoleLog, formatConsoleReport, looksLikeProblem } from './src/core/console-log.js';
import { startConsoleWatch } from './src/integration/console-watch.js';
import { buildCleanerBackup, cleanerFilename, formatBytes, parseCleanerBackup, removeSettings, restoreSettings, scanSettings } from './src/core/settings-cleaner.js';
import { clearRelationshipPrompt, updateGmPrompt, updateCalendarPrompt, updateCardsPrompt, updateDirectionPrompt, updateChroniclePrompt, updateKnowledgePrompt, updateNamesPrompt, updatePersonaPrompt, updateBondsPrompt, updateQuestsPrompt, updateRelationshipPrompt, updateScenePrompt, updateSongsPrompt } from './src/integration/prompt.js';
import { fillNameForms } from './src/integration/name-forms.js';
import { generateClimate, generateWeatherDays } from './src/integration/weather-generation.js';
import { generateCalendarTemplate, generateHolidays } from './src/integration/calendar-generation.js';
import { buildScenePrompt, looksFit, newlyDropped } from './src/integration/world-prompt.js';
import { createReminders, createWorldCallbacks } from './src/integration/world-actions.js';
import { linkedCards } from './src/integration/location-links.js';
import { linkedItems } from './src/integration/item-links.js';
import { cardLinks, cardNameForms, cardsByEntity, closetsByEntity } from './src/integration/card-links.js';
import { cardedSheetTest, digestFor, planCards, planSheetDrops } from './src/integration/card-prompt.js';
import { translateSections } from './src/integration/card-translate.js';
import { generateCardSections } from './src/integration/card-generate.js';
import { auParsePrompt, parseAuAnswer } from './src/core/au-notes.js';
import { dormantItemIds } from './src/integration/item-tidy.js';
import { aliasOperations, aliasesFromBooks } from './src/integration/name-sources.js';
import { createWardrobeCallbacks, createWardrobeStore } from './src/integration/wardrobe-actions.js';
import { createHoraeCallbacks } from './src/integration/horae-import.js';
import {
  LIBRARY_IMAGE_FOLDER, browseImageFolder, copyImageTo, deleteWardrobeImage, folderStorageStatus, isTreeImage, listInbox, moveTreeImage, prepareInbox,
  setImageFolder, storedImageForModel, fileToDataUrl, shrinkDataUrl, VISION_MAX_SIDE, treeDirOf, uploadToTree, uploadWardrobeImage, imageUrl,
} from './src/integration/wardrobe-images.js';
import { inboxDirectories, newThingFiles, newTreeFiles, placeFromPath, THINGS_DIR, treeDirFor } from './src/integration/wardrobe-inbox.js';
import { libraryDirectories, newLibraryFiles } from './src/integration/library-inbox.js';
import { countImages, moveImages } from './src/integration/image-move.js';
import { TEST_IMAGE, TEST_PROMPT, askAboutImage, listVisionChoices, visionSettings } from './src/integration/vision.js';
import { hideSummarized } from './src/integration/chronicle-run.js';
import { createChronicleRunner } from './src/integration/chronicle-actions.js';
import { getSettings, GM_METADATA_KEY, KULISY_BUILD, SCENE_PROMPT_KEY } from './src/integration/settings.js';
import { ASSISTANTS, CUSTOM_ASSISTANT_ID, DEFAULT_GM_NAME, DEFAULT_GM_PROMPT, GM_AVATAR_MAX, GM_LIMITS, acceptProposal, addMessage, dropLastReply, buildGmPrompt, buildGmRequest, clearTalk, continueTalk, editConclusion, normalizeGm, normalizeGmSettings, parseAddresses, patchCustoms, rejectProposal, removeConclusion, resolveAssistant, setProposal, splitReply, toggleConclusion } from './src/core/gm-assistant.js';
import { createHistoryBatches, rebuildWithoutAutomaticHistory, historyFingerprint, sampleHistory } from './src/integration/history.js';
import { applyAnalysisResult, describeProposedChanges, tempoDelta } from './src/integration/analysis-operations.js';
import { loadLinkedLore, loadGroupLore, generationBooks, analyzeLorebookCharacters, canonKeys, namesMatch } from './src/integration/lorebooks.js';
import { generateGrowthFactors, generatePairGoal, directionPresets, generateTriangleFactors, generateTriangleGoal, generateHeadcanons, matchingKeys } from './src/integration/growth.js';
import { pairTropeFactors, pairTropePace, pairTropes, triangleTropeFactors, triangleTropes, tropeLabel } from './src/integration/tropes.js';
import { getAnalysisTokenUsage } from './src/integration/analyzer.js';
import { onChangeBusy, getBusy, resetBusy, withBusy } from './src/integration/busy.js';
import { clearLog, formatLog, logEvent } from './src/integration/diagnostics.js';
import { AUX_PURPOSES, auxGenerate, fetchAuxModels, listAuxProfiles, routedContext } from './src/integration/llm.js';
import { collectRecords, triangleEdges } from './src/core/records.js';
import { mountExtensionShell, mountWindowButtons } from './src/integration/shell.js';
import { WINDOWS, normalizeLayout, reopenOnLoad, windowOf } from './src/ui/layout.js';
import { mountMessageButtons } from './src/integration/message-buttons.js';
import { mountChatOverlay, extraPanes, extraPaneHooks, mediaSection } from './src/integration/chat-overlay.js';
import { registerWardrobeRooms } from './src/integration/overlay-wardrobe.js';
import { scanAcquaintances } from './src/integration/acquaintance-scan.js';
import { scanLoreSecrets } from './src/integration/secret-scan.js';
import { guessGenders } from './src/integration/genders.js';
import { mentionScorer, mentionedEntities, recentSceneText, semanticScorer } from './src/integration/headcanon-retrieval.js';
import { applyGate, normalizeGate, planGate, worldEntries } from './src/integration/lore-gate.js';
import { autoSecrets, bornAt, duplicateBuckets } from './src/core/secret-tools.js';
import { describeBlocks } from './src/integration/prompt-overview.js';
import { classifyAutoSecrets, composeSecret, foldEvents } from './src/integration/secret-compose.js';
import { openSecretDialog } from './src/integration/secret-dialog.js';
import { mountSelectionChip } from './src/integration/selection-chip.js';
import { DEFAULT_LOCAL_MODEL, LOCAL_MODELS, cosine, embedTexts } from './src/integration/embeddings.js';
import { createChatStorage } from './src/integration/storage.js';
import { createLibraryCallbacks, createLocationLibraryStore, syncChat, syncChatCards } from './src/integration/location-library-actions.js';
import { autoLinkNarratorCards } from './src/integration/card-links.js';
import { wardrobeFocus } from './src/ui/wardrobe-focus.js';
import { personaApi } from './src/pud/integration/personas-api.js';
import { createRelationshipStudio } from './src/ui/studio.js';
import { createRelationshipWidget } from './src/ui/widget.js';
import { relationLines, scaleList, scaleSeries, recentShifts, relationOverview } from './src/pud/core/relgraph.js';
import { icon as studioIcon, ICON_NAMES as STUDIO_ICON_NAMES } from './src/ui/icons.js';

const MESSAGE_EXTRA_KEY = 'kulisyV1';
// Chats analysed by Relationship Engine keep its markers; the migrated state's
// operations point at them, so reconciliation must read them (never write them).
const LEGACY_MESSAGE_EXTRA_KEY = 'relationshipEngineV1';
function messageMarker(message) {
  return message?.extra?.[MESSAGE_EXTRA_KEY] ?? message?.extra?.[LEGACY_MESSAGE_EXTRA_KEY];
}
/** Plain on/off preferences edited as checkboxes in the Studio settings. */
const TOGGLE_SETTINGS = ['sendBonds', 'linkedScales', 'autoCharacterLines', 'confirmPersonaLines', 'sendMemories', 'sendTensions', 'sendFactors', 'sendHeadcanons', 'autoHeadcanons', 'trackKnowledge', 'trackWorld', 'sendScene', 'sendCalendar', 'sendQuests', 'sendCards', 'cardsReplaceLore', 'injectPrompt', 'confirmLargeChanges', 'knowledgeSeparateRequest', 'sendKnowledge', 'sceneChips', 'setupReminder', 'sendGm'];
let controller = null;

function normalizeEmbeddings(config) {
  return {
    mode: ['off', 'local', 'api'].includes(config?.mode) ? config.mode : 'off',
    localModel: LOCAL_MODELS[config?.localModel] ? config.localModel : DEFAULT_LOCAL_MODEL,
    // q4 is gone: its files were bigger than q8, so old "q4" settings become q8.
    dtype: 'q8',
    format: config?.format === 'gemini' ? 'gemini' : 'openai',
    url: String(config?.url ?? '').trim().slice(0, 500),
    key: String(config?.key ?? '').trim().slice(0, 500),
    model: String(config?.model ?? '').trim().slice(0, 200),
    threshold: Math.max(0, Math.min(0.95, Number(config?.threshold) || 0)),
  };
}

function normalizeAux(aux) {
  const mode = ['off', 'profile', 'custom'].includes(aux?.mode) ? aux.mode : 'off';
  return {
    mode,
    profileId: String(aux?.profileId ?? '').slice(0, 200),
    url: String(aux?.url ?? '').trim().slice(0, 500),
    key: String(aux?.key ?? '').trim().slice(0, 500),
    model: String(aux?.model ?? '').trim().slice(0, 200),
    maxTokens: Math.max(256, Math.min(32000, Math.round(Number(aux?.maxTokens)) || 4096)),
    fallbackToMain: Boolean(aux?.fallbackToMain),
    purposes: Object.fromEntries(Object.keys(AUX_PURPOSES).map(key => [key, aux?.purposes?.[key] !== false])),
  };
}

/** SillyTavern popups render their text as HTML. */
const SLIP_LABELS = Object.freeze({ outfit: 'одежда', item: 'предмет', time: 'время', place: 'место', looks: 'внешность' });

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);
}

async function initKulisy() {
  if (controller) return controller;
  const context = SillyTavern.getContext();
  const settings = getSettings(context);
  // State of the folder «Гардероб» (see refreshInbox); declared early: the snapshot reads it.
  let inboxInfo = { available: false, count: 0, places: [], things: 0, reason: '' };
  let inboxPrepared = false;
  // The same for the folder «Библиотека» (library-inbox.js): its folders follow the library's, so they are laid out again on every check.
  let libraryInboxInfo = { available: false, count: 0, reason: '' };
  let inboxChecking = null;
  // Places kept across chats (folders like a gallery); see location-library-actions.js.
  // A change to the library or the wardrobe redraws the Studio once (after the current step),
  // so a saved card or place shows as saved, not as it was.
  let redrawSoon = false;
  const storeChanged = () => {
    if (redrawSoon) return;
    redrawSoon = true;
    queueMicrotask(() => { redrawSoon = false; try { notify(); } catch (error) { console.error('[Kulisy] Redraw after a store change failed.', error); } });
  };
  // A card edited in the library changes what the narrator is sent: the prompt is rebuilt too.
  let promptSoon = false;
  // the persona window redraws its list when the library changes (a new portrait of a card, a renamed card)
  const libraryListeners = new Set();
  const sceneListeners = new Set();
  // The little player of «Медиа → Плеер» hangs on the page itself, so the music goes on while windows come and go.
  const mediaDock = createMediaDock(document);
  const locationLibrary = createLocationLibraryStore({
    settings: () => settings,
    save: () => context.saveSettingsDebounced(),
    onChange: () => {
      storeChanged();
      for (const listener of libraryListeners) { try { listener(); } catch (error) { console.error('[Kulisy] A library listener failed.', error); } }
      if (promptSoon) return;
      promptSoon = true;
      queueMicrotask(() => {
        promptSoon = false;
        try { refreshPrompt(); } catch (error) { console.error('[Kulisy] Prompt refresh after a library change failed.', error); }
      });
    },
  });
  const wardrobeStore = createWardrobeStore({ settings: () => settings, save: () => context.saveSettingsDebounced(), onChange: storeChanged });
  // Corrections after a slip, sent with the next reply only.
  const reminders = createReminders();
  const storage = createChatStorage(() => SillyTavern.getContext(), createDefaultState, importState);
  const listeners = [];
  const subscribers = new Set();
  let state = storage.load();
  let studio;
  let widget;
  let unmountShell = () => {};
  let analysisQueue = Promise.resolve();
  let chatEpoch = 0;
  let historyQueued = false;
  const busy = getBusy();
  // How many answers in a row came back without the chronicler's part (see noteChronicler).
  // Declared up here: uiState() reads it, and the Studio asks for uiState() while init runs.
  const chroniclerHealth = { silent: 0, lastError: '', warned: false };
  const unsubscribeBusy = onChangeBusy(next => {
    Object.assign(busy, next);
    notify();
  });
  Object.assign(busy, getBusy());

  function uiState() {
    const persona = state.ui?.personaId && state.entities[state.ui.personaId] ? state.ui.personaId : '';
    const tavernList = tavernPersonas();
    const chatAvatar = personaAvatarForChat();
    const personaEntity = persona ? state.entities[persona] : null;
    const boundPersonaName = personaEntity?.name ?? '';
    const chatPersona = chatAvatar ? (tavernList.find(item => item.avatarId === chatAvatar)?.name ?? '') : '';
    return {
      ...state,
      headcanonPairs: listHeadcanonPairs(state),
      sceneHeadcanons: [...sceneHeadcanons],
      headcanonInfo: { ...headcanonInfo },
      pairs: Object.values(state.relationships).filter(relation => relation.from !== persona),
      widgetPairs: Object.values(state.relationships)
        .filter(relation => relation.from !== persona)
        .filter(relation => !(state.ui?.hiddenRelationshipIds ?? []).includes(relation.id)),
      personaId: persona,
      tavernPersonas: tavernList,
      chatPersonaName: chatPersona,
      personaBoundName: boundPersonaName,
      personaAvatar: boundPersonaAvatar(),
      personaPrivate: personaPrivateText(),
      personaCards: normalizePersonaCards(settings.personaCards),
      personaCardId: personaCardNow()?.id ?? '',
      personaCardChosen: Boolean(state.ui?.personaCard),
      personaTavernDescription: tavernPersonaDescription(),
      bondsNow: selectBonds(locationLibrary.get().bonds, { presentCardIds: presentCardIdsNow(), activeAu: state.ui?.au ?? [], knownCardIds: locationLibrary.get().characters.map(card => card.id) }).map(bond => bond.id),
      bondsChat: bondsChatInfo(),
      personaAu: state.ui?.au ?? [],
      gm: assistantView(),
      personaMismatch: Boolean(persona && chatPersona && boundPersonaName
        && boundPersonaName.toLocaleLowerCase('ru-RU') !== chatPersona.toLocaleLowerCase('ru-RU')),
      lorebooks: { available: SillyTavern.getContext().getWorldInfoNames?.() ?? [], selected: state.ui?.linkedLorebooks ?? [], cardWorlds: cardWorldNames(), tavern: tavernBooks, status: 'Этот список — книги, которые читает само Закулисье (анализ, поиск персонажей, секреты). Модели записи отправляет таверна, и только из книг, подключённых в ней самой: к карточке, персоне, чату или глобально. Исходные файлы не изменяются.' },
      settings: {
        autoTrack: settings.autoAnalyze, widgetEnabled: settings.widget.visible, studioMulti: settings.studioMulti === true, railSide: settings.railSide === 'right' ? 'right' : 'left',
        maxPromptCharacters: settings.maxPromptCharacters,
        headcanonLimit: settings.headcanonLimit,
        knowledgeCandidates: settings.knowledgeCandidates,
        knowledgePromptCharacters: settings.knowledgePromptCharacters,
        scenePromptCharacters: settings.scenePromptCharacters,
        cardsPromptCharacters: settings.cardsPromptCharacters,
        looksCardCharacters: settings.looksCardCharacters,
        looksCharacterCharacters: settings.looksCharacterCharacters,
        itemsDormantAfter: settings.itemsDormantAfter ?? 40,
        directorSilenceAfter: settings.director?.silenceAfter ?? 4,
        directorHotkeys: settings.director?.hotkeys !== false,
        imageStorage: settings.imageStorage === 'folder' ? 'folder' : 'server',
        largeChangeThreshold: settings.largeChangeThreshold,
        chronicle: structuredClone(settings.chronicle ?? {}),
        aux: structuredClone(settings.aux),
        embeddings: structuredClone(settings.embeddings),
        loreGate: normalizeGate(settings.loreGate),
        ...Object.fromEntries(TOGGLE_SETTINGS.map(key => [key, settings[key] !== false])),
      },
      widget: {
        expanded: settings.widget.expanded,
        position: { x: settings.widget.x, y: settings.widget.y },
      },
      loreGateReport: gateReport,
      promptPreview: buildInjectionText(state, persona) || 'Пока пусто: нет связей с ненулевыми показателями.',
      promptTokens,
      knowledgePreview: buildKnowledgeText(state) || '',
      leaks: openLeaks(),
      slips: openSlips(),
      factorHits: factorHits(),
      tavernCharacters: (() => { try { return (SillyTavern.getContext().characters ?? []).filter(item => item?.avatar).map(item => ({ avatar: String(item.avatar), name: String(item.name ?? item.avatar) })); } catch { return []; } })(),
      narratorNow: currentNarrator(),
      calendar: calendarView(state),
      calendarToday: dateOfDay(calendarOf(state), state.world?.clock?.day ?? 0),
      calendarSystems: calendarLibrary(),
      calendarTemplates: normalizeTemplates(settings.calendarTemplates),
      names: normalizeNames(settings.nameLibrary),
      songs: normalizeSongs(settings.songLibrary),
      media: normalizeMedia(settings.mediaLibrary),
      mediaNow: mediaDock.current()?.id ?? '',
      songsChat: normalizeSongState(state.ui?.songs, { songIds: normalizeSongs(settings.songLibrary).songs.map(song => song.id) }),
      songsReport,
      songsTokens,
      dice: { rollMode: normalizeDice(settings.intimacyDice).rollMode, avoidRepeat: normalizeDice(settings.intimacyDice).avoidRepeat, autoRoll: normalizeDice(settings.intimacyDice).autoRoll, groups: describeGroups(settings.intimacyDice), historyCount: normalizeDice(settings.intimacyDice).history.length },
      weather: currentWeather(state),
      weatherSet: state.world?.weather ?? null,
      weatherPlan: normalizePlan(state.ui?.weatherPlan),
      weatherClimates: [...BUILTIN_CLIMATES, ...normalizeClimates(settings.weatherClimates)],
      weatherScenarios: BUILTIN_SCENARIOS,
      weatherWeek: weekForecast(state, { plan: state.ui?.weatherPlan, climates: settings.weatherClimates, dateOfDay: day => dateOfDay(calendarOf(state), day), ...weatherCalendar(state) }),
      weatherDated: Boolean(dateOfDay(calendarOf(state), state.world?.clock?.day ?? 0)),
      quests: questsOf(state),
      questToday: state.world?.clock?.day ?? 0,
      questSecretsHidden: settings.sendQuests === false,
      namesChatOff: Boolean(state.ui?.namesOff),
      setup: setupSnapshot(),
      cardGenders: cardGenders(),
      namesTokens,
      calendarTokens,
      reveals: openReveals(),
      promptBlocks: describeBlocks({
        parts: promptParts,
        tokens: { chronicle: chronicleTokens, scene: sceneTokens, calendar: calendarTokens, knowledge: knowledgeTokens, cards: cardsTokens, persona: personaTokens, bonds: bondsTokens, names: namesTokens, quests: questsTokens, gm: gmTokens, songs: songsTokens, relationships: promptTokens, direction: directionTokens },
        enabled: settings.enabled ? {
          chronicle: chronicleConfig(settings.chronicle).enabled ? true : 'Хроника выключена: сводки не пишутся и не уходят модели.',
          scene: settings.sendScene !== false && settings.trackWorld !== false ? true : 'Выключено: «Сцена в промпт» или слежение за миром.',
          calendar: settings.sendCalendar !== false ? true : 'Выключено: «Календарь в промпт».',
          knowledge: settings.sendKnowledge !== false ? true : 'Выключено: «Знания в промпт».',
          cards: settings.sendCards !== false ? true : 'Выключено: «Карточки в промпт» (Настройки → Знания и сцена).',
          bonds: settings.sendBonds !== false ? true : 'Выключено: «Записи» на странице «Отношения → Записи» (Настройки → Знания и сцена).',
          persona: normalizePersonaCards(settings.personaCards).enabled ? true : 'Выключено: «Отправлять карточку персоны» (Сцена → Персона).',
          names: state.ui?.namesOff ? 'Выключено в этом чате (Мир → Имена).' : normalizeNames(settings.nameLibrary).enabled ? true : 'Выключено: переключатель «Отправлять имена» (Мир → Имена).',
          quests: settings.sendQuests !== false ? true : 'Выключено: «Квесты в промпт» (Настройки → Знания и сцена).',
          gm: settings.sendGm !== false ? true : 'Выключено: «Отправлять договорённости с ассистентом» (Настройки).',
          songs: normalizeSongs(settings.songLibrary).enabled ? true : 'Выключено: переключатель «Отправлять песни» (Мир → Песни).',
          relationships: settings.injectPrompt ? true : 'Выключено: отправка отношений.',
        } : Object.fromEntries(['chronicle', 'scene', 'calendar', 'knowledge', 'cards', 'persona', 'names', 'quests', 'gm', 'songs', 'relationships', 'direction'].map(id => [id, 'Закулисье выключено.'])),
      }),
      tidy: { autoSecrets: autoSecrets(state).length, foldable: duplicateBuckets(state).reduce((sum, bucket) => sum + bucket.events.length, 0) },
      dossiers: Object.fromEntries(Object.keys(state.entities).map(id => [id, dossier(state, id)])),
      knowledgeTokens,
      chronicleTokens,
      sceneTokens,
      scenePreview: buildSceneText(state) || '',
      locationLibrary: locationLibrary.get(),
      linkedLocationIds: [...linkedCards(state).keys()],
      linkedItemIds: [...linkedItems(state).keys()],
      linkedCharacterIds: [...cardLinks(state).keys()],
      cardByEntity: Object.fromEntries([...cardsByEntity(state, locationLibrary.get())].map(([entityId, card]) => [entityId, { id: card.id, name: card.name }])),
      cardsReport,
      cardsTokens,
      chatKey: String(SillyTavern.getContext().getCurrentChatId?.() ?? ''),
      wardrobe: wardrobeStore.get(),
      inbox: { ...inboxInfo },
      libraryInbox: { ...libraryInboxInfo },
      looksFit: looksStatus(state),
      dormantItemIds: shadeItems(state),
      duplicates: cachedDuplicates(state).map(pair => ({ ...pair, fromName: state.entities[pair.fromId]?.name ?? '', intoName: state.entities[pair.intoId]?.name ?? '' })),
      scaleLabels: Object.fromEntries((state.config?.scales ?? []).map(scale => [scale.id, scale.label])),
      visionChoices: listVisionChoices(SillyTavern.getContext(), settings.wardrobeVision),
      personaLookModel: personaLookValue(),
      analysisTokens: getAnalysisTokenUsage(),
      chroniclerSilent: chroniclerHealth.silent >= 2 ? { count: chroniclerHealth.silent, reason: chroniclerHealth.lastError } : null,
      modelBusy: busy.busy,
      modelBusyLabel: busy.label,
    };
  }

  function buildPromptPreview(persona) {
    if (!settings.enabled || !settings.injectPrompt) return 'Инъекция отключена настройками.';
    const text = buildInjectionText(state, persona);
    return text || 'Пока пусто: нет связей с ненулевыми показателями.';
  }

  const store = {
    getState: uiState,
    subscribe(listener) { subscribers.add(listener); return () => subscribers.delete(listener); },
  };

  // Set once the chat overlay is mounted (end of init); a no-op before that.
  let refreshChatOverlay = () => {};

  // Twin characters are found by comparing every name with every other: on each redraw that was the heaviest thing Kulisy did
  // (the panel lagged on every reply). The answer only changes with the names, the lines, the history or the «different people» marks.
  let duplicatesMemo = { key: '', value: [] };
  function cachedDuplicates(source) {
    const key = JSON.stringify([
      Object.values(source.entities ?? {}).map(entity => [entity.id, entity.name, entity.aliases]),
      source.ui?.distinctPairs ?? [], Object.keys(source.relationships ?? {}).length, (source.operations ?? []).length,
    ]);
    if (duplicatesMemo.key !== key) duplicatesMemo = { key, value: duplicateCandidates(source) };
    return duplicatesMemo.value;
  }

  function notify() {
    // The snapshot is the heaviest thing Kulisy builds: once for all, and not at all while nobody looks (the panel closed, the widget hidden).
    let shared;
    for (const subscriber of subscribers) {
      try {
        if (subscriber.wants && !subscriber.wants()) continue;
        subscriber(shared ??= uiState());
      } catch (error) { console.error('[Kulisy] UI subscriber failed.', error); }
    }
    refreshChatOverlay();
    scheduleLooksRoom();
    emitAssistant();
    for (const listener of sceneListeners) { try { listener(); } catch (error) { console.error('[Kulisy] A scene listener failed.', error); } }
  }

  /** The check of the clothes' room builds the scene text: once for a burst of changes, not on each of them. */
  let looksTimer = 0;
  function scheduleLooksRoom() {
    if (looksTimer) return;
    looksTimer = setTimeout(() => { looksTimer = 0; warnLooksRoom(); }, 600);
  }

  /**
   * A toast when wardrobe descriptions of someone on stage stop fitting the scene:
   * once, and again only after they fitted in between. Per chat; off in the settings.
   */
  let looksRoom = { chat: null, dropped: new Set() };
  function warnLooksRoom() {
    try {
      const chat = String(SillyTavern.getContext().getCurrentChatId?.() ?? '');
      if (looksRoom.chat !== chat) looksRoom = { chat, dropped: new Set() };
      const fit = looksStatus(state);
      const { dropped, fresh } = newlyDropped(looksRoom.dropped, fit);
      looksRoom.dropped = dropped;
      if (!fresh.length || settings.looksWarning === false) return;
      const names = fresh.map(id => state.entities[id]?.name ?? id).join(', ');
      const now = Number(settings.scenePromptCharacters) || 1500;
      const enough = fit.need ? `Хватит объёма сцены ${fit.need} (сейчас ${now}).` : `Даже 6000 мало (сейчас ${now}): сократите описания.`;
      globalThis.toastr?.warning?.(`Описания одежды не влезли в сцену: ${names}. Модель знает только, во что одеты. ${enough} Нажмите, чтобы поднять объём сцены.`, 'Закулисье', {
        timeOut: 12000,
        extendedTimeOut: 6000,
        onclick: () => { try { studio?.openSettings('scene', { focus: 'Объём сцены' }); } catch (error) { console.error('[Kulisy] Could not open the scene settings.', error); } },
      });
    } catch (error) {
      console.warn('[Kulisy] The scene-room check failed.', error);
    }
  }

  async function commit(next, immediate = true) {
    const before = state;
    state = importState(next);
    try {
      await storage.save(state);
    } catch (error) {
      logEvent('error', 'Не удалось сохранить отношения в чат', error);
      throw error;
    }
    refreshPrompt();
    notify();
    autoDice(before, state).catch(error => console.error('[Kulisy] Auto dice failed.', error));
    return state;
  }

  let promptTokens = 0;
  let knowledgeTokens = 0;
  let namesTokens = 0;
  let questsTokens = 0;
  let gmTokens = 0;
  let gmBusy = false; // the assistant is answering
  // Songs of the library that are in the scene (core/song-library.js): the last decision, for the drawer and the page.
  let songsTokens = 0;
  let songsReport = null;
  let cardsTokens = 0;
  let personaTokens = 0;
  let bondsTokens = 0;
  // Character cards (card-prompt.js): when each character's «entrance» sections last went out, and the last decision for the page.
  const cardTracker = new Map();
  let cardsReport = null;
  let chronicleTokens = 0;
  let sceneTokens = 0;
  let calendarTokens = 0;

  // An estimate on purpose: SillyTavern's own getTokenCount asks its server for a count with a SYNCHRONOUS request
  // (once per text it has not seen), and refreshPrompt counts a dozen blocks — that froze the page on every post.
  function countTokens(text) {
    return Math.ceil(String(text ?? '').length / 3.5);
  }

  function buildInjectionText(targetState, persona) {
    if (!settings.enabled || !settings.injectPrompt) return '';
    // The budget is applied per section inside selectRuntimePrompt; slicing the finished
    // text used to drop every memory, tension and stranger rule at the end.
    const sceneIds = [...presentIds(targetState), ...mentionedEntities(targetState, recentSceneText(SillyTavern.getContext().chat, 2, 3000))];
    return selectRuntimePrompt({ ...targetState, ui: { ...targetState.ui, personaId: persona } }, {
      sceneIds,
      memoryLimit: 2,
      tensionLimit: 2,
      includeMemories: settings.sendMemories !== false,
      includeTensions: settings.sendTensions !== false,
      includeFactors: settings.sendFactors !== false,
      maxCharacters: Number(settings.maxPromptCharacters) || 4000,
    }) + (settings.sendHeadcanons !== false && sceneHeadcanons.length ? `\n${sceneHeadcanons.join('\n')}` : '');
  }

  /** { entityId: 'male' | 'female' } from the cards the characters (and the persona) are tied to. */
  function cardGenders() {
    const library = locationLibrary.get().characters ?? [];
    const result = {};
    for (const [entityId, cardId] of cardOfEntity()) {
      const gender = library.find(card => card.id === cardId)?.gender;
      if (gender) result[entityId] = gender;
    }
    return result;
  }

  /**
   * Who knows what, for the coming reply: on stage, plus anyone the last two
   * messages mention (they are about to come on stage, or are talked about).
   */
  function buildKnowledgeText(targetState, chat = SillyTavern.getContext().chat) {
    if (!settings.enabled || settings.sendKnowledge === false) return '';
    const castIds = [...presentIds(targetState), ...mentionedEntities(targetState, recentSceneText(chat, 2, 3000))];
    return buildKnowledgePrompt(targetState, {
      castIds,
      genders: cardGenders(),
      maxCharacters: Math.max(300, Math.min(8000, Number(settings.knowledgePromptCharacters) || 2000)),
    });
  }

  function assertHeadcanonPair(key) {
    const ids = headcanonPairIds(key);
    if (ids.length < 2 || ids.some(id => !state.entities[id])) throw new Error('Персонаж не найден.');
  }

  function isAutoHeadcanonsFor(key) {
    return isAutoHeadcanons(state, key);
  }

  async function commitHeadcanons(headcanons) {
    const next = structuredClone(state);
    next.ui ??= {};
    next.ui.headcanons = headcanons;
    await commit(next, true);
    await prepareHeadcanons();
    refreshPrompt();
  }

  // Headcanons picked for the current scene; refreshed before every generation
  // (generate interceptor) and when the chat or the headcanons change.
  let sceneHeadcanons = [];
  // «Суфлёр лорбуков»: when each character's «entrance» sections last went out, and the last decision for the settings page.
  const gateTracker = new Map();
  let gateReport = null;
  // Titles of the lorebook notes (places, rules, items…) of the last prompt: what the chronicler may pick from.
  let gateCatalog = [];
  const gateLoreList = () => {
    const gate = normalizeGate(settings.loreGate);
    return settings.enabled && gate.enabled && gate.world === 'chronicler' ? gateCatalog : [];
  };
  // Books SillyTavern itself loaded for the last prompt of this chat (null until it builds one).
  // A book linked to Kulisy only is read by the analyzer, but the model never gets it.
  let tavernBooks = null;
  // The blocks as they were last handed to SillyTavern, for «Что получает модель».
  const promptParts = { chronicle: '', scene: '', calendar: '', knowledge: '', cards: '', persona: '', bonds: '', names: '', quests: '', gm: '', songs: '', relationships: '', direction: '' };
  let directionTokens = 0;
  /** Whoever a stage cue is bringing in counts as on stage for this reply. */
  function calledIds() {
    return directionState().cues.flatMap(cue => (cue.kind === 'call' || cue.kind === 'enter' ? [cue.entityId] : cue.kind === 'scene' ? (cue.castIds ?? []) : []));
  }
  /** The user's fresh post and the reply before it, apart: a name in the post weighs more than one in the reply. A reply being swiped is not counted. */
  function gateTexts(chat) {
    const messages = (chat ?? []).filter(message => message && !message.is_system);
    const last = messages.findLastIndex(message => message.is_user);
    if (last < 0) return { namedText: '', replyText: String(messages.at(-1)?.mes ?? '') };
    const before = messages.slice(0, last).findLast(message => !message.is_user);
    return { namedText: String(messages[last].mes ?? ''), replyText: String(before?.mes ?? '') };
  }
  // Why the preview shows what it shows: how many are on, how many fit the scene, how they were picked.
  let headcanonInfo = { enabled: 0, picked: 0, method: 'mentions', disabled: false };

  async function prepareHeadcanons(chat = SillyTavern.getContext().chat) {
    const enabled = listHeadcanonPairs(state).reduce((sum, pair) => sum + pair.enabledCount, 0);
    try {
      if (settings.sendHeadcanons === false || !enabled) {
        sceneHeadcanons = [];
        headcanonInfo = { enabled, picked: 0, method: 'mentions', disabled: settings.sendHeadcanons === false };
        return;
      }
      const sceneText = recentSceneText(chat);
      const { score, method, note } = await headcanonScorer(sceneText);
      // A pinned headcanon goes out whenever everyone of its pair is on stage or named in the last posts.
      const inScene = new Set([...presentIds(state), ...mentionedEntities(state, sceneText)]);
      sceneHeadcanons = selectHeadcanons(state, {
        score,
        limit: Math.max(1, Math.min(30, Number(settings.headcanonLimit) || 8)),
        maxCharacters: 1500,
        pinnedFor: pair => pair.ids.every(id => inScene.has(id)),
      });
      headcanonInfo = { enabled, picked: sceneHeadcanons.length, method, disabled: false, ...(note ? { note } : {}) };
    } catch (error) {
      logEvent('error', 'Не удалось отобрать хедканоны для сцены', error);
      sceneHeadcanons = [];
      headcanonInfo = { enabled, picked: 0, method: 'mentions', disabled: false, error: error?.message ?? String(error) };
    }
  }

  const EMBEDDING_WAIT_MS = 8000;

  /**
   * Semantic ranking when embeddings are on; mentions otherwise. A slow first
   * model download must not hold the generation: after EMBEDDING_WAIT_MS this
   * generation falls back to mentions while the vectors keep loading.
   */
  async function headcanonScorer(sceneText) {
    const config = settings.embeddings ?? {};
    if (config.mode !== 'local' && config.mode !== 'api') return { score: mentionScorer(state, sceneText), method: 'mentions' };
    const items = listHeadcanonPairs(state).flatMap(pair => pair.items.filter(item => item.enabled !== false));
    const work = (async () => {
      const [sceneVector] = await embedTexts(config, [sceneText.slice(-1500) || ' '], 'query');
      const vectors = await embedTexts(config, items.map(item => item.text), 'passage');
      const byId = new Map(items.map((item, index) => [item.id, vectors[index]]));
      return item => (byId.has(item.id) ? cosine(sceneVector, byId.get(item.id)) : null);
    })();
    work.catch(error => logEvent('warn', 'Смысловой поиск хедканонов не сработал', error));
    try {
      const similarity = await Promise.race([work, new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), EMBEDDING_WAIT_MS))]);
      return { score: semanticScorer(state, sceneText, similarity, Number(config.threshold) || 0), method: 'semantic' };
    } catch (error) {
      const note = error?.message === 'timeout'
        ? 'Модель эмбеддингов ещё загружается — на эту генерацию отбор по упоминаниям.'
        : `Смысловой поиск недоступен (${error?.message ?? error}) — отбор по упоминаниям.`;
      return { score: mentionScorer(state, sceneText), method: 'mentions', note };
    }
  }

  /**
   * Events the chronicler is shown for one reply. When there are more than fit,
   * embeddings (if on) rank them by meaning against the reply; otherwise secrets
   * first, then the newest. The model still decides who learned what — similar
   * words say nothing about whether a secret was told or kept.
   */
  async function knowledgeCandidates(sourceState, text) {
    const limit = Math.max(1, Math.min(40, Math.round(Number(settings.knowledgeCandidates)) || 15));
    const config = settings.embeddings ?? {};
    const events = (sourceState.knowledge?.events ?? []).filter(event => !event.disabled);
    let similarity = null;
    if ((config.mode === 'local' || config.mode === 'api') && events.length > limit) {
      const work = (async () => {
        const [query] = await embedTexts(config, [String(text).slice(-1500) || ' '], 'query');
        const vectors = await embedTexts(config, events.map(event => event.text), 'passage');
        return new Map(events.map((event, index) => [event.id, cosine(query, vectors[index])]));
      })();
      work.catch(error => logEvent('warn', 'Смысловой отбор событий для летописца не сработал', error));
      try {
        similarity = await Promise.race([work, new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), EMBEDDING_WAIT_MS))]);
      } catch {
        similarity = null; // fall back to secrets-then-newest for this reply
      }
    }
    return selectKnowledgeCandidates(sourceState, text, { limit, similarity });
  }

  /** Time, place, and what the characters on stage wear, feel and hold, for the coming reply. */
  /** Ordinary things nobody mentioned for a while (item-tidy.js): kept, not sent. */
  function shadeItems(targetState) {
    try { return dormantItemIds(targetState, SillyTavern.getContext().chat, { after: settings.itemsDormantAfter ?? 40 }); }
    catch (error) { logEvent('warn', 'Не удалось отобрать давно забытые вещи', error); return []; }
  }

  function sceneOptions(targetState) {
    return {
      library: locationLibrary.get(),
      wardrobe: wardrobeStore.get(),
      skipItemIds: shadeItems(targetState),
      reminders: reminders.list(),
      weather: settings.sendWeather === false ? null : currentWeather(targetState),
      maxCharacters: Math.max(300, Math.min(6000, Number(settings.scenePromptCharacters) || 1500)),
      looksLimits: { card: settings.looksCardCharacters, character: settings.looksCharacterCharacters },
    };
  }

  function buildSceneText(targetState) {
    if (!settings.enabled || settings.sendScene === false || settings.trackWorld === false) return '';
    return buildScenePrompt(targetState, sceneOptions(targetState));
  }

  /** Whether worn cards' descriptions reach the narrator (for the wardrobe and the dossier). */
  function looksStatus(targetState) {
    try {
      if (!settings.enabled || settings.sendScene === false || settings.trackWorld === false) return { off: true };
      return looksFit(targetState, sceneOptions(targetState));
    } catch (error) {
      logEvent('warn', 'Не удалось проверить, влезают ли описания одежды', error);
      return {};
    }
  }

  /** The chat's stage cues (core/direction.js), tidy. */
  function directionState(source = state) {
    return normalizeDirection(source.ui?.direction, Object.keys(source.entities ?? {}));
  }

  async function saveDirection(next) {
    await commit({ ...state, ui: { ...state.ui, direction: next } }, true);
  }

  function chronicleState() {
    return normalizeChronicle(state.ui?.chronicle);
  }

  async function saveChronicle(next) {
    await commit({ ...state, ui: { ...state.ui, chronicle: next } }, true);
    return chronicleState();
  }

  function refreshPrompt() {
    const ctx = SillyTavern.getContext();
    // The chronicle has its own switch and its own place (before the chat history).
    const chronicleSettings = chronicleConfig(settings.chronicle);
    const chronicleBlock = settings.enabled && chronicleSettings.enabled
      ? buildChroniclePrompt(chronicleState(), { maxCharacters: chronicleSettings.maxPromptCharacters }) : '';
    chronicleTokens = chronicleBlock ? countTokens(chronicleBlock) : 0;
    promptParts.chronicle = chronicleBlock;
    updateChroniclePrompt(ctx, chronicleBlock);
    const sceneBlock = buildSceneText(state);
    sceneTokens = sceneBlock ? countTokens(sceneBlock) : 0;
    promptParts.scene = sceneBlock;
    updateScenePrompt(ctx, sceneBlock);
    const calendarBlock = settings.enabled && settings.sendCalendar !== false
      ? buildCalendarPrompt({ ...state, ui: { ...state.ui, calendar: { ...(state.ui?.calendar ?? {}), events: [...(state.ui?.calendar?.events ?? []), ...birthdayEvents()] } } }, { flashback: Boolean(state.world?.clock?.flashback) }) : '';
    calendarTokens = calendarBlock ? countTokens(calendarBlock) : 0;
    promptParts.calendar = calendarBlock;
    updateCalendarPrompt(ctx, calendarBlock);
    // Stage directions («пнуть»): only the cues in force for this reply.
    promptParts.direction = '';
    try {
      promptParts.direction = settings.enabled ? buildDirectionPrompt(state, directionState(), { presentIds: presentIds(state) }) : '';
      updateDirectionPrompt(ctx, promptParts.direction);
    } catch (error) { console.error('[Kulisy] Direction prompt failed.', error); }
    directionTokens = promptParts.direction ? countTokens(promptParts.direction) : 0;
    // Knowledge has its own switch, so it is sent even with the relationship block off.
    const knowledge = buildKnowledgeText(state);
    knowledgeTokens = knowledge ? countTokens(knowledge) : 0;
    promptParts.knowledge = knowledge;
    updateKnowledgePrompt(ctx, knowledge);
    // Sheets of the library character cards attached to the characters in play (the lorebook prompter's rules decide which sections).
    let cardsBlock = '';
    cardsReport = null;
    try {
      if (settings.enabled && settings.sendCards !== false) {
        const planned = planCards({
          state, library: locationLibrary.get(), config: settings.loreGate,
          presentIds: [...presentIds(state), ...calledIds()],
          mode: state.world?.clock?.mode ?? 'calm',
          turn: (ctx.chat ?? []).filter(message => message?.is_user && !message.is_system).length,
          tracker: cardTracker,
          extraNames: cardNameForms(state, locationLibrary.get(), normalizeNames(settings.nameLibrary), recognitionForms),
          maxCharacters: Math.max(500, Math.min(60000, Number(settings.cardsPromptCharacters) || 12000)),
          ...gateTexts(ctx.chat),
        });
        cardsBlock = planned.block;
        cardsReport = planned.report;
      }
    } catch (error) { console.error('[Kulisy] Character cards prompt failed.', error); }
    cardsTokens = cardsBlock ? countTokens(cardsBlock) : 0;
    promptParts.cards = cardsBlock;
    updateCardsPrompt(ctx, cardsBlock);
    // The persona: what shows of her and the records about her that fit who is on stage and the AU that are on.
    let personaBlock = '';
    try {
      const found = personaCardNow();
      if (settings.enabled && found && normalizePersonaCards(settings.personaCards).enabled) {
        const personaId = state.ui?.personaId || '';
        const present = presentIds(state).filter(id => id !== personaId).flatMap(id => [state.entities[id]?.name, ...(state.entities[id]?.aliases ?? [])]);
        const byEntity = cardsByEntity(state, locationLibrary.get());
        const presentCardIds = presentIds(state).filter(id => id !== personaId).map(id => byEntity.get(id)?.id).filter(Boolean);
        const cardNames = new Map((locationLibrary.get().characters ?? []).map(card => [card.id, card.name]));
        personaBlock = buildPersonaPrompt(found, { present, activeAu: state.ui?.au ?? [], presentCardIds, cardNames });
      }
    } catch (error) { console.error('[Kulisy] Persona prompt failed.', error); }
    personaTokens = personaBlock ? countTokens(personaBlock) : 0;
    promptParts.persona = personaBlock;
    updatePersonaPrompt(ctx, personaBlock);
    // Records between characters of the library: those whose characters are all on stage and whose AU is on.
    let bondsBlock = '';
    try {
      if (settings.enabled && settings.sendBonds !== false) {
        const lib = locationLibrary.get();
        bondsBlock = buildBondsPrompt(lib.bonds, { presentCardIds: presentCardIdsNow(), activeAu: state.ui?.au ?? [], cardNames: new Map((lib.characters ?? []).map(card => [card.id, card.name])) });
      }
    } catch (error) { console.error('[Kulisy] Bonds prompt failed.', error); }
    bondsTokens = bondsBlock ? countTokens(bondsBlock) : 0;
    promptParts.bonds = bondsBlock;
    updateBondsPrompt(ctx, bondsBlock);
    // Spelling and case forms of the names on stage and of those said in the last posts.
    let namesBlock = '';
    try {
      if (settings.enabled && !state.ui?.namesOff) {
        const { namedText, replyText } = gateTexts(ctx.chat);
        // The names are written in the cards (characters and the persona): those on stage, and any other named in the last posts.
        const here = new Set(presentIds(state));
        const byEntity = cardsByEntity(state, locationLibrary.get());
        const persona = personaCardNow();
        const personaOn = Boolean(persona) && normalizePersonaCards(settings.personaCards).enabled;
        const entries = [...(personaOn ? [cardNameEntry(persona)] : []), ...[...byEntity.values()].map(cardNameEntry)];
        const linkedIds = [...(personaOn ? [persona.id] : []), ...[...byEntity].filter(([entityId]) => here.has(entityId)).map(([, card]) => card.id)];
        const cardNames = { version: 1, enabled: normalizeNames(settings.nameLibrary).enabled, folders: [], entries };
        namesBlock = buildNamesPrompt(cardNames, state, { presentIds: [], linkedIds, needed: true, text: `${namedText}
${replyText}` });
      }
    } catch (error) { console.error('[Kulisy] Names prompt failed.', error); }
    namesTokens = namesBlock ? countTokens(namesBlock) : 0;
    promptParts.names = namesBlock;
    updateNamesPrompt(ctx, namesBlock);
    // Open quests: only the ones in play (a secret one only with a knower on stage).
    let questsBlock = '';
    try {
      if (settings.enabled && settings.sendQuests !== false && !state.world?.clock?.flashback) questsBlock = buildQuestsPrompt(state, { presentIds: presentIds(state) });
    } catch (error) { console.error('[Kulisy] Quests prompt failed.', error); }
    questsTokens = questsBlock ? countTokens(questsBlock) : 0;
    promptParts.quests = questsBlock;
    updateQuestsPrompt(ctx, questsBlock);
    // What the author agreed with the assistant: the conclusions that are switched on (the talk itself never goes).
    let gmBlock = '';
    try {
      if (settings.enabled && settings.sendGm !== false) gmBlock = buildGmPrompt(readGm());
    } catch (error) { console.error('[Kulisy] Assistant notes prompt failed.', error); }
    gmTokens = gmBlock ? countTokens(gmBlock) : 0;
    promptParts.gm = gmBlock;
    updateGmPrompt(ctx, gmBlock);
    // Songs of the library that play, are sung or were quoted in the last posts.
    let songsBlock = '';
    songsReport = null;
    try {
      if (settings.enabled) {
        const library = normalizeSongs(settings.songLibrary);
        const planned = planSongs({
          library, text: recentText(ctx.chat, library.lookback), songState: state.ui?.songs,
          nameOf: id => state.entities[id]?.name ?? '',
        });
        songsBlock = planned.block;
        songsReport = planned.report;
      }
    } catch (error) { console.error('[Kulisy] Songs prompt failed.', error); }
    songsTokens = songsBlock ? countTokens(songsBlock) : 0;
    promptParts.songs = songsBlock;
    updateSongsPrompt(ctx, songsBlock);
    if (!settings.enabled || !settings.injectPrompt) {
      promptTokens = 0;
      promptParts.relationships = '';
      updateRelationshipPrompt(ctx, '', false);
      notify();
      return;
    }
    const persona = state.ui?.personaId && state.entities[state.ui.personaId] ? state.ui.personaId : '';
    const text = buildInjectionText(state, persona);
    promptTokens = text ? countTokens(`[RELATIONSHIP ENGINE]\n${text}\n[/RELATIONSHIP ENGINE]`) : 0;
    promptParts.relationships = text;
    updateRelationshipPrompt(ctx, text, Boolean(text));
    notify();
  }

  async function ensurePair(sourceId, targetId) {
    const id = relationshipId(sourceId, targetId);
    let next = state;
    if (!next.relationships[id]) {
      next = applyOperation(next, createOperation('relationship.upsert', { from: sourceId, to: targetId }, { id: uniqueId('relationship') }));
    }
    next = structuredClone(next);
    next.ui ??= {};
    next.ui.activeRelationshipId = id;
    await commit(next, true);
    studio?.selectPair(id);
    widget?.selectPair(id);
    return id;
  }

  async function addCharacter({ name, aliases = [], gender = '' }) {
    const candidate = createEntity(name, { aliases });
    const existing = state.entities[candidate.id];
    const entity = createEntity(name, {
      id: candidate.id,
      aliases: [...(existing?.aliases ?? []), ...aliases],
      avatar: existing?.avatar,
      sourceId: existing?.sourceId,
    });
    await commit(applyOperation(state, createOperation('entity.upsert', entity, { id: uniqueId('entity-update') })), true);
    if (gender === 'male' || gender === 'female') await callbacks.onSetGender({ entityId: entity.id, gender });
  }

  /** Replace a character's aliases, keeping its ID, name, avatar and source. */
  async function setAliases({ characterId: id, aliases }) {
    const existing = state.entities[id];
    if (!existing) throw new Error('Персонаж не найден.');
    const entity = createEntity(existing.name, {
      id, aliases: (aliases ?? []).map(String).map(alias => alias.trim()).filter(alias => alias && alias.length <= 100).slice(0, 30),
      avatar: existing.avatar, sourceId: existing.sourceId,
    });
    await commit(applyOperation(state, createOperation('entity.upsert', entity, {
      id: uniqueId('entity-update'), reason: 'Псевдонимы персонажа', timestamp: new Date().toISOString(),
    })), true);
    await prepareHeadcanons();
    refreshPrompt();
  }

  function findTriangle(id) {
    const triangle = (state.ui?.triangles ?? []).find(item => item.id === id);
    if (!triangle) throw new Error('Треугольник не найден.');
    return triangle;
  }

  /** The triangle's tracked directed lines: both directions of its three edges, minus the persona's own. */
  function triangleLines(triangle) {
    const personaId = state.ui?.personaId || '';
    const name = id => state.entities[id]?.name ?? id;
    return triangleEdges(triangle.centerId, triangle.firstId, triangle.secondId)
      .flatMap(([a, b]) => [[a, b], [b, a]])
      .filter(([from]) => from !== personaId)
      .map(([from, to]) => ({ from, to, relationshipId: relationshipId(from, to), label: `${name(from)} → ${name(to)}` }));
  }

  function withLineIds(factors) {
    return factors.map(factor => ({ ...factor, relationshipId: relationshipId(factor.from, factor.to) }));
  }

  async function selectPair({ sourceId, targetId }) {
    if (!state.entities[sourceId] || !state.entities[targetId] || sourceId === targetId) return;
    await ensurePair(sourceId, targetId);
  }

  async function changeMetric({ sourceId, targetId, metric, value }) {
    const id = await ensurePair(sourceId, targetId);
    if (!state.config.scales.some(scale => scale.id === metric)) {
      throw new Error(`Неизвестная шкала: ${metric}`);
    }
    const next = applyOperation(state, createOperation('scale.set', {
      relationshipId: id, scaleId: metric, value: Number(value),
    }, { transactionId: uniqueId('manual'), reason: 'Ручное изменение', timestamp: new Date().toISOString() }));
    await commit(next, true);
    return next;
  }

  async function addCollection(kind, payload) {
    if (Array.isArray(payload.participantIds)) {
      const knownBy = (payload.knownBy ?? payload.participantIds).filter(id => state.entities[id]);
      for (const id of payload.participantIds) if (!knownBy.includes(id)) knownBy.push(id);
      await commit(applyOperation(state, createOperation(kind === 'memory' ? 'memory.add' : 'tension.add', {
        shared: true, item: { id: uniqueId(kind), text: payload.text, participantIds: payload.participantIds, knownBy: [...new Set(knownBy)].sort(), intensity: payload.intensity, createdAt: new Date().toISOString() },
      }, { transactionId: uniqueId('manual'), reason: 'Ручная запись', timestamp: new Date().toISOString() })), true);
      return;
    }
    const id = await ensurePair(payload.sourceId, payload.targetId);
    const type = kind === 'memory' ? 'memory.add' : 'tension.add';
    await commit(applyOperation(state, createOperation(type, {
      relationshipId: id,
      item: { id: uniqueId(kind), text: payload.text, intensity: payload.intensity, createdAt: new Date().toISOString() },
    }, { transactionId: uniqueId('manual'), reason: 'Ручное изменение', timestamp: new Date().toISOString() })), true);
  }

  async function importFromStudio({ data }) {
    const imported = importState(data?.state ?? data);
    const ctx = SillyTavern.getContext();
    const accepted = await ctx.Popup.show.confirm(
      'Импорт отношений',
      `<p>В файле персонажей: ${Object.keys(imported.entities ?? {}).length}, линий: ${Object.keys(imported.relationships ?? {}).length}.</p><p>Текущие отношения этого чата будут заменены. Продолжить?</p>`,
    );
    if (accepted !== ctx.POPUP_RESULT.AFFIRMATIVE) return false;
    await commit(imported, true);
    return true;
  }

  /** What the messenger and the settings of the assistants show: the talk, who answers, the choices. */
  function assistantView() {
    const gmSettings = normalizeGmSettings(settings.gm);
    const who = resolveAssistant(gmSettings);
    // the list of connection profiles changes rarely: not asked for at every update of the UI
    if (!assistantProfiles.at || Date.now() - assistantProfiles.at > 15000) {
      try { assistantProfiles.list = listAuxProfiles(SillyTavern.getContext()); } catch { assistantProfiles.list = []; }
      assistantProfiles.at = Date.now();
    }
    const profiles = assistantProfiles.list;
    return {
      ...readGm(), busy: gmBusy, name: who.name, assistant: who, settings: gmSettings, profiles, defaultPrompt: DEFAULT_GM_PROMPT,
      ready: ASSISTANTS.map(item => ({ id: item.id, name: item.name, tagline: item.tagline, addresses: [...item.addresses] })),
    };
  }
  const assistantListeners = new Set();
  const assistantProfiles = { list: [], at: 0 };
  let assistantTimer = 0;
  /** notify() runs very often: the messenger and its settings are told once per pause, with the state as it is then. */
  function emitAssistant() {
    if (!assistantListeners.size || assistantTimer) return;
    assistantTimer = setTimeout(() => {
      assistantTimer = 0;
      const view = assistantView();
      for (const listener of assistantListeners) {
        try { listener(view); } catch (error) { console.error('[Kulisy] Assistant listener failed.', error); }
      }
    }, 80);
  }
  /** The model answers for the assistant: through its own profile (so it can talk while the story is being written), or like the rest of Zakulisie. */
  function generateForAssistant(ctx, gmSettings, request, { quiet = false, maxTokens = 1200 } = {}) {
    // NO responseLength for generateRaw: the tavern keeps it in ONE global slot (the max tokens of the chat) and two overlapping calls
    // (the assistant and a post being written) can leave the chat's limit stuck at 120 tokens: empty replies.
    // The brevity is asked for in the prompt; only a connection profile (its own request) gets a token limit.
    if (gmSettings.profileId === 'main') return ctx.generateRaw({ prompt: request, trimNames: false });
    if (gmSettings.profileId) return auxGenerate(ctx, { mode: 'profile', profileId: gmSettings.profileId, maxTokens }, request);
    const run = () => routedContext(ctx, settings, 'generation').generateRaw({ prompt: request, trimNames: false });
    return quiet ? run() : withBusy('ассистент отвечает…', run);
  }
  // What the console (F12) would show, for the assistant: errors, failed requests, stops of a generation. Secrets are cut out before they get here.
  const consoleLog = createConsoleLog();
  const stopConsoleWatch = startConsoleWatch(consoleLog);
  /** The assistant answers the last message of the author (a new one or a retry). */
  async function answerGm() {
    gmBusy = true;
    notify();
    try {
      const ctx = SillyTavern.getContext();
      const chat = (ctx.chat ?? []).filter(item => item && !item.is_system && String(item.mes ?? '').trim())
        .slice(-GM_LIMITS.contextMessages).map(item => ({ name: item.name, text: item.mes, isUser: Boolean(item.is_user) }));
      const gmSettings = normalizeGmSettings(settings.gm);
      const talk = readGm();
      const lastAsk = [...talk.messages].reverse().find(item => item.role === 'user')?.text ?? '';
      const consoleReport = gmSettings.seeConsole && looksLikeProblem(lastAsk) ? formatConsoleReport(consoleLog.list()) : '';
      const request = buildGmRequest({ prompt: gmSettings.prompt, assistant: resolveAssistant(gmSettings), userGender: gmSettings.userGender, gm: talk, chat, consoleReport });
      const raw = await generateForAssistant(ctx, gmSettings, request);
      const reply = splitReply(raw);
      let gm = addMessage(readGm(), 'assistant', reply.text || (reply.proposal ? 'Вот что получилось.' : '…'));
      if (reply.proposal) gm = setProposal(gm, reply.proposal);
      await writeGm(gm);
    } finally {
      gmBusy = false;
      notify();
    }
  }
  /** The talk with the assistant lives in the metadata of this chat, away from the game chat. */
  function readGm() {
    return normalizeGm(SillyTavern.getContext().chatMetadata?.[GM_METADATA_KEY]);
  }
  async function writeGm(next) {
    const ctx = SillyTavern.getContext();
    if (!ctx.chatMetadata) return;
    ctx.chatMetadata[GM_METADATA_KEY] = normalizeGm(next);
    try { await ctx.saveMetadata?.(); } catch (error) { console.error('[Kulisy] Could not save the assistant talk.', error); }
    refreshPrompt();
    notify();
  }

  function exportForStudio() {
    return { kind: 'sillytavern-kulisy', exportedAt: new Date().toISOString(), state };
  }

  async function changeSettings({ settings: patch }) {
    if (Object.hasOwn(patch, 'autoTrack')) settings.autoAnalyze = Boolean(patch.autoTrack);
    if (Object.hasOwn(patch, 'widgetEnabled')) settings.widget.visible = Boolean(patch.widgetEnabled);
    if (Object.hasOwn(patch, 'railSide')) { settings.railSide = patch.railSide === 'right' ? 'right' : 'left'; refreshChatOverlay(); }
    if (Object.hasOwn(patch, 'studioMulti')) { settings.studioMulti = Boolean(patch.studioMulti); if (!settings.studioMulti) closePanels(); }
    for (const key of TOGGLE_SETTINGS) if (Object.hasOwn(patch, key)) settings[key] = Boolean(patch[key]);
    if (Object.hasOwn(patch, 'maxPromptCharacters')) {
      const limit = Math.round(Number(patch.maxPromptCharacters));
      if (Number.isFinite(limit)) settings.maxPromptCharacters = Math.max(800, Math.min(20000, limit));
    }
    if (Object.hasOwn(patch, 'knowledgePromptCharacters')) {
      const limit = Math.round(Number(patch.knowledgePromptCharacters));
      if (Number.isFinite(limit)) settings.knowledgePromptCharacters = Math.max(300, Math.min(8000, limit));
    }
    if (Object.hasOwn(patch, 'knowledgeCandidates')) {
      const limit = Math.round(Number(patch.knowledgeCandidates));
      if (Number.isFinite(limit)) settings.knowledgeCandidates = Math.max(1, Math.min(40, limit));
    }
    if (Object.hasOwn(patch, 'headcanonLimit')) {
      const limit = Math.round(Number(patch.headcanonLimit));
      if (Number.isFinite(limit)) settings.headcanonLimit = Math.max(1, Math.min(30, limit));
    }
    for (const [key, min, max] of [['scenePromptCharacters', 300, 6000], ['cardsPromptCharacters', 500, 60000], ['largeChangeThreshold', 4, 25], ['itemsDormantAfter', 0, 500], ['looksCardCharacters', 80, 1000], ['looksCharacterCharacters', 200, 4000]]) {
      if (!Object.hasOwn(patch, key)) continue;
      const value = Math.round(Number(patch[key]));
      if (Number.isFinite(value)) settings[key] = Math.max(min, Math.min(max, value));
    }
    settings.director ??= {};
    if (Object.hasOwn(patch, 'directorHotkeys')) settings.director.hotkeys = Boolean(patch.directorHotkeys);
    if (Object.hasOwn(patch, 'directorSilenceAfter')) {
      const value = Math.round(Number(patch.directorSilenceAfter));
      if (Number.isFinite(value)) settings.director.silenceAfter = Math.max(0, Math.min(50, value));
    }
    if (Object.hasOwn(patch, 'imageStorage')) settings.imageStorage = patch.imageStorage === 'folder' ? 'folder' : 'server';
    if (patch.loreGate && typeof patch.loreGate === 'object') {
      settings.loreGate = normalizeGate({
        ...settings.loreGate, ...patch.loreGate,
        sections: { ...settings.loreGate?.sections, ...Object.fromEntries(Object.entries(patch.loreGate.sections ?? {}).map(([id, rule]) => [id, { ...settings.loreGate?.sections?.[id], ...rule }])) },
      });
    }
    if (patch.aux && typeof patch.aux === 'object') settings.aux = normalizeAux({ ...settings.aux, ...patch.aux });
    if (patch.wardrobeVision && typeof patch.wardrobeVision === 'object') settings.wardrobeVision = visionSettings({ ...settings.wardrobeVision, ...patch.wardrobeVision });
    if (patch.embeddings && typeof patch.embeddings === 'object') {
      settings.embeddings = normalizeEmbeddings({ ...settings.embeddings, ...patch.embeddings });
      prepareHeadcanons().then(refreshPrompt);
    }
    context.saveSettingsDebounced();
    widget.element.hidden = !settings.widget.visible;
    refreshPrompt();
    notify();
  }

  /** Lorebooks bound to the current card(s) in SillyTavern (card's "world"). */
  /** Lore about these characters from every book of the chat, for generation (factors, end points, headcanons). */
  async function loreAbout(ids) {
    const ctx = SillyTavern.getContext();
    // The persona's own lorebook too: when the persona is one of the pair, it is the main source about her.
    const persona = personaBookName();
    const books = [...new Set([...generationBooks(ctx, state, cardWorldNames()), ...(persona ? [persona] : [])])];
    const lore = await loadGroupLore(ctx, state, ids, { books, matchKeys: matchingKeys, skipEntry: sheetSkip(state) });
    return withCardSheets(lore, state, ids);
  }

  /** The test for lorebook entries that a library card replaces (null when cards do not replace the lorebook). */
  function sheetSkip(source) {
    if (settings.sendCards === false || settings.cardsReplaceLore === false) return null;
    try { return cardedSheetTest(source, locationLibrary.get()); } catch (error) { logEvent('warn', 'Не удалось отделить анкеты карточек от лорбука', error); return null; }
  }

  /** Library cards of these characters as lore for a model that analyses or generates (never the NSFW section; no more than `total` characters). */
  function cardLore(source, ids, total = 9000) {
    try { return digestFor(source, locationLibrary.get(), ids, total); }
    catch (error) { logEvent('warn', 'Карточки не добавлены к знаниям о персонажах', error); return ''; }
  }
  const withCardSheets = (lore, source, ids, total) => [cardLore(source, ids, total), lore].filter(Boolean).join('\n\n');

  /** The chat's calendar, tidy (characters removed since are dropped from «who»). */
  function calendarOf(source = state) {
    return normalizeCalendar(source.ui?.calendar, new Set(Object.keys(source.entities ?? {})));
  }

  /**
   * The birthdays of the characters whose cards are switched on in THIS chat (and of the persona's card): yearly «День рождения» events,
   * made from the card's `birthday` ('MM-DD'). They are never stored in the calendar (the card is the one place that holds them), so they come
   * only to the chats that have the card. A calendar of its own has other months: no birthdays there.
   */
  function birthdayEvents(source = state) {
    try {
      if (clockOf(calendarOf(source)).custom) return [];
      const library = locationLibrary.get().characters ?? [];
      const events = [];
      for (const [entityId, cardId] of cardOfEntity()) {
        const card = library.find(item => item.id === cardId);
        if (!card?.birthday) continue;
        events.push({ id: `bday:${cardId}`, title: `День рождения: ${source.entities?.[entityId]?.name ?? card.name}`, date: `1600-${card.birthday}`, repeat: 'yearly', kind: 'birthday', intensity: 2, ahead: 2, who: [entityId], fromCard: true, cardId });
      }
      return events;
    } catch (error) {
      console.error('[Kulisy] Birthdays of the cards failed.', error);
      return [];
    }
  }

  /** The calendar as the story reads it: the stored events and the birthdays of the cards. Writers use calendarOf (the stored one). */
  function calendarView(source = state) {
    const stored = calendarOf(source);
    return { ...stored, events: [...stored.events, ...birthdayEvents(source)] };
  }

  /** With a calendar of its own the climate comes from its seasons (and its months), not from the earthly climates. */
  function weatherCalendar(source = state) {
    const calendar = calendarOf(source);
    const cal = clockOf(calendar);
    return cal.custom ? { climate: systemClimate(calendar.system) ?? false, monthOf: iso => cal.monthOf(iso) } : {};
  }

  /** The weather in force now (set today, a scenario, or the forecast); null when nothing is known. */
  function currentWeather(source = state) {
    try {
      const day = source.world?.clock?.day ?? 0;
      return weatherFor(source, { plan: source.ui?.weatherPlan, climates: settings.weatherClimates, date: dateOfDay(calendarOf(source), day), day, ...weatherCalendar(source) });
    } catch (error) {
      console.error('[Kulisy] Weather failed.', error);
      return null;
    }
  }

  async function commitCalendar(change, base = state) {
    const next = structuredClone(base);
    next.ui ??= {};
    next.ui.calendar = calendarOf(next);
    change(next.ui.calendar);
    await commit(next, true);
    refreshPrompt();
  }

  /** The calendars to choose from: the ready ones and the user's own (the chat's copy is told by `calendar.system`). */
  function calendarLibrary() {
    return [...READY_SYSTEMS.map(system => ({ ...system, ready: true })), ...normalizeSystems(settings.calendarSystems)];
  }

  const calendarCallbacks = {
    /**
     * Put a calendar into this chat (`system`: a whole calendar; null: back to the earthly one). Its dates differ from the old
     * ones, so the date of the story and the events are cleared: the page asks first.
     */
    onCalendarSetSystem: ({ system }) => {
      const clean = system ? normalizeSystem(system) : null;
      if (system && !clean) throw new Error('Календарь неполный: нужны название, не меньше двух дней недели и хотя бы один месяц.');
      return commitCalendar(calendar => {
        if (clean) calendar.system = clean; else delete calendar.system;
        calendar.anchor = '';
        calendar.events = [];
      });
    },
    /** Keep a calendar in the library (a new one or an edited one with the same id). → its id. */
    onCalendarSaveSystem: ({ system }) => {
      const clean = normalizeSystem(system);
      if (!clean) throw new Error('Календарь неполный: нужны название, не меньше двух дней недели и хотя бы один месяц.');
      if (READY_SYSTEMS.some(item => item.id === clean.id)) throw new Error('Готовый календарь не перезаписать: сохраните копию под другим названием.');
      settings.calendarSystems = [...normalizeSystems(settings.calendarSystems).filter(item => item.id !== clean.id), clean];
      context.saveSettingsDebounced();
      notify();
      return clean.id;
    },
    onCalendarRemoveSystem: ({ id }) => {
      settings.calendarSystems = normalizeSystems(settings.calendarSystems).filter(item => item.id !== id);
      context.saveSettingsDebounced();
      notify();
    },
    /** «Сегодня в истории — 8 апреля»: the date of the current story day; the rest follows. */
    onCalendarSetToday: async ({ date, time }) => {
      // The time goes first: a wrong one stops before anything is written.
      if (time) await worldCallbacks.onSetClock({ time });
      // An unknown story day becomes day 1: the date has to belong to some day.
      const day = state.world?.clock?.day || 0;
      const base = day ? state : applyOperation(state, createOperation('clock.set', { day: 1 }, {
        transactionId: uniqueId('manual'), reason: 'День 1: дата истории задана в календаре', timestamp: new Date().toISOString(),
      }));
      return commitCalendar(calendar => {
        const anchor = anchorFor(date, day || 1, clockOf(calendar));
        if (!anchor) throw new Error('Не понял дату.');
        calendar.anchor = anchor;
      }, base).then(async () => {
        // «Сейчас» shows the same date with its weekday.
        const label = clockOf(calendarOf()).humanDate(date);
        if (label) await worldCallbacks.onSetClock({ label });
      });
    },
    onCalendarSaveEvent: ({ event }) => commitCalendar(calendar => {
      const clean = normalizeEvent(event, new Set(Object.keys(state.entities)), clockOf(calendar));
      if (!clean) throw new Error('У события нужны название и дата.');
      const index = calendar.events.findIndex(item => item.id === clean.id);
      if (index >= 0) calendar.events[index] = clean; else calendar.events.push(clean);
    }),
    onCalendarRemoveEvent: ({ id }) => commitCalendar(calendar => { calendar.events = calendar.events.filter(item => item.id !== id); }),
    onCalendarClear: () => commitCalendar(calendar => { calendar.events = []; }),
    /** A year from one line; nothing is saved, the page shows the drafts. */
    onCalendarGenerate: async ({ description }) => {
      if (isGenerationActive()) await waitForGenerationEnd();
      const ctx = SillyTavern.getContext();
      const personaId = state.ui?.personaId;
      const lore = personaId ? (await loreAbout([personaId]).catch(() => '')).slice(0, 4000) : '';
      return generateCalendarTemplate(routedContext(ctx, settings, 'generation'), {
        description, personaName: personaId ? state.entities[personaId]?.name ?? '' : '', lore,
      });
    },
    /** Only holidays (international, of a place, of a fandom's universe); nothing is saved, the page shows the drafts. */
    onCalendarGenerateHolidays: async ({ international, place, fandom }) => {
      if (isGenerationActive()) await waitForGenerationEnd();
      return generateHolidays(routedContext(SillyTavern.getContext(), settings, 'generation'), { international: Boolean(international), place, fandom });
    },
    /** Put a template (saved or just generated) into this chat's calendar, in a year. indexes: only those events. */
    onCalendarApplyTemplate: ({ template, templateId, year, indexes }) => {
      if (clockOf(calendarOf()).custom) throw new Error('Шаблоны сделаны для земного календаря: у календаря этого чата свои месяцы.');
      const source = template ?? normalizeTemplates(settings.calendarTemplates).find(item => item.id === templateId);
      if (!source) throw new Error('Шаблон не найден.');
      const y = Math.round(Number(year));
      if (!(y >= 1 && y <= 9999)) throw new Error('Укажите год.');
      const picked = Array.isArray(indexes) ? { ...source, events: source.events.filter((_, index) => indexes.includes(index)) } : source;
      const events = fromTemplate(picked, y, { whoForPersona: state.ui?.personaId || '' });
      if (!events.length) throw new Error('В шаблоне нет событий с датой.');
      return commitCalendar(calendar => { calendar.events.push(...events); }).then(() => events.length);
    },
    /** Save as a template: the chat's events, or the given (generated) ones. */
    onCalendarSaveTemplate: ({ name, startMonth, events, description, year }) => {
      const template = events
        ? { ...toTemplate(name, [], startMonth, description, '', year), events: events.map(event => ({ ...event })) }
        : toTemplate(name, calendarOf().events, startMonth, description, state.ui?.personaId || '', year);
      if (!template.events.length) throw new Error('Нечего сохранять: событий нет.');
      settings.calendarTemplates = [...normalizeTemplates(settings.calendarTemplates), template];
      context.saveSettingsDebounced();
      notify();
      return template.id;
    },
    onCalendarRemoveTemplate: ({ id }) => {
      settings.calendarTemplates = normalizeTemplates(settings.calendarTemplates).filter(item => item.id !== id);
      context.saveSettingsDebounced();
      notify();
    },
  };

  /** Painted weather beats the weather set for today (by hand or by the chronicler): it is dropped so the painted days speak. */
  async function dropTodaysWeather(first, count) {
    const today = state.world?.clock?.day ?? 0;
    if (today >= first && today < first + count && state.world?.weather) await worldCallbacks.onSetWeather({ clear: true });
  }

  /** Weather (Мир → Погода): the plan of the chat is in the chat, the climates in the settings. */
  async function commitWeatherPlan(change) {
    const next = structuredClone(state);
    next.ui ??= {};
    next.ui.weatherPlan = normalizePlan(change(normalizePlan(next.ui.weatherPlan)));
    await commit(next, true);
    refreshPrompt();
  }

  /** A quest step goes to the narrator with the next reply (the cue «квест»). */
  const questCallbacks = {
    onQuestPush: async ({ questId: id }) => {
      try {
        const quest = questsOf(state).find(item => item.id === id);
        if (!quest) throw new Error('Квест не найден.');
        if (quest.status !== 'active') throw new Error('Квест не идёт: сначала верните его в игру.');
        await saveDirection(armCue(directionState(), { ...questCue(quest), id: uniqueId('cue') }, Object.keys(state.entities)));
        refreshChatOverlay();
        globalThis.toastr?.success?.('Шаг уйдёт со следующим ответом', 'Закулисье');
        return true;
      } catch (error) {
        globalThis.toastr?.error?.(error.message, 'Закулисье');
        return false;
      }
    },
  };

  /** The intimacy dice settings (Мир → Кубик). */
  const diceCallbacks = {
    onDiceSettings: ({ patch }) => {
      settings.intimacyDice = updateDice(settings.intimacyDice, patch);
      context.saveSettingsDebounced();
      notify();
    },
  };

  /** The characters the narrator plays and who are on stage: the persona is never among them, nor the dead. */
  function diceNpcs() {
    const personaId = state.ui?.personaId ?? '';
    return presentIds(state).filter(id => id !== personaId).map(id => ({ id, name: state.entities[id].name }));
  }

  // The roll of the intimacy dice for this chat: what burns in the drawer, what is locked, whether it went out as a direction.
  let diceNow = { picks: [], locked: [], released: [], sent: false, recorded: false };
  const resetDice = () => { diceNow = { picks: [], locked: [], released: [], sent: false, recorded: false }; };
  /** A pick from a later stage than the scene is at waits («ahead») unless the user let it through. */
  const isAhead = pick => {
    const stage = state.world?.intimacy?.stage;
    return Boolean(stage) && aheadGroups(stage).includes(pick.group) && !diceNow.released.includes(`${pick.group}:${pick.id}`);
  };
  // What really went to the model with the last generation, read back from the prompt blocks at that moment:
  // shown on the strip, so that «did it work» can be checked by eye instead of guessed.
  let lastSent = null;
  function recordSent(type) {
    try {
      const prompts = SillyTavern.getContext().extensionPrompts ?? {};
      const scene = String(prompts[SCENE_PROMPT_KEY]?.value ?? '');
      const stageId = /intimacy stage: \d\/\d (\w+)/.exec(scene)?.[1];
      const nameOf = id => state.entities?.[id]?.name ?? id;
      lastSent = {
        at: Date.now(),
        type: String(type ?? ''),
        stage: stageId ? { label: stageOf(stageId)?.label ?? stageId, note: state.world?.intimacy?.note ?? '' } : null,
        cues: directionState().cues.filter(cue => cue.used).map(cue => `${cueBadge(cue)} ${cueLabel(cue, nameOf)}`),
        // The library entries of this request: which sections of the character cards went (and why the others did not), what of the place and the things.
        cards: (cardsReport?.people ?? []).filter(person => person.present || person.named).map(person => ({
          name: person.name,
          sent: person.parts.filter(part => part.action === 'force').map(part => part.title),
          held: person.parts.filter(part => part.action !== 'force').map(part => ({ title: part.title, why: part.why || '' })),
        })),
        // Those on stage who have no card in this request: no card at all, a card in the library that is not attached to them, or the cards are off.
        cardsOff: settings.sendCards === false,
        cardsLimit: cardsReport?.trimmed ? { limit: cardsReport.limit, used: cardsReport.used, names: cardsReport.trimmedNames ?? [], parts: (cardsReport.people ?? []).flatMap(person => person.parts.filter(part => part.action === 'trim').map(part => ({ name: person.name, title: part.title, size: part.characters }))) } : null,
        noCard: (() => {
          const reported = new Set((cardsReport?.people ?? []).map(person => person.id));
          const personaId = state.ui?.personaId || '';
          const library = locationLibrary.get();
          return presentIds(state).filter(id => id !== personaId && state.entities[id] && !reported.has(id)).map(id => {
            const names = [state.entities[id].name, ...(state.entities[id].aliases ?? [])].map(normalizeAlias);
            const inLibrary = (library.characters ?? []).some(card => [card.name, ...(card.aliases ?? [])].some(name => names.includes(normalizeAlias(name))));
            return { name: state.entities[id].name, inLibrary };
          });
        })(),
        place: (() => {
          const name = state.knowledge?.scene?.location ?? '';
          const parts = [['place-features', 'особенности'], ['place-now', 'что сейчас'], ['place-about', 'описание']].filter(([key]) => new RegExp(`^${key}:`, 'm').test(scene)).map(([, label]) => label);
          return name || parts.length ? { name, parts } : null;
        })(),
        things: [...scene.matchAll(/^about\[(.+?)\]:/gm)].map(match => match[1]),
      };
      refreshChatOverlay();
    } catch (error) { console.error('[Kulisy] Could not record what was sent.', error); }
  }
  /** The ladder of the intimate scene for the drawer (core/intimacy-stage.js). */
  const stageView = () => {
    const found = state.world?.intimacy;
    const stage = stageOf(found?.stage);
    return { id: stage?.id ?? '', label: stage?.label ?? '', hint: stage?.hint ?? '', ru: stage?.ru ?? '', lock: Boolean(found?.lock), why: found?.why ?? '', note: found?.note ?? '', stages: INTIMACY_STAGES.map(({ id, label, icon, hint }) => ({ id, label, icon, hint })) };
  };
  const diceView = () => (state.world?.clock?.mode === 'intim' || state.world?.intimacy
    ? { rollMode: normalizeDice(settings.intimacyDice).rollMode, stage: stageView(), groups: viewGroups(settings.intimacyDice, diceNpcs()), picks: diceNow.picks.map(pick => ({ group: pick.group, id: pick.id, text: pick.text, ahead: isAhead(pick) })), locked: diceNow.locked, sent: diceNow.sent }
    : null);

  /** The roll goes out as a stage direction for the next reply (a new one replaces the old). */
  async function diceSend({ quiet = false } = {}) {
    try {
      if (!settings.enabled) throw new Error('Закулисье выключено.');
      // Safety net: the persona never leads, whatever came in.
      const personaId = state.ui?.personaId ?? '';
      const safe = diceNow.picks.filter(pick => pick.id !== `npc:${personaId}`);
      if (!safe.length) throw new Error('Нечего отправлять: сначала бросьте кубик.');
      const stageId = state.world?.intimacy?.stage ?? '';
      await saveDirection(armCue(directionState(), { kind: 'dice', ...diceCue(safe.map(pick => ({ ...pick, ahead: isAhead(pick) })), { stage: stageId }), id: uniqueId('cue') }, Object.keys(state.entities)));
      settings.intimacyDice = recordDice(settings.intimacyDice, safe, { replaceLast: diceNow.recorded });
      context.saveSettingsDebounced();
      diceNow.sent = true;
      diceNow.recorded = true;
      if (!quiet) refreshChatOverlay();
      return true;
    } catch (error) {
      globalThis.toastr?.error?.(error.message, 'Закулисье');
      return false;
    }
  }
  /** After a change by hand: when the roll is already out, it goes out again as it is now. */
  async function diceChanged() {
    // What burns goes out at once: no separate «send» step to forget.
    if (!settings.enabled) { refreshChatOverlay(); return; }
    if (diceNow.picks.length) await diceSend(); else await diceClear();
  }
  async function diceRoll(only) {
    const keep = diceNow.picks.filter(pick => diceNow.locked.includes(pick.group) || (only && pick.group !== only));
    diceNow.picks = rollDice(settings.intimacyDice, { npcs: diceNpcs(), keep, only, stage: state.world?.intimacy?.stage ?? '' });
    await diceChanged();
  }
  /** After the stage moved: a roll that is already out goes out again, so what waited ahead comes alive. */
  async function diceResend() {
    if (diceNow.sent && diceNow.picks.length) await diceSend({ quiet: true });
    else refreshChatOverlay();
  }
  /** «Сейчас» on a pick that waits ahead: it goes to the narrator without waiting for its stage. */
  async function diceRelease(group, option) {
    const key = `${group}:${option}`;
    if (!diceNow.released.includes(key)) diceNow.released = [...diceNow.released, key];
    await diceChanged();
  }
  async function diceToggle(group, option) {
    diceNow.picks = togglePick(settings.intimacyDice, diceNow.picks, group, option, diceNpcs());
    await diceChanged();
  }
  async function diceLock(group) {
    diceNow.locked = diceNow.locked.includes(group) ? diceNow.locked.filter(id => id !== group) : [...diceNow.locked, group];
    refreshChatOverlay();
  }
  /** Her own option typed in the drawer: it joins the group and burns at once. */
  async function diceAdd(group, text) {
    const before = new Set(normalizeDice(settings.intimacyDice).groups[group]?.custom.map(item => item.id) ?? []);
    settings.intimacyDice = updateDice(settings.intimacyDice, { group, addCustom: text });
    context.saveSettingsDebounced();
    const added = normalizeDice(settings.intimacyDice).groups[group].custom.find(item => !before.has(item.id));
    if (added) diceNow.picks = togglePick(settings.intimacyDice, diceNow.picks, group, added.id, diceNpcs());
    await diceChanged();
    notify();
  }
  async function diceClear() {
    const cue = directionState().cues.find(item => item.kind === 'dice');
    resetDice();
    if (cue) await saveDirection(removeCue(directionState(), cue.id)).catch(error => console.error('[Kulisy] Dice cue not removed.', error));
    refreshChatOverlay();
  }
  /**
   * The scene became intimate: the dice roll by themselves and go out as a direction (the chronicler moves the
   * type after a reply, so the next reply already follows it). Switch it off in Мир → Кубик.
   */
  async function autoDice(before, after) {
    const was = before?.world?.clock?.mode;
    const now = after?.world?.clock?.mode;
    // The scene type went back to «Быт»: the roll is dropped, but the ladder stays: only «Сцена закончена» takes it away.
    if (was === 'intim' && now !== 'intim') { resetDice(); return; }
    if (now !== 'intim' || was === 'intim' || !settings.enabled || !normalizeDice(settings.intimacyDice).autoRoll) return;
    resetDice();
    diceNow.picks = rollDice(settings.intimacyDice, { npcs: diceNpcs(), stage: state.world?.intimacy?.stage ?? '' });
    if (!diceNow.picks.length) return;
    if (await diceSend({ quiet: true })) globalThis.toastr?.info?.(`🎲 ${diceCue(diceNow.picks).text}`, 'Кубик близости');
    refreshChatOverlay();
  }

  const weatherCallbacks = {
    onSetWeather: payload => worldCallbacks.onSetWeather(payload),
    onWeatherPlan: ({ climateId, month }) => commitWeatherPlan(plan => ({
      ...plan,
      ...(climateId !== undefined ? { climateId: String(climateId) } : {}),
      ...(month !== undefined ? { month: Number(month) || 0 } : {}),
    })),
    /** A ready scenario (templateId) or a custom one, from `startDay` (the current day when empty). */
    onWeatherScenario: ({ templateId, scenario, startDay, days }) => commitWeatherPlan(plan => {
      const start = Math.round(Number(startDay)) || state.world?.clock?.day || 1;
      const template = scenario ?? BUILTIN_SCENARIOS.find(item => item.id === templateId);
      if (!template) throw new Error('Сценарий не найден.');
      const made = scenarioFrom(template, start, Math.round(Number(days)) || template.days);
      if (!made) throw new Error('Для сценария нужны день начала и число дней.');
      return addScenario(plan, made);
    }),
    onWeatherScenarioRemove: ({ id }) => commitWeatherPlan(plan => removeScenario(plan, id)),
    /**
     * The weather by hand for story days [startDay, startDay + days): one day or a stretch (the calendar window and the drawer).
     * If today is inside, today's weather is set too (it beats the plan until the story moves on).
     */
    onWeatherPaint: async ({ startDay, days = 1, kind, temp = '', text = '', parts = null }) => {
      const first = Math.round(Number(startDay));
      const count = Math.round(Number(days)) || 1;
      const number = temp === '' || temp == null ? null : Number(temp);
      await commitWeatherPlan(plan => paintWeather(plan, { startDay: first, days: count, kind, temp: Number.isFinite(number) ? number : null, text, parts }));
      await dropTodaysWeather(first, count);
    },
    /** A row of different days from `startDay` ([{ parts }] each): the generator's result or a ready template. */
    onWeatherDays: async ({ startDay, days }) => {
      const first = Math.round(Number(startDay));
      await commitWeatherPlan(plan => paintDays(plan, first, days));
      await dropTodaysWeather(first, (days ?? []).length);
    },
    onWeatherTemplate: async ({ templateId, startDay }) => {
      const template = WEATHER_TEMPLATES.find(item => item.id === templateId);
      if (!template) throw new Error('Такой заготовки погоды нет.');
      const first = Math.round(Number(startDay));
      await commitWeatherPlan(plan => paintDays(plan, first, templateDays(template)));
      await dropTodaysWeather(first, template.days.length);
    },
    /** Weather for the days [startDay, startDay + count) from a city or a wish; nothing is saved, the page shows it. */
    onWeatherGenerateDays: async ({ description, startDay, count }) => {
      if (isGenerationActive()) await waitForGenerationEnd();
      const first = Math.round(Number(startDay));
      const total = Math.round(Number(count));
      if (!first || !(total >= 1)) throw new Error('Выберите, на какие дни нужна погода.');
      if (total > 31) throw new Error('За один раз можно сочинить погоду не больше чем на 31 день.');
      const calendar = calendarOf();
      const clock = clockOf(calendar);
      const dates = Array.from({ length: total }, (_, index) => {
        const date = dateOfDay(calendar, first + index);
        return { date, label: date ? `${clock.humanDate(date)} (day ${first + index})` : `day ${first + index}` };
      });
      const climate = state.ui?.weatherPlan?.climateId ? findClimate(state.ui.weatherPlan.climateId, settings.weatherClimates) : null;
      const days = await generateWeatherDays(routedContext(SillyTavern.getContext(), settings, 'generation'), { description, dates, climateName: climate?.name ?? '' });
      return { days };
    },
    /** Take the hand-set and planned weather off those days: they go back to the forecast (today's set weather too). */
    onWeatherClear: async ({ startDay, days = 1 }) => {
      const first = Math.round(Number(startDay));
      const count = Math.round(Number(days)) || 1;
      await commitWeatherPlan(plan => clearWeatherDays(plan, { startDay: first, days: count }));
      const today = state.world?.clock?.day ?? 0;
      if (today >= first && today < first + count && state.world?.weather) await worldCallbacks.onSetWeather({ clear: true });
    },
    /** A climate from one line; nothing is saved, the page shows it. */
    onWeatherGenerate: async ({ description }) => {
      if (isGenerationActive()) await waitForGenerationEnd();
      return generateClimate(routedContext(SillyTavern.getContext(), settings, 'generation'), { description, id: uniqueId('climate') });
    },
    onWeatherSaveClimate: ({ climate, use }) => {
      const clean = normalizeClimate(climate);
      if (!clean) throw new Error('Климат повреждён: нужны двенадцать месяцев.');
      settings.weatherClimates = [...normalizeClimates(settings.weatherClimates).filter(item => item.id !== clean.id), clean];
      context.saveSettingsDebounced();
      if (use) return commitWeatherPlan(plan => ({ ...plan, climateId: clean.id })).then(() => clean.id);
      notify();
      return clean.id;
    },
    onWeatherRemoveClimate: ({ id }) => {
      settings.weatherClimates = normalizeClimates(settings.weatherClimates).filter(item => item.id !== id);
      context.saveSettingsDebounced();
      refreshPrompt();
      notify();
    },
  };

  /** The name library (Мир → Имена): shared by all chats, kept in the settings. */
  const namesCallbacks = {
    onNamesAdd: ({ name, aliases, gender, folderId }) => saveNames(library => addName(library, { name, aliases, gender, folderId }).library),
    onNamesFolderAdd: ({ name }) => saveNames(library => addNameFolder(library, name).library),
    onNamesFolderUpdate: ({ id, name, off }) => saveNames(library => updateNameFolder(library, id, { ...(name !== undefined ? { name } : {}), ...(off !== undefined ? { off } : {}) })),
    onNamesFolderRemove: ({ id }) => saveNames(library => removeNameFolder(library, id)),
    /** Several names at once: { ids, off } switches them, { ids, folderId } moves them. */
    onNamesBulk: ({ ids, off, folderId }) => saveNames(library => changeNames(library, ids, { ...(off !== undefined ? { off } : {}), ...(folderId !== undefined ? { folderId } : {}) })),
    onNamesUpdate: ({ id, patch }) => saveNames(library => updateName(library, id, patch)),
    onNamesRemove: ({ id, ids }) => saveNames(library => [...new Set([...(ids ?? []), ...(id ? [id] : [])])].reduce((next, one) => removeName(next, one), library)),
    onNamesEnabled: ({ enabled }) => saveNames(library => ({ ...library, enabled: Boolean(enabled) })),
    /** The people of this chat (names and other spellings) that are not in the library yet. → how many were added. */
    onNamesImport: () => {
      let added = 0;
      saveNames(library => {
        let next = library;
        for (const entity of Object.values(state.entities ?? {})) {
          if (!entity?.name) continue;
          const result = addName(next, { name: entity.name, aliases: entity.aliases ?? [] });
          if (result.added) added += 1;
          next = result.library;
        }
        return next;
      });
      return added;
    },
    /** Ask the model for the case forms of every name that has none yet (or of the one given). → { filled, failed, asked }. */
    onNamesFill: async ({ id } = {}) => {
      if (isGenerationActive()) await waitForGenerationEnd();
      const library = normalizeNames(settings.nameLibrary);
      const entries = library.entries.filter(entry => (id ? entry.id === id : !entry.off) && wordsToFill(entry).length);
      if (!entries.length) return { filled: 0, failed: 0, asked: 0 };
      const result = await fillNameForms(routedContext(SillyTavern.getContext(), settings, 'generation'), entries);
      let filled = 0;
      saveNames(current => {
        let next = current;
        for (const patch of result.patches) {
          // The person may have typed forms while the model was thinking: only empty words are filled.
          const entry = next.entries.find(item => item.id === patch.id);
          if (!entry) continue;
          const empty = new Set(wordsToFill(entry).map(word => word.word));
          const words = patch.words.filter(word => empty.has(word.word));
          if (!words.length) continue;
          next = updateName(next, patch.id, { words });
          filled += 1;
        }
        return next;
      });
      return { filled, failed: result.failed, asked: result.asked };
    },
    /** «Выключить в этом чате»: the library stays, this chat just does not send it. */
    onNamesChatOff: ({ off }) => {
      const next = structuredClone(state);
      next.ui ??= {};
      if (off) next.ui.namesOff = true; else delete next.ui.namesOff;
      return commit(next, true).then(() => { refreshPrompt(); });
    },
  };

  /** The song library (Мир → Песни): shared by all chats, kept in the settings; the chat only pins and mutes songs (onSongChat). */
  /** The setup guide of this chat (core/setup-guide.js): the steps with their state, and whether the reminder is switched off here. */
  function setupSnapshot() {
    const personaId = state.ui?.personaId || '';
    const facts = {
      enabled: settings.enabled,
      personaId,
      characters: Object.values(state.entities ?? {}).filter(entity => entity.id !== personaId).length,
      libraryCards: (locationLibrary.get().characters ?? []).length,
      cardsOn: cardsByEntity(state, locationLibrary.get()).size,
      lorebooks: (state.ui?.linkedLorebooks ?? []).length,
      hasPlace: Boolean(currentLocation(state)),
      hasWeather: Boolean(state.world?.weather) || Object.keys(state.ui?.weatherPlan ?? {}).length > 0,
      hasOutfits: Object.values(state.world?.wardrobe ?? {}).some(entry => entry?.outfit),
      hasCalendar: Boolean(state.ui?.calendar && Object.keys(state.ui.calendar).length),
      auxMode: settings.aux?.mode ?? 'off',
    };
    const steps = setupSteps(facts);
    return { steps, progress: setupProgress(steps), off: Boolean(state.ui?.setupOff), remind: settings.setupReminder !== false, enabled: Boolean(settings.enabled) };
  }

  /** «Не напоминать в этом чате» (and back): kept with the chat, never part of the story. */
  const setupCallbacks = {
    onSetupOff: ({ off }) => {
      const next = structuredClone(state);
      next.ui ??= {};
      if (off) next.ui.setupOff = true; else delete next.ui.setupOff;
      return commit(next, true);
    },
  };

  /** The media library («Медиа → Плеер»): links to music and videos, kept in the settings; the player is media-dock.js. */
  function saveMedia(change) {
    settings.mediaLibrary = change(normalizeMedia(settings.mediaLibrary));
    context.saveSettingsDebounced();
    notify();
  }
  const mediaCallbacks = {
    /** The name of a pasted link as its service tells it ('' when it does not). */
    onMediaLookup: ({ url }) => lookupMediaTitle(url),
    onMediaAdd: ({ url, title, note, mood, pinned }) => {
      let made = null;
      saveMedia(library => { made = addMediaItem(library, { url, title, note, mood, pinned }); return made.library; });
      return { ...made.item, existed: made.existed };
    },
    onMediaUpdate: ({ id, patch }) => {
      saveMedia(library => updateMediaItem(library, id, patch ?? {}));
      if (mediaDock.current()?.id === id) { const fresh = normalizeMedia(settings.mediaLibrary).items.find(item => item.id === id); if (fresh && fresh.url !== mediaDock.current().url) mediaDock.play(fresh); }
    },
    onMediaRemove: ({ id }) => {
      if (mediaDock.current()?.id === id) mediaDock.stop();
      saveMedia(library => removeMediaItem(library, id));
    },
    onMediaPlay: ({ id }) => {
      const item = normalizeMedia(settings.mediaLibrary).items.find(entry => entry.id === id);
      if (!item) throw new Error('Такой ссылки уже нет.');
      const started = mediaDock.play(item);
      notify();
      return started;
    },
    onMediaStop: () => { mediaDock.stop(); notify(); },
  };

  // The tab «Плеер» of the scene drawer: the list to pick from (the page «Медиа → Плеер» adds and edits).
  let mediaQuery = '';
  mediaSection.now = () => mediaDock.current()?.id ?? '';
  // What suits the scene now (core/media-suggest.js): the mood of the heroes on stage, the weather and the time against the words of the links.
  let mediaDismissed = new Set();
  let mediaMoodKey = '';
  function mediaSuggestion(view) {
    try {
      const live = SillyTavern.getContext();
      const list = moodList(live.extensionSettings?.pudrenitsa?.moods);
      const present = (view?.cast ?? []).filter(hero => hero.present && !hero.persona).map(hero => hero.name);
      const scene = sceneMoods({ moods: normalizeMoods(live.chatMetadata?.zakulisie_pud?.moods, list), present, list, weather: view?.weather?.kind ?? '', time: view?.time ?? '' });
      // a new mood of the scene: what was waved away before may be right now
      const key = scene.map(item => item.id).sort().join(',');
      if (key !== mediaMoodKey) { mediaMoodKey = key; mediaDismissed = new Set(); }
      const best = suggestMedia(normalizeMedia(settings.mediaLibrary), scene, { dismissed: [...mediaDismissed], playing: mediaDock.current()?.id ?? '' });
      return best ? { id: best.item.id, title: best.item.title, reason: best.mood.label } : null;
    } catch (error) { console.warn('[Kulisy] Media suggestion failed.', error); return null; }
  }
  mediaSection.suggest = mediaSuggestion;
  mediaSection.render = (container, view) => renderMediaPane(container, {
    suggestion: mediaSuggestion(view),
    onDismiss: id => { mediaDismissed.add(id); notify(); },
      library: normalizeMedia(settings.mediaLibrary),
      nowId: mediaDock.current()?.id ?? '',
      nowTitle: mediaDock.current()?.title ?? '',
      query: mediaQuery,
      onQuery: value => { mediaQuery = value; notify(); },
      onPlay: id => { try { mediaCallbacks.onMediaPlay({ id }); } catch (error) { globalThis.toastr?.error?.(error.message, 'Закулисье'); } },
      onStop: () => mediaCallbacks.onMediaStop(),
      onPin: id => { const item = normalizeMedia(settings.mediaLibrary).items.find(entry => entry.id === id); if (item) mediaCallbacks.onMediaUpdate({ id, patch: { pinned: !item.pinned } }); },
      onOpenPage: () => studio.show('player'),
    });

  const songsCallbacks = {
    onSongAdd: ({ title, artist, folderId }) => {
      let made = null;
      saveSongs(library => { made = addSong(library, { title, artist, folderId }); return made.library; });
      return made.song;
    },
    onSongUpdate: ({ id, patch }) => saveSongs(library => updateSong(library, id, patch)),
    onSongRemove: ({ ids }) => saveSongs(library => removeSongs(library, ids ?? [])),
    onSongFolderAdd: ({ name }) => {
      let made = null;
      saveSongs(library => { made = addSongFolder(library, name); return made.library; });
      return made.folder;
    },
    onSongFolderUpdate: ({ id, name, off }) => saveSongs(library => updateSongFolder(library, id, { ...(name !== undefined ? { name } : {}), ...(off !== undefined ? { off } : {}) })),
    onSongFolderRemove: ({ id }) => saveSongs(library => removeSongFolder(library, id)),
    /** { enabled, minWords, lookback, maxCharacters }: only what is given; the library clamps the numbers. */
    onSongsSettings: ({ enabled, minWords, lookback, maxCharacters }) => saveSongs(library => normalizeSongs({
      ...library,
      ...(enabled !== undefined ? { enabled: Boolean(enabled) } : {}),
      ...(minWords !== undefined ? { minWords } : {}),
      ...(lookback !== undefined ? { lookback } : {}),
      ...(maxCharacters !== undefined ? { maxCharacters } : {}),
    })),
    onSongsImport: ({ data }) => {
      let result = null;
      saveSongs(library => { result = importSongs(library, data); return result.library; });
      return { added: result.added, skipped: result.skipped };
    },
    /** What this chat does with a song: { op: 'pin' | 'unpin' | 'mute' | 'unmute', songId, mode, singerId }. */
    onSongChat: async ({ op, songId, mode, singerId }) => {
      const ids = normalizeSongs(settings.songLibrary).songs.map(song => song.id);
      let current = normalizeSongState(state.ui?.songs, { songIds: ids });
      if (op === 'pin') current = pinSong(current, songId, { mode, singerId });
      else if (op === 'unpin') current = unpinSong(current, songId);
      else if (op === 'mute') current = muteSong(current, songId);
      else if (op === 'unmute') current = unmuteSong(current, songId);
      else return false;
      const next = structuredClone(state);
      next.ui ??= {};
      if (current.playing.length || current.muted.length) next.ui.songs = current; else delete next.ui.songs;
      await commit(next, true);
      return true;
    },
  };

  function saveSongs(change) {
    settings.songLibrary = change(normalizeSongs(settings.songLibrary));
    context.saveSettingsDebounced();
    refreshPrompt();
    notify();
  }

  function saveNames(change) {
    settings.nameLibrary = change(normalizeNames(settings.nameLibrary));
    context.saveSettingsDebounced();
    refreshPrompt();
    notify();
  }

  /**
   * The wardrobe as the chronicler sees it: the cards and looks, and `closets` — entityId → { cardIds, lookIds } of the characters
   * whose library card has things tied to it (what they own: the AI changes their clothes from there).
   */
  function wardrobeFor(forState) {
    const base = wardrobeStore.get();
    const closets = closetsByEntity(forState, locationLibrary.get(), base, personalPieces);
    return Object.keys(closets).length ? { ...base, closets } : base;
  }

  /** How the model read the pair for the last factors of a line: shown in its «Факторы роста». */
  async function rememberAnalysis(lineId, analysis) {
    const next = structuredClone(state);
    next.ui ??= {};
    next.ui.analyses = { ...(next.ui.analyses ?? {}), [lineId]: { ...analysis, at: new Date().toISOString() } };
    await commit(next, true);
  }

  /** { name, gender } of a character for trope texts; gender is what was set in the dossier. */
  function personOf(id) {
    const entity = id ? state.entities[id] : null;
    return entity ? { name: entity.name, gender: state.ui?.genders?.[id] ?? '' } : {};
  }

  /** The persona's own lorebook (Persona Management → lorebook), or ''. */
  function personaBookName() {
    const ctx = SillyTavern.getContext();
    const name = ctx.powerUserSettings?.persona_description_lorebook;
    return name && (ctx.getWorldInfoNames?.() ?? []).includes(name) ? name : '';
  }

  /** Books a secret may come from: the chat's books plus the persona's. */
  function secretBooks() {
    const ctx = SillyTavern.getContext();
    const persona = personaBookName();
    return [...new Set([...generationBooks(ctx, state, cardWorldNames()), ...(persona ? [persona] : [])])];
  }

  /** Secret entries of the chat's books: { fresh: not in the journal yet, changed: [{ event, entry }] }. */
  async function loreSecrets(books = secretBooks()) {
    const ctx = SillyTavern.getContext();
    const fresh = [];
    const changed = [];
    for (const name of books) {
      let book;
      try { book = await ctx.loadWorldInfo(name); }
      catch (error) { console.warn(`[Kulisy] Lorebook «${name}» could not be read.`, error); continue; }
      for (const entry of secretEntriesOf(book, name)) {
        const event = loreSecretEvent(state, entry.book, entry.uid);
        if (!event) fresh.push(entry);
        else if ((event.detail ?? '') !== cleanSecretText(entry.content)) changed.push({ event, entry });
      }
    }
    return { fresh, changed };
  }

  /** New lorebook secrets → confirmed knowledge events; edited ones get their new text. */
  async function importLoreSecrets({ books } = {}) {
    if (isGenerationActive()) await waitForGenerationEnd();
    const ctx = SillyTavern.getContext();
    const { fresh, changed } = await loreSecrets(books);
    let next = state;
    const stamp = reason => ({ transactionId: uniqueId('manual'), reason, timestamp: new Date().toISOString() });
    for (const { event, entry } of changed) {
      next = applyOperation(next, createOperation('event.update', { eventId: event.id, changes: { detail: entry.content } }, stamp(`Секрет обновлён по лорбуку: ${event.text}`)));
    }
    let applied = 0;
    if (fresh.length) {
      const proposals = await scanLoreSecrets(routedContext(ctx, settings, 'discovery'), state, fresh, { personaBook: personaBookName() });
      const nameOf = id => escapeHtml(state.entities[id]?.name ?? id);
      const rows = proposals.map(item => `<li style="margin:6px 0"><b>${escapeHtml(item.label)}</b> <small>(«${escapeHtml(item.entry.title)}», ${escapeHtml(item.entry.book)})</small><br>Знают: ${item.knowIds.length ? item.knowIds.map(nameOf).join(', ') : 'никто'}${item.guessed ? ' <small>(по тексту записи)</small>' : ''}${item.missing.length ? `<br><small><b>Нет в списке персонажей:</b> ${item.missing.map(escapeHtml).join(', ')}</small>` : ''}${item.evidence ? `<br><small>«${escapeHtml(item.evidence)}»</small>` : ''}</li>`).join('');
      const accepted = await ctx.Popup.show.confirm('Секреты из лорбука',
        `<p>Найдено новых: ${proposals.length}. Записать? Пока секрет знает только тот, кто в списке, остальным модель его не покажет. Кто знает, потом можно поправить в «Знаниях».</p><ul style="text-align:left">${rows}</ul>`);
      if (accepted === ctx.POPUP_RESULT.AFFIRMATIVE) {
        for (const item of proposals) {
          next = applyOperation(next, createOperation('event.add', {
            item: {
              id: uniqueId('event'), text: item.label, witnessIds: item.knowIds, secret: true,
              lore: { book: item.entry.book, uid: item.entry.uid }, detail: item.entry.content, createdAt: new Date().toISOString(),
            },
          }, stamp(`Секрет из лорбука: ${item.label}`)));
          applied += 1;
        }
      }
    }
    if (next !== state) { await commit(next, true); refreshPrompt(); }
    return { applied, updated: changed.length, found: fresh.length };
  }

  /** On opening a chat: only tell about new secrets, never ask the model by itself. */
  async function remindLoreSecrets() {
    if (!settings.enabled || settings.trackKnowledge === false) return;
    const { fresh, changed } = await loreSecrets();
    if (changed.length) await importLoreSecrets().catch(error => logEvent('warn', 'Секреты из лорбука не обновились', error));
    if (fresh.length) {
      globalThis.toastr?.info?.(`Новых секретов в лорбуках: ${fresh.length}. Закулисье → Персонажи → «Секреты из лорбука».`, 'Закулисье', { timeOut: 10000 });
    }
  }

  function cardWorldNames() {
    const ctx = SillyTavern.getContext();
    let cards = [];
    if (ctx.groupId) {
      const group = (ctx.groups ?? []).find(item => String(item.id) === String(ctx.groupId));
      cards = (group?.members ?? []).map(avatar => (ctx.characters ?? []).find(character => character?.avatar === avatar)).filter(Boolean);
    } else if (ctx.characterId !== undefined && ctx.characterId !== null && ctx.characters?.[ctx.characterId]) {
      cards = [ctx.characters[ctx.characterId]];
    }
    const available = new Set(ctx.getWorldInfoNames?.() ?? []);
    return [...new Set(cards.map(card => card?.data?.extensions?.world).filter(name => name && available.has(name)))];
  }

  /** Character card(s) of the current chat (or every group member) plus the user persona. */
  function cardContext(ctx, maxCharacters = 9000) {
    const substitute = value => {
      const text = String(value ?? '').trim();
      if (!text) return '';
      try { return typeof ctx.substituteParams === 'function' ? ctx.substituteParams(text) : text; }
      catch { return text; }
    };
    let cards = [];
    if (ctx.groupId) {
      const group = (ctx.groups ?? []).find(item => String(item.id) === String(ctx.groupId));
      cards = (group?.members ?? []).map(avatar => (ctx.characters ?? []).find(character => character?.avatar === avatar)).filter(Boolean);
    } else if (ctx.characterId !== undefined && ctx.characterId !== null) {
      const card = ctx.characters?.[ctx.characterId];
      if (card) cards = [card];
    }
    const parts = [];
    const perCard = cards.length ? Math.floor((maxCharacters - 1200) / cards.length) : 0;
    for (const card of cards) {
      const fields = [card.description ?? card.data?.description, card.personality ?? card.data?.personality, card.scenario ?? card.data?.scenario, card.first_mes ?? card.data?.first_mes]
        .map(substitute).filter(Boolean).join('\n');
      if (!fields) continue;
      parts.push(`### Карточка «${card.name}»\n${fields.length > perCard ? `${fields.slice(0, perCard)}…` : fields}`);
    }
    const personaName = String(ctx.name1 ?? '').trim();
    const personaDescription = substitute(ctx.powerUserSettings?.persona_description).slice(0, 1000);
    if (personaName) parts.push(`### Персона пользователя «${personaName}»\n${personaDescription || '(без описания)'}`);
    return parts.join('\n\n');
  }

  /** Find characters inside linked lorebooks, deduplicate against the registry, ask, add. */
  async function analyzeLorebooksForCharacters({ names } = {}) {
    if (isGenerationActive()) await waitForGenerationEnd();
    const ctx = SillyTavern.getContext();
    const books = names ?? (state.ui?.linkedLorebooks ?? []);
    if (!books.length) throw new Error('Нет подключённых лорбуков. Сначала подключите книгу на вкладке «Лорбуки».');
    const registryKeys = new Set();
    for (const entity of Object.values(state.entities)) {
      for (const value of [entity.name, ...(entity.aliases ?? [])]) {
        for (const key of canonKeys(value)) registryKeys.add(key);
      }
    }
    const found = [];
    const aliasUpdates = [];
    const seen = new Set();
    const knownEntities = Object.values(state.entities).map(entity => ({ id: entity.id, name: entity.name, aliases: entity.aliases ?? [] }));
    for (const bookName of books) {
      const book = await ctx.loadWorldInfo(bookName);
      if (!book?.entries) throw new Error(`Не удалось прочитать лорбук «${bookName}».`);
      const { characters, knownAliases } = await analyzeLorebookCharacters(routedContext(ctx, settings, 'discovery'), book, bookName, knownEntities);
      for (const update of knownAliases) {
        const entity = state.entities[update.id];
        if (!entity) continue;
        const fresh = update.aliases.filter(alias => !namesMatch(alias, entity.name) && !(entity.aliases ?? []).some(existing => namesMatch(alias, existing)));
        if (!fresh.length) continue;
        const existingEntry = aliasUpdates.find(item => item.id === update.id);
        if (existingEntry) existingEntry.aliases = [...new Set([...existingEntry.aliases, ...fresh])];
        else aliasUpdates.push({ id: update.id, name: entity.name, aliases: [...fresh] });
      }
      for (const character of characters) {
        const candidateKeys = [...canonKeys(character.name), ...character.aliases.flatMap(alias => [...canonKeys(alias)])];
        if (candidateKeys.some(key => registryKeys.has(key))) continue;
        if (candidateKeys.some(key => seen.has(key))) continue;
        for (const key of candidateKeys) seen.add(key);
        found.push({ ...character, book: bookName });
      }
    }
    if (!found.length && !aliasUpdates.length) {
      globalThis.toastr?.info?.('Новые персонажи в лорбуках не найдены.', 'Закулисье');
      return { found: [], aliasUpdates: [] };
    }
    const newLines = found.map(character =>
      `• ${character.name}${character.aliases.length ? ` (${character.aliases.join(', ')})` : ''}${character.note ? ` — ${character.note}` : ''}\n  из «${character.book}»`).join('\n');
    const aliasLines = aliasUpdates.map(update =>
      `• ${update.name} — распознан как уже существующий; будут добавлены псевдонимы: ${update.aliases.join(', ')}`).join('\n');
    const accepted = await ctx.Popup.show.confirm(
      'Персонажи в лорбуках',
      `${found.length ? `Новые персонажи:\n${newLines}\n\n` : ''}${aliasUpdates.length ? `Уже известные (добавятся псевдонимы для сцепки с лором):\n${aliasLines}\n\n` : ''}Применить?`,
    );
    if (accepted !== ctx.POPUP_RESULT.AFFIRMATIVE) return { found: [], aliasUpdates: [] };
    let next = state;
    for (const character of found) {
      const entity = createEntity(character.name, { aliases: character.aliases });
      next = applyOperation(next, createOperation('entity.upsert', entity, {
        id: uniqueId('lore-character'), reason: `Персонаж из лорбука «${character.book}»`, timestamp: new Date().toISOString(),
      }));
    }
    for (const update of aliasUpdates) {
      const entity = next.entities[update.id];
      if (!entity) continue;
      const merged = createEntity(entity.name, {
        id: entity.id, aliases: [...new Set([...(entity.aliases ?? []), ...update.aliases])],
        avatar: entity.avatar, sourceId: entity.sourceId,
      });
      next = applyOperation(next, createOperation('entity.upsert', merged, {
        id: uniqueId('lore-alias'), reason: 'Псевдонимы из лорбука', timestamp: new Date().toISOString(),
      }));
    }
    await commit(next, true);
    globalThis.toastr?.success?.(`Добавлено персонажей: ${found.length}; обновлено псевдонимов: ${aliasUpdates.length}`, 'Закулисье');
    return { found, aliasUpdates };
  }

  async function analyzeWholeHistory({ onProgress = () => {} } = {}) {    const ctx = SillyTavern.getContext();
    const expectedChatId = ctx.getCurrentChatId();
    const expectedEpoch = chatEpoch;
    const messages = structuredClone(ctx.chat ?? []);
    const originalState = state;
    const originalFingerprint = historyFingerprint(messages);
    function assertCurrent() {
      const current = SillyTavern.getContext();
      if (expectedEpoch !== chatEpoch || current.getCurrentChatId() !== expectedChatId
        || state !== originalState || historyFingerprint(current.chat ?? []) !== originalFingerprint) {
        throw new Error('Чат или настройки отношений изменились во время анализа. Результат не сохранён; повторите запуск.');
      }
    }
    if (!messages.some(message => message?.mes?.trim())) throw new Error('В этом чате пока нет сообщений для анализа.');
    const batches = createHistoryBatches(messages, settings.analysisMaxCharacters);
    const maxBatches = 40;
    if (batches.length > maxBatches) throw new Error(`Чат слишком большой для безопасного анализа за один запуск: ${batches.length} пакетов. Максимум — ${maxBatches}.`);
    if (!batches.length) throw new Error('В чате нет сюжетных сообщений.');
    onProgress('Ищу персонажей в истории…');
    const knownEntities = Object.values(state.entities).map(entity => ({ id: entity.id, name: entity.name, aliases: entity.aliases ?? [] }));
    const { characters: discovered, knownAliases } = await discoverHistoryCharacters(routedContext(ctx, settings, 'discovery'), sampleHistory(messages, settings.analysisMaxCharacters * 2), settings, knownEntities, cardContext(ctx));
    assertCurrent();
    // Registry-aware dedup: never re-add persons the model or transliteration already knows.
    const registryKeys = new Set();
    for (const entity of Object.values(state.entities)) {
      for (const value of [entity.name, ...(entity.aliases ?? [])]) {
        for (const key of canonKeys(value)) registryKeys.add(key);
      }
    }
    const freshCharacters = discovered.filter(character => {
      const candidateKeys = [...canonKeys(character.name), ...character.aliases.flatMap(alias => [...canonKeys(alias)])];
      return !candidateKeys.some(key => registryKeys.has(key));
    });
    const aliasUpdates = [];
    for (const update of knownAliases) {
      const entity = state.entities[update.id];
      if (!entity) continue;
      const fresh = update.aliases.filter(alias => !namesMatch(alias, entity.name) && !(entity.aliases ?? []).some(existing => namesMatch(alias, existing)));
      if (!fresh.length) continue;
      const existingEntry = aliasUpdates.find(item => item.id === update.id);
      if (existingEntry) existingEntry.aliases = [...new Set([...existingEntry.aliases, ...fresh])];
      else aliasUpdates.push({ id: update.id, name: entity.name, aliases: [...fresh] });
    }
    const newNames = freshCharacters.length
      ? freshCharacters.map(character => `• ${character.name}${character.aliases.length ? ` (${character.aliases.join(', ')})` : ''}`).join('\n')
      : '';
    const aliasLines = aliasUpdates.length
      ? aliasUpdates.map(update => `• ${update.name} — уже в реестре; добавятся псевдонимы из чата: ${update.aliases.join(', ')}`).join('\n')
      : '';
    const names = newNames || aliasLines || 'Новых персонажей не найдено; будут использованы уже добавленные.';
    const accepted = await ctx.Popup.show.confirm(
      'Анализ истории чата',
      `${newNames ? `Новые персонажи в истории:\n${escapePopupText(newNames)}\n\n` : ''}${aliasLines ? `Уже известные (добавятся псевдонимы из чата):\n${escapePopupText(aliasLines)}\n\n` : ''}${!newNames && !aliasLines ? `${names}\n\n` : ''}Narrator добавлен не будет. Для истории потребуется ${batches.length} пакетных запросов к текущей модели. Прежние автоматические оценки будут заменены. Продолжить?`,
    );
    if (accepted !== ctx.POPUP_RESULT.AFFIRMATIVE) throw new Error('Анализ истории отменён пользователем.');
    assertCurrent();

    let next = rebuildWithoutAutomaticHistory(state);
    for (const update of aliasUpdates) {
      const entity = next.entities[update.id];
      if (!entity) continue;
      const merged = createEntity(entity.name, {
        id: entity.id, aliases: [...new Set([...(entity.aliases ?? []), ...update.aliases])],
        avatar: entity.avatar, sourceId: entity.sourceId,
      });
      next = applyOperation(next, createOperation('entity.upsert', merged, {
        id: uniqueId('history-alias'), reason: 'Псевдонимы из истории чата', timestamp: new Date().toISOString(),
      }));
    }
    for (const character of freshCharacters) {
      const entity = createEntity(character.name, { aliases: character.aliases });
      if (next.entities[entity.id]) continue;
      next = applyOperation(next, createOperation('entity.upsert', entity, {
        id: uniqueId('history-character'), reason: 'Персонаж найден в истории чата', timestamp: new Date().toISOString(),
      }));
    }
    if (Object.keys(next.entities).length < 2) throw new Error('Нужно как минимум два подтверждённых персонажа. Добавьте их вручную и повторите анализ.');
    const personaMatch = matchPersonaEntity(next);
    if (personaMatch && !next.ui?.personaId) {
      next.ui ??= {};
      next.ui.personaId = personaMatch.id;
    }
    onProgress('Читаю подходящие записи подключённых лорбуков…');
    const loreContext = withCardSheets(await loadLinkedLore(ctx, next, undefined, { skipEntry: sheetSkip(next) }), next, presentIds(next), 5000);
    assertCurrent();

    for (let batchIndex = 0; batchIndex < batches.length; batchIndex += 1) {
      assertCurrent();
      onProgress(`Анализирую историю: пакет ${batchIndex + 1} из ${batches.length}…`);
      const result = await analyzeHistoryBatch(routedContext(ctx, settings, 'analysis'), next, batches[batchIndex], settings, loreContext);
      assertCurrent();
      // History analysis is started by the user explicitly, so persona lines are not asked one by one;
      // only the "no automatic character lines" setting applies.
      next = applyAnalysisResult(next, result, { transactionId: 'history-import' }, [], {
        linkedScales: settings.linkedScales !== false,
        allowNewPair: (subjectId, objectId) => settings.autoCharacterLines !== false || objectId === (next.ui?.personaId || ''),
      }).state;
    }
    assertCurrent();
    next.ui ??= {};
    if (!next.relationships[next.ui.activeRelationshipId]) next.ui.activeRelationshipId = Object.keys(next.relationships)[0] || '';
    next.ui.historyImport = { fingerprint: originalFingerprint, messageCount: messages.length, createdAt: new Date().toISOString() };
    onProgress('Сохраняю найденные отношения…');
    for (const message of SillyTavern.getContext().chat ?? []) {
      if (message.is_user || message.is_system) continue;
      message.extra ??= {};
      message.extra[MESSAGE_EXTRA_KEY] = { fingerprint: fingerprint(message.mes), operationIds: [], historyImported: true };
    }
    await commit(next, true);
    onProgress(`Готово: обработано ${batches.length} пакетов истории.`);
  }

  function escapePopupText(value) {
    return String(value).replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);
  }

  function enqueueHistory(payload) {
    if (historyQueued) return Promise.reject(new Error('Анализ истории уже запущен. Дождитесь завершения.'));
    historyQueued = true;
    const expectedEpoch = chatEpoch;
    const job = analysisQueue.then(() => {
      if (expectedEpoch !== chatEpoch) throw new Error('Чат изменился до начала анализа. Повторите запуск.');
      return analyzeWholeHistory(payload);
    }).finally(() => { historyQueued = false; });
    analysisQueue = job.catch(() => {});
    return job;
  }

  function tavernPersonas() {
    const context = SillyTavern.getContext();
    const personas = context.powerUserSettings?.personas ?? {};
    const chatPersonaAvatar = context.chatMetadata?.persona ?? '';
    return Object.entries(personas)
      .map(([avatarId, name]) => ({ avatarId, name: String(name || '').trim() || avatarId }))
      .filter(persona => persona.name)
      .sort((left, right) => left.name.localeCompare(right.name, 'ru-RU'))
      .map(persona => ({ ...persona, lockedToChat: persona.avatarId === chatPersonaAvatar }));
  }

  /** SillyTavern avatar id of the persona bound in Kulisy (its entity's source, or the same name). */
  function boundPersonaAvatar() {
    const entity = state.ui?.personaId ? state.entities[state.ui.personaId] : null;
    if (!entity) return '';
    const personas = SillyTavern.getContext().powerUserSettings?.personas ?? {};
    if (entity.sourceId && personas[entity.sourceId]) return entity.sourceId;
    const name = entity.name.toLocaleLowerCase('ru-RU');
    return Object.entries(personas).find(([, value]) => String(value ?? '').trim().toLocaleLowerCase('ru-RU') === name)?.[0] ?? '';
  }

  /** The card of the persona of this chat: by her SillyTavern persona, else by her name. */
  function personaCardNow() {
    const entity = state.ui?.personaId ? state.entities[state.ui.personaId] : null;
    return findPersonaCard(locationLibrary.get().characters, { id: state.ui?.personaCard, avatar: boundPersonaAvatar(), names: entity ? [entity.name, ...(entity.aliases ?? [])] : [] });
  }

  /** Which library card each character of this chat has: the attached ones, and the persona's own. */
  function cardOfEntity() {
    const map = new Map([...cardsByEntity(state, locationLibrary.get())].map(([entityId, card]) => [entityId, card.id]));
    const persona = personaCardNow();
    if (persona && state.ui?.personaId) map.set(state.ui.personaId, persona.id);
    return map;
  }

  /** The cards of everyone on stage; the persona is always there. */
  function presentCardIdsNow() {
    const map = cardOfEntity();
    const ids = presentIds(state).map(id => map.get(id)).filter(Boolean);
    const persona = personaCardNow();
    if (persona) ids.push(persona.id);
    return [...new Set(ids)];
  }

  /**
   * The records of this chat → the library (see onBondsMigrate). Only on the button: nothing moves by itself.
   */
  async function moveChatToBonds({ types }) {
    const map = cardOfEntity();
    let lib = locationLibrary.get();
    let next = structuredClone(state);
    next.ui ??= {};
    const markOf = (cardIds, text) => `${[...cardIds].sort().join('|')}#${String(text ?? '').trim().toLocaleLowerCase('ru-RU')}`;
    const have = new Set((lib.bonds ?? []).map(bond => markOf(bond.cardIds, bond.text)));
    const put = (kind, cardIds, item, off) => {
      const mark = markOf(cardIds, item.text);
      if (!have.has(mark)) {
        lib = addBond(lib, { type: kind, text: item.text, cardIds, off, intensity: item.intensity, pinned: item.pinned === true }).library;
        have.add(mark);
      }
    };
    let moved = 0;
    let skipped = 0;
    for (const [kind, collection] of [['memory', 'memories'], ['tension', 'tensions']]) {
      if (!types.includes(kind)) continue;
      for (const item of collectRecords(state, collection)) {
        const cardIds = item.participantIds.map(id => map.get(id));
        if (!cardIds.length || cardIds.some(id => !id)) { skipped += 1; continue; }
        try {
          put(kind, cardIds, item, item.disabled === true);
          next = applyOperation(next, createOperation(`${kind}.remove`, { shared: !item.relationshipId, relationshipId: item.relationshipId ?? undefined, itemId: item.id }, { transactionId: uniqueId('manual'), reason: 'Перенос записи в библиотеку', timestamp: new Date().toISOString() }));
          moved += 1;
        } catch { skipped += 1; }
      }
    }
    if (types.includes('headcanon')) {
      next.ui ??= {};
      for (const [key, entry] of Object.entries(state.ui?.headcanons ?? {})) {
        const items = entry.items ?? [];
        if (!items.length) continue;
        const cardIds = headcanonPairIds(key).map(id => map.get(id));
        if (cardIds.some(id => !id)) { skipped += items.length; continue; }
        const kept = [];
        for (const item of items) {
          try { put('headcanon', cardIds, item, item.enabled === false); moved += 1; } catch { kept.push(item); skipped += 1; }
        }
        const target = next.ui.headcanons[key];
        target.items = kept;
        if (!kept.length && typeof target.auto !== 'boolean') delete next.ui.headcanons[key];
      }
    }
    if (!moved) return { moved, skipped };
    locationLibrary.set(lib);
    await commit(next, true);
    return { moved, skipped };
  }

  /** What this chat holds that can move to the library, by type: { headcanon, memory, tension }, each { ready, skipped }. */
  function bondsChatInfo() {
    const map = cardOfEntity();
    const info = { headcanon: { ready: 0, skipped: 0 }, memory: { ready: 0, skipped: 0 }, tension: { ready: 0, skipped: 0 } };
    for (const [key, entry] of Object.entries(state.ui?.headcanons ?? {})) {
      const count = (entry.items ?? []).length;
      if (!count) continue;
      if (headcanonPairIds(key).every(id => map.has(id))) info.headcanon.ready += count; else info.headcanon.skipped += count;
    }
    for (const [type, kind] of [['memory', 'memories'], ['tension', 'tensions']]) {
      for (const item of collectRecords(state, kind)) {
        if (item.participantIds.length && item.participantIds.every(id => map.has(id))) info[type].ready += 1; else info[type].skipped += 1;
      }
    }
    return info;
  }

  /** What the persona of this chat has in her description in SillyTavern (it goes to the model on its own, next to the card). */
  function tavernPersonaDescription() {
    try {
      const ps = SillyTavern.getContext().powerUserSettings;
      const avatar = personaAvatarForChat();
      return String(ps?.persona_descriptions?.[avatar]?.description || ps?.persona_description || '').trim();
    } catch { return ''; }
  }

  /** Cards of personas that an earlier version kept in the settings move into the library (folder «Персоны»), once. */
  function movePersonaCardsToLibrary() {
    try {
      const stored = normalizePersonaCards(settings.personaCards);
      if (!stored.cards.length) return;
      let lib = locationLibrary.get();
      for (const fields of migratePersonaCards(stored.cards)) {
        try { lib = addLibraryCharacter(lib, { ...fields, persona: true }).library; }
        catch (error) { logEvent('warn', `Карточка персоны «${fields.name}» не перенесена в библиотеку`, error); }
      }
      locationLibrary.set(lib);
      settings.personaCards = { ...stored, cards: [] };
      context.saveSettingsDebounced();
    } catch (error) { logEvent('warn', 'Карточки персон не перенесены в библиотеку', error); }
  }

  /** Once: the English nicknames and the signs in the nicknames of the cards go (the button «Почистить клички» does the same on demand). */
  function tidyAliasesOnce() {
    try {
      if (settings.aliasesTidied) return;
      const done = stripLatinAliases(locationLibrary.get());
      if (done.aliases) locationLibrary.set(done.library);
      settings.aliasesTidied = true;
      context.saveSettingsDebounced();
    } catch (error) { logEvent('warn', 'Клички карточек не почищены', error); }
  }

  function savePersonaCards(change) {
    settings.personaCards = change(normalizePersonaCards(settings.personaCards));
    context.saveSettingsDebounced();
    refreshPrompt();
    notify();
  }

  /** The persona's hidden character: only for the factor analysis, never for the narrator or the analyzer. */
  function personaPrivateText() {
    const own = privateText(personaCardNow());
    if (own) return own;
    const avatar = boundPersonaAvatar();
    return avatar ? String(settings.personaPrivate?.[avatar] ?? '') : '';
  }

  /** Once: the hidden characters an earlier version kept in the settings move into the «Скрытый характер» section of the persona cards. */
  function movePersonaPrivateToCards() {
    try {
      const stored = settings.personaPrivate ?? {};
      if (!Object.keys(stored).length) return;
      let lib = locationLibrary.get();
      let changed = false;
      for (const card of lib.characters.filter(item => item.persona && item.avatar && stored[item.avatar])) {
        if (!privateText(card)) {
          const sections = card.sections.map(section => ({ ...section }));
          const hidden = sections.find(section => section.kind === 'private');
          if (hidden) hidden.text = String(stored[card.avatar]).trim(); else sections.push({ kind: 'private', title: 'Hidden character', text: String(stored[card.avatar]).trim() });
          lib = updateLibraryCharacter(lib, card.id, { sections });
        }
        delete stored[card.avatar];
        changed = true;
      }
      if (changed) { locationLibrary.set(lib); settings.personaPrivate = { ...stored }; context.saveSettingsDebounced(); }
    } catch (error) { logEvent('warn', 'Скрытый характер персоны не перенесён в карточку', error); }
  }

  /** The hidden character as the generator gets it, when the persona is one of these characters. */
  function privateFor(ids) {
    const personaId = state.ui?.personaId;
    const text = personaPrivateText().trim();
    return personaId && text && ids.includes(personaId) ? { name: state.entities[personaId]?.name ?? '', text } : null;
  }

  function personaAvatarForChat() {
    const context = SillyTavern.getContext();
    const chatAvatar = context.chatMetadata?.persona ?? '';
    if (chatAvatar && context.powerUserSettings?.personas?.[chatAvatar]) return chatAvatar;
    return context.powerUserSettings?.default_persona ?? '';
  }

  function matchPersonaEntity(targetState) {
    const context = SillyTavern.getContext();
    const avatar = personaAvatarForChat();
    const personaName = String((avatar && context.powerUserSettings?.personas?.[avatar]) || context.name1 || '').trim();
    if (!personaName) return null;
    const normalized = personaName.toLocaleLowerCase('ru-RU');
    return Object.values(targetState.entities).find(entity =>
      entity.name.toLocaleLowerCase('ru-RU') === normalized
      || (entity.aliases ?? []).some(alias => alias.toLocaleLowerCase('ru-RU') === normalized)) ?? null;
  }

  async function autoBindPersona(targetState, immediate = true) {
    const current = targetState.ui?.personaId;
    if (current && targetState.entities[current]) return targetState;
    const match = matchPersonaEntity(targetState);
    if (!match) return targetState;
    const next = structuredClone(targetState);
    next.ui ??= {};
    next.ui.personaId = match.id;
    await commit(next, immediate);
    return next;
  }

  let personaSyncing = false;
  /**
   * The persona you wear in SillyTavern IS the persona of this chat: no choosing, no «Привязать». Runs when a chat opens and when the persona
   * is switched. Her card follows by itself (found by her avatar); a card picked by hand before is let go.
   */
  async function syncPersonaFromTavern() {
    if (personaSyncing || !settings.enabled) return;
    personaSyncing = true;
    const epoch = chatEpoch;
    try {
      await personaApi.ready();
      const avatar = personaApi.current();
      const known = SillyTavern.getContext().powerUserSettings?.personas ?? {};
      if (!avatar || !String(known[avatar] ?? '').trim()) return;
      // Persons of SillyTavern worn before (their entity was made from a persona avatar) are marked once, whatever happened in older chats.
      const marks = new Set(state.ui?.formerPersonas ?? []);
      for (const entity of Object.values(state.entities ?? {})) {
        if (entity.id !== state.ui?.personaId && entity.sourceId && entity.sourceId !== avatar && String(known[entity.sourceId] ?? '').trim()) marks.add(entity.id);
      }
      if (marks.size !== (state.ui?.formerPersonas ?? []).length) {
        const marked = structuredClone(state);
        marked.ui ??= {};
        marked.ui.formerPersonas = [...marks];
        await commit(marked, true);
      }
      if (boundPersonaAvatar() === avatar && !state.ui?.personaCard) return;
      if (epoch !== chatEpoch) return;
      await setTavernPersona({ avatarId: avatar });
    } catch (error) {
      logEvent('warn', 'Персона чата не подхватилась из таверны', error);
    } finally {
      personaSyncing = false;
    }
  }

  async function setTavernPersona({ avatarId }) {
    const context = SillyTavern.getContext();
    const personas = context.powerUserSettings?.personas ?? {};
    if (avatarId && !personas[avatarId]) throw new Error('Персона не найдена в списке персон SillyTavern.');
    let next = state;
    const former = state.ui?.personaId || '';
    let personaName = '';
    if (avatarId) {
      personaName = String(personas[avatarId] || '').trim();
      if (!personaName) throw new Error('У этой персоны не задано имя.');
      const normalized = personaName.toLocaleLowerCase('ru-RU');
      const existing = Object.values(next.entities).find(entity =>
        entity.name.toLocaleLowerCase('ru-RU') === normalized
        || (entity.aliases ?? []).some(alias => alias.toLocaleLowerCase('ru-RU') === normalized));
      if (!existing) {
        const entity = createEntity(personaName, { sourceId: avatarId });
        next = applyOperation(next, createOperation('entity.upsert', entity, {
          id: uniqueId('persona-entity'), reason: 'Персона SillyTavern', timestamp: new Date().toISOString(),
        }));
        next.ui ??= {};
        next.ui.personaId = entity.id;
      } else {
        next = structuredClone(next);
        next.ui ??= {};
        next.ui.personaId = existing.id;
      }
      if (next.ui) delete next.ui.personaCard;
    } else {
      next = structuredClone(next);
      next.ui ??= {};
      next.ui.personaId = '';
    }
    next = retireFormerPersona(next, former);
    await commit(next, true);
  }

  /**
   * The persona was switched: the one worn before stays in the chat as an ordinary character, which looked like a phantom hero (and kept her card).
   * With no lines, no scenes and no events she is removed (a clean sheet); with a history she stays, marked «прежняя персона» so she can be removed by hand.
   */
  function retireFormerPersona(source, formerId) {
    const nowId = source.ui?.personaId || '';
    const marks = new Set((source.ui?.formerPersonas ?? []).filter(id => id !== nowId && source.entities?.[id]));
    if (!formerId || formerId === nowId || !source.entities?.[formerId]) {
      let result = source;
      if (marks.size !== (source.ui?.formerPersonas ?? []).length) { result = structuredClone(source); result.ui ??= {}; if (marks.size) result.ui.formerPersonas = [...marks]; else delete result.ui.formerPersonas; }
      return result;
    }
    const used = Object.values(source.relationships ?? {}).some(relation => relation.from === formerId || relation.to === formerId)
      || presentIds(source).includes(formerId)
      || (source.knowledge?.events ?? []).some(event => (event.witnessIds ?? []).includes(formerId));
    if (!used) {
      const removed = applyOperation(source, createOperation('entity.remove', { entityId: formerId }, { transactionId: uniqueId('persona-swap'), reason: 'Прежняя персона без истории', timestamp: new Date().toISOString() }));
      const clean = structuredClone(removed);
      clean.ui ??= {};
      if (marks.size) clean.ui.formerPersonas = [...marks]; else delete clean.ui.formerPersonas;
      return clean;
    }
    const marked = structuredClone(source);
    marked.ui ??= {};
    marked.ui.formerPersonas = [...marks, formerId];
    return marked;
  }

  /** A hand edit of knowledge: journaled without a message, so swipes and re-checks leave it alone. */
  async function manualKnowledge(type, payload, reason) {
    await commit(applyOperation(state, createOperation(type, payload, {
      transactionId: uniqueId('manual'), reason, timestamp: new Date().toISOString(),
    })), true);
  }

  function requireCharacter(id) {
    if (!state.entities[id]) throw new Error('Персонаж не найден.');
  }

  function requireEvent(id) {
    const event = (state.knowledge?.events ?? []).find(item => item.id === id);
    if (!event) throw new Error('Событие не найдено.');
    return event;
  }

  /**
   * Leaks the chronicler flagged on replies, still open: the character still cannot
   * know the event (nobody told them since, it was not switched off). Newest first.
   */
  function openLeaks(chat = SillyTavern.getContext().chat ?? []) {
    const leaks = [];
    const lastIndex = chat.length - 1;
    chat.forEach((message, messageIndex) => {
      for (const leak of message?.extra?.[MESSAGE_EXTRA_KEY]?.leaks ?? []) {
        const event = (state.knowledge?.events ?? []).find(item => item.id === leak.eventId);
        if (!event || event.disabled || !state.entities[leak.entityId] || howKnows(state, leak.entityId, event)) continue;
        leaks.push({
          messageIndex, entityId: leak.entityId, eventId: leak.eventId, quote: leak.quote ?? '',
          name: state.entities[leak.entityId].name, eventText: event.text, canSwipe: messageIndex === lastIndex,
        });
      }
    });
    return leaks.reverse();
  }

  /** How often each factor moved its line: { relationshipId: { factor text: count } }, from the journal. */
  function factorHits() {
    const hits = {};
    for (const operation of state.operations ?? []) {
      const { relationshipId: id, factor } = operation.type === 'scale.delta' ? operation.payload ?? {} : {};
      if (!id || !factor) continue;
      hits[id] ??= {};
      hits[id][factor] = (hits[id][factor] ?? 0) + 1;
    }
    return hits;
  }

  /** Deaths the chronicler proposed and nobody answered yet; newest first. */
  function openDeaths(chat = SillyTavern.getContext().chat ?? []) {
    const deaths = [];
    chat.forEach((message, messageIndex) => {
      for (const death of message?.extra?.[MESSAGE_EXTRA_KEY]?.deaths ?? []) {
        if (!state.entities[death.entityId] || isDead(state, death.entityId)) continue;
        deaths.push({ messageIndex, entityId: death.entityId, name: state.entities[death.entityId].name, note: death.note ?? '', quote: death.quote ?? '' });
      }
    });
    return deaths.reverse();
  }

  /** Quest proposals of the chronicler nobody answered yet, worded for the plaque; newest first. */
  function openQuestHints(chat = SillyTavern.getContext().chat ?? []) {
    const hints = [];
    chat.forEach((message, messageIndex) => {
      for (const hint of message?.extra?.[MESSAGE_EXTRA_KEY]?.quests ?? []) {
        const quest = questsOf(state).find(item => item.id === hint.questId);
        if (hint.kind === 'new') {
          if (questsOf(state).some(item => item.name.toLocaleLowerCase('ru-RU') === hint.name.toLocaleLowerCase('ru-RU'))) continue;
          hints.push({ messageIndex, id: hint.id, title: `Похоже, началось задание «${hint.name}».`, detail: [hint.text, hint.steps?.length ? `Шагов: ${hint.steps.length}` : ''].filter(Boolean).join(' '), confirm: 'Добавить квест', confirmTitle: 'Добавить квест в список (квесты этого ответа откатываются свайпом)' });
        } else if (hint.kind === 'step') {
          if (!quest || quest.status !== 'active' || quest.steps.find(step => step.id === hint.stepId)?.done !== false) continue;
          hints.push({ messageIndex, id: hint.id, title: `Шаг квеста «${quest.name}» сделан?`, detail: `«${hint.stepText}»`, confirm: 'Отметить шаг', confirmTitle: 'Отметить шаг выполненным' });
        } else if (hint.kind === 'stage') {
          // The intimate stage is proposed on the same plaque; it counts only while it still fits the scene.
          const current = state.world?.intimacy;
          const to = stageOf(hint.to);
          if (!to || current?.lock || (current?.stage ?? null) !== (hint.from ?? null)) continue;
          hints.push({ messageIndex, id: hint.id, icon: 'fa-heart', title: `Сцена дошла до стадии «${to.label}»?`, detail: [hint.why, 'Рассказчик будет писать только эту стадию.'].filter(Boolean).join(' '), confirm: `Перейти: ${to.label}`, confirmTitle: 'Поставить эту стадию: рассказчик пишет только её, один шаг за ответ' });
        } else if (hint.kind === 'end') {
          if (!quest || quest.status !== 'active') continue;
          const label = hint.status === 'done' ? 'выполнен' : 'провален';
          const shifts = closingShifts(quest, hint.status).length;
          hints.push({ messageIndex, id: hint.id, title: `Квест «${quest.name}» ${label}?`, detail: [hint.note, shifts ? `Отношения сдвинутся: ${shifts}` : ''].filter(Boolean).join(' '), confirm: `Закрыть: ${label}`, confirmTitle: shifts ? 'Закрыть квест; обещанные сдвиги отношений применятся' : 'Закрыть квест' });
        }
      }
    });
    return hints.reverse();
  }

  async function forgetQuestHint(messageIndex, hintId) {
    const ctx = SillyTavern.getContext();
    const marker = ctx.chat?.[messageIndex]?.extra?.[MESSAGE_EXTRA_KEY];
    if (!marker?.quests) return;
    marker.quests = marker.quests.filter(hint => hint.id !== hintId);
    if (!marker.quests.length) delete marker.quests;
    await ctx.saveChat();
  }

  /** Lorebook secrets the chronicler thinks someone found out; still unanswered. Newest first. */
  function openReveals(chat = SillyTavern.getContext().chat ?? []) {
    const reveals = [];
    chat.forEach((message, messageIndex) => {
      for (const reveal of message?.extra?.[MESSAGE_EXTRA_KEY]?.reveals ?? []) {
        const event = (state.knowledge?.events ?? []).find(item => item.id === reveal.eventId);
        if (!event || !state.entities[reveal.entityId] || howKnows(state, reveal.entityId, event)) continue;
        reveals.push({
          messageIndex, entityId: reveal.entityId, eventId: event.id, name: state.entities[reveal.entityId].name, eventText: event.text,
          how: reveal.source === 'rumor' ? 'слух' : reveal.fromId && state.entities[reveal.fromId] ? `рассказал(а) ${state.entities[reveal.fromId].name}` : '',
        });
      }
    });
    return reveals.reverse();
  }

  /** Guesses at secrets the chronicler offered under replies and nobody answered; newest first. */
  function openSecretHints(chat = SillyTavern.getContext().chat ?? []) {
    const hints = [];
    chat.forEach((message, messageIndex) => {
      for (const hint of message?.extra?.[MESSAGE_EXTRA_KEY]?.secrets ?? []) {
        const event = (state.knowledge?.events ?? []).find(item => item.id === hint.eventId);
        if (!event || event.secret || event.disabled) continue;
        hints.push({ messageIndex, eventId: event.id, text: event.text, names: event.witnessIds.map(id => state.entities[id]?.name).filter(Boolean).join(', ') });
      }
    });
    return hints.reverse();
  }

  async function forgetSecretHint(messageIndex, eventId) {
    const ctx = SillyTavern.getContext();
    const marker = ctx.chat?.[messageIndex]?.extra?.[MESSAGE_EXTRA_KEY];
    if (!marker?.secrets) return;
    marker.secrets = marker.secrets.filter(hint => hint.eventId !== eventId);
    if (!marker.secrets.length) delete marker.secrets;
    await ctx.saveChat();
  }

  /** The posts a secret may be built from: the message itself, then the one before and the one after it. */
  function secretNeighbours(chat, index) {
    if (!Number.isInteger(index)) return [];
    const usable = at => {
      const message = chat[at];
      return message && !message.is_system && String(message.mes ?? '').trim() ? { at, text: String(message.mes) } : null;
    };
    const nameOfMessage = message => (message?.is_user ? 'твой пост' : 'ответ');
    return [index, index - 1, index + 1].map(usable).filter(Boolean)
      .map((item, order) => ({ key: `m${order + 1}`, label: `#${item.at} · ${item.at === index ? 'этот ' : ''}${nameOfMessage(chat[item.at])}`, text: item.text }));
  }

  /** «Создать секрет»: from a selected passage, from an event (its proposal or its card), or from nothing. Saved only after «Сохранить». */
  async function createSecretFlow({ text = '', messageIndex = null, eventId = null } = {}) {
    if (!settings.enabled) throw new Error('Закулисье выключено.');
    const ctx = SillyTavern.getContext();
    const event = eventId ? requireEvent(eventId) : null;
    const chat = ctx.chat ?? [];
    const anchor = Number.isInteger(messageIndex) ? messageIndex : event ? (bornAt(state).get(event.id) ?? null) : null;
    const quiet = routedContext(ctx, settings, 'discovery');
    const result = await openSecretDialog(ctx, {
      title: event ? 'Секрет из события' : 'Новый секрет',
      text: text || event?.text || '',
      neighbours: secretNeighbours(chat, anchor),
      roster: Object.values(state.entities).filter(entity => !isDead(state, entity.id)).map(entity => ({ id: entity.id, name: entity.name })),
      presentIds: presentIds(state),
      knowIds: event?.witnessIds ?? [],
      compose: input => composeSecret(quiet, state, { ...input, presentIds: presentIds(state) }),
    });
    if (!result) return null;
    if (event) {
      requireEvent(event.id);
      await manualKnowledge('event.update', { eventId: event.id, changes: { text: result.label, witnessIds: result.knowIds, own: true, detail: result.detail } }, `Секрет: ${result.label}`);
      if (Number.isInteger(messageIndex)) await forgetSecretHint(messageIndex, event.id);
    } else {
      await manualKnowledge('event.add', {
        item: {
          id: uniqueId('event'), text: result.label, witnessIds: result.knowIds, own: true, detail: result.detail,
          ...(state.knowledge?.scene?.location ? { location: state.knowledge.scene.location } : {}), createdAt: new Date().toISOString(),
        },
      }, `Секрет: ${result.label}`);
    }
    refreshPrompt();
    notify();
    globalThis.toastr?.success?.(`Секрет сохранён: ${result.label}`, 'Закулисье');
    return { saved: true };
  }

  /** Old automatic «secrets»: the model sorts real from not, the person ticks what to un-mark. */
  async function stripAutoSecrets() {
    if (!settings.enabled) throw new Error('Закулисье выключено.');
    const ctx = SillyTavern.getContext();
    const events = autoSecrets(state);
    if (!events.length) { globalThis.toastr?.info?.('Автоматических секретов нет.', 'Закулисье'); return { changed: 0 }; }
    globalThis.toastr?.info?.('Проверяю, какие секреты настоящие…', 'Закулисье', { timeOut: 2500 });
    let verdicts = new Map();
    let failure = '';
    try { verdicts = await classifyAutoSecrets(routedContext(ctx, settings, 'discovery'), state, events); }
    catch (error) { failure = String(error?.message ?? error); }
    const rows = events.map((event, index) => ({ event, verdict: verdicts.get(event.id), id: `kulisy-strip-${index}` }));
    const inputs = rows.map(row => ({
      id: row.id,
      label: `${row.event.text}${row.verdict ? ` — ${row.verdict.secret ? 'похоже, настоящий' : 'обычная сцена'}${row.verdict.why ? `: ${row.verdict.why}` : ''}` : ''}`,
      defaultState: Boolean(row.verdict) && !row.verdict.secret,
    }));
    const popup = new ctx.Popup(
      `<h3>Секреты, которые летописец отметил сам</h3><p>Отмеченные перестают быть секретами: событие и его свидетели остаются, уходит только пометка. Секреты из лорбука и созданные тобой не показаны.${failure ? ` Модель не ответила (${escapeHtml(failure)}): отметь сама.` : ''}</p>`,
      ctx.POPUP_TYPE.CONFIRM, null,
      { okButton: 'Снять секретность с отмеченных', cancelButton: 'Отмена', customInputs: inputs, wide: true, allowVerticalScrolling: true, leftAlign: true },
    );
    const answer = await popup.show();
    if (answer !== ctx.POPUP_RESULT.AFFIRMATIVE) return { changed: 0 };
    let next = state;
    let changed = 0;
    for (const row of rows) {
      if (!popup.inputResults?.get(row.id) || !(next.knowledge?.events ?? []).some(item => item.id === row.event.id)) continue;
      next = applyOperation(next, createOperation('event.update', { eventId: row.event.id, changes: { secret: false } }, {
        transactionId: uniqueId('manual'), reason: `Секретность снята: ${row.event.text}`, timestamp: new Date().toISOString(),
      }));
      changed += 1;
    }
    if (changed) { await commit(next, true); refreshPrompt(); notify(); }
    globalThis.toastr?.success?.(changed ? `Секретность снята: ${changed}` : 'Ничего не отмечено, всё осталось как было.', 'Закулисье');
    return { changed };
  }

  /** Chains of near-identical events: the model proposes one text per chain, the person ticks which to fold. */
  async function foldDuplicateEvents() {
    if (!settings.enabled) throw new Error('Закулисье выключено.');
    const ctx = SillyTavern.getContext();
    const buckets = duplicateBuckets(state);
    if (!buckets.length) { globalThis.toastr?.info?.('Событий с одинаковыми свидетелями почти нет: склеивать нечего.', 'Закулисье'); return { folded: 0 }; }
    globalThis.toastr?.info?.('Ищу дубли среди событий…', 'Закулисье', { timeOut: 2500 });
    const { proposals, errors, checkedIds } = await foldEvents(routedContext(ctx, settings, 'discovery'), state, buckets);
    // Whatever the model looked at is not offered again: otherwise the button never runs out.
    const markChecked = async () => {
      if (!checkedIds.length) return;
      const next = structuredClone(state);
      next.ui ??= {};
      next.ui.tidyEvents = [...new Set([...(next.ui.tidyEvents ?? []), ...checkedIds])];
      await commit(next, true);
    };
    if (!proposals.length) {
      if (errors.length) globalThis.toastr?.warning?.(`Модель не ответила: ${errors[0]}`, 'Закулисье');
      else { await markChecked(); globalThis.toastr?.info?.('Склеивать нечего: все события проверены, они про разное.', 'Закулисье'); }
      return { folded: 0 };
    }
    const list = proposals.map((item, index) => `<li style="margin:8px 0"><b>Группа ${index + 1}.</b> Было:<ul style="margin:2px 0;padding-left:18px">${item.was.map(entry => `<li>${escapeHtml(entry.text)}</li>`).join('')}</ul>Станет: <i>${escapeHtml(item.text)}</i></li>`).join('');
    const inputs = proposals.map((item, index) => ({ id: `kulisy-fold-${index}`, label: `Склеить группу ${index + 1} (${item.was.length} → 1)`, defaultState: true }));
    const popup = new ctx.Popup(
      `<h3>Склейка событий</h3><p>Модель прошла все круги сама: каждая группа ниже уже склеена до конца. У событий в группе одни и те же свидетели. Первое событие группы получит общий текст, остальные уйдут. Что не вошло в группы, больше не предлагается.</p><ol style="text-align:left;padding-left:20px">${list}</ol>`,
      ctx.POPUP_TYPE.CONFIRM, null,
      { okButton: 'Склеить отмеченные', cancelButton: 'Отмена', customInputs: inputs, wide: true, allowVerticalScrolling: true, leftAlign: true },
    );
    const answer = await popup.show();
    if (answer !== ctx.POPUP_RESULT.AFFIRMATIVE) return { folded: 0 };
    let next = state;
    let folded = 0;
    const stamp = reason => ({ transactionId: uniqueId('manual'), reason, timestamp: new Date().toISOString() });
    proposals.forEach((item, index) => {
      if (!popup.inputResults?.get(inputs[index].id)) return;
      const present = new Set((next.knowledge?.events ?? []).map(event => event.id));
      if (!present.has(item.keepId) || item.removeIds.some(id => !present.has(id))) return;
      next = applyOperation(next, createOperation('event.update', { eventId: item.keepId, changes: { text: item.text } }, stamp(`События склеены: ${item.text}`)));
      for (const id of item.removeIds) next = applyOperation(next, createOperation('event.remove', { eventId: id }, stamp(`Склеено с другим событием: ${item.was.find(entry => entry.id === id)?.text ?? ''}`)));
      folded += item.removeIds.length;
    });
    if (folded) { await commit(next, true); refreshPrompt(); notify(); }
    await markChecked();
    globalThis.toastr?.success?.(folded ? `Склеено событий: ${folded}. Остальные проверены: повторно они не предлагаются.${errors.length ? ` Часть групп модель не обработала: ${errors.length}.` : ''}` : 'Ничего не отмечено, всё осталось как было.', 'Закулисье');
    return { folded };
  }

  async function forgetReveal(messageIndex, entityId, eventId) {
    const ctx = SillyTavern.getContext();
    const marker = ctx.chat?.[messageIndex]?.extra?.[MESSAGE_EXTRA_KEY];
    if (!marker?.reveals) return;
    marker.reveals = marker.reveals.filter(reveal => !(reveal.entityId === entityId && reveal.eventId === eventId));
    if (!marker.reveals.length) delete marker.reveals;
    await ctx.saveChat();
  }

  async function forgetDeath(messageIndex, entityId) {
    const ctx = SillyTavern.getContext();
    const marker = ctx.chat?.[messageIndex]?.extra?.[MESSAGE_EXTRA_KEY];
    if (!marker?.deaths) return;
    marker.deaths = marker.deaths.filter(death => death.entityId !== entityId);
    if (!marker.deaths.length) delete marker.deaths;
    await ctx.saveChat();
  }

  /** Continuity slips the scene chronicler flagged, newest first (dismissed ones are gone from the marker). */
  function openSlips(chat = SillyTavern.getContext().chat ?? []) {
    const slips = [];
    const lastIndex = chat.length - 1;
    chat.forEach((message, messageIndex) => {
      (message?.extra?.[MESSAGE_EXTRA_KEY]?.slips ?? []).forEach((slip, slipIndex) => {
        slips.push({ ...slip, messageIndex, slipIndex, label: SLIP_LABELS[slip.kind] ?? slip.kind, name: slip.entityId ? state.entities[slip.entityId]?.name ?? '' : '', canSwipe: messageIndex === lastIndex });
      });
    });
    return slips.reverse();
  }

  async function forgetLeak(messageIndex, entityId, eventId) {
    const ctx = SillyTavern.getContext();
    const marker = ctx.chat?.[messageIndex]?.extra?.[MESSAGE_EXTRA_KEY];
    if (!marker?.leaks) return;
    marker.leaks = marker.leaks.filter(leak => !(leak.entityId === entityId && leak.eventId === eventId));
    if (!marker.leaks.length) delete marker.leaks;
    await ctx.saveChat();
  }

  const knowledgeCallbacks = {
    /** Who already knows whom by the lore. Proposals are confirmed; hand-set pairs are never touched. */
    onScanAcquaintances: async () => {
      if (isGenerationActive()) await waitForGenerationEnd();
      const ctx = SillyTavern.getContext();
      const loreContext = await loreAbout(Object.keys(state.entities));
      const proposals = await scanAcquaintances(routedContext(ctx, settings, 'discovery'), state, { loreContext, cardText: cardContext(ctx) });
      const fresh = proposals.filter(item => state.entities[item.firstId] && state.entities[item.secondId]
        && !state.knowledge?.acquaintances?.[pairKey(item.firstId, item.secondId)]);
      if (!fresh.length) {
        globalThis.toastr?.info?.('Новых знакомств в лоре не найдено.', 'Закулисье');
        return { applied: 0 };
      }
      const rows = fresh.map(item => `<li style="margin:4px 0"><b>${escapeHtml(state.entities[item.firstId].name)} и ${escapeHtml(state.entities[item.secondId].name)}</b> — ${item.status === 'known' ? 'знакомы' : 'встречались, имён не знают'}${item.evidence ? `<br><small>«${escapeHtml(item.evidence)}»</small>` : ''}</li>`).join('');
      const accepted = await ctx.Popup.show.confirm('Знакомства из лорбука',
        `<p>Найдено: ${fresh.length}. Записать? Любое можно потом поправить в досье персонажа.</p><ul style="text-align:left">${rows}</ul>`);
      if (accepted !== ctx.POPUP_RESULT.AFFIRMATIVE) return { applied: 0 };
      let next = state;
      for (const item of fresh) {
        next = applyOperation(next, createOperation('acquaintance.set', { firstId: item.firstId, secondId: item.secondId, status: item.status }, {
          transactionId: uniqueId('manual'), reason: `Знакомство по лорбуку${item.evidence ? `: «${item.evidence}»` : ''}`, timestamp: new Date().toISOString(),
        }));
      }
      await commit(next, true);
      return { applied: fresh.length };
    },
    onScanSecrets: () => importLoreSecrets(),
    onCreateSecret: payload => createSecretFlow(payload ?? {}),
    onStripAutoSecrets: () => stripAutoSecrets(),
    onFoldEvents: () => foldDuplicateEvents(),
    onSetScene: async ({ presentIds: ids, location }) => {
      const payload = { presentIds: ids ?? presentIds(state) };
      if (location != null) payload.location = String(location);
      await manualKnowledge('scene.set', payload, 'Сцена поправлена вручную');
    },
    onTogglePresent: async ({ characterId: id, present }) => {
      requireCharacter(id);
      const ids = new Set(presentIds(state));
      if (present) ids.add(id); else ids.delete(id);
      await manualKnowledge('scene.set', { presentIds: [...ids] }, `${state.entities[id].name} ${present ? 'в сцене' : 'уходит со сцены'}`);
    },
    onAddEvent: async ({ text, witnessIds = [], secret = false, location }) => {
      const clean = String(text ?? '').trim();
      if (!clean) throw new Error('Опишите событие.');
      await manualKnowledge('event.add', {
        item: { id: uniqueId('event'), text: clean, witnessIds, ...(secret ? { secret: true } : {}), ...(location ? { location } : {}), createdAt: new Date().toISOString() },
      }, `Событие вручную: ${clean}`);
    },
    onUpdateEvent: async ({ eventId, changes }) => {
      requireEvent(eventId);
      await manualKnowledge('event.update', { eventId, changes }, 'Событие поправлено вручную');
    },
    onRemoveEvent: async ({ eventId }) => {
      const event = requireEvent(eventId);
      await manualKnowledge('event.remove', { eventId }, `Событие удалено: ${event.text}`);
    },
    onToggleKnowledge: async ({ kind, itemId, disabled }) => {
      await manualKnowledge('knowledge.toggle', { kind: kind === 'learned' ? 'learned' : 'event', itemId, disabled: Boolean(disabled) },
        disabled ? 'Выключено вручную' : 'Включено вручную');
    },
    onAddLearned: async ({ eventId, entityId, source = 'told', fromId }) => {
      const event = requireEvent(eventId);
      requireCharacter(entityId);
      if (howKnows(state, entityId, event)) throw new Error(`${state.entities[entityId].name} уже знает об этом.`);
      await manualKnowledge('learned.add', {
        item: { id: uniqueId('learned'), eventId, entityId, source: source === 'rumor' ? 'rumor' : 'told', ...(fromId ? { fromId } : {}) },
      }, `${state.entities[entityId].name} знает: ${event.text}`);
    },
    /** The secrets page: one click says who knows. Lorebook secrets keep knowers as witnesses. */
    onSetSecretKnower: async ({ eventId, entityId, knows }) => {
      const event = requireEvent(eventId);
      requireCharacter(entityId);
      const name = state.entities[entityId].name;
      const how = howKnows(state, entityId, event);
      if (knows && !how) {
        if (event.lore) await manualKnowledge('event.update', { eventId, changes: { witnessIds: [...event.witnessIds, entityId] } }, `${name} знает секрет: ${event.text}`);
        else await manualKnowledge('learned.add', { item: { id: uniqueId('learned'), eventId, entityId, source: 'told' } }, `${name} знает секрет: ${event.text}`);
      } else if (!knows && how) {
        if (how.source === 'seen') await manualKnowledge('event.update', { eventId, changes: { witnessIds: event.witnessIds.filter(id => id !== entityId) } }, `${name} не знает секрет: ${event.text}`);
        else if (how.learnedId) await manualKnowledge('learned.remove', { learnedId: how.learnedId }, `${name} не знает секрет: ${event.text}`);
      }
      refreshPrompt();
    },
    onRemoveLearned: async ({ learnedId }) => {
      await manualKnowledge('learned.remove', { learnedId }, 'Знание убрано вручную');
    },
    onSetAcquaintance: async ({ firstId, secondId, status }) => {
      requireCharacter(firstId);
      requireCharacter(secondId);
      await manualKnowledge('acquaintance.set', { firstId, secondId, status: status ?? null },
        `Знакомство: ${state.entities[firstId].name} и ${state.entities[secondId].name} — ${status ?? 'по канону'}`);
    },
    /** "He knows": the leak was fine after all — record how, drop the flag. */
    onLeakKnows: async ({ messageIndex, entityId, eventId, source = 'told' }) => {
      const event = requireEvent(eventId);
      requireCharacter(entityId);
      if (!howKnows(state, entityId, event)) {
        await manualKnowledge('learned.add', { item: { id: uniqueId('learned'), eventId, entityId, source: source === 'rumor' ? 'rumor' : 'told' } },
          `${state.entities[entityId].name} знает (отмечено на утечке): ${event.text}`);
      }
      await forgetLeak(messageIndex, entityId, eventId);
      notify();
    },
    /** By hand (dossier): not bound to a message, so no swipe takes it back. dead: false = alive again. */
    onSetDeath: async ({ entityId, dead = true, note = '' }) => {
      requireCharacter(entityId);
      const name = state.entities[entityId].name;
      await manualKnowledge('death.set', { entityId, dead: Boolean(dead), note }, dead ? `${name}: умер(ла)${note ? ` — ${note}` : ''}` : `${name}: снова жив(а)`);
      refreshPrompt();
      notify();
    },
    /** From the plaque: journaled with that message, so deleting or re-checking it takes the death back. */
    onDeathConfirm: async ({ messageIndex, entityId }) => {
      requireCharacter(entityId);
      const ctx = SillyTavern.getContext();
      const marker = ctx.chat?.[messageIndex]?.extra?.[MESSAGE_EXTRA_KEY];
      const proposal = marker?.deaths?.find(death => death.entityId === entityId);
      if (!marker || !proposal) throw new Error('Отметка уже снята.');
      const operation = createOperation('death.set', { entityId, dead: true, note: proposal.note ?? '' }, {
        transactionId: marker.transactionId ?? uniqueId('death'), messageId: String(messageIndex), messageIndex,
        id: uniqueId('analysis'), reason: `${state.entities[entityId].name}: умер(ла)${proposal.note ? ` — ${proposal.note}` : ''}`, timestamp: new Date().toISOString(),
      });
      marker.operationIds = [...(marker.operationIds ?? []), operation.id];
      await commit(applyOperation(state, operation), true);
      await forgetDeath(messageIndex, entityId);
      refreshPrompt();
      notify();
    },
    /** From the plaque: the secret is learned with that message, so deleting it takes this back. */
    onRevealConfirm: async ({ messageIndex, entityId, eventId }) => {
      const event = requireEvent(eventId);
      requireCharacter(entityId);
      const ctx = SillyTavern.getContext();
      const marker = ctx.chat?.[messageIndex]?.extra?.[MESSAGE_EXTRA_KEY];
      const proposal = marker?.reveals?.find(reveal => reveal.entityId === entityId && reveal.eventId === eventId);
      if (!marker || !proposal) throw new Error('Отметка уже снята.');
      if (!howKnows(state, entityId, event)) {
        const operation = createOperation('learned.add', {
          item: { id: uniqueId('learned'), eventId, entityId, source: proposal.source === 'rumor' ? 'rumor' : 'told', ...(proposal.fromId ? { fromId: proposal.fromId } : {}) },
        }, {
          transactionId: marker.transactionId ?? uniqueId('reveal'), messageId: String(messageIndex), messageIndex,
          id: uniqueId('analysis'), reason: `${state.entities[entityId].name} узнаёт секрет: ${event.text}`, timestamp: new Date().toISOString(),
        });
        marker.operationIds = [...(marker.operationIds ?? []), operation.id];
        await commit(applyOperation(state, operation), true);
      }
      await forgetReveal(messageIndex, entityId, eventId);
      refreshPrompt();
      notify();
    },
    onRevealDismiss: async ({ messageIndex, entityId, eventId }) => {
      await forgetReveal(messageIndex, entityId, eventId);
      notify();
    },
    /** From the plaque: journaled with that message, so deleting or re-checking it takes the quest change back. */
    onQuestHintConfirm: async ({ messageIndex, hintId }) => {
      const ctx = SillyTavern.getContext();
      const marker = ctx.chat?.[messageIndex]?.extra?.[MESSAGE_EXTRA_KEY];
      const hint = marker?.quests?.find(item => item.id === hintId);
      if (!marker || !hint) throw new Error('Отметка уже снята.');
      const meta = reason => ({ transactionId: marker.transactionId ?? uniqueId('quest'), messageId: String(messageIndex), messageIndex, id: uniqueId('analysis'), reason, timestamp: new Date().toISOString() });
      const quest = questsOf(state).find(item => item.id === hint.questId);
      const operations = [];
      if (hint.kind === 'new') {
        operations.push(createOperation('quest.add', { item: { id: questId(), name: hint.name, text: hint.text, steps: hint.steps ?? [] } }, meta(`Новый квест: ${hint.name}`)));
      } else if (hint.kind === 'stage') {
        operations.push(createOperation('intimacy.set', { stage: hint.to, why: hint.why ?? '' }, meta(`Стадия близости: ${stageOf(hint.to)?.label ?? hint.to}`)));
      } else if (hint.kind === 'step') {
        if (!quest) throw new Error('Квест уже удалён.');
        operations.push(createOperation('quest.step', { questId: quest.id, stepId: hint.stepId, done: true }, meta(`Квест «${quest.name}»: шаг выполнен`)));
      } else if (hint.kind === 'end') {
        if (!quest) throw new Error('Квест уже удалён.');
        const label = hint.status === 'done' ? 'выполнен' : 'провален';
        operations.push(createOperation('quest.update', { questId: quest.id, changes: { status: hint.status, outcome: hint.note ?? '' } }, meta(`Квест «${quest.name}» ${label}`)));
        for (const shift of cleanShifts(closingShifts(quest, hint.status), state)) {
          operations.push(createOperation('scale.delta', { relationshipId: shift.relationshipId, scaleId: shift.scaleId, value: shift.value }, meta(`Квест «${quest.name}» ${label}: сдвиг отношений`)));
        }
      }
      marker.operationIds = [...(marker.operationIds ?? []), ...operations.map(operation => operation.id)];
      await commit(applyOperations(state, operations), true);
      await forgetQuestHint(messageIndex, hintId);
      refreshPrompt();
      notify();
      if (hint.kind === 'stage') await diceResend();
    },
    onQuestHintDismiss: async ({ messageIndex, hintId }) => {
      await forgetQuestHint(messageIndex, hintId);
      notify();
    },
    onDeathDismiss: async ({ messageIndex, entityId }) => {
      await forgetDeath(messageIndex, entityId);
      notify();
    },
    onLeakDismiss: async ({ messageIndex, entityId, eventId }) => {
      await forgetLeak(messageIndex, entityId, eventId);
      notify();
    },
    /** Only the last reply can be swiped in SillyTavern. */
    onLeakSwipe: async ({ messageIndex }) => {
      const ctx = SillyTavern.getContext();
      if (messageIndex !== (ctx.chat?.length ?? 0) - 1) throw new Error('Свайпнуть можно только последний ответ.');
      if (typeof ctx.swipe?.right !== 'function') throw new Error('Эта версия SillyTavern не даёт расширениям свайпать. Свайпните ответ вручную.');
      await ctx.swipe.right(null, { message: ctx.chat[messageIndex] });
    },
  };

  /** The picture model, with a time limit: a request that never comes back must not stall a whole batch. */
  const PICTURE_TIMEOUT_MS = 120_000;
  /** The model that describes personas: '' (as the pictures of the wardrobe), 'main', or 'profile:<id>'. */
  function personaLookValue() {
    const own = settings.personaLook;
    if (own?.mode === 'main') return 'main';
    if (own?.mode === 'profile' && own.profileId) return `profile:${own.profileId}`;
    return '';
  }

  function askPicture(dataUrl, prompt, options = {}) {
    return withBusy('Описываю картинку…', () => new Promise((resolve, reject) => {
      const limit = options.timeoutMs || PICTURE_TIMEOUT_MS;
      const timer = setTimeout(() => reject(new Error(`Модель для картинок не ответила за ${Math.round(limit / 60000)} мин. Проверьте её в «Настройки → Модели и API → Картинки».`)), limit);
      Promise.resolve()
        .then(() => askAboutImage(SillyTavern.getContext(), options.persona && personaLookValue() ? visionSettings({ ...settings.wardrobeVision, ...settings.personaLook }) : settings.wardrobeVision, dataUrl, prompt, { maxTokens: options.maxTokens }))
        .then(resolve, reject)
        .finally(() => clearTimeout(timer));
    }));
  }

  const libraryCallbacks = createLibraryCallbacks({
    library: locationLibrary,
    getState: () => state,
    commitOperations: operations => commit(applyOperations(state, operations), true),
    replaceState: next => commit(next, true),
    confirm: async (title, text) => {
      const ctx = SillyTavern.getContext();
      return (await ctx.Popup.show.confirm(title, escapeHtml(text))) === ctx.POPUP_RESULT.AFFIRMATIVE;
    },
    listBooks: () => SillyTavern.getContext().getWorldInfoNames?.() ?? [],
    loadBook: async name => {
      const ctx = SillyTavern.getContext();
      if (!(ctx.getWorldInfoNames?.() ?? []).includes(name)) throw new Error('Лорбук не найден. Обновите список.');
      return ctx.loadWorldInfo(name);
    },
    notify: text => globalThis.toastr?.success?.(text, 'Закулисье'),
    // Pictures of places and things: the same server folder rules and the same picture model as the wardrobe.
    // In the folder, a thing's picture goes to «Гардероб/Вещи»; places and the rest stay in the library folder.
    upload: (dataUrl, name, kind) => (settings.imageStorage === 'folder' && kind === 'items'
      ? uploadToTree(SillyTavern.getContext(), dataUrl, THINGS_DIR, name)
      : uploadWardrobeImage(SillyTavern.getContext(), dataUrl, name, LIBRARY_IMAGE_FOLDER, settings.imageStorage)),
    removeImage: path => deleteWardrobeImage(SillyTavern.getContext(), path),
    imageForModel: path => storedImageForModel(path),
    inbox: { list: () => listInbox('library') },
    /** A persona card's new picture becomes the persona's avatar in SillyTavern. */
    setPersonaAvatar: async (avatar, dataUrl) => { await personaApi.setImage(avatar, dataUrl); notify(); },
    /** The picture of a persona as SillyTavern keeps it. */
    avatarForModel: async avatar => {
      const response = await fetch(`/User Avatars/${encodeURIComponent(avatar)}`);
      if (!response.ok) throw new Error('Картинка персоны в таверне не найдена.');
      const blob = await response.blob();
      return shrinkDataUrl(await fileToDataUrl(new File([blob], 'persona', { type: blob.type || 'image/png' })), VISION_MAX_SIDE);
    },
    prepareImage: dataUrl => shrinkDataUrl(dataUrl, VISION_MAX_SIDE),
    lightImage: dataUrl => shrinkDataUrl(dataUrl, VISION_MAX_SIDE, { jpeg: true }),
    ask: (dataUrl, prompt, options) => askPicture(dataUrl, prompt, options),
    names: { get: () => normalizeNames(settings.nameLibrary), change: change => saveNames(change) },
    translateSections: (sections, onProgress) => translateSections(routedContext(SillyTavern.getContext(), settings, 'translation'), sections, onProgress),
    log: (level, text, error) => logEvent(level, text, error),
  });

  const worldCallbacks = createWorldCallbacks({
    getState: () => state,
    commitOperations: operations => commit(applyOperations(state, operations), true),
    replaceState: next => commit(next, true),
    chat: () => SillyTavern.getContext().chat,
    saveChat: () => SillyTavern.getContext().saveChat(),
    markerKey: MESSAGE_EXTRA_KEY,
    input: (title, text, value) => SillyTavern.getContext().Popup.show.input(escapeHtml(title), escapeHtml(text), value),
    swipe: messageIndex => knowledgeCallbacks.onLeakSwipe({ messageIndex }),
    editMessage: messageIndex => {
      const edit = document.querySelector(`#chat .mes[mesid="${Number(messageIndex)}"] .mes_edit`);
      if (!edit) throw new Error('Сообщение не найдено на экране: прокрутите к нему и нажмите «Изменить».');
      edit.click();
    },
    reminders,
    openStudio: (tab, options) => studio.show(tab, options),
    refresh: () => { refreshPrompt(); notify(); },
  });

  // The folder «Гардероб» (wardrobe-inbox.js): how many pictures wait there. Checked at start,
  // when the tab comes back into focus (after dropping files in Explorer) and after an import.
  function refreshInbox() {
    if (inboxChecking) return inboxChecking;
    inboxChecking = (async () => {
      let next = { available: false, count: 0, places: [], things: 0, reason: '' };
      let library = { available: false, count: 0, reason: '' };
      try {
        const plugin = await folderStorageStatus();
        if (!plugin.installed) { next.reason = 'no-plugin'; library.reason = 'no-plugin'; }
        else if (!plugin.ready) { next.reason = 'no-folder'; library.reason = 'no-folder'; }
        else {
          if (!inboxPrepared) { await prepareInbox(SillyTavern.getContext(), inboxDirectories()); inboxPrepared = true; }
          const listed = await listInbox();
          const clothes = newTreeFiles(listed, wardrobeStore.get().cards);
          const things = newThingFiles(listed, locationLibrary.get().items);
          // where the new pictures lie: the wardrobe page tells the sections and badges them
          const places = clothes.map(file => { const { shelf, gender, category } = placeFromPath(file.path); return { shelf, gender, category }; });
          next = { available: true, count: clothes.length + things.length, places, things: things.length, reason: '' };
          // The library tree needs the plugin 0.4.0: an older one would lay the library's folders out inside «Гардероб».
          const [major, minor] = String(plugin.version ?? '').split('.').map(Number);
          if (!(major > 0 || minor >= 4)) library.reason = 'old-plugin';
          else {
            try {
              await prepareInbox(SillyTavern.getContext(), libraryDirectories(locationLibrary.get()), 'library');
              library = { available: true, count: newLibraryFiles(await listInbox('library'), locationLibrary.get()).length, reason: '' };
            } catch (error) {
              library.reason = 'error';
              logEvent('warn', 'Папку «Библиотека» не удалось проверить', error);
            }
          }
        }
      } catch (error) {
        // A plugin older than 0.3.0 has no tree: the rest of the folder storage still works.
        next = { available: false, count: 0, reason: 'error' };
        library = { available: false, count: 0, reason: 'error' };
        logEvent('warn', 'Папку «Гардероб» не удалось проверить', error);
      }
      const same = (a, b) => a.available === b.available && a.count === b.count && a.reason === b.reason && JSON.stringify(a.places ?? []) === JSON.stringify(b.places ?? []) && (a.things ?? 0) === (b.things ?? 0);
      const changed = !same(next, inboxInfo) || !same(library, libraryInboxInfo);
      inboxInfo = next;
      libraryInboxInfo = library;
      if (changed) notify();
      return inboxInfo;
    })().finally(() => { inboxChecking = null; });
    return inboxChecking;
  }
  globalThis.addEventListener?.('focus', () => { refreshInbox().catch(() => {}); });
  refreshInbox().catch(() => {});

  const wardrobeCallbacks = createWardrobeCallbacks({
    store: wardrobeStore,
    getState: () => state,
    commitOperations: operations => commit(applyOperations(state, operations), true),
    confirm: async (title, text) => {
      const ctx = SillyTavern.getContext();
      return (await ctx.Popup.show.confirm(title, escapeHtml(text))) === ctx.POPUP_RESULT.AFFIRMATIVE;
    },
    // In the folder, a wardrobe picture goes into its section folder of «Гардероб», named after the card.
    upload: (dataUrl, name, card) => (settings.imageStorage === 'folder'
      ? uploadToTree(SillyTavern.getContext(), dataUrl, treeDirFor(card), card?.name || 'картинка')
      : uploadWardrobeImage(SillyTavern.getContext(), dataUrl, name)),
    relocate: (path, dir) => moveTreeImage(SillyTavern.getContext(), path, dir),
    isTreeImage,
    treeDirOf,
    inbox: { list: () => listInbox() },
    // Pictures of «Гардероб/Вещи» become things of the library.
    things: {
      pending: files => newThingFiles(files, locationLibrary.get().items),
      import: (files, options) => libraryCallbacks.onLibraryImportThings({ files, ...options }),
    },
    removeImage: path => deleteWardrobeImage(SillyTavern.getContext(), path),
    imageForModel: path => storedImageForModel(path),
    ask: (dataUrl, prompt) => askPicture(dataUrl, prompt),
    translateSections: (sections, onProgress) => translateSections(routedContext(SillyTavern.getContext(), settings, 'translation'), sections, onProgress),
    log: (level, text, error) => logEvent(level, text, error),
  });

  const horaeCallbacks = createHoraeCallbacks({
    getState: () => state,
    commitOperations: operations => commit(applyOperations(state, operations), true),
    chat: () => SillyTavern.getContext().chat,
    saveChat: () => SillyTavern.getContext().saveChat(),
    chronicle: chronicleState,
    saveChronicle,
    chronicleConfig: () => chronicleConfig(settings.chronicle),
    library: locationLibrary,
    createEntity: name => createEntity(name),
    // Same as SillyTavern's /unhide does to the row: the message is shown and sent again.
    markShown: index => document.querySelector(`#chat .mes[mesid="${Number(index)}"]`)?.setAttribute('is_system', 'false'),
    log: (level, text, error) => logEvent(level, text, error),
  });

  const chronicleRunner = createChronicleRunner({
    settings: () => settings,
    saveSettings: () => context.saveSettingsDebounced(),
    chronicle: chronicleState,
    save: saveChronicle,
    chat: () => SillyTavern.getContext().chat,
    saveChat: () => SillyTavern.getContext().saveChat(),
    context: () => routedContext(SillyTavern.getContext(), settings, 'analysis'),
    persona: () => state.entities[state.ui?.personaId]?.name ?? '',
    isGenerating: () => isGenerationActive(),
    waitForGeneration: () => waitForGenerationEnd(),
    chatKey: () => `${SillyTavern.getContext().getCurrentChatId()}:${chatEpoch}`,
    confirm: async (title, text) => {
      const ctx = SillyTavern.getContext();
      return (await ctx.Popup.show.confirm(title, escapeHtml(text))) === ctx.POPUP_RESULT.AFFIRMATIVE;
    },
    refresh: () => refreshPrompt(),
    notify: text => globalThis.toastr?.info?.(text, 'Закулисье'),
    log: (level, text, error) => logEvent(level, text, error),
  });

  /** Other names from the chat's lorebooks (name-sources.js): the entries about a character list their spellings. */
  let aliasRun = null;
  function enrichAliases() {
    if (aliasRun) return aliasRun;
    const epoch = chatEpoch;
    aliasRun = (async () => {
      try {
        const ctx = SillyTavern.getContext();
        const books = [];
        for (const name of generationBooks(ctx, state, cardWorldNames())) {
          try { books.push(await ctx.loadWorldInfo(name)); } catch (error) { logEvent('warn', `Лорбук «${name}» не прочитан для других имён`, error); }
        }
        if (epoch !== chatEpoch) return 0;
        await fillGenders(books).catch(error => logEvent('warn', 'Пол по лорбуку не определился', error));
        if (epoch !== chatEpoch) return 0;
        const operations = aliasOperations(state, aliasesFromBooks(state, books));
        if (!operations.length) return 0;
        await commit(applyOperations(state, operations), true);
        logEvent('info', `Другие имена из лорбука: ${operations.map(operation => operation.payload.name).join(', ')}`);
        notify();
        return operations.length;
      } catch (error) {
        logEvent('warn', 'Другие имена из лорбука не добавились', error);
        return 0;
      } finally { aliasRun = null; }
    })();
    return aliasRun;
  }

  /**
   * Empty genders from the characters' own lore (profile entries, the card, the persona
   * description), by pronouns, no model request. A gender chosen in the dossier stays.
   */
  async function fillGenders(books) {
    const ctx = SillyTavern.getContext();
    const extra = {};
    const cards = ctx.groupId
      ? ((ctx.groups ?? []).find(item => String(item.id) === String(ctx.groupId))?.members ?? []).map(avatar => (ctx.characters ?? []).find(character => character?.avatar === avatar)).filter(Boolean)
      : (ctx.characters?.[ctx.characterId] ? [ctx.characters[ctx.characterId]] : []);
    for (const card of cards) {
      const entity = Object.values(state.entities).find(item => namesMatch(item.name, card.name));
      if (entity) extra[entity.id] = `${card.description ?? card.data?.description ?? ''}
${card.personality ?? card.data?.personality ?? ''}`;
    }
    const personaId = state.ui?.personaId;
    if (personaId) extra[personaId] = String(ctx.powerUserSettings?.persona_description ?? '');
    for (const entityId of cardsByEntity(state, locationLibrary.get()).keys()) extra[entityId] = `${extra[entityId] ?? ''}\n${digestFor(state, locationLibrary.get(), [entityId], 6000)}`;
    const guesses = guessGenders(state, books, extra);
    if (!Object.keys(guesses).length) return;
    const next = structuredClone(state);
    next.ui ??= {};
    next.ui.genders = { ...(next.ui.genders ?? {}), ...guesses };
    await commit(next, true);
    logEvent('info', `Пол по лорбуку: ${Object.entries(guesses).map(([id, gender]) => `${state.entities[id]?.name ?? id} — ${gender === 'female' ? 'ж' : 'м'}`).join(', ')}`);
  }

  /** The user said these two are different people: never offered as twins again. */
  async function markDistinct(firstId, secondId) {
    const next = structuredClone(state);
    next.ui ??= {};
    next.ui.distinctPairs = [...new Set([...(next.ui.distinctPairs ?? []), distinctKey(firstId, secondId)])];
    await commit(next, true);
    notify();
  }

  /** Which spelling is the main one: the old name becomes another name. */
  async function setMainName(entityId, name) {
    const entity = state.entities[entityId];
    const value = String(name ?? '').trim();
    if (!entity || !value || value === entity.name) return false;
    const aliases = [entity.name, ...(entity.aliases ?? [])].filter(alias => alias.trim().toLowerCase() !== value.toLowerCase());
    const metadata = { transactionId: `manual:name:${Date.now().toString(36)}`, reason: `Главное имя: ${entity.name} → ${value}`, timestamp: new Date().toISOString() };
    await commit(applyOperations(state, [createOperation('entity.upsert', { ...entity, name: value, aliases }, metadata)]), true);
    refreshPrompt();
    notify();
    return true;
  }

  /** One character recorded twice: `fromId` goes into `intoId` (a manual change, its own transaction). */
  async function mergeCharacters(pairs, { ask = true } = {}) {
    const valid = (pairs ?? []).filter(pair => pair && state.entities[pair.fromId] && state.entities[pair.intoId] && pair.fromId !== pair.intoId);
    if (!valid.length) throw new Error('Нечего объединять.');
    const ctx = SillyTavern.getContext();
    const list = valid.map(pair => `<li>${escapeHtml(state.entities[pair.fromId].name)} → ${escapeHtml(state.entities[pair.intoId].name)}</li>`).join('');
    const clashes = mergeClashes(state, valid);
    const clashText = clashes.length
      ? `<p>Линии были у обоих — шкалы останутся как у второго (сумм не будет, ничего не съедет):</p><ul style="text-align:left;margin:0;padding-left:18px">${clashes.map(clash => `<li>${escapeHtml(clash.line)}: ${escapeHtml(clash.kept)}${clash.dropped ? ` <span style="opacity:.7">(у двойника было: ${escapeHtml(clash.dropped)})</span>` : ''}</li>`).join('')}</ul>`
      : '';
    if (ask) {
      const ok = await ctx.Popup.show.confirm('Объединить персонажей',
        `<ul style="text-align:left;margin:0;padding-left:18px">${list}</ul><p>Первое имя станет другим именем второго. Линии, воспоминания, знания, одежда и вещи перейдут к нему. Шкалы перенесённых линий не меняются.</p>${clashText}<p>Отменить можно в «Истории».</p>`);
      if (ok !== ctx.POPUP_RESULT.AFFIRMATIVE) return false;
    }
    const metadata = { transactionId: `manual:merge:${Date.now().toString(36)}`, reason: `Объединены: ${valid.map(pair => `${state.entities[pair.fromId].name} → ${state.entities[pair.intoId].name}`).join(', ')}`, timestamp: new Date().toISOString() };
    await commit(applyOperations(state, valid.map(pair => createOperation('entity.merge', pair, metadata))), true);
    refreshPrompt();
    notify();
    return true;
  }

  const callbacks = {
    onMergeCharacters: ({ pairs }) => mergeCharacters(pairs),
    onDistinctCharacters: ({ firstId, secondId }) => markDistinct(firstId, secondId),
    onSetMainName: ({ entityId, name }) => setMainName(entityId, name),
    onAliasesFromLore: () => enrichAliases(),
    ...knowledgeCallbacks,
    ...calendarCallbacks,
    ...namesCallbacks,
    ...songsCallbacks,
    ...mediaCallbacks,
    ...setupCallbacks,
    ...weatherCallbacks,
    ...diceCallbacks,
    ...questCallbacks,
    ...libraryCallbacks,
    ...chronicleRunner.callbacks,
    ...worldCallbacks,
    ...wardrobeCallbacks,
    onWardrobeImportInbox: async payload => {
      try { return await wardrobeCallbacks.onWardrobeImportInbox(payload); }
      finally { refreshInbox().catch(() => {}); }
    },
    onLibraryImportInbox: async payload => {
      try { return await libraryCallbacks.onLibraryImportInbox(payload); }
      finally { refreshInbox().catch(() => {}); }
    },
    ...horaeCallbacks,
    onSetTavernPersona: setTavernPersona,
    onAddTriangle: async ({ centerId, firstId, secondId, name }) => {
      const edges = triangleEdges(centerId, firstId, secondId);
      if ([centerId, firstId, secondId].some(id => !state.entities[id])) throw new Error('Персонаж не найден.');
      let next = state;
      for (const [from, to] of edges) for (const [a, b] of [[from, to], [to, from]]) {
        const id = relationshipId(a, b);
        if (!next.relationships[id]) next = applyOperation(next, createOperation('relationship.upsert', { from: a, to: b }, { id: uniqueId('relationship') }));
      }
      next = structuredClone(next);
      next.ui ??= {};
      next.ui.triangles ??= [];
      next.ui.triangles.push({ id: uniqueId('triangle'), name: name || 'Треугольник', centerId, firstId, secondId });
      await commit(next, true);
    },
    /** «Выбор сделан»: chosenId — the side the center chose; null reopens the triangle. */
    onResolveTriangle: async ({ id, chosenId }) => {
      const next = structuredClone(state);
      const triangle = (next.ui?.triangles ?? []).find(item => item.id === id);
      if (!triangle) throw new Error('Треугольник не найден.');
      if (chosenId) {
        if (![triangle.firstId, triangle.secondId].includes(chosenId)) throw new Error('Выбрать можно только одну из сторон.');
        triangle.resolved = { chosenId, at: new Date().toISOString() };
      } else delete triangle.resolved;
      await commit(next, true);
      refreshPrompt();
    },
    /** Rival's jealousy when the center grows closer to the other side in front of them. */
    onSetTriangleEcho: async ({ id, enabled }) => {
      const next = structuredClone(state);
      const triangle = (next.ui?.triangles ?? []).find(item => item.id === id);
      if (!triangle) throw new Error('Треугольник не найден.');
      if (enabled) delete triangle.noEcho; else triangle.noEcho = true;
      await commit(next, true);
    },
    onRemoveTriangle: async ({ id }) => {
      const next = structuredClone(state);
      next.ui.triangles = (next.ui.triangles ?? []).filter(item => item.id !== id);
      await commit(next, true);
    },
    onSetTriangleGoal: async ({ id, goal }) => {
      const next = structuredClone(state);
      const triangle = (next.ui?.triangles ?? []).find(item => item.id === id);
      if (!triangle) throw new Error('Треугольник не найден.');
      const text = String(goal ?? '').trim().slice(0, 500);
      if (text) triangle.goal = text; else delete triangle.goal;
      await commit(next, true);
    },
    onGenerateTriangleGoal: async ({ id, wish }) => {
      if (isGenerationActive()) await waitForGenerationEnd();
      const triangle = findTriangle(id);
      const loreContext = await loreAbout([triangle.centerId, triangle.firstId, triangle.secondId]);
      return generateTriangleGoal(routedContext(SillyTavern.getContext(), settings, 'generation'), state, triangle, { loreContext, wish });
    },
    onTriangleLines: ({ id }) => triangleLines(findTriangle(id)),
    onGenerateTriangleFactors: async ({ id, goal }) => {
      if (isGenerationActive()) await waitForGenerationEnd();
      const triangle = findTriangle(id);
      const lines = triangleLines(triangle);
      const loreContext = await loreAbout([triangle.centerId, triangle.firstId, triangle.secondId]);
      const factors = await generateTriangleFactors(routedContext(SillyTavern.getContext(), settings, 'generation'), state, triangle, lines, { goal: goal ?? triangle.goal, loreContext, cardText: cardContext(SillyTavern.getContext()), personaPrivate: privateFor([triangle.centerId, triangle.firstId, triangle.secondId]) });
      return withLineIds(factors);
    },
    onTriangleTropes: () => triangleTropes(),
    onTriangleTropeFactors: ({ id, tropeId }) => {
      const triangle = findTriangle(id);
      const result = triangleTropeFactors(tropeId, triangle, state.config.scales.map(scale => scale.id), state.ui?.personaId || '', personOf);
      return { goal: result.goal, factors: withLineIds(result.factors).map(factor => ({ ...factor, origin: `triangle-trope:${tropeId}` })) };
    },
    /** Saves the combined editor: every tracked line of the triangle gets exactly the listed factors
     * (and, when given, the listed pace). */
    onSetTriangleFactors: async ({ id, factors, paceByLine }) => {
      const triangle = findTriangle(id);
      let next = state;
      for (const line of triangleLines(triangle)) {
        if (!next.relationships[line.relationshipId]) {
          next = applyOperation(next, createOperation('relationship.upsert', { from: line.from, to: line.to }, { id: uniqueId('relationship') }));
        }
      }
      const meta = { transactionId: uniqueId('manual'), reason: `Факторы треугольника «${triangle.name}»`, timestamp: new Date().toISOString() };
      next = applyOperations(next, triangleLines(triangle).map(line => createOperation('factors.set', {
        relationshipId: line.relationshipId,
        factors: (factors ?? []).filter(factor => factor.relationshipId === line.relationshipId && String(factor.text ?? '').trim())
          .map(({ scaleId, direction, text, origin }) => ({ scaleId, direction, text, ...(origin ? { origin } : {}) })),
        ...(paceByLine && Object.hasOwn(paceByLine, line.relationshipId) ? { pace: paceByLine[line.relationshipId] } : {}),
      }, meta)));
      await commit(next, true);
    },
    onPairTropes: () => pairTropes(),
    /** origin marks a line's own trope; the triangle editor re-labels it as a triangle trope. */
    /** sourceId/targetId or relationshipId: the line whose names and genders go into the texts. */
    onPairTropeFactors: ({ tropeId, sourceId, targetId, relationshipId: lineId }) => {
      const scaleIds = state.config.scales.map(scale => scale.id);
      const line = lineId ? state.relationships[lineId] : null;
      const people = { subj: personOf(line?.from ?? sourceId), obj: personOf(line?.to ?? targetId) };
      return {
        factors: pairTropeFactors(tropeId, scaleIds, people).map(factor => ({ ...factor, origin: `pair-trope:${tropeId}` })),
        pace: pairTropePace(tropeId, scaleIds),
      };
    },
    onTropeLabel: ({ origin }) => tropeLabel(origin),
    /**
     * The description of the persona in SillyTavern goes to the model by itself, so it would repeat the card. `move`: first copy it into the
     * «Public Info» of her card. Then it is cleared in SillyTavern (the persona stays there as a name and a picture, which the chat needs).
     */
    onPersonaTavernDescription: async ({ move = false } = {}) => {
      const text = tavernPersonaDescription();
      if (!text) return 0;
      if (move) {
        const card = personaCardNow();
        if (!card) throw new Error('Сначала создайте карточку персоны.');
        const sections = card.sections.map(section => ({ ...section }));
        const info = sections.find(section => section.kind === 'other' && /^public info$/i.test(section.title));
        if (info) { if (!info.text.includes(text)) info.text = [info.text, text].filter(Boolean).join('\n\n'); } else sections.push({ kind: 'other', title: 'Public Info', text });
        locationLibrary.set(updateLibraryCharacter(locationLibrary.get(), card.id, { sections }));
      }
      const ctx = SillyTavern.getContext();
      const ps = ctx.powerUserSettings;
      const avatar = personaAvatarForChat();
      if (ps?.persona_descriptions?.[avatar]) ps.persona_descriptions[avatar].description = '';
      // The one on the page now: through its own field, so that the counter and the list of personas follow.
      if (ps && String(ps.persona_description ?? '').trim() === text) {
        ps.persona_description = '';
        const field = document.getElementById('persona_description');
        if (field) { field.value = ''; field.dispatchEvent(new Event('input', { bubbles: true })); }
      }
      context.saveSettingsDebounced();
      notify();
      return text.length;
    },
    /**
     * The personas of SillyTavern become cards of the library: the name, the picture and what is written in the description (into
     * «Public Info»). A persona that already has a card (by name or picture) is left alone. The description in SillyTavern stays as it was.
     */
    /** Which model describes the persona by her picture: '' = the one of the wardrobe pictures. */
    onPersonaLookModel: async ({ value = '' } = {}) => {
      const text = String(value);
      settings.personaLook = text === 'main' ? { mode: 'main' } : text.startsWith('profile:') && text.length > 8 ? { mode: 'profile', profileId: text.slice(8) } : {};
      context.saveSettingsDebounced();
      notify();
    },
    /** A record between characters (a new one, or `fields` changed in the one with `id`). */
    onBondSave: async ({ id = '', fields = {} } = {}) => {
      const lib = locationLibrary.get();
      locationLibrary.set(id ? updateBond(lib, id, fields) : addBond(lib, fields).library);
      refreshPrompt();
      notify();
    },
    onBondRemove: async ({ id }) => {
      locationLibrary.set(removeBond(locationLibrary.get(), id));
      refreshPrompt();
      notify();
    },
    /**
     * What this chat holds of its own — headcanons, memories, tensions (`type` = one of them, or all) → records of the library, tied to the
     * cards of the characters they are about. What moved is taken out of the chat, so it does not go to the model twice.
     * Whoever has no card yet stays in the chat.
     */
    onBondsMigrate: async ({ type = '' } = {}) => moveChatToBonds({ types: type ? [type] : ['headcanon', 'memory', 'tension'] }),
    onPersonaTavernImport: async () => {
      const ps = SillyTavern.getContext().powerUserSettings;
      let lib = locationLibrary.get();
      const have = lib.characters.filter(card => card.persona);
      let added = 0;
      let skipped = 0;
      for (const [avatar, rawName] of Object.entries(ps?.personas ?? {})) {
        const name = String(rawName ?? '').trim();
        if (!name) continue;
        if (have.some(card => card.avatar === avatar || card.name.toLocaleLowerCase('ru-RU') === name.toLocaleLowerCase('ru-RU'))) { skipped += 1; continue; }
        const text = String(ps.persona_descriptions?.[avatar]?.description ?? (avatar === personaAvatarForChat() ? ps.persona_description : '') ?? '').trim();
        try {
          const made = addLibraryCharacter(lib, { name, persona: true, avatar });
          lib = made.library;
          if (text) {
            const sections = made.character.sections.map(section => ({ ...section }));
            const info = sections.find(section => section.kind === 'other' && /^public info$/i.test(section.title));
            if (info) info.text = text; else sections.push({ kind: 'other', title: 'Public Info', text });
            lib = updateLibraryCharacter(lib, made.character.id, { sections });
          }
          added += 1;
        } catch (error) { logEvent('warn', `Персона «${name}» не перенесена в карточки`, error); skipped += 1; }
      }
      locationLibrary.set(lib);
      notify();
      return { added, skipped };
    },
    /** A persona card for this persona, made in the library and chosen for this chat. */
    onPersonaCardCreate: async ({ name, avatar }) => {
      const added = addLibraryCharacter(locationLibrary.get(), { name, persona: true, avatar });
      locationLibrary.set(added.library);
      const next = structuredClone(state);
      next.ui ??= {};
      next.ui.personaCard = added.character.id;
      await commit(next, true);
      return added.character;
    },
    /** Which card of the library is the persona of THIS chat ('' = by her SillyTavern persona, or by name). */
    onPersonaCardUse: async ({ cardId }) => {
      // A card with her picture of SillyTavern also binds that persona to the chat: one choice, from the library.
      const card = cardId ? (locationLibrary.get().characters ?? []).find(item => item.id === cardId && item.persona) : null;
      const known = SillyTavern.getContext().powerUserSettings?.personas ?? {};
      if (card?.avatar && known[card.avatar] && boundPersonaAvatar() !== card.avatar) await setTavernPersona({ avatarId: card.avatar });
      const next = structuredClone(state);
      next.ui ??= {};
      if (cardId) next.ui.personaCard = cardId; else delete next.ui.personaCard;
      await commit(next, true);
    },
    onPersonaCardsEnabled: ({ enabled }) => savePersonaCards(library => ({ ...library, enabled: Boolean(enabled) })),
    /** The author writes to the assistant; it answers outside the game chat. A conclusion it proposes waits for «да». */
    onGmSend: async ({ text }) => {
      const clean = String(text ?? '').trim();
      if (!clean || gmBusy) return;
      await writeGm(addMessage(readGm(), 'user', clean));
      await answerGm();
    },
    /** «Ответить заново»: after a reload that cut the answer off, or when the answer did not suit. */
    onGmRetry: async () => {
      if (gmBusy) return;
      const gm = dropLastReply(readGm());
      if (gm.messages.at(-1)?.role !== 'user') return;
      await writeGm(gm);
      await answerGm();
    },
    /** «Да» / «Нет» / «Ещё не всё» on the proposal of the assistant. */
    onGmProposal: async ({ answer }) => {
      const gm = readGm();
      await writeGm(answer === 'yes' ? acceptProposal(gm) : answer === 'more' ? continueTalk(gm) : rejectProposal(gm));
    },
    onGmConclusion: async ({ id, op, text }) => {
      const gm = readGm();
      await writeGm(op === 'toggle' ? toggleConclusion(gm, id) : op === 'remove' ? removeConclusion(gm, id) : editConclusion(gm, id, text));
    },
    onGmClear: async () => { await writeGm(clearTalk(readGm())); },
    /** A patch of the assistant's settings: { assistant, addCustom, removeCustom: id, editCustom: { id, … }, avatars: { id: dataUrl | null }, profileId, prompt }. Returns the id of an added assistant. */
    onGmSettings: (patch = {}) => {
      const now = normalizeGmSettings(settings.gm);
      const avatars = { ...now.avatars };
      for (const [id, value] of Object.entries(patch.avatars ?? {})) { if (value) avatars[id] = value; else delete avatars[id]; }
      const { customs, added } = patchCustoms(now.customs, patch);
      settings.gm = normalizeGmSettings({
        ...now, ...Object.fromEntries(['assistant', 'profileId', 'prompt', 'userGender', 'seeConsole'].filter(key => key in patch).map(key => [key, patch[key]])),
        customs, avatars,
      });
      context.saveSettingsDebounced();
      notify();
      return added;
    },
    onPersonaAuAdd: ({ name }) => savePersonaCards(library => addAu(library, name)),
    onPersonaAuRemove: async ({ id }) => {
      savePersonaCards(library => removeAu(library, id));
      if ((state.ui?.au ?? []).includes(id)) {
        const next = structuredClone(state);
        next.ui.au = next.ui.au.filter(item => item !== id);
        await commit(next, true);
      }
    },
    /** The AU this chat plays (several at once): the records of those AU go. */
    onPersonaAuToggle: async ({ id, on }) => {
      const next = structuredClone(state);
      next.ui ??= {};
      const set = new Set(next.ui.au ?? []);
      if (on) set.add(id); else set.delete(id);
      if (set.size) next.ui.au = [...set]; else delete next.ui.au;
      await commit(next, true);
    },
    /** The case forms of the words of a card's names, asked of the model. Nothing is saved: the editor puts them into its draft. → [{ word, same, gen… }] */
    onCardNamesFill: async ({ name, aliases, words }) => {
      if (isGenerationActive()) await waitForGenerationEnd();
      const entry = cardNameEntry({ id: 'draft', name, aliases: (aliases ?? []).map(alias => String(alias).trim()).filter(Boolean), words });
      if (!wordsToFill(entry).length) return [];
      const result = await fillNameForms(routedContext(SillyTavern.getContext(), settings, 'generation'), [entry]);
      // a failed request is told with its reason, not as «не получилось»
      if (!result.patches.length) throw new Error(result.error ? `Склонения не подобраны: ${result.error}` : 'Модель не вернула склонения. Попробуйте ещё раз или впишите формы вручную.');
      return result.patches[0]?.words ?? [];
    },
    onSetPersonaPrivate: ({ text }) => {
      const card = personaCardNow();
      if (card) {
        const value = String(text ?? '').trim();
        const sections = card.sections.map(section => ({ ...section }));
        const hidden = sections.find(section => section.kind === 'private');
        if (hidden) hidden.text = value; else sections.push({ kind: 'private', title: 'Hidden character', text: value });
        locationLibrary.set(updateLibraryCharacter(locationLibrary.get(), card.id, { sections }));
        notify();
        return;
      }
      const avatar = boundPersonaAvatar();
      if (!avatar) throw new Error('Сначала привяжите персону.');
      settings.personaPrivate = { ...(settings.personaPrivate ?? {}) };
      const value = String(text ?? '').trim().slice(0, 4000);
      if (value) settings.personaPrivate[avatar] = value; else delete settings.personaPrivate[avatar];
      context.saveSettingsDebounced();
      notify();
    },
    /**
     * A trope written for this line by the model from the lorebook: the trope's themes are the
     * skeleton. Nothing is saved here (the dialog saves). relationshipId or sourceId/targetId.
     */
    onTropeFactorsFromLore: async ({ tropeId, sourceId, targetId, relationshipId: lineId }) => {
      if (isGenerationActive()) await waitForGenerationEnd();
      const line = lineId ? state.relationships[lineId] : null;
      const from = line?.from ?? sourceId;
      const to = line?.to ?? targetId;
      requireCharacter(from);
      requireCharacter(to);
      const scaleIds = state.config.scales.map(scale => scale.id);
      const meta = pairTropes().find(item => item.id === tropeId);
      if (!meta) throw new Error('Троп не найден.');
      const trope = { ...meta, factors: pairTropeFactors(tropeId, scaleIds, { subj: personOf(from), obj: personOf(to) }) };
      const loreContext = await loreAbout([from, to]);
      const { factors, analysis } = await generateGrowthFactors(routedContext(SillyTavern.getContext(), settings, 'generation'), state, from, to, {
        loreContext, cardText: cardContext(SillyTavern.getContext()), personaPrivate: privateFor([from, to]), trope, goal: state.relationships[relationshipId(from, to)]?.goal ?? '',
      });
      if (analysis) await rememberAnalysis(relationshipId(from, to), analysis);
      return { factors: factors.map(factor => ({ ...factor, origin: `pair-trope:${tropeId}` })), pace: pairTropePace(tropeId, scaleIds), analysis };
    },
    /** The same for a triangle trope: all lines at once, from the lore of the three. */
    onTriangleTropeFromLore: async ({ id, tropeId, goal }) => {
      if (isGenerationActive()) await waitForGenerationEnd();
      const triangle = findTriangle(id);
      const skeleton = triangleTropeFactors(tropeId, triangle, state.config.scales.map(scale => scale.id), state.ui?.personaId || '', personOf);
      const meta = triangleTropes().find(item => item.id === tropeId);
      const loreContext = await loreAbout([triangle.centerId, triangle.firstId, triangle.secondId]);
      const factors = await generateTriangleFactors(routedContext(SillyTavern.getContext(), settings, 'generation'), state, triangle, triangleLines(triangle), {
        goal: goal || triangle.goal || skeleton.goal, loreContext, cardText: cardContext(SillyTavern.getContext()), personaPrivate: privateFor([triangle.centerId, triangle.firstId, triangle.secondId]), trope: { ...meta, factors: skeleton.factors },
      });
      return { goal: skeleton.goal, factors: withLineIds(factors).map(factor => ({ ...factor, origin: `triangle-trope:${tropeId}` })) };
    },
    /** The chat's tempo of relationships (analysis-operations TEMPOS). */
    onSetTempo: async ({ tempo }) => {
      const next = structuredClone(state);
      next.ui ??= {};
      if (['very-slow', 'slow', 'fast'].includes(tempo)) next.ui.tempo = tempo; else delete next.ui.tempo;
      await commit(next, true);
    },
    /** The tempo of ONE line of relationships ('very-slow' | 'slow' | 'normal' | 'fast'); each pair has its own. */
    onSetPairTempo: async ({ relationshipId, tempo }) => {
      if (!state.relationships?.[relationshipId]) throw new Error('Линии нет.');
      const next = structuredClone(state);
      next.ui ??= {};
      next.ui.pairTempo = { ...(next.ui.pairTempo ?? {}) };
      if (['very-slow', 'slow', 'normal', 'fast'].includes(tempo)) next.ui.pairTempo[relationshipId] = tempo; else delete next.ui.pairTempo[relationshipId];
      if (!Object.keys(next.ui.pairTempo).length) delete next.ui.pairTempo;
      await commit(next, true);
    },
    /** Grammatical gender for trope texts: 'male' | 'female' | '' (not set). */
    onSetGender: async ({ entityId, gender }) => {
      requireCharacter(entityId);
      const next = structuredClone(state);
      next.ui ??= {};
      next.ui.genders = { ...(next.ui.genders ?? {}) };
      if (gender === 'male' || gender === 'female') next.ui.genders[entityId] = gender; else delete next.ui.genders[entityId];
      await commit(next, true);
    },
    onRefreshLorebooks: () => notify(),
    onLinkLorebook: async ({ name }) => {
      if (!(SillyTavern.getContext().getWorldInfoNames?.() ?? []).includes(name)) throw new Error('Лорбук не найден. Обновите список.');
      const next = structuredClone(state);
      next.ui ??= {};
      next.ui.linkedLorebooks = [...new Set([...(next.ui.linkedLorebooks ?? []), name])];
      await commit(next, true);
      // Characters are no longer searched for by themselves (the heroes live in the cards): «Найти персонажей в лорбуках» does it on call.
      // The secrets of the book are still picked up.
      (async () => {
        const { fresh } = await loreSecrets([name]);
        if (fresh.length) await importLoreSecrets({ books: [name] });
      })().catch(error => globalThis.toastr?.error?.(error.message, 'Закулисье'));
      globalThis.toastr?.info?.('Книга подключена. Персонажей из неё ищите кнопкой «Найти персонажей в лорбуках».', 'Закулисье');
    },
    onUnlinkLorebook: async ({ name }) => {
      const next = structuredClone(state);
      next.ui ??= {};
      next.ui.linkedLorebooks = (next.ui.linkedLorebooks ?? []).filter(book => book !== name);
      await commit(next, true);
    },
    onAddCharacter: addCharacter,
    onSetAliases: setAliases,
    onSelectPair: selectPair,
    onSetFactors: async ({ sourceId, targetId, factors, pace, goal }) => {
      const id = relationshipId(sourceId, targetId);
      if (!state.relationships[id]) throw new Error('Линия не найдена.');
      await commit(applyOperation(state, createOperation('factors.set', {
        relationshipId: id, factors, ...(pace !== undefined ? { pace } : {}), ...(goal !== undefined ? { goal } : {}),
      }, { transactionId: uniqueId('manual'), reason: 'Ручное изменение факторов', timestamp: new Date().toISOString() })), true);
    },
    onGeneratePairGoal: async ({ sourceId, targetId, wish }) => {
      if (isGenerationActive()) await waitForGenerationEnd();
      if (!state.relationships[relationshipId(sourceId, targetId)]) throw new Error('Сначала создайте линию.');
      const loreContext = await loreAbout([sourceId, targetId]);
      return generatePairGoal(routedContext(SillyTavern.getContext(), settings, 'generation'), state, sourceId, targetId, { loreContext, wish });
    },
    onGenerateFactors: async ({ sourceId, targetId, directionId, customDirection, replace, goal }) => {
      if (isGenerationActive()) await waitForGenerationEnd();
      const id = relationshipId(sourceId, targetId);
      if (!state.relationships[id]) throw new Error('Сначала создайте линию.');
      const loreContext = await loreAbout([sourceId, targetId]);
      const { factors, analysis } = await generateGrowthFactors(routedContext(SillyTavern.getContext(), settings, 'generation'), state, sourceId, targetId, {
        directionId, customDirection, loreContext, cardText: cardContext(SillyTavern.getContext()), personaPrivate: privateFor([sourceId, targetId]), goal: goal ?? state.relationships[id].goal ?? '',
      });
      if (analysis) await rememberAnalysis(id, analysis);
      const merged = replace ? factors : [...(state.relationships[id].factors ?? []), ...factors];
      await commit(applyOperation(state, createOperation('factors.set', {
        relationshipId: id, factors: merged, ...(goal !== undefined ? { goal } : {}),
      }, { transactionId: uniqueId('manual'), reason: `Генерация факторов (${directionId})`, timestamp: new Date().toISOString() })), true);
      return factors;
    },
    onDirectionPresets: () => directionPresets(),
    onRemoveRecord: async ({ kind, shared, relationshipId, itemId }) => {
      const type = kind === 'tension' ? 'tension.remove' : 'memory.remove';
      await commit(applyOperation(state, createOperation(type, {
        shared: Boolean(shared), relationshipId, itemId,
      }, { transactionId: uniqueId('manual'), reason: 'Ручное удаление записи', timestamp: new Date().toISOString() })), true);
    },
    onUpdateRecord: async ({ kind, shared, relationshipId: pairRecordOwner, itemId, changes }) => {
      const meta = { transactionId: uniqueId('manual'), reason: 'Правка записи', timestamp: new Date().toISOString() };
      const key = kind === 'tension' ? 'tensions' : 'memories';
      if (shared) {
        await commit(applyOperation(state, createOperation('record.update', { kind, shared: true, itemId, changes }, meta)), true);
        return;
      }
      const relation = state.relationships[pairRecordOwner];
      const original = relation?.[key]?.find(item => item.id === itemId);
      if (!original) throw new Error('Запись не найдена.');
      const pairParticipants = [relation.from, relation.to].sort();
      const sameParticipants = !changes.participantIds
        || JSON.stringify([...changes.participantIds].sort()) === JSON.stringify(pairParticipants);
      if (sameParticipants && !changes.knownBy) {
        await commit(applyOperation(state, createOperation('record.update', { kind, relationshipId: pairRecordOwner, itemId, changes }, meta)), true);
        return;
      }
      // Old pair-bound records have fixed participants: editing them moves the record into shared ones.
      const participantIds = [...new Set(changes.participantIds ?? pairParticipants)].sort();
      const knownBy = [...new Set([...(changes.knownBy ?? participantIds), ...participantIds])].sort();
      const moved = {
        ...original,
        id: uniqueId(kind),
        text: String(changes.text ?? original.text).trim(),
        intensity: changes.intensity ?? original.intensity,
        participantIds,
        knownBy,
      };
      await commit(applyOperations(state, [
        createOperation(kind === 'tension' ? 'tension.remove' : 'memory.remove', { relationshipId: pairRecordOwner, itemId }, meta),
        createOperation(kind === 'tension' ? 'tension.add' : 'memory.add', { shared: true, item: moved }, meta),
      ]), true);
    },
    onToggleRecord: async ({ kind, shared, relationshipId, itemId, disabled }) => {
      await commit(applyOperation(state, createOperation('record.toggle', {
        kind, shared: Boolean(shared), relationshipId, itemId, disabled: Boolean(disabled),
      }, { transactionId: uniqueId('manual'), reason: disabled ? 'Запись отключена' : 'Запись включена', timestamp: new Date().toISOString() })), true);
    },
    onToggleWidgetPair: async ({ relationshipId }) => {
      const next = structuredClone(state);
      next.ui ??= {};
      const hidden = [...new Set([...(next.ui.hiddenRelationshipIds ?? [])])];
      const index = hidden.indexOf(relationshipId);
      if (index >= 0) hidden.splice(index, 1);
      else hidden.push(relationshipId);
      next.ui.hiddenRelationshipIds = hidden;
      await commit(next, true);
    },
    onRemovePair: async ({ sourceId, targetId }) => {      if (!state.entities[sourceId] || !state.entities[targetId]) throw new Error('Персонаж не найден.');
      const id = relationshipId(sourceId, targetId);
      if (!state.relationships[id]) return;
      const confirmed = await context.Popup.show.confirm(
        'Удалить линию отношений',
        `Линия «${escapeHtml(state.entities[sourceId].name)} → ${escapeHtml(state.entities[targetId].name)}» и её шкалы, воспоминания и напряжения будут удалены. Продолжить?`,
      );
      if (confirmed !== context.POPUP_RESULT.AFFIRMATIVE) return;
      await commit(applyOperation(state, createOperation('relationship.remove', {
        relationshipId: id, from: sourceId, to: targetId,
      }, { transactionId: uniqueId('manual'), reason: 'Ручное удаление линии', timestamp: new Date().toISOString() })), true);
    },
    onRemovePairsBulk: async ({ relationshipIds }) => {
      const lines = [...new Set(relationshipIds ?? [])].map(id => state.relationships[id]).filter(Boolean);
      if (!lines.length) return false;
      const nameOf = id => escapeHtml(state.entities[id]?.name ?? id);
      const items = lines.map(relation => `<li>${nameOf(relation.from)} → ${nameOf(relation.to)}</li>`).join('');
      const confirmed = await context.Popup.show.confirm(
        `Удалить линии: ${lines.length}`,
        `<ul style="text-align:left;margin:0;padding-left:18px">${items}</ul><p>Шкалы, воспоминания и напряжения этих линий будут удалены. Продолжить?</p>`,
      );
      if (confirmed !== context.POPUP_RESULT.AFFIRMATIVE) return false;
      const meta = { transactionId: uniqueId('manual'), reason: 'Ручное удаление линий', timestamp: new Date().toISOString() };
      await commit(applyOperations(state, lines.map(relation => createOperation('relationship.remove', {
        relationshipId: relation.id, from: relation.from, to: relation.to,
      }, meta))), true);
      return true;
    },
    onRemoveCharacter: async ({ characterId: id }) => {
      const entity = state.entities[id];
      if (!entity) throw new Error('Персонаж не найден.');
      if (state.ui?.personaId === id) throw new Error('Нельзя удалить привязанную персону. Сначала отвяжите её.');
      const relations = Object.values(state.relationships).filter(relation => relation.from === id || relation.to === id);
      const confirmed = await context.Popup.show.confirm(
        'Удалить персонажа',
        `«${entity.name}» будет удалён из реестра вместе с ${relations.length} линиями и упоминаниями из общих записей. Продолжить?`,
      );
      if (confirmed !== context.POPUP_RESULT.AFFIRMATIVE) return;
      await commit(applyOperation(state, createOperation('entity.remove', {
        entityId: id,
      }, { transactionId: uniqueId('manual'), reason: 'Ручное удаление персонажа', timestamp: new Date().toISOString() })), true);
    },
    onRemoveCharactersBulk: async ({ characterIds }) => {
      const ids = [...new Set((characterIds ?? []).filter(id => state.entities[id] && state.ui?.personaId !== id))];
      if (!ids.length) throw new Error('Не выбраны персонажи для удаления.');
      const names = ids.map(id => state.entities[id].name);
      const relationCount = Object.values(state.relationships)
        .filter(relation => ids.includes(relation.from) || ids.includes(relation.to)).length;
      const confirmed = await context.Popup.show.confirm(
        'Удалить выбранных персонажей',
        `Будут удалены: ${names.join(', ')}\n\nВместе с ними исчезнут ${relationCount} линий и упоминания из общих записей. Продолжить?`,
      );
      if (confirmed !== context.POPUP_RESULT.AFFIRMATIVE) return;
      let next = state;
      for (const id of ids) {
        next = applyOperation(next, createOperation('entity.remove', {
          entityId: id,
        }, { transactionId: uniqueId('manual'), reason: 'Массовое удаление персонажей', timestamp: new Date().toISOString() }));
      }
      await commit(next, true);
      globalThis.toastr?.success?.(`Удалено персонажей: ${ids.length}`, 'Закулисье');
    },
    onMetricChange: changeMetric,
    onAddMemory: payload => addCollection('memory', payload),
    onAddTension: payload => addCollection('tension', payload),
    onImport: importFromStudio,
    onExport: exportForStudio,
    onSettingsChange: changeSettings,
    onHeadcanonKey: ({ ids, firstId, secondId }) => headcanonKey(ids ?? [firstId, secondId]),
    onAutoHeadcanons: ({ key }) => isAutoHeadcanonsFor(key),
    onAddHeadcanons: async ({ key, texts }) => {
      assertHeadcanonPair(key);
      const { headcanons, added } = addHeadcanons(state, key, texts ?? [], { source: 'manual' });
      await commitHeadcanons(headcanons);
      return added;
    },
    onUpdateHeadcanon: async ({ key, id, text, enabled, pinned }) => {
      assertHeadcanonPair(key);
      await commitHeadcanons(updateHeadcanons(state, key, entry => {
        const item = entry.items.find(candidate => candidate.id === id);
        if (!item) throw new Error('Хедканон не найден.');
        if (text != null) {
          const value = String(text).replace(/\s+/g, ' ').trim().slice(0, 400);
          if (!value) throw new Error('Текст хедканона пуст.');
          item.text = value;
        }
        if (enabled != null) item.enabled = Boolean(enabled);
        if (pinned != null) { if (pinned) item.pinned = true; else delete item.pinned; }
      }));
    },
    // «Вспомнить в следующем ответе»: a one-off stage cue with the record's text.
    onRecallRecord: async ({ text }) => {
      if (!settings.enabled) throw new Error('Закулисье выключено.');
      await saveDirection(armCue(directionState(), { kind: 'recall', text, id: uniqueId('cue') }, Object.keys(state.entities)));
    },
    onRemoveHeadcanon: async ({ key, id }) => {
      assertHeadcanonPair(key);
      await commitHeadcanons(updateHeadcanons(state, key, entry => { entry.items = entry.items.filter(item => item.id !== id); }));
    },
    onSetHeadcanonAuto: async ({ key, auto }) => {
      assertHeadcanonPair(key);
      await commitHeadcanons(updateHeadcanons(state, key, entry => { entry.auto = Boolean(auto); }));
    },
    onGenerateHeadcanons: async ({ key }) => {
      assertHeadcanonPair(key);
      if (isGenerationActive()) await waitForGenerationEnd();
      const ids = headcanonPairIds(key);
      const loreContext = await loreAbout(ids);
      const existing = (state.ui?.headcanons?.[key]?.items ?? []).map(item => item.text);
      const texts = await generateHeadcanons(routedContext(SillyTavern.getContext(), settings, 'generation'), state, ids, { loreContext, existing });
      const { headcanons, added } = addHeadcanons(state, key, texts, { source: 'lore' });
      await commitHeadcanons(headcanons);
      return added;
    },
    onToggleStrangers: async ({ relationshipId: id, strangers }) => {
      const relation = state.relationships[id];
      if (!relation) throw new Error('Линия не найдена.');
      const key = [relation.from, relation.to].sort().join('|');
      const next = structuredClone(state);
      next.ui ??= {};
      const pairs = new Set(next.ui.strangerPairs ?? []);
      if (strangers) pairs.add(key); else pairs.delete(key);
      next.ui.strangerPairs = [...pairs];
      await commit(next, true);
    },
    onSetHiddenScales: async ({ relationshipId: id, hiddenScales }) => {
      if (!state.relationships[id]) throw new Error('Линия не найдена.');
      await commit(applyOperation(state, createOperation('scales.hide', { relationshipId: id, hiddenScales }, {
        transactionId: uniqueId('manual'), reason: 'Видимость шкал линии', timestamp: new Date().toISOString(),
      })), true);
    },
    onGetDiagnostics: () => formatLog({
      'Закулисье': 'журнал диагностики',
      'Браузер': globalThis.navigator?.userAgent ?? '?',
      'Экран': `${globalThis.innerWidth ?? '?'}×${globalThis.innerHeight ?? '?'}`,
      'Автоанализ': settings.autoAnalyze ? 'вкл' : 'выкл',
      'Инъекция': settings.enabled && settings.injectPrompt ? 'вкл' : 'выкл',
      // Never the key or the URL: only which mode is used.
      'Вспомогательный API': settings.aux?.mode === 'profile' ? 'профиль подключения' : settings.aux?.mode === 'custom' ? 'свой URL' : 'выкл',
      'Эмбеддинги': settings.embeddings?.mode === 'local' ? `локально (${settings.embeddings.localModel})` : settings.embeddings?.mode === 'api' ? `API (${settings.embeddings.format})` : 'выкл',
      'Персонажей / линий': `${Object.keys(state.entities).length} / ${Object.keys(state.relationships).length}`,
    }),
    onClearDiagnostics: () => { clearLog(); notify(); },
    /** Написать разделы карточки по пожеланиям (в черновик карточки; сохраняет сам пользователь). payload: { card, sections, others, origin, wishes, onProgress } */
    /** The loose notes about an AU → the four fields of a folder's AU (a draft for the user to check). */
    onFolderAuParse: async ({ text, folderName = '' }) => {
      const raw = await withBusy('разбираю АУ…', () => routedContext(SillyTavern.getContext(), settings, 'cardgen').generateRaw({ prompt: auParsePrompt(text, folderName), trimNames: false }));
      return parseAuAnswer(raw);
    },
    onCardGenerate: ({ onProgress, onSection, ...request }) => generateCardSections(routedContext(SillyTavern.getContext(), settings, 'cardgen'), request, onProgress, onSection),
    /** Переезд со старых Кулис и Пудреницы: что стоит рядом и есть ли данные (у Закулисья те же ключи настроек и чата, так что данные подхватываются сами). */
    onMoveStatus: async () => {
      const root = SillyTavern.getContext().extensionSettings;
      let old = [];
      try {
        await extensionApi.ready();
        const off = new Set(extensionApi.disabled());
        old = extensionApi.names()
          .filter(id => /kulisy|pudrenitsa/i.test(folderName(id)))
          .map(id => ({ id, folder: folderName(id), title: /pudrenitsa/i.test(folderName(id)) ? 'Пудреница' : 'Кулисы', enabled: !off.has(id) }));
      } catch (error) { console.warn('[Закулисье] Список расширений недоступен.', error); }
      return { old, hasKulisy: Boolean(root.kulisy), hasPudrenitsa: Boolean(root.pudrenitsa) };
    },
    onMoveDisableOld: async () => {
      await extensionApi.ready();
      const off = new Set(extensionApi.disabled());
      const targets = extensionApi.names().filter(id => /kulisy|pudrenitsa/i.test(folderName(id)) && !off.has(id));
      for (const id of targets) await extensionApi.setEnabled(id, false);
      return { disabled: targets.map(folderName) };
    },
    onBackupExport: () => {
      const backup = buildBackup(SillyTavern.getContext().extensionSettings);
      return { data: backup, filename: backupFilename() };
    },
    /** text — файл копии. Заменяет настройки и библиотеки; свои ключи доступа остаются. Потом страница перезагружается. */
    onBackupImport: async ({ text }) => {
      const backup = parseBackup(text);
      const info = summarizeBackup(backup);
      const lines = [
        info.exportedAt ? `Копия от ${new Date(info.exportedAt).toLocaleString('ru-RU')}.` : '',
        `Внутри: карточек ${info.cards}, локаций ${info.places}, вещей ${info.items}${info.hasPudrenitsa ? ', настройки Пудреницы' : ''}.`,
        'Всё, что сейчас есть в Закулисье на этом компьютере (карточки, локации, гардероб, настройки), будет ЗАМЕНЕНО содержимым файла. Свои ключи доступа к моделям останутся. Чаты не меняются.',
      ].filter(Boolean).map(escapePopupText).join('<br><br>');
      const accepted = await SillyTavern.getContext().Popup.show.confirm('Загрузить копию Закулисья?', lines, { okButton: 'Заменить и перезагрузить', cancelButton: 'Отмена', allowVerticalScrolling: true });
      if (accepted !== SillyTavern.getContext().POPUP_RESULT.AFFIRMATIVE) return false;
      const context = SillyTavern.getContext();
      const replaced = applyBackup(context.extensionSettings, backup);
      context.saveSettingsDebounced();
      globalThis.toastr?.success?.('Копия загружена. Страница перезагрузится.', 'Закулисье', { timeOut: 4000 });
      setTimeout(() => globalThis.location?.reload?.(), 2500);
      return { replaced };
    },
    /** «Чистилка»: разделы настроек, которые остались от удалённых расширений. Сначала показ, потом файл-копия, потом удаление. */
    onCleanerScan: async () => {
      const settingsRoot = SillyTavern.getContext().extensionSettings;
      try {
        await extensionApi.ready();
        return { ...scanSettings(settingsRoot, extensionApi.names().map(folderName)), unknown: false };
      } catch (error) {
        console.warn('[Закулисье] Список расширений недоступен: «папки нет» определено не будет.', error);
        return { ...scanSettings(settingsRoot, []), unknown: true };
      }
    },
    onCleanerPrepare: ({ keys }) => ({ data: buildCleanerBackup(SillyTavern.getContext().extensionSettings, keys), filename: cleanerFilename() }),
    onCleanerRemove: async ({ keys }) => {
      const context = SillyTavern.getContext();
      const chosen = buildCleanerBackup(context.extensionSettings, keys);
      const names = Object.keys(chosen.removed);
      const accepted = await context.Popup.show.confirm('Убрать настройки расширений?', `${names.map(escapePopupText).join(', ')}<br><br>Файл-копия этих настроек уже скачана: из неё их можно вернуть. Расширения, которые ещё стоят и работают, начнут с пустых настроек. Продолжить?`, { okButton: 'Убрать', cancelButton: 'Отмена', allowVerticalScrolling: true });
      if (accepted !== context.POPUP_RESULT.AFFIRMATIVE) return false;
      const result = removeSettings(context.extensionSettings, names);
      context.saveSettingsDebounced();
      return { ...result, size: formatBytes(result.bytes) };
    },
    onCleanerRestore: async ({ text }) => {
      const context = SillyTavern.getContext();
      const result = restoreSettings(context.extensionSettings, parseCleanerBackup(text));
      if (result.restored.length) context.saveSettingsDebounced();
      return result;
    },
    onRefreshScene: async () => { await prepareHeadcanons(); refreshPrompt(); },
    onAuxProfiles: () => listAuxProfiles(SillyTavern.getContext()),
    onLocalEmbeddingModels: () => Object.entries(LOCAL_MODELS).map(([id, model]) => ({ id, label: model.label })),
    /** Embeds two short texts with the settings being edited; the first local run downloads the model. */
    onTestEmbeddings: async ({ embeddings }) => {
      const config = normalizeEmbeddings({ ...settings.embeddings, ...embeddings });
      if (config.mode === 'off') throw new Error('Смысловой поиск выключен.');
      const started = Date.now();
      // A close and a far pair: every model has its own scale, so the user sees where the threshold belongs.
      const [scene] = await embedTexts(config, ['Они вместе идут домой под дождём'], 'query');
      const [fact, far] = await embedTexts(config, ['Он всегда провожает её до дома', 'Цены на бензин снова выросли'], 'passage');
      const seconds = ((Date.now() - started) / 1000).toFixed(1);
      const near = cosine(scene, fact);
      const away = cosine(scene, far);
      logEvent('info', `Проверка эмбеддингов: ${scene.length} измерений за ${seconds} с, близкое ${near.toFixed(2)}, далёкое ${away.toFixed(2)}`);
      return `Работает: вектор из ${scene.length} чисел за ${seconds} с. Сходство близкого по смыслу ${near.toFixed(2)}, далёкого ${away.toFixed(2)}. Порог, если нужен, ставьте между ними.`;
    },
    onAuxPurposes: () => ({ ...AUX_PURPOSES }),
    /** Where pictures go and what the folder plugin says; never throws (a missing plugin is a normal answer). */
    onWardrobeInboxRefresh: () => refreshInbox(),
    onImageStorageStatus: async () => ({
      storage: settings.imageStorage === 'folder' ? 'folder' : 'server',
      plugin: await folderStorageStatus(),
      counts: countImages(wardrobeStore.get(), locationLibrary.get()),
    }),
    onSetImageFolder: async ({ folder }) => {
      const saved = await setImageFolder(SillyTavern.getContext(), folder);
      logEvent('info', saved ? 'Папка для картинок выбрана' : 'Папка для картинок забыта');
      inboxPrepared = false;
      refreshInbox().catch(() => {});
      if (!saved && settings.imageStorage === 'folder') await changeSettings({ settings: { imageStorage: 'server' } });
      return saved;
    },
    onBrowseImageFolder: () => browseImageFolder(SillyTavern.getContext()),
    /** Moves every picture into the chosen storage: copy, save the new paths, delete the old files. */
    onMoveImages: async ({ to }) => {
      if (to === 'folder') {
        const plugin = await folderStorageStatus();
        if (!plugin.installed) throw new Error('Плагин «kulisy-images» не найден — перенос в папку невозможен.');
        if (!plugin.ready) throw new Error(plugin.error || 'Папка для картинок не выбрана.');
      }
      const result = await withBusy('Переношу картинки…', () => moveImages(to, {
        getWardrobe: () => wardrobeStore.get(),
        setWardrobe: next => wardrobeStore.set(next),
        getLibrary: () => locationLibrary.get(),
        setLibrary: next => locationLibrary.set(next),
        copy: (path, storage, tree) => copyImageTo(SillyTavern.getContext(), path, storage, tree),
        remove: path => deleteWardrobeImage(SillyTavern.getContext(), path),
        log: (level, text, error) => logEvent(level, text, error),
      }));
      logEvent('info', `Перенос картинок (${to}): перенесено ${result.moved}, не вышло ${result.failed}, старых копий осталось ${result.leftovers}`);
      return result;
    },
    /** Does the chosen model see pictures? A red square, one word back. */
    onTestVision: async ({ vision }) => {
      const answer = await withBusy('Проверяю модель для картинок…', () => askAboutImage(SillyTavern.getContext(), vision ?? settings.wardrobeVision, TEST_IMAGE, TEST_PROMPT));
      const text = String(answer).trim().slice(0, 80);
      return /red|красн/i.test(text) ? `Модель видит картинки: «${text}»` : `Модель ответила «${text}» — похоже, картинку она не видит (ждали «red»).`;
    },
    onFetchAuxModels: ({ url, key }) => fetchAuxModels(SillyTavern.getContext(), url, key),
    /** A tiny request with the settings being edited (not yet saved). */
    onTestAux: async ({ aux }) => {
      const candidate = normalizeAux({ ...settings.aux, ...aux });
      if (candidate.mode === 'off') throw new Error('Вспомогательный API выключен.');
      const started = Date.now();
      const reply = await auxGenerate(SillyTavern.getContext(), candidate, [{ role: 'user', content: 'Reply with the single word OK.' }]);
      logEvent('info', `Проверка вспомогательного API: ответ за ${Date.now() - started} мс`);
      return `Ответ получен за ${((Date.now() - started) / 1000).toFixed(1)} с: «${String(reply).trim().slice(0, 60)}»`;
    },
    onAnalyzeCurrent: () => runManualCheck(lastBotMessageIndex()),
    onAnalyzeHistory: enqueueHistory,
    onAnalyzeLorebooks: analyzeLorebooksForCharacters,
  };

  studio = createRelationshipStudio({
    store, callbacks, open: false,
    layout: settings.studio,
    // Window/dock and the last tab are a preference, not chat data: extension settings.
    onLayoutChange(value) {
      settings.studio = normalizeLayout(value);
      context.saveSettingsDebounced();
    },
    directionPresets,
    // The persona window is the former Pudrenitsa's: Kulisy only embeds the card editor into it.
    onOpenPersonas: avatar => controller?.personaBridge?.personaWindow?.open?.(avatar),
  });
  widget = createRelationshipWidget({
    store,
    expanded: settings.widget.expanded,
    position: { x: settings.widget.x ?? Math.max(8, window.innerWidth - 350), y: settings.widget.y ?? 96 },
    callbacks: {
      onOpenStudio: () => studio.open(),
      onAnalyzeLatest: () => runManualCheck(lastBotMessageIndex()),
      onPositionChange: ({ position }) => {
        settings.widget.x = position.x;
        settings.widget.y = position.y;
        context.saveSettingsDebounced();
      },
      onWidgetToggle: ({ expanded }) => {
        settings.widget.expanded = expanded;
        context.saveSettingsDebounced();
      },
    },
  });
  widget.element.hidden = !settings.widget.visible;

  function mountShell() {
    unmountShell();
    const conflicts = detectConflicts(SillyTavern.getContext());
    // The settings drawer is easy to miss; a double relationship prompt is not.
    const engine = conflicts.find(item => item.id === 'relationship-engine');
    if (engine) globalThis.toastr?.warning?.(engine.message, engine.title, { timeOut: 12000 });
    unmountShell = mountExtensionShell({
      settings,
      conflicts,
      onOpenStudio: () => studio.open(),
      onSettingsChanged: () => {
        context.saveSettingsDebounced();
        widget.element.hidden = !settings.widget.visible;
        if (settings.widget.visible) widget.update();
        refreshPrompt();
      },
    });
  }

  function listen(type, handler) {
    if (!type) return;
    context.eventSource.on(type, handler);
    listeners.push(() => context.eventSource.removeListener(type, handler));
  }

  function fingerprint(text) {
    let hash = 2166136261;
    for (const char of String(text)) hash = Math.imul(hash ^ char.charCodeAt(0), 16777619);
    return (hash >>> 0).toString(36);
  }

  /** SillyTavern marks active generation on body; never run analysis or forced saves in parallel with it. */
  function isGenerationActive() {
    return typeof document !== 'undefined' && document.body?.dataset?.generating === 'true';
  }

  // Watch the attribute instead of polling: phone browsers freeze timers in a
  // background tab, so a polling loop could time out while the screen was off.
  async function waitForGenerationEnd(timeoutMs = 600000) {
    if (!isGenerationActive()) return;
    logEvent('info', 'Жду окончания основной генерации перед анализом');
    await new Promise(resolve => {
      let timer = null;
      const observer = new MutationObserver(() => { if (!isGenerationActive()) done(); });
      function done() { clearTimeout(timer); observer.disconnect(); resolve(); }
      observer.observe(document.body, { attributes: true, attributeFilter: ['data-generating'] });
      timer = setTimeout(done, timeoutMs);
    });
    if (isGenerationActive()) throw new Error('Основная генерация не завершилась вовремя; анализ отменён.');
  }

  function isPageHidden() {
    return typeof document !== 'undefined' && document.visibilityState === 'hidden';
  }

  /** Phones suspend network requests of hidden tabs; start analysis only when the user is back. */
  function waitUntilVisible() {
    if (!isPageHidden()) return Promise.resolve();
    logEvent('info', 'Вкладка скрыта — анализ отложен до возвращения в таверну');
    return new Promise(resolve => {
      const onVisible = () => {
        if (isPageHidden()) return;
        document.removeEventListener('visibilitychange', onVisible);
        resolve();
      };
      document.addEventListener('visibilitychange', onVisible);
    });
  }

  /** One retry when the request died because the tab was hidden mid-flight. */
  async function analyzeWithResume(ctx, sourceState, message, loreContext, options = {}) {
    let hiddenDuringRequest = false;
    const markHidden = () => { if (isPageHidden()) hiddenDuringRequest = true; };
    document.addEventListener('visibilitychange', markHidden);
    try {
      return await analyzeMessage(routedContext(ctx, settings, 'analysis'), sourceState, message, settings, loreContext, options);
    } catch (error) {
      if (!hiddenDuringRequest) throw error;
      logEvent('warn', 'Запрос анализа прервался, пока вкладка была скрыта — повторяю', error);
      await waitUntilVisible();
      return analyzeMessage(routedContext(ctx, settings, 'analysis'), sourceState, message, settings, loreContext, options);
    } finally {
      document.removeEventListener('visibilitychange', markHidden);
    }
  }

  /** Returns the operations to apply: all, only the small ones, or null when cancelled. */
  async function confirmLargeChanges(operations) {
    // A jump is judged after the chat's tempo: on «очень медленно» +12 becomes +3 and is not a jump.
    const tempo = state.ui?.tempo ?? 'normal';
    const isLarge = item => Math.abs(tempoDelta(Number(item.delta), tempo)) >= settings.largeChangeThreshold;
    if (!settings.confirmLargeChanges || !operations.some(isLarge)) return operations;
    const smallOnly = operations.filter(item => !isLarge(item));
    const shown = operations.map(item => ({ ...item, delta: tempoDelta(Number(item.delta), tempo) }));
    const rows = describeProposedChanges(state, shown, settings.largeChangeThreshold).map(change => {
      const sign = change.delta > 0 ? '+' : '';
      const line = `${escapeHtml(change.from)} → ${escapeHtml(change.to)}: ${escapeHtml(change.scale)} ${sign}${change.delta}`;
      return `<li style="margin:4px 0">${change.large ? `<b>${line}</b>` : line}${change.reason ? `<br><small>${escapeHtml(change.reason)}</small>` : ''}</li>`;
    }).join('');
    const result = await context.Popup.show.confirm(
      'Скачок в отношениях',
      `<p>Анализатор предлагает крупное изменение (порог ${settings.largeChangeThreshold}). Крупные выделены:</p><ul style="text-align:left;margin:0;padding-left:18px">${rows}</ul><p>Воспоминания и напряжения из этого ответа сохранятся при любом выборе, кроме «Отменить».</p>`,
      {
        okButton: 'Применить всё',
        cancelButton: 'Отменить',
        customButtons: [{ text: 'Только мелкие', result: context.POPUP_RESULT.CUSTOM1, tooltip: 'Отбросить крупные изменения шкал, остальное применить' }],
      },
    );
    if (result === context.POPUP_RESULT.AFFIRMATIVE) return operations;
    if (result === context.POPUP_RESULT.CUSTOM1) return smallOnly;
    return null;
  }

  /** Ask the user about unregistered scene participants. Returns [] / accepted list, or null if analysis was cancelled. */
  async function confirmNewCharacters(characters, ctx) {
    if (!characters?.length) return [];
    // Popup text is HTML: names and notes come from the model and must be escaped.
    const lines = characters.map(character =>
      `<li>${escapeHtml(character.name)}${character.aliases.length ? ` (${escapeHtml(character.aliases.join(', '))})` : ''}${character.note ? ` — ${escapeHtml(character.note)}` : ''}</li>`).join('');
    const accepted = await ctx.Popup.show.confirm(
      'Новые персонажи в сцене',
      `<p>В этом ответе участвуют незарегистрированные персонажи:</p><ul style="text-align:left;margin:0;padding-left:18px">${lines}</ul><p>Добавить их и линии отношений с ними? Ответ «Нет» сохранит анализ только по известным персонажам.</p>`,
    );
    if (accepted !== ctx.POPUP_RESULT.AFFIRMATIVE) return [];
    return characters;
  }

  async function processMessage(messageIndex, force = false, expectedChatId, expectedEpoch = chatEpoch) {
    const ctx = SillyTavern.getContext();
    const sourceChatId = ctx.getCurrentChatId();
    const label = `Сообщение #${messageIndex}`;
    const skip = reason => { logEvent('info', `${label}: анализ пропущен — ${reason}`); return { applied: 0, skipped: reason }; };
    if ((expectedChatId != null && sourceChatId !== expectedChatId) || expectedEpoch !== chatEpoch) return skip('чат сменился до начала анализа');
    if (isGenerationActive()) await waitForGenerationEnd();
    if (expectedEpoch !== chatEpoch || SillyTavern.getContext().getCurrentChatId() !== sourceChatId) return skip('чат сменился во время генерации');
    const message = ctx.chat?.[messageIndex];
    if (!settings.enabled) return skip('расширение выключено');
    if (!message || message.is_user || !message.mes?.trim()) return skip('нет ответа бота с текстом');
    if (messageMarker(message)?.historyImported) {
      if (force) throw new Error('Это сообщение уже учтено в общем анализе истории. Для пересчёта используйте «Проанализировать историю».');
      return skip('уже учтено в анализе истории');
    }
    const textHash = fingerprint(message.mes);
    if (!force && messageMarker(message)?.fingerprint === textHash) return skip('этот текст уже проанализирован');
    if (!force) await waitUntilVisible();
    // Analyse against the state WITHOUT this message's earlier result. A re-check
    // (swipe back, edit, manual) told "already recorded" about the very memories and
    // events it is about to roll back would leave them out, and they would be lost.
    const sourceState = state.operations.some(operation => operation.messageId === String(messageIndex))
      ? rollbackMessage(state, String(messageIndex)) : state;
    const loreContext = withCardSheets(await loadLinkedLore(ctx, sourceState, undefined, { skipEntry: sheetSkip(sourceState) }), sourceState, presentIds(sourceState), 5000);
    if (expectedEpoch !== chatEpoch) return skip('чат сменился');
    logEvent('info', `${label}: анализ начат${force ? ' (вручную)' : ''}`);
    const headcanonKeys = autoHeadcanonKeys(sourceState, message.mes);
    const knowledge = settings.trackKnowledge !== false
      ? { candidates: await knowledgeCandidates(sourceState, message.mes), loreList: gateLoreList() } : null;
    // The scene chronicler (time, place, clothes, things) travels with the knowledge one.
    const trackWorld = settings.trackWorld !== false;
    const separateChronicle = Boolean((knowledge || trackWorld) && settings.knowledgeSeparateRequest);
    const result = await analyzeWithResume(ctx, sourceState, message, loreContext,
      { headcanonPairs: headcanonKeys, knowledge: separateChronicle ? null : knowledge, world: !separateChronicle && trackWorld && { library: locationLibrary.get(), wardrobe: wardrobeFor(sourceState), skipItemIds: shadeItems(sourceState), weather: currentWeather(sourceState) } });
    if (!knowledge) result.knowledge = null;
    if (!trackWorld) result.world = null;
    const chroniclerExpected = Boolean(knowledge || trackWorld);
    if (separateChronicle) {
      try {
        const chronicle = await analyzeKnowledge(routedContext(ctx, settings, 'analysis'), sourceState, message, settings,
          knowledge?.candidates ?? [], { knowledge: Boolean(knowledge), loreList: knowledge?.loreList ?? [], world: trackWorld && { library: locationLibrary.get(), wardrobe: wardrobeFor(sourceState), skipItemIds: shadeItems(sourceState), weather: currentWeather(sourceState) } });
        result.knowledge = chronicle?.knowledge ?? null;
        result.world = chronicle?.world ?? null;
      } catch (error) {
        // Relationships of this reply still apply; only its chronicle is missing.
        logEvent('warn', `${label}: летописец не ответил — знания и сцена этого ответа не записаны`, error);
        result.knowledge = null;
        result.world = null;
      }
    }
    // Analysis yields relative deltas, so a newer state (a moved slider, a selected
    // pair) is fine to apply them to. Only a different chat or message text is stale.
    const isStale = () => expectedEpoch !== chatEpoch || SillyTavern.getContext().getCurrentChatId() !== sourceChatId
      || fingerprint(SillyTavern.getContext().chat?.[messageIndex]?.mes) !== textHash;
    if (isStale()) return skip('чат или текст сообщения изменились, пока модель отвечала');
    if (chroniclerExpected) {
      const answered = (knowledge && result.knowledge) || (trackWorld && result.world);
      noteChronicler(Boolean(answered), answered ? '' : 'модель не вернула часть летописца (knowledge / world)');
      if (!answered) logEvent('warn', `${label}: летописец промолчал — в ответе модели нет знаний и сцены`);
    }
    const confirmedOperations = await confirmLargeChanges(result.operations);
    if (!confirmedOperations) return skip('скачок отклонён пользователем');
    if (confirmedOperations.length !== result.operations.length) logEvent('info', `${label}: крупные изменения отброшены, применяются только мелкие`);
    result.operations = confirmedOperations;
    if (isStale()) return skip('чат или текст сообщения изменились');
    // A "new" character the registry already has (another spelling, the name in parts, the same
    // sound) is not new: the name becomes their other name. A doubtful one is asked about once.
    const aliasAdds = new Map();
    const fresh = [];
    for (const character of result.newCharacters ?? []) {
      const match = [character.name, ...(character.aliases ?? [])].map(name => matchEntity(sourceState, name)).find(Boolean);
      if (match?.sure) { aliasAdds.set(match.id, [...(aliasAdds.get(match.id) ?? []), character.name, ...(character.aliases ?? [])]); continue; }
      if (match && match.ids.length === 1 && !(state.ui?.distinctPairs ?? []).some(key => key.includes(match.ids[0]))) {
        const known = sourceState.entities[match.ids[0]];
        const same = await ctx.Popup.show.confirm('Это тот же персонаж?',
          `<p>Модель называет «${escapeHtml(character.name)}». В Закулисье есть «${escapeHtml(known.name)}». Это один и тот же персонаж?</p><p>«Да» — имя станет его другим именем. «Нет» — будет новый персонаж.</p>`);
        if (same === ctx.POPUP_RESULT.AFFIRMATIVE) { aliasAdds.set(known.id, [...(aliasAdds.get(known.id) ?? []), character.name, ...(character.aliases ?? [])]); continue; }
      }
      fresh.push(character);
    }
    result.newCharacters = fresh;
    const acceptedNewCharacters = await confirmNewCharacters(result.newCharacters, ctx);
    if (acceptedNewCharacters === null) return skip('анализ отменён');
    if (isStale()) return skip('чат или текст сообщения изменились');
    const transactionId = `message:${messageIndex}:${textHash}`;
    let next = state.operations.some(operation => operation.messageId === String(messageIndex))
      ? rollbackMessage(state, String(messageIndex)) : state;
    // Re-analysis replaces this message's automatic headcanons too.
    next = withoutAutoHeadcanons(next, String(messageIndex));
    // Names that turned out to be known people: their other names now (manual, a swipe keeps them).
    if (aliasAdds.size) {
      next = applyOperations(next, aliasOperations(next, new Map([...aliasAdds].map(([id, names]) => [id, names.filter(name => name && !resolveEntityId(next, name))]))));
      logEvent('info', `${label}: узнаны под другим написанием — ${[...aliasAdds.keys()].map(id => next.entities[id]?.name).join(', ')}`);
    }
    const allowNewPair = await confirmNewPairs(next, result, acceptedNewCharacters);
    if (!allowNewPair) return skip('анализ отменён');
    if (isStale()) return skip('чат или текст сообщения изменились');
    const applied = applyAnalysisResult(next, result, { transactionId, messageId: String(messageIndex), messageIndex }, acceptedNewCharacters,
      { linkedScales: settings.linkedScales !== false, tempo: state.ui?.tempo ?? 'normal', pairTempo: state.ui?.pairTempo ?? {}, allowNewPair, headcanonKeys, trackKnowledge: Boolean(knowledge), trackWorld, loreTitles: knowledge?.loreList?.length ? new Set(knowledge.loreList) : null, library: locationLibrary.get(), wardrobe: wardrobeFor(next) });
    next = applied.state;
    const operations = applied.operations;
    const leaks = applied.leaks ?? [];
    const deaths = applied.deaths ?? [];
    const questHints = applied.quests ?? [];
    const reveals = applied.reveals ?? [];
    const secretHints = applied.secrets ?? [];
    const slips = applied.slips ?? [];
    for (const death of deaths) {
      logEvent('warn', `${label}: похоже, ${next.entities[death.entityId]?.name ?? death.entityId} умирает${death.note ? ` (${death.note})` : ''}${death.quote ? `: «${death.quote}»` : ''}`);
    }
    for (const slip of slips) {
      logEvent('warn', `${label}: возможный ляп (${SLIP_LABELS[slip.kind] ?? slip.kind})${slip.entityId ? ` — ${next.entities[slip.entityId]?.name ?? slip.entityId}` : ''}: «${slip.quote}»${slip.note ? ` (${slip.note})` : ''}`);
    }
    for (const leak of leaks) {
      logEvent('warn', `${label}: возможная утечка — ${next.entities[leak.entityId]?.name ?? leak.entityId} знает о «${next.knowledge?.events?.find(event => event.id === leak.eventId)?.text ?? leak.eventId}»${leak.quote ? `: «${leak.quote}»` : ''}`);
    }
    const headcanonIds = [];
    for (const { key, text } of applied.headcanons ?? []) {
      const added = addHeadcanons(next, key, [text], { source: 'auto', messageId: messageIndex });
      next = { ...next, ui: { ...next.ui, headcanons: added.headcanons } };
      headcanonIds.push(...added.ids);
    }
    if (!operations.length && !headcanonIds.length && !leaks.length && !deaths.length && !reveals.length && !secretHints.length && !slips.length && !questHints.length) return skip('модель не нашла изменений');
    message.extra ??= {};
    message.extra[MESSAGE_EXTRA_KEY] = {
      fingerprint: textHash,
      transactionId,
      operationIds: operations.map(operation => operation.id),
      ...(headcanonIds.length ? { headcanonIds } : {}),
      // Leaks are not journaled: they describe this text, and the badge reads them here.
      ...(leaks.length ? { leaks } : {}),
      // A death is only proposed: the plaque under the reply asks, the answer is journaled with this message.
      ...(deaths.length ? { deaths } : {}),
      // Quests the reply shows (a new one, a step done, an end): proposals only, the plaque asks.
      ...(questHints.length ? { quests: questHints } : {}),
      // A lorebook secret reaching someone is asked too: «Отметить» journals it with this message.
      ...(reveals.length ? { reveals } : {}),
      // A guess at a real secret: only offered under the reply, nothing is written until the person confirms.
      ...(secretHints.length ? { secrets: secretHints } : {}),
      // Continuity slips (clothes, things, time, place) of this text, for the plaque under it.
      ...(slips.length ? { slips } : {}),
      analyzedAt: new Date().toISOString(),
    };
    await commit(next, true);
    if (acceptedNewCharacters.length) enrichAliases();
    if (headcanonIds.length) { await prepareHeadcanons(); refreshPrompt(); }
    logEvent('info', `${label}: применено изменений — ${operations.length}${headcanonIds.length ? `, новых хедканонов — ${headcanonIds.length}` : ''}, состояние сохранено`);
    if (isGenerationActive()) await waitForGenerationEnd();
    await SillyTavern.getContext().saveChat();
    return { applied: operations.length + headcanonIds.length };
  }

  /** Pairs whose automatic headcanons the analyzer may extend: auto on, both members in the reply. */
  function autoHeadcanonKeys(targetState, text) {
    if (!settings.autoHeadcanons) return [];
    const present = [...mentionedEntities(targetState, text)];
    const keys = [];
    for (let left = 0; left < present.length; left += 1) {
      for (let right = left + 1; right < present.length; right += 1) {
        const key = headcanonKey(present[left], present[right]);
        if (isAutoHeadcanons(targetState, key)) keys.push(key);
      }
    }
    // Groups of three or more: when every member is in the reply.
    const here = new Set(present);
    for (const key of Object.keys(targetState.ui?.headcanons ?? {})) {
      const ids = headcanonPairIds(key);
      if (ids.length > 2 && ids.every(id => here.has(id)) && isAutoHeadcanons(targetState, key)) keys.push(key);
    }
    return keys.slice(0, 12);
  }

  function withoutAutoHeadcanons(targetState, messageId) {
    const { headcanons, dropped } = dropAutoHeadcanons(targetState, id => id === messageId);
    return dropped ? { ...targetState, ui: { ...targetState.ui, headcanons } } : targetState;
  }

  /**
   * #25: new lines between two characters can be switched off, new lines toward
   * the persona are confirmed. A dry run (applyAnalysisResult is pure) tells which
   * lines the result would create. Returns a predicate, or null when cancelled.
   */
  async function confirmNewPairs(baseState, result, acceptedNewCharacters) {
    const personaId = baseState.ui?.personaId || '';
    const allowCharacterLines = settings.autoCharacterLines !== false;
    const basePolicy = (subjectId, objectId) => allowCharacterLines || (personaId && objectId === personaId);
    const dryRun = applyAnalysisResult(baseState, result, {}, acceptedNewCharacters, { linkedScales: false, allowNewPair: basePolicy }).state;
    const created = Object.values(dryRun.relationships).filter(relation => !baseState.relationships[relation.id]);
    const personaLines = settings.confirmPersonaLines === false ? [] : created.filter(relation => personaId && relation.to === personaId);
    let rejected = new Set();
    if (personaLines.length) {
      // One checkbox per line (all checked): create only the ticked ones; "Без них" creates none.
      const nameOf = id => dryRun.entities[id]?.name ?? id;
      const ctx = SillyTavern.getContext();
      const inputs = personaLines.map((relation, index) => ({
        id: `kulisy-persona-line-${index}`,
        label: `${nameOf(relation.from)} → ${nameOf(relation.to)}`,
        defaultState: true,
      }));
      const popup = new ctx.Popup(
        '<h3>Новые линии с персоной</h3><p>Анализ хочет начать отслеживать чувства к персоне. Отметьте линии, которые нужно создать; анализ применится и без остальных.</p>',
        ctx.POPUP_TYPE.CONFIRM, null,
        { okButton: 'Создать отмеченные', cancelButton: 'Без них', customInputs: inputs },
      );
      const answer = await popup.show();
      rejected = new Set(personaLines
        .filter((relation, index) => answer !== ctx.POPUP_RESULT.AFFIRMATIVE || !popup.inputResults?.get(inputs[index].id))
        .map(relation => relation.id));
      if (rejected.size) logEvent('info', `Новые линии с персоной отклонены: ${rejected.size} из ${personaLines.length}`);
    }
    return (subjectId, objectId) => basePolicy(subjectId, objectId) && !rejected.has(relationshipId(subjectId, objectId));
  }

  function lastBotMessageIndex() {
    const chat = SillyTavern.getContext().chat ?? [];
    for (let index = chat.length - 1; index >= 0; index -= 1) {
      if (!chat[index]?.is_user && !chat[index]?.is_system && chat[index]?.mes?.trim()) return index;
    }
    return -1;
  }

  /** Manual check from a message button, the widget or the Studio, with a visible outcome. */
  async function runManualCheck(index) {
    const toast = globalThis.toastr;
    if (!Number.isInteger(index) || index < 0) {
      toast?.warning?.('В чате нет ответа бота для проверки.', 'Закулисье');
      return null;
    }
    toast?.info?.(`Проверяю ответ #${index}…`, 'Закулисье', { timeOut: 2500 });
    const result = await enqueueAnalysis(index, true);
    if (!result) return null; // the failure toast is shown by enqueueAnalysis
    if (result.applied) toast?.success?.(`Применено изменений: ${result.applied}. Подробности — во вкладке «История».`, 'Закулисье');
    else toast?.info?.(`Без изменений: ${result.skipped}.`, 'Закулисье');
    return result;
  }

  function enqueueAnalysis(messageIndex, force = false) {
    const queuedContext = SillyTavern.getContext();
    const expectedChatId = queuedContext.getCurrentChatId();
    const expectedEpoch = chatEpoch;
    analysisQueue = analysisQueue.then(() => processMessage(Number(messageIndex), force, expectedChatId, expectedEpoch)).catch(error => {
      logEvent('error', `Сообщение #${messageIndex}: анализ не удался`, error);
      globalThis.toastr?.error?.(error.message, 'Закулисье');
      noteChronicler(false, error?.message);
    });
    return analysisQueue;
  }

  /**
   * The chronicler can go quiet without an error: a weak model drops the "world" part,
   * or the request keeps failing. Two answers in a row like that and the user is told
   * once (a toast and a line on «Сейчас»), instead of clothes and time silently freezing.
   */
  function noteChronicler(ok, reason = '') {
    if (ok) {
      const wasSilent = chroniclerHealth.silent >= 2;
      Object.assign(chroniclerHealth, { silent: 0, lastError: '', warned: false });
      if (wasSilent) notify();
      return;
    }
    chroniclerHealth.silent += 1;
    chroniclerHealth.lastError = String(reason || '').slice(0, 200);
    if (chroniclerHealth.silent >= 2 && !chroniclerHealth.warned) {
      chroniclerHealth.warned = true;
      globalThis.toastr?.warning?.('Летописец молчит уже несколько ответов подряд: время, одежда и знания не обновляются. Подробности — в «Настройки → Диагностика».', 'Закулисье', { timeOut: 12000 });
    }
    notify();
  }

  async function reconcileMessageTransactions(expectedChatId, expectedEpoch) {
    const current = SillyTavern.getContext();
    if (expectedEpoch !== chatEpoch || current.getCurrentChatId() !== expectedChatId) return;
    const chat = current.chat ?? [];
    const liveOperations = new Map();
    const liveHeadcanons = new Map();
    chat.forEach((message, index) => {
      const marker = messageMarker(message);
      for (const operationId of marker?.operationIds ?? []) liveOperations.set(operationId, index);
      for (const headcanonId of marker?.headcanonIds ?? []) liveHeadcanons.set(headcanonId, index);
    });
    // Automatic headcanons follow their message to its new index, or leave with it.
    const remapped = remapAutoHeadcanons(state, id => liveHeadcanons.get(id) ?? null);
    const kept = state.operations
      .filter(operation => !operation.messageId || liveOperations.has(operation.id))
      .map(operation => {
        if (!operation.messageId) return operation;
        const index = liveOperations.get(operation.id);
        return { ...operation, messageId: String(index), messageIndex: index };
      });
    if (kept.length === state.operations.length
      && kept.every((operation, index) => operation.messageIndex === state.operations[index].messageIndex)) {
      if (remapped.changed) await commitHeadcanons(remapped.headcanons);
      return;
    }
    const ui = { ...structuredClone(state.ui ?? { activeRelationshipId: '' }), headcanons: remapped.headcanons };
    const next = applyOperations(replayBase(state, { ui }), kept);
    if (expectedEpoch !== chatEpoch || SillyTavern.getContext().getCurrentChatId() !== expectedChatId) return;
    await commit(next, true);
    if (remapped.changed) { await prepareHeadcanons(); refreshPrompt(); }
  }

  const events = context.eventTypes ?? context.event_types;
  listen(events.CHAT_CHANGED, () => {
    chatEpoch += 1;
    state = storage.load();
    resetDice();
    autoBindPersona(state).catch(error => console.error('[Kulisy] Persona auto-bind failed.', error)).then(() => syncPersonaFromTavern());
    // Library places edited while this chat was closed: bring its cards up to date.
    // Cards that left the library meanwhile are let go of their characters, in the same save.
    try {
      const libraryOperations = syncChat(state, locationLibrary);
      let synced = syncChatCards(libraryOperations.length ? applyOperations(state, libraryOperations) : state, locationLibrary);
      // The cards tied to this chat's narrator switch on by themselves (once per card: one switched off by hand stays off).
      const auto = autoLinkNarratorCards(synced, locationLibrary.get(), currentNarrator().avatar);
      if (auto.linked.length || auto.skipped.length) {
        synced = auto.state;
        const names = auto.linked.map(item => locationLibrary.get().characters.find(card => card.id === item.cardId)?.name).filter(Boolean);
        if (names.length) globalThis.toastr?.info?.(`Карточки нарратора включены в чате: ${names.join(', ')}`, 'Закулисье');
        for (const skip of auto.skipped) globalThis.toastr?.warning?.(`Карточка «${skip.name}» не включилась: ${skip.why}`, 'Закулисье');
      } else if (auto.state !== synced) synced = auto.state;
      if (synced !== state) commit(synced, true).catch(error => logEvent('warn', 'Локации и карточки чата не обновились по библиотеке', error));
    } catch (error) {
      logEvent('warn', 'Локации и карточки чата не обновились по библиотеке', error);
    }
    sceneHeadcanons = [];
    gateTracker.clear();
    cardTracker.clear();
    cardsReport = null;
    gateReport = null;
    gateCatalog = [];
    tavernBooks = null;
    refreshPrompt();
    notify();
    const epoch = chatEpoch;
    prepareHeadcanons().then(() => { if (epoch === chatEpoch) refreshPrompt(); });
    enrichAliases();
    remindLoreSecrets().catch(error => logEvent('warn', 'Секреты из лорбука не проверены', error));
  });
  // Lorebook secrets never reach SillyTavern's own world info: Kulisy sends them to who knows.
  listen(events.WORLDINFO_ENTRIES_LOADED, lists => {
    try {
      const loaded = [...new Set(Object.values(lists ?? {}).flatMap(list => (Array.isArray(list) ? list.map(entry => entry?.world) : [])).filter(Boolean))].sort();
      const changed = JSON.stringify(loaded) !== JSON.stringify(tavernBooks);
      tavernBooks = loaded;
      if (changed) notify();
    } catch (error) {
      console.error('[Kulisy] Could not read which lorebooks SillyTavern loaded.', error);
    }
    if (!settings.enabled) return;
    if (settings.trackKnowledge !== false) {
      try {
        const removed = stripSecretEntries(lists);
        if (removed) console.debug(`[Kulisy] Lorebook secrets kept out of world info: ${removed}`);
      } catch (error) {
        console.error('[Kulisy] Lorebook secrets could not be filtered.', error);
      }
    }
    // A character with a library card does not get their lorebook sheet as well: the card says it, once.
    if (settings.sendCards !== false && settings.cardsReplaceLore !== false) {
      try {
        const drops = planSheetDrops({ lists, state, library: locationLibrary.get() });
        if (drops.size) { applyGate(lists, drops); console.debug(`[Kulisy] Карточки заменили записи лорбука: ${drops.size}`); }
      } catch (error) {
        console.error('[Kulisy] Lorebook sheets of carded characters could not be set aside.', error);
      }
    }
    // «Суфлёр лорбуков»: sections of a character's sheet by who is on stage. Any error leaves the lists as they were.
    if (settings.loreGate?.enabled !== true) { gateReport = null; return; }
    try {
      const titles = [...new Set(worldEntries(lists).map(item => item.title))];
      if (titles.length) gateCatalog = titles;
      const chat = SillyTavern.getContext().chat ?? [];
      const posts = chat.filter(message => message?.is_user && !message.is_system);
      // Whoever a stage cue is bringing in counts as on stage for this reply.
      const { decisions, report } = planGate({
        lists, state, config: settings.loreGate,
        presentIds: [...presentIds(state), ...calledIds()],
        mode: state.world?.clock?.mode ?? 'calm',
        turn: posts.length,
        tracker: gateTracker,
        ...gateTexts(chat),
      });
      applyGate(lists, decisions);
      gateReport = report;
      if (report.forced || report.dropped) console.debug(`[Kulisy] Суфлёр: отправлено по правилам ${report.forced}, придержано ${report.dropped} (${report.savedCharacters} зн.)`);
    } catch (error) {
      gateReport = null;
      console.error('[Kulisy] Суфлёр лорбуков не сработал, записи оставлены как есть.', error);
    }
  });
  listen(events.PERSONA_CHANGED, () => { syncPersonaFromTavern(); });
  listen(events.GENERATION_STOPPED, () => consoleLog.add('event', 'Генерацию остановили: кнопкой «стоп», сменой чата или обрывом связи'));
  listen(events.MESSAGE_RECEIVED, messageIndex => {
    // The corrections were for this reply: they are done.
    if (reminders.list().length) { reminders.clear(); refreshPrompt(); }
    if (settings.autoAnalyze) enqueueAnalysis(messageIndex);
    // «Позвать» / «Увести»: the reply brought someone on or sent them off. After the analysis,
    // bound to this reply, so a swipe or a deletion takes it back.
    const moves = presenceAfterReply(directionState());
    if (moves.add.length || moves.remove.length || moves.cast || moves.place) {
      analysisQueue = analysisQueue.then(() => applyCuePresence(Number(messageIndex), moves))
        .catch(error => logEvent('warn', 'Пинок: присутствие не записано', error));
    }
    // The chronicle writes in the background, after the analysis of this reply is queued.
    if (settings.enabled && chronicleConfig(settings.chronicle).enabled) analysisQueue.then(() => chronicleRunner.run()).catch(() => {});
  });
  listen(events.MESSAGE_EDITED, messageIndex => {
    chronicleRunner.onEdited(messageIndex).catch(error => console.error('[Kulisy] Chronicle edit check failed.', error));
    const expectedChatId = SillyTavern.getContext().getCurrentChatId();
    const expectedEpoch = chatEpoch;
    analysisQueue = analysisQueue.then(async () => {
      if (expectedEpoch !== chatEpoch || SillyTavern.getContext().getCurrentChatId() !== expectedChatId) return;
      const hasOperations = state.operations.some(operation => operation.messageId === String(messageIndex));
      const withoutHeads = withoutAutoHeadcanons(hasOperations ? rollbackMessage(state, String(messageIndex)) : state, String(messageIndex));
      if (hasOperations || withoutHeads !== state) await commit(withoutHeads, true);
      if (settings.autoAnalyze) await processMessage(Number(messageIndex), true, expectedChatId, expectedEpoch);
    }).catch(error => console.error('[Kulisy] Edited message processing failed.', error));
  });
  listen(events.MESSAGE_SWIPED, messageIndex => {
    // A swipe often starts a new generation right after this event; wait for MESSAGE_RECEIVED
    // instead of racing the main generation with a background analysis.
    if (isGenerationActive()) return;
    if (settings.autoAnalyze) enqueueAnalysis(messageIndex, true);
  });
  listen(events.MESSAGE_DELETED, () => {
    const expectedChatId = SillyTavern.getContext().getCurrentChatId();
    const expectedEpoch = chatEpoch;
    analysisQueue = analysisQueue.then(() => reconcileMessageTransactions(expectedChatId, expectedEpoch))
      .catch(error => console.error('[Kulisy] Message reconciliation failed.', error));
  });

  async function applyCuePresence(messageIndex, { add, remove, cast = null, place = null }) {
    const ctx = SillyTavern.getContext();
    const message = ctx.chat?.[messageIndex];
    if (!message || message.is_user) return;
    const before = presentIds(state);
    // A new scene with its people chosen: exactly them; otherwise who came and who left.
    const ids = new Set(cast ?? before);
    for (const id of add) if (state.entities[id] && !isDead(state, id)) ids.add(id);
    for (const id of remove) ids.delete(id);
    const payload = { presentIds: [...ids].filter(id => state.entities[id] && !isDead(state, id)) };
    if (place) {
      const known = place.locationId && (state.world?.locations ?? []).some(location => location.id === place.locationId);
      if (known) payload.locationId = place.locationId;
      if (place.location) payload.location = place.location;
    }
    const scene = state.knowledge?.scene ?? {};
    const samePeople = payload.presentIds.length === before.length && before.every(id => payload.presentIds.includes(id));
    const samePlace = !place || ((payload.locationId ?? scene.locationId ?? '') === (scene.locationId ?? '') && (payload.location ?? scene.location ?? '') === (scene.location ?? ''));
    if (samePeople && samePlace) return;
    message.extra ??= {};
    const marker = (message.extra[MESSAGE_EXTRA_KEY] ??= {});
    const operation = createOperation('scene.set', payload, {
      transactionId: marker.transactionId ?? uniqueId('cue'), messageId: String(messageIndex), messageIndex,
      id: uniqueId('analysis'), reason: place || cast ? 'Новая сцена: место и кто в ней' : 'Пинок: кто пришёл и ушёл', timestamp: new Date().toISOString(),
    });
    marker.operationIds = [...(marker.operationIds ?? []), operation.id];
    await commit(applyOperation(state, operation), true);
    try { await ctx.saveChat?.(); } catch (error) { logEvent('warn', 'Пинок: чат не сохранён', error); }
  }

  /** What the scene drawer offers for one character (chat-overlay.js describe). */
  function describeForDirector(id) {
    const entity = state.entities[id];
    if (!entity) return null;
    const personaId = state.ui?.personaId || '';
    const here = presentIds(state);
    const nameOf = other => state.entities[other]?.name ?? other;
    const short = (text, max) => (text.length > max ? `${text.slice(0, max - 1)}…` : text);
    // side 'in': the line A→this one — its factors are what THIS one does that moves A.
    // side 'out': this one's own line →B — its factors are moments with B that move THIS one;
    // the kick makes them open to such a moment (B may be the persona: nobody acts for her).
    const lines = Object.values(state.relationships)
      .filter(relation => relation.factors?.length && relation.from !== personaId
        && ((relation.to === id && state.entities[relation.from]) || (relation.from === id && state.entities[relation.to])))
      .map(relation => ({
        side: relation.to === id ? 'in' : 'out',
        targetId: relation.to === id ? relation.from : relation.to,
        targetName: nameOf(relation.to === id ? relation.from : relation.to),
        factors: relation.factors.map(factor => {
          const text = String(factor.text ?? '').trim();
          const first = text.split('\n')[0].replace(/:$/, '').trim();
          return { label: short(first, 48), text: text.replace(/\s*\n\s*/g, ' ').slice(0, 400) };
        }).filter(factor => factor.text),
      }))
      .filter(line => line.factors.length);
    const secrets = (state.knowledge?.events ?? [])
      .filter(event => event.secret && !event.disabled && howKnows(state, id, event))
      .map(event => {
        const label = String(event.text ?? '').trim();
        const detail = String(event.detail ?? '').trim();
        return { eventId: event.id, label: short(label, 40), text: [label, detail].filter(Boolean).join(' — ').slice(0, 400) };
      })
      .filter(secret => secret.label);
    return {
      name: entity.name,
      persona: id === personaId,
      present: here.includes(id),
      reactTargets: here.filter(other => other !== id).map(other => ({ id: other, name: nameOf(other) })),
      lines,
      secrets,
    };
  }

  /** Today's calendar events, offered as ready scene events. */
  function eventIdeasForDirector() {
    const calendar = calendarView();
    const today = dateOfDay(calendar, state.world?.clock?.day ?? 0);
    if (!today) return [];
    return eventsOn(calendar, today).map(event => [event.time, event.title].filter(Boolean).join(' ')).filter(Boolean).slice(0, 6);
  }

  const reportSecretError = error => globalThis.toastr?.error?.(error?.message ?? String(error), 'Закулисье');
  const selectionChip = mountSelectionChip({ onCreate: selection => createSecretFlow(selection).catch(reportSecretError) });
  const messageButtons = mountMessageButtons(index => { runManualCheck(index); }, index => {
    // The «…» menu steals the selection on phones: use the one remembered a moment ago, else start from this post.
    const recent = selectionChip.recent();
    createSecretFlow(recent ? recent : { text: '', messageIndex: index }).catch(reportSecretError);
  });

  /** The drawer's «Песни»: what plays or is sung in this chat, what the posts bring up, and the library to pick from. */
  function songsView() {
    const library = normalizeSongs(settings.songLibrary);
    const byId = new Map(library.songs.map(song => [song.id, song]));
    const chat = normalizeSongState(state.ui?.songs, { songIds: [...byId.keys()] });
    const label = id => byId.get(id)?.title ?? '';
    return {
      enabled: settings.enabled && library.enabled,
      playing: chat.playing.map(item => ({ songId: item.songId, title: label(item.songId), artist: byId.get(item.songId)?.artist ?? '', mode: item.mode, singerId: item.singerId })),
      found: (songsReport?.found ?? []).filter(item => byId.has(item.songId)).map(item => ({ songId: item.songId, title: item.title, why: item.why, muted: item.muted })),
      muted: chat.muted.map(id => ({ songId: id, title: label(id) })),
      library: library.songs.map(song => ({ songId: song.id, title: song.title, artist: song.artist })),
    };
  }

  /**
   * «АУ не выбрана»: cards in play (the persona's and the characters') hold sections or records written for an AU, but this chat plays none,
   * so none of them reaches the narrator. Null when there is nothing to warn about.
   */
  function auWarningNow() {
    try {
      const lib = normalizePersonaCards(settings.personaCards);
      if (!lib.au.length || (state.ui?.au ?? []).length) return null;
      const ids = new Set(cardOfEntity().values());
      const names = [];
      let hidden = 0;
      for (const card of locationLibrary.get().characters ?? []) {
        if (!ids.has(card.id)) continue;
        const count = (card.sections ?? []).filter(section => section.au?.length).length + (card.records ?? []).filter(record => record.au?.length).length;
        if (!count) continue;
        names.push(card.name);
        hidden += count;
      }
      return hidden ? { names, hidden, chat: String(SillyTavern.getContext().chatId ?? ''), avatar: personaCardNow()?.avatar ?? '' } : null;
    } catch (error) {
      logEvent('warn', 'Проверка АУ не удалась', error);
      return null;
    }
  }

  /** The calendar for the drawer: the month around the story's date and the next events (deadlines of the quests too); null without a date. */
  function calendarGlance() {
    try {
      const calendar = calendarView();
      const today = dateOfDay(calendar, state.world?.clock?.day ?? 0);
      if (!today) return null;
      const clock = clockOf(calendar);
      const quests = questsOf(state);
      const next = comingEvents(calendar, today, quests).slice(0, 8).map(({ event, date, inDays }) => ({ when: inDays === 0 ? 'сегодня' : inDays === 1 ? 'завтра' : clock.shortDate(date), title: event.title, kind: event.kind ? EVENT_KINDS[event.kind] ?? '' : '' }));
      return { today: clock.shortDate(today), month: monthView(calendar, today, { today, quests }), next };
    } catch (error) {
      logEvent('warn', 'Календарь для шторки не собрался', error);
      return null;
    }
  }

  /** The tavern character of this chat (its narrator): { avatar, name }; empty in a group chat or without a chat. */
  function currentNarrator() {
    try {
      const ctx = SillyTavern.getContext();
      if (ctx.groupId) return { avatar: '', name: '' };
      const found = ctx.characters?.[ctx.characterId];
      return found?.avatar ? { avatar: String(found.avatar), name: String(found.name ?? '') } : { avatar: '', name: '' };
    } catch { return { avatar: '', name: '' }; }
  }

  /** The story moment now (day and time of the clock as one number), or null while the day is unknown. */
  function planClockNow() {
    return absOf(state.world?.clock?.day, state.world?.clock?.time);
  }

  /** «2 недели» or «месяц» in story minutes, by the rules of the story's calendar (a month by its real months when the date is known, else 30 days). */
  function planSpanMinutes(unit, amount) {
    if (unit === 'hour') return amount * 60;
    if (unit === 'day') return amount * 1440;
    const calendar = calendarOf();
    const cal = clockOf(calendar);
    if (unit === 'week') return amount * cal.weekdayCount * 1440;
    const today = dateOfDay(calendar, state.world?.clock?.day ?? 0);
    if (today && cal.valid(today)) {
      const [year, month, day] = today.split('-').map(Number);
      const total = month - 1 + amount;
      const toYear = year + Math.floor(total / cal.monthsCount);
      const toMonth = (total % cal.monthsCount) + 1;
      const pad = (value, width) => String(value).padStart(width, '0');
      const target = `${pad(toYear, 4)}-${pad(toMonth, 2)}-${pad(Math.min(day, cal.daysInMonth(toYear, toMonth)), 2)}`;
      const between = cal.valid(target) ? cal.daysBetween(today, target) : null;
      if (between > 0) return between * 1440;
    }
    return amount * 30 * 1440;
  }

  /** Chips: everyone on stage, plus whoever the last messages mention (likely to come on). */
  function overlayView() {
    const enabled = settings.enabled && settings.trackKnowledge !== false;
    const personaId = state.ui?.personaId || '';
    const here = new Set(presentIds(state));
    const nearby = mentionedEntities(state, recentSceneText(SillyTavern.getContext().chat, 3, 4000));
    const direction = directionState();
    const cueIds = direction.cues.map(cue => cue.entityId).filter(Boolean);
    const ids = [...new Set([...here, ...nearby, ...cueIds])].filter(id => state.entities[id] && !isDead(state, id));
    const chat = SillyTavern.getContext().chat ?? [];
    let silent = new Map();
    try {
      // Only the tail of the chat: the count looks back at most 30 replies, and mapping a chat of thousands of messages on each redraw is waste.
      silent = silenceCounts(chat.slice(-300).map(message => ({ isUser: Boolean(message?.is_user), text: message?.is_system ? '' : message?.mes })),
        [...here].filter(id => id !== personaId), text => mentionedEntities(state, text));
    } catch (error) { console.error('[Kulisy] Silence count failed.', error); }
    const nameOf = id => state.entities[id]?.name ?? id;
    const director = settings.director ?? {};
    return {
      auWarning: enabled ? auWarningNow() : null,
      setup: (() => { const setup = setupSnapshot(); return { due: setupReminderDue({ enabled: setup.enabled, remind: setup.remind, off: setup.off }, setup.progress), done: setup.progress.done, total: setup.progress.total, steps: setup.steps.map(step => ({ id: step.id, title: step.title, tab: step.tab, required: step.required, done: step.done })), chat: String(SillyTavern.getContext().chatId ?? '') }; })(),
      chips: settings.enabled && settings.sceneChips !== false,
      railSide: settings.railSide === 'right' ? 'right' : 'left',
      cast: ids.map(id => ({ id, name: state.entities[id].name, present: here.has(id), persona: id === personaId, silent: silent.get(id) ?? 0 })),
      director: {
        open: director.open === true,
        silenceAfter: Math.max(0, Math.round(Number(director.silenceAfter ?? 4)) || 0),
        hotkeys: director.hotkeys !== false,
        canKick: !isGenerationActive(),
        favorites: normalizeFavorites(settings.directionFavorites),
        // The planned events (they count story time): what they say, when, how long is left. A «within» plan never shows its drawn moment.
        plans: normalizePlans(direction.plans).map(plan => ({ id: plan.id, ...describePlan(plan, planClockNow()), genre: plan.genre ?? '', within: plan.within })),
        planClock: planClockNow() != null,
        planHours: /^\d{1,2}:\d{2}$/.test(String(state.world?.clock?.time ?? '').trim()),
        // «Рассказчику»: the saved notes (with the cooldown left) and the ones pinned to this chat.
        notes: (() => {
          const count = replyCountOf(SillyTavern.getContext().chat);
          return {
            library: normalizeNoteLibrary(settings.narratorNotes).map(item => ({ ...item, left: noteCooldownLeft(direction, item.id, item.every, count) })),
            pins: [
              ...normalizeNoteLibrary(settings.narratorPins).map(pin => ({ id: pin.id, text: pin.text, every: pin.every, left: globalPinLeft(direction, pin, count), scope: 'all' })),
              ...(direction.pins ?? []).map(pin => ({ id: pin.id, text: pin.text, every: pin.every, left: pinLeft(pin, count), scope: 'chat' })),
            ],
          };
        })(),
        cues: direction.cues.map(cue => ({ id: cue.id, kind: cue.kind, entityId: cue.entityId ?? '', label: cueLabel(cue, nameOf), badge: cueBadge(cue), used: cue.used, wait: cue.wait })),
        // For «🎬 Сцена»: the chat's places and everyone who can be in a scene.
        places: (state.world?.locations ?? []).filter(location => !location.off).map(location => ({ id: location.id, name: location.name })),
        people: Object.values(state.entities).filter(entity => !isDead(state, entity.id))
          .map(entity => ({ id: entity.id, name: entity.name, persona: entity.id === personaId, present: here.has(entity.id) }))
          .sort((left, right) => Number(right.present) - Number(left.present) || left.name.localeCompare(right.name, 'ru')),
        others: Object.values(state.entities)
          .filter(entity => !ids.includes(entity.id) && entity.id !== personaId && !isDead(state, entity.id))
          .map(entity => ({ id: entity.id, name: entity.name }))
          .sort((left, right) => left.name.localeCompare(right.name, 'ru')),
      },
      clock: { time: state.world?.clock?.time ?? '', day: state.world?.clock?.day ?? 0, label: state.world?.clock?.label ?? '' },
      dice: diceView(),
      songs: songsView(),
      calendar: enabled ? calendarGlance() : null,
      quests: enabled ? questsOf(state).filter(quest => quest.status === 'active').slice(0, 6).map(quest => {
        const step = currentStep(quest);
        const progress = progressOf(quest);
        const pushed = directionState().cues.some(cue => cue.kind === 'quest' && cue.text.startsWith(quest.name));
        return { id: quest.id, name: quest.name, secret: Boolean(quest.secret), stepId: step?.id ?? '', step: step?.text ?? '', progress: progress.total ? `${progress.done}/${progress.total}` : '', due: dueText(quest, state.world?.clock?.day ?? 0), pushed };
      }) : [],
      heat: (() => { const found = state.world?.heat; return { value: found?.value ?? 0, label: heatLevel(found?.value ?? 0).label, lock: Boolean(found?.lock), why: found?.why ?? '' }; })(),
      sceneMode: state.world?.clock?.mode ?? 'calm',
      weather: (() => { const found = currentWeather(); return found ? { kind: found.kind, temp: found.temp, source: found.source, badge: weatherBadge(found), scenario: found.scenario ?? '', manual: Boolean(found.manual), text: found.text ?? '' } : null; })(),
      // The week ahead for the drawer: [{ day, label, kind, temp, source }], and the story day today (0 = unknown).
      weatherDay: state.world?.clock?.day ?? 0,
      weatherWeek: (() => {
        try {
          const calendar = calendarOf();
          const today = state.world?.clock?.day ?? 0;
          if (!today) return [];
          // Seven days from today, every one of them (a day with no weather known has an empty kind: it can still be picked).
          return Array.from({ length: 7 }, (_, offset) => {
            const day = today + offset;
            const date = dateOfDay(calendar, day);
            const found = weatherFor({ ...state, world: { ...state.world, weather: offset === 0 ? state.world?.weather : null } }, { plan: state.ui?.weatherPlan, climates: settings.weatherClimates, date, day, part: 'day', time: offset === 0 ? undefined : '', ...weatherCalendar(state) });
            return { day, label: date ? calendarShortDate(calendar, date) : `день ${day}`, kind: found?.kind ?? '', temp: found?.temp ?? null, source: found?.source ?? '' };
          });
        } catch (error) { console.error('[Kulisy] Week forecast failed.', error); return []; }
      })(),
      location: state.knowledge?.scene?.location ?? '',
      // Time and, when the calendar knows it, the date: «14:20 · вт 8 апр».
      time: settings.trackWorld !== false ? [state.world?.clock?.time ?? '', calendarShortDate(calendarOf(), dateOfDay(calendarOf(), state.world?.clock?.day ?? 0))].filter(Boolean).join(' · ') : '',
      leaks: enabled ? openLeaks() : [],
      deaths: enabled ? openDeaths() : [],
      questHints: enabled ? openQuestHints() : [],
      lastSent,
      build: KULISY_BUILD,
      reveals: enabled ? openReveals() : [],
      secretHints: enabled ? openSecretHints() : [],
      secrets: enabled ? (state.knowledge?.events ?? []).filter(event => event.secret && !event.disabled).length : 0,
      waitingReveals: enabled ? openReveals().length : 0,
      slips: settings.enabled && settings.trackWorld !== false ? openSlips() : [],
    };
  }

  /** Open a page of the Studio: its own window when windows are separate, else the one panel. */
  function openStudioTab(tab) {
    return tab && settings.studioMulti === true && tab !== 'personas' ? pressWindowButton(windowOf(tab).id, tab, { toggle: false }) : tab ? studio.show(tab) : studio.open();
  }

  const LEAK_ACTIONS = { swipe: 'onLeakSwipe', knows: 'onLeakKnows', dismiss: 'onLeakDismiss' };
  const chatOverlay = mountChatOverlay({
    onStage: payload => Promise.resolve(worldCallbacks.onSetStage(payload)).then(() => diceResend()).catch(error => globalThis.toastr?.error?.(error.message, 'Закулисье')),
    onDiceRelease: ({ group, option }) => diceRelease(group, option),
    onHeat: payload => Promise.resolve(worldCallbacks.onSetHeat(payload)).catch(error => globalThis.toastr?.error?.(error.message, 'Закулисье')),
    onCalendarSave: event => calendarCallbacks.onCalendarSaveEvent({ event }),
    onCalendarRemove: ({ id }) => calendarCallbacks.onCalendarRemoveEvent({ id }),
    onQuestStep: payload => Promise.resolve(worldCallbacks.onQuestStep(payload)).catch(error => globalThis.toastr?.error?.(error.message, 'Закулисье')),
    onSong: payload => Promise.resolve(songsCallbacks.onSongChat(payload)).catch(error => globalThis.toastr?.error?.(error.message, 'Закулисье')),
    onQuestPush: payload => questCallbacks.onQuestPush(payload),
    onDiceRoll: ({ only }) => diceRoll(only || ''),
    onDiceToggle: ({ group, option }) => diceToggle(group, option),
    onDiceLock: ({ group }) => diceLock(group),
    onDiceAdd: ({ group, text }) => diceAdd(group, text),
    onDiceSend: () => diceSend(),
    onDiceClear: () => diceClear(),
    onSetTime: async payload => {
      try { await worldCallbacks.onSetClock(payload); return true; } catch (error) { globalThis.toastr?.error?.(error.message, 'Закулисье'); return false; }
    },
    /**
     * The drawer's weather. `from` (0 = today) and `days` say for which days; one day from today is the plain «set the weather now» (and may be held),
     * more is painted on the plan like in the calendar window. { clear: true } hands the days back to the forecast.
     */
    onWeather: ({ kind, temp, text = '', lock, clear, from = 0, days = 1 }) => {
      const today = state.world?.clock?.day ?? 0;
      const range = today > 0 && (from > 0 || days > 1);
      return Promise.resolve().then(() => {
        if (clear) return range ? weatherCallbacks.onWeatherClear({ startDay: today + from, days }) : worldCallbacks.onSetWeather({ clear: true });
        if (range) return weatherCallbacks.onWeatherPaint({ startDay: today + from, days, kind, temp: temp ?? '', text });
        return worldCallbacks.onSetWeather({ kind, temp: temp ?? '', text, lock });
      }).catch(error => globalThis.toastr?.error?.(error.message, 'Закулисье'));
    },
    onSceneMode: mode => Promise.resolve(worldCallbacks.onSetClock({ mode }))
      .catch(error => globalThis.toastr?.error?.(error.message, 'Закулисье')),
    onTogglePresent: (id, present) => knowledgeCallbacks.onTogglePresent({ characterId: id, present })
      .catch(error => globalThis.toastr?.error?.(error.message, 'Закулисье')),
    onLeak: (action, payload) => knowledgeCallbacks[LEAK_ACTIONS[action]]?.(payload)
      .catch(error => globalThis.toastr?.error?.(error.message, 'Закулисье')),
    onReveal: (action, payload) => knowledgeCallbacks[action === 'confirm' ? 'onRevealConfirm' : 'onRevealDismiss'](payload)
      .catch(error => globalThis.toastr?.error?.(error.message, 'Закулисье')),
    onMediaOffer: (action, { id }) => {
      if (action === 'play') { try { mediaCallbacks.onMediaPlay({ id }); } catch (error) { globalThis.toastr?.error?.(error.message, 'Закулисье'); } } else { mediaDismissed.add(id); notify(); }
    },
    onQuestHint: (action, payload) => knowledgeCallbacks[action === 'confirm' ? 'onQuestHintConfirm' : 'onQuestHintDismiss'](payload)
      .catch(error => globalThis.toastr?.error?.(error.message, 'Закулисье')),
    onDeath: (action, payload) => knowledgeCallbacks[action === 'confirm' ? 'onDeathConfirm' : 'onDeathDismiss'](payload)
      .catch(error => globalThis.toastr?.error?.(error.message, 'Закулисье')),
    onSecretHint: (action, payload) => Promise.resolve()
      .then(() => (action === 'open' ? createSecretFlow({ messageIndex: payload.messageIndex, eventId: payload.eventId }) : forgetSecretHint(payload.messageIndex, payload.eventId).then(notify)))
      .catch(error => globalThis.toastr?.error?.(error.message, 'Закулисье')),
    onSlip: (action, payload) => {
      const handler = { swipe: 'onSlipSwipe', edit: 'onSlipEdit', accept: 'onSlipAccept', dismiss: 'onSlipDismiss', remind: 'onSlipRemind' }[action];
      Promise.resolve().then(() => worldCallbacks[handler]?.(payload))
        .then(() => { if (action === 'remind') globalThis.toastr?.info?.('Поправка уйдёт со следующим ответом', 'Закулисье'); })
        .catch(error => globalThis.toastr?.error?.(error.message, 'Закулисье'));
    },
    onOpenStudio: tab => openStudioTab(tab),
    onOpenPersonas: avatar => controller?.personaBridge?.personaWindow?.open?.(avatar),
    onSetupOff: () => setupCallbacks.onSetupOff({ off: true }).catch(error => globalThis.toastr?.error?.(error.message, 'Закулисье')),
    onCue: async cue => {
      try {
        if (!settings.enabled) throw new Error('Закулисье выключено.');
        await saveDirection(armCue(directionState(), { ...cue, id: uniqueId('cue') }, Object.keys(state.entities)));
        return true;
      } catch (error) {
        globalThis.toastr?.error?.(error.message, 'Закулисье');
        return false;
      }
    },
    onRemoveCue: cueId => saveDirection(removeCue(directionState(), cueId))
      .catch(error => globalThis.toastr?.error?.(error.message, 'Закулисье')),
    /**
     * The notes for the narrator: save one for good (shared by all chats), delete it, pin one to this chat, unpin it, send a saved one now.
     * A saved note may have a cooldown (every N replies): it cannot be sent again before that, and a pinned one goes by itself once per N replies.
     */
    onNotes: async ({ action, id = '', text = '', every = 0, wait = 0, scope = 'chat' }) => {
      try {
        if (!settings.enabled) throw new Error('Закулисье выключено.');
        const library = normalizeNoteLibrary(settings.narratorNotes);
        const saved = library.find(item => item.id === id);
        const count = replyCountOf(SillyTavern.getContext().chat);
        if (action === 'save') {
          settings.narratorNotes = saveNote(library, { text, every });
          context.saveSettingsDebounced();
          globalThis.toastr?.warning?.('Сохранено в «Мои указания». В этот чат оно пока НЕ отправлено: ▶ отправит один раз, 📌 закрепит.', 'Закулисье');
        } else if (action === 'save-pin') {
          settings.narratorNotes = saveNote(library, { text, every });
          context.saveSettingsDebounced();
          await saveDirection(pinNote(directionState(), { text, every }));
          globalThis.toastr?.success?.('Сохранено и закреплено: уйдёт со следующим ответом', 'Закулисье');
        } else if (action === 'delete') {
          settings.narratorNotes = removeNote(library, id);
          context.saveSettingsDebounced();
        } else if (action === 'pin') {
          settings.narratorNotes = saveNote(library, { text, every });
          context.saveSettingsDebounced();
          await saveDirection(pinNote(directionState(), { text, every }));
          globalThis.toastr?.success?.('Закреплено: уйдёт со следующим ответом', 'Закулисье');
        } else if (action === 'pin-saved') {
          if (!saved) throw new Error('Такого указания уже нет.');
          await saveDirection(pinNote(directionState(), { text: saved.text, every: saved.every }));
          globalThis.toastr?.success?.('Закреплено: уйдёт со следующим ответом', 'Закулисье');
        } else if (action === 'pin-all' || action === 'pin-all-saved') {
          // For ALL chats: kept in the settings; each chat counts its own cooldown.
          const source = action === 'pin-all' ? { text, every } : saved;
          if (!source) throw new Error('Такого указания уже нет.');
          if (action === 'pin-all') settings.narratorNotes = saveNote(library, { text, every });
          const pins = normalizeNoteLibrary(settings.narratorPins);
          if (pins.length >= 10 && !pins.some(pin => pin.text.toLocaleLowerCase('ru-RU') === String(source.text).trim().toLocaleLowerCase('ru-RU'))) throw new Error('Для всех чатов закреплено уже 10: открепите лишнее.');
          settings.narratorPins = saveNote(pins, { text: source.text, every: source.every });
          context.saveSettingsDebounced();
          globalThis.toastr?.success?.('Закреплено для всех чатов: уйдёт со следующим ответом', 'Закулисье');
        } else if (action === 'unpin-all') {
          settings.narratorPins = removeNote(normalizeNoteLibrary(settings.narratorPins), id);
          context.saveSettingsDebounced();
        } else if (action === 'unpin') {
          await saveDirection(unpinNote(directionState(), id));
        } else if (action === 'edit') {
          // The edited note is saved IN PLACE: the same id, so the cooldown and the pin stay. `scope`: where the note lives.
          if (scope === 'lib') settings.narratorNotes = editNote(library, id, { text, every });
          else if (scope === 'all') settings.narratorPins = editNote(normalizeNoteLibrary(settings.narratorPins), id, { text, every });
          else await saveDirection(editPin(directionState(), id, { text, every }));
          if (scope !== 'chat') context.saveSettingsDebounced();
          globalThis.toastr?.success?.(scope === 'lib' ? 'Указание поправлено' : 'Указание поправлено: уйдёт в таком виде со следующим ответом', 'Закулисье');
        } else if (action === 'send') {
          if (!saved) throw new Error('Такого указания уже нет.');
          const left = noteCooldownLeft(directionState(), saved.id, saved.every, count);
          if (left > 0) throw new Error(`Указание ещё остывает: подождите ${left} ${left === 1 ? 'ответ' : left < 5 ? 'ответа' : 'ответов'}.`);
          const armed = armCue(directionState(), { kind: 'note', text: saved.text, wait, id: uniqueId('cue') }, Object.keys(state.entities));
          await saveDirection(markNoteUsed(armed, saved.id, count));
          globalThis.toastr?.success?.('Уйдёт со следующим ответом', 'Закулисье');
        } else return false;
        refreshChatOverlay();
        return true;
      } catch (error) {
        globalThis.toastr?.error?.(error.message, 'Закулисье');
        return false;
      }
    },
    /** Planned events: { action: 'add', text, genre, amount, unit, within } or { action: 'remove', id }. */
    onPlan: async ({ action, id = '', text = '', genre = '', amount = 1, unit = 'day', within = false }) => {
      try {
        if (!settings.enabled) throw new Error('Закулисье выключено.');
        const direction = directionState();
        if (action === 'remove') await saveDirection(planEvent(direction, removePlan(direction.plans, id)));
        else if (action === 'add') {
          const count = Math.max(1, Math.min(99, Math.round(Number(amount)) || 1));
          const now = planClockNow();
          if (now == null) throw new Error('Не знаю, какой сейчас день истории: задайте его в «Время» (кнопка 🕑 слева).');
          if (unit === 'hour' && !/^\d{1,2}:\d{2}$/.test(String(state.world?.clock?.time ?? '').trim())) throw new Error('Для «часов» нужно время истории: поставьте его в «Время» (кнопка 🕑 слева).');
          const plans = makePlan(direction.plans, { text, genre, nowAbs: now, minutes: planSpanMinutes(unit, count), unit, amount: count, within: Boolean(within), id: uniqueId('plan') });
          await saveDirection(planEvent(direction, plans));
          globalThis.toastr?.success?.('Запланировано: сработает, когда время истории дойдёт', 'Закулисье');
        } else return false;
        refreshChatOverlay();
        return true;
      } catch (error) {
        globalThis.toastr?.error?.(error.message, 'Закулисье');
        return false;
      }
    },
    onKickNow: () => {
      if (isGenerationActive()) { globalThis.toastr?.info?.('Сейчас идёт генерация — пинок уйдёт со следующей.', 'Закулисье'); return; }
      // Exactly like the send button: her text goes too, an empty field means a reply without a post.
      const send = document.getElementById('send_but');
      if (send) send.click();
      else Promise.resolve(SillyTavern.getContext().generate?.('normal')).catch(error => globalThis.toastr?.error?.(error.message, 'Закулисье'));
    },
    onToggleOpen: open => {
      settings.director ??= {};
      settings.director.open = Boolean(open);
      context.saveSettingsDebounced();
      refreshChatOverlay();
    },
    onFavorite: (text, add) => {
      const current = normalizeFavorites(settings.directionFavorites);
      settings.directionFavorites = normalizeFavorites(add ? [text, ...current] : current.filter(item => item !== text));
      context.saveSettingsDebounced();
      if (add) globalThis.toastr?.success?.('Сохранено в избранные пинки', 'Закулисье');
      refreshChatOverlay();
    },
    describe: describeForDirector,
    eventIdeas: eventIdeasForDirector,
  });
  // The clothes' room of the drawer: two tabs of the rail (the persona's and the heroes'), the same wardrobe and wearing as the page «Мир → Гардероб».
  const stopWardrobeRooms = registerWardrobeRooms({
    panes: extraPanes,
    rerender: () => { try { extraPaneHooks.rerender?.(); } catch { /* the drawer is not drawn yet */ } },
    getState: () => state,
    wardrobe: () => wardrobeStore.get(),
    persona: () => {
      const id = state.ui?.personaId || '';
      return id && state.entities[id] ? { id, name: state.entities[id].name } : null;
    },
    heroes: () => {
      const personaId = state.ui?.personaId || '';
      const here = new Set(presentIds(state));
      return Object.values(state.entities)
        .filter(entity => entity.id !== personaId && !isDead(state, entity.id))
        .map(entity => ({ id: entity.id, name: entity.name, here: here.has(entity.id) }))
        .sort((left, right) => Number(right.here) - Number(left.here) || left.name.localeCompare(right.name, 'ru'));
    },
    // «Шкаф» in the drawer opens the big wardrobe window on this character's closet.
    openCloset: entityId => {
      try {
        wardrobeFocus.closets = true;
        wardrobeFocus.cardId = cardOfEntity().get(entityId) ?? '';
        openStudioTab('wardrobe');
      } catch (error) { console.error('[Kulisy] The closet window did not open.', error); }
    },
    // The closet of the card the person has: the wardrobe pieces chosen there, and the pieces of the outfits chosen there.
    closetOf: id => {
      const library = locationLibrary.get();
      const cardId = cardOfEntity().get(id);
      const card = cardId ? (library.characters ?? []).find(item => item.id === cardId) : null;
      const lookIds = card?.closet?.lookIds ?? [];
      const looks = wardrobeStore.get().looks.filter(look => lookIds.includes(look.id));
      return { hasCard: Boolean(card), cardIds: [...new Set([...(card?.closet?.cardIds ?? []), ...looks.flatMap(look => look.cardIds)])], lookIds };
    },
    wear: payload => wardrobeCallbacks.onWear(payload),
    takeOff: payload => wardrobeCallbacks.onTakeOff(payload),
    notify: (text, isError = false) => (isError ? globalThis.toastr?.error?.(text, 'Закулисье') : globalThis.toastr?.success?.(text, 'Закулисье')),
  });
  // Several changes follow one reply (the analysis, the chronicle, the redraw of the messages): the strip is built once for the burst.
  let overlayTimer = 0;
  refreshChatOverlay = () => {
    if (overlayTimer) return;
    overlayTimer = setTimeout(() => {
      overlayTimer = 0;
      try { chatOverlay.render(overlayView()); } catch (error) { console.error('[Kulisy] Chat overlay redraw failed.', error); }
    }, 60);
  };
  for (const type of [events.CHARACTER_MESSAGE_RENDERED, events.MORE_MESSAGES_LOADED, events.CHAT_CHANGED, events.MESSAGE_SWIPED, events.MESSAGE_UPDATED, events.MESSAGE_DELETED]) {
    // After ST has drawn the messages: the notes attach to their blocks.
    if (type) listen(type, () => setTimeout(refreshChatOverlay, 0));
  }
  for (const type of [events.CHARACTER_MESSAGE_RENDERED, events.MORE_MESSAGES_LOADED, events.CHAT_CHANGED]) {
    if (type) listen(type, () => messageButtons.refresh());
  }

  mountShell();
  // One button per window of the top bar; pressing the open one closes it, another one switches the window.
  // Several windows at once (settings.studioMulti): docked panels, the first on the right, the second on the left; a third replaces the older one.
  const panels = [];
  const makePanel = slot => {
    const panel = createRelationshipStudio({
      store, callbacks, open: false, directionPresets, side: slot === 0 ? 'right' : 'left', dockShare: 2,
      layout: { mode: 'dock', tab: studio.scopeId() === 'scene' ? 'scene' : 'overview', width: 520 },
      onLayoutChange() {},
      onOpenPersonas: avatar => controller?.personaBridge?.personaWindow?.open?.(avatar),
    });
    for (const type of ['open', 'close', 'scope']) panel.element.addEventListener(`kulisy-studio:${type}`, () => syncTopBar());
    return { studio: panel, openedAt: 0 };
  };
  let openCounter = 0;
  const openPanels = () => panels.filter(item => item.studio.isOpen());
  function closePanels() { for (const item of panels) item.studio.close(); syncTopBar(); }
  /** A press on a button of the top bar. One window at a time, or (studioMulti) a panel beside the chat. */
  function pressWindowButton(windowId, tabId = '', { toggle = true } = {}) {
    const phone = typeof window.matchMedia === 'function' && window.matchMedia('(max-width: 760px)').matches;
    if (settings.studioMulti !== true || phone) {
      closePanels();
      if (toggle && studio.isOpen() && studio.scopeId() === windowId) studio.close(); else studio.showWindow(windowId, tabId);
      return;
    }
    if (studio.isOpen()) studio.close();
    const showing = openPanels().find(item => item.studio.scopeId() === windowId);
    if (showing) { if (toggle) showing.studio.close(); else showing.studio.showWindow(windowId, tabId); return; }
    while (panels.length < 2) panels.push(makePanel(panels.length));
    // A free slot first (right, then left); both busy: the one that was opened earlier gives way.
    const target = panels.find(item => !item.studio.isOpen()) ?? [...panels].sort((a, b) => a.openedAt - b.openedAt)[0];
    target.openedAt = ++openCounter;
    target.studio.setPlace({ share: 2 });
    target.studio.showWindow(windowId, tabId);
  }
  const topBar = mountWindowButtons(WINDOWS, { onOpen: windowId => pressWindowButton(windowId) });
  // The Studio can also open from the widget or the extensions menu: keep the icons in step.
  const syncTopBar = () => topBar.setOpen([...(studio.isOpen() ? [studio.scopeId()] : []), ...openPanels().map(item => item.studio.scopeId())]);
  studio.element.addEventListener('kulisy-studio:scope', syncTopBar);
  studio.element.addEventListener('kulisy-studio:open', syncTopBar);
  studio.element.addEventListener('kulisy-studio:close', syncTopBar);
  movePersonaCardsToLibrary();
  movePersonaPrivateToCards();
  tidyAliasesOnce();
  refreshPrompt();
  notify();
  // The docked panel was open before the reload (F5 / Ctrl+F5): open it again.
  try {
    const phone = typeof window.matchMedia === 'function' && window.matchMedia('(max-width: 760px)').matches;
    if (reopenOnLoad(settings.studio, phone)) studio.open();
  } catch (error) { console.error('[Kulisy] Could not reopen the docked panel.', error); }

  controller = {
    open: () => studio.open(),
    analyzeCurrent: () => runManualCheck(lastBotMessageIndex()),
    getState: () => structuredClone(state),
    destroy() {
      listeners.splice(0).forEach(remove => remove());
      stopConsoleWatch();
      messageButtons.unmount();
      selectionChip.unmount();
      clearTimeout(overlayTimer);
      stopWardrobeRooms();
      chatOverlay.unmount();
      unmountShell();
      topBar.unmount();
      for (const item of panels) item.studio.destroy();
      studio.destroy();
      mediaDock.destroy();
      mediaSection.render = null;
      mediaSection.suggest = null;
      widget.destroy();
      clearRelationshipPrompt(SillyTavern.getContext());
      delete globalThis.kulisyInterceptor;
      delete globalThis.Kulisy;
      controller = null;
    },
  };
  globalThis.Kulisy = controller;
  // What the persona window (the former Pudrenitsa) needs from Kulisy: the card of a persona, made on demand, and its editor to embed.
  controller.personaBridge = {
    // страницы шторки от Закулисья («Повторы», «Нити», «Эмоции», «График»)
    panes: extraPanes,
    paneHooks: extraPaneHooks,
    /** The books the Kulisy itself reads (analysis, secrets, heroes): the window «Лорбуки чата» of the paw switches them next to the tavern's ones. */
    lore: {
      linked: () => [...(state.ui?.linkedLorebooks ?? [])],
      link: name => callbacks.onLinkLorebook({ name }),
      unlink: name => callbacks.onUnlinkLorebook({ name }),
    },
    cardIdFor: avatar => (locationLibrary.get().characters ?? []).find(card => card.persona && card.avatar === avatar)?.id ?? '',
    /** The persona window asks to be told when the library changes. Returns the way to stop. */
    subscribe(listener) { libraryListeners.add(listener); return () => libraryListeners.delete(listener); },
    /** The address of the picture of the persona's card (its own portrait), or '' when the card has none. */
    cardImageFor: avatar => { const image = (locationLibrary.get().characters ?? []).find(card => card.persona && card.avatar === avatar)?.image; return image ? imageUrl(image) : ''; },
    /** The card's picture becomes the persona's avatar in SillyTavern (for a card whose picture was set before they were tied together). */
    async pushCardImage(avatar) {
      const image = (locationLibrary.get().characters ?? []).find(card => card.persona && card.avatar === avatar)?.image;
      if (!image) throw new Error('У карточки персоны нет своей картинки.');
      const response = await fetch(imageUrl(image));
      if (!response.ok) throw new Error('Картинка карточки не читается.');
      const blob = await response.blob();
      await personaApi.setImage(avatar, await fileToDataUrl(new File([blob], 'persona', { type: blob.type || 'image/png' })));
      notify();
    },
    ensureCard({ avatar, name }) {
      const have = (locationLibrary.get().characters ?? []).find(card => card.persona && card.avatar === avatar);
      if (have) return have.id;
      const added = addLibraryCharacter(locationLibrary.get(), { name: String(name || 'Персона'), persona: true, avatar });
      locationLibrary.set(added.library);
      notify();
      return added.character.id;
    },
    /** The persona window puts its opener here (src/pud/ui/personas.js). */
    personaWindow: { open: null },
    /** The assistant: the messenger and its settings (src/pud/ui/messenger.js, assistants.js) talk to Kulisy only through this. */
    assistant: {
      view: () => assistantView(),
      subscribe(listener) { assistantListeners.add(listener); return () => assistantListeners.delete(listener); },
      send: text => callbacks.onGmSend({ text }),
      retry: () => callbacks.onGmRetry(),
      answer: answer => callbacks.onGmProposal({ answer }),
      conclusion: payload => callbacks.onGmConclusion(payload),
      clear: () => callbacks.onGmClear(),
      saveSettings: patch => callbacks.onGmSettings(patch),
    },
    /** What the mood, sound and graph modules read (src/pud/ui/mood.js, weather-sound.js, relgraph.js): the scene as plain numbers and names. */
    scene: {
      read() {
        const weather = currentWeather();
        return {
          heat: state.world?.heat?.value ?? 0,
          mode: state.world?.clock?.mode ?? 'calm',
          time: state.world?.clock?.time ?? '',
          location: state.knowledge?.scene?.location ?? '',
          weather: weather ? { kind: weather.kind, temp: weather.temp } : null,
          cast: presentIds(state).filter(id => id !== state.ui?.personaId).map(id => state.entities?.[id]?.name).filter(Boolean),
        };
      },
      subscribe(listener) { sceneListeners.add(listener); return () => sceneListeners.delete(listener); },
      lines: () => relationLines(state),
      scales: () => scaleList(state).map(item => ({ ...item, icon: studioIcon(STUDIO_ICON_NAMES.includes(`m-${item.id}`) ? `m-${item.id}` : 'letter').outerHTML })),
      series: (lineId, scaleId) => scaleSeries(state, lineId, scaleId),
      overview: (scaleIds, window) => relationOverview(state, scaleIds, window),
      shifts: limit => recentShifts(state, limit),
    },
    createEditor: (container, { onGear } = {}) => createRelationshipStudio({ store, callbacks, open: false, container, embedCard: true, onGear, directionPresets, layout: settings.studio }),
  };
  // manifest.json → generate_interceptor: runs before SillyTavern assembles the prompt,
  // so headcanons are picked for the scene that is about to be written.
  globalThis.kulisyInterceptor = async (chat, contextSize, abort, type) => {
    if (type === 'quiet' || !controller) return;
    // Stage cues: a new turn burns the last one's and puts the armed ones in force.
    try {
      const started = startGeneration(directionState(), type, { replyCount: replyCountOf(SillyTavern.getContext().chat), globalPins: normalizeNoteLibrary(settings.narratorPins), nowAbs: planClockNow() });
      if (started.changed) await saveDirection(started.direction);
      if (started.firedPlans?.length) globalThis.toastr?.info?.(`🗓 Пришло время запланированного: ${started.firedPlans.map(plan => plan.text || 'событие на выбор рассказчика').join('; ').slice(0, 160)}`, 'Закулисье');
    } catch (error) { console.error('[Kulisy] Stage cues were not updated.', error); }
    await prepareHeadcanons(chat);
    refreshPrompt();
    recordSent(type);
    // Summarized messages leave SillyTavern's prompt copy; the chronicle block stands in for them.
    const chronicleSettings = chronicleConfig(settings.chronicle);
    if (settings.enabled && chronicleSettings.enabled && chronicleSettings.hideSummarized) {
      try { hideSummarized(chat, normalizeChronicle(state.ui?.chronicle)); }
      catch (error) { console.error('[Kulisy] Hiding summarized messages failed.', error); }
    }
  };
  return controller;
}

/** Одно расширение: сначала Кулисы, потом модули бывшей Пудреницы (src/pud). Ошибка одной части не роняет другую. */
export async function init() {
  const kulisy = await initKulisy();
  try { await initPudrenitsa({ bridge: kulisy?.personaBridge ?? null }); } catch (error) { console.error('[Закулисье] Модули бывшей Пудреницы не запустились.', error); }
  return kulisy;
}

export function getController() {
  return controller;
}
