/**
 * Звуки погоды: тихий фон под текущую погоду сюжета (дождь, ветер, гроза…). Файлы приносит сама Аня, расширение только проигрывает.
 * Здесь только чистая часть: какие виды бывают, настройки и расчёт «незаметной» петли.
 */

/** Какие виды погоды бывают в Закулисье (id такие же, как в core/weather.js). */
export const SOUND_KINDS = Object.freeze({
  rain: { label: 'Дождь', icon: '🌧' },
  storm: { label: 'Гроза', icon: '⛈' },
  wind: { label: 'Ветер', icon: '🌬' },
  snow: { label: 'Снег (метель)', icon: '❄' },
  fog: { label: 'Туман', icon: '🌫' },
  clear: { label: 'Ясно (птицы, цикады)', icon: '☀' },
  cloudy: { label: 'Пасмурно', icon: '☁' },
  heat: { label: 'Жара', icon: '🌡' },
});

export const WEATHER_SOUND_DEFAULTS = Object.freeze({
  enabled: false,
  // громкость, процентов
  volume: 35,
  // пауза, пока играет «стоп» из шторки (не сохраняется между запусками)
  paused: false,
});

export function normalizeWeatherSound(raw) {
  const source = raw && typeof raw === 'object' ? raw : {};
  return {
    enabled: source.enabled === true,
    volume: Math.min(100, Math.max(0, Number.isFinite(Number(source.volume)) ? Number(source.volume) : WEATHER_SOUND_DEFAULTS.volume)),
    paused: false,
  };
}

/** Громкость 0..100 → усиление 0..1: квадратично, чтобы тихие значения были по-настоящему тихими. */
export const gainFor = volume => (Math.min(100, Math.max(0, Number(volume) || 0)) / 100) ** 2;

/**
 * Расчёт петли с перекрытием: запись длиной duration секунд играется внахлёст самой с собой.
 * Перекрытие (fade) берётся длинным, но не больше трети записи: чем оно длиннее, тем незаметнее стык.
 * @returns {{ fade:number, period:number }} fade — секунд перекрытия; period — через сколько секунд после начала стартует следующая копия
 */
export function loopPlan(duration, wantedFade = 4) {
  const length = Math.max(0.5, Number(duration) || 0.5);
  const fade = Math.min(Math.max(0.2, wantedFade), length / 3);
  return { fade, period: Math.max(0.3, length - fade) };
}

/** Случайный старт внутри записи, чтобы повтор не угадывался: не дальше половины и не ближе чем на fade*2 до конца. */
export function randomStart(duration, fade, rand = Math.random) {
  const room = Math.max(0, duration / 2 - fade * 2);
  return room > 0 ? rand() * room : 0;
}

/** Вид погоды сюжета → вид звука (если для него бывает звук). */
export const soundKindFor = weatherKind => (Object.hasOwn(SOUND_KINDS, weatherKind) ? weatherKind : null);

/**
 * Запись → бесшовная петля. Конец записи плавно (равной мощности) подмешивается в её начало, а сама петля
 * становится короче на длину перекрытия. Такой кусок можно крутить по кругу штатным loop=true браузера:
 * на стыке продолжается то же самое звучание, никаких таймеров и обрывов нет.
 * @param {Float32Array[]} channels дорожки записи
 * @param {number} sampleRate
 * @param {number} wantedFade желаемое перекрытие, секунд
 * @returns {Float32Array[]} дорожки петли (длина на перекрытие меньше)
 */
export function seamlessLoop(channels, sampleRate, wantedFade = 4) {
  const total = channels[0]?.length ?? 0;
  if (total < 4) return channels.map(channel => Float32Array.from(channel));
  const fade = Math.max(1, Math.min(Math.round(wantedFade * sampleRate), Math.floor(total / 3)));
  const length = total - fade;
  return channels.map(source => {
    const out = new Float32Array(length);
    out.set(source.subarray(0, length));
    for (let i = 0; i < fade; i++) {
      const t = (i / fade) * (Math.PI / 2);
      // начало нарастает, продолжение конца (то, что шло бы после петли) затихает
      out[i] = source[i] * Math.sin(t) + source[length + i] * Math.cos(t);
    }
    return out;
  });
}
