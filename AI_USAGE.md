# AI Usage Report

**Tool:** Claude (claude.ai)
**Conversation:** <PASTE_SHARE_LINK_HERE>

---

## How I used it

### 1. Backend

**Prompt:**
> "Here is the iRail API docs link. Build an Express backend with a GET /departures?q= endpoint. It should validate the query, match station names, cache results, handle rate limiting and return clean error responses."

Claude built the Express backend, iRail client, station matching, caching and unit tests.

Tested it by hitting `localhost:3001/departures?q=Antwerpen` in the browser, checked the JSON looked right, and tried edge cases like short queries and unknown routes.

---

### 2. Frontend

**Prompt:**
> "Build a React frontend using Vite that calls the /departures endpoint. Search input should trigger as I type, results grouped by station with delay badges and a cancelled state."

Claude built the initial React UI.

Opened it in the browser, searched a few stations, and checked the output matched what the API was returning.

---

### 3. UI polish and theming

**Prompt:**
> "Redesign the UI so it looks professional. Add a dark and light theme toggle that saves the preference, skeleton loading while data is fetching, a live clock, auto-refresh with a countdown, and highlight the next upcoming train."

Claude did the full redesign with CSS variables, animations, responsive layout and accessibility.

Tested both themes in the browser and spotted that skeleton loading blocks were showing up black in both modes. Turned out to be a CSS ordering bug, got that fixed.

---

### 4. Fuzzy search

**Prompt:**
> "Before writing any code, explain how you would add typo-tolerant search so something like Antverpen still finds Antwerpen-Centraal. Walk me through the approach and trade-offs first."

Asked for the explanation upfront since this was optional and I did not want to break what was already working. Once the approach made sense (edit distance, fallback only, no extra libraries) I gave the go-ahead.

Came out with 16 passing tests including the Antverpen example from the spec.

---

### 5. Config

**Prompt:**
> "There are hardcoded values all over the code like the 15 minute window, cache timings, rate limits, debounce delay and auto-refresh interval. Move them into config.js files so I can change behaviour without touching source code."

Claude created `backend/config.js` and `frontend/src/config.js` and updated all files to import from them.

---

## Honest summary

| | |
|---|---|
| **Accepted** | Backend, tests, fuzzy search, config setup |
| **Reviewed before accepting** | Fuzzy search algorithm and trade-offs |
| **Caught myself** | Skeleton CSS bug and dark/light mode colour issues |
| **Iterated on** | UI layout and theme, went back and forth a couple of times |
