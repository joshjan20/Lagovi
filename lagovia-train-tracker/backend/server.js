import express from "express";
import cors from "cors";
import config from "./config.js";
import { searchDepartures } from "./src/departuresService.js";
import { UpstreamError } from "./src/irailClient.js";

const PORT = process.env.PORT || 3001;
const { minQueryLength: MIN_QUERY_LENGTH } = config.search;
const { windowMs: RATE_LIMIT_WINDOW_MS, maxRequests: RATE_LIMIT_MAX_REQUESTS } = config.rateLimit;

const app = express();
app.use(cors());

const requestLog = new Map();

function rateLimit(req, res, next) {
  const ip = req.ip;
  const now = Date.now();
  const timestamps = (requestLog.get(ip) || []).filter((t) => now - t < RATE_LIMIT_WINDOW_MS);
  if (timestamps.length >= RATE_LIMIT_MAX_REQUESTS) {
    return res.status(429).json({
      error: "rate_limited",
      message: "Too many requests. Please slow down and try again shortly.",
    });
  }
  timestamps.push(now);
  requestLog.set(ip, timestamps);
  next();
}

app.get("/health", (_req, res) => res.json({ status: "ok" }));

app.get("/departures", rateLimit, async (req, res) => {
  const q = typeof req.query.q === "string" ? req.query.q.trim() : "";
  if (q.length < MIN_QUERY_LENGTH) {
    return res.status(400).json({
      error: "query_too_short",
      message: `Query is incomplete - please provide at least ${MIN_QUERY_LENGTH} characters.`,
      minLength: MIN_QUERY_LENGTH,
    });
  }
  try {
    const result = await searchDepartures(q);
    res.json(result);
  } catch (err) {
    if (err instanceof UpstreamError) {
      const status = err.status === 429 ? 429 : 502;
      return res.status(status).json({
        error: status === 429 ? "upstream_rate_limited" : "upstream_unavailable",
        message:
          status === 429
            ? "The iRail data source is rate-limiting us right now. Please try again in a moment."
            : "Could not retrieve data from the iRail API right now. Please try again shortly.",
      });
    }
    console.error("Unexpected error in /departures:", err);
    res.status(500).json({ error: "internal_error", message: "Something went wrong on our end." });
  }
});

app.use((_req, res) => res.status(404).json({ error: "not_found", message: "No such endpoint. Try GET /departures?q=..." }));

app.listen(PORT, () => console.log(`Lagovia Train Tracker API listening on http://localhost:${PORT}`));
