"use client";

import Link from "next/link";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { FcGoogle } from "react-icons/fc";
import { MdLock } from "react-icons/md";
import { Eye, EyeOff } from "lucide-react";
import { createClient } from "@/app/lib/auth/client";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const canSubmit = email.trim().length > 0 && password.length > 0 && !loading;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canSubmit) return;
    setError(null);
    setLoading(true);
    const supabase = createClient();
    const { error } = await supabase.auth.signInWithPassword({
      email: email.trim(),
      password,
    });
    if (error) {
      setError("Incorrect email or password.");
      setLoading(false);
      return;
    }
    router.push("/");
    router.refresh();
  };

  const handleGoogle = async () => {
    setError(null);
    const supabase = createClient();
    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: `${window.location.origin}/auth/callback` },
    });
    if (error) setError("Could not start Google sign-in.");
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
          <div className="mx-auto w-full max-w-100 flex-1 flex flex-col justify-center">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/logo/logo.svg" alt="Jooma" className="mx-auto mb-6" style={{ height: 34, width: "auto" }} />

            <div className="text-center mb-8">
              <h2 className="text-4xl font-medium leading-tight tracking-tight">
                Save hours
                <br />
                of planning time
              </h2>
              <p className="mt-3 text-sm text-muted font-light">
                Create differentiated lessons instantly with AI.
              </p>
            </div>

            <button
              type="button"
              onClick={handleGoogle}
              className="w-full flex items-center justify-center gap-3 py-3 rounded-xl bg-white border border-line text-sm font-medium hover:border-dark transition-colors mb-6"
            >
              <FcGoogle className="w-5 h-5" />
              Continue with Google
            </button>

            <div className="flex items-center gap-3 mb-6">
              <div className="h-px bg-line flex-1" />
              <span className="text-xs text-muted">or</span>
              <div className="h-px bg-line flex-1" />
            </div>

            <form onSubmit={handleSubmit}>
              <div>
                <label htmlFor="email" className="block text-sm mb-2 leading-tight tracking-tight font-medium">
                  Email
                </label>
                <input
                  id="email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="Enter your email"
                  className="w-full px-4 py-3 border border-line rounded-xl bg-white text-sm font-light placeholder-[#A5A5A5] focus:outline-none focus:border-dark transition-colors"
                />
              </div>

              <div className="mt-4">
                <label htmlFor="password" className="block text-sm mb-2 leading-tight tracking-tight font-medium">
                  Password
                </label>
                <div className="relative">
                  <input
                    id="password"
                    type={showPassword ? "text" : "password"}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="Enter your password"
                    autoComplete="current-password"
                    className="w-full pl-4 pr-12 py-3 border border-line rounded-xl bg-white text-sm font-light placeholder-[#A5A5A5] focus:outline-none focus:border-dark transition-colors"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((v) => !v)}
                    aria-label={showPassword ? "Hide password" : "Show password"}
                    className="absolute right-3 top-1/2 -translate-y-1/2 w-8 h-8 flex items-center justify-center text-muted hover:text-dark"
                  >
                    {showPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                  </button>
                </div>
              </div>

              {error && (
                <p className="mt-3 text-sm text-red-600 font-light">{error}</p>
              )}

              <div className="mt-8 flex justify-center">
                <button
                  type="submit"
                  disabled={!canSubmit}
                  className="px-10 py-3 rounded-xl text-sm font-medium text-white transition-colors disabled:bg-[#F1EFE3] disabled:text-[#A5A5A5] disabled:cursor-default bg-[#030303] hover:bg-black"
                >
                  {loading ? "Signing in…" : "Sign in with Email"}
                </button>
              </div>
            </form>

            <div className="mt-8 flex items-center gap-3 rounded-2xl border border-line p-4">
              <span className="w-9 h-9 rounded-lg bg-emerald-100 text-emerald-700 flex items-center justify-center shrink-0">
                <MdLock className="w-5 h-5" />
              </span>
              <div>
                <p className="text-sm font-medium">Secure & GDPR compliant</p>
                <p className="text-xs text-muted font-light">
                  Your privacy matters — we protect your data
                </p>
              </div>
            </div>

            <p className="mt-6 text-center text-sm text-muted">
              Don&apos;t have an account?{" "}
              <Link href="/signup" className="font-semibold text-dark hover:underline">
                Sign up
              </Link>
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
