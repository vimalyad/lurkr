// Auth primitives — zero external deps, all from Node's built-in crypto + fetch.
//   • password hashing via scrypt (salted, timing-safe verify)
//   • stateless sessions via HMAC-SHA256 JWTs (no jsonwebtoken dependency)
//   • Google sign-in verification via Google's tokeninfo endpoint (no google-auth-library)
import { randomBytes, scrypt, timingSafeEqual, createHmac } from "node:crypto";
import { promisify } from "node:util";

const scryptAsync = promisify(scrypt);
const SCRYPT_KEYLEN = 64;

// ── Passwords ─────────────────────────────────────────────────────────────────
export async function hashPassword(password) {
  const salt = randomBytes(16).toString("hex");
  const derived = await scryptAsync(password, salt, SCRYPT_KEYLEN);
  return `scrypt:${salt}:${derived.toString("hex")}`;
}

export async function verifyPassword(password, stored) {
  if (!stored || !stored.startsWith("scrypt:")) return false;
  const [, salt, hashHex] = stored.split(":");
  const expected = Buffer.from(hashHex, "hex");
  const derived = await scryptAsync(password, salt, SCRYPT_KEYLEN);
  return expected.length === derived.length && timingSafeEqual(expected, derived);
}

// ── JWT (HS256) ──────────────────────────────────────────────────────────────────
const b64url = (buf) =>
  Buffer.from(buf).toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
const b64urlJson = (obj) => b64url(JSON.stringify(obj));

function secret() {
  const s = process.env.JWT_SECRET;
  if (!s) throw new Error("JWT_SECRET not configured");
  return s;
}

export function signJwt(payload, { expiresInSec = 60 * 60 * 24 * 30 } = {}) {
  const now = Math.floor(Date.now() / 1000);
  const body = { ...payload, iat: now, exp: now + expiresInSec };
  const head = b64urlJson({ alg: "HS256", typ: "JWT" });
  const data = `${head}.${b64urlJson(body)}`;
  const sig = createHmac("sha256", secret()).update(data).digest();
  return `${data}.${b64url(sig)}`;
}

export function verifyJwt(token) {
  if (!token || typeof token !== "string") return null;
  const parts = token.split(".");
  if (parts.length !== 3) return null;
  const [head, body, sig] = parts;
  const expected = b64url(createHmac("sha256", secret()).update(`${head}.${body}`).digest());
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  let payload;
  try {
    payload = JSON.parse(Buffer.from(body.replace(/-/g, "+").replace(/_/g, "/"), "base64").toString("utf8"));
  } catch {
    return null;
  }
  if (payload.exp && Math.floor(Date.now() / 1000) > payload.exp) return null;
  return payload;
}

// ── One-time tokens (email verify / password reset) ────────────────────────────
export function randomToken() {
  return randomBytes(32).toString("hex");
}

// ── Google sign-in ─────────────────────────────────────────────────────────────
// The frontend (Google Identity Services) hands us an ID token; we validate it
// against Google's tokeninfo endpoint and confirm the audience is our client.
export async function verifyGoogleIdToken(idToken) {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  if (!clientId) throw new Error("GOOGLE_CLIENT_ID not configured");
  if (!idToken) throw new Error("Missing Google credential");

  const res = await fetch(`https://oauth2.googleapis.com/tokeninfo?id_token=${encodeURIComponent(idToken)}`);
  if (!res.ok) throw new Error("Invalid Google credential");
  const info = await res.json();

  if (info.aud !== clientId) throw new Error("Google credential audience mismatch");
  if (!info.email) throw new Error("Google credential has no email");
  if (info.email_verified !== true && info.email_verified !== "true") {
    throw new Error("Google email not verified");
  }
  return { email: String(info.email).toLowerCase(), name: info.name || info.given_name || null };
}

// ── Validation helpers ───────────────────────────────────────────────────────────
export function isValidEmail(email) {
  return typeof email === "string" && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
}

export function passwordProblem(password) {
  if (typeof password !== "string" || password.length < 8) return "Password must be at least 8 characters.";
  if (password.length > 200) return "Password is too long.";
  return null;
}
