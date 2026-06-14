import { useState, useEffect, useRef, useCallback } from "react";
import { api } from "../lib/api.js";
import lurkrIcon from "../assets/lurkr-icon.png";

const GOOGLE_CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID || "";

// modes: "signin" | "signup" | "forgot" | "reset"
export default function AuthScreen({ initialMode = "signin", resetToken = null, onAuthed }) {
  const [mode, setMode] = useState(resetToken ? "reset" : initialMode);
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [notice, setNotice] = useState(null);
  const googleRef = useRef(null);

  const handleGoogle = useCallback(
    async (response) => {
      setError(null);
      setBusy(true);
      try {
        const data = await api("/api/auth/google", { method: "POST", auth: false, body: { credential: response.credential } });
        onAuthed(data.token, data.user);
      } catch (err) {
        setError(String(err.message || err));
      } finally {
        setBusy(false);
      }
    },
    [onAuthed]
  );

  // Render Google Identity Services button (only when a client id is configured).
  useEffect(() => {
    if (!GOOGLE_CLIENT_ID || (mode !== "signin" && mode !== "signup")) return;
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
    setNotice(null);
    setBusy(true);
    try {
      if (mode === "signup") {
        const data = await api("/api/auth/signup", { method: "POST", auth: false, body: { email, password, name } });
        onAuthed(data.token, data.user);
      } else if (mode === "signin") {
        const data = await api("/api/auth/login", { method: "POST", auth: false, body: { email, password } });
        onAuthed(data.token, data.user);
      } else if (mode === "forgot") {
        await api("/api/auth/request-reset", { method: "POST", auth: false, body: { email } });
        setNotice("If an account exists for that email, a reset link is on its way.");
      } else if (mode === "reset") {
        const data = await api("/api/auth/reset-password", { method: "POST", auth: false, body: { token: resetToken, password } });
        onAuthed(data.token, data.user);
      }
    } catch (err) {
      setError(String(err.message || err));
    } finally {
      setBusy(false);
    }
  };

  const switchMode = (m) => { setMode(m); setError(null); setNotice(null); };

  const titles = {
    signin: "Welcome back",
    signup: "Create your account",
    forgot: "Reset your password",
    reset: "Set a new password",
  };
  const subtitles = {
    signin: "Sign in to run intelligence sweeps and see your saved ideas.",
    signup: "Track competitors for your ideas — and let Lurkr watch them daily.",
    forgot: "Enter your email and we'll send a reset link.",
    reset: "Choose a new password for your account.",
  };

  return (
    <main className="min-h-dvh flex items-center justify-center px-4 py-10">
      <section className="reveal panel w-full max-w-md p-6 sm:p-8">
        <div className="flex items-center gap-3 mb-1">
          <img src={lurkrIcon} alt="Lurkr" className="h-10 w-10 rounded-xl shadow-lg shadow-black/40" />
          <h1 className="font-serif text-4xl leading-none tracking-tight">Lurkr</h1>
        </div>
        <p className="font-serif italic text-neutral-400 mb-6">always watching, never blinking</p>

        <h2 className="font-serif text-2xl mb-1">{titles[mode]}</h2>
        <p className="text-sm text-neutral-500 mb-5">{subtitles[mode]}</p>

        {(mode === "signin" || mode === "signup") && GOOGLE_CLIENT_ID && (
          <div className="mb-5">
            <div ref={googleRef} className="flex justify-center [color-scheme:light]" />
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
          {mode !== "reset" && (
            <Field label="Email" value={email} onChange={setEmail} type="email" placeholder="you@example.com" required autoFocus={mode !== "signup"} />
          )}
          {mode !== "forgot" && (
            <Field
              label="Password"
              value={password}
              onChange={setPassword}
              type="password"
              placeholder={mode === "signin" ? "Your password" : "At least 8 characters"}
              required
              autoFocus={mode === "reset"}
            />
          )}

          {error && (
            <p className="text-sm text-red-400 bg-red-950/30 border border-red-900/60 rounded-lg px-3 py-2">{error}</p>
          )}
          {notice && (
            <p className="text-sm text-emerald-300 bg-emerald-950/20 border border-emerald-900/50 rounded-lg px-3 py-2">{notice}</p>
          )}

          <button
            type="submit"
            disabled={busy}
            className="w-full rounded-lg bg-[var(--color-signal)] text-black hover:brightness-110 active:brightness-95 disabled:opacity-40 disabled:cursor-not-allowed px-5 py-2.5 text-sm font-semibold tracking-tight transition"
          >
            {busy ? "…" : mode === "signin" ? "Sign in" : mode === "signup" ? "Create account" : mode === "forgot" ? "Send reset link" : "Update password"}
          </button>
        </form>

        <div className="mt-5 text-sm text-neutral-500 space-y-1.5">
          {mode === "signin" && (
            <>
              <p>New here? <Link onClick={() => switchMode("signup")}>Create an account</Link></p>
              <p>Forgot your password? <Link onClick={() => switchMode("forgot")}>Reset it</Link></p>
            </>
          )}
          {mode === "signup" && (
            <p>Already have an account? <Link onClick={() => switchMode("signin")}>Sign in</Link></p>
          )}
          {(mode === "forgot" || mode === "reset") && (
            <p>Remembered it? <Link onClick={() => switchMode("signin")}>Back to sign in</Link></p>
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
