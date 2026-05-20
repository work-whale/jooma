"use client";

import { useState, useEffect, useRef } from "react";
import { Loader2, Copy, Check, ChevronDown } from "lucide-react";
import { TopicField, LessonCountField, AdditionalContextField } from "@/app/components/fields";
import ConfirmModal from "@/app/components/ConfirmModal";
import GenerateButton from "@/app/components/ui/GenerateButton";
import ResetButton from "@/app/components/ui/ResetButton";
import Card from "@/app/components/ui/Card";

interface SlideData {
  type: "title" | "content" | "quote" | "stat" | "two-column" | "activity";
  title: string;
  presentationTitle: string;
  // title / content
  subtitle?: string;
  body?: string;
  bullets?: string[];
  imageSuggestion?: string;
  callout?: { type: "key-point" | "reflection" | "try-this" | "discussion"; text: string };
  // quote
  quote?: string;
  quoteAuthor?: string;
  // stat
  stat?: string;
  statLabel?: string;
  statContext?: string;
  // two-column
  leftTitle?: string;
  leftContent?: string;
  rightTitle?: string;
  rightContent?: string;
  // activity
  activityPrompt?: string;
  activitySubtask?: string;
}

type PresentationFocus = "Practical application" | "Research and theory";
type ContentFormat = "Text" | "Text and bullet point summary";

const REFINE_CHIPS = [
  "Translate to...",
  "Make each slide more detailed",
  "Include a slide on...",
  "Make the language more accessible",
  "Add discussion questions to each slide",
];

function toHex(rgb: string): string {
  return rgb.match(/\d+/g)!
    .map((n) => parseInt(n).toString(16).padStart(2, "0"))
    .join("")
    .toUpperCase();
}

async function exportSlidesToPdf(slides: SlideData[], filename: string) {
  const [{ default: jsPDF }, { default: html2canvas }] = await Promise.all([
    import("jspdf"),
    import("html2canvas"),
  ]);

  const W = 1280;
  const H = 720;

  // Off-screen container at exact slide dimensions
  const container = document.createElement("div");
  container.style.cssText = `position:fixed;left:-${W + 100}px;top:0;width:${W}px;height:${H}px;overflow:hidden;`;
  document.body.appendChild(container);

  const pdf = new jsPDF({ orientation: "landscape", unit: "px", format: [W, H], hotfixes: ["px_scaling"] });

  for (let i = 0; i < slides.length; i++) {
    const s = slides[i];

    // Build slide element mirroring the React components
    const el = document.createElement("div");
    el.style.cssText = `width:${W}px;height:${H}px;background:${C_BG};display:flex;flex-direction:column;overflow:hidden;font-family:var(--font-karla),sans-serif;`;

    // Top accent bar
    const bar = document.createElement("div");
    bar.style.cssText = `height:8px;flex-shrink:0;background:${C_RED};`;
    el.appendChild(bar);

    if (s.type === "title") {
      const body = document.createElement("div");
      body.style.cssText = `flex:1;display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center;padding:0 120px;`;

      const label = document.createElement("p");
      label.style.cssText = `font-family:var(--font-karla),sans-serif;font-size:13px;letter-spacing:0.2em;text-transform:uppercase;color:${C_RED};margin-bottom:28px;`;
      label.textContent = "Professional Development — Teachers";

      const title = document.createElement("h1");
      title.style.cssText = `font-family:var(--font-spectral),serif;font-size:52px;font-weight:700;line-height:1.15;color:${C_TEXT};margin-bottom:24px;`;
      title.textContent = s.title;

      body.appendChild(label);
      body.appendChild(title);

      if (s.subtitle) {
        const sub = document.createElement("p");
        sub.style.cssText = `font-family:var(--font-karla),sans-serif;font-size:17px;line-height:1.6;color:${C_RED};max-width:640px;`;
        sub.textContent = s.subtitle;
        body.appendChild(sub);
      }

      el.appendChild(body);

      const bottomBar = document.createElement("div");
      bottomBar.style.cssText = `height:3px;flex-shrink:0;background:${C_GRAY};`;
      el.appendChild(bottomBar);
    } else if (s.type === "quote") {
      const body = document.createElement("div");
      body.style.cssText = `flex:1;display:flex;flex-direction:column;align-items:center;justify-content:center;padding:40px 80px;overflow:hidden;`;
      const openQ = document.createElement("p");
      openQ.style.cssText = `font-family:var(--font-spectral),serif;font-size:72px;line-height:0.8;color:${C_RED};align-self:flex-start;`;
      openQ.textContent = "“";
      const qt = document.createElement("p");
      qt.style.cssText = `font-family:var(--font-spectral),serif;font-size:26px;line-height:1.4;color:${C_TEXT};text-align:center;font-weight:500;`;
      qt.textContent = s.quote ?? "";
      const closeQ = document.createElement("p");
      closeQ.style.cssText = `font-family:var(--font-spectral),serif;font-size:72px;line-height:0.8;color:${C_RED};align-self:flex-end;`;
      closeQ.textContent = "”";
      body.appendChild(openQ);
      body.appendChild(qt);
      body.appendChild(closeQ);
      if (s.quoteAuthor) {
        const auth = document.createElement("p");
        auth.style.cssText = `font-family:var(--font-karla),sans-serif;font-size:11px;letter-spacing:0.1em;text-transform:uppercase;color:${C_GRAY};margin-top:12px;text-align:center;`;
        auth.textContent = `— ${s.quoteAuthor}`;
        body.appendChild(auth);
      }
      if (s.body) {
        const div = document.createElement("div");
        div.style.cssText = `height:1px;width:60px;background:${C_RED};opacity:0.35;margin:16px auto 12px;`;
        const ctx = document.createElement("p");
        ctx.style.cssText = `font-family:var(--font-karla),sans-serif;font-size:13px;color:${C_GRAY};text-align:center;line-height:1.6;`;
        ctx.textContent = s.body;
        body.appendChild(div);
        body.appendChild(ctx);
      }
      el.appendChild(body);
      const bottomBar = document.createElement("div");
      bottomBar.style.cssText = `height:2px;flex-shrink:0;background:${C_GRAY};`;
      el.appendChild(bottomBar);

    } else if (s.type === "stat") {
      const body = document.createElement("div");
      body.style.cssText = `flex:1;display:flex;flex-direction:column;padding:40px 76px 36px;overflow:hidden;`;
      const hb = document.createElement("div");
      hb.style.cssText = `margin-bottom:16px;flex-shrink:0;`;
      const h2 = document.createElement("h2");
      h2.style.cssText = `font-family:var(--font-spectral),serif;font-size:26px;font-weight:600;color:${C_TEXT};`;
      h2.textContent = s.title;
      const pt = document.createElement("p");
      pt.style.cssText = `font-family:var(--font-karla),sans-serif;font-size:12px;color:${C_RED};margin-top:6px;`;
      pt.textContent = s.presentationTitle;
      const div2 = document.createElement("div");
      div2.style.cssText = `height:1px;margin-top:12px;background:${C_RED};opacity:0.4;`;
      hb.appendChild(h2); hb.appendChild(pt); hb.appendChild(div2);
      body.appendChild(hb);
      const centre = document.createElement("div");
      centre.style.cssText = `flex:1;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:12px;`;
      const statNum = document.createElement("p");
      statNum.style.cssText = `font-family:var(--font-spectral),serif;font-size:96px;font-weight:700;line-height:1;color:${C_RED};text-align:center;`;
      statNum.textContent = s.stat ?? "";
      centre.appendChild(statNum);
      if (s.statLabel) {
        const sl = document.createElement("p");
        sl.style.cssText = `font-family:var(--font-karla),sans-serif;font-size:18px;color:${C_TEXT};font-weight:500;text-align:center;`;
        sl.textContent = s.statLabel;
        centre.appendChild(sl);
      }
      if (s.statContext) {
        const sdiv = document.createElement("div");
        sdiv.style.cssText = `height:1px;width:48px;background:${C_RED};opacity:0.35;margin:4px auto 0;`;
        const sc = document.createElement("p");
        sc.style.cssText = `font-family:var(--font-karla),sans-serif;font-size:13px;color:${C_GRAY};text-align:center;line-height:1.6;margin-top:8px;`;
        sc.textContent = s.statContext;
        centre.appendChild(sdiv);
        centre.appendChild(sc);
      }
      body.appendChild(centre);
      el.appendChild(body);

    } else if (s.type === "two-column") {
      const body = document.createElement("div");
      body.style.cssText = `flex:1;display:flex;flex-direction:column;padding:40px 76px 36px;overflow:hidden;`;
      const hb = document.createElement("div");
      hb.style.cssText = `margin-bottom:16px;flex-shrink:0;`;
      const h2 = document.createElement("h2");
      h2.style.cssText = `font-family:var(--font-spectral),serif;font-size:30px;font-weight:700;color:${C_TEXT};`;
      h2.textContent = s.title;
      const pt = document.createElement("p");
      pt.style.cssText = `font-family:var(--font-karla),sans-serif;font-size:12px;color:${C_RED};margin-top:6px;`;
      pt.textContent = s.presentationTitle;
      const div3 = document.createElement("div");
      div3.style.cssText = `height:1px;margin-top:12px;background:${C_RED};opacity:0.4;`;
      hb.appendChild(h2); hb.appendChild(pt); hb.appendChild(div3);
      body.appendChild(hb);
      const cols = document.createElement("div");
      cols.style.cssText = `flex:1;display:flex;gap:0;overflow:hidden;`;
      const mkCol = (title: string | undefined, content: string | undefined, border: boolean) => {
        const col = document.createElement("div");
        col.style.cssText = `flex:1;display:flex;flex-direction:column;${border ? `padding-right:32px;border-right:1px solid rgba(102,74,50,0.2);` : "padding-left:32px;"}`;
        if (title) {
          const t = document.createElement("p");
          t.style.cssText = `font-family:var(--font-karla),sans-serif;font-size:10px;font-weight:700;letter-spacing:0.1em;text-transform:uppercase;color:${C_RED};margin-bottom:10px;`;
          t.textContent = title;
          col.appendChild(t);
        }
        if (content) {
          const c = document.createElement("p");
          c.style.cssText = `font-family:var(--font-karla),sans-serif;font-size:13px;line-height:1.6;color:${C_TEXT};`;
          c.textContent = content.replace(/\n- /g, "\n• ");
          col.appendChild(c);
        }
        return col;
      };
      cols.appendChild(mkCol(s.leftTitle, s.leftContent, true));
      cols.appendChild(mkCol(s.rightTitle, s.rightContent, false));
      body.appendChild(cols);
      el.appendChild(body);

    } else if (s.type === "activity") {
      const body = document.createElement("div");
      body.style.cssText = `flex:1;display:flex;flex-direction:column;padding:40px 76px 36px;overflow:hidden;`;
      const hb = document.createElement("div");
      hb.style.cssText = `margin-bottom:16px;flex-shrink:0;`;
      const label = document.createElement("p");
      label.style.cssText = `font-family:var(--font-karla),sans-serif;font-size:10px;font-weight:700;letter-spacing:0.15em;text-transform:uppercase;color:${C_RED};`;
      label.textContent = "Activity";
      const h2 = document.createElement("h2");
      h2.style.cssText = `font-family:var(--font-spectral),serif;font-size:30px;font-weight:700;color:${C_TEXT};margin-top:4px;`;
      h2.textContent = s.title;
      const div4 = document.createElement("div");
      div4.style.cssText = `height:1px;margin-top:12px;background:${C_RED};opacity:0.4;`;
      hb.appendChild(label); hb.appendChild(h2); hb.appendChild(div4);
      body.appendChild(hb);
      const centre = document.createElement("div");
      centre.style.cssText = `flex:1;display:flex;flex-direction:column;justify-content:center;gap:16px;`;
      if (s.activityPrompt) {
        const box = document.createElement("div");
        box.style.cssText = `background:rgba(102,74,50,0.07);border:1.5px solid rgba(102,74,50,0.2);border-radius:12px;padding:28px 40px;text-align:center;`;
        const pt = document.createElement("p");
        pt.style.cssText = `font-family:var(--font-spectral),serif;font-size:20px;font-weight:500;color:${C_TEXT};line-height:1.5;`;
        pt.textContent = s.activityPrompt;
        box.appendChild(pt);
        centre.appendChild(box);
      }
      if (s.activitySubtask) {
        const sub = document.createElement("p");
        sub.style.cssText = `font-family:var(--font-karla),sans-serif;font-size:13px;color:${C_GRAY};text-align:center;`;
        sub.textContent = s.activitySubtask;
        centre.appendChild(sub);
      }
      body.appendChild(centre);
      el.appendChild(body);

    } else {
      const body = document.createElement("div");
      body.style.cssText = `flex:1;display:flex;flex-direction:column;padding:44px 76px 36px;overflow:hidden;`;

      // Heading block
      const headingBlock = document.createElement("div");
      headingBlock.style.cssText = `margin-bottom:20px;flex-shrink:0;`;

      const heading = document.createElement("h2");
      heading.style.cssText = `font-family:var(--font-spectral),serif;font-size:34px;font-weight:700;line-height:1.2;color:${C_TEXT};`;
      heading.textContent = s.title;

      const presTitle = document.createElement("p");
      presTitle.style.cssText = `font-family:var(--font-karla),sans-serif;font-size:12px;letter-spacing:0.05em;color:${C_RED};margin-top:6px;`;
      presTitle.textContent = s.presentationTitle;

      const divider = document.createElement("div");
      divider.style.cssText = `height:1px;margin-top:13px;background:${C_RED};opacity:0.4;`;

      headingBlock.appendChild(heading);
      headingBlock.appendChild(presTitle);
      headingBlock.appendChild(divider);
      body.appendChild(headingBlock);

      if (s.body) {
        const bodyText = document.createElement("p");
        bodyText.style.cssText = `font-family:var(--font-karla),sans-serif;font-size:15px;line-height:1.7;color:${C_TEXT};margin-bottom:14px;`;
        bodyText.textContent = s.body;
        body.appendChild(bodyText);
      }

      if (s.bullets?.length) {
        const ul = document.createElement("ul");
        ul.style.cssText = `list-style:none;display:flex;flex-direction:column;gap:9px;padding:0;margin:0;`;
        for (const b of s.bullets) {
          const li = document.createElement("li");
          li.style.cssText = `font-family:var(--font-karla),sans-serif;font-size:14px;line-height:1.5;color:${C_TEXT};display:flex;align-items:flex-start;gap:10px;`;
          const dot = document.createElement("span");
          dot.style.cssText = `width:6px;height:6px;border-radius:50%;background:${C_RED};flex-shrink:0;margin-top:5px;`;
          const txt = document.createElement("span");
          txt.textContent = b;
          li.appendChild(dot);
          li.appendChild(txt);
          ul.appendChild(li);
        }
        body.appendChild(ul);
      }

      if (s.imageSuggestion) {
        const imgBox = document.createElement("div");
        imgBox.style.cssText = `margin-top:auto;border:1px dashed ${C_RED};border-radius:6px;padding:9px 14px;text-align:center;`;
        const imgText = document.createElement("p");
        imgText.style.cssText = `font-family:var(--font-karla),sans-serif;font-size:11px;font-style:italic;color:${C_GRAY};`;
        imgText.textContent = `<suggested search for images: "${s.imageSuggestion}">`;
        imgBox.appendChild(imgText);
        body.appendChild(imgBox);
      }

      el.appendChild(body);
    }

    container.innerHTML = "";
    container.appendChild(el);
    await document.fonts.ready;

    const canvas = await html2canvas(el, { width: W, height: H, scale: 2, useCORS: true, backgroundColor: C_BG });

    if (i > 0) pdf.addPage([W, H], "landscape");
    pdf.addImage(canvas.toDataURL("image/jpeg", 0.92), "JPEG", 0, 0, W, H);
  }

  document.body.removeChild(container);
  pdf.save(`${filename}.pdf`);
}

async function exportSlidesToPptx(slides: SlideData[], filename: string) {
  const pptxgen = (await import("pptxgenjs")).default;
  const prs = new pptxgen();
  prs.layout = "LAYOUT_WIDE"; // 13.33" × 7.5"

  const BG  = toHex(C_BG);
  const TXT = toHex(C_TEXT);
  const ACC = toHex(C_RED);
  const SEC = toHex(C_GRAY);

  for (const slide of slides) {
    const s = prs.addSlide();
    s.background = { color: BG };

    // Top accent bar
    s.addShape(prs.ShapeType.rect, {
      x: 0, y: 0, w: "100%", h: 0.08,
      fill: { color: ACC }, line: { color: ACC, width: 0 },
    });

    if (slide.type === "title") {
      s.addText("PROFESSIONAL DEVELOPMENT — TEACHERS", {
        x: 0, y: 2.5, w: "100%", h: 0.35,
        align: "center", fontSize: 9, color: ACC,
        fontFace: "Karla", charSpacing: 4,
      });
      s.addText(slide.title, {
        x: 1.5, y: 2.95, w: 10.33, h: 2.4,
        align: "center", fontSize: 36, bold: true,
        color: TXT, fontFace: "Spectral", wrap: true,
      });
      if (slide.subtitle) {
        s.addText(slide.subtitle, {
          x: 2, y: 5.5, w: 9.33, h: 1.0,
          align: "center", fontSize: 14,
          color: ACC, fontFace: "Karla", wrap: true,
        });
      }
      // Bottom bar
      s.addShape(prs.ShapeType.rect, {
        x: 0, y: 7.47, w: "100%", h: 0.03,
        fill: { color: SEC }, line: { color: SEC, width: 0 },
      });
    } else if (slide.type === "quote") {
      s.addText("“", { x: 0.5, y: 0.6, w: 1.5, h: 1.2, fontSize: 60, bold: true, color: ACC, fontFace: "Spectral" });
      s.addText(slide.quote ?? "", {
        x: 1.5, y: 1.5, w: 10.33, h: 2.5,
        fontSize: 22, bold: true, color: TXT, fontFace: "Spectral",
        align: "center", wrap: true, valign: "middle",
      });
      s.addText("”", { x: 11.3, y: 3.5, w: 1.5, h: 1.2, fontSize: 60, bold: true, color: ACC, fontFace: "Spectral" });
      if (slide.quoteAuthor) {
        s.addText(`— ${slide.quoteAuthor}`, {
          x: 1.5, y: 4.3, w: 10.33, h: 0.4,
          fontSize: 10, color: SEC, fontFace: "Karla",
          align: "center", charSpacing: 2,
        });
      }
      if (slide.body) {
        s.addShape(prs.ShapeType.rect, { x: 5.67, y: 4.9, w: 2, h: 0.02, fill: { color: ACC }, line: { color: ACC, width: 0 } });
        s.addText(slide.body, {
          x: 1.5, y: 5.1, w: 10.33, h: 0.8,
          fontSize: 12, color: SEC, fontFace: "Karla", align: "center", wrap: true,
        });
      }
      s.addShape(prs.ShapeType.rect, { x: 0, y: 7.47, w: "100%", h: 0.03, fill: { color: SEC }, line: { color: SEC, width: 0 } });

    } else if (slide.type === "stat") {
      s.addText(slide.title, { x: 0.9, y: 0.45, w: 11.53, h: 0.7, fontSize: 22, bold: true, color: TXT, fontFace: "Spectral", wrap: true });
      s.addText(slide.presentationTitle, { x: 0.9, y: 1.2, w: 11.53, h: 0.28, fontSize: 10, color: ACC, fontFace: "Karla" });
      s.addShape(prs.ShapeType.rect, { x: 0.9, y: 1.52, w: 11.53, h: 0.02, fill: { color: SEC }, line: { color: SEC, width: 0 } });
      s.addText(slide.stat ?? "", { x: 1.5, y: 1.8, w: 10.33, h: 2.8, fontSize: 80, bold: true, color: ACC, fontFace: "Spectral", align: "center", valign: "middle" });
      if (slide.statLabel) {
        s.addText(slide.statLabel, { x: 1.5, y: 4.6, w: 10.33, h: 0.6, fontSize: 16, bold: true, color: TXT, fontFace: "Karla", align: "center" });
      }
      if (slide.statContext) {
        s.addShape(prs.ShapeType.rect, { x: 5.67, y: 5.35, w: 2, h: 0.02, fill: { color: ACC }, line: { color: ACC, width: 0 } });
        s.addText(slide.statContext, { x: 1.5, y: 5.5, w: 10.33, h: 0.8, fontSize: 12, color: SEC, fontFace: "Karla", align: "center", wrap: true });
      }

    } else if (slide.type === "two-column") {
      s.addText(slide.title, { x: 0.9, y: 0.45, w: 11.53, h: 0.7, fontSize: 26, bold: true, color: TXT, fontFace: "Spectral", wrap: true });
      s.addText(slide.presentationTitle, { x: 0.9, y: 1.2, w: 11.53, h: 0.28, fontSize: 10, color: ACC, fontFace: "Karla" });
      s.addShape(prs.ShapeType.rect, { x: 0.9, y: 1.52, w: 11.53, h: 0.02, fill: { color: SEC }, line: { color: SEC, width: 0 } });
      s.addShape(prs.ShapeType.rect, { x: 6.67, y: 1.7, w: 0.02, h: 5.5, fill: { color: SEC }, line: { color: SEC, width: 0 } });
      if (slide.leftTitle) s.addText(slide.leftTitle.toUpperCase(), { x: 0.9, y: 1.7, w: 5.5, h: 0.35, fontSize: 9, bold: true, color: ACC, fontFace: "Karla", charSpacing: 2 });
      if (slide.leftContent) s.addText(slide.leftContent.replace(/\n- /g, "\n• "), { x: 0.9, y: 2.1, w: 5.5, h: 4.8, fontSize: 13, color: TXT, fontFace: "Karla", wrap: true, valign: "top" });
      if (slide.rightTitle) s.addText(slide.rightTitle.toUpperCase(), { x: 7.0, y: 1.7, w: 5.5, h: 0.35, fontSize: 9, bold: true, color: ACC, fontFace: "Karla", charSpacing: 2 });
      if (slide.rightContent) s.addText(slide.rightContent.replace(/\n- /g, "\n• "), { x: 7.0, y: 2.1, w: 5.5, h: 4.8, fontSize: 13, color: TXT, fontFace: "Karla", wrap: true, valign: "top" });

    } else if (slide.type === "activity") {
      s.addText("ACTIVITY", { x: 0.9, y: 0.45, w: 11.53, h: 0.3, fontSize: 9, bold: true, color: ACC, fontFace: "Karla", charSpacing: 3 });
      s.addText(slide.title, { x: 0.9, y: 0.75, w: 11.53, h: 0.75, fontSize: 26, bold: true, color: TXT, fontFace: "Spectral", wrap: true });
      s.addShape(prs.ShapeType.rect, { x: 0.9, y: 1.52, w: 11.53, h: 0.02, fill: { color: SEC }, line: { color: SEC, width: 0 } });
      if (slide.activityPrompt) {
        s.addShape(prs.ShapeType.roundRect, { x: 1.5, y: 2.0, w: 10.33, h: 2.8, fill: { color: toHex("rgb(240,234,226)") }, line: { color: toHex("rgb(170,145,120)"), width: 1.5 }, rectRadius: 0.15 });
        s.addText(slide.activityPrompt, { x: 1.7, y: 2.2, w: 9.93, h: 2.4, fontSize: 18, bold: true, color: TXT, fontFace: "Spectral", align: "center", valign: "middle", wrap: true });
      }
      if (slide.activitySubtask) {
        s.addText(slide.activitySubtask, { x: 1.5, y: 5.1, w: 10.33, h: 0.5, fontSize: 12, color: SEC, fontFace: "Karla", align: "center" });
      }

    } else {
      s.addText(slide.title, {
        x: 0.9, y: 0.45, w: 11.53, h: 0.85,
        fontSize: 28, bold: true,
        color: TXT, fontFace: "Spectral", wrap: true,
      });
      s.addText(slide.presentationTitle, {
        x: 0.9, y: 1.35, w: 11.53, h: 0.28,
        fontSize: 10, color: ACC, fontFace: "Karla",
      });
      // Divider
      s.addShape(prs.ShapeType.rect, {
        x: 0.9, y: 1.68, w: 11.53, h: 0.02,
        fill: { color: SEC }, line: { color: SEC, width: 0 },
      });

      let y = 1.85;

      if (slide.body) {
        s.addText(slide.body, {
          x: 0.9, y, w: 11.53, h: 1.9,
          fontSize: 13, color: TXT, fontFace: "Karla",
          wrap: true, valign: "top",
        });
        y += 2.0;
      }

      if (slide.bullets?.length) {
        s.addText(
          slide.bullets.map((b) => ({ text: b, options: { bullet: { type: "bullet" as const }, color: TXT } })),
          { x: 0.9, y, w: 11.53, h: 2.2, fontSize: 12, fontFace: "Karla", wrap: true, valign: "top" },
        );
        y += slide.bullets.length * 0.4 + 0.2;
      }

      if (slide.imageSuggestion) {
        s.addText(`<suggested search for images: "${slide.imageSuggestion}">`, {
          x: 0.9, y: 6.8, w: 11.53, h: 0.4,
          fontSize: 10, color: SEC, fontFace: "Karla",
          italic: true, align: "center",
        });
      }
    }
  }

  await prs.writeFile({ fileName: `${filename}.pptx` });
}

function slidesToMarkdown(slides: SlideData[]): string {
  return slides
    .map((s) => {
      if (s.type === "title") {
        return `# ${s.title}\n\n${s.subtitle ?? ""}`;
      }
      if (s.type === "quote") {
        const lines = [`## Quote`];
        if (s.quote) lines.push(`> "${s.quote}"\n>\n> — ${s.quoteAuthor ?? ""}`);
        if (s.body) lines.push(s.body);
        return lines.join("\n\n");
      }
      if (s.type === "stat") {
        const lines = [`## ${s.title}`, `**${s.stat}** — ${s.statLabel ?? ""}`];
        if (s.statContext) lines.push(s.statContext);
        return lines.join("\n\n");
      }
      if (s.type === "two-column") {
        const lines = [`## ${s.title}`, `**${s.leftTitle ?? ""}**\n${s.leftContent ?? ""}`, `**${s.rightTitle ?? ""}**\n${s.rightContent ?? ""}`];
        return lines.join("\n\n");
      }
      if (s.type === "activity") {
        const lines = [`## Activity: ${s.title}`];
        if (s.activityPrompt) lines.push(s.activityPrompt);
        if (s.activitySubtask) lines.push(`*${s.activitySubtask}*`);
        return lines.join("\n\n");
      }
      const lines: string[] = [`## ${s.title}`];
      if (s.body) lines.push(s.body);
      if (s.callout) lines.push(`> **${s.callout.type === "key-point" ? "Key Point" : s.callout.type === "reflection" ? "Reflect" : s.callout.type === "try-this" ? "Try This" : "Discussion"}:** ${s.callout.text}`);
      if (s.bullets?.length) lines.push(s.bullets.map((b) => `- ${b}`).join("\n"));
      if (s.imageSuggestion) lines.push(`*Suggested image: "${s.imageSuggestion}"*`);
      return lines.join("\n\n");
    })
    .join("\n\n---\n\n");
}

// ── Slide theme ────────────────────────────────────────────────
const C_BG   = "rgb(249, 246, 239)";  // cream background
const C_TEXT = "rgb(38, 25, 17)";     // near-black dark brown primary text
const C_RED  = "rgb(102, 74, 50)";    // dark warm brown accent (bars, bullets, dividers)
const C_GRAY = "rgb(191, 175, 160)";  // warm tan secondary text (labels, subtitles)

const HEADING_FONT: React.CSSProperties = { fontFamily: "var(--font-spectral)", color: C_TEXT };
const BODY_FONT:    React.CSSProperties = { fontFamily: "var(--font-karla)",    color: C_TEXT };

function SlideCanvas({ children, footer }: { children: React.ReactNode; footer: React.ReactNode }) {
  return (
    <div className="flex flex-col items-center">
      <div
        className="w-full max-w-5xl rounded-lg overflow-hidden shadow-xl"
        style={{ aspectRatio: "16 / 9", backgroundColor: C_BG }}
      >
        <div className="relative w-full h-full flex flex-col">
          {children}
        </div>
      </div>
      <div className="w-full max-w-5xl px-1 pt-2 flex justify-end">
        {footer}
      </div>
    </div>
  );
}

function SlideNumber({ n, total }: { n: number; total: number }) {
  return (
    <span className="text-sm font-medium text-white/70" style={BODY_FONT}>
      {n} / {total}
    </span>
  );
}

function TitleSlide({ slide, index, total }: { slide: SlideData; index: number; total: number }) {
  return (
    <SlideCanvas footer={<SlideNumber n={index + 1} total={total} />}>
      {/* Top accent bar */}
      <div className="h-1 shrink-0" style={{ backgroundColor: C_RED }} />

      <div className="flex-1 flex flex-col items-center justify-center text-center px-24">
        <p
          className="text-md tracking-widest uppercase mb-6"
          style={{ ...BODY_FONT, color: C_RED }}
        >
          Professional Development — Teachers
        </p>
        <h2
          className="text-5xl font-bold leading-tight mb-5 max-w-2xl"
          style={HEADING_FONT}
        >
          {slide.title}
        </h2>
        {slide.subtitle && (
          <p className="text-md leading-relaxed max-w-lg" style={{ ...BODY_FONT, color: C_RED }}>
            {slide.subtitle}
          </p>
        )}
      </div>

      {/* Bottom accent bar */}
      <div className="h-0.5 shrink-0" style={{ backgroundColor: C_RED }} />
    </SlideCanvas>
  );
}

function ContentSlide({ slide, index, total }: { slide: SlideData; index: number; total: number }) {
  return (
    <SlideCanvas footer={<SlideNumber n={index + 1} total={total} />}>
      {/* Top accent bar */}
      <div className="h-1 shrink-0" style={{ backgroundColor: C_RED }} />

      <div className="flex-1 flex flex-col px-20 py-14 overflow-hidden">
        {/* Heading */}
        <div className="mb-5 shrink-0">
          <h3 className="text-4xl font-bold leading-snug" style={HEADING_FONT}>
            {slide.title}
          </h3>
          <p className="text-sm tracking-wide mt-1" style={{ ...BODY_FONT, color: C_RED }}>
            {slide.presentationTitle}
          </p>
          <div className="mt-3 h-px" style={{ backgroundColor: C_RED, opacity: 0.4 }} />
        </div>

        {/* Body */}
        <div className="flex-1 flex flex-col gap-4 overflow-hidden">
          {slide.body && (
            <p className="text-base leading-7" style={BODY_FONT}>
              {slide.body}
            </p>
          )}

          {slide.bullets?.length ? (
            <ul className="space-y-2.5">
              {slide.bullets.map((b, i) => (
                <li key={i} className="flex items-start gap-3">
                  <span
                    className="mt-2 w-1.5 h-1.5 rounded-full shrink-0"
                    style={{ backgroundColor: C_RED }}
                  />
                  <span className="text-sm leading-snug" style={BODY_FONT}>{b}</span>
                </li>
              ))}
            </ul>
          ) : null}

          {slide.callout && (
            <div
              className="flex flex-col gap-1 rounded-lg px-4 py-3"
              style={{ backgroundColor: "rgba(102,74,50,0.07)", borderLeft: `3px solid ${C_RED}` }}
            >
              <p className="text-xs font-semibold tracking-widest uppercase" style={{ color: C_RED }}>
                {slide.callout.type === "key-point" ? "Key Point"
                  : slide.callout.type === "reflection" ? "Reflect"
                  : slide.callout.type === "try-this" ? "Try This"
                  : "Discussion"}
              </p>
              <p className="text-sm leading-relaxed" style={BODY_FONT}>{slide.callout.text}</p>
            </div>
          )}

          {slide.imageSuggestion && (
            <div className="mt-auto">
              <div
                className="rounded-md px-4 py-2.5 text-center"
                style={{ backgroundColor: "rgba(38,25,17,0.04)", border: `1px dashed ${C_RED}` }}
              >
                <p className="text-xs italic" style={{ ...BODY_FONT, color: C_GRAY }}>
                  {`<suggested search for images: "${slide.imageSuggestion}">`}
                </p>
              </div>
            </div>
          )}
        </div>
      </div>
    </SlideCanvas>
  );
}

function QuoteSlide({ slide, index, total }: { slide: SlideData; index: number; total: number }) {
  return (
    <SlideCanvas footer={<SlideNumber n={index + 1} total={total} />}>
      <div className="h-1 shrink-0" style={{ backgroundColor: C_RED }} />
      <div className="flex-1 flex flex-col items-center justify-center px-20 py-10 overflow-hidden">
        <p
          className="self-start leading-none font-bold"
          style={{ fontFamily: "var(--font-spectral)", color: C_RED, fontSize: "5rem", lineHeight: 0.8 }}
        >
          &ldquo;
        </p>
        <p className="text-2xl leading-snug text-center font-medium max-w-2xl" style={HEADING_FONT}>
          {slide.quote}
        </p>
        <p
          className="self-end leading-none font-bold"
          style={{ fontFamily: "var(--font-spectral)", color: C_RED, fontSize: "5rem", lineHeight: 0.8 }}
        >
          &rdquo;
        </p>
        {slide.quoteAuthor && (
          <p className="text-xs tracking-widest uppercase mt-3 text-center" style={{ ...BODY_FONT, color: C_GRAY }}>
            — {slide.quoteAuthor}
          </p>
        )}
        {slide.body && (
          <>
            <div className="mt-5 h-px w-20" style={{ backgroundColor: C_RED, opacity: 0.35 }} />
            <p className="text-sm text-center max-w-xl leading-relaxed mt-4" style={{ ...BODY_FONT, color: C_GRAY }}>
              {slide.body}
            </p>
          </>
        )}
      </div>
      <div className="h-0.5 shrink-0" style={{ backgroundColor: C_GRAY }} />
    </SlideCanvas>
  );
}

function StatSlide({ slide, index, total }: { slide: SlideData; index: number; total: number }) {
  return (
    <SlideCanvas footer={<SlideNumber n={index + 1} total={total} />}>
      <div className="h-1 shrink-0" style={{ backgroundColor: C_RED }} />
      <div className="flex-1 flex flex-col px-20 py-10 overflow-hidden">
        <div className="mb-4 shrink-0">
          <h3 className="text-2xl font-semibold leading-snug" style={HEADING_FONT}>{slide.title}</h3>
          <p className="text-sm tracking-wide mt-1" style={{ ...BODY_FONT, color: C_RED }}>{slide.presentationTitle}</p>
          <div className="mt-3 h-px" style={{ backgroundColor: C_RED, opacity: 0.4 }} />
        </div>
        <div className="flex-1 flex flex-col items-center justify-center gap-3">
          <p className="font-bold leading-none text-center" style={{ ...HEADING_FONT, color: C_RED, fontSize: "6rem" }}>
            {slide.stat}
          </p>
          {slide.statLabel && (
            <p className="text-xl font-medium text-center max-w-md" style={BODY_FONT}>
              {slide.statLabel}
            </p>
          )}
          {slide.statContext && (
            <>
              <div className="h-px w-16 mt-2" style={{ backgroundColor: C_RED, opacity: 0.35 }} />
              <p className="text-sm text-center max-w-lg leading-relaxed" style={{ ...BODY_FONT, color: C_GRAY }}>
                {slide.statContext}
              </p>
            </>
          )}
        </div>
      </div>
    </SlideCanvas>
  );
}

function TwoColumnSlide({ slide, index, total }: { slide: SlideData; index: number; total: number }) {
  const renderContent = (content: string) => {
    if (content.includes("\n- ")) {
      const parts = content.split("\n- ");
      const intro = parts[0].trim();
      const items = parts.slice(1);
      return (
        <>
          {intro && <p className="text-sm leading-relaxed mb-2" style={BODY_FONT}>{intro}</p>}
          <ul className="space-y-2">
            {items.map((b, i) => (
              <li key={i} className="flex items-start gap-2">
                <span className="mt-1.5 w-1.5 h-1.5 rounded-full shrink-0" style={{ backgroundColor: C_RED }} />
                <span className="text-sm leading-snug" style={BODY_FONT}>{b.trim()}</span>
              </li>
            ))}
          </ul>
        </>
      );
    }
    return <p className="text-sm leading-relaxed" style={BODY_FONT}>{content}</p>;
  };

  return (
    <SlideCanvas footer={<SlideNumber n={index + 1} total={total} />}>
      <div className="h-1 shrink-0" style={{ backgroundColor: C_RED }} />
      <div className="flex-1 flex flex-col px-20 py-10 overflow-hidden">
        <div className="mb-4 shrink-0">
          <h3 className="text-3xl font-bold leading-snug" style={HEADING_FONT}>{slide.title}</h3>
          <p className="text-sm tracking-wide mt-1" style={{ ...BODY_FONT, color: C_RED }}>{slide.presentationTitle}</p>
          <div className="mt-3 h-px" style={{ backgroundColor: C_RED, opacity: 0.4 }} />
        </div>
        <div className="flex-1 grid grid-cols-2 gap-0 overflow-hidden">
          <div className="flex flex-col pr-8 border-r" style={{ borderColor: `rgba(102,74,50,0.2)` }}>
            {slide.leftTitle && (
              <p className="text-xs font-semibold tracking-widest uppercase mb-3" style={{ color: C_RED }}>
                {slide.leftTitle}
              </p>
            )}
            {slide.leftContent && renderContent(slide.leftContent)}
          </div>
          <div className="flex flex-col pl-8">
            {slide.rightTitle && (
              <p className="text-xs font-semibold tracking-widest uppercase mb-3" style={{ color: C_RED }}>
                {slide.rightTitle}
              </p>
            )}
            {slide.rightContent && renderContent(slide.rightContent)}
          </div>
        </div>
      </div>
    </SlideCanvas>
  );
}

function ActivitySlide({ slide, index, total }: { slide: SlideData; index: number; total: number }) {
  return (
    <SlideCanvas footer={<SlideNumber n={index + 1} total={total} />}>
      <div className="h-1 shrink-0" style={{ backgroundColor: C_RED }} />
      <div className="flex-1 flex flex-col px-20 py-10 overflow-hidden">
        <div className="mb-4 shrink-0">
          <p className="text-xs font-semibold tracking-widest uppercase" style={{ color: C_RED }}>Activity</p>
          <h3 className="text-3xl font-bold leading-snug mt-1" style={HEADING_FONT}>{slide.title}</h3>
          <div className="mt-3 h-px" style={{ backgroundColor: C_RED, opacity: 0.4 }} />
        </div>
        <div className="flex-1 flex flex-col justify-center gap-5">
          {slide.activityPrompt && (
            <div
              className="rounded-xl px-8 py-7"
              style={{ backgroundColor: "rgba(102,74,50,0.07)", border: `1.5px solid rgba(102,74,50,0.2)` }}
            >
              <p className="text-xl leading-relaxed font-medium text-center" style={HEADING_FONT}>
                {slide.activityPrompt}
              </p>
            </div>
          )}
          {slide.activitySubtask && (
            <p className="text-sm text-center" style={{ ...BODY_FONT, color: C_GRAY }}>
              {slide.activitySubtask}
            </p>
          )}
        </div>
      </div>
    </SlideCanvas>
  );
}

function SlideSkeleton() {
  const cards = [
    { delay: "0s", scale: 1, zIndex: 4, opacity: 1 },
    { delay: "0.15s", scale: 0.97, zIndex: 3, opacity: 0.75 },
    { delay: "0.3s", scale: 0.94, zIndex: 2, opacity: 0.5 },
    { delay: "0.45s", scale: 0.91, zIndex: 1, opacity: 0.3 },
  ];

  return (
    <div className="flex flex-col items-center">
      <style>{`
        @keyframes float-card {
          0%, 100% { transform: translateY(0); }
          50% { transform: translateY(-10px); }
        }
      `}</style>

      <div className="w-full max-w-5xl" style={{ aspectRatio: "16 / 9", position: "relative" }}>
        {cards.map((card, i) => (
          <div
            key={i}
            style={{
              position: "absolute",
              inset: 0,
              borderRadius: "0.5rem",
              overflow: "hidden",
              backgroundColor: C_BG,
              boxShadow: "0 20px 60px rgba(0,0,0,0.15)",
              transform: `scale(${card.scale})`,
              transformOrigin: "bottom center",
              zIndex: card.zIndex,
              opacity: card.opacity,
              animation: `float-card 2s ease-in-out infinite`,
              animationDelay: card.delay,
            }}
          >
            <div style={{ height: 4, backgroundColor: C_RED, opacity: 0.4 }} />
            <div style={{ padding: "2.5rem 4rem", height: "100%", display: "flex", flexDirection: "column", gap: "1.25rem" }}>
              <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
                <div style={{ height: 24, borderRadius: 4, width: "50%", backgroundColor: "rgba(38,25,17,0.1)" }} />
                <div style={{ height: 12, borderRadius: 4, width: "28%", backgroundColor: "rgba(38,25,17,0.07)" }} />
                <div style={{ height: 1, marginTop: 8, backgroundColor: C_RED, opacity: 0.3 }} />
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem", flex: 1 }}>
                {[1, 0.9, 0.8, 0.65].map((w, j) => (
                  <div key={j} style={{ height: 12, borderRadius: 4, width: `${w * 100}%`, backgroundColor: "rgba(38,25,17,0.07)" }} />
                ))}
              </div>
            </div>
          </div>
        ))}
      </div>

      <div className="w-full max-w-5xl px-1 pt-2 flex items-center gap-2" style={{ marginTop: "0.5rem" }}>
        <Loader2 className="w-3 h-3 animate-spin" style={{ color: C_RED }} />
        <span className="text-xs" style={{ color: C_RED }}>Generating slide...</span>
      </div>
    </div>
  );
}

export default function CpdSlideshowForm({ sidebar }: { sidebar: React.ReactNode }) {
  const [topic, setTopic] = useState("");
  const [slideCount, setSlideCount] = useState(4);
  const [additionalFocus, setAdditionalFocus] = useState("");
  const [presentationFocus, setPresentationFocus] = useState<PresentationFocus>("Practical application");
  const [contentFormat, setContentFormat] = useState<ContentFormat>("Text and bullet point summary");
  const [includeImageSuggestions, setIncludeImageSuggestions] = useState(true);

  const [slides, setSlides] = useState<SlideData[] | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [isRefining, setIsRefining] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmingReset, setConfirmingReset] = useState(false);
  const [copied, setCopied] = useState(false);
  const [showDownloadMenu, setShowDownloadMenu] = useState(false);
  const [refineInstruction, setRefineInstruction] = useState("");
  const [lastGenerated, setLastGenerated] = useState<string | null>(null);

  const userScrolledUp = useRef(false);
  const isGeneratingRef = useRef(isGenerating || isRefining);
  const isBusy = isGenerating || isRefining;

  // Keep ref in sync so the scroll listener always sees the latest value
  useEffect(() => {
    isGeneratingRef.current = isGenerating || isRefining;
    if (isGenerating) {
      userScrolledUp.current = false;
    }
  }, [isGenerating, isRefining]);

  // Listen for scroll — disable auto-scroll if user scrolls up, re-enable if they reach the bottom
  useEffect(() => {
    const onScroll = () => {
      if (!isGeneratingRef.current) return;
      const distFromBottom =
        document.documentElement.scrollHeight - window.scrollY - window.innerHeight;
      userScrolledUp.current = distFromBottom > 80;
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  // Pin to bottom on every new chunk — instant (no smooth) to avoid jitter
  useEffect(() => {
    if (isBusy && !userScrolledUp.current) {
      window.scrollTo({ top: document.documentElement.scrollHeight });
    }
  }, [slides, isBusy]);

  const canGenerate = topic.trim();
  const formSnapshot = JSON.stringify({ topic, slideCount, additionalFocus, presentationFocus, contentFormat, includeImageSuggestions });
  const unchangedSinceGeneration = slides !== null && lastGenerated === formSnapshot;

  const handleGenerate = async () => {
    setError(null);
    setSlides([]);
    setIsGenerating(true);
    setLastGenerated(formSnapshot);
    try {
      const res = await fetch("/api/cpd-slideshow", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "generate",
          topic,
          slideCount,
          additionalFocus,
          presentationFocus,
          contentFormat,
          includeImageSuggestions,
        }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error((data as { error?: string }).error || "Generation failed");
      }

      const reader = res.body!.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });

        // Parse any complete JSON lines
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";

        for (const line of lines) {
          const trimmed = line.trim();
          if (trimmed.startsWith("{") && trimmed.endsWith("}")) {
            try {
              const slide = JSON.parse(trimmed) as SlideData;
              setSlides((prev) => [...(prev ?? []), slide]);
            } catch {
              // incomplete or malformed line — skip
            }
          }
        }
      }

      // Handle any remaining buffered content
      const remaining = buffer.trim();
      if (remaining.startsWith("{") && remaining.endsWith("}")) {
        try {
          const slide = JSON.parse(remaining) as SlideData;
          setSlides((prev) => [...(prev ?? []), slide]);
        } catch {
          // ignore
        }
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
      setSlides(null);
    } finally {
      setIsGenerating(false);
    }
  };

  const handleRefine = async (instruction: string) => {
    if (!slides || !instruction.trim()) return;
    setIsRefining(true);
    try {
      const res = await fetch("/api/cpd-slideshow", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "refine", slides, instruction }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Refinement failed");
      setSlides(data.slides);
    } catch {
      // silently fail
    } finally {
      setIsRefining(false);
      setRefineInstruction("");
    }
  };

  const handleCopy = async () => {
    if (!slides) return;
    await navigator.clipboard.writeText(slidesToMarkdown(slides));
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const showResults = slides !== null && (slides.length > 0 || isGenerating);
  const expectedCount = slideCount;

  return (
    <div className="space-y-8">
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        <div className="lg:col-span-1">{sidebar}</div>

        <div className="lg:col-span-2">
          <Card className="space-y-6">

            <TopicField
              value={topic}
              onChange={setTopic}
              placeholders={[
                "e.g. Adaptive teaching strategies for mixed-ability classrooms",
                "e.g. Metacognition and self-regulated learning",
                "e.g. Effective feedback and marking strategies",
                "e.g. Supporting SEND pupils in mainstream classrooms",
              ]}
            />

            <LessonCountField
              value={slideCount}
              onChange={setSlideCount}
              label="Number of slides"
              unit="slides"
              min={2}
              max={20}
            />

            <AdditionalContextField
              value={additionalFocus}
              onChange={setAdditionalFocus}
              label="Additional focus areas"
              rows={3}
              placeholders={[
                "e.g. Include practical activities, focus on KS3 application",
                "e.g. Add time for group reflection and discussion",
                "e.g. Reference the Teachers' Standards throughout",
                "e.g. Include a slide on common misconceptions",
              ]}
            />

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
              <div className="space-y-1.5">
                <label className="block text-sm font-semibold text-gray-800">Presentation focus</label>
                <div className="flex flex-col gap-2 pt-1">
                  {(["Practical application", "Research and theory"] as PresentationFocus[]).map((val) => (
                    <label key={val} className="flex items-center gap-2 cursor-pointer">
                      <input type="radio" name="presentationFocus" checked={presentationFocus === val}
                        onChange={() => setPresentationFocus(val)} className="accent-gray-900" />
                      <span className="text-sm text-gray-700">{val}</span>
                    </label>
                  ))}
                </div>
              </div>

              <div className="space-y-1.5">
                <label className="block text-sm font-semibold text-gray-800">Content format</label>
                <div className="flex flex-col gap-2 pt-1">
                  {(["Text", "Text and bullet point summary"] as ContentFormat[]).map((val) => (
                    <label key={val} className="flex items-center gap-2 cursor-pointer">
                      <input type="radio" name="contentFormat" checked={contentFormat === val}
                        onChange={() => setContentFormat(val)} className="accent-gray-900" />
                      <span className="text-sm text-gray-700">{val}</span>
                    </label>
                  ))}
                </div>
              </div>
            </div>

            <div className="space-y-1.5">
              <label className="block text-sm font-semibold text-gray-800">Additional options</label>
              <label className="flex items-center gap-2 cursor-pointer">
                <input type="checkbox" checked={includeImageSuggestions}
                  onChange={(e) => setIncludeImageSuggestions(e.target.checked)}
                  className="accent-gray-900 w-4 h-4" />
                <span className="text-sm text-gray-700">Include image suggestions</span>
              </label>
            </div>

            <div className="flex gap-3">
              <ResetButton onClick={() => setConfirmingReset(true)} disabled={!slides} />
              <ConfirmModal
                open={confirmingReset}
                title="Reset form?"
                message="This will clear your current results and reset all form inputs."
                confirmLabel="Yes, reset"
                onConfirm={() => {
                  setTopic(""); setSlideCount(4); setAdditionalFocus("");
                  setPresentationFocus("Practical application");
                  setContentFormat("Text and bullet point summary");
                  setIncludeImageSuggestions(true);
                  setSlides(null); setError(null); setConfirmingReset(false);
                }}
                onCancel={() => setConfirmingReset(false)}
              />
              <GenerateButton
                onClick={handleGenerate}
                disabled={!canGenerate || isGenerating || unchangedSinceGeneration}
                isGenerating={isGenerating}
                hasResult={slides !== null}
              />
            </div>
          </Card>
        </div>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 rounded-md p-4 text-sm text-red-700">{error}</div>
      )}

      {showResults && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <h2 className="text-lg font-semibold text-gray-900">My results</h2>
              {isGenerating && (
                <span className="text-xs text-gray-500 font-medium">
                  {slides!.length} of {expectedCount} slides
                </span>
              )}
            </div>
            {slides && slides.length > 0 && !isGenerating && (
              <div className="flex items-center gap-2">
                <button onClick={handleCopy}
                  className="flex items-center gap-2 px-4 py-2 bg-[#1a1a1a] text-white rounded-xl text-sm font-medium hover:bg-gray-800 transition-colors">
                  {copied ? <><Check className="w-4 h-4" />Copied</> : <><Copy className="w-4 h-4" />Copy to clipboard</>}
                </button>
                <div className="relative">
                  <button onClick={() => setShowDownloadMenu((v) => !v)}
                    className="flex items-center gap-2 px-4 py-2 bg-[#1a1a1a] text-white rounded-xl text-sm font-medium hover:bg-gray-800 transition-colors">
                    Download <ChevronDown className="w-4 h-4" />
                  </button>
                  {showDownloadMenu && (
                    <div className="absolute right-0 mt-1 w-44 bg-white border border-gray-200 rounded-md shadow-lg z-10 py-1">
                      <button
                        onClick={async () => {
                          await exportSlidesToPdf(slides!, `cpd-${topic.slice(0, 30).replace(/\s+/g, "-") || "slideshow"}`);
                          setShowDownloadMenu(false);
                        }}
                        className="w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-50">
                        Download PDF
                      </button>
                      <button
                        onClick={async () => {
                          await exportSlidesToPptx(slides!, `cpd-${topic.slice(0, 30).replace(/\s+/g, "-") || "slideshow"}`);
                          setShowDownloadMenu(false);
                        }}
                        className="w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-50">
                        Download PPTX
                      </button>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>

          <div className="bg-stone-400 rounded-xl px-16 py-14 space-y-8">
            {slides!.map((slide, i) => {
              const props = { key: i, slide, index: i, total: isGenerating ? expectedCount : slides!.length };
              if (slide.type === "title")      return <TitleSlide      {...props} />;
              if (slide.type === "quote")      return <QuoteSlide      {...props} />;
              if (slide.type === "stat")       return <StatSlide       {...props} />;
              if (slide.type === "two-column") return <TwoColumnSlide  {...props} />;
              if (slide.type === "activity")   return <ActivitySlide   {...props} />;
              return <ContentSlide {...props} />;
            })}
            {isGenerating && <SlideSkeleton />}
          </div>
        </div>
      )}

      {slides && slides.length > 0 && !isGenerating && (
        <div className="bg-gray-50 border border-gray-200 rounded-xl p-6 space-y-4">
          <h3 className="text-base font-semibold text-gray-900">Want to refine your results?</h3>
          <p className="text-sm font-medium text-gray-600">What would you like to change?</p>
          <textarea
            value={refineInstruction}
            onChange={(e) => setRefineInstruction(e.target.value)}
            placeholder="Type changes here"
            rows={2}
            className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-gray-300 focus:border-transparent resize-none bg-white"
          />
          <div className="flex flex-wrap gap-2">
            {REFINE_CHIPS.map((chip) => (
              <button key={chip} type="button" onClick={() => setRefineInstruction(chip)}
                className="text-xs text-gray-600 border border-gray-200 rounded-full px-3 py-1 hover:bg-gray-100 transition-colors">
                {chip}
              </button>
            ))}
          </div>
          <button type="button" onClick={() => handleRefine(refineInstruction)}
            disabled={isRefining || !refineInstruction.trim()}
            className="bg-[#1a1a1a] text-white py-2 px-6 rounded-xl text-sm font-medium hover:bg-gray-800 transition-colors disabled:opacity-50 flex items-center gap-2">
            {isRefining ? <><Loader2 className="w-4 h-4 animate-spin" />Refining...</> : "Refine results"}
          </button>
        </div>
      )}
    </div>
  );
}
