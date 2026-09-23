# Class Activities

Hand-built interactive pages (e.g. **Proof Scramble**) that a teacher assigns to a class. Students
work them inside Mathmatix, and every Check is saved per student. The first one was built as a
claude.ai artifact, and that's the intended workflow: build the page anywhere, add a small hosting
bridge, land it here by PR.

## Where things live

| Piece | File |
|---|---|
| The activities (HTML) + catalog | `activities/*.html`, `activities/manifest.json` |
| Catalog loader / validator | `utils/activityRegistry.js` |
| API | `routes/activities.js` (mounted at `/api/activities`) |
| Data | `models/activityAssignment.js` (activity → class), `models/activityAttempt.js` (one doc per open / Check) |
| Student host page | `public/activities.html`, `public/js/activities.js`, `public/css/activities.css` |
| Chat sidebar entry | `#sidebar-activities-btn` in `chat.html`, revealed by `public/js/activities-entry.js` |
| Teacher UI | the **Activities** tab in `teacher-dashboard.html`, `public/js/teacher-activities.js`, `public/css/teacher-activities.css` |
| Tests | `tests/integration/activitiesRoute.test.js`, `tests/unit/activityRegistry.test.js` |

None of the front-end files are in the page bundles. They're loaded as standalone `defer` tags, so
editing them does **not** need `npm run build:bundles`.

## Publishing is a PR, on purpose

No endpoint uploads an activity. An activity is arbitrary HTML and JS, so the only reason it's safe to
put in front of students is that (1) someone reviewed it before it existed, and (2) it runs in a
sandbox. Adding teacher uploads would remove (1) and turn (2) into the only defense. That's a real
project (content review, a separate origin for activities, a stricter sandbox), not a toggle.

To add an activity:

1. Put the page at `activities/<slug>.html`. It must be self-contained: inline scripts and styles,
   images as `data:` URIs, and fonts only from Google Fonts. The sandbox blocks everything else (see
   below).
2. Add an entry to `activities/manifest.json`: `slug`, `file`, `title`, `description`, `course`,
   `items[]` (`key` + `label`), and `levels[]` (`n` + `name`). **`items[].key` and `levels[].n` must
   match what the page sends.** The server rejects anything else with a 400 that the student never
   sees. For Proof Scramble, `tests/unit/activityRegistry.test.js` pins this by parsing `PROOFS` and
   `RUNGS` out of the page. Add a similar pin for each new activity.
3. Add the hosting bridge (below).

## The sandbox

`GET /api/activities/:slug/frame` replaces the page CSP with:

```
sandbox allow-scripts; default-src 'none'; script-src 'unsafe-inline';
style-src 'unsafe-inline' https://fonts.googleapis.com; font-src https://fonts.gstatic.com;
img-src data: blob:; connect-src 'none'; form-action 'none'; base-uri 'none'; frame-ancestors 'self'
```

The host iframe also carries `sandbox="allow-scripts"`. Because `allow-same-origin` is absent from
both, the activity runs in an opaque origin, even when someone opens the frame URL directly in a
tab. It can't read cookies, can't reach the session, and can't call any API. `connect-src 'none'`
means it can't make network requests at all. So `localStorage` throws inside the sandbox: wrap every
access in `try/catch`, and restore progress from the host's `init` message instead.

## Host protocol (postMessage, v1)

```
activity → host   { source:'mathmatix-activity', v:1, type:'ready' }
activity → host   { source:'mathmatix-activity', v:1, type:'check',
                    item, level, correct, total, solved, checks, durationMs,
                    misconceptions:[{ key, label }] }
host → activity   { source:'mathmatix-host', v:1, type:'init',
                    progress:{ <itemKey>: [levels solved] } }
```

- The activity posts to `window.parent` with target `'*'` (the page can't know the parent's origin).
  The host accepts a message only when `event.source === iframe.contentWindow`. The origin string is
  `"null"` for a sandboxed frame, so the check is on the window, not the origin.
- `init` may arrive more than once. Handle it idempotently. When it arrives, switch into "hosted"
  mode: hide anything that asks for a name or produces a self-reported completion code. Mathmatix
  already knows who the student is and what they did.
- `misconceptions[]` means whatever wrong choices were on the page at the moment of the check. Key
  them stably (Proof Scramble uses `<proof>.S<n>` / `<proof>.R<n>`) so a wording edit doesn't split
  a tally. The teacher report counts each key once per student.
- Standalone (no parent), the bridge does nothing, so the same file still works as a plain artifact.

## What the server trusts

Identity, activity, item and level come from the session and the manifest. They can't be forged.
The counts come from the page, and the page runs in the student's browser. A determined student
could post a fake solve. The server only makes sure `solved` agrees with `correct >= total`, and
caps stored events at 2,000 per student per activity. That's the same trust level as any
client-graded practice in the app, and a big step up from the artifact's completion code, where
anyone could forge the name too. Don't grade anything high-stakes this way.

## Scope and privacy

- A "class" is an `EnrollmentCode`. A student sees an assignment only while enrolled in that class.
  Only the class's teacher can assign to it or read its results. Teachers and admins can preview any
  activity; their Checks come back `stored:false`.
- Results only count events from `assignedAt` onward, so re-assigning later starts clean.
  Unassigning deletes the assignment but keeps the attempts.
- Reading results is FERPA-logged (`assessment_results` / `teaching_instruction`, one entry per
  student). `ActivityAttempt` is included in the data-privacy export and the account-deletion sweep
  (`routes/dataPrivacy.js`).
