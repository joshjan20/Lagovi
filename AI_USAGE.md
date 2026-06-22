# AI Usage Report

**Tool:** Claude (claude.ai)  

---

## What I used it for

### 1. Backend scaffold
> *"Read the iRail API docs and build an Express API with a single GET /departures?q= endpoint. Handle query validation, station matching, caching, rate limiting, and upstream errors."*

Built the Express backend, iRail client, station matching logic, caching, and unit tests.  
**Verified:** Hit `localhost:3001/departures?q=Antwerpen` in the browser, checked the JSON shape, confirmed filtering and error responses by hand.

---

### 2. React frontend
> *"Build a Vite + React frontend that consumes the /departures endpoint — debounced search input, results grouped by station with delay badges and cancelled state."*

Built the initial React UI.  
**Verified:** Searched several stations in the browser, confirmed the rendered output matched the raw API JSON.

---

### 3. UI redesign + dark/light theme
> *"Redesign the UI to a professional standard. Add a dark/light theme toggle persisted in localStorage, skeleton loading states, live clock, auto-refresh with countdown, and a 'Next' pill on the first upcoming train."*

Full UI redesign with CSS variables, responsive layout, animations, accessibility.  
**Found and fixed:** Skeleton blocks appeared black in both themes — traced to a CSS rule ordering bug, fixed by moving skeleton colours into CSS custom properties.

---

### 4. Fuzzy search 
> *"Before writing any code explain the algorithm and trade-offs for typo-tolerant search so 'Antverpen' finds 'Antwerpen-Centraal'."*

Reviewed the proposed approach (approximate substring edit distance, fallback-only, no new dependency) before approving. Claude then implemented it with a dedicated test file.  
**Verified:** 16 tests passing, including a direct test of the brief's own example.

---

### 5. Config files
> *"Move all magic numbers, window size, cache TTLs, rate limits, debounce, auto-refresh into config.js files so behaviour can be tuned without touching source code."*

Created `backend/config.js` and `frontend/src/config.js`. All consuming files updated to import from config.

---

## What I accepted, changed, or caught

| | |
|---|---|
| **Accepted** | Backend logic, tests, config refactor — after verifying each built and tests passed |
| **Accepted after review** | Fuzzy search — reviewed the algorithm explanation before any code was written |
| **Caught and fixed** | Skeleton CSS bug — spotted visually in the browser, not in code review |
| **Rewritten** | UI changes , dark/light mode bugs |
