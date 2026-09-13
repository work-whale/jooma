"use client";

import { useState } from "react";
import type { DropdownItem } from "@/app/components/ui/DropdownMenu";
import { exportToDocx, exportToPdf, buildPdfHtml } from "@/app/lib/exportUtils";

/*
 * What you can do with a finished document, independent of where it is shown.
 *
 * These lived inside ResultPanel, which was fine while the tool page was the
 * only place a generation appeared. The focused reading view shows the same
 * document with the same copy and export actions, and passing five handlers
 * plus three pieces of UI state down as props would have been the wrong shape:
 * a second format would then have to be added in two places.
 *
 * Same idea as useOutline, which is one brain behind the outline's several
 * presentations.
 *
 * Deliberately NOT included here: anything that writes. Saving a run to history
 * belongs to the panel that generated it, not to a view that is only reading.
 */

export interface DocumentActions {
  /** True for two seconds after a successful copy, for the button's label. */
  copied: boolean;
  /** Which export is currently building, for the trigger's spinner. */
  isExporting: "docx" | "pdf" | null;
  /** Set when an export failed, to be shown near the actions. */
  exportError: string | null;
  handleCopy: () => Promise<void>;
  /** Ready to hand to DropdownMenu: PDF, Word, Google Docs, then Print. */
  exportItems: DropdownItem[];
}

export function useDocumentActions(
  markdown: string,
  filename: string,
  /** Icons are supplied by the caller so this module stays free of JSX and can
   *  remain a .ts file, and so each surface can size its own icons. */
  icons: {
    pdf: React.ReactNode;
    docx: React.ReactNode;
    googleDocs: React.ReactNode;
    print: React.ReactNode;
  },
): DocumentActions {
  const [copied, setCopied] = useState(false);
  const [isExporting, setIsExporting] = useState<"docx" | "pdf" | null>(null);
  const [exportError, setExportError] = useState<string | null>(null);

  const handleCopy = async () => {
    await navigator.clipboard.writeText(markdown);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleExportDocx = async () => {
    setIsExporting("docx");
    setExportError(null);
    try {
      await exportToDocx(markdown, filename);
    } catch {
      setExportError("Couldn't build that Word document. Please try again.");
    } finally {
      setIsExporting(null);
    }
  };

  /** A real .pdf file. Distinct from Print below, which opens the print dialog. */
  const handleExportPdf = async () => {
    setIsExporting("pdf");
    setExportError(null);
    try {
      await exportToPdf(markdown, filename);
    } catch {
      // Rendering a long document to canvas can fail on very large outputs, and
      // a silent no-op would look like a broken button.
      setExportError("Couldn't build that PDF. Try Print instead, and save as PDF.");
    } finally {
      setIsExporting(null);
    }
  };

  const handlePrint = () => {
    const html = buildPdfHtml(markdown, filename);
    const iframe = document.createElement("iframe");
    iframe.style.cssText =
      "position:fixed;visibility:hidden;top:0;left:0;width:0;height:0;border:none;";
    iframe.srcdoc = html;
    document.body.appendChild(iframe);
    iframe.onload = () => {
      iframe.contentWindow?.print();
      setTimeout(() => document.body.removeChild(iframe), 1000);
    };
  };

  const exportItems: DropdownItem[] = [
    {
      label: "Download PDF",
      icon: icons.pdf,
      onSelect: handleExportPdf,
    },
    {
      label: "Download Word (DOCX)",
      icon: icons.docx,
      onSelect: handleExportDocx,
    },
    {
      // A real Google Docs export needs OAuth, a Drive client and consent-screen
      // verification. Until then this is visibly unavailable rather than absent,
      // so nobody hunts for a feature that was never there.
      //
      // Worth knowing: "Download DOCX, then open it in Google Docs" already
      // works today and imports cleanly, which may make the integration
      // unnecessary.
      label: "Save to Google Docs",
      icon: icons.googleDocs,
      disabled: true,
      note: "coming soon",
    },
    {
      label: "Print",
      icon: icons.print,
      onSelect: handlePrint,
      separated: true,
    },
  ];

  return { copied, isExporting, exportError, handleCopy, exportItems };
}
