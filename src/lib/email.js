// Transactional email via Resend's REST API (no SDK dependency — just fetch).
// Gated on RESEND_API_KEY: when unset (e.g. local dev), we log the link to the
// console and report "not sent" so flows can still be exercised without email.
const RESEND_URL = "https://api.resend.com/emails";

function appUrl() {
  // Where the email links point — the hosted frontend, with a single trailing slash.
  const u = process.env.APP_URL || "https://vimalyad.github.io/lurkr/";
  return u.endsWith("/") ? u : u + "/";
}

async function send({ to, subject, html }) {
  const key = process.env.RESEND_API_KEY;
  const from = process.env.RESEND_FROM || "Lurkr <onboarding@resend.dev>";
  if (!key) {
    console.warn(`[email] RESEND_API_KEY not set — would send "${subject}" to ${to}`);
    return false;
  }
  const res = await fetch(RESEND_URL, {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({ from, to, subject, html }),
  });
  if (!res.ok) {
    throw new Error(`Resend ${res.status}: ${(await res.text()).slice(0, 200)}`);
  }
  return true;
}

const shell = (heading, body, cta, url) => `
  <div style="font-family:ui-sans-serif,system-ui,sans-serif;background:#0a0a0b;color:#ece9e2;padding:32px;border-radius:16px;max-width:480px;margin:auto">
    <h1 style="font-family:Georgia,serif;font-size:28px;margin:0 0 4px">Lurkr</h1>
    <p style="color:#8d8a82;font-size:12px;letter-spacing:.16em;text-transform:uppercase;margin:0 0 24px">always watching, never blinking</p>
    <h2 style="font-size:20px;margin:0 0 12px">${heading}</h2>
    <p style="color:#c9c6be;line-height:1.6;font-size:14px">${body}</p>
    <a href="${url}" style="display:inline-block;margin:20px 0;background:#f5b544;color:#0a0a0b;text-decoration:none;font-weight:600;padding:12px 20px;border-radius:10px">${cta}</a>
    <p style="color:#6b6862;font-size:12px;line-height:1.6">If the button doesn't work, paste this link:<br><span style="color:#8d8a82">${url}</span></p>
  </div>`;

export async function sendVerificationEmail(to, token) {
  const url = `${appUrl()}?verify=${token}`;
  return send({
    to,
    subject: "Verify your Lurkr email",
    html: shell("Confirm your email", "Tap below to verify your address and start running intelligence sweeps.", "Verify email", url),
  });
}

export async function sendResetEmail(to, token) {
  const url = `${appUrl()}?reset=${token}`;
  return send({
    to,
    subject: "Reset your Lurkr password",
    html: shell("Reset your password", "We received a request to reset your password. This link expires in 60 minutes. If you didn't ask for this, ignore this email.", "Set a new password", url),
  });
}
