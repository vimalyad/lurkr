import { useState, useEffect, useRef, useCallback } from "react";
import { Capacitor } from "@capacitor/core";
import { SocialLogin } from "@capgo/capacitor-social-login";
import { api } from "../lib/api.js";
import lurkrIcon from "../assets/lurkr-icon.png";

const GOOGLE_CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID || "";
// Google's web sign-in (GIS) is blocked inside Android WebViews, so on a native
// build we use the native account picker via @capgo/capacitor-social-login; on the
// web we keep the standard GIS button.
const IS_NATIVE = Capacitor.isNativePlatform();

// modes: "signin" | "signup"
export default function AuthScreen({ initialMode = "signin", onAuthed }) {
  const [mode, setMode] = useState(initialMode);
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const googleRef = useRef(null);

  // Send a Google ID token to the backend (same endpoint for web + native).
  const authWithGoogleToken = useCallback(
    async (credential) => {
      if (!credential) throw new Error("No Google credential returned");
      const data = await api("/api/auth/google", { method: "POST", auth: false, body: { credential } });
      onAuthed(data.token, data.user);
    },
    [onAuthed]
  );

  const handleGoogle = useCallback(
    async (response) => {
      setError(null);
      setBusy(true);
      try {
        await authWithGoogleToken(response.credential);
      } catch (err) {
        setError(String(err.message || err));
      } finally {
        setBusy(false);
      }
    },
    [authWithGoogleToken]
  );

  // Native: initialise the social-login plugin once with our web client id.
  useEffect(() => {
    if (!IS_NATIVE || !GOOGLE_CLIENT_ID) return;
    SocialLogin.initialize({ google: { webClientId: GOOGLE_CLIENT_ID } }).catch(() => {});
  }, []);

  const signInWithGoogleNative = useCallback(async () => {
    setError(null);
    setBusy(true);
    try {
      const res = await SocialLogin.login({ provider: "google", options: {} });
      const idToken = res?.result?.idToken || res?.result?.accessToken;
      await authWithGoogleToken(idToken);
    } catch (err) {
      setError(String(err?.message || err));
    } finally {
      setBusy(false);
    }
  }, [authWithGoogleToken]);

  // Web: render the Google Identity Services button (only when configured + not native).
  useEffect(() => {
    if (IS_NATIVE || !GOOGLE_CLIENT_ID) return;
    let cancelled = false;
    const init = () => {
      if (cancelled || !window.google?.accounts?.id || !googleRef.current) return;
      window.google.accounts.id.initialize({ client_id: GOOGLE_CLIENT_ID, callback: handleGoogle });
      googleRef.current.innerHTML = "";
      window.google.accounts.id.renderButton(googleRef.current, {
        theme: "filled_black", size: "large", shape: "pill", text: "continue_with", width: 300,
      });
    };
    if (window.google?.accounts?.id) return init();
    const SID = "gis-script";
    let s = document.getElementById(SID);
    if (!s) {
      s = document.createElement("script");
      s.src = "https://accounts.google.com/gsi/client";
      s.async = true; s.defer = true; s.id = SID;
      document.head.appendChild(s);
    }
    s.addEventListener("load", init);
    return () => { cancelled = true; s && s.removeEventListener("load", init); };
  }, [mode, handleGoogle]);

  const submit = async (e) => {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      const path = mode === "signup" ? "/api/auth/signup" : "/api/auth/login";
      const body = mode === "signup" ? { email, password, name } : { email, password };
      const data = await api(path, { method: "POST", auth: false, body });
      onAuthed(data.token, data.user);
    } catch (err) {
      setError(String(err.message || err));
    } finally {
      setBusy(false);
    }
  };

  const switchMode = (m) => { setMode(m); setError(null); };

  return (
    <main className="min-h-dvh flex items-center justify-center px-4 py-10">
      <section className="reveal panel w-full max-w-md p-6 sm:p-8">
        <div className="flex items-center gap-3 mb-1">
          <img src={lurkrIcon} alt="Lurkr" className="h-10 w-10 rounded-xl shadow-lg shadow-black/40" />
          <h1 className="font-serif text-4xl leading-none tracking-tight">Lurkr</h1>
        </div>
        <p className="font-serif italic text-neutral-400 mb-6">always watching, never blinking</p>

        <h2 className="font-serif text-2xl mb-1">{mode === "signup" ? "Create your account" : "Welcome back"}</h2>
        <p className="text-sm text-neutral-500 mb-5">
          {mode === "signup"
            ? "Track competitors for your ideas — and let Lurkr watch them daily."
            : "Sign in to run intelligence sweeps and see your saved ideas."}
        </p>

        {GOOGLE_CLIENT_ID && (
          <div className="mb-5">
            {IS_NATIVE ? (
              <button
                type="button"
                onClick={signInWithGoogleNative}
                disabled={busy}
                className="w-full flex items-center justify-center gap-2.5 rounded-full bg-white text-black hover:brightness-95 disabled:opacity-40 px-5 py-2.5 text-sm font-medium transition"
              >
                <GoogleGlyph />
                Continue with Google
              </button>
            ) : (
              <div ref={googleRef} className="flex justify-center [color-scheme:light]" />
            )}
            <div className="flex items-center gap-3 my-5">
              <span className="h-px flex-1 bg-white/10" />
              <span className="label">or</span>
              <span className="h-px flex-1 bg-white/10" />
            </div>
          </div>
        )}

        <form onSubmit={submit} className="space-y-3">
          {mode === "signup" && (
            <Field label="Name" value={name} onChange={setName} type="text" placeholder="Optional" autoFocus />
          )}
          <Field label="Email" value={email} onChange={setEmail} type="email" placeholder="you@example.com" required autoFocus={mode === "signin"} />
          <Field label="Password" value={password} onChange={setPassword} type="password" placeholder={mode === "signin" ? "Your password" : "At least 8 characters"} required />

          {error && (
            <p className="text-sm text-red-400 bg-red-950/30 border border-red-900/60 rounded-lg px-3 py-2">{error}</p>
          )}

          <button
            type="submit"
            disabled={busy}
            className="w-full rounded-lg bg-[var(--color-signal)] text-black hover:brightness-110 active:brightness-95 disabled:opacity-40 disabled:cursor-not-allowed px-5 py-2.5 text-sm font-semibold tracking-tight transition"
          >
            {busy ? "…" : mode === "signin" ? "Sign in" : "Create account"}
          </button>
        </form>

        <div className="mt-5 text-sm text-neutral-500">
          {mode === "signin" ? (
            <p>New here? <Link onClick={() => switchMode("signup")}>Create an account</Link></p>
          ) : (
            <p>Already have an account? <Link onClick={() => switchMode("signin")}>Sign in</Link></p>
          )}
        </div>
      </section>
    </main>
  );
}

function Field({ label, value, onChange, type, placeholder, required, autoFocus }) {
  return (
    <label className="block">
      <span className="label mb-1 block">{label}</span>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        required={required}
        autoFocus={autoFocus}
        className="w-full rounded-lg border border-white/10 bg-black/30 px-3.5 py-2.5 text-[15px] outline-none focus:border-[var(--color-signal)]/60 transition-colors placeholder:text-neutral-600"
      />
    </label>
  );
}

function Link({ onClick, children }) {
  return (
    <button type="button" onClick={onClick} className="text-[var(--color-signal)] hover:underline font-medium">
      {children}
    </button>
  );
}

function GoogleGlyph() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden="true">
      <path fill="#4285F4" d="M17.64 9.2c0-.64-.06-1.25-.16-1.84H9v3.48h4.84a4.14 4.14 0 0 1-1.8 2.72v2.26h2.92c1.71-1.57 2.68-3.89 2.68-6.62z" />
      <path fill="#34A853" d="M9 18c2.43 0 4.47-.8 5.96-2.18l-2.92-2.26c-.81.54-1.84.86-3.04.86-2.34 0-4.32-1.58-5.03-3.7H.96v2.33A9 9 0 0 0 9 18z" />
      <path fill="#FBBC05" d="M3.97 10.72A5.4 5.4 0 0 1 3.68 9c0-.6.1-1.18.29-1.72V4.95H.96A9 9 0 0 0 0 9c0 1.45.35 2.83.96 4.05l3.01-2.33z" />
      <path fill="#EA4335" d="M9 3.58c1.32 0 2.5.45 3.44 1.35l2.58-2.58C13.46.89 11.43 0 9 0A9 9 0 0 0 .96 4.95l3.01 2.33C4.68 5.16 6.66 3.58 9 3.58z" />
    </svg>
  );
}
