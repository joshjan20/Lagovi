import { test } from "node:test";
import assert from "node:assert/strict";
import { findMatchingStations, filterDeparturesInWindow, normalize } from "../src/departuresService.js";

const STATIONS_FIXTURE = [
  { id: "BE.NMBS.008814001", name: "Brussels-South/Brussels-Midi", standardname: "Bruxelles-Midi/Brussel-Zuid" },
  { id: "BE.NMBS.008811007", name: "Brussels-Central", standardname: "Brussel-Centraal/Bruxelles-Central" },
  { id: "BE.NMBS.008891009", name: "Bruges", standardname: "Brugge" },
  { id: "BE.NMBS.008892007", name: "Ghent-Sint-Pieters", standardname: "Gent-Sint-Pieters" },
  { id: "BE.NMBS.008811189", name: "Liège-Guillemins", standardname: "Liège-Guillemins" },
];

test("normalize lowercases and strips accents", () => {
  assert.equal(normalize("Liège"), "liege");
  assert.equal(normalize("BRUGES"), "bruges");
});

test("findMatchingStations matches case-insensitively and ranks prefix matches first", () => {
  const matches = findMatchingStations(STATIONS_FIXTURE, "Bru");
  const names = matches.map((m) => m.name);

  assert.ok(names.includes("Brussels-South/Brussels-Midi"));
  assert.ok(names.includes("Brussels-Central"));
  assert.ok(names.includes("Bruges"));
  assert.ok(!names.includes("Ghent-Sint-Pieters"));

  // All three matches start with "Bru", so order falls back to alphabetical.
  assert.deepEqual(names, ["Bruges", "Brussels-Central", "Brussels-South/Brussels-Midi"]);
});

test("findMatchingStations matches accented station names without requiring the accent", () => {
  const matches = findMatchingStations(STATIONS_FIXTURE, "liege");
  assert.equal(matches.length, 1);
  assert.equal(matches[0].name, "Liège-Guillemins");
});

test("findMatchingStations returns an empty list when nothing matches", () => {
  assert.deepEqual(findMatchingStations(STATIONS_FIXTURE, "xyz"), []);
});

function buildLiveboard(stationName, departures) {
  return {
    station: stationName,
    departures: { number: departures.length, departure: departures },
  };
}

test("filterDeparturesInWindow keeps only departures within the window and shapes fields correctly", () => {
  const now = new Date("2026-06-21T10:00:00.000Z");
  const inWindow = Math.floor(new Date("2026-06-21T10:10:00.000Z").getTime() / 1000); // +10 min
  const tooSoon = Math.floor(new Date("2026-06-21T09:55:00.000Z").getTime() / 1000); // already departed
  const tooLate = Math.floor(new Date("2026-06-21T10:20:00.000Z").getTime() / 1000); // +20 min

  const liveboard = buildLiveboard("Brussels-South/Brussels-Midi", [
    {
      id: 0,
      delay: "240", // seconds -> 4 minutes
      station: "Mechelen",
      time: String(inWindow),
      vehicle: "BE.NMBS.IC3033",
      vehicleinfo: { shortname: "IC3033" },
      platform: "4",
      canceled: "0",
    },
    {
      id: 1,
      delay: "0",
      station: "Antwerp-Central",
      time: String(tooSoon),
      vehicle: "BE.NMBS.IC1832",
      canceled: "0",
    },
    {
      id: 2,
      delay: "0",
      station: "Leuven",
      time: String(tooLate),
      vehicle: "BE.NMBS.IC538",
      canceled: "0",
    },
    {
      id: 3,
      delay: "0",
      station: "Oostende",
      time: String(inWindow + 60),
      vehicle: "BE.NMBS.IC1815",
      canceled: "1", // cancelled train, still within the window
    },
  ]);

  const result = filterDeparturesInWindow(liveboard, { now, windowMinutes: 15 });

  assert.equal(result.length, 2);

  const [first, second] = result;
  assert.equal(first.trainNumber, "IC3033");
  assert.equal(first.destination, "Mechelen");
  assert.equal(first.delayMinutes, 4);
  assert.equal(first.cancelled, false);
  assert.equal(first.station, "Brussels-South/Brussels-Midi");
  assert.equal(first.scheduledTime, new Date(inWindow * 1000).toISOString());

  assert.equal(second.trainNumber, "IC1815");
  assert.equal(second.cancelled, true);
});

test("filterDeparturesInWindow handles a single departure object (not wrapped in an array)", () => {
  const now = new Date("2026-06-21T10:00:00.000Z");
  const time = Math.floor(new Date("2026-06-21T10:05:00.000Z").getTime() / 1000);
  const liveboard = {
    station: "Bruges",
    departures: {
      number: 1,
      departure: { id: 0, delay: "0", station: "Knokke", time: String(time), vehicle: "BE.NMBS.L123", canceled: "0" },
    },
  };

  const result = filterDeparturesInWindow(liveboard, { now, windowMinutes: 15 });
  assert.equal(result.length, 1);
  assert.equal(result[0].trainNumber, "L123");
});

test("filterDeparturesInWindow returns an empty list when there are no departures", () => {
  const now = new Date("2026-06-21T10:00:00.000Z");
  const liveboard = { station: "Empty", departures: { number: 0, departure: [] } };
  assert.deepEqual(filterDeparturesInWindow(liveboard, { now, windowMinutes: 15 }), []);
});
