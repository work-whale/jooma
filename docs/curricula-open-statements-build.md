# Curricula: open-licence statements, build log

Started 2026-11-28. Follows `docs/curricula-gaps-handover.md` section 3 (open sources). Plan: `C:\Users\kitki\.claude\plans\hey-claude-please-read-swift-thimble-of-e83d4189-08b7-4431-893b-7cb543730ead.md`.

## 1. Owner decisions (2026-11-28)

- Batch 1 = Japan and Taiwan. Opus builds.
- **Official text only.** A statement is the source's own words, never a translation by Jooma. Official English is used where it exists; otherwise the statement is in the source's language, with a note on the card.
- **Core four subjects:** national language, mathematics, science, English as a foreign language.
- Senior high (Japan): the compulsory first courses only, at every senior high age (default from the plan; no objection).

## 2. Japan: Course of Study (MEXT), framework `jp-cos` (BUILT)

### 2.1 Sources

Page: https://www.mext.go.jp/a_menu/shotou/new-cs/1384661.htm, fetched 2026-11-28. Saved in `docs/standards/japan/`:

| File | Document | sha256 |
|---|---|---|
| `mext-cos-01.pdf` | 小学校学習指導要領（平成29年告示） | 6af90f134b243e44f9767c37ee3079fac092883fd6359b836a5733dd25b43902 |
| `mext-cos-02.pdf` | 中学校学習指導要領（平成29年告示） | 42f967302945fd435a383db15e52e0459885b17285bce801feebbed95935debb |
| `mext-cos-03.pdf` | 高等学校学習指導要領（平成30年告示） | 59ef17a825bd11a4fa39ed2cc1f27033c83a95e4e93f0f8a821a65e063bb2512 |

Official English: MEXT's English page (https://www.mext.go.jp/en/policy/education/elsec/title02/detail02/1373859.htm) has the 2017 General Provisions only. Its subject translations are of the 2008 revision, so they were not used. The statements are Japanese.

Licence: MEXT's website usage policy (https://www.mext.go.jp/en/other/title01/detail01/1375290.htm) follows the Government of Japan Standard Terms of Use (Ver. 2.0): commercial use allowed with the source named. An edited work must say it was edited, and pulling items into a list counts as editing. Credit (`app/lib/standards/credits.ts`, stored with the data too): "Course of Study (学習指導要領) for elementary, junior high and senior high schools: Ministry of Education, Culture, Sports, Science and Technology (MEXT), https://www.mext.go.jp/a_menu/shotou/new-cs/1384661.htm. Statements are excerpts from the official Japanese text, edited by Jooma into a list. Used under the Government of Japan Standard Terms of Use (Ver. 2.0)."

### 2.2 What a statement is

A leaf of the numbered content list under "２ 内容" (items ア, （ア）, ㋐ nested by indent), per grade or band. Left out: goals (１ 目標), lead-ins that only introduce a list, example language activities (言語活動) and the situations and functions lists of the English sections, 〔数学的活動〕, 〔用語・記号〕, handling notes (内容の取扱い), and the planning section. A first line of 20 characters or fewer over more lines is a title ("光の反射・屈折", "数と式") and is joined to its description with "："; a first-level title becomes part of the strand.

- `subject`: English label (Japanese, Mathematics, Science, English): the topic matcher reads it.
- `strand`: the source's own heading (`Ａ 数と計算`, `第１分野 身近な物理現象`, `数学Ⅰ 数と式`, `外国語活動 〔知識及び技能〕 ...`).
- Ages: Elementary N = N + 5, Junior High N = N + 11; bands (第１学年及び第２学年) take both ages; junior high science and English, and every senior high course, take all three ages of their school. The same item in two grades is one statement with both ages.
- Ids: `jp-cos-` + the first 10 hex digits of sha1(stage|subject|strand|text). No codes in the source.

Parts read (PDF pages): elementary 国語 30 to 47, 算数 66 to 95, 理科 96 to 113, 外国語 158 to 166 (Elementary 5 and 6), 外国語活動 175 to 180 (Elementary 3 and 4); junior high 国語 31 to 42, 数学 67 to 79, 理科 80 to 100, 外国語 146 to 155; senior high 現代の国語 and 言語文化 35 to 40, 数学Ⅰ 93 to 95, 科学と人間生活 and the four 基礎 courses 105 to 131, 英語コミュニケーションⅠ 165 to 169.

### 2.3 What the PDFs do, and what the builder does about it

`scripts/build-asia-standards.mjs --country=japan` reads text items with their positions (unpdf):

- **Furigana** is 5.5 pt over the 11 pt text: dropped. **Superscripts** (cm², x², aⁿ) are 6.4 to 7.1 pt, raised a few points: written as ², ³, ⁿ.
- **The text block moves** from page to page: each page is shifted so the right edge most long lines end at is fixed, so indents compare across a page turn.
- **Senior high** is set larger on a wider page; its handling notes are 8.5 pt (dropped); its ㋐ is a circle (a control character) with a small ア inside, rebuilt as ㋐; some items carry stray control characters.
- **Headings set in a font with no Unicode map** (for example "第３ 指導計画の作成と内容の取扱い") are not in the text at all, in pdf.js or poppler. The content stops on the planning section's first line instead ("１ 指導計画の作成に当たっては").
- **Fractions are pictures.** A gap in a mathematics line is marked and must be filled from `JP_FIX` (the statement as read, with each gap shown as [?], and as printed), or the build stops. Read off the rendered pages on 2026-11-28:

| PDF page | As printed |
|---|---|
| 01 p70 | 1/2，1/3など簡単な分数について知ること。 |
| 01 p73 | ... 1000 倍，1/10の大きさの数 ... |
| 01 p75 (two) | ... 小数の表し方及び1/10の位 ...; 1/10の位までの小数の加法及び減法 ... |
| 01 p80 | 四則の混合した式や（ ）を用いた式 ... (spacing, not a picture) |
| 01 p85 | ... 1000 倍，1/10，1/100などの大きさの数 ... |
| 02 p76 | 円周角と中心角の関係 ... (blank space in the print) |

- Outside mathematics a gap is table or list spacing and becomes a space. One em dash in the source (島弧-海溝系, 地学基礎) is written as a hyphen (brand rule, as the UK builder does).

### 2.4 Counts (pinned in `tests/unit/asia-standards.spec.ts`)

865 statements, 42 KB gzipped (one on-demand chunk). Per age:

| Subject | 6 | 7 | 8 | 9 | 10 | 11 | 12 | 13 | 14 | 15 to 17 |
|---|---|---|---|---|---|---|---|---|---|---|
| Japanese | 31 | 31 | 33 | 33 | 35 | 35 | 28 | 28 | 25 | 41 |
| Mathematics | 25 | 30 | 42 | 49 | 43 | 27 | 34 | 30 | 34 | 25 |
| Science | | | 23 | 25 | 24 | 31 | 85 | 85 | 85 | 74 |
| English | | | 6 | 6 | 14 | 14 | 14 | 14 | 14 | 14 |

### 2.5 App changes

- `FrameworkId` gains `jp-cos`; `FRAMEWORK_NAME` "Course of Study (MEXT)", `FRAMEWORK_AGES` 6 to 17, loader, `FRAMEWORK_PERMITTED` (licence note), `FRAMEWORK_CREDIT`, `/terms` section 13.
- `FRAMEWORK_LANGUAGE_NOTE` (new, `credits.ts`): the card shows "Statements are shown in Japanese, as MEXT publishes them. Your resource is still written in the language you choose."
- `japan` gets `alignment: { frameworks: ["jp-cos"], adapted: false }`; provenance updated.
- Prompt (`curriculumPromptBlock`): when a statement is in Chinese characters, kana or hangul, one fixed line follows the list: use the statements for content and level only, write the whole output in the output language, and translate any of their terms. No language is named (the batch A lesson: the curriculum block comes late, and a language named there pulls the output into it). English statements get no line, so every other curriculum's prompt is unchanged.
- Topic matcher: "Japanese", "kokugo" and 国語 pick Japan's Japanese (in England "Japanese" still means modern languages); 算数, 数学, 理科 and 英語 pick their subjects.

### 2.6 Tests

- Unit `tests/unit/asia-standards.spec.ts` (21): ids, shape, pinned counts, six statements word for word with strand and ages, the pictures written in, what must never be a statement (lead-ins, goals, activities, furigana, advanced courses), clean text, credit; every statement against the PDFs read a second way (pdf.js reading order, furigana allowed after a kanji; one statement over a page break pinned by id); the curriculum, year ages (Elementary 1 = 6, Grade 2's fractions not in Grade 1), what the card sends, permission off, the card note, the terms credit, the matcher, the prompt line and its absence for English statements. Mutation check: changing one character of one statement (時刻 to 時計) fails the PDF test.
- Updated: `standards.spec.ts` (permissions list), `curricula-stage3-b.spec.ts` (Japan now has statements).
- E2E `tests/tools/curricula-standards.spec.ts`: a Japan Elementary 4 teacher aligns a worksheet (model mocked).
- Live: see 2.7.

### 2.7 Results (2026-11-28)

- Unit: whole suite 2,732 passed (21 new in `asia-standards.spec.ts`). `tsc` clean, ESLint clean on every changed file, language check passed.
- E2E against a staging production build on :3000: `tests/tools/curricula-standards.spec.ts` 5 of 5 (the Japan case new).
- Live (`LIVE_MODEL=1`, `tests/tools/curricula-open-statements-live.spec.ts`): 1 of 1. An Elementary 4 worksheet aligned to 面積の単位... came back in English, on area units (cm², m², km²), with a Japanese touch ("cities and prefectures") and no Japanese script. Screenshot and results in `docs/screenshots/2026-11-28-open-statements-live/` (gitignored). tool_settings checked afterwards (2026-11-28): the worksheet generator uses gpt-5.6-luna, effort low, verbosity medium on both staging and production, so the run is representative.
- Build: the Japan data is its own on-demand chunk (231 KB, 41 KB gzipped); Next 16's build output no longer prints route sizes.
- Release: Japan is behind the existing batch B switch (`curricula_s3_b`), so the statements go live with the batch B release. No migration.

## 3. Taiwan: Curriculum Guidelines of 12-Year Basic Education, frameworks `tw-108-zh` and `tw-108-en` (BUILT 2026-11-28)

### 3.1 Sources

Page: https://www.naer.edu.tw/eng/PageSyllabus?fid=148, "Domains / Subjects Curriculum Guidelines" tab (a POST form; the list is not in the page's first HTML). Fetched 2026-11-28, saved in `docs/standards/taiwan/`:

| File | Document | Language | sha256 |
|---|---|---|---|
| `naer-mandarin-zh.pdf` | 國民中小學暨普通型高級中等學校 語文領域 國語文 | Chinese (no official English) | 210b2bea291bbc294584a6ae5796f88e9481298e9ce82067138a0b6808dcd72c |
| `naer-maths-zh.pdf` | 國民中小學暨普通型高級中等學校 數學領域 | Chinese (no official English) | 334bc052dc1812516470dc162c818074e9eca0c20a3d3a02af269dd42394188a |
| `naer-english-en.pdf` | 語文領域 英語文, 12年國教課綱英譯 (公告版) | Official English translation | 4fc2f86928d378b3b4195a7cec3db1b0bcf2b3771cec1ae5bed1fb6ad719e6a0 |
| `naer-science-en.pdf` | 自然科學領域, 12年國教課綱英譯 (公告版) | Official English translation | 069d594ce73b69c06ea046106d2ed820cca875b27619c052cc67d8dad86e7435 |

NAER also publishes official English ("英譯 公告版") for Social Studies and Technology; not in this batch's scope.

Licence (checked 2026-11-28): NAER's own declaration, 政府網站資料開放宣告, https://www.naer.edu.tw/PageDoc?fid=324 (Chinese only). Section 一 grants "國家教育研究院全球資訊網上刊載之所有資料與素材" free, non-exclusive, irrevocable and sublicensable, for reproduction, adaptation, editing, public transmission and value-added derivatives, on one condition: "然使用時，應註明出處。" (credit the source). Exclusions: patents, trademarks and agency logos (二(一)); some audiovisual, image, score or commissioned works marked as needing consent, and works NAER does not own (二(三)); moral rights to be respected, no malicious alteration, no implied endorsement (三 to 五). It does **not** name the OGDL (the earlier note here was wrong): the credit names NAER's declaration instead. The Ministry of Education issues the guidelines and NAER publishes them; no consent notice is attached to the guideline PDFs. **For the owner:** if you want certainty that 二(三) does not reach Ministry-issued documents, one email to NAER would settle it; the build assumes the declaration covers them, as it covers "all material on the site".

Credits (in `credits.ts`, stored in each JSON, on `/terms` section 13): name the guidelines, the Ministry, NAER and the PageSyllabus URL, say the statements are excerpts "edited by Jooma into a list", and name the declaration's URL.

### 3.2 Structure (for the builder)

- Every statement has a code. Learning performances by stage: maths `n-II-1`, Mandarin `6-I-1`, science `tr-Ⅱ-1` and `po-Ⅲ-1` (the English translations use Roman numeral characters, U+2160 on). Learning content: maths by grade `N-3-1` (11A, 11B and 12 甲/乙 in senior high), Mandarin and science by stage (`Aa-I-1`, `INa-Ⅱ-1`).
- Stages: I = Grades 1 and 2, II = 3 and 4, III = 5 and 6, IV = 7 to 9, V = 10 to 12. Taiwan's registry ages: Grade 1 = 6.
- Maths lists the performances twice (by stage, then by category): take the first listing only.
- Maths learning content is a five-column table (code, item and explanation, notes, teaching aids, linked performances): only the item and explanation column is a statement. Needs a positional table reader.
- Senior high: required courses only (部定必修), not the 加深加廣 electives, matching Japan.
- The card note will need a Chinese line (Mandarin and maths) and none for English and science. Decided at the build: two framework ids, `tw-108-zh` and `tw-108-en` (not `tw-108`: an existing rule says no framework id may start another's).

### 3.3 What a statement is

One coded row of a learning performance (學習表現) or learning content (學習內容) table, its text as printed, with its code (`5-II-3`, `Ab-II-6`, `n-IV-1`, `S-8-6`, `ti-Vc-1`, `BDa-Vc-1`). Stage numerals are written I to V in plain letters (the books mix Ⅳ and IV). Strand: "學習表現 聆聽" or "學習內容 字詞" in Chinese, "Learning content: Matter and energy" in English, with the category names the guidelines print (a test checks each is in the PDF).

Ages: stage I = Grades 1 and 2 (6, 7), II = 8, 9, III = 10, 11, IV = 12 to 14, V and Vc = 15 to 17. Maths content goes by grade (Grade g = age g + 5; 11A and 11B = 16).

Included:
- Mandarin performances and content.
- Maths performances (the first, by-stage listing) and content for Grades 1 to 10, 11A and 11B. Grade 12 is electives only, so Grade 12 has the stage V performances only.
- English performances and content (stages II to V).
- Science performances and content: elementary (stages II and III), junior high (including the three cross-subject themes), senior high required courses (Vc: biology, physics, chemistry, earth sciences).

Left out: electives (maths 12甲/12乙, science Va, English section 3, Mandarin 加深加廣), the uncoded "Inquiry and Practices" course, and the appendices. Marks are dropped from text and code: ◎ (repeated in another stage), * (higher level), and in maths ※ (extension), ★ (not assessed directly), ＃ (taught within another topic). There is no science or English before Grade 3; the guidelines start both at stage II.

### 3.4 What the PDFs do, and what the builder does about it

`scripts/build-asia-standards.mjs --country=taiwan`:

- **Column reader** (Mandarin, English, science):
  - In each column a code starts a statement, and lines below it at the text's indent (within 4 to 6 points) continue it, across a page turn. Headers and stage labels sit at other indents.
  - The code is matched on a copy of the row with every gap spaced, so a statement that starts with a number ("Ab-Ⅰ-1" then "1,000個") keeps its digits.
- **Cell reader** (maths):
  - The code sits in the middle of its cell, with text above and below it, so cells are cut along the table's drawn row rules.
  - Only the item column is the statement, not the notes, teaching aids or linked performances.
  - A cell with no code at the top of a page continues the last one.
- **Small text:** exponents and indices (8.4 pt against 12) become Unicode superscripts and subscripts (𝑎ᵐ⁺ⁿ, 10ˣ, (𝑎+𝑏)²). One with no Unicode form stops the build.
- **Characters:**
  - NFC turns the CJK compatibility forms the fonts use (U+F97E for 量, in 64 statements) into the usual ones.
  - The Symbol font's × (U+F0B4, "3×3×3") is mapped.
  - Any other private-use character stops the build.
- **Drawn symbols:** shapes inside the maths text column, tracked through the drawing transform, mark their cell. Each such cell must be in `TW_FIX` (read off the rendered page), or the build stops.
  - S-9-4 lost two √: "1:√3:2" and "1:1:√2".
  - G-8-1's overline and root became "𝐴̅𝐵̅=√((𝑎−𝑐)²+(𝑏−𝑑)²)". The brackets are added so it reads the same on one line.
  - N-8-2 and N-10-1 keep a √ that is set as text; the shape is only its bar.
- **Column edges vary by page:** elementary science content's stage III codes start at x 324 on some pages, so the edge is 320 (column II text never starts past 316).
- **Page numbers** (y 52 in the English guideline) are dropped below y 56.
- **Kept as printed:** EHa-Vc-3's "roles s", a typo in NAER's English.

### 3.5 Counts (pinned in `tests/unit/taiwan-standards.spec.ts`)

`tw-108-zh` has 724 statements (Mandarin 331, maths 393); `tw-108-en` has 997 (English and science). Per age:

| Age | 6 | 7 | 8 | 9 | 10 | 11 | 12 | 13 | 14 | 15 | 16 | 17 |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| Mandarin | 59 | 59 | 79 | 79 | 74 | 74 | 62 | 62 | 62 | 57 | 57 | 57 |
| Mathematics | 25 | 38 | 44 | 46 | 51 | 43 | 63 | 67 | 57 | 58 | 70 | 35 |
| English | | | 50 | 50 | 88 | 88 | 116 | 116 | 116 | 147 | 147 | 147 |
| Science | | | 75 | 75 | 92 | 92 | 246 | 246 | 246 | 183 | 183 | 183 |

JSON sizes: tw-108-zh 199 KB raw (37 KB gzipped); tw-108-en 309 KB raw (50 KB gzipped). Each is its own on-demand chunk.

### 3.6 App changes

- `FrameworkId` gains `tw-108-zh` and `tw-108-en`.
- `FRAMEWORK_NAME`: both "Curriculum Guidelines of 12-Year Basic Education".
- `FRAMEWORK_AGES`: zh 6 to 17, en 8 to 17. Loader cases for both.
- `FRAMEWORK_PERMITTED`: both on, with the licence note.
- `FRAMEWORK_CREDIT`: two credits.
- `FRAMEWORK_LANGUAGE_NOTE["tw-108-zh"]`: "Mandarin and mathematics statements are shown in Chinese, as Taiwan's Ministry of Education publishes them. ..." None for en.
- `/terms` section 13 lists both credits.
- `alignment` on the taiwan entry, and provenance.
- Matcher words:
  - Mandarin, Chinese, 國語, 國文, 中文 map to Mandarin.
  - 英文 maps to English; 自然 maps to Science.
  - In England, "Mandarin" stays a modern language.
- The prompt's own-language line (added for Japan) already fires on Han script.

### 3.7 Tests and results (2026-11-28)

`tests/unit/taiwan-standards.spec.ts`, 25 tests. The data tests cover:
- ids and `frameworkOf`, and that codes are complete.
- No serial number missing in any run.
- Ages by stage or grade, with a shifted-band check.
- Pinned counts, and known statements word for word.
- The written-in symbols.
- Electives, repeats, marks and headers are never statements, and the text is clean.
- The credits.

The PDF tests cover:
- **Every statement is in its PDF**, read in pdf.js order. Because pdf.js reads tables row by row, the text is matched as runs of four or more characters in order. S-9-4 and G-8-1 are exempt by name; TW_FIX guards them.
- **Every code the PDFs print is a statement**, electives aside. Mutation-checked: dropping two statements fails it.
- The category names are in the PDFs.

The wiring tests cover the curriculum entry, the card, permission off, the note, the terms page, the matcher and the prompt line.

The PDF checks found three builder faults during the build, all fixed:
- Page numbers appended to English content.
- A "*" mark in text.
- The INf-III and INg-III runs (13 statements) swallowed into stage II by the column edge.

Results:
- **Unit:** whole suite 2,757 passed; tsc clean; ESLint clean on changed files; language check passed.
- **E2E:** `tests/tools/curricula-standards.spec.ts` 6 of 6 on a staging production build. The new Taiwan Grade 8 case checks:
  - The subjects listed are Mandarin, Mathematics, English and Science.
  - The English statements are in official English.
  - S-8-6 shows in Chinese with its code, is ticked and is sent as `tw-108-zh-ce31a3ca1d`.
  - The note and both credits show.
- **Live** (`LIVE_MODEL=1`): worksheet settings were re-diffed first (staging = production: gpt-5.6-luna, low, medium). Taiwan Grade 8 with S-8-6 (畢氏定理) produced an English worksheet on the Pythagorean theorem, 5,902 characters, with no Chinese script. 1 of 1.

## 5. Norway: LK20 curricula (Udir), framework `no-lk20` (BUILT 2026-11-28)

Batch 2 started at the owner's request ("Lets continue with norway"), under the same rules: official text only, the core four subjects.

### 5.1 Source and licence

- **Data:** Udir's Grep REST API, https://data.udir.no/kl06/v201906/. `scripts/fetch-norway-grep.mjs` saves the plans, their competence aim sets, every aim and the core elements the aims link to in one snapshot. The builder reads only the snapshot, so a build is repeatable.
  - Snapshot: `docs/standards/norway/grep-snapshot.json`, fetched 2026-11-28, 8 plans, 54 sets, 592 aims, 39 core elements.
  - sha256: e153e20de0a5a316626c2690900e827323d96b7260ee833a8b71e8889c682a0a.
  - Udir's page says REST API keys apply from 1 September 2026, but the API answered without one on 2026-11-28. A refetch may need a key.
- **Plans** (all `status_publisert`; the first five revised from 2026-08-01, replacing NOR01-07, MAT01-05, NAT01-04, ENG01-05 and MAT09-01):
  - NOR01-08 Norwegian
  - MAT01-06 Mathematics Years 1 to 10
  - MAT09-02 Mathematics T (Vg1)
  - NAT01-05 Natural science
  - ENG01-06 English
  - MAT08-01 Mathematics P (Vg1), with its vocational 1P-Y versions
  - MAT05-04 Mathematics 2P (Vg2)
  - MAT06-04 Mathematics 2P-Y (Vg3 supplementary)
- **Licence:** NLOD. https://www.udir.no/om-udir/data/ says "Dataene er lagt ut for viderebruk under Norsk lisens for offentlig data (NLOD)" (copy, change, combine, use commercially). The terms page https://www.udir.no/om-udir/data/vilkar-for-bruk/ asks for the credit "Contains data under NLOD, made available on data.udir.no" and says the Udir logo may not be used. The NLOD 2.0 page itself (data.norge.no) did not load (HTTP 406); Udir's wording is used.
- **Language:** every aim carries `nob`, `nno` and `eng` text. Only the Norwegian is the regulation (`forskrift: true`). Udir publishes the English on its curriculum pages (`?lang=eng`) and as PDFs, with no "unofficial" notice found, so under the owner's rule (official English where it exists) the statements are Udir's English. No card language note.

### 5.2 What a statement is, ages and strands

- One competence aim (kompetansemål), Udir's English word for word. Id `no-lk20-km<Grep code>`, no code shown (Udir does not number aims).
- **Ages come from each set's title** (the regulation's "Year 4", "vg1"). A Years 1 to 10 set covers the years since the plan's previous set:
  - After Year 2 = Years 1 and 2; after Year 4 = Years 3 and 4; after Year 7 = Years 5 to 7; after Year 10 = Years 8 to 10. Maths has a set for every year from Year 3.
  - Vg1 = 16, Vg2 = 17, Vg3 and the Vg3 supplementary programme = 18.
  - Grep's own "used in" years are not used: for natural science's Year 4 set (KV1076) they say Years 4 and 5, which would leave Year 3 with no science.
- **Strand:**
  - Years 1 to 10: the first core element the aim links to (e.g. "Energy and matter", "Working with texts in English"). Five maths aims link to none: "Other competence aims".
  - Upper secondary: the course or programme the set is for (e.g. "Mathematics 1P-Y for Building and Construction", "Vg1 programmes for general studies").
- **Upper secondary scope:** the common core (fellesfag) courses in these subjects, vocational programme versions included, since each is required for its students. **For the owner:** this makes Vg1 long (86 maths aims across 12 courses, 86 science aims across 11 programmes; the strand filter narrows it). Dropping the vocational versions is a one-line change in the builder if you prefer.
- **No aims exist for:** science in Vg2; English in Vg2 and Vg3. The common core ends there.

### 5.3 Counts (pinned in `tests/unit/norway-standards.spec.ts`)

592 statements. JSON 168 KB raw, 19 KB gzipped, its own on-demand chunk.

| Age | 6 | 7 | 8 | 9 | 10 | 11 | 12 | 13 | 14 | 15 | 16 | 17 | 18 |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| Norwegian | 14 | 14 | 16 | 16 | 17 | 17 | 17 | 16 | 16 | 16 | 13 | 22 | 29 |
| Mathematics | 15 | 15 | 12 | 10 | 10 | 11 | 11 | 10 | 11 | 11 | 86 | 7 | 10 |
| Science | 10 | 10 | 17 | 17 | 21 | 21 | 21 | 22 | 22 | 22 | 86 | | 10 |
| English | 11 | 11 | 15 | 15 | 16 | 16 | 16 | 19 | 19 | 19 | 34 | | |

### 5.4 App changes

- `FrameworkId` + `no-lk20`. Name "LK20 curricula (Udir)", ages 6 to 18, loader.
- `FRAMEWORK_PERMITTED` on, with the licence note. `FRAMEWORK_CREDIT` with NLOD's wording. `/terms` section 13.
- `alignment` on the norway entry; provenance.
- Matcher: norsk and Norwegian → Norwegian; matematikk → Mathematics; naturfag → Science; engelsk → English. Elsewhere "Norwegian" matches nothing, as before.

### 5.5 Tests and results (2026-11-28)

- `tests/unit/norway-standards.spec.ts`, 18 tests: ids; the snapshot's plans are the ones in force; **every aim of every set is a statement, word for word, and nothing else is**; subjects, text, ages; ages by set title (KV1076 = Years 3 and 4; a shifted-band check); pinned counts; strands; credit; curriculum wiring, the subjects each year has, the card, permission off, no language note, terms; matcher; no own-language prompt line. Mutation-checked: dropping an aim, editing a text and shifting an age each fail.
- Whole unit suite 2,775 passed; tsc clean; ESLint clean on changed files; language check passed.
- E2E `tests/tools/curricula-standards.spec.ts` 7 of 7 on a staging production build. New Norway Grade 5 case: subject typed as "matematikk"; subjects Norwegian, Mathematics, Science, English; the fractions aim ticked and sent as `no-lk20-km13265`; no language note; NLOD credit shown.
- Live (`LIVE_MODEL=1`, worksheet settings re-diffed earlier today, staging = production): Norway Grade 5, the fractions aim, gave an English worksheet on fractions, decimals and percentages, 4,823 characters. 1 of 1. The spec now restores the Europe and batch C switches too.

## 6. Sweden: Skolverket's syllabuses, frameworks `se-lgr22` and `se-gy25` (BUILT 2026-11-28)

Started at the owner's request ("Do sweden now"), under the same rules: official text only, the core four subjects.

### 6.1 Source and licence

- **Data:** Skolverket's Syllabus API, https://api.skolverket.se/syllabus/v1 (version 1.16.2, status "active"; v2 exists but is "alpha"). `scripts/fetch-sweden-syllabus.mjs` saves the 13 syllabuses in one snapshot; the builder reads only the snapshot.
  - Snapshot: `docs/standards/sweden/syllabus-snapshot.json`, fetched 2026-11-28, sha256 dfc0a856cd43e7b2e183b7acdfc184e0e87a2f9057dc6531127f3108b1a2fcfa.
  - Compulsory school (Lgr22 course syllabuses, from 2022-07-01): GRGRSVE01 Svenska (v15, SKOLFS 2024:590), GRGRMAT01 Matematik, GRGRENG01 Engelska, GRGRBIO01 Biologi, GRGRFYS01 Fysik, GRGRKEM01 Kemi (v14, SKOLFS 2022:8).
  - Upper secondary (GY25 grade-subject syllabuses, for students starting from 2025-07-01): SVEN, MATE, ENGE, NATU (Naturkunskap), BIOG (v1), FYSK, KEMI (v2, from 2026-02-01). The Gy11 course syllabuses they replace (SVE, MAT, ENG, NAK, BIO, FYS, KEM) are cancelled for new students and run out by 2030-06-30: not listed.
- **Licence:** https://www.skolverket.se/om-skolverket/oppna-data/api-for-laroplaner-kurs--och-amnesplaner, under "Villkor för användning": "Villkoren i Skolverkets källicens (Creative Commons)", linking https://creativecommons.org/publicdomain/zero/1.0/deed.sv (CC0 1.0). The parent page says "Det är fritt att använda vår data som är tillgänglig för allmänheten." CC0 asks for no credit; Jooma names the source and says the items are edited excerpts.
- **Language:** the API has Swedish text only (GY25 subjects carry an `englishName` title, nothing more). Skolverket's English Lgr22 PDF (pdf12435) now returns "Sidan kunde inte hittas", no English upper secondary syllabuses were found, and a translation would not be covered by the API's CC0 anyway. So the statements are Skolverket's Swedish, the regulation's text, with a card language note, as for Japan.

### 6.2 What a statement is, ages and strands

- One central content item (`<li>` of centralt innehåll), word for word. Soft hyphens (U+00AD) are removed; 8 en dashes became hyphens (brand rule). Not statements: the lead-ins ("Undervisningen ... ska behandla följande centrala innehåll"), headings, a stray "." paragraph in Svenska 1 to 3, purpose and grading criteria.
- **Years 1 to 3 science:** biology, physics and chemistry carry one identical text (the natural science subjects together, identical once soft hyphens are removed). Listed once; the builder stops if any item is not in all three.
- **Ages:** se-lgr22 Years 1 to 3 = 7 to 9, 4 to 6 = 10 to 12, 7 to 9 = 13 to 15 (Grade 1 is age 7 on the profile). No central content for the preschool class (age 6), so the card is not offered there. se-gy25: levels (nivå) are not tied to a school year, so every level is at 16 to 18 and the level is in the strand.
- **Strand:** the syllabus's own heading: h4, or an `<em>` paragraph (one, "Fysikens arbetsmetode</em>r", is split by the markup and joined). Science in Years 4 to 9 is prefixed by the subject ("Fysik: Fysiken i naturen och samhället"); upper secondary by subject and level ("Matematik nivå 1c: Trigonometri och vektorer", "Svenska nivå 2").
- **Repeats:** the source restates some items word for word in a later band or level (e.g. "Rimlighetsbedömning vid uppskattningar och beräkningar." in all three maths bands; many items shared by Matematik 1a, 1b and 1c). Each copy is its own statement under its own strand.
- **For the owner:** upper secondary lists every level of all seven subjects (Mathematics 111 items over 6 levels; Science 158 over Naturkunskap, Biologi, Fysik, Kemi). The strand filter narrows it. Keeping only Naturkunskap for science, or only some levels, is a one-line change.

### 6.3 Counts (pinned in `tests/unit/sweden-standards.spec.ts`)

627 statements: se-lgr22 271 (81 KB raw, 13 KB gzipped), se-gy25 356 (116 KB raw, 14 KB gzipped), each its own on-demand chunk.

| Age | 7 to 9 | 10 to 12 | 13 to 15 | 16 to 18 |
|---|---|---|---|---|
| Swedish | 22 | 21 | 25 | 29 |
| Mathematics | 22 | 27 | 28 | 111 |
| English | 11 | 18 | 16 | 58 |
| Science | 13 | 33 | 35 | 158 |

### 6.4 App changes

- `FrameworkId` + `se-lgr22`, `se-gy25`. Names "Lgr22 syllabuses (Skolverket)" (ages 7 to 15) and "GY25 subject syllabuses (Skolverket)" (16 to 18), loaders.
- `FRAMEWORK_PERMITTED` on, with the licence note. `FRAMEWORK_CREDIT` for each. `FRAMEWORK_LANGUAGE_NOTE`: "Statements are shown in Swedish, as Skolverket publishes them. Your resource is still written in the language you choose." `/terms` section 13.
- `alignment` on the sweden entry; provenance.
- **Prompt:** the own-language line used to fire only on CJK script. Swedish is Latin script, so `curriculumPromptBlock` now also fires it when a ticked statement's id belongs to a framework with a language note (ids start with the framework id and a hyphen).
- Matcher: svenska and Swedish → Swedish; matematik → Mathematics; naturkunskap, naturorienterande, biologi, fysik, kemi → Science; engelska → English. Elsewhere "Swedish" matches nothing.

### 6.5 Tests and results (2026-11-28)

- `tests/unit/sweden-standards.spec.ts`, 19 tests: ids; the snapshot holds the syllabuses in force (Lgr22 course syllabuses, GY25 grade-subject syllabuses, none ended); **every central content item is a statement, word for word, and nothing else is**; the shared Years 1 to 3 science text listed once; subjects, text, ages; band ages and a shifted-band check; pinned counts; strands (lead-ins excluded, the split heading joined); credits; curriculum wiring (no card for the preschool class), all four subjects at every covered year, the card, permission off, the language note, terms; matcher; the own-language prompt line by framework id (not for no id, an English framework's id, or a look-alike "se-lgr22x-"). Mutation-checked: switching off the id rule and shifting the 4 to 6 band each fail.
- Existing tests updated for the expected change: `standards.spec.ts` (permitted list), `curricula-stage3-c.spec.ts` (Sweden now has statements).
- Whole unit suite 2,794 passed; tsc clean; ESLint clean on changed files; language check passed.
- E2E `tests/tools/curricula-standards.spec.ts` 8 of 8 on a staging production build. New Sweden Grade 4 case: subject typed as "matematik"; subjects Swedish, Mathematics, English, Science; the percentages item ticked and sent as `se-lgr22-0f4fde44a3`; language note and CC0 credit shown.
- Live (`LIVE_MODEL=1`, worksheet settings re-diffed: staging = production, gpt-5.6-luna, low, medium): Sweden Grade 4 with English output, the percentages item, gave an English worksheet "Percentages: Parts of a Whole" (4,025 characters, under 3 Swedish function words). 1 of 1. A first run generated an equally English sheet but failed on a broken regex in the spec (fixed; it cost one extra generation). The switches were confirmed back to false.

## 4. Not tested, on purpose

- How well the topic matcher picks Japanese or Chinese statements for English topics across many topics: needs many live runs (one live case per country).
- Senior high elective courses and the other subjects: not built.
- Route sizes before the change: the data is one on-demand chunk, loaded only when a Japan teacher opens the card, so first-load sizes cannot change; only the after build was measured.
