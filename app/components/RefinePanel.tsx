"use client";

import { useState } from "react";
import { Loader2, Wand2 } from "lucide-react";

interface RefinePanelProps {
  onRefine: (instruction: string) => void;
  isRefining: boolean;
  chips?: string[];
  maxWidth?: boolean;
}

const DEFAULT_CHIPS = [
  "Make more concise",
  "Make longer",
  "Increase the complexity",
  "Reduce the complexity",
  "Add more detail",
  "Translate to French",
];

export default function RefinePanel({ onRefine, isRefining, chips = DEFAULT_CHIPS, maxWidth = true }: RefinePanelProps) {
  const [instruction, setInstruction] = useState("");

  const handleSubmit = () => {
    const trimmed = instruction.trim();
    if (!trimmed || isRefining) return;
    onRefine(trimmed);
    setInstruction("");
  };

  return (
    <div className={`bg-white border border-gray-200 rounded-3xl shadow-sm${maxWidth ? " max-w-7xl mx-auto" : ""}`} style={{ overflow: "clip" }}>
      <div className="flex items-center px-6 py-4 border-b border-gray-200">
        <h3 className="text-sm font-semibold text-gray-900">Refine results</h3>
      </div>

      <div className="px-8 py-6 space-y-4">
        <div className="flex gap-2">
          <input
            type="text"
            value={instruction}
            onChange={(e) => setInstruction(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") handleSubmit(); }}
            placeholder="What would you like to change?"
            disabled={isRefining}
            className="flex-1 border border-gray-200 rounded-xl px-4 py-3 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-gray-300 focus:border-transparent disabled:opacity-50 bg-white"
          />
          <button
            type="button"
            onClick={handleSubmit}
            disabled={!instruction.trim() || isRefining}
            className="flex items-center gap-2 bg-stone-700 text-white text-sm font-semibold px-5 py-3 rounded-xl hover:bg-stone-600 disabled:hover:bg-stone-700 active:bg-stone-800 transition-colors disabled:opacity-50 disabled:cursor-default cursor-pointer shrink-0"
          >
            {isRefining ? <Loader2 className="w-4 h-4 animate-spin" /> : <Wand2 className="w-4 h-4" />}
            {isRefining ? "Refining..." : "Refine"}
          </button>
        </div>

        <div className="flex flex-wrap gap-2">
          {chips.map((chip) => (
            <button
              key={chip}
              type="button"
              onClick={() => setInstruction(chip)}
              disabled={isRefining}
              className="text-xs border border-gray-200 rounded-full px-3 py-1.5 text-gray-600 bg-white hover:bg-gray-50 transition-colors disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
            >
              {chip}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
