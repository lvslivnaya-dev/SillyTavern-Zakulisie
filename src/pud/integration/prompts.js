/**
 * Тогглы промптов текущего пресета. Читаю их из списка Prompt Manager на странице, а переключаю кликом по его
 * собственному тумблеру: так включение, перерисовка и сохранение пресета идут родной дорогой таверны.
 */
import { chipKey } from '../core/settings.js';

export const PM_CONTAINER_ID = 'completion_prompt_manager';
const ITEM = '#completion_prompt_manager_list .completion_prompt_manager_prompt[data-pm-identifier]';
const TOGGLE = '.prompt-manager-toggle-action';

/** Кнопки пресета есть только у Chat Completion: у остальных API нет Prompt Manager. */
export function usesPromptManager(context) {
  return (context?.mainApi ?? 'openai') === 'openai';
}

/** @returns {{ id: string, name: string, enabled: boolean }[]} */
export function readPrompts(doc, context) {
  const names = new Map((context?.chatCompletionSettings?.prompts ?? []).map(prompt => [prompt.identifier, prompt.name]));
  const out = [];
  for (const item of doc.querySelectorAll(ITEM)) {
    const toggle = item.querySelector(TOGGLE);
    if (!toggle) continue; // маркеры вроде истории чата не выключаются
    const id = item.dataset.pmIdentifier;
    const name = names.get(id) || item.querySelector('.completion_prompt_manager_prompt_name')?.textContent.trim() || id;
    out.push({ id, name, enabled: toggle.classList.contains('fa-toggle-on') });
  }
  return out;
}

/** Нажимает родной тумблер. false — если такого тоггла на странице нет. */
export function togglePrompt(doc, id) {
  const item = [...doc.querySelectorAll(ITEM)].find(element => element.dataset.pmIdentifier === id);
  const toggle = item?.querySelector(TOGGLE);
  if (!toggle) return false;
  toggle.click();
  return true;
}

/** Текущая пара «пресет + профиль соединения»: ключ для набора кнопок и подписи для людей. */
export function currentSet(context) {
  const preset = context?.chatCompletionSettings?.preset_settings_openai ?? '';
  const manager = context?.extensionSettings?.connectionManager;
  const profileId = manager?.selectedProfile ?? '';
  const profileName = manager?.profiles?.find(profile => profile.id === profileId)?.name ?? '';
  return { key: chipKey(preset, profileId), preset, profileId, profileName };
}
