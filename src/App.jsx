import { useState, useEffect, useCallback } from "react";
import { api } from "./lib/api.js";
import { getToken, getStoredUser, setSession, clearSession } from "./lib/session.js";
import AuthScreen from "./auth/AuthScreen.jsx";
import Dashboard from "./Dashboard.jsx";
import lurkrIcon from "./assets/lurkr-icon.png";

// Pull (and then strip) ?verify= / ?reset= tokens from the email-link URL.
function readLinkTokens() {
  try {
    const q = new URLSearchParams(window.location.search);
    const verify = q.get("verify");
    const reset = q.get("reset");
    if (verify || reset) {
      window.history.replaceState({}, "", window.location.pathname);
    }
    return { verify, reset };
  } catch {
    return { verify: null, reset: null };
  }
}

export default function App() {
  const [phase, setPhase] = useState("loading"); // loading | auth | app
  const [user, setUser] = useState(null);
  const [links] = useState(readLinkTokens);
  const [verifyMsg, setVerifyMsg] = useState(null);

  const onAuthed = useCallback((token, u) => {
    setSession(token, u);
    setUser(u);
    setPhase("app");
  }, []);

  const signOut = useCallback(() => {
    clearSession();
    setUser(null);
    setPhase("auth");
  }, []);

  // Boot: handle a verify link, else validate any stored session.
  useEffect(() => {
    let active = true;
    (async () => {
      if (links.verify) {
        try {
          const data = await api("/api/auth/verify-email", { method: "POST", auth: false, body: { token: links.verify } });
          if (!active) return;
          setVerifyMsg({ ok: true, text: "Email verified — you're all set." });
          onAuthed(data.token, data.user);
          return;
        } catch (err) {
          if (!active) return;
          setVerifyMsg({ ok: false, text: String(err.message || err) });
          // fall through to normal session check / auth screen
        }
      }
      if (links.reset) {
        if (active) setPhase("auth");
        return;
      }
      if (!getToken()) {
        if (active) setPhase("auth");
        return;
      }
      // cached user gives instant paint; /api/me confirms + refreshes.
      const cached = getStoredUser();
      if (cached && active) { setUser(cached); setPhase("app"); }
      try {
        const data = await api("/api/me");
        if (!active) return;
        setSession(null, data.user);
        setUser(data.user);
        setPhase("app");
      } catch {
        if (!active) return;
        clearSession();
        setUser(null);
        setPhase("auth");
      }
    })();
    return () => { active = false; };
  }, [links, onAuthed]);

  // Any 401 anywhere bounces back to sign-in.
  useEffect(() => {
    const onUnauthorized = () => { setUser(null); setPhase("auth"); };
    window.addEventListener("lurkr:unauthorized", onUnauthorized);
    return () => window.removeEventListener("lurkr:unauthorized", onUnauthorized);
  }, []);

  if (phase === "loading") {
    return (
      <main className="min-h-dvh flex items-center justify-center">
        <div className="flex items-center gap-3 text-neutral-500">
          <img src={lurkrIcon} alt="" className="h-8 w-8 rounded-lg opacity-80" />
          <span className="label !text-[var(--color-signal)] animate-pulse">waking the watcher…</span>
        </div>
      </main>
    );
  }

  if (phase === "auth") {
    return (
      <>
        {verifyMsg && !verifyMsg.ok && (
          <p className="reveal mx-auto mt-6 max-w-md text-center text-sm text-red-400 bg-red-950/30 border border-red-900/60 rounded-lg px-3 py-2">
            {verifyMsg.text}
          </p>
        )}
        <AuthScreen initialMode={links.reset ? "reset" : "signin"} resetToken={links.reset} onAuthed={onAuthed} />
      </>
    );
  }

  // Signed in but email not verified → gate with a verify notice.
  if (user && !user.emailVerified) {
    return <VerifyNotice user={user} onSignOut={signOut} onVerified={setUser} />;
  }

  return <Dashboard user={user} onSignOut={signOut} />;
}

function VerifyNotice({ user, onSignOut, onVerified }) {
  const [sending, setSending] = useState(false);
  const [msg, setMsg] = useState(null);
  const [checking, setChecking] = useState(false);

  const resend = async () => {
    setSending(true); setMsg(null);
    try {
      await api("/api/auth/resend-verification", { method: "POST" });
      setMsg("Verification email sent — check your inbox.");
    } catch (err) {
      setMsg(String(err.message || err));
    } finally { setSending(false); }
  };

  const recheck = async () => {
    setChecking(true); setMsg(null);
    try {
      const data = await api("/api/me");
      setSession(null, data.user);
      if (data.user.emailVerified) onVerified(data.user);
      else setMsg("Not verified yet — tap the link in your email.");
    } catch (err) {
      setMsg(String(err.message || err));
    } finally { setChecking(false); }
  };

  return (
    <main className="min-h-dvh flex items-center justify-center px-4 py-10">
      <section className="reveal panel w-full max-w-md p-6 sm:p-8 text-center">
        <img src={lurkrIcon} alt="Lurkr" className="h-12 w-12 rounded-xl mx-auto mb-4 shadow-lg shadow-black/40" />
        <h2 className="font-serif text-2xl mb-2">Verify your email</h2>
        <p className="text-sm text-neutral-400 leading-relaxed">
          We sent a verification link to <span className="text-neutral-200">{user.email}</span>. Tap it to start running intelligence sweeps.
        </p>
        {msg && <p className="mt-4 text-sm text-neutral-300 bg-white/5 border border-white/10 rounded-lg px-3 py-2">{msg}</p>}
        <div className="mt-6 flex flex-col gap-2">
          <button onClick={recheck} disabled={checking} className="rounded-lg bg-[var(--color-signal)] text-black hover:brightness-110 disabled:opacity-40 px-5 py-2.5 text-sm font-semibold tracking-tight transition">{checking ? "Checking…" : "I've verified — continue"}</button>
          <button onClick={resend} disabled={sending} className="rounded-lg border border-white/10 hover:bg-white/5 disabled:opacity-40 px-5 py-2.5 text-sm font-medium transition">{sending ? "Sending…" : "Resend email"}</button>
          <button onClick={onSignOut} className="label hover:text-red-400 transition-colors mt-1">Sign out</button>
        </div>
      </section>
    </main>
  );
}
