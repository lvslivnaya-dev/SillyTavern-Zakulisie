/**
 * A field for the time of day: the colon is already there (shown when you click into the field), you type only digits,
 * «1420» becomes «14:20». An empty field stays empty: a lone colon is cleared when you leave it.
 */
export function timeText(digits) {
  const clean = String(digits ?? '').replace(/\D/g, '').slice(0, 4);
  return clean ? `${clean.slice(0, 2)}:${clean.slice(2)}` : '';
}

export function attachTimeMask(input) {
  if (!input || input.dataset.timeMask) return input;
  input.dataset.timeMask = '1';
  input.maxLength = 5;
  input.inputMode = 'numeric';
  const digitsOf = text => String(text ?? '').replace(/\D/g, '').slice(0, 4);
  let before = digitsOf(input.value);
  input.addEventListener('focus', () => {
    before = digitsOf(input.value);
    if (!input.value) {
      input.value = ':';
      try { input.setSelectionRange(0, 0); } catch { /* not a text field */ }
    }
  });
  input.addEventListener('input', event => {
    let digits = digitsOf(input.value);
    // backspace over the colon removes the digit before it instead of putting the colon back
    if (String(event.inputType ?? '').startsWith('delete') && digits === before) digits = digits.slice(0, -1);
    before = digits;
    input.value = digits ? timeText(digits) : (input.value ? ':' : '');
  });
  input.addEventListener('blur', () => { if (input.value === ':') input.value = ''; });
  return input;
}
