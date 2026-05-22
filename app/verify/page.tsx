"use client";

import Image from "next/image";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { MdLock } from "react-icons/md";

const CODE_LENGTH = 6;
const ACCEPTED_CODE = "000000";
const FALLBACK_EMAIL = "your email";

export default function VerifyPage() {
  const router = useRouter();
  const [email, setEmail] = useState(FALLBACK_EMAIL);

  useEffect(() => {
    const stored = sessionStorage.getItem("jooma:auth-email");
    if (stored) setEmail(stored);
  }, []);

  const [digits, setDigits] = useState<string[]>(() => Array(CODE_LENGTH).fill(""));
  const inputsRef = useRef<Array<HTMLInputElement | null>>([]);
  const code = digits.join("");
  const canSubmit = code.length === CODE_LENGTH && digits.every((d) => d !== "");
  const isValid = code === ACCEPTED_CODE;

  const focusInput = (index: number) => {
    inputsRef.current[index]?.focus();
    inputsRef.current[index]?.select();
  };

  const handleChange = (index: number, raw: string) => {
    const value = raw.replace(/\D/g, "").slice(-1);
    setDigits((prev) => {
      const next = [...prev];
      next[index] = value;
      return next;
    });
    if (value && index < CODE_LENGTH - 1) {
      focusInput(index + 1);
    }
  };

  const handleKeyDown = (index: number, e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Backspace" && !digits[index] && index > 0) {
      focusInput(index - 1);
    } else if (e.key === "ArrowLeft" && index > 0) {
      e.preventDefault();
      focusInput(index - 1);
    } else if (e.key === "ArrowRight" && index < CODE_LENGTH - 1) {
      e.preventDefault();
      focusInput(index + 1);
    }
  };

  const handlePaste = (index: number, e: React.ClipboardEvent<HTMLInputElement>) => {
    const pasted = e.clipboardData.getData("text").replace(/\D/g, "").slice(0, CODE_LENGTH - index);
    if (!pasted) return;
    e.preventDefault();
    setDigits((prev) => {
      const next = [...prev];
      for (let i = 0; i < pasted.length; i++) {
        next[index + i] = pasted[i];
      }
      return next;
    });
    const nextFocus = Math.min(index + pasted.length, CODE_LENGTH - 1);
    setTimeout(() => focusInput(nextFocus), 0);
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
          <h1 className="text-center text-3xl font-medium text-muted mb-6">Jooma</h1>

          <div className="mx-auto w-full max-w-110 flex-1 flex flex-col justify-center">
            <div className="text-center mb-8">
              <h2 className="text-4xl font-medium leading-tight tracking-tight">6 digit code</h2>
              <p className="mt-3 text-sm text-muted font-light">
                Please enter the code we&apos;ve sent to{" "}
                <span className="font-semibold text-dark">{email}</span>
              </p>
            </div>

            <form
              onSubmit={(e) => {
                e.preventDefault();
                if (!canSubmit || !isValid) return;
                router.push("/create-password");
              }}
            >
              <div className="flex justify-center gap-2 mb-4">
                {digits.map((digit, i) => (
                  <input
                    key={i}
                    ref={(el) => {
                      inputsRef.current[i] = el;
                    }}
                    type="text"
                    inputMode="numeric"
                    autoComplete="one-time-code"
                    maxLength={1}
                    value={digit}
                    onChange={(e) => handleChange(i, e.target.value)}
                    onKeyDown={(e) => handleKeyDown(i, e)}
                    onPaste={(e) => handlePaste(i, e)}
                    onFocus={(e) => e.target.select()}
                    aria-label={`Digit ${i + 1}`}
                    className="w-12 h-14 text-center text-xl font-medium border border-line rounded-xl bg-white focus:outline-none focus:border-dark transition-colors"
                  />
                ))}
              </div>

              <div className="text-center mb-8">
                <button
                  type="button"
                  className="text-sm font-semibold text-dark hover:underline"
                >
                  Resend code
                </button>
              </div>

              <div className="flex justify-center">
                <button
                  type="submit"
                  disabled={!canSubmit}
                  className="px-10 py-3 rounded-xl text-sm font-medium text-white transition-colors disabled:bg-[#F1EFE3] disabled:text-[#A5A5A5] disabled:cursor-default bg-[#030303] hover:bg-black"
                >
                  Submit
                </button>
              </div>
            </form>
          </div>

          <div className="mx-auto w-full max-w-100 flex items-center gap-3 rounded-2xl border border-line p-4">
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
        </div>
      </div>
    </div>
  );
}
