"use client";

import Link from "next/link";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { FcGoogle } from "react-icons/fc";
import { MdLock } from "react-icons/md";
import { createClient } from "@/app/lib/auth/client";

export default function SignupPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [agreed, setAgreed] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const canSubmit = email.trim().length > 0 && agreed;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!canSubmit) return;
    // Email verification is disabled for now (no email provider). Carry the
    // email forward; the account is created with a password on /create-password.
    setError(null);
    sessionStorage.setItem("jooma:auth-email", email.trim());
    router.push("/create-password");
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
            <h1 className="text-center text-3xl font-medium text-muted mb-6">Jooma</h1>

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
                  className="w-full px-4 py-3 border border-line rounded-xl bg-white text-sm  leading-tight tracking-tight font-medium placeholder-[#A5A5A5] focus:outline-none focus:border-dark transition-colors"
                />
              </div>

              <label className="mt-4 flex items-start gap-2 text-sm text-muted font-light">
                <input
                  type="checkbox"
                  checked={agreed}
                  onChange={(e) => setAgreed(e.target.checked)}
                  className="mt-0.5 w-4 h-4 rounded border-line accent-dark"
                />
                <span>
                  By signing up, you agree to our{" "}
                  <Link href="/terms" className="text-dark hover:underline">
                    Terms of Service
                  </Link>{" "}
                  and{" "}
                  <Link href="/privacy" className="text-dark hover:underline">
                    Privacy Policy
                  </Link>
                  .
                </span>
              </label>

              {error && (
                <p className="mt-3 text-sm text-red-600 font-light">{error}</p>
              )}

              <div className="mt-8 flex justify-center">
                <button
                  type="submit"
                  disabled={!canSubmit}
                  className="px-10 py-3 rounded-xl text-sm font-medium text-white transition-colors disabled:bg-[#F1EFE3] disabled:text-[#A5A5A5] disabled:cursor-default bg-[#030303] hover:bg-black"
                >
                  Sign up with Email
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
              Already have an account?{" "}
              <Link href="/login" className="font-semibold text-dark hover:underline">
                Sign in
              </Link>
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
