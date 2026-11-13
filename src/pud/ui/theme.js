/** Тема: метка на body, свой текст в поле ввода и предупреждения о том, что может с ней спорить. */
import { TAG } from '../core/guard.js';

export const THEME_CLASS = 'pud-on';
export const PLACEHOLDER = 'Давай, намурлыкай мне на ушко…';
const PLACEHOLDER_ATTRS = ['placeholder', 'connected_text'];

/** Расширения, чью работу Пудреница забирает себе. Папка в third-party → как назвать в предупреждении. */
export const REPLACED_EXTENSIONS = {
  'MistraelSL-PersonaPanel': 'MistraelSL Persona Panel',
  'MistraelSL-ExtensionManager': 'MistraelSL Extension Manager',
  'MistraelSL-CharacterChatPills': 'MistraelSL Character Chat Pills',
  'My-lorebook-manager': 'My lorebook manager',
};

/** Какие из заменяемых расширений сейчас работают: таверна подключает их style.css отдельным <link>. */
export function activeReplacedExtensions(doc) {
  return Object.entries(REPLACED_EXTENSIONS)
    .filter(([folder]) => doc.querySelector(`link[href*="/third-party/${folder}/"]`))
    .map(([, title]) => title);
}

/** Свой CSS пользователя из настроек таверны (User Settings → Custom CSS) перекрасит тему по-своему. */
export function hasCustomCss(context) {
  return Boolean(String(context?.powerUserSettings?.custom_css ?? '').trim());
}

export function themeWarnings(doc, context) {
  const warnings = [];
  const replaced = activeReplacedExtensions(doc);
  if (replaced.length) warnings.push(`Пудреница заменяет эти расширения, выключи их, чтобы окна не дрались: ${replaced.join(', ')}.`);
  if (hasCustomCss(context)) warnings.push('В настройках таверны есть свой CSS (User Settings → Custom CSS). Он может перекрасить Пудреницу, лучше очистить его или выбрать стандартную тему.');
  return warnings;
}

export function startTheme(doc, context) {
  doc.body.classList.add(THEME_CLASS);

  // Таверна при подключении к API переписывает placeholder из атрибута connected_text, поэтому меняю оба
  const textarea = doc.getElementById('send_textarea');
  const original = Object.fromEntries(PLACEHOLDER_ATTRS.map(name => [name, textarea?.getAttribute(name) ?? null]));
  if (textarea) for (const name of PLACEHOLDER_ATTRS) textarea.setAttribute(name, PLACEHOLDER);

  for (const text of themeWarnings(doc, context)) {
    console.warn(`${TAG} ${text}`);
    globalThis.toastr?.warning?.(text, 'Пудреница', { timeOut: 12000 });
  }

  return () => {
    doc.body.classList.remove(THEME_CLASS);
    if (textarea) {
      for (const [name, value] of Object.entries(original)) {
        if (value === null) textarea.removeAttribute(name);
        else textarea.setAttribute(name, value);
      }
    }
  };
}
