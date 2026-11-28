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

## 3. Taiwan: Curriculum Guidelines of 12-Year Basic Education (Step 0 done, build next session)

### 3.1 Sources

Page: https://www.naer.edu.tw/eng/PageSyllabus?fid=148, "Domains / Subjects Curriculum Guidelines" tab (a POST form; the list is not in the page's first HTML). Fetched 2026-11-28, saved in `docs/standards/taiwan/`:

| File | Document | Language | sha256 |
|---|---|---|---|
| `naer-mandarin-zh.pdf` | 國民中小學暨普通型高級中等學校 語文領域 國語文 | Chinese (no official English) | 210b2bea291bbc294584a6ae5796f88e9481298e9ce82067138a0b6808dcd72c |
| `naer-maths-zh.pdf` | 國民中小學暨普通型高級中等學校 數學領域 | Chinese (no official English) | 334bc052dc1812516470dc162c818074e9eca0c20a3d3a02af269dd42394188a |
| `naer-english-en.pdf` | 語文領域 英語文, 12年國教課綱英譯 (公告版) | Official English translation | 4fc2f86928d378b3b4195a7cec3db1b0bcf2b3771cec1ae5bed1fb6ad719e6a0 |
| `naer-science-en.pdf` | 自然科學領域, 12年國教課綱英譯 (公告版) | Official English translation | 069d594ce73b69c06ea046106d2ed820cca875b27619c052cc67d8dad86e7435 |

NAER also publishes official English ("英譯 公告版") for Social Studies and Technology; not in this batch's scope.

Licence: NAER and the Ministry publish site content under the Open Government Data License, version 1 (https://data.nat.gov.tw/license): commercial use with credit. To do before the build: quote NAER's own open-information notice (https://www.naer.edu.tw/PageMenu?fid=231) and the credit wording OGDL v1 asks for.

### 3.2 Structure (for the builder)

- Every statement has a code. Learning performances by stage: maths `n-II-1`, Mandarin `6-I-1`, science `tr-Ⅱ-1` and `po-Ⅲ-1` (the English translations use Roman numeral characters, U+2160 on). Learning content: maths by grade `N-3-1` (11A, 11B and 12 甲/乙 in senior high), Mandarin and science by stage (`Aa-I-1`, `INa-Ⅱ-1`).
- Stages: I = Grades 1 and 2, II = 3 and 4, III = 5 and 6, IV = 7 to 9, V = 10 to 12. Taiwan's registry ages: Grade 1 = 6.
- Maths lists the performances twice (by stage, then by category): take the first listing only.
- Maths learning content is a five-column table (code, item and explanation, notes, teaching aids, linked performances): only the item and explanation column is a statement. Needs a positional table reader.
- Senior high: required courses only (部定必修), not the 加深加廣 electives, matching Japan.
- The card note will need a Chinese line (Mandarin and maths) and none for English and science, so `FRAMEWORK_LANGUAGE_NOTE` may need to be per subject, or two framework ids (official English and Chinese). Decide at the build.

## 4. Not tested, on purpose

- How well the topic matcher picks Japanese statements for English topics across many topics: needs many live runs (one live case only).
- Senior high elective courses and the other subjects: not built.
- Route sizes before the change: the data is one on-demand chunk, loaded only when a Japan teacher opens the card, so first-load sizes cannot change; only the after build was measured.
