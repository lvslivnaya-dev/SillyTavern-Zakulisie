/**
 * Фон таверны для визуальных пресетов: какой стоит и как поставить. Родной код таверны (backgrounds.js) отдаёт имя текущего фона;
 * ставится он так же, как это делает команда таверны /bg: нажатием на плитку этого фона в её списке. Своей логики над фонами здесь нет.
 */
let loading = null;

async function backgrounds() {
  loading ??= import('../../../../../../backgrounds.js').catch(() => null);
  return loading;
}

/** Имя файла фона, который сейчас стоит (пусто, если не удалось узнать). */
export async function currentBackground() {
  try {
    const mod = await backgrounds();
    return String(mod?.background_settings?.name ?? '');
  } catch { return ''; }
}

/** Поставить фон по точному имени файла. Бросает понятную ошибку, если такого фона в списке таверны нет. */
export function applyBackground(name) {
  const file = String(name ?? '').trim();
  if (!file) return;
  const tile = [...(globalThis.document?.querySelectorAll?.('.bg_example') ?? [])].find(node => node.getAttribute('bgfile') === file);
  if (!tile) throw new Error(`фона «${file}» в списке таверны нет (его удалили или переименовали)`);
  tile.click();
}
