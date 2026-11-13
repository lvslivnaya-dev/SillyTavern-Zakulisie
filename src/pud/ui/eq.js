/**
 * Эквалайзер закулисья: одиннадцать скруглённых столбиков-волна над тонкой линией. Стоит внизу хаба настроек и стартового экрана.
 * Цвета берутся из палитры (розовый, тёмно-розовый, сиреневый), поэтому подходит под любую тему; столбики тихо «дышат»
 * (только CSS, transform; при «уменьшить движение» стоят волной). Рисуется кодом (SVG), без картинок.
 */
const HEIGHTS = [14, 22, 30, 38, 28, 44, 34, 26, 36, 20, 12];
const BAR = 5.2;
const GAP = 3.6;
const BASE = 46;
const LEFT = 3.4;
// какие цвета палитры у столбика: розовый → тёмно-розовый → сиреневый
const TONES = ['a', 'a', 'b', 'b', 'a', 'b', 'c', 'c', 'b', 'c', 'c'];

const bars = HEIGHTS.map((height, index) => {
  const x = LEFT + index * (BAR + GAP);
  return `<rect class="pud-eq-bar pud-eq-${TONES[index]} pud-eq-n${index + 1}" x="${x.toFixed(1)}" y="${BASE - height}" width="${BAR}" height="${height}" rx="${BAR / 2}"/>`;
}).join('');

export const EQ_SVG = `<svg class="pud-eq" viewBox="0 0 100 52" aria-hidden="true">${bars}<rect class="pud-eq-line" x="1" y="${BASE + 2}" width="98" height="1.6" rx=".8"/></svg>`;

export const EQ_SPOT = `<div class="pud-eq-spot" aria-hidden="true">${EQ_SVG}</div>`;
