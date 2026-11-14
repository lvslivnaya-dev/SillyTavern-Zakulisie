/**
 * The setup guide of a chat: what to do when Kulisy meets a chat for the first time, as a short list of steps.
 * Pure data and rules; index.js collects the facts, the page «Настройка чата» draws the steps, the reminder above the message
 * box counts the required ones that are not done yet.
 *
 * facts = { enabled, personaId, characters (without the persona), libraryCards, cardsOn, lorebooks (linked), hasPlace, auxMode }
 * step  = { id, title, tab, required, done (true | false | null = nothing to tick), what, how[], note }
 */
export const SETUP_STEPS = Object.freeze([
  Object.freeze({
    id: 'persona', tab: 'personas', required: true,
    title: 'Выберите свою персону',
    what: 'Закулисье должно знать, кто вы в этой истории: за вашу персону оно ничего не решает, и остальные не «знают» её сами по себе.',
    how: [
      'Откройте окно «Персоны» (кнопка на верхней панели таверны).',
      'Выберите себя в списке. Обычно персона подвязывается сама, по имени вашей персоны в SillyTavern.',
      'Списка нет или он пуст? Сначала отправьте пару постов: персонажи появятся после первых ответов.',
    ],
    done: facts => Boolean(facts.personaId),
  }),
  Object.freeze({
    id: 'characters', tab: 'characters', required: true,
    title: 'Соберите персонажей',
    what: 'Закулисье ведёт отношения, знания и одежду каждого героя. Для этого ему нужен список героев чата.',
    how: [
      'Откройте «Персонажи» и нажмите «Из карточек»: герои из библиотеки ставятся в чат в пару кликов.',
      'Или отправьте пару постов: герои появятся сами, когда летописец прочтёт ответы.',
      'Если в чате уже есть переписка, нажмите вверху «Проанализировать историю»: он соберёт героев и события из неё.',
      'На странице «Персонажи» лишних можно удалить, недостающих добавить вручную.',
    ],
    done: facts => facts.characters > 0,
    note: facts => (facts.characters ? `Героев в чате: ${facts.characters}.` : ''),
  }),
  Object.freeze({
    id: 'lorebooks', tab: 'lorebooks', required: false,
    title: 'Отметьте лорбуки этой истории',
    what: 'Закулисье читает лорбуки само (анализ ответов, поиск героев, секреты). Нужно сказать, какие книги относятся к этой истории.',
    how: [
      'Откройте «Лорбуки» (группа «Система»).',
      'Отметьте книги этой истории: мир, места, анкеты героев.',
      'Если книги подключены в таверне к чату или персонажу, они уже видны в списке.',
    ],
    done: facts => facts.lorebooks > 0,
    note: facts => (facts.lorebooks ? `Отмечено книг: ${facts.lorebooks}.` : ''),
  }),
  Object.freeze({
    id: 'place', tab: 'scene', required: false,
    title: 'Задайте место и время',
    what: 'Погода, одежда и локации опираются на то, где и когда происходит сцена. Дальше летописец ведёт их сам.',
    how: [
      'Откройте «Сейчас» или нажмите на плитку «место» и «время» в шторке над полем ввода.',
      'Выберите место из библиотеки локаций или впишите своё. Время сцены ставится там же.',
    ],
    done: facts => facts.hasPlace,
  }),
  Object.freeze({
    id: 'weather', tab: 'weather', required: false,
    title: 'Задайте погоду',
    what: 'Погода влияет на одежду и на то, что видно за окном. Её можно поставить на сегодня или расписать на неделю вперёд.',
    how: [
      'Откройте «Настройки Закулисья» → «Погода».',
      'Выберите климат и поставьте погоду на сегодня; план на неделю можно собрать кнопкой.',
      'Ничего не задавая, погода просто не учитывается.',
    ],
    done: facts => Boolean(facts.hasWeather),
  }),
  Object.freeze({
    id: 'calendar', tab: 'calendar', required: false,
    title: 'Выберите календарь',
    what: 'Календарь даёт датам смысл: сезон, праздники, дни недели. Свой календарь нужен для выдуманного мира; для обычного хватает земного.',
    how: [
      'Откройте окно «Календарь».',
      'Выберите земной календарь или соберите свой: месяцы, дни недели, праздники.',
      'Дату начала истории можно поставить там же.',
    ],
    done: facts => Boolean(facts.hasCalendar),
  }),
  Object.freeze({
    id: 'wardrobe', tab: 'wardrobe', required: false,
    title: 'Укажите, что надето',
    what: 'Модель должна знать, во что одеты персона и герои в первой сцене. Дальше летописец следит за одеждой сам.',
    how: [
      'Откройте «Гардероб».',
      'Выберите героя и поставьте образ из шкафа или впишите, что на нём.',
      'Ничего не указывая, одежду модель придумает сама.',
    ],
    done: facts => Boolean(facts.hasOutfits),
  }),
  Object.freeze({
    id: 'analysis', tab: 'settings', required: false,
    title: 'Выберите модель для анализа',
    what: 'После каждого ответа летописец делает отдельный запрос. Его можно отдать недорогой модели, а основную оставить для рассказчика.',
    how: [
      'Откройте «Настройки» → «Модели и API» → «Вспомогательный API».',
      'Выберите профиль подключения или впишите адрес и модель, нажмите «Проверить».',
      'Ничего не выбирая, всё работает и на основной модели, просто дороже.',
    ],
    done: facts => facts.auxMode === 'profile' || facts.auxMode === 'custom',
  }),
  Object.freeze({
    id: 'prompt', tab: 'settings', required: false,
    title: 'Посмотрите, что уходит модели',
    what: 'Последняя проверка: какие блоки Закулисье добавит к следующему ответу.',
    how: [
      'Откройте «Настройки» → «Что получает модель».',
      'Просмотрите блоки: карточки, имена, сцена, знания. Раскройте любой, чтобы увидеть, что в нём.',
      'Лишнее выключается там же.',
    ],
    done: () => null,
  }),
]);

/** The steps of this chat, with their state: [{ id, title, tab, required, done, what, how, note }]. */
export function setupSteps(facts = {}) {
  return SETUP_STEPS.map(step => ({
    id: step.id, title: step.title, tab: step.tab, required: step.required, what: step.what, how: [...step.how],
    done: step.done(facts),
    note: step.note ? step.note(facts) : '',
  }));
}

/** { done, total, optionalDone, optionalTotal, missing: [step ids still to do among the required ones] }. */
export function setupProgress(steps) {
  const required = steps.filter(step => step.required);
  const optional = steps.filter(step => !step.required && step.done !== null);
  return {
    done: required.filter(step => step.done).length,
    total: required.length,
    optionalDone: optional.filter(step => step.done).length,
    optionalTotal: optional.length,
    missing: required.filter(step => !step.done).map(step => step.id),
  };
}

/** Whether to show the reminder: Kulisy is on, the reminder is on and this chat did not close it. It stays when the required steps are done: the rest of the steps are still there, and the cross closes it. */
export function setupReminderDue({ enabled = true, remind = true, off = false }) {
  return Boolean(enabled && remind && !off);
}
