# Plan 014: Code-driven AkkiPDF launch film

> Research and creative direction approved on 2026-07-14. The expanded v2
> toolbar-tour master is rendered and ready for visual review.

## Status

- **Priority**: P1
- **Effort**: L
- **Risk**: MED (motion quality and product accuracy, not app runtime risk)
- **Depends on**: none
- **Category**: product marketing / launch film
- **Status**: IN REVIEW — v2 toolbar-tour master rendered and verified

## Implementation result (2026-07-14)

The expanded v2 master is ready for visual review:

- **Output**: `video/out/akki-pdf-showcase-square-final.mp4`
- **Composition**: `video/src/AkkiShowcase.tsx`
- **Editor reconstruction**: `video/src/components/EditorWorkspace.tsx`
- **Document interactions**: `video/src/components/PdfDocument.tsx`
- **Render command**: `bun run video:render`
- **Poster command**: `bun run video:poster`
- **Social poster**: `video/public/akki-pdf-showcase-poster.png`
- **PR preview video**: `video/public/akki-pdf-showcase-square-final.mp4`
- **Format**: 1200×1200, 30 fps, 38.1 seconds, H.264 `yuv420p` BT.709,
  stereo AAC at 48 kHz

The rendered film keeps the full toolbar visible and animates the complete
Select → Text → Links → Forms → Images → Sign → Whiteout → Annotate → Shapes
→ Table tool tour. The document then demonstrates font replacement, links,
form fields, whiteout, annotation, shapes, tables, a natural signature, page
addition/removal, Apply, and export. It uses the committed sample invoice and
includes an original restrained procedural sound bed.

The v2 correction removes the vertical green focus beam and active-button
underline from the earlier cut. It also removes the signature delete/trash
control and replaces the oversized saved-signature control with a quiet local
storage status. Plus Jakarta Sans now carries all product UI, captions, and
labels; handwriting remains limited to the signature itself.

The social poster uses the real export-state workspace, a high-contrast
local-first hook, and a short feature set at 1200×1200. The same artwork holds
as the opening video frame so an automatic first-frame preview remains useful.

Verification completed: video TypeScript check, app TypeScript check, ESLint,
868 unit tests, production build, encoded-stream inspection, loudness analysis,
and a contact-sheet review of frames extracted from the final MP4. Final audio
measures -14.5 LUFS integrated with a -1.0 dBTP true peak.

## Decision

Discard the first screen-recording-led concept. Build the next film as a
small coded product production: real AkkiPDF UI, tokens, fonts, fixture data,
and interactions are reconstructed in Remotion scenes, with the camera,
timing, captions, and sound controlled in code.

The target is not “a nicer screen recording.” It is a **38-second product
film** that feels deliberately art-directed, gives every toolbar family a
readable beat, and remains truthful to the app.

## Reference research

### Primary reference: Matt Chow / Trope

[Matt Chow's YC launch-video breakdown](https://x.com/mattchowx/status/2075672770483269788)
is useful because it explains the production system, not just the final look:

- combine a human or narrative hook with a focused product showcase;
- storyboard key frames before animating them;
- plug the real codebase into the production so scenes use the product's
  actual colors, fonts, fixtures, and UI;
- rebuild product shots as React scenes instead of recording a desktop;
- transcribe voiceover first and land visual beats on word-level timecodes;
- describe camera feedback in physical terms: punch in, hold, reframe, ease;
- render single frames frequently and annotate visual corrections;
- use sound sparingly, then perform a dedicated audio mix.

The most important lesson is **real product material plus strong direction**.
The reference film's polish does not come from Remotion alone.

### Similar X examples and counter-signals

- [Javi / rameerez](https://x.com/rameerez/status/2015859121661059569):
  polished prompt-led launch video, but the useful admission is that the first
  results looked generic and it took 2–3 days of iteration. Taste and review
  loops matter more than a “one prompt” claim.
- [Dhruv Makes](https://x.com/dhruvmakes/status/2014730536150008067):
  Remotion plus Claude can produce a clean product film quickly when the
  composition is restrained and the product stays legible.
- [Adish Jain](https://x.com/_adishj/status/1965834618671857677): frames the
  strongest launch films as a mix of hook, cinematic storytelling, and product
  demonstration rather than a feature slideshow.

The negative pattern across other posts is equally clear: generic gradients,
oversized headings, endless zooms, fake cursors, and card-after-card animation
read as an **animated slide deck**, not a product film. We should borrow the
primary reference's workflow without copying the generic YC/SaaS aesthetic.

## AkkiPDF creative thesis

### Single idea

**Your PDF never has to leave your browser.**

This is more ownable than “edit PDFs easily,” and it connects directly to the
product's real local-first architecture. The film then proves the promise with
three high-value actions rather than listing every toolbar item:

1. replace existing text while retaining the document's visual character;
2. create and place a natural signature;
3. annotate and export the finished file.

### Tone

- calm, precise, tactile, and editorial;
- paper-and-ink rather than cyber/AI;
- confident enough to leave breathing room;
- useful product UI remains readable at all times.

### Visual language

- **Plus Jakarta Sans** for headlines, UI, captions, and small labels;
- the app's existing warm paper, ink, and green tokens—not neon purple/blue;
- subtle grid-paper texture, soft elevation, shallow perspective, real ink;
- the editor workspace fills the square frame instead of sitting inside a
  small decorative product card;
- one controlled camera move per idea;
- handwritten signature fonts only inside the signature moment.

### Editor-first framing rule

The supplied full-workspace screenshot is the framing reference. The next
film must treat the application—not headlines or decorative backgrounds—as
the hero:

- show the **complete top toolbar** from AkkiPDF through Apply and Export;
- keep the toolbar present during every product-action scene;
- use the toolbar as the film's visual navigation: active tools illuminate in
  sequence, then the viewer's eye travels down to the resulting page action;
- retain enough of the page rail, document canvas, and inspector to make each
  operation understandable in context;
- build or capture the editor at a square-friendly 1200×1200 viewport rather
  than shrinking the supplied ultrawide screenshot into a tiny strip;
- allow brief punch-ins inside the workspace, but never crop away the active
  toolbar control;
- place sparse captions in reserved canvas space or a subtle lower strip,
  never over the toolbar or the feature being demonstrated.

The toolbar is the main product story. Its sequence is **Select → Text → Links
→ Forms → Images → Sign → Whiteout → Annotate → Shapes → Table → Apply →
Export**, with the canvas showing the consequence of each choice.

## Recommended master

- **Canvas**: 1200×1200, square
- **Frame rate**: 30 fps
- **Duration**: 38 seconds
- **Codec**: H.264, `yuv420p`, AAC 48 kHz, web-optimized / fast-start
- **Video bitrate**: 8–12 Mbps
- **Audio target**: approximately -14 LUFS integrated, true peak below -1 dB
- **Safe area**: 96 px outer margin; keep essential copy at least 120 px from
  the frame edge

This is a safe shared master for organic X and LinkedIn distribution. X's
[video documentation](https://help.x.com/en/using-x/x-videos) supports the
square frame inside its current dimension/aspect limits. LinkedIn's
[video specifications](https://www.linkedin.com/help/linkedin/answer/a424737)
also support 1:1 video; 30 fps remains natural for organic playback.

## Final v2 sequence: 10 scenes

1. **Local hook** (0:00–0:03): local-first promise and full editor reveal.
2. **Toolbar tour** (0:03–0:06): every top-level tool receives a clean active state.
3. **Replace text** (0:06–0:11): edit copy and show font replacement.
4. **Links + forms** (0:11–0:15): add an interactive link and form field.
5. **Whiteout + annotate** (0:15–0:19): conceal content, then highlight it.
6. **Shapes + tables** (0:19–0:23): add visual structure to the invoice.
7. **Sign naturally** (0:23–0:27): draw and place a browser-local signature.
8. **Manage pages** (0:27–0:31): add a page, then remove it.
9. **Apply + export** (0:31–0:35): resolve edits and expose verified formats.
10. **End card** (0:35–0:38): AkkiPDF and the local-first positioning line.

## Original storyboard: 7 scenes (superseded by v2)

### 1. The hook — 0:00–0:03

**Copy:** “Your PDF shouldn’t need a server.”

A paper sheet enters the empty cream stage. A small cloud/upload path begins
to form, then quietly folds away. The sheet stays local and the **full editor
workspace assembles edge-to-edge**, ending with the complete toolbar clearly
visible. No warning icon, hacker imagery, or fear-based red UI.

### 2. Open locally — 0:03–0:06

**Copy:** “Open it locally.”

The real workbench resolves around `pdf/sample-invoice.pdf`: complete toolbar,
page rail, paper canvas, inspector, and status surface. Start on the full
1200×1200 workspace and let **Select** pulse once to establish how the toolbar
controls the document. Use a clean coded transition rather than browser
chrome, Finder, or a drag from somebody's desktop.

### 3. Replace text — 0:06–0:11

**Copy:** “Replace text. Keep the character.”

The **Text** control activates in the always-visible top toolbar. A light trail
guides the eye down to one invoice line; the camera reframes the page without
losing the toolbar. The text run is selected, edited, and settles back into
the page with the closest real font styling. A restrained mono micro-label may
say “font matched”; do not claim exact font reuse in cases where the resolver
only finds the closest available match.

### 4. Sign naturally — 0:11–0:16

**Copy:** “Sign like it’s paper.”

The **Sign** control activates in the top toolbar and the signature studio
opens over the canvas while the toolbar remains anchored above it. Show one
short drawn ink stroke with variable width, one Undo beat, then a clean final
signature placed on the page. This is the hero tactile moment; allow it the
longest hold.

### 5. Mark what matters — 0:16–0:20

**Copy:** “Highlight. Link. Shape.”

Move across the real toolbar: **Annotate** activates for a highlight, then
**Shapes** activates for one simple callout. Each active state hands the eye
down to the canvas in one continuous camera move. Keep the remaining toolbar
items visible as proof of the broader toolset, but do not individually animate
all ten groups.

### 6. Export cleanly — 0:20–0:24

**Copy:** “Export the finished file.”

The edited sheet returns to center inside the complete workspace. **Apply**
resolves the edits, then **Export** opens from the top-right toolbar while the
inspector's export options reinforce the action. Display only formats confirmed
by the current product: **PDF, TXT, CSV, XLSX**. The PDF exits as the primary
artifact; data formats remain supporting details.

### 7. End card — 0:24–0:27

**Copy:** “AkkiPDF” / “Edit locally. Export cleanly.”

Wordmark, one-line positioning, and a user-approved CTA or URL. Do not invent
a public URL. Hold at least 1.5 seconds so the mark and CTA can be read.

## Copy / voice direction

The first build should be **motion-led with sparse on-screen copy**, not a
talking-head recording. It fits the square placement, removes production
dependency on a good human shoot, and lets us establish the visual system
first.

Optional later narrative cut (45–60 seconds): add a short, well-lit human
opening and voiceover, then reuse the same product scenes. If that version is
approved, record and transcribe the voiceover before timing animation; use
word-level timestamps for captions and edit beats.

Suggested short script:

> Your PDF shouldn’t need a server. Open it locally. Replace text without
> losing the document’s character. Sign like it’s paper. Mark what matters.
> Export the finished file. AkkiPDF. Edit locally. Export cleanly.

## Motion direction

- Default easing: the product's existing `cubic-bezier(0.16, 1, 0.3, 1)`.
- Transitions: roughly 8–14 frames; holds: 1.2–1.8 seconds for meaningful UI.
- Keep the top toolbar locked to a stable visual horizon; move attention with
  active states, light trails, and local canvas reframes rather than hiding it.
- Use spring motion only for small tactile placement; avoid bouncy camera work.
- Apply motion blur to deliberate camera moves, never to readable UI holds.
- Cursor appears only when its movement explains an interaction.
- Start and finish on the full editor. Use masks and local camera reframes
  instead of scaling or cropping the whole app indiscriminately.
- Keep headlines outside the active control area; never cover the feature being
  demonstrated.

## Sound direction

Use one restrained music bed plus **4–6 purposeful sounds maximum**:

- paper arrival;
- selection/click;
- pen stroke;
- highlight swipe;
- export confirmation;
- optional soft end-card resolve.

No sound on every transition and no repeated stock whooshes. The mix gets its
own final pass after picture lock.

## Proposed implementation shape

Create an isolated Bun/Remotion production under `video/` so marketing-video
dependencies do not leak into the application bundle:

```text
video/
  src/
    AkkiShowcase.tsx
    composition.ts
    theme.ts
    timing.ts
    components/
      ProductStage.tsx
      Camera.tsx
      AnimatedCursor.tsx
      Caption.tsx
      PdfSheet.tsx
    scenes/
      PrivacyHook.tsx
      OpenLocal.tsx
      ReplaceText.tsx
      Signature.tsx
      Annotate.tsx
      Export.tsx
      EndCard.tsx
  public/
  package.json
  remotion.config.ts
```

Implementation rules:

- use **Bun only** and preserve the repo's single-lockfile policy;
- import or mirror the app's real token values, fonts, tool names, and fixture
  data—no invented controls;
- rebuild only the viewport needed for each shot, but base it on real source;
- keep app code untouched unless a small reusable visual primitive has a clear
  non-video benefit;
- use the committed sample invoice or a reviewed, nonsensitive demo fixture;
- never capture neighboring windows, browser chrome, personal notifications,
  or sensitive PDF contents;
- keep browser recordings as behavior reference only, not final footage.

## Review gates

Do not proceed directly from this document to a final render.

1. **Storyboard gate** — seven 1200×1200 stills with final copy and framing.
2. **Motion gate** — three representative clips: hook, text replacement,
   signature. Approve timing and camera language before building all scenes.
3. **Silent rough cut** — full sequence with accurate product behavior.
4. **Sound pass** — music, SFX, levels, and any captions.
5. **Platform QA** — exported file checked on both X and LinkedIn previews.

## Acceptance criteria

- The film tells one local-first story in approximately 38 seconds.
- Every visible feature exists and behaves truthfully in the current app.
- The full editor workspace opens and closes the film, and the complete top
  toolbar remains visible throughout all feature demonstrations.
- Tool activation in the toolbar visibly leads to the matching canvas result.
- Text replacement, signature, and export each remain legible long enough to
  understand without pausing.
- No desktop/browser chrome or accidental screen content appears.
- Typography and color come from the AkkiPDF design system.
- The result does not rely on generic gradients, feature-card slides, or
  decorative motion unrelated to the product.
- The end card uses an approved CTA/URL.
- The H.264 master passes X and LinkedIn upload/preview checks.

## Deliverables after approval

- storyboard contact sheet;
- editable Remotion source;
- 1200×1200 H.264 master;
- clean thumbnail / poster frame;
- 12-second and 6-second cutdowns derived from the same scene system;
- captions file if voiceover is added;
- source list for music, fonts, and sound-effect licensing.

## Before implementation

The only creative inputs still needed are the **final CTA/URL** and whether the
first version should remain motion-only (recommended) or include a human/voice
recording. Everything else above is specific enough to begin storyboarding.
