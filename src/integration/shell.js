const SHELL_ID = 'ku-extension-settings';
const MENU_ID = 'ku-menu-entry';

export function mountExtensionShell({ settings, onOpenStudio, onSettingsChanged, conflicts = [] }) {
  document.getElementById(SHELL_ID)?.remove();
  document.getElementById(MENU_ID)?.remove();

  const menu = document.createElement('div');
  menu.id = MENU_ID;
  menu.className = 'list-group-item flex-container flexGap5 interactable';
  menu.tabIndex = 0;
  menu.setAttribute('role', 'button');
  menu.innerHTML = '<i class="fa-solid fa-masks-theater"></i><span>Кулисы</span>';
  menu.addEventListener('click', onOpenStudio);
  menu.addEventListener('keydown', event => {
    if (event.key === 'Enter' || event.key === ' ') onOpenStudio();
  });
  document.querySelector('#extensionsMenu')?.append(menu);

  const root = document.createElement('div');
  root.id = SHELL_ID;
  root.innerHTML = `
    <div class="inline-drawer">
      <div class="inline-drawer-toggle inline-drawer-header">
        <b>Кулисы</b>
        <div class="inline-drawer-icon fa-solid fa-circle-chevron-down down"></div>
      </div>
      <div class="inline-drawer-content">
        <label class="checkbox_label"><input type="checkbox" data-setting="enabled"><span>Включить Кулисы</span></label>
        <label class="checkbox_label"><input type="checkbox" data-setting="injectPrompt"><span>Учитывать отношения при генерации ответа</span></label>
        <label class="checkbox_label"><input type="checkbox" data-setting="autoAnalyze"><span>Автоматически анализировать новые ответы</span></label>
        <label class="checkbox_label"><input type="checkbox" data-setting="widget.visible"><span>Показывать компактный виджет</span></label>
        <label class="ku-label"><span>Порог подтверждения крупных изменений</span><input class="text_pole" type="number" min="1" max="25" data-setting="largeChangeThreshold"></label>
        <button type="button" class="menu_button" data-action="open-studio"><i class="fa-solid fa-up-right-from-square"></i> Открыть Кулисы</button>
        <div data-conflicts></div>
      </div>
    </div>`;

  root.querySelectorAll('[data-setting]').forEach(input => {
    const path = input.dataset.setting.split('.');
    const current = getNested(settings, path);
    if (input.type === 'checkbox') input.checked = Boolean(current);
    else input.value = current ?? '';
    input.addEventListener('change', () => {
      const value = input.type === 'checkbox' ? input.checked : Number(input.value);
      setNested(settings, path, value);
      onSettingsChanged(settings);
    });
  });
  root.querySelector('[data-action="open-studio"]')?.addEventListener('click', onOpenStudio);
  const warningHost = root.querySelector('[data-conflicts]');
  for (const conflict of conflicts) {
    const warning = document.createElement('div');
    warning.className = 'ku-warning';
    warning.textContent = conflict.message;
    warningHost.append(warning);
  }
  (document.querySelector('#extensions_settings2') ?? document.querySelector('#extensions_settings'))?.append(root);

  return () => {
    root.remove();
    menu.remove();
  };
}

const TOPBAR_ID = 'ku-topbar-button';

/**
 * Button in SillyTavern's top bar, next to the persona button.
 * It wears ST's own `.drawer` / `.drawer-icon` look (size, dimmed when closed)
 * but deliberately NOT `.drawer-toggle`: ST binds that class to its drawer
 * handler, which would look for a native `.drawer-content` we do not have.
 */
export function mountTopBarButton({ onToggle }) {
  document.getElementById(TOPBAR_ID)?.remove();
  const holder = document.getElementById('top-settings-holder');
  if (!holder) {
    console.warn('[Kulisy] Top bar not found; the Studio stays reachable from the extensions menu.');
    return { setOpen() {}, unmount() {} };
  }
  const drawer = document.createElement('div');
  drawer.id = TOPBAR_ID;
  drawer.className = 'drawer';
  const toggle = document.createElement('div');
  toggle.className = 'ku-topbar-toggle';
  const iconNode = document.createElement('div');
  iconNode.className = 'drawer-icon fa-solid fa-masks-theater fa-fw closedIcon interactable';
  iconNode.title = 'Кулисы';
  iconNode.tabIndex = 0;
  iconNode.setAttribute('role', 'button');
  iconNode.setAttribute('aria-label', 'Кулисы');
  iconNode.setAttribute('aria-pressed', 'false');
  const run = event => {
    event.preventDefault();
    try { onToggle(); }
    catch (error) { console.error('[Kulisy] Could not toggle the Studio.', error); }
  };
  iconNode.addEventListener('click', run);
  iconNode.addEventListener('keydown', event => {
    if (event.key === 'Enter' || event.key === ' ') run(event);
  });
  toggle.append(iconNode);
  drawer.append(toggle);
  const persona = document.getElementById('persona-management-button');
  if (persona?.parentElement === holder) persona.after(drawer);
  else holder.append(drawer);

  return {
    setOpen(open) {
      iconNode.classList.toggle('openIcon', open);
      iconNode.classList.toggle('closedIcon', !open);
      iconNode.setAttribute('aria-pressed', String(open));
    },
    unmount() { drawer.remove(); },
  };
}

/**
 * One button per window of Zakulisie on SillyTavern's top bar (scene, relations, wardrobe…).
 * `windows` is the WINDOWS list of ui/layout.js; `onOpen(windowId)` toggles that window.
 * Like mountTopBarButton, the buttons wear ST's `.drawer-icon` look but not `.drawer-toggle`.
 */
export function mountWindowButtons(windows, { onOpen }) {
  const holder = document.getElementById('top-settings-holder');
  for (const old of document.querySelectorAll('.ku-winbtn')) old.remove();
  if (!holder) {
    console.warn('[Kulisy] Top bar not found; the windows stay reachable from the extensions menu.');
    return { setOpen() {}, unmount() {} };
  }
  const nodes = new Map();
  const drawers = [];
  for (const item of windows) {
    const drawer = document.createElement('div');
    drawer.className = 'drawer ku-winbtn';
    drawer.dataset.window = item.id;
    const toggle = document.createElement('div');
    toggle.className = 'ku-topbar-toggle';
    const iconNode = document.createElement('div');
    iconNode.className = `drawer-icon fa-solid ${item.iconClass} fa-fw closedIcon interactable`;
    iconNode.title = item.title;
    iconNode.tabIndex = 0;
    iconNode.setAttribute('role', 'button');
    iconNode.setAttribute('aria-label', item.title);
    iconNode.setAttribute('aria-pressed', 'false');
    const run = event => {
      event.preventDefault();
      try { onOpen(item.id); }
      catch (error) { console.error(`[Kulisy] Could not open the window «${item.title}».`, error); }
    };
    iconNode.addEventListener('click', run);
    iconNode.addEventListener('keydown', event => { if (event.key === 'Enter' || event.key === ' ') run(event); });
    toggle.append(iconNode);
    drawer.append(toggle);
    nodes.set(item.id, iconNode);
    drawers.push(drawer);
  }
  const persona = document.getElementById('persona-management-button');
  if (persona?.parentElement === holder) persona.after(...drawers);
  else holder.append(...drawers);
  return {
    /** `windowId`: the window that is open now, a list of them, or null when none is. */
    setOpen(windowId) {
      const lit = new Set(Array.isArray(windowId) ? windowId : [windowId]);
      for (const [id, node] of nodes) {
        const open = lit.has(id);
        node.classList.toggle('openIcon', open);
        node.classList.toggle('closedIcon', !open);
        node.setAttribute('aria-pressed', String(open));
      }
    },
    unmount() { for (const drawer of drawers) drawer.remove(); },
  };
}

function getNested(object, path) {
  return path.reduce((value, key) => value?.[key], object);
}

function setNested(object, path, value) {
  const last = path.at(-1);
  const parent = path.slice(0, -1).reduce((current, key) => current[key] ??= {}, object);
  parent[last] = value;
}
