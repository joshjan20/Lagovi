import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { fetchDepartures, ApiError } from "./api.js";
import config from "./config.js";

const MIN_QUERY_LENGTH = config.search.minQueryLength;
const DEBOUNCE_MS = config.search.debounceMs;
const AUTO_REFRESH_SECONDS = config.autoRefresh.intervalSeconds;

// ─── Helpers ────────────────────────────────────────────────────────
function delayTone(d) {
  if (d.cancelled) return "cancelled";
  if (d.delayMinutes <= 0) return "on-time";
  if (d.delayMinutes <= 5) return "minor";
  return "major";
}

function fmtTime(iso) {
  return new Date(iso).toLocaleTimeString("en-BE", { hour: "2-digit", minute: "2-digit" });
}

function fmtClock(date) {
  return date.toLocaleTimeString("en-BE", { hour: "2-digit", minute: "2-digit", second: "2-digit" });
}

function fmtDate(date) {
  return date.toLocaleDateString("en-BE", { weekday: "long", day: "numeric", month: "long" });
}

// ─── Icons (inline SVG so no extra deps) ────────────────────────────
function IconSearch() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="11" cy="11" r="8" /><path d="m21 21-4.35-4.35" />
    </svg>
  );
}

function IconX() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
      <path d="M18 6 6 18M6 6l12 12" />
    </svg>
  );
}

function IconTrain() {
  return (
    <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <rect x="4" y="3" width="16" height="13" rx="2"/>
      <path d="M4 11h16M12 3v8M8 19l-2 2M16 19l2 2M8 19h8"/>
      <circle cx="8.5" cy="14.5" r="1" fill="currentColor" stroke="none"/>
      <circle cx="15.5" cy="14.5" r="1" fill="currentColor" stroke="none"/>
    </svg>
  );
}

function IconRefresh() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8"/>
      <path d="M21 3v5h-5"/>
      <path d="M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16"/>
      <path d="M8 16H3v5"/>
    </svg>
  );
}

// ─── Skeleton card ───────────────────────────────────────────────────
function SkeletonBoard() {
  return (
    <div className="board board--skeleton" aria-hidden="true">
      <div className="board__header">
        <div className="skeleton skeleton--title" />
        <div className="skeleton skeleton--chip" />
      </div>
      {[1, 2, 3].map((i) => (
        <div key={i} className="skeleton-row">
          <div className="skeleton skeleton--time" />
          <div className="skeleton skeleton--train" />
          <div className="skeleton skeleton--dest" />
          <div className="skeleton skeleton--badge" />
        </div>
      ))}
    </div>
  );
}

// ─── Countdown ring ──────────────────────────────────────────────────
function RefreshRing({ secondsLeft, total }) {
  const r = 9;
  const circ = 2 * Math.PI * r;
  const progress = secondsLeft / total;
  return (
    <svg className="refresh-ring" width="28" height="28" viewBox="0 0 28 28">
      <circle cx="14" cy="14" r={r} className="refresh-ring__track" />
      <circle
        cx="14" cy="14" r={r}
        className="refresh-ring__arc"
        strokeDasharray={circ}
        strokeDashoffset={circ * (1 - progress)}
        transform="rotate(-90 14 14)"
      />
      <text x="14" y="18" textAnchor="middle" className="refresh-ring__label">{secondsLeft}</text>
    </svg>
  );
}

// ─── Departure row ───────────────────────────────────────────────────
function DepartureRow({ departure, isNext }) {
  const tone = delayTone(departure);
  return (
    <tr className={`row row--${tone}${isNext ? " row--next" : ""}`}>
      <td className="cell cell--time">
        {isNext && <span className="next-pill">Next</span>}
        {fmtTime(departure.scheduledTime)}
      </td>
      <td className="cell cell--train">{departure.trainNumber}</td>
      <td className="cell cell--destination">{departure.destination}</td>
      <td className="cell cell--platform">
        {departure.platform
          ? <span className="platform-badge">{departure.platform}</span>
          : <span className="cell--muted">—</span>}
      </td>
      <td className="cell cell--status">
        {departure.cancelled ? (
          <span className="badge badge--cancelled">Cancelled</span>
        ) : departure.delayMinutes > 0 ? (
          <span className={`badge badge--${tone}`}>+{departure.delayMinutes} min</span>
        ) : (
          <span className="badge badge--on-time">On time</span>
        )}
      </td>
    </tr>
  );
}

// ─── Station board ───────────────────────────────────────────────────
function StationBoard({ station, windowMinutes }) {
  const firstLive = station.departures.findIndex((d) => !d.cancelled);
  return (
    <section className="board">
      <header className="board__header">
        <div className="board__title-group">
          <h2 className="board__title">{station.name}</h2>
        </div>
        <span className="board__count">
          {station.departureCount === 0
            ? "No departures"
            : `${station.departureCount} departure${station.departureCount === 1 ? "" : "s"}`}
        </span>
      </header>
      {station.departureCount === 0 ? (
        <div className="board__empty">
          <p>No trains in the next {windowMinutes} minutes from this station.</p>
        </div>
      ) : (
        <div className="board__table-wrap">
          <table className="board__table">
            <thead>
              <tr>
                <th>Time</th>
                <th>Train</th>
                <th>Destination</th>
                <th>Platform</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {station.departures.map((d, i) => (
                <DepartureRow
                  key={`${d.trainNumber}-${d.scheduledTime}-${i}`}
                  departure={d}
                  isNext={i === firstLive}
                />
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

// ─── App ─────────────────────────────────────────────────────────────
export default function App() {
  const [query, setQuery] = useState("");
  const [result, setResult] = useState(null);
  const [status, setStatus] = useState("idle");
  const [errorMessage, setErrorMessage] = useState("");
  const [now, setNow] = useState(new Date());
  const [countdown, setCountdown] = useState(AUTO_REFRESH_SECONDS);
  const abortRef = useRef(null);
  const debounceRef = useRef(null);
  const inputRef = useRef(null);

  const [theme, setTheme] = useState(() => localStorage.getItem("lagovia-theme") || "dark");

  useEffect(() => {
    document.documentElement.setAttribute("data-theme", theme);
    localStorage.setItem("lagovia-theme", theme);
  }, [theme]);

  // Live clock ticking every second
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(t);
  }, []);

  const trimmed = query.trim();
  const tooShort = trimmed.length > 0 && trimmed.length < MIN_QUERY_LENGTH;

  const runSearch = useCallback(
    (q) => {
      if (abortRef.current) abortRef.current.abort();
      const controller = new AbortController();
      abortRef.current = controller;
      setStatus("loading");
      setErrorMessage("");
      setCountdown(AUTO_REFRESH_SECONDS);

      fetchDepartures(q, { signal: controller.signal })
        .then((data) => { setResult(data); setStatus("success"); })
        .catch((err) => {
          if (err.name === "AbortError") return;
          setStatus("error");
          setErrorMessage(err instanceof ApiError ? err.message : "Something went wrong.");
        });
    },
    []
  );

  // Debounced search on query change
  useEffect(() => {
    clearTimeout(debounceRef.current);
    if (trimmed.length < MIN_QUERY_LENGTH) {
      if (abortRef.current) abortRef.current.abort();
      setResult(null);
      setStatus("idle");
      setErrorMessage("");
      return;
    }
    debounceRef.current = setTimeout(() => runSearch(trimmed), DEBOUNCE_MS);
    return () => clearTimeout(debounceRef.current);
  }, [trimmed, runSearch]);

  // Auto-refresh countdown
  useEffect(() => {
    if (status !== "success" || !trimmed) return;
    const tick = setInterval(() => {
      setCountdown((c) => {
        if (c <= 1) { runSearch(trimmed); return AUTO_REFRESH_SECONDS; }
        return c - 1;
      });
    }, 1000);
    return () => clearInterval(tick);
  }, [status, trimmed, runSearch]);

  function handleSubmit(e) {
    e.preventDefault();
    clearTimeout(debounceRef.current);
    if (trimmed.length >= MIN_QUERY_LENGTH) runSearch(trimmed);
  }

  function clearQuery() {
    setQuery("");
    inputRef.current?.focus();
  }

  const stationsWithDepartures = useMemo(() => result?.stations ?? [], [result]);
  const showSkeletons = status === "loading";

  return (
    <div className="app">
      {/* ── Top bar ── */}
      <div className="topbar">
        <div className="topbar__brand">
          <span className="topbar__logo">🚆</span>
          <span className="topbar__name">Lagovia Rail</span>
        </div>
        <div className="topbar__right">
          <div className="topbar__clock">
            <span className="topbar__clock-time">{fmtClock(now)}</span>
            <span className="topbar__clock-date">{fmtDate(now)}</span>
          </div>
          <button
            className="theme-toggle"
            onClick={() => setTheme((t) => t === "dark" ? "light" : "dark")}
            aria-label={`Switch to ${theme === "dark" ? "light" : "dark"} mode`}
          >
            {theme === "dark" ? "☀️" : "🌙"}
            <span>{theme === "dark" ? "Light" : "Dark"}</span>
          </button>
        </div>
      </div>

      {/* ── Hero ── */}
      <header className="hero">
        <h1 className="hero__title">Where&rsquo;s my train?</h1>
        <p className="hero__sub">
          Live departures from any Belgian station — next {result?.windowMinutes ?? 15} minutes, delays included.
        </p>
      </header>

      {/* ── Search ── */}
      <form className="search" onSubmit={handleSubmit}>
        <div className="search__wrap">
          <span className="search__icon"><IconSearch /></span>
          <input
            ref={inputRef}
            className="search__input"
            type="text"
            inputMode="search"
            autoFocus
            placeholder="Station name — e.g. Brussels, Gent, Antwerpen…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            aria-label="Station search"
          />
          {query && (
            <button
              type="button"
              className="search__clear"
              onClick={clearQuery}
              aria-label="Clear search"
            >
              <IconX />
            </button>
          )}
        </div>
        <button className="search__button" type="submit" disabled={trimmed.length < MIN_QUERY_LENGTH}>
          Search
        </button>
      </form>

      {/* ── Status bar ── */}
      <div className="statusbar" role="status" aria-live="polite">
        <div className="statusbar__left">
          {tooShort && <span className="hint">Keep typing — need at least {MIN_QUERY_LENGTH} characters.</span>}
          {status === "loading" && <span className="hint">Fetching departures…</span>}
          {status === "error" && <span className="hint hint--error">{errorMessage}</span>}
          {status === "success" && result?.matchType === "fuzzy" && (
            <span className="hint hint--fuzzy">
              No exact match for "{result.query}" — showing closest spelling{result.stationsMatched === 1 ? "" : "s"}.
            </span>
          )}
          {status === "success" && result && result.stationsMatched === 0 && (
            <span className="hint">No stations found for "{result.query}", even with typo correction.</span>
          )}
          {status === "success" && result?.warnings?.length > 0 && (
            <span className="hint hint--warning">
              ⚠ Couldn't reach: {result.warnings.map((w) => w.station).join(", ")}
            </span>
          )}
        </div>
        {status === "success" && result && result.stationsMatched > 0 && (
          <div className="statusbar__right">
            <RefreshRing secondsLeft={countdown} total={AUTO_REFRESH_SECONDS} />
            <button
              className="refresh-btn"
              onClick={() => runSearch(trimmed)}
              title="Refresh now"
              aria-label="Refresh departures"
            >
              <IconRefresh />
              <span>Refresh</span>
            </button>
          </div>
        )}
      </div>

      {/* ── Results ── */}
      <main className="results">
        {status === "idle" && !tooShort && (
          <div className="splash">
            <div className="splash__icon"><IconTrain /></div>
            <p className="splash__text">Type a station name above to see live departures.</p>
            <p className="splash__sub">Try "Brussels", "Gent", or "Antwerpen"</p>
          </div>
        )}

        {status === "success" && stationsWithDepartures.length === 0 && result.stationsMatched > 0 && (
          <div className="splash">
            <div className="splash__icon"><IconTrain /></div>
            <p className="splash__text">No departures in the next {result?.windowMinutes ?? 15} minutes.</p>
            <p className="splash__sub">The matched stations are quiet right now — check back shortly.</p>
          </div>
        )}

        {showSkeletons && [1, 2].map((i) => <SkeletonBoard key={i} />)}

        {!showSkeletons && stationsWithDepartures.map((station) => (
          <StationBoard key={station.id} station={station} windowMinutes={result?.windowMinutes ?? 15} />
        ))}
      </main>

      {/* ── Footer ── */}
      <footer className="footer">
        <p>
          Real-time data via{" "}
          <a href="https://docs.irail.be/" target="_blank" rel="noreferrer">iRail</a>
          {" "}· Belgian rail network · Lagovia is fictional — the trains are real
        </p>
        {result && (
          <p className="footer__updated">Last updated {fmtClock(new Date(result.generatedAt))}</p>
        )}
      </footer>
    </div>
  );
}
