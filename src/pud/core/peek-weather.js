/**
 * Погода для маскота: Open-Meteo (бесплатно, без ключа, https://open-meteo.com).
 * В сеть уходит только название города (поиск места) и координаты найденного места (погода), и только если город вписан в настройках.
 * fetch подставляется снаружи, чтобы тесты не ходили в сеть.
 */

const GEO = 'https://geocoding-api.open-meteo.com/v1/search';
const FORECAST = 'https://api.open-meteo.com/v1/forecast';
const TIMEOUT_MS = 8000;

async function getJson(url, fetchFn, view) {
  const control = typeof AbortController === 'function' ? new AbortController() : null;
  const timer = control ? (view?.setTimeout ?? setTimeout)(() => control.abort(), TIMEOUT_MS) : 0;
  try {
    const response = await fetchFn(url, control ? { signal: control.signal } : undefined);
    if (!response.ok) throw new Error(`Open-Meteo ответил ${response.status}`);
    return await response.json();
  } finally {
    if (timer) (view?.clearTimeout ?? clearTimeout)(timer);
  }
}

/** Название города → { name, country, lat, lon, tz } или null, если такого не нашлось. */
export async function findPlace(city, fetchFn = globalThis.fetch?.bind(globalThis), view = null) {
  const name = String(city ?? '').trim();
  if (!name) return null;
  if (typeof fetchFn !== 'function') throw new Error('нет fetch');
  const data = await getJson(`${GEO}?name=${encodeURIComponent(name)}&count=1&language=ru&format=json`, fetchFn, view);
  const hit = data?.results?.[0];
  if (!hit || !Number.isFinite(hit.latitude) || !Number.isFinite(hit.longitude)) return null;
  return { name: String(hit.name ?? name), country: String(hit.country ?? ''), lat: hit.latitude, lon: hit.longitude, tz: String(hit.timezone ?? '') };
}

/** Место → текущая погода { temp, feels, code, precip, wind } (градусы Цельсия, код WMO). */
export async function currentWeather(place, fetchFn = globalThis.fetch?.bind(globalThis), view = null) {
  if (!place || !Number.isFinite(place.lat) || !Number.isFinite(place.lon)) throw new Error('место не задано');
  if (typeof fetchFn !== 'function') throw new Error('нет fetch');
  const url = `${FORECAST}?latitude=${place.lat}&longitude=${place.lon}&current=temperature_2m,apparent_temperature,precipitation,weather_code,wind_speed_10m&timezone=auto`;
  const data = await getJson(url, fetchFn, view);
  const now = data?.current;
  if (!now || !Number.isFinite(now.temperature_2m)) throw new Error('в ответе нет текущей погоды');
  return { temp: now.temperature_2m, feels: now.apparent_temperature, code: now.weather_code, precip: now.precipitation, wind: now.wind_speed_10m, at: Date.now() };
}
