"use client";

import { useEffect, useState } from "react";
import { Sparkles, Loader2, X, Lightbulb, CheckSquare, Pencil } from "lucide-react";

export type ActivityType = "comprehension" | "true-false" | "gap-fills";

const ACTIVITY_TYPES: { id: ActivityType; label: string; icon: React.ReactNode }[] = [
  { id: "comprehension", label: "Comprehension", icon: <Lightbulb className="w-3.5 h-3.5" /> },
  { id: "true-false", label: "True/False", icon: <CheckSquare className="w-3.5 h-3.5" /> },
  { id: "gap-fills", label: "Gap fills", icon: <Pencil className="w-3.5 h-3.5" /> },
];

interface Props {
  initialActivityType?: ActivityType;
  onClose: () => void;
  onSubmit: (opts: { activityType: ActivityType; additionalInstructions: string }) => Promise<void>;
}

export default function EditAudioPanel({ initialActivityType = "comprehension", onClose, onSubmit }: Props) {
  const [activityType, setActivityType] = useState<ActivityType>(initialActivityType);
  const [additionalInstructions, setAdditionalInstructions] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const h = (e: KeyboardEvent) => { if (e.key === "Escape" && !busy) onClose(); };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [busy, onClose]);

  const handleSubmit = async () => {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      await onSubmit({ activityType, additionalInstructions: additionalInstructions.trim() });
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to update audio");
      setBusy(false);
    }
  };

  return (
    <div
      className="fixed top-0 right-0 bottom-0 w-96 bg-white shadow-2xl border-l z-100 flex flex-col"
      style={{ borderColor: "#DAD8D0" }}
      onMouseDown={(e) => e.stopPropagation()}
    >
      <div className="flex items-center justify-between px-5 py-4 border-b" style={{ borderColor: "#DAD8D0" }}>
        <h3 className="text-base font-bold" style={{ color: "#1a1a1a" }}>Edit audio</h3>
        <button
          onClick={onClose}
          disabled={busy}
          className="p-1 rounded-lg text-gray-400 hover:bg-gray-100 hover:text-gray-700 disabled:opacity-40"
          aria-label="Close"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto px-5 py-5 space-y-5">
        <div>
          <p className="text-sm font-bold mb-2" style={{ color: "#1a1a1a" }}>Type of activity</p>
          <div className="flex flex-wrap gap-2">
            {ACTIVITY_TYPES.map((a) => {
              const selected = activityType === a.id;
              return (
                <button
                  key={a.id}
                  type="button"
                  onClick={() => setActivityType(a.id)}
                  disabled={busy}
                  className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-full border transition-colors disabled:opacity-50"
                  style={
                    selected
                      ? { backgroundColor: "#1a1a1a", borderColor: "#1a1a1a", color: "#fff" }
                      : { backgroundColor: "#fff", borderColor: "#DAD8D0", color: "#1a1a1a" }
                  }
                >
                  {a.icon}
                  {a.label}
                </button>
              );
            })}
          </div>
        </div>

        <div>
          <p className="text-sm font-bold mb-2" style={{ color: "#1a1a1a" }}>
            Additional instructions <span className="text-gray-400 font-normal">(optional)</span>
          </p>
          <textarea
            value={additionalInstructions}
            onChange={(e) => setAdditionalInstructions(e.target.value)}
            placeholder="E.g. Include key vocabulary from my lesson..."
            rows={5}
            disabled={busy}
            className="w-full px-3 py-2 text-sm bg-white border rounded-xl focus:outline-none focus:ring-2 focus:ring-violet-200 disabled:opacity-60 resize-none"
            style={{ borderColor: "#DAD8D0" }}
          />
        </div>

        {error && <p className="text-xs text-red-600">{error}</p>}
      </div>

      <div className="px-5 py-4 border-t" style={{ borderColor: "#DAD8D0" }}>
        <button
          type="button"
          onClick={handleSubmit}
          disabled={busy}
          className="w-full flex items-center justify-center gap-2 px-4 py-3 text-sm font-bold rounded-xl transition-colors disabled:opacity-50"
          style={{ backgroundColor: "#0f5f3a", color: "#fff" }}
        >
          {busy ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin" />
              Regenerating…
            </>
          ) : (
            <>
              <Sparkles className="w-4 h-4" />
              Edit audio
            </>
          )}
        </button>
      </div>
    </div>
  );
}
