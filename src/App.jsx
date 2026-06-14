import { useState, useEffect, useCallback } from "react";
import { api } from "./lib/api.js";
import { getToken, getStoredUser, setSession, clearSession } from "./lib/session.js";
import AuthScreen from "./auth/AuthScreen.jsx";
import Dashboard from "./Dashboard.jsx";
import lurkrIcon from "./assets/lurkr-icon.png";

export default function App() {
  const [phase, setPhase] = useState("loading"); // loading | auth | app
  const [user, setUser] = useState(null);

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

  // Boot: validate any stored session.
  useEffect(() => {
    let active = true;
    (async () => {
      if (!getToken()) {
        if (active) setPhase("auth");
        return;
      }
      // Cached user gives an instant paint; /api/me confirms + refreshes.
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
  }, []);

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

  if (phase === "auth") return <AuthScreen onAuthed={onAuthed} />;

  return <Dashboard user={user} onSignOut={signOut} />;
}
