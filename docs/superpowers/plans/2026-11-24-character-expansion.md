# Character Catalog Expansion Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Expand the current 118-profile chatbot catalog to 209 profiles across ZZZ, Tower of Fantasy, Arknights: Endfield, and anime series.

**Architecture:** Keep the current catalog API and memory model. Store the 91 new records in `src/ai/characters-extra.js`, import and append them from `src/ai/characters.js`, and add curated remote images only for the priority characters named in the spec.

**Tech Stack:** Node.js ESM, JavaScript, `node:test`, GitHub Actions.

**Spec:** `docs/superpowers/specs/2026-11-24-character-expansion-design.md`

## Global Constraints

- Preserve all existing character IDs, names, aliases, prompts, selection behavior, and memory behavior.
- Add exactly 91 new records: 21 ZZZ, 13 Tower of Fantasy, 35 Endfield, and 22 anime.
- Keep one Endministrator profile and do not duplicate existing Tower of Fantasy profiles for Lin or Nemesis.
- Do not add runtime dependencies or change `src/ai/characterImage.js`.
- Curated image URLs must be HTTPS; do not add image binaries to the repository.
- Every new prompt must use Brazilian Portuguese and must not encourage real-world dangerous behavior.

## Review Focus

- Case-insensitive duplicate aliases between the old and new catalog entries.
- Whitespace and punctuation in aliases for multi-word names.
- Existing characters stay findable after the new module is appended.
- Curated URLs remain HTTPS and are assigned only to the intended profile.
- The expanded `.personagens` command remains within ordinary WhatsApp text-message limits.

---

### Task 1: Add the expanded character catalog

**Files:**
- Create: `src/ai/characters-extra.js`
- Modify: `src/ai/characters.js`
- Test: `tests/characters.test.js`

**Interfaces:**
- Consumes: the current `characters` array and `listCharacters()`, `findCharacter(query)`, and `getCharacter(id)`.
- Produces: `extraCharacters`, an array of records with the existing character object shape.

- [ ] **Step 1: Write the failing catalog tests**
  - Replace the old exact count assertion of 118 with 209.
  - Assert representative searchable profiles: `grace-howard`, `fenrir`, `kay-endfield`, and `satoru-gojo`.
  - Assert the original `furina`, `anby-demara`, `nicole-demara`, and `perlica` profiles remain available.
  - Keep and run the existing uniqueness and required-field checks.

- [ ] **Step 2: Run the catalog tests and verify RED**
  - Run: `npm run test:characters`
  - Expected: the count and representative-character assertions fail because the new profiles do not exist yet.

- [ ] **Step 3: Create `src/ai/characters-extra.js`**
  - Export `extraCharacters` with exactly the 91 names and groups in the spec.
  - Use a small local factory to append shared conversation rules to each distinct personality description; do not change the existing 118 prompts.
  - Keep IDs stable, lowercase kebab-case, and unique; provide aliases for common shortened names.

- [ ] **Step 4: Append the new entries from `src/ai/characters.js`**
  - Import `extraCharacters` and append them once before the catalog functions are exported.
  - Keep the public function signatures and return shapes unchanged.

- [ ] **Step 5: Run catalog tests and verify GREEN**
  - Run: `npm run test:characters`
  - Expected: all catalog tests pass, with 209 records and no duplicate IDs.

- [ ] **Step 6: Commit Task 1**
  - Commit message: `feat: expand chatbot character catalog`

### Task 2: Add curated character art links

**Files:**
- Modify: `src/ai/characters.js`
- Modify: `src/ai/characters-extra.js`
- Test: `tests/characters.test.js`

**Interfaces:**
- Consumes: the existing `imageUrl` field and `resolveCharacterImage(character)` behavior.
- Produces: curated `imageUrl` values for the six priority profiles listed in the spec; all other entries continue using the automatic resolver.

- [ ] **Step 1: Write failing image metadata assertions**
  - Assert that Anby, Nicole, Grace, Alexandrina/Rina, Zhu Yuan, and Laevatain each have the expected HTTPS image URL.
  - Assert that no unrelated original character receives one of these URLs.

- [ ] **Step 2: Run the targeted test and verify RED**
  - Run: `npm run test:characters`
  - Expected: the image URL assertions fail before the image fields are added.

- [ ] **Step 3: Add the curated HTTPS `imageUrl` fields**
  - Add Anby and Nicole URLs to their existing records.
  - Add Grace, Alexandrina/Rina, Zhu Yuan, and Laevatain URLs to their new records.
  - Do not modify the automatic image resolver or add binary assets.

- [ ] **Step 4: Run catalog tests and verify GREEN**
  - Run: `npm run test:characters`
  - Expected: all catalog and image metadata tests pass.

- [ ] **Step 5: Run syntax and full test checks**
  - Run: `npm run check:syntax`
  - Run: `node --test`
  - Expected: both commands exit successfully.

- [ ] **Step 6: Commit Task 2**
  - Commit message: `feat: add curated anime-style character portraits`
