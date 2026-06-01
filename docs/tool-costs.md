# Tool generation costs

Per-generation OpenAI cost estimates for every tool in Jooma.

**Pricing basis (USD):** gpt-4o = $2.50/1M input, $10/1M output · DALL·E 3 =
$0.04–0.08/image · gpt-image-1 ≈ $0.01–0.06/image · tts-1 = $15/1M chars.
**Anchor:** the slideshow text call measured 3,724 in + 1,976 out = $0.029.
All non-slideshow figures are estimates (gpt-4o pricing × typical output size).

| Tool | Model(s) | Est. cost / generation | Why the cost is there |
|---|---|---|---|
| SMART Targets | gpt-4o | ~$0.01–0.02 | Single call, short structured table output. |
| Letter Writer | gpt-4o | ~$0.01–0.02 | Single call, one short letter. |
| One Page Support Profile | gpt-4o | ~$0.01–0.02 | Single call, brief first-person profile. |
| Newsletter Writer | gpt-4o | ~$0.01–0.02 | Single call, a few short sections. |
| Meeting Planner | gpt-4o | ~$0.01–0.02 | Single call, agenda + short notes. |
| Performance Management Targets | gpt-4o | ~$0.01–0.02 | Single call, small SMART table. |
| Assembly Planner | gpt-4o | ~$0.01–0.02 | Single call, short script + notes. |
| Lesson Planner | gpt-4o | ~$0.02–0.04 | Single call, full structured lesson (~1–2k out tokens). |
| Worksheet Generator | gpt-4o | ~$0.02–0.04 | Single call, full worksheet of questions. |
| Comprehension Generator | gpt-4o | ~$0.02–0.04 | Single call, passage + questions. |
| Homework Generator | gpt-4o | ~$0.02–0.04 | Single call, differentiated task + answers. |
| Report Writer | gpt-4o | ~$0.02–0.05 | Single call, multi-subject narrative comments. |
| Quiz Generator | gpt-4o | ~$0.02–0.04 | Single call, multiple-choice set. |
| Model Answer Generator | gpt-4o | ~$0.02–0.04 | Single call, worked answers + notes. |
| Model Text Generator | gpt-4o | ~$0.02–0.04 | Single call, model text with features. |
| Phonics Support | gpt-4o | ~$0.02–0.04 | Single call, word banks + decodable text. |
| Sensory Activities | gpt-4o | ~$0.02–0.04 | Single call, 5 activity ideas. |
| Topic Overview | gpt-4o | ~$0.02–0.04 | Single call, structured overview. |
| Cover Lesson Generator | gpt-4o | ~$0.02–0.05 | Single call, self-contained lesson + script. |
| Targeted Intervention | gpt-4o | ~$0.02–0.04 | Single call, strategy list per pupil data. |
| Risk Assessment | gpt-4o | ~$0.02–0.04 | Single call, hazard/control table. |
| Inspection Prep Questions | gpt-4o | ~$0.02–0.04 | Single call, self-eval questions + actions. |
| Learning Walk Report | gpt-4o | ~$0.02–0.04 | Single call, observation write-up. |
| Lesson Observation Report | gpt-4o | ~$0.02–0.04 | Single call, formal observation report. |
| Policy Generator | gpt-4o | ~$0.03–0.06 | Single call, full policy document. |
| ECT Report Writer | gpt-4o | ~$0.02–0.05 | Single call, evidence-based assessment report. |
| Individual Behaviour Plan | gpt-4o | ~$0.03–0.05 | Single call, multi-section behaviour plan. |
| EYFS Action Plan | gpt-4o | ~$0.03–0.05 | Single call, 4-phase structured plan. |
| Pupil Premium Planner | gpt-4o | ~$0.03–0.05 | Single call, tiered strategies. |
| Medium Term Topic Planner | gpt-4o | ~$0.05–0.10 | Large output — lesson-by-lesson scheme. |
| EYFS Planner | gpt-4o | ~$0.05–0.10 | Large output — all 7 EYFS areas. |
| Exam Question Generator | gpt-4o | ~$0.05–0.10 | Large output — full paper + mark scheme. |
| School Improvement Plan | gpt-4o | ~$0.05–0.10 | Large output — objectives, actions, budget. |
| CPD Slideshow Generator | gpt-4o | ~$0.05–0.10 | Slide-by-slide text content (no images). |
| **Slideshow Generator** (web / auto images) | gpt-4o + Pixabay | **~$0.03–0.10** | **Measured: $0.033** (10 slides, everything on, 0 AI images). Images came free from Pixabay; cost is just the gpt-4o text. The common case. |
| **Slideshow Generator** (AI images) | gpt-4o + gpt-image-1/DALL·E | **~$0.35–0.85** | Only when image source = "AI" (or Pixabay misses and falls back). 8–12 images at $0.04–0.08 each then dominate the cost. |

## Slideshow add-ons & editor actions

| Item | Model(s) | Est. cost | Why |
|---|---|---|---|
| Audio activity (slideshow) | gpt-4o + tts-1 | ~$0.02–0.05 | Script written, then narrated ($15/1M chars). |
| YouTube video (slideshow) | — | $0.00 | YouTube Data API, no OpenAI call. |
| Regenerate image (editor) | gpt-image-1/DALL·E | ~$0.04–0.08 | One image generation. |
| Remove background (editor) | gpt-image-1 | ~$0.04–0.08 | One `images.edit` call. |

**Takeaways:**

- Text tools are effectively free (~2–5¢ each).
- The slideshow is **also ~3¢** in its normal "auto"/"web" mode — measured at
  $0.033 for a 10-slide deck with audio + YouTube on — because images come from
  **Pixabay for free**. The expensive case ($0.35–0.85) only happens when a
  user explicitly picks **AI image generation**.
- So the real cost driver is one toggle: **image source = AI**. Everything else
  is cents.

To measure exact figures for the text tools, add `stream_options:
{ include_usage: true }` + usage logging to their shared generation path (the
slideshow route already logs a real `COST` line to the dev console).

---

## Measured runs (real logs)

Actual `COST` lines from the dev console — ground truth, not estimates (except
image cost, which uses the `IMAGE_COST_USD` table in `app/lib/ai-image.ts`).

### Slideshow — "The French Revolution", 10 base slides, audio + YouTube on

| Image source | gpt-4o tokens | Text $ | Images | Image $ | Audio $ | Total |
|---|---|---|---|---|---|---|
| Auto / web (Pixabay) | 4,380 + 2,242 | $0.0334 | 0 AI | $0.0000 | (excl.) | **~$0.033** + audio |
| AI generation | 4,384 + 1,689 | $0.0278 | 11 (10× gpt-image-1 1024², 1× 1536×1024) | $0.4830 | (excl.) | **~$0.511** + audio |
| AI generation | 4,380 + 1,614 | $0.0271 | 11 (same mix) | $0.4830 | (excl.) | **~$0.510** + audio |
| AI generation (all-in) | 4,377 + 2,150 | $0.0324 | 14 (12× gpt-image-1 1024², 2× 1536×1024) | $0.6300 | $0.0123 | **~$0.675** |

**Observations:**
- Text generation is steady at ~$0.027–0.033 for a 10-slide deck.
- "Auto" mode used **0 AI images** — Pixabay served all 11, so the deck cost
  only its text (~3¢). The AI image source is the only thing that makes it pricey.
- Audio cost is now folded into the `COST` line (exact: gpt-4o tokens + tts-1
  chars), so the TOTAL is the true all-in figure.

### Console reconciliation (the important one)

The all-in run above **logged** $0.675, but the OpenAI **console** only rose by
**$0.26** ($1.17 → $1.43 in June) for that same generation. The logged image
cost was ~3× too high.

- Real image cost ≈ $0.26 − $0.032 text − $0.012 audio = **~$0.216 for 14
  gpt-image-1 images ≈ $0.015 each** (square).
- `IMAGE_COST_USD` in `app/lib/ai-image.ts` is now **calibrated to this**:
  $0.015 (1024²), $0.022 (1536×1024). The same deck now logs ~$0.27, matching
  the console.
- **Corrected all-in slideshow cost with AI images: ~$0.25–0.30** (not ~$0.67).
- Caveat: image-gen billing can lag in the console — re-check after a few hours
  to confirm $0.26 didn't rise.

### Other tools

Not yet measured — they don't log cost. To capture real numbers, add usage
logging (or wrap `getOpenAI()` to log `completion.usage`) and record runs here.
