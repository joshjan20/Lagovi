/**
 * config.js — Lagovia Train Tracker (backend)
 *
 * All application-level knobs live here. Change a value, restart the server,
 * done — no hunting through source files.
 *
 * What belongs here vs .env:
 *   .env      → things that differ per environment (PORT, API base URLs, secrets)
 *   config.js → product/behaviour decisions that are the same everywhere
 */

const config = {
  // ─── Search ───────────────────────────────────────────────────────
  search: {
    // Shortest query the API will accept. Shorter strings match too many
    // stations to be useful and burn iRail rate-limit budget fast.
    minQueryLength: 3,

    // How many matched stations we actually fetch liveboards for. A very
    // short query like "a" can match 100+ stations — querying all of them
    // would hit iRail's rate limit and make the response slow. The best
    // matches (ranked by name prefix, then alphabetical) survive the cut.
    maxStationsQueried: 20,

    // How many liveboard requests to fire in parallel. iRail allows ~3 req/s
    // sustained. Keep this comfortably under that.
    concurrency: 3,
  },

  // ─── Departure window ─────────────────────────────────────────────
  departures: {
    // Only return trains whose SCHEDULED departure falls within this many
    // minutes from now. The brief specifies 15; increase for a wider view.
    windowMinutes: 15,
  },

  // ─── Caching ──────────────────────────────────────────────────────
  cache: {
    // Station list from iRail (~600 entries). Barely ever changes — a long
    // TTL is safe and avoids a slow fetch on every cold start.
    stationsTtlMs: 6 * 60 * 60 * 1000, // 6 hours

    // Per-station liveboard. Absorbs burst searches (debounced typing,
    // multiple users hitting the same station) without serving stale delay
    // data. Keep well below the auto-refresh interval.
    liveboardTtlMs: 20 * 1000, // 20 seconds
  },

  // ─── Rate limiting ────────────────────────────────────────────────
  rateLimit: {
    // Rolling window length in milliseconds.
    windowMs: 60 * 1000, // 1 minute

    // Max requests per unique client IP within that window.
    maxRequests: 30,
  },

  // ─── Upstream HTTP ────────────────────────────────────────────────
  upstream: {
    // Hard timeout for any single iRail HTTP request.
    timeoutMs: 8000, // 8 seconds
  },
};

export default config;
