# Lagovia Train Tracker

A tiny full-stack app for the (fictional) Lagovia Rail Authority: search a station by
substring, see every train leaving from any matching station in the next 15 minutes,
with live delay and cancellation info. Built on top of [iRail](https://docs.irail.be/),
the free, open, no-auth API for Belgian rail data.

See [`AI_USAGE.md`](./AI_USAGE.md) for a disclosure of how AI tools were used to build this.

```
lagovia-train-tracker/
  backend/    Node.js + Express API (GET /departures)
  frontend/   React (Vite) single-page app that consumes it
```

## Why this stack

Node/Express and React, per the brief's stated preference. iRail itself is a thin
JSON/XML HTTP API with no SDK, so there's no real benefit to a heavier framework like
FastAPI/Django here &mdash; Express is enough surface area for one endpoint, and Vite
gives a zero-config React setup without committing to a larger framework like Next.js
that this project doesn't need (no SSR, no routing beyond one page).

## Quick start

You'll need Node 18+ (built-in `fetch` is used directly, no HTTP client dependency).

**Backend**

```bash
cd backend
npm install
npm start          # listens on http://localhost:3001
```

**Frontend** (in a second terminal)

```bash
cd frontend
npm install
npm run dev         # http://localhost:5173
```

The frontend talks to `http://localhost:3001` by default; copy `frontend/.env.example`
to `.env.local` if your backend runs elsewhere.

**Tests** (backend logic only, see "Testing" below)

```bash
cd backend
npm test
```

## API

### `GET /departures?q={substring}`

Returns upcoming departures (next 15 minutes) for every station whose name contains
`q` (case-insensitive, accent-insensitive &mdash; `liege` matches `Liège`). If no station
name *contains* `q`, the API retries with typo-tolerant fuzzy matching (see "Fuzzy
search" below) before giving up.

**Success &mdash; `200 OK`**

```json
{
  "query": "Bru",
  "matchType": "substring",
  "generatedAt": "2026-06-21T10:00:00.000Z",
  "windowMinutes": 15,
  "stationsMatched": 5,
  "stationsReturned": 5,
  "truncated": false,
  "stations": [
    {
      "id": "BE.NMBS.008814001",
      "name": "Brussels-South/Brussels-Midi",
      "departureCount": 2,
      "departures": [
        {
          "station": "Brussels-South/Brussels-Midi",
          "trainNumber": "IC3033",
          "destination": "Mechelen",
          "scheduledTime": "2026-06-21T10:06:00.000Z",
          "delayMinutes": 4,
          "cancelled": false,
          "platform": "4"
        }
      ]
    }
  ],
  "warnings": []
}
```

Field notes:

- `scheduledTime` is the **scheduled** (not delay-adjusted) departure time, ISO 8601.
- `delayMinutes` is iRail's delay (given in seconds) rounded to the nearest minute; `0`
  means on time.
- `cancelled` is a boolean flag; cancelled departures are still included in the list
  (the brief asks to flag them, not hide them) and the frontend strikes them through.
- `platform` is included as a bonus field beyond the brief's required list, since
  iRail provides it for free and it's directly useful next to a departure time.
- `truncated` is `true` if more stations matched than we actually queried (see
  "Capping fan-out" below) &mdash; `stationsMatched` is the true count either way.
- `matchType` is `"substring"`, `"fuzzy"`, or `"none"` &mdash; see "Fuzzy search" below.
- `warnings` lists any matched station whose individual liveboard fetch failed, so one
  flaky upstream call doesn't take down the whole response.

**Validation error &mdash; `400 Bad Request`** (query shorter than 3 characters, or missing)

```json
{ "error": "query_too_short", "message": "Query is incomplete - please provide at least 3 characters.", "minLength": 3 }
```

**Upstream failure &mdash; `502 Bad Gateway`** (iRail unreachable/erroring) or **`504`** (timeout)

```json
{ "error": "upstream_unavailable", "message": "Could not retrieve data from the iRail API right now. Please try again shortly." }
```

**Upstream rate limit &mdash; `429`** (iRail itself rate-limited us) or our own **`429`** (too many
requests from one client &mdash; see "Rate limiting" below), both with an `{ "error", "message" }` body.

## Design decisions and trade-offs

**Departure window uses the scheduled time, not the delayed time.** The brief asks for
departures "scheduled within the next 15 minutes." A train scheduled 12 minutes ago but
now running 20 minutes late is arguably still something a rider waiting on the platform
cares about, but that's a different (and equally defensible) product definition. I went
with the literal scheduled-time reading and called it out here rather than silently
picking one.

**Station matching searches the display name only**, not `standardname` (the
canonical/bilingual NMBS name), to keep "what you type is what you see" honest &mdash;
otherwise a search for "Mid" could surface a station whose *displayed* name doesn't
contain "Mid" at all, which would look like a bug. Matches are ranked so names
*starting with* the query sort first (so "Bru" surfaces Bruges before, say, a station
that merely contains "bru" mid-word), with alphabetical order as a tiebreaker.

**Capping fan-out (`MAX_STATIONS_QUERIED = 20`).** iRail enforces ~3 requests/second per
IP with a small burst allowance. A short, common substring could match dozens of
stations; firing a liveboard request per match would risk 429s and a multi-second
response. The backend queries at most 20 matched stations (the most relevant ones, per
the ranking above), runs those requests with a concurrency limit of 3, and reports
`truncated: true` plus the real `stationsMatched` count so the frontend can be honest
about it instead of silently dropping results.

**Fuzzy search (bonus feature) is a fallback, not a blend.** Substring search always
runs first, untouched. Only when it finds zero matches does the backend retry with
typo-tolerant matching, so a normal, typo-free query is never affected by it &mdash; and
the response's `matchType` field (`"substring"` / `"fuzzy"` / `"none"`) tells the
frontend which path was taken, so it can show "no exact match, showing the closest
spelling" instead of silently presenting a guess as a literal match.

The matching itself is approximate substring search (the algorithm behind tools like
`agrep`): standard Levenshtein edit distance, with one change &mdash; the first row of the
DP table is seeded with zeros instead of `0,1,2,3…`, so "matching zero characters of
the query" is free starting from *any* position in the station name, not just the
start. That's what lets `"Antverpen"` match inside `"Antwerpen-Centraal"` (distance 1,
one substitution) without the trailing `"-Centraal"` being penalized as a mismatch. A
plain whole-string Levenshtein comparison would not have worked here: the two strings
are very different lengths, so most of that distance would just be measuring the
length gap, not typos. This runs in `O(query.length × name.length)` per comparison,
fast enough across ~600 station names that no fuzzy-search library was worth adding as
a dependency for one small function.

The edit-distance threshold scales with query length
(`min(2, ceil(query.length * 0.25))`, capped at 2) rather than using a fixed number: a
fixed threshold of, say, 2 would let a 3-letter query like `"bru"` match almost
anything, while a 9-letter query like `"antverpen"` genuinely can have a couple of real
typos and still be recognizable.

**Caching.** The station list (\~600+ entries) is fetched from iRail once and cached for
6 hours in memory &mdash; it's effectively static and there's no reason to re-fetch it on
every keystroke. Liveboards are cached per-station for 20 seconds, which absorbs bursts
of identical/overlapping searches (debounced typing, multiple users searching the same
city) without serving meaningfully stale delay data. Both caches are process-local
in-memory `Map`/object state; in a multi-instance deployment you'd want a shared cache
(Redis) instead.

**Partial failure handling.** If one matched station's liveboard call fails (timeout,
500, etc.), that failure is collected into a `warnings` array and the request still
succeeds with results from every other station. The alternative &mdash; failing the whole
request because one of N stations errored &mdash; seemed like the wrong trade-off for a
search that's explicitly fanning out across multiple stations.

**Rate limiting our own endpoint.** A simple in-memory per-IP limiter (30 requests/min)
sits in front of `/departures` so a runaway frontend or accidental loop can't hammer
iRail through us and get our server IP throttled or blocked. It's intentionally
minimal (single-process, in-memory) &mdash; a real deployment behind a load balancer would
want this enforced at a gateway or backed by a shared store.

**No API key, by design.** iRail is unauthenticated; the only thing it asks of
integrators is a descriptive `User-Agent`, which the backend sets.

## What I'd add with more time

- An automated end-to-end test against the live iRail API (the unit tests in
  `backend/test/` cover the matching/filtering/shaping logic against fixture data, but
  I didn't have unrestricted outbound network access in the environment I built this in
  to also write a live-network integration test &mdash; worth adding in CI where that's
  available).
- Auto-refresh on the frontend (poll every 20&ndash;30s while a search is active) so the
  board updates itself instead of requiring a manual re-search.
- Surfacing iRail's `disturbances` endpoint alongside results when a matched station is
  affected by planned works or an incident.
- Language selection (iRail supports nl/fr/de/en natively; right now everything is
  requested in English).
- Replacing the in-memory rate limiter/caches with Redis for multi-instance deployments.

## Testing

`backend/test/departuresService.test.js` (run via `npm test`, Node's built-in test
runner, no extra dependency) covers the pure logic against fixture data modeled on real
iRail payloads: case/accent-insensitive matching, match ranking, window filtering at the
boundaries, delay/cancellation shaping, and the single-departure-not-wrapped-in-an-array
quirk iRail's JSON has when there's exactly one result.

`backend/test/fuzzySearch.test.js` covers the fuzzy-fallback feature specifically: the
edit-distance algorithm at the unit level (exact substrings, single-edit typos), the
length-scaled threshold, and &mdash; using dependency injection on `searchDepartures` so no
real network call is needed &mdash; the orchestration logic that decides between
`"substring"`, `"fuzzy"`, and `"none"`, including a direct test of the brief's own
example (`"Antverpen"` &rarr; `"Antwerpen-Centraal"`).

I also manually exercised the running Express server (`/health`, missing/short `q`,
unknown routes, and the upstream-failure path) to confirm error handling end-to-end.
