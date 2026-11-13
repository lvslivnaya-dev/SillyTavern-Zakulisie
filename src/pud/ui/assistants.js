/**
 * Вкладка «Ассистенты» в окне настроек Закулисья: с кем автор разговаривает в маленьком чате (кнопка справа от строки ввода).
 * Три готовых ассистента с характером и обращениями и один свой: имя, характер и обращения вписываются здесь же.
 * У каждого своя картинка (можно поставить свою), и можно выбрать, через какой API он отвечает. Данные идут через bridge.assistant.
 */
import { report } from '../core/guard.js';
import { icon } from './icons.js';
import { assistantAvatar } from './assistant-art.js';

const escapeHtml = text => String(text ?? '').replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[ch]);
export const AVATAR_SIZE = 160;

/** Файл-картинка → квадрат AVATAR_SIZE по центру (data-ссылка jpeg), чтобы в настройках не лежали мегабайты. */
export async function squareAvatar(doc, file) {
  const view = doc.defaultView;
  const url = view.URL.createObjectURL(file);
  try {
    const image = await new Promise((resolve, reject) => { const item = new view.Image(); item.onload = () => resolve(item); item.onerror = () => reject(new Error('Не удалось прочитать картинку.')); item.src = url; });
    const canvas = doc.createElement('canvas');
    canvas.width = AVATAR_SIZE;
    canvas.height = AVATAR_SIZE;
    const side = Math.min(image.naturalWidth, image.naturalHeight);
    const context = canvas.getContext('2d');
    if (!context || !side) throw new Error('Не удалось уменьшить картинку.');
    context.drawImage(image, (image.naturalWidth - side) / 2, (image.naturalHeight - side) / 2, side, side, 0, 0, AVATAR_SIZE, AVATAR_SIZE);
    return canvas.toDataURL('image/jpeg', 0.86);
  } finally { view.URL.revokeObjectURL(url); }
}

/**
 * @param {Document} doc
 * @param {{ bridge?: any, shared?: any, hub?: { addTab: Function } }} deps
 */
export function startAssistants(doc, { bridge, hub }) {
  const api = bridge?.assistant;
  const tab = api ? hub?.addTab('assistants', 'Ассистенты', 'chat') : null;
  if (!tab) return () => {};
  const pane = tab.pane;
  const undo = [() => tab.remove()];
  let data = api.view();
  let pictureFor = '';

  const picker = doc.createElement('input');
  picker.type = 'file';
  picker.accept = 'image/*';
  picker.hidden = true;
  pane.append(picker);

  const avatarFor = id => data.settings.avatars?.[id] || assistantAvatar(id);
  const card = (id, name, tagline, addresses, extra = '') => `
    <article class="pud-asst${data.settings.assistant === id ? ' on' : ''}" data-id="${id}">
      <img class="pud-asst-ava" src="${escapeHtml(avatarFor(id))}" alt="">
      <div class="pud-asst-info">
        <b>${escapeHtml(name)}</b>
        <span class="pud-tech">${escapeHtml(tagline)}</span>
        ${addresses?.length ? `<span class="pud-tech">обращается: ${escapeHtml(addresses.join(', '))}</span>` : ''}
      </div>
      <div class="pud-asst-acts">
        <button type="button" class="menu_button" data-act="pick">${data.settings.assistant === id ? 'Выбран' : 'Выбрать'}</button>
        <button type="button" class="pud-crow-btn" data-act="pic" title="Своя картинка">${icon('image')}</button>
        ${data.settings.avatars?.[id] ? `<button type="button" class="pud-crow-btn" data-act="unpic" title="Вернуть нарисованную">${icon('redo')}</button>` : ''}
      </div>
      ${extra}
    </article>`;

  const render = () => {
    const custom = data.settings.custom;
    const customForm = `
      <div class="pud-asst-own">
        <label class="pud-field"><span>Имя</span><input class="text_pole" data-own="name" maxlength="40" value="${escapeHtml(custom.name)}" placeholder="Как её зовут"></label>
        <label class="pud-field"><span>Характер и манера речи</span><textarea class="text_pole" data-own="character" rows="4" placeholder="Например: сдержанная, с чёрным юмором, говорит короткими фразами, не терпит воды">${escapeHtml(custom.character)}</textarea></label>
        <label class="pud-field"><span>Как обращается к вам (через запятую)</span><input class="text_pole" data-own="addresses" value="${escapeHtml(custom.addresses.join(', '))}" placeholder="например: босс, шеф, капитан"></label>
      </div>`;
    const ready = data.ready.map(item => card(item.id, item.name, item.tagline, item.addresses)).join('');
    pane.innerHTML = `
      <div class="pud-card">
        <div>
          <b>Ассистент</b>
          <p class="pud-hint">С ним вы разговариваете в маленьком чате: кнопка с его лицом стоит справа от строки ввода. Он видит последние сообщения игры, но сам разговор не попадает ни в игровой чат, ни к рассказчику: рассказчику уходит только то, что вы приняли («Да») на плашке «Вывод».</p>
        </div>
      </div>
      <div class="pud-asst-list">${ready}${card('custom', custom.name || 'Свой ассистент', 'свой характер', custom.addresses, customForm)}</div>
      <div class="pud-card pud-asst-api">
        <div>
          <b>Кто вы</b>
          <p class="pud-hint">От этого зависит, как ассистент к вам обращается: «дорогая» или «дорогой», «ты сделала» или «ты сделал».</p>
        </div>
        <select class="text_pole" data-field="gender" aria-label="Ваш пол">
          <option value="f" ${data.settings.userGender === 'f' ? 'selected' : ''}>Женщина</option>
          <option value="m" ${data.settings.userGender === 'm' ? 'selected' : ''}>Мужчина</option>
          <option value="n" ${data.settings.userGender === 'n' ? 'selected' : ''}>Не указывать (без рода)</option>
        </select>
      </div>
      <div class="pud-card pud-asst-api">
        <div>
          <b>Через какой API отвечает</b>
          <p class="pud-hint">«Основной» подходит, если вы переписываетесь между постами. Чтобы болтать с ассистентом, пока модель пишет пост, выберите отдельный профиль подключения (Connection Manager): у него свой запрос, и две модели не мешают друг другу.</p>
        </div>
        <select class="text_pole" data-field="profile" aria-label="API ассистента">
          <option value="" ${data.settings.profileId === '' ? 'selected' : ''}>Как остальные запросы Закулисья (вспомогательный API, если он включён)</option>
          <option value="main" ${data.settings.profileId === 'main' ? 'selected' : ''}>Основной API чата</option>
          ${data.profiles.map(item => `<option value="${escapeHtml(item.id)}" ${data.settings.profileId === item.id ? 'selected' : ''}>Профиль: ${escapeHtml(item.name)}</option>`).join('')}
          ${data.settings.profileId && data.settings.profileId !== 'main' && !data.profiles.some(item => item.id === data.settings.profileId) ? `<option value="${escapeHtml(data.settings.profileId)}" selected>Профиль не найден</option>` : ''}
        </select>
      </div>
      <details class="pud-card pud-asst-prompt">
        <summary>Общие правила ассистента (для тех, кто знает, что делает)</summary>
        <p class="pud-hint">Пусто значит встроенные: они стоят серым в поле. Свой текст заменяет их целиком; в конце должно остаться правило про строку «===ВЫВОД===», иначе ассистент не сможет предлагать выводы. Характер и обращения добавляются сами.</p>
        <textarea class="text_pole" data-field="prompt" rows="8" placeholder="${escapeHtml(data.defaultPrompt)}">${escapeHtml(data.settings.prompt)}</textarea>
      </details>`;
    pane.append(picker);
  };

  const typing = () => { const active = doc.activeElement; return pane.contains(active) && active?.matches?.('input[type="text"], input:not([type]), textarea'); };
  const run = async (what, task) => {
    try { await task(); } catch (error) { report(`ассистенты: ${what}`, error); globalThis.toastr?.error?.(error?.message || 'Не получилось. Подробности в консоли (F12).', 'Закулисье'); }
  };

  pane.addEventListener('click', event => {
    const act = event.target.closest('[data-act]')?.dataset.act;
    const id = event.target.closest('[data-id]')?.dataset.id;
    if (!act || !id) return;
    if (act === 'pick') run('выбор', () => api.saveSettings({ assistant: id }));
    else if (act === 'pic') { pictureFor = id; picker.value = ''; picker.click(); }
    else if (act === 'unpic') run('картинка', () => api.saveSettings({ avatars: { [id]: null } }));
  });
  pane.addEventListener('change', event => {
    const target = event.target;
    if (target === picker) {
      const file = picker.files?.[0];
      const id = pictureFor;
      if (file && id) run('картинка', async () => api.saveSettings({ avatars: { [id]: await squareAvatar(doc, file) } }));
      return;
    }
    const own = target.dataset?.own;
    if (own) { run('свой ассистент', () => api.saveSettings({ custom: { [own]: target.value } })); return; }
    if (target.dataset?.field === 'gender') run('пол', () => api.saveSettings({ userGender: target.value }));
    else if (target.dataset?.field === 'profile') run('API', () => api.saveSettings({ profileId: target.value }));
    else if (target.dataset?.field === 'prompt') run('правила', () => api.saveSettings({ prompt: target.value }));
  });

  const stop = api.subscribe(next => {
    data = next;
    // пока человек печатает в поле, список не перерисовывается: он обновится после ввода
    if (!pane.hidden && !typing()) render();
  });
  undo.push(stop);
  const observer = new doc.defaultView.MutationObserver(() => { if (!pane.hidden) { data = api.view(); render(); } });
  observer.observe(pane, { attributes: true, attributeFilter: ['hidden'] });
  undo.push(() => observer.disconnect());
  render();

  return () => { for (const fn of undo.reverse()) { try { fn(); } catch (error) { report('откат ассистентов', error); } } };
}
