"use client";

import Link from "next/link";
import { use, useEffect, useState } from "react";
import { ArrowLeft } from "lucide-react";

const PRESENTON_URL = process.env.NEXT_PUBLIC_PRESENTON_URL ?? "http://localhost:5000";

export default function PresentationEditorPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const [title, setTitle] = useState<string | null>(null);

  useEffect(() => {
    fetch(`/api/presentations/${id}`)
      .then((r) => r.json())
      .then((data) => { if (data?.title) setTitle(data.title); })
      .catch(() => {});
  }, [id]);

  return (
    <div className="flex flex-col h-screen" style={{ backgroundColor: "#F1EFE3" }}>

      {/* Branded top bar */}
      <div
        className="flex items-center justify-between gap-4 px-5 py-3 shrink-0"
        style={{ borderBottom: "1px solid #DAD8D0", backgroundColor: "#F1EFE3" }}
      >
        {/* Left: wordmark + title */}
        <div className="flex items-center gap-3 min-w-0">
          <span className="text-xl font-extrabold shrink-0" style={{ color: "#4a4a4a" }}>
            Jooma
          </span>
          {title && (
            <>
              <span className="text-gray-300 font-light shrink-0">/</span>
              <span className="text-sm font-medium text-gray-600 truncate">{title}</span>
            </>
          )}
        </div>

        {/* Right: back button */}
        <Link
          href="/tools/presentation-generator"
          className="flex items-center gap-1.5 text-sm font-medium text-gray-500 hover:text-gray-800 transition-colors shrink-0"
        >
          <ArrowLeft className="w-4 h-4" />
          Presentations
        </Link>
      </div>

      {/* Editor iframe */}
      <div className="flex-1 min-h-0">
        <iframe
          src={`${PRESENTON_URL}/presentation?id=${id}`}
          className="w-full h-full border-0"
          title="Presentation Editor"
          allow="clipboard-read; clipboard-write"
        />
      </div>

    </div>
  );
}
