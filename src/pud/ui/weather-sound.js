/**
 * «Звуки погоды»: тихий фон под текущую погоду сюжета. Файлы приносит сама Аня (они лежат в браузере, в IndexedDB,
 * и никуда не уходят), расширение только проигрывает. Петля сделана внахлёст, со случайным стартом и медленным
 * «дыханием» громкости, чтобы повтор не бросался в глаза. Звук можно выключить в настройках и поставить на паузу в шторке.
 */
import { report } from '../core/guard.js';
import {
  SOUND_KINDS, normalizeWeatherSound, gainFor, seamlessLoop, soundKindFor,
} from '../core/weather-sound.js';
import { watchRail, sidebarOf } from './rail-extras.js';

export const SOUND_BUTTON_CLASS = 'pud-sound-btn';
const DB_NAME = 'pud-weather-sounds';
const STORE = 'files';
const MAX_BYTES = 40 * 1024 * 1024;
const FADE_SEC = 3;
const escapeHtml = text => String(text ?? '').replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[ch]);

/** Хранилище файлов в IndexedDB: вид погоды → { name, blob }. Без IndexedDB (старый браузер) всё молча пусто. */
export function createIdbStore(view) {
  let dbPromise = null;
  const open = () => {
    if (!view.indexedDB) return Promise.resolve(null);
    dbPromise ??= new Promise(resolve => {
      const request = view.indexedDB.open(DB_NAME, 1);
      request.onupgradeneeded = () => request.result.createObjectStore(STORE);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => resolve(null);
    });
    return dbPromise;
  };
  const run = async (mode, make) => {
    const db = await open();
    if (!db) return null;
    return new Promise(resolve => {
      try {
        const request = make(db.transaction(STORE, mode).objectStore(STORE));
        request.onsuccess = () => resolve(request.result ?? null);
        request.onerror = () => resolve(null);
      } catch { resolve(null); }
    });
  };
  return {
    get: kind => run('readonly', store => store.get(kind)),
    put: (kind, value) => run('readwrite', store => store.put(value, kind)),
    remove: kind => run('readwrite', store => store.delete(kind)),
    async names() {
      const out = {};
      for (const kind of Object.keys(SOUND_KINDS)) {
        const found = await run('readonly', store => store.get(kind));
        if (found?.name) out[kind] = found.name;
      }
      return out;
    },
  };
}

/**
 * Проигрыватель петель на Web Audio. play(kind, buffer) плавно сменяет прежний звук новым, stop() затихает.
 * Запись предварительно превращается в бесшовную петлю (seamlessLoop) и крутится штатным loop=true: пока играет звук,
 * ничего не может «кончиться», таймеры не нужны и фоновая вкладка не мешает. Старт со случайного места, плюс
 * медленное «дыхание» громкости, чтобы повтор не угадывался.
 */
export function createAudioEngine(view) {
  const AudioContextClass = view.AudioContext ?? view.webkitAudioContext;
  let ctx = null;
  let master = null;
  let volume = 0.35;
  let layer = null;
  const loops = new WeakMap();
  const ensure = () => {
    if (!AudioContextClass) return null;
    if (!ctx) {
      ctx = new AudioContextClass();
      master = ctx.createGain();
      master.gain.value = volume;
      master.connect(ctx.destination);
    }
    return ctx;
  };
  /** Бесшовная петля из декодированной записи (кэш на запись). */
  const loopBuffer = buffer => {
    if (loops.has(buffer)) return loops.get(buffer);
    const channels = Array.from({ length: buffer.numberOfChannels }, (_, i) => buffer.getChannelData(i));
    const made = seamlessLoop(channels, buffer.sampleRate, 4);
    const out = ctx.createBuffer(made.length, made[0].length, buffer.sampleRate);
    made.forEach((data, i) => out.copyToChannel(data, i));
    loops.set(buffer, out);
    return out;
  };

  const fadeOut = (old, seconds) => {
    if (!old || !ctx) return;
    const now = ctx.currentTime;
    old.gain.gain.cancelScheduledValues(now);
    old.gain.gain.setValueAtTime(old.gain.gain.value, now);
    old.gain.gain.linearRampToValueAtTime(0, now + seconds);
    setTimeout(() => { try { old.nodes.forEach(node => { node.stop?.(); node.disconnect?.(); }); } catch { /* уже остановлен */ } }, (seconds + 0.3) * 1000);
  };

  return {
    available: () => Boolean(AudioContextClass),
    setVolume(percent) { volume = gainFor(percent); if (master) master.gain.value = volume; },
    resume() { return ensure()?.resume?.(); },
    suspend() { return ctx?.suspend?.(); },
    current: () => layer?.kind ?? null,
    play(kind, buffer) {
      const c = ensure();
      if (!c || !buffer) return;
      if (layer?.kind === kind) return;
      fadeOut(layer, FADE_SEC);
      const looped = loopBuffer(buffer);
      const gain = c.createGain();
      gain.gain.value = 0;
      gain.gain.linearRampToValueAtTime(1, c.currentTime + FADE_SEC);
      const breath = c.createGain();
      breath.gain.value = 1;
      // медленное «дыхание» громкости на 8%: ухо привыкает и не ловит повтор
      const lfo = c.createOscillator();
      const lfoDepth = c.createGain();
      lfo.frequency.value = 0.05 + Math.random() * 0.04;
      lfoDepth.gain.value = 0.08;
      lfo.connect(lfoDepth);
      lfoDepth.connect(breath.gain);
      lfo.start();
      const source = c.createBufferSource();
      source.buffer = looped;
      source.loop = true;
      source.connect(gain);
      gain.connect(breath);
      breath.connect(master);
      // любой старт внутри бесшовной петли годится: каждый раз начинаем с другого места
      source.start(0, Math.random() * looped.duration);
      layer = { kind, gain, nodes: [source, lfo, lfoDepth, breath, gain] };
    },
    stop() {
      if (!ctx || !layer) return;
      fadeOut(layer, FADE_SEC);
      layer = null;
    },
    destroy() {
      if (layer) layer.nodes.forEach(node => { try { node.stop?.(); node.disconnect?.(); } catch { /* уже остановлен */ } });
      layer = null;
      try { ctx?.close?.(); } catch { /* закрыт */ }
      ctx = null;
    },
  };
}

/**
 * @param {Document} doc
 * @param {{ context: any, settings: any, save: () => void, shared?: any, bridge?: any, storage?: any, createEngine?: Function }} deps
 */
export function startWeatherSound(doc, { context, settings, save, shared = {}, bridge = null, storage = null, createEngine = createAudioEngine }) {
  const tab = shared.hub?.addTab?.('sounds', 'Звуки погоды', 'moon');
  const view = doc.defaultView;
  const pane = tab?.pane;
  const store = storage ?? createIdbStore(view);
  const engine = createEngine(view);
  settings.weatherSound = normalizeWeatherSound(settings.weatherSound);
  const cfg = () => settings.weatherSound;
  const persist = () => { try { save(); } catch (error) { report('звуки погоды: сохранение', error); } };
  const buffers = new Map();
  let names = {};
  let paused = false;
  let override = null;
  let status = '';
  let syncing = 0;

  const sceneKind = () => { try { return soundKindFor(bridge?.scene?.read?.()?.weather?.kind); } catch { return null; } };

  async function bufferFor(kind) {
    if (buffers.has(kind)) return buffers.get(kind);
    const found = await store.get(kind);
    if (!found?.blob) return null;
    const decoded = await decode(found.blob);
    if (decoded) buffers.set(kind, decoded);
    return decoded;
  }
  async function decode(blob) {
    const AudioContextClass = view.AudioContext ?? view.webkitAudioContext;
    if (!AudioContextClass || !blob?.arrayBuffer) return null;
    const temp = new AudioContextClass();
    try { return await temp.decodeAudioData(await blob.arrayBuffer()); }
    catch (error) { report('звуки погоды: файл не читается', error); status = 'Файл не удалось прочитать как звук.'; return null; }
    finally { try { temp.close?.(); } catch { /* закрыт */ } }
  }

  /** Привести звук в соответствие с погодой (и настройками, паузой, пробой). */
  async function sync() {
    const ticket = ++syncing;
    try {
      const c = cfg();
      const kind = override ?? sceneKind();
      if (!c.enabled || paused || !kind || !engine.available()) { engine.stop(); paintRail(); return; }
      engine.setVolume(c.volume);
      const buffer = await bufferFor(kind);
      if (ticket !== syncing) return;
      if (!buffer) { engine.stop(); paintRail(); return; }
      await engine.resume();
      engine.play(kind, buffer);
      paintRail();
    } catch (error) {
      report('звуки погоды', error);
    }
  }

  // ───────── кнопка в шторке
  function paintRail(rail = doc.getElementById('ku-scene-chips')) {
    if (!rail) return;
    const has = Object.keys(names).length > 0;
    let button = rail.querySelector(`.${SOUND_BUTTON_CLASS}`);
    if (!cfg().enabled || !has) { button?.remove(); return; }
    if (!button) {
      button = doc.createElement('button');
      button.type = 'button';
      button.className = SOUND_BUTTON_CLASS;
      sidebarOf(rail).append(button);
    }
    const kind = engine.current();
    const text = paused ? '🔇' : '🔊';
    if (button.textContent !== text) button.textContent = text;
    button.title = paused ? 'Звук погоды на паузе. Нажмите, чтобы включить' : (kind ? `Звук погоды: ${SOUND_KINDS[kind]?.label ?? kind}. Нажмите, чтобы остановить` : 'Звук погоды: сейчас тишина');
  }
  const stopRail = watchRail(doc, paintRail, bridge?.scene);
  const onRailClick = event => {
    const button = event.target.closest?.(`.${SOUND_BUTTON_CLASS}`);
    if (!button) return;
    event.preventDefault();
    event.stopPropagation();
    paused = !paused;
    override = null;
    sync();
  };
  doc.addEventListener('click', onRailClick, true);
  // браузеры не дают звучать до первого действия на странице
  const onFirstGesture = () => { engine.resume(); sync(); };
  doc.addEventListener('pointerdown', onFirstGesture, { once: true, capture: true });

  // ───────── вкладка
  async function refreshNames() { names = await store.names(); }
  function render() {
    if (!pane) return;
    const c = cfg();
    pane.innerHTML = `
      <h3>Звуки погоды</h3>
      <p class="pud-hint">Тихий фон под погоду сюжета: дождь, ветер, гроза. Файлы вы выбираете сами (звук с вашего компьютера, любой формат, который читает браузер: mp3, ogg, wav). Они остаются в браузере и никуда не отправляются; Слива их только проигрывает. Для спокойной петли берите записи подлиннее (от минуты): стык скрывается плавным наложением и «дыханием» громкости. Бесплатные звуки без авторских прав ищите на Freesound с лицензией CC0 и на Pixabay (раздел Sound Effects).</p>
      <div class="pud-card pud-card-col">
        <label class="pud-opt"><span><b>Звуки погоды включены</b></span><input type="checkbox" data-field="enabled"${c.enabled ? ' checked' : ''}></label>
        <label class="pud-peek-fields"><span>Громкость, %</span><input type="range" data-field="volume" min="0" max="100" step="5" value="${c.volume}"></label>
        <div class="pud-hint">В шторке сцены появится кнопка 🔊: она ставит звук на паузу и снимает с паузы.${engine.available() ? '' : ' В этом браузере звук недоступен.'}</div>
        <div class="pud-hint" data-status>${escapeHtml(status)}</div>
      </div>
      <div class="pud-card pud-card-col">
        <b>Файлы по видам погоды</b>
        <ul class="pud-thread-list">${Object.entries(SOUND_KINDS).map(([kind, item]) => `
          <li class="pud-thread"><span class="pud-thread-text">${item.icon} <b>${escapeHtml(item.label)}</b>${names[kind] ? ` — ${escapeHtml(names[kind])}` : ' — нет файла: будет тишина'}</span>
          <span class="pud-thread-acts">
            <label class="menu_button pud-sound-pick">Выбрать файл<input type="file" accept="audio/*" data-kind="${kind}" hidden></label>
            ${names[kind] ? `<button type="button" class="menu_button" data-act="test" data-kind="${kind}">Проверить</button><button type="button" class="menu_button" data-act="remove" data-kind="${kind}">Убрать</button>` : ''}
          </span></li>`).join('')}</ul>
        ${override ? '<div class="pud-peek-city"><button type="button" class="menu_button" data-act="endtest">Закончить проверку</button></div>' : ''}
      </div>`;
  }
  const onChange = async event => {
    const target = event.target;
    if (target.dataset?.field === 'enabled') { cfg().enabled = target.checked; persist(); render(); sync(); return; }
    if (target.dataset?.field === 'volume') { cfg().volume = Math.min(100, Math.max(0, Number(target.value) || 0)); persist(); engine.setVolume(cfg().volume); return; }
    const kind = target.dataset?.kind;
    const file = target.files?.[0];
    if (!kind || !file) return;
    if (file.size > MAX_BYTES) { status = 'Файл слишком большой (больше 40 МБ). Возьмите покороче.'; render(); return; }
    await store.put(kind, { name: file.name, blob: file });
    buffers.delete(kind);
    status = '';
    await refreshNames();
    render();
    sync();
  };
  const onClick = async event => {
    const target = event.target.closest?.('[data-act]');
    if (!target) return;
    const kind = target.dataset.kind;
    if (target.dataset.act === 'remove') { await store.remove(kind); buffers.delete(kind); await refreshNames(); render(); sync(); }
    else if (target.dataset.act === 'test') {
      override = kind;
      paused = false;
      status = cfg().enabled ? '' : 'Звуки выключены: включите галочку наверху.';
      if (cfg().enabled) await sync();
      render();
    }
    else if (target.dataset.act === 'endtest') { override = null; render(); sync(); }
  };
  pane?.addEventListener('change', onChange);
  pane?.addEventListener('click', onClick);
  const paneObserver = pane ? new view.MutationObserver(() => { if (!pane.hidden) { refreshNames().then(render); } }) : null;
  paneObserver?.observe(pane, { attributes: true, attributeFilter: ['hidden'] });

  const types = context.eventTypes ?? {};
  const events = context.eventSource;
  const onChat = () => { override = null; sync(); };
  if (types.CHAT_CHANGED && events?.on) events.on(types.CHAT_CHANGED, onChat);
  const unsubscribeScene = bridge?.scene?.subscribe?.(() => { override = null; sync(); }) ?? (() => {});
  refreshNames().then(() => { render(); sync(); });
  render();

  shared.weatherSound = { sync, engine };

  return () => {
    syncing += 1;
    stopRail();
    unsubscribeScene();
    paneObserver?.disconnect();
    pane?.removeEventListener('change', onChange);
    pane?.removeEventListener('click', onClick);
    doc.removeEventListener('click', onRailClick, true);
    doc.removeEventListener('pointerdown', onFirstGesture, { capture: true });
    if (types.CHAT_CHANGED) events?.removeListener?.(types.CHAT_CHANGED, onChat);
    engine.destroy();
    for (const button of doc.querySelectorAll(`.${SOUND_BUTTON_CLASS}`)) button.remove();
    delete shared.weatherSound;
    tab?.remove?.();
  };
}
