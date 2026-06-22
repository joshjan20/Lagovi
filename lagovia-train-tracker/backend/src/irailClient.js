import config from "../config.js";

const IRAIL_BASE = "https://api.irail.be";
const USER_AGENT = "lagovia-train-tracker/1.0 (+https://example.com/lagovia; demo project, no real traffic)";

const { stationsTtlMs: STATIONS_TTL_MS, liveboardTtlMs: LIVEBOARD_TTL_MS } = config.cache;
const { timeoutMs: TIMEOUT_MS } = config.upstream;

let stationsCache = { data: null, fetchedAt: 0 };
const liveboardCache = new Map();

export class UpstreamError extends Error {
  constructor(message, { status = 502, cause } = {}) {
    super(message);
    this.name = "UpstreamError";
    this.status = status;
    this.cause = cause;
  }
}

async function fetchJson(url) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      headers: { Accept: "application/json", "User-Agent": USER_AGENT },
      signal: controller.signal,
    });
    if (!res.ok) {
      throw new UpstreamError(`iRail responded with HTTP ${res.status} for ${url}`, {
        status: res.status === 429 ? 429 : 502,
      });
    }
    return await res.json();
  } catch (err) {
    if (err.name === "AbortError") {
      throw new UpstreamError("iRail did not respond in time", { status: 504, cause: err });
    }
    if (err instanceof UpstreamError) throw err;
    throw new UpstreamError(`Could not reach iRail: ${err.message}`, { status: 502, cause: err });
  } finally {
    clearTimeout(timer);
  }
}

export async function getStations() {
  const fresh = stationsCache.data && Date.now() - stationsCache.fetchedAt < STATIONS_TTL_MS;
  if (fresh) return stationsCache.data;
  const json = await fetchJson(`${IRAIL_BASE}/stations/?format=json&lang=en`);
  const list = Array.isArray(json?.station) ? json.station : [];
  stationsCache = { data: list, fetchedAt: Date.now() };
  return list;
}

export async function getLiveboard(station) {
  const cached = liveboardCache.get(station.id);
  if (cached && Date.now() - cached.fetchedAt < LIVEBOARD_TTL_MS) return cached.data;
  const url =
    `${IRAIL_BASE}/liveboard/?id=${encodeURIComponent(station.id)}` +
    `&arrdep=departure&alerts=false&format=json&lang=en`;
  const json = await fetchJson(url);
  liveboardCache.set(station.id, { data: json, fetchedAt: Date.now() });
  return json;
}

export function _resetCachesForTests() {
  stationsCache = { data: null, fetchedAt: 0 };
  liveboardCache.clear();
}
