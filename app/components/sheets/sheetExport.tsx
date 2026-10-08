"use client";

import { createRoot } from "react-dom/client";
import { triggerDownload } from "@/app/lib/exportUtils";
import { SHEET_CSS } from "@/app/lib/sheets/sheet-css";
import { getSheetTheme, PAPER_PX } from "@/app/lib/sheets/themes";
import type { SheetDoc } from "@/app/lib/sheets/types";
import SheetDocument from "./SheetDocument";

/*
 * Getting a sheet out of Jooma: a PDF, Print, or a Word document.
 *
 * PDF and Print draw the sheet with the same component the teacher has been
 * editing, offscreen, at full size and without the editing controls, then wait
 * for it to finish paginating with its fonts loaded (data-ready). So the
 * downloaded pages are the pages on screen, break for break.
 */

/** Draws the sheet offscreen and resolves with its root once it is ready. */
async function renderOffscreen(doc: SheetDoc): Promise<{ root: HTMLElement; dispose: () => void }> {
  const host = document.createElement("div");
  host.style.cssText = `position:fixed;left:-30000px;top:0;width:${PAPER_PX[doc.design.paper]?.w ?? 794}px;`;
  document.body.appendChild(host);
  const reactRoot = createRoot(host);
  reactRoot.render(<SheetDocument doc={doc} fit={false} anchors={false} exporting />);
  const dispose = () => {
    reactRoot.unmount();
    host.remove();
  };
  const started = Date.now();
  while (Date.now() - started < 10000) {
    const el = host.querySelector<HTMLElement>('.js-sheet[data-ready="true"]');
    if (el) return { root: el, dispose };
    await new Promise((r) => requestAnimationFrame(() => r(null)));
  }
  const el = host.querySelector<HTMLElement>(".js-sheet");
  if (!el) {
    dispose();
    throw new Error("The sheet did not render.");
  }
  // Fonts never settled (offline?): export with what there is.
  return { root: el, dispose };
}

export async function exportSheetPdf(doc: SheetDoc, filename: string): Promise<void> {
  const [{ default: jsPDF }, { default: html2canvas }] = await Promise.all([import("jspdf"), import("html2canvas")]);
  const { root, dispose } = await renderOffscreen(doc);
  try {
    const paper = PAPER_PX[doc.design.paper] ?? PAPER_PX.a4;
    // hotfixes: see exportToPdf in exportUtils.ts. Without it unit "px" is
    // not 96 dpi and every page comes out the wrong size.
    const pdf = new jsPDF({ orientation: "portrait", unit: "px", format: doc.design.paper === "letter" ? "letter" : "a4", hotfixes: ["px_scaling"] });
    const w = pdf.internal.pageSize.getWidth();
    const h = pdf.internal.pageSize.getHeight();
    const pages = [...root.querySelectorAll<HTMLElement>(".js-pages > .js-page")];
    const background = getSheetTheme(doc.design.themeId).colors.paper;
    for (let i = 0; i < pages.length; i++) {
      const canvas = await html2canvas(pages[i], { scale: 2, useCORS: true, backgroundColor: background, width: paper.w, height: paper.h, windowWidth: paper.w });
      if (i > 0) pdf.addPage();
      pdf.addImage(canvas.toDataURL("image/jpeg", 0.92), "JPEG", 0, 0, w, h);
    }
    pdf.save(`${filename}.pdf`);
  } finally {
    dispose();
  }
}

/** The browser's print dialog, on a copy of the pages in a hidden frame. */
export async function printSheet(doc: SheetDoc, title: string): Promise<void> {
  const { root, dispose } = await renderOffscreen(doc);
  let html: string;
  try {
    const clone = root.cloneNode(true) as HTMLElement;
    clone.querySelector(".js-measure")?.remove();
    clone.querySelectorAll("style").forEach((s) => s.remove());
    html = clone.outerHTML;
  } finally {
    dispose();
  }
  const fonts = document.querySelector<HTMLLinkElement>('link[data-jooma="google-fonts"]')?.href;
  const page = doc.design.paper === "letter" ? "letter" : "A4";
  const iframe = document.createElement("iframe");
  iframe.style.cssText = "position:fixed;visibility:hidden;top:0;left:0;width:0;height:0;border:none;";
  iframe.srcdoc = `<!doctype html><html><head><meta charset="utf-8"><title>${title.replace(/</g, "&lt;")}</title>
${fonts ? `<link rel="stylesheet" href="${fonts}">` : ""}
<style>${SHEET_CSS}
@page { size: ${page}; margin: 0; }
html, body { margin: 0; padding: 0; background: #fff; }
.js-pages { gap: 0; }
.js-page { border-radius: 0; box-shadow: none; height: calc(var(--js-page-h) - 4px); min-height: 0; break-after: page; }
* { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
</style></head><body>${html}</body></html>`;
  document.body.appendChild(iframe);
  iframe.onload = () => {
    const win = iframe.contentWindow;
    const go = () => {
      win?.focus();
      win?.print();
      setTimeout(() => iframe.remove(), 1000);
    };
    const fontsReady = win?.document.fonts?.ready;
    if (fontsReady) Promise.race([fontsReady, new Promise((r) => setTimeout(r, 3000))]).then(go);
    else go();
  };
}

export async function exportSheetDocx(doc: SheetDoc, filename: string): Promise<void> {
  const { buildSheetDocx } = await import("@/app/lib/sheets/docx");
  triggerDownload(await buildSheetDocx(doc), `${filename}.docx`);
}
