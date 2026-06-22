import pLimit from "p-limit";
import config from "../config.js";
import { getStations, getLiveboard, UpstreamError } from "./irailClient.js";

const {
  maxStationsQueried: MAX_STATIONS_QUERIED,
  concurrency: CONCURRENCY,
} = config.search;

const { windowMinutes: DEPARTURE_WINDOW_MINUTES } = config.departures;

export { MAX_STATIONS_QUERIED };

export function normalize(str) {
  return str
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

export function findMatchingStations(stations, query) {
  const needle = normalize(query);
  const matches = stations
    .filter((s) => normalize(s.name || s.standardname || "").includes(needle))
    .map((s) => ({ id: s.id, name: s.name || s.standardname, standardname: s.standardname }));
  matches.sort((a, b) => {
    const aStarts = normalize(a.name).startsWith(needle) ? 0 : 1;
    const bStarts = normalize(b.name).startsWith(needle) ? 0 : 1;
    if (aStarts !== bStarts) return aStarts - bStarts;
    return a.name.localeCompare(b.name);
  });
  return matches;
}

export function bestSubstringEditDistance(pattern, text) {
  const m = pattern.length;
  const n = text.length;
  if (m === 0) return 0;
  let prevRow = new Array(n + 1).fill(0);
  let curRow = new Array(n + 1).fill(0);
  for (let i = 1; i <= m; i++) {
    curRow[0] = i;
    for (let j = 1; j <= n; j++) {
      const cost = pattern[i - 1] === text[j - 1] ? 0 : 1;
      curRow[j] = Math.min(prevRow[j - 1] + cost, prevRow[j] + 1, curRow[j - 1] + 1);
    }
    [prevRow, curRow] = [curRow, prevRow];
  }
  return Math.min(...prevRow);
}

export function fuzzyThresholdFor(query) {
  return Math.min(2, Math.ceil(query.length * 0.25));
}

export function fuzzyMatchStations(stations, query, { maxDistance } = {}) {
  const needle = normalize(query);
  const threshold = maxDistance ?? fuzzyThresholdFor(needle);
  const scored = [];
  for (const s of stations) {
    const name = s.name || s.standardname || "";
    const distance = bestSubstringEditDistance(needle, normalize(name));
    if (distance <= threshold) {
      scored.push({ id: s.id, name, standardname: s.standardname, distance });
    }
  }
  scored.sort((a, b) => a.distance - b.distance || a.name.localeCompare(b.name));
  return scored;
}

function toTrainNumber(departure) {
  if (departure.vehicleinfo?.shortname) return departure.vehicleinfo.shortname;
  return (departure.vehicle || "").replace(/^BE\.NMBS\./, "");
}

function shapeDeparture(stationLabel, departure) {
  return {
    station: stationLabel,
    trainNumber: toTrainNumber(departure),
    destination: departure.station,
    scheduledTime: new Date(Number(departure.time) * 1000).toISOString(),
    delayMinutes: Math.round((Number(departure.delay) || 0) / 60),
    cancelled: Number(departure.canceled) === 1,
    platform: departure.platform ?? null,
  };
}

export function filterDeparturesInWindow(liveboard, { now = new Date(), windowMinutes = DEPARTURE_WINDOW_MINUTES } = {}) {
  const departures = liveboard?.departures?.departure;
  const list = Array.isArray(departures) ? departures : departures ? [departures] : [];
  const nowMs = now.getTime();
  const windowEndMs = nowMs + windowMinutes * 60 * 1000;
  const stationLabel = liveboard?.station || liveboard?.stationinfo?.name;
  return list
    .filter((d) => { const ms = Number(d.time) * 1000; return ms >= nowMs && ms <= windowEndMs; })
    .map((d) => shapeDeparture(stationLabel, d))
    .sort((a, b) => a.scheduledTime.localeCompare(b.scheduledTime));
}

export async function searchDepartures(
  query,
  { now = new Date(), getStationsFn = getStations, getLiveboardFn = getLiveboard } = {}
) {
  const allStations = await getStationsFn();
  let allMatches = findMatchingStations(allStations, query);
  let matchType = "substring";
  if (allMatches.length === 0) {
    allMatches = fuzzyMatchStations(allStations, query);
    matchType = allMatches.length > 0 ? "fuzzy" : "none";
  }

  const queriedMatches = allMatches.slice(0, MAX_STATIONS_QUERIED);
  const limit = pLimit(CONCURRENCY);
  const warnings = [];

  const results = await Promise.all(
    queriedMatches.map((station) =>
      limit(async () => {
        try {
          const liveboard = await getLiveboardFn(station);
          const departures = filterDeparturesInWindow(liveboard, { now });
          return { station, departures };
        } catch (err) {
          warnings.push({
            station: station.name,
            message: err instanceof UpstreamError ? err.message : "Unknown error",
          });
          return { station, departures: null };
        }
      })
    )
  );

  const stations = results
    .filter((r) => r.departures !== null)
    .map((r) => ({
      id: r.station.id,
      name: r.station.name,
      departureCount: r.departures.length,
      departures: r.departures,
    }));

  return {
    query,
    matchType,
    generatedAt: now.toISOString(),
    windowMinutes: DEPARTURE_WINDOW_MINUTES,
    stationsMatched: allMatches.length,
    stationsReturned: stations.length,
    truncated: allMatches.length > queriedMatches.length,
    stations,
    warnings,
  };
}
