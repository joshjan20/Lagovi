const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || "http://localhost:3001";

export class ApiError extends Error {
  constructor(message, { status, code } = {}) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.code = code;
  }
}

/**
 * Fetches departures for stations whose name contains `query`.
 * Throws ApiError on any non-2xx response or network failure.
 */
export async function fetchDepartures(query, { signal } = {}) {
  const url = `${API_BASE_URL}/departures?q=${encodeURIComponent(query)}`;

  let res;
  try {
    res = await fetch(url, { signal });
  } catch (err) {
    if (err.name === "AbortError") throw err;
    throw new ApiError("Could not reach the Lagovia Rail API. Is the backend running?", { status: 0 });
  }

  let body = null;
  try {
    body = await res.json();
  } catch {
    // ignore parse failures, handled below via res.ok check
  }

  if (!res.ok) {
    throw new ApiError(body?.message || `Request failed with status ${res.status}`, {
      status: res.status,
      code: body?.error,
    });
  }

  return body;
}
