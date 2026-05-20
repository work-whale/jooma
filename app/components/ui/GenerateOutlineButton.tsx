"use client";

import { useState } from "react";
import { Loader2, Sparkles } from "lucide-react";

interface GenerateOutlineButtonProps {
  topic: string;
  subject?: string;
  yearGroup?: string;
  onGenerate: (text: string) => void;
}

export default function GenerateOutlineButton({
  topic,
  subject,
  yearGroup,
  onGenerate,
}: GenerateOutlineButtonProps) {
  const [loading, setLoading] = useState(false);
  const disabled = !topic.trim() || loading;

  const handleClick = async () => {
    if (disabled) return;
    setLoading(true);
    onGenerate("");
    try {
      const res = await fetch("/api/generate-outline", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ topic, subject, yearGroup }),
      });
      if (!res.ok) return;
      const reader = res.body!.getReader();
      const decoder = new TextDecoder();
      let accumulated = "";
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        accumulated += decoder.decode(value, { stream: true });
        onGenerate(accumulated);
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={disabled}
      className="flex items-center gap-1.5 text-xs font-medium text-gray-600 border border-gray-300 rounded-lg px-2.5 py-1.5 hover:bg-gray-50 hover:border-gray-400 transition-colors disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
    >
      {loading ? (
        <Loader2 className="w-3 h-3 animate-spin" />
      ) : (
        <Sparkles className="w-3 h-3" />
      )}
      {loading ? "Generating..." : "Generate outline"}
    </button>
  );
}
