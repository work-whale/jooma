"use client";

import { ArrowRight, Loader2 } from "lucide-react";

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
      // How Jo's activity panel finds this button to offer "Generate this now?".
      // The panel clicks the real control rather than calling handleGenerate,
      // which lives inside each of the 35 forms as a local closure. That keeps
      // `disabled` below the single source of truth on whether a generation may
      // start, and means there is no second path into one to keep in step.
      data-jo-generate=""
      onClick={onClick}
      disabled={disabled}
      className="flex-1 bg-(--j-purple) text-white py-3 px-6 rounded-xl text-sm font-semibold hover:bg-(--j-deep) disabled:hover:bg-(--j-purple) active:bg-(--j-deep) transition-colors disabled:opacity-50 disabled:cursor-default cursor-pointer flex items-center justify-center gap-2"
    >
      {isGenerating
        ? <><Loader2 className="w-4 h-4 animate-spin" />Generating...</>
        : <><ArrowRight className="w-4 h-4" />{hasResult ? "Regenerate" : "Generate"}</>}
    </button>
  );
}
