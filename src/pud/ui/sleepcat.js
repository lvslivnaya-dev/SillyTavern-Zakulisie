/**
 * Спящий котик внизу хаба и стартового экрана — родственник того, что гуляет над полем ввода:
 * та же «облачная» шубка из кружков и цвета палитры (--pud-cat-fur, --pud-rose2 …),
 * так что он перекрашивается вместе с темой. Дышит и пускает «z» — только CSS.
 */
import { circles, fur } from './walkcat.js';

// калачиком: спина-облако, голова слева на лапках, хвост обвивает снизу
const BODY = circles([[46, 50, 12], [57, 45, 14], [70, 44, 14.5], [83, 46, 13.5], [93, 52, 10], [64, 54, 12], [50, 56, 9.5], [80, 56, 10]]);
const HEAD = '<path d="M19.5 41 L19 28.5 L28.5 35Z"/><path d="M33 35 L41 28 L41.5 41Z"/>'
  + circles([[30.5, 47, 12.5], [22, 52, 5.5], [39, 52, 5.5], [30.5, 55, 6.5]]);
const TAIL = circles([[98, 55, 5], [101, 59, 5], [99.5, 63, 4.9], [95, 65, 4.8], [89, 65.8, 4.7], [83, 66, 4.6], [77, 66.2, 4.5], [71, 66.2, 4.4], [65, 66, 4.3], [59, 65.6, 4.2], [53, 65, 4.1], [48, 64, 4]]);

export const SLEEPCAT_SVG = `<svg class="pud-sleepcat" viewBox="0 0 120 72" aria-hidden="true">
  <g class="pud-sleep-breath">
    ${fur(BODY)}
    ${fur(HEAD)}
    <path class="pud-cat-earin" d="M21.6 37.4 L21.4 32 L25.6 35.2Z"/>
    <path class="pud-cat-earin" d="M35.8 35.2 L39.2 31.8 L39.4 37.6Z"/>
    <path class="pud-cat-eye" d="M23.2 47.4 q2.5 2.1 5 0 M32.8 47.4 q2.5 2.1 5 0"/>
    <circle class="pud-cat-blush" cx="21.6" cy="52" r="2.2"/>
    <circle class="pud-cat-blush" cx="39.4" cy="52" r="2.2"/>
    <path class="pud-cat-nose" d="M29.2 51.2 h2.6 l-1.3 1.4Z"/>
    <path class="pud-cat-whisk" d="M18 53.2 l-6 -0.8 M18 55 l-6 0.9 M43 53.2 l6 -0.8 M43 55 l6 0.9"/>
  </g>
  <g class="pud-sleep-tail">${fur(TAIL)}</g>
  <g class="pud-sleep-z">
    <text x="46" y="27" font-size="10">z</text>
    <text x="55" y="18" font-size="12.5">z</text>
    <text x="66" y="8" font-size="15">z</text>
  </g>
</svg>`;
