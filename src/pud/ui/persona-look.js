/**
 * Окно «Внешность по картинке» (кнопка в левой части окна персон).
 * Картинка персоны + пожелания → модель пишет постоянную внешность (и голос по желанию) по-русски →
 * ты правишь → «Одобрить и перевести» даёт английский текст (токенов меньше) → «В описание» кладёт его в свой блок
 * описания персоны, повторное описание заменяет только этот блок.
 */
import { report } from '../core/guard.js';
import { cleanModelText, describePrompt, lookMemory, lookSettings, putLookBlock, readLookBlock, removeLookBlock, translatePrompt } from '../core/persona-look.js';
import { personaApi } from '../integration/personas-api.js';
import * as lookApi from '../integration/persona-look-api.js';
import { createWindow } from './window.js';

const escapeHtml = text => String(text ?? '').replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[ch]);

/**
 * @param {Document} doc
 * @param {{ context: any, settings: any, save: () => void, api?: typeof personaApi, look?: typeof lookApi }} deps
 * @returns {{ open(avatar: string): void, close(): void, destroy(): void, win: any }}
 */
export function startPersonaLook(doc, { context, settings, save, api = personaApi, look = lookApi }) {
  const view = doc.defaultView;
  const live = () => globalThis.SillyTavern?.getContext?.() ?? context;
  settings.personaLooks ??= {};
  settings.personaLook ??= {};

  const win = createWindow(doc, { id: 'persona-look', title: 'Внешность по картинке', icon: 'image', width: 700, height: 760, store: settings.windows, save });
  win.element.classList.add('pud-plook');
  win.body.innerHTML = `
    <div class="pud-look">
      <div class="pud-look-who"></div>
      <div class="pud-look-pic">
        <img alt="">
        <div class="pud-look-picinfo">
          <b>Картинка</b>
          <small class="pud-tech" data-pic-note></small>
          <div class="pud-look-row">
            <button type="button" class="menu_button" data-act="pick">Другая картинка…</button>
            <button type="button" class="menu_button" data-act="reset" hidden>Вернуть аватар</button>
          </div>
          <input type="file" accept="image/*" hidden>
        </div>
      </div>
      <label class="pud-field"><span>Чем описывать</span><select class="text_pole" data-field="model" aria-label="Модель для описания"></select><small class="pud-tech" data-model-note></small></label>
      <label class="pud-field"><span>Пожелания к внешности</span><textarea class="text_pole" data-field="wishes" rows="3" placeholder="рост 156, веснушки, клыки; про одежду не писать; подчеркни глаза"></textarea></label>
      <label class="pud-opt"><span>Добавить голос<small>как он звучит в разные моменты, без фирменных словечек и примеров реплик</small></span><input type="checkbox" data-field="voice"></label>
      <label class="pud-field" data-voice-wishes hidden><span>Пожелания к голосу</span><textarea class="text_pole" data-field="voiceWishes" rows="2" placeholder="низкий, с хрипотцой; когда злится, становится тише"></textarea></label>
      <div class="pud-look-row"><button type="button" class="pud-padd" data-act="describe">Описать</button><span class="pud-tech" data-status></span></div>
      <section class="pud-look-part">
        <h4>По-русски <small class="pud-tech">можно править</small></h4>
        <textarea class="text_pole pud-look-text" data-text="ru" rows="7" placeholder="Здесь появится описание"></textarea>
        <div class="pud-look-row"><span class="pud-tech" data-count="ru"></span><span class="pud-grow"></span><button type="button" class="menu_button" data-act="translate">Одобрить и перевести на английский</button></div>
      </section>
      <section class="pud-look-part">
        <h4>По-английски <small class="pud-tech">короче, экономит токены; тоже можно править</small></h4>
        <textarea class="text_pole pud-look-text" data-text="en" rows="6" placeholder="Появится после перевода"></textarea>
        <div class="pud-look-row"><span class="pud-tech" data-count="en"></span></div>
      </section>
      <div class="pud-look-foot">
        <span class="pud-tech" data-block-note></span>
        <div class="pud-look-row">
          <button type="button" class="pud-padd" data-act="put-en">В описание: английский</button>
          <button type="button" class="menu_button" data-act="put-ru">В описание: русский</button>
          <button type="button" class="menu_button" data-act="copy">Копировать</button>
          <button type="button" class="menu_button" data-act="remove">Убрать блок из описания</button>
        </div>
      </div>
    </div>`;
  const q = selector => win.body.querySelector(selector);
  const fields = { wishes: q('[data-field="wishes"]'), voice: q('[data-field="voice"]'), voiceWishes: q('[data-field="voiceWishes"]'), model: q('[data-field="model"]') };
  const texts = { ru: q('[data-text="ru"]'), en: q('[data-text="en"]') };
  const picture = q('.pud-look-pic img');
  const fileInput = q('input[type="file"]');
  const status = q('[data-status]');
  let avatar = '';
  let custom = null; // своя картинка на этот раз (data: URL)
  let busy = false;

  const power = () => api.power?.() ?? {};
  const nameOf = () => power().personas?.[avatar] ?? '';
  const descriptionOf = () => power().persona_descriptions?.[avatar]?.description ?? '';
  const memory = () => (settings.personaLooks[avatar] = lookMemory(settings.personaLooks[avatar]));
  const remember = () => {
    const kept = memory();
    Object.assign(kept, { wishes: fields.wishes.value, voice: fields.voice.checked, voiceWishes: fields.voiceWishes.value, ru: texts.ru.value, en: texts.en.value });
    save();
  };
  const say = (text, danger = false) => { status.textContent = text; status.classList.toggle('pud-danger', danger); };

  const count = text => {
    const chars = String(text ?? '').length;
    if (!chars) return '';
    let tokens = 0;
    try { tokens = Number(live().getTokenCount?.(text)) || 0; } catch { tokens = 0; }
    return `${chars} знаков · ≈ ${tokens || Math.ceil(chars / 3.5)} токенов`;
  };
  const showCounts = () => {
    q('[data-count="ru"]').textContent = count(texts.ru.value);
    q('[data-count="en"]').textContent = count(texts.en.value);
    const block = readLookBlock(descriptionOf());
    q('[data-block-note]').textContent = block ? 'В описании персоны уже есть блок внешности: вставка заменит его.' : 'В описании персоны блока внешности ещё нет: вставка добавит его в конец.';
    q('[data-act="remove"]').disabled = !block;
    q('[data-act="put-en"]').disabled = !texts.en.value.trim();
    q('[data-act="put-ru"]').disabled = !texts.ru.value.trim();
    q('[data-act="translate"]').disabled = !texts.ru.value.trim();
  };

  const fillModels = () => {
    const chosen = lookSettings(settings.personaLook);
    const profiles = look.listProfiles(live());
    const options = [
      ...profiles.map(profile => ({ value: `profile:${profile.id}`, text: `Профиль: ${profile.name}`, on: chosen.mode === 'profile' && chosen.profileId === profile.id })),
      { value: 'main', text: 'Как у таверны (модель текущего чата)', on: chosen.mode === 'main' },
    ];
    if (!options.some(option => option.on)) options[0].on = true;
    fields.model.innerHTML = options.map(option => `<option value="${escapeHtml(option.value)}"${option.on ? ' selected' : ''}>${escapeHtml(option.text)}</option>`).join('');
    q('[data-model-note]').textContent = profiles.length ? 'Нужна модель, которая видит картинки. Профили берутся из «Connection Manager» таверны.' : 'Профилей подключения нет: будет использована модель текущего чата (нужен Chat Completion и модель с картинками).';
    syncModel();
  };
  const syncModel = () => {
    const value = fields.model.value;
    if (value === 'main') Object.assign(settings.personaLook, { mode: 'main' });
    else if (value.startsWith('profile:')) Object.assign(settings.personaLook, { mode: 'profile', profileId: value.slice('profile:'.length) });
  };

  const renderPicture = () => {
    picture.src = custom ?? api.imageUrl(avatar);
    q('[data-pic-note]').textContent = custom ? 'выбрана другая картинка, только для этого описания' : 'по умолчанию аватар персоны';
    q('[data-act="reset"]').hidden = !custom;
  };

  const fill = () => {
    const kept = memory();
    fields.wishes.value = kept.wishes;
    fields.voice.checked = kept.voice;
    fields.voiceWishes.value = kept.voiceWishes;
    q('[data-voice-wishes]').hidden = !kept.voice;
    texts.ru.value = kept.ru;
    texts.en.value = kept.en;
    q('.pud-look-who').innerHTML = `<b>${escapeHtml(nameOf())}</b>`;
    renderPicture();
    fillModels();
    showCounts();
    say('');
  };

  const run = async (what, task) => {
    if (busy) return;
    busy = true;
    win.element.classList.add('pud-busy');
    for (const button of win.body.querySelectorAll('button')) button.disabled = true;
    try { await api.ready?.(); await task(); } catch (error) {
      report(what, error);
      say(`${what}: ${error?.message ?? error}`, true);
      globalThis.toastr?.error?.(`${what}: не получилось. ${error?.message ?? ''}`.trim(), 'Пудреница');
    } finally {
      busy = false;
      win.element.classList.remove('pud-busy');
      for (const button of win.body.querySelectorAll('button')) button.disabled = false;
      showCounts();
    }
  };

  const describe = () => run('Описание по картинке', async () => {
    remember();
    say('Смотрю на картинку…');
    const dataUrl = custom ?? await look.pictureDataUrl(doc, api.imageUrl(avatar));
    const kept = memory();
    const raw = await look.askAboutPicture(live(), settings.personaLook, dataUrl, describePrompt({ wishes: kept.wishes, voice: kept.voice, voiceWishes: kept.voiceWishes, name: nameOf() }));
    texts.ru.value = cleanModelText(raw);
    texts.en.value = ''; // прежний перевод относился к прежнему тексту
    remember();
    say('Готово. Поправь текст и нажми «Одобрить и перевести».');
  });

  const translate = () => run('Перевод', async () => {
    remember();
    if (!texts.ru.value.trim()) throw new Error('Сначала нужен русский текст.');
    say('Перевожу…');
    texts.en.value = cleanModelText(await look.askText(live(), settings.personaLook, translatePrompt(texts.ru.value)));
    remember();
    say('Переведено. Проверь и вставь в описание.');
  });

  const put = lang => run('Описание персоны', async () => {
    remember();
    const text = texts[lang].value.trim();
    if (!text) throw new Error(lang === 'en' ? 'Сначала переведи текст.' : 'Сначала опиши картинку.');
    await api.update(avatar, { description: putLookBlock(descriptionOf(), text, lang) });
    say(lang === 'en' ? 'Английский блок внешности лежит в описании персоны.' : 'Русский блок внешности лежит в описании персоны.');
    globalThis.toastr?.success?.('Внешность вставлена в описание персоны.', 'Пудреница');
  });

  const removeBlock = () => run('Описание персоны', async () => {
    await api.update(avatar, { description: removeLookBlock(descriptionOf()) });
    say('Блок внешности убран из описания.');
  });

  const copy = async () => {
    const text = texts.en.value.trim() || texts.ru.value.trim();
    if (!text) return;
    try { await view.navigator.clipboard.writeText(text); say('Скопировано.'); } catch { texts.en.value.trim() ? texts.en.select() : texts.ru.select(); say('Не получилось скопировать само: текст выделен, нажми Ctrl+C.', true); }
  };

  win.body.addEventListener('click', event => {
    const act = event.target.closest('[data-act]')?.dataset.act;
    if (!act || busy) return;
    if (act === 'describe') describe();
    else if (act === 'translate') translate();
    else if (act === 'put-en') put('en');
    else if (act === 'put-ru') put('ru');
    else if (act === 'remove') removeBlock();
    else if (act === 'copy') copy();
    else if (act === 'pick') fileInput.click();
    else if (act === 'reset') { custom = null; renderPicture(); }
  });
  win.body.addEventListener('input', event => {
    if (event.target.matches('[data-field="voice"]')) q('[data-voice-wishes]').hidden = !fields.voice.checked;
    if (event.target.matches('[data-field], [data-text]')) { remember(); showCounts(); }
  });
  fields.model.addEventListener('change', () => { syncModel(); save(); });
  fileInput.addEventListener('change', () => {
    const file = fileInput.files?.[0];
    fileInput.value = '';
    if (!file) return;
    run('Картинка', async () => { custom = await look.pictureDataUrl(doc, file); renderPicture(); });
  });

  return {
    win,
    open(target) {
      avatar = target;
      custom = null;
      fill();
      win.open();
    },
    close: () => win.close(),
    destroy: () => win.destroy(),
  };
}
