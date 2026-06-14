// Thin fetch wrapper: attaches the Bearer token, parses JSON, and normalises errors.
// On a 401 it clears the session and dispatches `lurkr:unauthorized` so the app can
// bounce back to the sign-in screen from anywhere.
import { getToken, clearSession } from "./session.js";

// Backend base URL. Empty in browser dev (Vite proxies /api → Express).
// Baked at build time for the hosted frontend / APK via VITE_API_URL.
const API = import.meta.env.VITE_API_URL ?? "";

export async function api(path, { method = "GET", body, auth = true } = {}) {
  const headers = { "Content-Type": "application/json" };
  if (auth) {
    const t = getToken();
    if (t) headers.Authorization = `Bearer ${t}`;
  }
  const res = await fetch(`${API}${path}`, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });

  let data;
  try { data = await res.json(); } catch { data = {}; }

  if (res.status === 401) {
    clearSession();
    try { window.dispatchEvent(new Event("lurkr:unauthorized")); } catch {}
  }
  if (!res.ok || data.ok === false) {
    const err = new Error(data.error || `Request failed (${res.status})`);
    err.status = res.status;
    throw err;
  }
  return data;
}
