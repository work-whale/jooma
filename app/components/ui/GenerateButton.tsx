"use client";

import { Loader2, Sparkles } from "lucide-react";

interface Props {
  onClick: () => void;
  disabled: boolean;
  isGenerating: boolean;
  hasResult: boolean;
}

export default function GenerateButton({ onClick, disabled, isGenerating, hasResult }: Props) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="flex-1 bg-stone-700 text-white py-3 px-6 rounded-xl text-sm font-semibold hover:bg-stone-600 disabled:hover:bg-stone-700 active:bg-stone-800 transition-colors disabled:opacity-50 disabled:cursor-default cursor-pointer flex items-center justify-center gap-2"
    >
      {isGenerating
        ? <><Loader2 className="w-4 h-4 animate-spin" />Generating...</>
        : <><Sparkles className="w-4 h-4" />{hasResult ? "Regenerate" : "Generate"}</>}
    </button>
  );
}
