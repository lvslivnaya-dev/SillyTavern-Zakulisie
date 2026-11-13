import { button, element } from '../helpers.js';

/**
 * «Персона» → which card of the library is the persona of this chat, and the AU of the chat. The card itself (looks, voice, names,
 * records about her) is written in «Мир → Персоны», in the same library and the same window as the cards of characters. The AU are a
 * list shared by all chats; each chat switches on the ones it plays (several at once).
 */
export function createPersonaCardPage(ctx) {
  const snapshot = () => ctx.snapshot;
  const act = (...args) => ctx.act(...args);
  const setStatus = (...args) => ctx.setStatus(...args);

  async function attempt(run, done) {
    try { const result = await run(); if (done) setStatus(typeof done === 'function' ? done(result) : done); return result; }
    catch (error) { setStatus(error?.message || String(error), true); return undefined; }
  }

  const library = () => ({ enabled: true, au: [], cards: [], ...(snapshot().personaCards ?? {}) });
  const personaCards = () => (snapshot().locationLibrary?.characters ?? []).filter(card => card.persona);

  function renderCardBox() {
    const snap = snapshot();
    const lib = library();
    const persona = (snap.characters ?? []).find(item => (item.id ?? item.entityId) === snap.personaId);
    const name = persona?.name ?? snap.personaBoundName ?? '';
    const cards = personaCards();
    const current = cards.find(card => card.id === snap.personaCardId) ?? null;
    const box = element('div', { className: 'card' }, [element('h3', { text: 'Карточка персоны' })]);
    const send = element('input', { type: 'checkbox', className: 'set-switch', checked: lib.enabled, 'aria-label': 'Отправлять карточку персоны модели' });
    send.addEventListener('change', () => attempt(() => act('onPersonaCardsEnabled', { enabled: send.checked }, 'persona-card-enabled'), send.checked ? 'Карточка персоны отправляется' : 'Карточка персоны не отправляется'));
    box.append(
      element('p', { className: 'muted ku-small', text: 'Что заметно в персоне со стороны (внешность, голос), имена со склонениями и записи о ней: кто что о ней знает, в каком АУ. Всё это пишется в карточке: ниже библиотека персон, там же выбирается персона этого чата. Скрытый характер лежит в той же карточке, в разделе «Скрытый характер»: его читает только генерация факторов.' }),
      element('label', { className: 'ku-inline' }, [send, 'Отправлять карточку персоны']),
    );
    if (current) {
      box.append(element('div', { className: 'ku-row', style: { marginTop: '8px' } }, [
        element('strong', { text: current.name }),
        element('span', { className: 'muted ku-small', text: snap.personaCardChosen ? 'выбрана для этого чата' : 'найдена по персоне' }),
        element('span', { className: 'ku-push' }),
        button('Открыть карточку', 'btn small primary', () => ctx.openPersonasWindow?.(current.avatar ?? ''), 'Открыть окно персон на этой карточке'),
      ]));
    } else {
      box.append(element('p', { className: 'muted', style: { marginTop: '8px' }, text: name ? `Для «${name}» карточки пока нет.` : 'Сначала привяжите персону к чату: карточка находится по ней.' }));
      if (name) {
        box.append(element('div', { className: 'ku-row' }, [button(`Создать карточку «${name}»`, 'btn primary small', () => attempt(async () => {
          const card = await act('onPersonaCardCreate', { name, avatar: snap.personaAvatar ?? '' }, 'persona-card-create');
          if (card?.id) ctx.openPersonasWindow?.(card.avatar ?? snap.personaAvatar ?? '');
        }, 'Карточка создана: заполните её в окне персон'))]));
      }
    }
    // The description of the persona in SillyTavern goes to the model on its own: next to a card it repeats it.
    const tavernText = snap.personaTavernDescription ?? '';
    if (tavernText) {
      box.append(element('div', { className: 'ku-persona-warn' }, [
        element('p', { className: 'ku-small', text: `В таверне у этой персоны заполнено описание (${tavernText.length} знаков): оно уходит модели само и повторяет карточку. Персона в таверне нужна только как имя и картинка, всё остальное пишется в карточке.` }),
        element('div', { className: 'ku-row' }, [
          ...(current ? [button('Перенести в карточку и очистить', 'btn primary small', () => attempt(() => act('onPersonaTavernDescription', { move: true }, 'persona-tavern-move'), 'Описание перенесено в «Public Info» карточки и убрано из таверны'), 'Текст допишется в раздел Public Info карточки, в таверне описание станет пустым')] : []),
          button('Только очистить в таверне', 'btn small', () => attempt(() => act('onPersonaTavernDescription', { move: false }, 'persona-tavern-clear'), 'Описание в таверне очищено'), 'Описание в таверне будет пустым; в карточке ничего не изменится'),
        ]),
      ]));
    }
    return box;
  }

  function renderAu() {
    const lib = library();
    const on = new Set(snapshot().personaAu ?? []);
    const box = element('div', { className: 'card' }, [
      element('h3', { text: 'АУ' }),
      element('p', { className: 'muted ku-small', text: 'Названия АУ общие, а какие из них играет этот чат, решаете здесь. Можно включить несколько сразу: пойдут записи всех включённых.' }),
    ]);
    if (!lib.au.length) box.append(element('p', { className: 'muted', text: 'АУ пока нет. Добавьте первое, например «Универ» или «Мафия».' }));
    for (const item of lib.au) {
      const check = element('input', { type: 'checkbox', className: 'set-switch', checked: on.has(item.id), 'aria-label': `АУ «${item.name}» включено в этом чате` });
      check.addEventListener('change', () => attempt(() => act('onPersonaAuToggle', { id: item.id, on: check.checked }, 'persona-au-toggle'), check.checked ? `АУ «${item.name}» включено` : `АУ «${item.name}» выключено`));
      box.append(element('div', { className: 'ku-fact' }, [
        element('label', { className: 'ku-fact-text' }, [check, ` ${item.name}`]),
        button('×', 'btn icon small', () => attempt(() => act('onPersonaAuRemove', { id: item.id }, 'persona-au-remove'), 'АУ удалено'), `Удалить АУ «${item.name}»`),
      ]));
    }
    const name = element('input', { type: 'text', placeholder: 'Название АУ', 'aria-label': 'Название нового АУ' });
    box.append(element('div', { className: 'row', style: { marginTop: '8px' } }, [
      name,
      button('Добавить АУ', 'btn small', () => attempt(async () => { await act('onPersonaAuAdd', { name: name.value }, 'persona-au-add'); name.value = ''; }, 'АУ добавлено')),
    ]));
    return box;
  }

  function renderPersonaCard() {
    return [renderCardBox(), renderAu()];
  }

  return { renderPersonaCard };
}

export const PERSONA_CARD_STYLE = `
.ku-plaques{display:grid;grid-template-columns:repeat(auto-fit,minmax(250px,1fr));gap:12px;align-items:start;margin-bottom:14px}
.ku-plaques>.card{margin:0;min-width:0}
.ku-prec{display:flex;flex-direction:column;gap:6px;padding:10px;margin:8px 0;border:1px solid var(--rs-line);border-radius:10px}
.ku-prec textarea{width:100%}
`;
