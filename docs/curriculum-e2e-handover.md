# Handover: run the curriculum tests on the owner's PC

For a Claude Code session that runs on the owner's computer (with `.env.local` pointing at STAGING). The cloud session that wrote this code could not run the browser tests: it had no `.env.local` and no staging keys.

## 1. What to test

Branch `claude/curriculum-stage-1-status-8dm96r`, three commits on top of `staging`:

| Commit | What |
|---|---|
| `64368ed` | NI Key Stage 4 tagged for Years 11 and 12; owner decisions recorded (build log section 12) |
| `31556d2` | Northern Ireland gets its own year list (Nursery, Year 1 to Year 14, no Reception); Year 12 shows Key Stage 4 (build log section 13) |
| `3ed3076` | `scripts/cloud-env-local.sh` (cloud only; not needed on the PC) |

The plan behind `31556d2` is in `docs/uk-curricula-build.md` section 13.

## 2. Setup

```
git fetch origin claude/curriculum-stage-1-status-8dm96r
git checkout claude/curriculum-stage-1-status-8dm96r
pnpm install
```

- Check that `.env.local` points at staging (`tkvzsqtgsesodifcakko`), never production (`hhgfhhofbhzioywnppzr`).
- Start the dev server on `http://localhost:3000` with `pnpm dev`, or reuse one already running. Use `localhost`, never `127.0.0.1`.
- If a stale `next start` holds port 3000, stop only that process.

## 3. Run

Unit tests first:

```
pnpm test:unit
```

Expected: about 2346 passed and 5 skipped. The 5 skipped need the NI source XML, which is missing (see section 5). On Linux, 8 deck-prompt snapshot tests fail because only Windows snapshots are committed. On Windows they should pass.

Then the curriculum browser tests:

```
npx playwright test tests/tools/uk-curricula-align.spec.ts tests/tools/slideshow-curriculum.spec.ts tests/tools/curricula-standards.spec.ts tests/tools/curricula-tools.spec.ts --workers=2
```

In `uk-curricula-align.spec.ts`, these tests are NEW or CHANGED and have never run:

- "a Northern Ireland teacher's year list has no Reception, and Nursery and Year 13 say there is nothing to align to"
- "a Northern Ireland Year 12 teacher aligns a worksheet to Key Stage 4". It also picks "KS2 SATs style: maths arithmetic" on the exam question tool and expects Year group "Year 7".
- "a Northern Ireland teacher's slides wizard offers NI's own years"
- "a Scotland teacher's slides wizard still offers the UK years, Year 12 and 13 included". It now also checks that Reception shows and Year 14 does not.

The other tests in these four files are older and passed before. They must still pass.

Do not run `LIVE_MODEL=1`: no prompt or schema changed.

## 4. If something fails

1. Read the failure and its screenshot or trace. Decide whether the app or the test is wrong. Compare against the stage table in `docs/uk-curricula-build.md` section 13:
   - NI Year 1 and 2: Foundation Stage
   - Years 3 and 4: Key Stage 1
   - Years 5 to 7: Key Stage 2
   - Years 8 to 10: Key Stage 3
   - Years 11 and 12: Key Stage 4
   - Nursery, Year 13 and Year 14: nothing to align to
   - No Reception for NI
2. Fix it with the smallest change. If the app was wrong, add a unit test that fails first.
3. Re-run the failing spec, then the four files, then `pnpm test:unit`, `npx tsc --noEmit -p .` and `node scripts/check-language.mjs` (no em or en dashes anywhere).
4. Never point a test at production. Never regenerate goldens or snapshots to make a test pass.

The owner's preferred loop: plan with Opus, implement with Sonnet, test with Opus, and repeat until green.

## 5. Optional while on the PC

- **NI source XML.** Download https://www.legislation.gov.uk/nisr/2007/46/schedule/2/data.xml to `docs/standards/uk/northern-ireland/nisr-2007-46-schedule-2.xml`.
  - Check its sha256: it should be `c63af56f40de2b8caead22e492d50e02658aa169e952a4850b1d66e29ab18091`. If it differs, the Order was amended: stop and tell the owner.
  - Run `node scripts/build-uk-curricula.mjs --nation=northern-ireland`. Expect NO change to `app/lib/standards/data/nic-*.json`: the ages were edited by hand to match what the script writes.
  - Then `pnpm test:unit`: the 5 skipped tests should now run and pass.
- **Screenshots** for the owner: run with `SHOTS_DIR=docs/screenshots/2026-11-ni-years`. The folder is gitignored.

## 6. When done

- Add a short "13.x E2E run" note to `docs/uk-curricula-build.md`: commands, results and any fixes.
- Commit on the same branch and push.
- Report to the owner: passed, failed and fixed, plus anything still open.

## 7. Still open (not part of this run)

- **Gap builds** (statements for Texas, Florida, Virginia, Ireland, New Zealand, Ontario, BC, Alberta, and more Australian learning areas): an Opus plan is being written in the cloud session. The owner must answer its licence questions before anything is built.
- **Wales:** permission email not sent.
- **NGSS:** waiting on WestEd and the National Academies Press.
- **Release:** merge to `staging`, switch on regions outside the UK, check one Scotland and one NI account after release.
