// Extracts text content from a user-supplied resource so the slideshow
// generator can ground the AI in the teacher's own material.
//
// Two flavours:
//   1. `multipart/form-data` with a `file` field — PDF / DOCX / TXT supported.
//      PDFs are parsed via pdf-parse, DOCX via mammoth, TXT read as-is.
//   2. `application/json` with `{ "url": "https://..." }` — fetches the page
//      server-side, strips HTML tags, normalises whitespace.
//
// The response always shapes the same:
//   { text: string, source: string }
//
// `source` is a short human label used by the UI to show what was attached
// (e.g. "report.pdf" or "wikipedia.org/wiki/..."). `text` is truncated to
// ~30k chars so the AI prompt stays sane.

import { NextRequest, NextResponse } from "next/server";
import { recordUsage } from "@/app/lib/usage";

export const runtime = "nodejs"; // pdf-parse + mammoth aren't edge-compatible
export const maxDuration = 30;

const MAX_CHARS = 30_000;
const MAX_FILE_BYTES = 10 * 1024 * 1024; // 10 MB

export async function POST(req: NextRequest) {
  const ct = req.headers.get("content-type") ?? "";
  try {
    if (ct.includes("application/json")) {
      const body: { url?: string } = await req.json();
      const url = body.url?.trim();
      if (!url) {
        return NextResponse.json({ error: "Missing url" }, { status: 400 });
      }
      return await extractFromUrl(url);
    }
    if (ct.includes("multipart/form-data") || ct.includes("application/x-www-form-urlencoded")) {
      const form = await req.formData();
      const file = form.get("file");
      if (!(file instanceof File)) {
        return NextResponse.json({ error: "Missing file" }, { status: 400 });
      }
      if (file.size > MAX_FILE_BYTES) {
        return NextResponse.json({
          error: `File too large (max ${MAX_FILE_BYTES / 1024 / 1024} MB)`,
        }, { status: 413 });
      }
      return await extractFromFile(file);
    }
    return NextResponse.json({
      error: "Send multipart/form-data with `file`, or JSON with `url`",
    }, { status: 400 });
  } catch (err) {
    console.error("[extract-resource] failed:", err);
    return NextResponse.json({
      error: err instanceof Error ? err.message : "Extraction failed",
    }, { status: 500 });
  }
}

async function extractFromUrl(url: string): Promise<NextResponse> {
  let target: URL;
  try {
    target = new URL(url);
  } catch {
    return NextResponse.json({ error: "Invalid URL" }, { status: 400 });
  }
  if (!/^https?:$/.test(target.protocol)) {
    return NextResponse.json({ error: "Only http(s) URLs are supported" }, { status: 400 });
  }
  const r = await fetch(target.toString(), {
    headers: { "User-Agent": "JoomaResourceExtractor/1.0 (+https://jooma)" },
    redirect: "follow",
  });
  if (!r.ok) {
    return NextResponse.json({
      error: `Couldn't fetch URL (status ${r.status})`,
    }, { status: 502 });
  }
  const contentType = r.headers.get("content-type") ?? "";
  // For PDFs served over the web, run them through the file pipeline.
  if (contentType.includes("application/pdf")) {
    const arr = await r.arrayBuffer();
    const text = await parsePdfBuffer(Buffer.from(arr));
    return NextResponse.json({
      text: truncate(text),
      source: target.hostname + target.pathname,
    });
  }
  const html = await r.text();
  const text = htmlToText(html);
  console.log(`[extract-resource] url=${target.hostname}${target.pathname} chars=${text.length}`);
  if (!text.trim()) {
    return NextResponse.json({
      error: "The page returned no readable text. It might be a JavaScript-only single-page app — try pasting the article's plain text into a TXT file instead.",
    }, { status: 422 });
  }
  return NextResponse.json({
    text: truncate(text),
    source: target.hostname + target.pathname,
  });
}

async function extractFromFile(file: File): Promise<NextResponse> {
  const name = file.name || "uploaded-file";
  const lower = name.toLowerCase();
  const buf = Buffer.from(await file.arrayBuffer());

  let text = "";
  let kind: "pdf" | "docx" | "txt" | null = null;
  if (lower.endsWith(".pdf") || file.type === "application/pdf") {
    kind = "pdf";
    text = await parsePdfBuffer(buf);
  } else if (
    lower.endsWith(".docx") ||
    file.type === "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
  ) {
    kind = "docx";
    const mammoth = await import("mammoth");
    const result = await mammoth.extractRawText({ buffer: buf });
    text = result.value;
  } else if (lower.endsWith(".txt") || lower.endsWith(".md") || file.type.startsWith("text/")) {
    kind = "txt";
    text = buf.toString("utf8");
  } else {
    return NextResponse.json({
      error: "Unsupported file type. Use PDF, DOCX, or plain text.",
    }, { status: 400 });
  }

  // Log what we got so empty-text bugs are easier to diagnose without
  // having to reproduce them. Includes file kind + char count.
  console.log(`[extract-resource] file=${name} kind=${kind} chars=${text.length}`);

  // For PDFs `parsePdfBuffer` already tried the text layer THEN Claude OCR.
  // If we're still empty, both paths failed — surface a clear final error.
  if (!text.trim()) {
    return NextResponse.json({
      error: kind === "pdf"
        ? "We couldn't read this PDF, even with OCR. It may be password-protected, corrupted, or empty."
        : "The file appears to be empty.",
    }, { status: 422 });
  }

  return NextResponse.json({
    text: truncate(text),
    source: name,
  });
}

// Two-stage PDF extraction:
//   1. unpdf reads the text layer (fast, free, lossless on digital PDFs)
//   2. If the text layer is empty (scanned / image-based PDF), fall back to
//      OpenAI with PDF file input — gpt-4o ingests the PDF directly, uses
//      vision internally to OCR the page images, and returns plain text.
//
// We only OCR when stage 1 is empty, so digital PDFs stay free and instant
// while scanned ones still come through automatically. Both unpdf and the
// OpenAI client are lazy-imported.
async function parsePdfBuffer(buf: Buffer): Promise<string> {
  const { extractText } = await import("unpdf");
  // Re-view the Node Buffer as a clean Uint8Array of the same memory range.
  // `new Uint8Array(buf)` without offsets is fine for full-length buffers,
  // but this form is correct even for buffers that came from a pooled slab.
  const data = new Uint8Array(buf.buffer, buf.byteOffset, buf.byteLength);
  const { text, totalPages } = await extractText(data, { mergePages: true });
  const merged = Array.isArray(text) ? text.join("\n\n") : text ?? "";
  console.log(`[extract-resource] pdf totalPages=${totalPages} unpdfChars=${merged.length}`);
  if (merged.trim()) return merged;

  // No text layer — try OCR via OpenAI.
  if (!process.env.OPENAI_API_KEY) {
    console.warn("[extract-resource] no OPENAI_API_KEY, can't OCR this PDF");
    return "";
  }
  console.log(`[extract-resource] empty text layer — running OpenAI OCR fallback`);
  const ocrText = await ocrPdfWithOpenAI(buf);
  console.log(`[extract-resource] ocr chars=${ocrText.length}`);
  return ocrText;
}

// OpenAI-based OCR fallback for scanned/image-based PDFs. Uses gpt-4o's
// `file` content type — the model accepts a base64 data URL of the PDF
// directly, renders pages internally with vision, and returns transcribed
// text. Single chat completion, no streaming, no system prompt.
async function ocrPdfWithOpenAI(buf: Buffer): Promise<string> {
  const { getOpenAI } = await import("@/app/lib/openai");
  const client = getOpenAI();
  const base64 = buf.toString("base64");
  try {
    const completion = await client.chat.completions.create({
      model: "gpt-4o-2024-08-06",
      max_tokens: 8000,
      messages: [
        {
          role: "user",
          content: [
            {
              type: "file",
              file: {
                filename: "resource.pdf",
                file_data: `data:application/pdf;base64,${base64}`,
              },
            },
            {
              type: "text",
              text:
                "Transcribe ALL readable text from this PDF in natural reading order. " +
                "Output ONLY the transcription — no headers like 'Page 1', no commentary, " +
                "no Markdown formatting. Preserve paragraph breaks with blank lines.",
            },
          ],
        },
      ],
    });
    void recordUsage("extract-resource", "gpt-4o-2024-08-06", completion.usage);
    return completion.choices[0]?.message?.content ?? "";
  } catch (err) {
    console.warn("[extract-resource] OpenAI OCR failed:", err);
    return "";
  }
}

// Very basic HTML → plain text. Drops <script>/<style>, strips tags, decodes
// the handful of entities that show up most. Good enough for blogs / wikis;
// not trying to be Readability.
function htmlToText(html: string): string {
  return html
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, "")
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, "")
    .replace(/<!--[\s\S]*?-->/g, "")
    .replace(/<\/?[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, " ")
    .trim();
}

function truncate(text: string): string {
  if (text.length <= MAX_CHARS) return text;
  return text.slice(0, MAX_CHARS) + "\n…(truncated)";
}
