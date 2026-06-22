/**
 * config.js — Lagovia Train Tracker (frontend)
 *
 * All UI-level knobs live here. Change a value, save, done (hot-reloads
 * in dev; rebuild for production).
 *
 * What belongs here vs .env / .env.local:
 *   .env.local → environment-specific values (VITE_API_BASE_URL)
 *   config.js  → product/behaviour decisions that are the same everywhere
 *
 * Note: windowMinutes is intentionally NOT duplicated here. The backend
 * sends it in every response as `result.windowMinutes`, and the UI reads
 * that value directly — so changing the backend config automatically
 * updates the UI copy too, with no sync needed.
 */

const config = {
  // ─── Search ───────────────────────────────────────────────────────
  search: {
    // Must match backend config.search.minQueryLength. The API rejects
    // shorter queries anyway, but keeping them in sync avoids a round-trip
    // error on every short keystroke.
    minQueryLength: 3,

    // How long to wait after the user stops typing before firing a search.
    // Lower = snappier but more API calls; higher = fewer calls but laggy.
    debounceMs: 400,
  },

  // ─── Auto-refresh ─────────────────────────────────────────────────
  autoRefresh: {
    // How often (in seconds) to silently re-fetch departures while a
    // search is active. The countdown ring in the UI counts down to this.
    // Should be >= backend config.cache.liveboardTtlMs / 1000 (currently
    // 20s) so refreshes actually get fresh data rather than a cached response.
    intervalSeconds: 30,
  },
};

export default config;
