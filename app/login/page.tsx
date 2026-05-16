"use client";

import Link from "next/link";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { FcGoogle } from "react-icons/fc";
import { FaApple, FaLinkedinIn } from "react-icons/fa";
import { MdLock } from "react-icons/md";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const canSubmit = email.trim().length > 0;

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

            <div className="flex justify-center gap-3 mb-6">
              <SsoButton label="Continue with Google">
                <FcGoogle className="w-7 h-7" />
              </SsoButton>
              <SsoButton label="Continue with Apple">
                <FaApple className="w-7 h-7 text-dark" />
              </SsoButton>
              <SsoButton label="Continue with Microsoft">
                <MicrosoftIcon className="w-7 h-7" />
              </SsoButton>
              <SsoButton label="Continue with LinkedIn">
                <span className="w-7 h-7 rounded-sm bg-[#0A66C2] flex items-center justify-center">
                  <FaLinkedinIn className="w-5 h-5 text-white" />
                </span>
              </SsoButton>
            </div>

            <div className="flex items-center gap-3 mb-6">
              <div className="h-px bg-line flex-1" />
              <span className="text-xs text-muted">or</span>
              <div className="h-px bg-line flex-1" />
            </div>

            <form
              onSubmit={(e) => {
                e.preventDefault();
                if (!canSubmit) return;
                sessionStorage.setItem("jooma:auth-email", email.trim());
                router.push("/verify");
              }}
            >
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

              <div className="mt-8 flex justify-center">
                <button
                  type="submit"
                  disabled={!canSubmit}
                  className="px-10 py-3 rounded-xl text-sm font-medium text-white transition-colors disabled:bg-[#F1EFE3] disabled:text-[#A5A5A5] disabled:cursor-default bg-[#030303] hover:bg-black"
                >
                  Sign in with Email
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

function SsoButton({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      className="w-14 h-14 rounded-full bg-transparent border border-line flex items-center justify-center hover:border-dark transition-colors"
    >
      {children}
    </button>
  );
}

function MicrosoftIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 23 23" className={className} aria-hidden="true">
      <rect width="10" height="10" x="1" y="1" fill="#F25022" />
      <rect width="10" height="10" x="12" y="1" fill="#7FBA00" />
      <rect width="10" height="10" x="1" y="12" fill="#00A4EF" />
      <rect width="10" height="10" x="12" y="12" fill="#FFB900" />
    </svg>
  );
}
