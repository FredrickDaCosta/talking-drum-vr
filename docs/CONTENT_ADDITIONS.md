# Content Additions (`docs/CONTENT_ADDITIONS.md`)

How Fredrick's next Yoruba entries go into the game. **Nothing here is added yet**, and no Yoruba is invented:
the rows below are empty slots for Fredrick to fill.

## 1. How many entries are needed

The session model (`src/game/session-estimate.ts`) is printed by the unit tests. The pace assumptions are in
`docs/PHASE2_PLAN.md §5.2` and are UNVERIFIED.

| Target at a normal pace        | Two-syllable L2 words | or three-syllable L3 phrases | Mix                       |
| ------------------------------ | --------------------- | ---------------------------- | ------------------------- |
| Today (24 entries)             | —                     | —                            | 5.3 min                   |
| ≥ 6 min                        | **+4**                | **+3**                       | —                         |
| ≥ 7 min                        | +9                    | +7                           | —                         |
| **Suggested:** +4 L2 and +3 L3 | —                     | —                            | **6.9 min** (unit-tested) |

**Worst case:** a player who needed all three tries on every phrase would take about 12.7 min with the
suggested additions. The **soft session cap** (8.5 min, `lesson.sessionCapMs`, CTO decision 2026-10-23)
bounds this: the phrase in progress finishes, then the session ends. The longest possible session is therefore
≈9.1 min.

**Next batch:** Fredrick is verifying 6 level-2 words and 3 level-3 phrases; the CTO will send them. The
model's "≥ 6 min" row needs +4 L2 or +3 L3, so that batch is enough.

## 2. Nothing in the code needs to change

The data file and the validator already accept new entries:

- **Plan:** `lesson.phrasesPerLevel` is `'all'` for every level, so every entry in `src/content/lessons.ts`
  plays, in file order. This is unit-tested by appending entries.
- **Status:** new entries can start as `reviewStatus: 'draft'`. `content:validate` lists drafts but does not
  fail on them. Set `'verified'` after review.
- **Order:** keep each minimal set together (e.g. all forms of one word in a row), so the contrast is heard
  back to back.

**Entry template** (append in `LESSONS`, in the level's block):

```ts
{
  id: 'l2-<word>-<tones>',        // unique, lower-case letters, digits and hyphens (also usable as ?lesson=<id>)
  level: 2,                        // 2 = words, 3 = greetings / phrases
  text: '…',                       // Yoruba with full diacritics, Unicode NFC
  gloss: '…',                      // short English meaning
  syllables: ['…', '…'],           // must spell the text (spaces and hyphens ignored)
  tones: ['M', 'H'],               // one of L / M / H per syllable
  note: '…',                       // optional
  reviewStatus: 'draft',
},
```

**`content:validate` checks:**

- unique ids
- level 1–3
- one tone per syllable, L / M / H only
- NFC text, gloss, note and syllables
- syllables spell the text
- at least `minEntriesPerLevel` entries per level

## 3. Slots for Fredrick (to fill)

| #   | Level | Text (Yoruba) | Gloss | Syllables | Tones | Minimal set with |
| --- | ----- | ------------- | ----- | --------- | ----- | ---------------- |
| 1   | 2     |               |       |           |       |                  |
| 2   | 2     |               |       |           |       |                  |
| 3   | 2     |               |       |           |       |                  |
| 4   | 2     |               |       |           |       |                  |
| 5   | 3     |               |       |           |       |                  |
| 6   | 3     |               |       |           |       |                  |
| 7   | 3     |               |       |           |       |                  |
