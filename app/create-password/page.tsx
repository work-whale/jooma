"use client";

import Image from "next/image";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Eye, EyeOff, Info } from "lucide-react";
import { createClient } from "@/app/lib/auth/client";

export default function CreatePasswordPage() {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const rules = {
    length: password.length >= 8,
    upper: /[A-Z]/.test(password),
    number: /\d/.test(password),
    special: /[^A-Za-z0-9]/.test(password),
  };
  const meetsRules = Object.values(rules).every(Boolean);
  const matches = password.length > 0 && password === confirm;
  const canSubmit = meetsRules && matches && !loading;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canSubmit) return;
    setError(null);
    setLoading(true);
    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (user) {
      // Already signed in (e.g. via Google) — just attach a password.
      const { error } = await supabase.auth.updateUser({ password });
      if (error) {
        setError("Could not set your password. Please try again.");
        setLoading(false);
        return;
      }
    } else {
      // Email sign-up: create the account now. Requires "Confirm email" to be
      // OFF in Supabase so the session is active immediately (no email yet).
      const email = sessionStorage.getItem("jooma:auth-email");
      if (!email) {
        setError("Your session expired. Please sign up again.");
        setLoading(false);
        return;
      }
      const { data: signUpData, error } = await supabase.auth.signUp({ email, password });
      if (error) {
        console.error("signUp error:", error.message, error.status);
        const msg = error.message.toLowerCase();
        setError(
          msg.includes("already") || msg.includes("registered")
            ? "An account with this email already exists. Try signing in."
            : msg.includes("rate") || msg.includes("limit")
            ? "Too many attempts — please wait a moment and try again."
            : msg.includes("email") && msg.includes("confirm")
            ? "Email confirmation is required. Please disable it in your Supabase Auth settings."
            : error.message,
        );
        setLoading(false);
        return;
      }
      // Stash the session tokens so complete-profile can recover them if the
      // cookie hasn't propagated by the time the page mounts.
      if (signUpData.session) {
        sessionStorage.setItem("jooma:auth-token", signUpData.session.access_token);
        sessionStorage.setItem("jooma:auth-refresh", signUpData.session.refresh_token ?? "");
      }
    }
    router.push("/complete-profile");
  };

  return (
    <div className="min-h-screen p-6 flex" style={{ backgroundColor: "#F1EFE3" }}>
      <div className="w-full max-w-9xl mx-auto grid gap-6 lg:grid-cols-2">
        {/* Illustration panel */}
        <div
          className="rounded-3xl p-10 flex items-center justify-center"
          style={{ backgroundColor: "#E8E6D9" }}
        >
          <Image
            src="/svgs/teacher.svg"
            alt=""
            width={467}
            height={662}
            priority
            className="w-auto h-full max-h-full object-contain"
          />
        </div>

        {/* Form panel */}
        <div
          className="rounded-3xl px-10 py-12 flex flex-col"
          style={{ backgroundColor: "#FAF9F5" }}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/logo/logo.svg" alt="Jooma" className="mx-auto mb-6" style={{ height: 34, width: "auto" }} />

          <div className="mx-auto w-full max-w-110 flex-1 flex flex-col justify-center">
            <div className="text-center mb-8">
              <h2 className="text-4xl font-medium leading-tight tracking-tight">
                Create your password
              </h2>
              <p className="mt-3 text-sm text-muted font-light">
                Create a secure password to finish setting up your account.
              </p>
            </div>

            <form onSubmit={handleSubmit}>
              <div>
                <label
                  htmlFor="password"
                  className="block text-sm mb-2 leading-tight tracking-tight font-medium"
                >
                  Password
                </label>
                <PasswordField
                  id="password"
                  value={password}
                  onChange={setPassword}
                  visible={showPassword}
                  onToggleVisible={() => setShowPassword((v) => !v)}
                />
                <p className="mt-2 flex items-center gap-1.5 text-xs text-muted font-light">
                  <Info className="w-3.5 h-3.5 shrink-0" />
                  At least 8 characters, 1 uppercase letter, 1 number, and 1 special character.
                </p>
              </div>

              <div className="mt-6">
                <label
                  htmlFor="confirm"
                  className="block text-sm mb-2 leading-tight tracking-tight font-medium"
                >
                  Confirm password
                </label>
                <PasswordField
                  id="confirm"
                  value={confirm}
                  onChange={setConfirm}
                  visible={showConfirm}
                  onToggleVisible={() => setShowConfirm((v) => !v)}
                />
              </div>

              {error && (
                <p className="mt-6 text-center text-sm text-red-600 font-light">{error}</p>
              )}

              <div className="mt-8 flex justify-center">
                <button
                  type="submit"
                  disabled={!canSubmit}
                  className="px-10 py-3 rounded-xl text-sm font-medium text-white transition-colors disabled:bg-[#F1EFE3] disabled:text-[#A5A5A5] disabled:cursor-default bg-[#030303] hover:bg-black"
                >
                  {loading ? "Saving…" : "Submit"}
                </button>
              </div>
            </form>
          </div>
        </div>
      </div>
    </div>
  );
}

function PasswordField({
  id,
  value,
  onChange,
  visible,
  onToggleVisible,
}: {
  id: string;
  value: string;
  onChange: (next: string) => void;
  visible: boolean;
  onToggleVisible: () => void;
}) {
  // When hidden, render `*` × length as a text field and diff changes back into the real value.
  // Default `type="password"` masks with the browser's bullet glyph (•), which can render small
  // at our 14px size — explicit asterisks are larger and more legible.
  const displayValue = visible ? value : "*".repeat(value.length);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const next = e.target.value;
    if (visible) {
      onChange(next);
      return;
    }
    if (next.length > value.length) {
      onChange(value + next.slice(value.length));
    } else if (next.length < value.length) {
      onChange(value.slice(0, next.length));
    }
  };

  return (
    <div className="relative">
      <input
        id={id}
        type="text"
        value={displayValue}
        onChange={handleChange}
        placeholder="Enter your password"
        autoComplete="new-password"
        spellCheck={false}
        className="w-full pl-4 pr-12 py-3 border border-line rounded-xl bg-white text-sm leading-tight tracking-tight font-medium placeholder-[#A5A5A5] placeholder:font-light focus:outline-none focus:border-dark transition-colors"
      />
      <button
        type="button"
        onClick={onToggleVisible}
        aria-label={visible ? "Hide password" : "Show password"}
        className="absolute right-3 top-1/2 -translate-y-1/2 w-8 h-8 flex items-center justify-center text-muted hover:text-dark"
      >
        {visible ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
      </button>
    </div>
  );
}
