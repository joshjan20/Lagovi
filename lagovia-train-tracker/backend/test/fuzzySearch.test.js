import { test } from "node:test";
import assert from "node:assert/strict";
import {
  bestSubstringEditDistance,
  fuzzyThresholdFor,
  fuzzyMatchStations,
  searchDepartures,
} from "../src/departuresService.js";

const STATIONS_FIXTURE = [
  { id: "BE.NMBS.008821006", name: "Antwerpen-Centraal", standardname: "Antwerpen-Centraal" },
  { id: "BE.NMBS.008814001", name: "Brussels-South/Brussels-Midi", standardname: "Bruxelles-Midi/Brussel-Zuid" },
  { id: "BE.NMBS.008891009", name: "Bruges", standardname: "Brugge" },
  { id: "BE.NMBS.008892007", name: "Ghent-Sint-Pieters", standardname: "Gent-Sint-Pieters" },
];

test("bestSubstringEditDistance: 0 for an exact substring, anywhere in the text", () => {
  assert.equal(bestSubstringEditDistance("gent", "ghent-sint-pieters"), 1); // not exact, see below test
  assert.equal(bestSubstringEditDistance("ghent", "ghent-sint-pieters"), 0);
  assert.equal(bestSubstringEditDistance("pieters", "ghent-sint-pieters"), 0);
});

test("bestSubstringEditDistance: 1 for a single substitution/insertion/deletion", () => {
  assert.equal(bestSubstringEditDistance("antverpen", "antwerpen-centraal"), 1); // v/w substitution
  assert.equal(bestSubstringEditDistance("antwerpn", "antwerpen-centraal"), 1); // missing "e"
  assert.equal(bestSubstringEditDistance("antwerpeen", "antwerpen-centraal"), 1); // extra "e"
});

test("fuzzyThresholdFor scales with query length and is capped at 2", () => {
  assert.equal(fuzzyThresholdFor("bru"), 1); // 3 chars: 1 typo tolerated
  assert.equal(fuzzyThresholdFor("antverpen"), 2); // 9 chars: would compute 3, capped to 2
});

test("fuzzyMatchStations finds the brief's own example: 'Antverpen' -> 'Antwerpen-Centraal'", () => {
  const matches = fuzzyMatchStations(STATIONS_FIXTURE, "Antverpen");
  assert.equal(matches.length, 1);
  assert.equal(matches[0].name, "Antwerpen-Centraal");
  assert.equal(matches[0].distance, 1);
});

test("fuzzyMatchStations ranks closer spellings first, alphabetical as tiebreaker", () => {
  const matches = fuzzyMatchStations(
    [
      { id: "1", name: "Aalst" },
      { id: "2", name: "Aalter" },
    ],
    "alst",
    { maxDistance: 2 }
  );
  // "Aalst" needs 1 edit ("aalst" -> "alst" drop a letter), "Aalter" needs more.
  assert.equal(matches[0].name, "Aalst");
});

test("fuzzyMatchStations returns nothing for a query too far from every station name", () => {
  const matches = fuzzyMatchStations(STATIONS_FIXTURE, "xyzxyzxyz");
  assert.deepEqual(matches, []);
});

// --- Orchestration: does searchDepartures pick the right matchType, without any network? ---

function fakeLiveboard(stationName) {
  return { station: stationName, departures: { number: 0, departure: [] } };
}

test("searchDepartures uses substring matching when it finds results, and never falls back to fuzzy", async () => {
  const result = await searchDepartures("Bru", {
    getStationsFn: async () => STATIONS_FIXTURE,
    getLiveboardFn: async (station) => fakeLiveboard(station.name),
  });

  assert.equal(result.matchType, "substring");
  assert.equal(result.stationsMatched, 2); // Bruges, Brussels-South/Brussels-Midi
  assert.ok(result.stations.every((s) => ["Bruges", "Brussels-South/Brussels-Midi"].includes(s.name)));
});

test("searchDepartures falls back to fuzzy matching only when substring search finds nothing", async () => {
  const result = await searchDepartures("Antverpen", {
    getStationsFn: async () => STATIONS_FIXTURE,
    getLiveboardFn: async (station) => fakeLiveboard(station.name),
  });

  assert.equal(result.matchType, "fuzzy");
  assert.equal(result.stationsMatched, 1);
  assert.equal(result.stations[0].name, "Antwerpen-Centraal");
});

test("searchDepartures reports matchType 'none' when neither substring nor fuzzy matches anything", async () => {
  const result = await searchDepartures("qqqqqqq", {
    getStationsFn: async () => STATIONS_FIXTURE,
    getLiveboardFn: async (station) => fakeLiveboard(station.name),
  });

  assert.equal(result.matchType, "none");
  assert.equal(result.stationsMatched, 0);
  assert.deepEqual(result.stations, []);
});
