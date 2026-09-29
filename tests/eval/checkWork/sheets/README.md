# Real sheets for the check-work eval

The corpus in `../corpus.json` is written by hand and rendered to clean,
handwriting-style images. That measures the grader's **floor**. Real photos —
messy handwriting, shadows, crossed-out work, three photos of one assignment —
are what measure it for real. Each real sheet lives in its own folder here.

## Privacy rules (these are not optional)

This repo is shared. A sheet may be committed **only** if all of these hold:

1. **Source is one of:**
   - `teacher-sample` — work a teacher or staff member wrote themselves to
     look like student work (the easiest and safest source), or
   - `consented-student` — real student work with written consent from the
     student's parent/guardian for use in improving the grader.
2. **No identifying information in the image.** Crop or blur the name, class,
   period, teacher, school, date and any ID number *before* committing. Check
   the margins and the back of the page too.
3. **No EXIF metadata.** Strip it (e.g. `npx sharp-cli` or re-export the
   image); phone photos carry location.
4. Never copy a sheet out of production uploads. Real student uploads are
   FERPA/COPPA data and do not come here — ask for consent and a fresh photo.

The hermetic test (`checkWorkEval.test.js`) fails CI for any folder here whose
`labels.json` is missing `"consent": true` or a valid `source`.

## Format

```
sheets/
  alg1-distribution-01/
    labels.json
    page1.jpg
    page2.jpg          # multi-photo assignments: one file per photo, in order
```

`labels.json`:

```json
{
  "id": "alg1-distribution-01",
  "title": "Distributive property practice",
  "source": "teacher-sample",
  "consent": true,
  "pages": ["page1.jpg", "page2.jpg"],
  "problems": [
    { "label": "1", "problem": "2(x - 3) = 10",
      "steps": ["2x - 6 = 10", "2x = 16", "x = 8"], "answer": "x = 8",
      "gold": "correct", "tags": ["distribution"] },
    { "label": "2", "problem": "-2(x - 5) = 4",
      "steps": ["-2x - 10 = 4", "-2x = 14", "x = -7"], "answer": "x = -7",
      "gold": "has_error", "errorLine": "-2x - 10 = 4", "tags": ["distribution", "sign-error"] },
    { "label": "3", "problem": "5x - 1 = 9", "steps": [], "answer": null, "gold": "blank" }
  ]
}
```

- `label` matches the number printed on the sheet.
- `steps` / `answer` are what the student **actually wrote**, mistakes and all.
- `gold` is the teacher's verdict: `correct`, `has_error`, or `blank`.
- `errorLine` (required for `has_error`) is the first line that is wrong.
- `tags` are free-form; the scorecard breaks results down by tag.

**Labeling tip:** mark a problem `correct` when a teacher would accept it —
equivalent forms (`1 1/4` for `5/4`), a correct negative, skipped steps.
Those are exactly the cases the grader must never call wrong.

## Running

```bash
npm run test:eval                 # hermetic: format + code-only scores (no keys)
npm run test:eval:checkwork       # live: needs RUN_LLM_EVAL=1-style real keys in .env
```

Real sheets are picked up automatically by the live tier's end-to-end run.
