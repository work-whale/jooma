"use client";

import { useCallback, useMemo, useRef } from "react";
import { Download } from "lucide-react";
import Modal from "@/app/components/Modal";
import { buildPdfHtml } from "@/app/lib/exportUtils";

interface Props {
  markdown: string;
  filename: string;
  onClose: () => void;
}

export default function PdfPreviewModal({ markdown, filename, onClose }: Props) {
  const iframeWindowRef = useRef<Window | null>(null);
  const html = useMemo(() => buildPdfHtml(markdown, filename), [markdown, filename]);

  const iframeCallback = useCallback((iframe: HTMLIFrameElement | null) => {
    if (!iframe) return;
    iframe.srcdoc = html;
    iframe.onload = () => {
      iframeWindowRef.current = iframe.contentWindow;
    };
  }, [html]);

  const handleDownload = () => {
    iframeWindowRef.current?.print();
  };

  return (
    <Modal
      open
      onClose={onClose}
      title="Print Preview"
      width="min(900px, 95vw)"
      height="90dvh"
      actions={
        <button
          type="button"
          onClick={handleDownload}
          className="flex items-center gap-1.5 bg-gray-900 text-white text-sm font-medium px-3 py-1.5 rounded-md hover:bg-gray-800 transition-colors"
        >
          <Download className="w-3.5 h-3.5" />
          Print
        </button>
      }
    >
      <div className="w-full h-full bg-gray-100 p-4">
        <iframe
          ref={iframeCallback}
          title="Print Preview"
          className="w-full h-full rounded border border-gray-200 bg-white"
          style={{ display: "block" }}
        />
      </div>
    </Modal>
  );
}
