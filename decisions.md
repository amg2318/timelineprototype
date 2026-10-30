# Rewind — Decision Log

Design decisions for Rewind (version control for digital art), SVSD 2026.
Each entry: the question, options we weighed, what we chose, and why. These double as material for the video's "exploration" section.

## Open items

**Answered by Ajia (2026-10-29)**
- [x] Drawing on a past version: **read-only until "Fork from here"** (Q2)
- [x] Onion-skin overlay: **no**. Comparing is side by side (H7; where it lives is open after Q7)
- [x] Tutorial popup: **yes, a first-run popup** that points at the timeline (Q2)
- [x] Compare two versions: **side by side** (H7)
- [x] Key moments: **artist marks, with an automatic fallback** (H4). Marks are kept (Q3)

**Still open**
- [ ] First-run popup: what it says, and when it goes away (Q2)
- [ ] No history page (Q7): where do the per-layer brush info (use case 1), Mark, Export image, and side-by-side compare go now?
- [ ] Key-moment thumbnails (marks + fallback, H4): do they still exist without the history page, e.g. on the timeline rows?
- [ ] Fallback key moments: which automatic ones exactly (H4)
- [ ] Undo stops at the last version boundary (P1). OK, or should undo be able to reach into closed versions?

**Prototype placeholders (decide, then update `prototype/`)**
- [x] ~~Drawing on a past version is blocked~~. Built read-only + "Fork from here", plus a branch picker (P1)
- [ ] Scrubbing shows a flattened image: past versions ignore layer order, visibility, and opacity, and a deleted layer stays visible in the version where it was deleted

**TBD**
- [ ] Main storytelling export: timelapse with chapters, a process board, or something else? (Q3)

---

## Q1. What counts as a version?

**Decided:** 2026-10-17

### Options considered

| Trigger | Pro | Con |
|---|---|---|
| Fixed time interval (e.g. every 15 min) | Simple, predictable | Uneven: 15 min of detail shading ≠ 15 min of blocking in |
| Edit size (% of canvas changed) | Tracks "something happened" | Threshold is arbitrary; a tiny but important detail (e.g. eyes) would be missed |
| Pause in drawing (idle) | Pauses are when artists step back and look — natural reflection points | A long unbroken session becomes one giant version |
| Structural event (layer added / deleted) | Clear, explainable | Some artists rarely touch layers |
| Manual mark | Artist chooses the story beats | Extra work; must stay optional |

### Decision

A version closes on **whichever comes first**:
1. a **pause** in drawing (~90s idle — tune during testing)
2. **10 minutes** of active drawing
3. a **layer being added or deleted**

### Recorded, but not used to define versions

These are captured per version as **metadata** — shown in the history UI, never used as triggers:
- **Edit size** — how much of the canvas changed. Can drive visual weight (e.g. node size/outline) so big moves stand out without us having to define "significant."
- **Tools used** — which brushes, brush settings (size, opacity, color).
- **Transforms** (move/scale/rotate) — *probably out of scope*; log if we build them.

### Why

- Fixed time alone is uneven, and "significant edit" has no good threshold. Pauses track how artists actually work, which fits Rewind's goal of encouraging reflection.
- Separating *what defines a version* from *what we display about it* means edit size and tools add to the story without making version boundaries hard to explain.

### Implications

- **Data model:** record every stroke (needed for timelapse playback), and snapshot the canvas at each version boundary. Gives three zoom levels: session → version → stroke.
- **Demo:** 10-min versions are slow to generate on camera. Add a debug time multiplier or a seeded sample history.

---

## Q2. Where does history live, and how is it structured?

**Decided (part 1):** 2026-10-17

### Part 1 — Two surfaces

> **Superseded 2026-10-29 (Q7):** there is no separate history page. The timeline bar on the canvas page is the only history surface, and it shows forks as extra rows.

1. **Timeline bar on the canvas page** (inspired by Fusion 360's bottom timeline). Always visible under the drawing; drag a playhead forwards/backwards through the process without leaving the canvas.
2. **A separate, detailed history page** for deeper browsing (structure: see part 2).

**Why:** History should be one drag away while drawing, not a separate mode you have to remember to open. Fusion's timeline proves a linear, draggable history is learnable; the detail page holds anything too dense for a single bar.

**Timeline bar details (proposed):**
- Segments = versions (from Q1). Each shows icons for the tools used (Q1 metadata), like Fusion's feature icons.
- Edit size can show as segment intensity/height.
- Because every stroke is recorded, dragging *within* a segment scrubs stroke-by-stroke, so it feels smooth rather than jumping between versions.
- ~~The bar is linear, so it shows **the current branch only**. Fork points get a small notch; branches themselves live on the detail page.~~ Superseded by Q7: each branch is its own row.

**Decided: Segment width = equal.**

```
│ ✎ │ ✎ │ ▧ │ ✎ │ ✂ │ ✎ │
└───┴───┴───┴───┴───┴───┘
 v1  v2  v3  v4  v5  v6
 hover → "v3 · 8 min · +12% canvas"
```

| Option | Trade-off |
|---|---|
| **Equal width** | ✅ Easy to click, and long histories stay readable. Duration and edit size show on hover instead |
| Width = time spent | Shows where effort went, but short versions get too small to grab |
| Width = edit size | Highlights big moves, but squeezes careful detail work |

**Decided: Long histories scroll sideways.**

| Option | Trade-off |
|---|---|
| **Horizontal scroll** | ✅ Simple, familiar (what Fusion does), and every version stays one click away. You can't see the whole project at once; the history page covers that |
| Group by session | Each session reads like a chapter, but adds expand/collapse to design and build |
| Pinch / zoom | Flexible, but harder to build and to discover |

**Decided (for now): A past version shows on the full canvas.**

```
┌─ Viewing v3 · Oct 17 · [back to now] ─┐
│                                       │
│          (canvas shows v3)            │
│                                       │
└───────────────────────────────────────┘
│ ✎ │ ✎ │▲▧ │ ✎ │ ✂ │ ✎ │
```

| Option | Trade-off |
|---|---|
| **On the canvas** | ✅ Feels like rewinding, and shows the drawing at full size. A banner keeps "back to now" one tap away |
| Thumbnail popup | Your current work never leaves the screen, but the preview is too small to judge detail |
| Canvas + onion skin | Before and after at once. Good for comparing, but cluttered on busy drawings |

**Decided: The timeline bar is always visible, even on a brand-new project.** This matches Fusion 360, which shows its timeline from the start (empty track plus playback controls, with feature icons added as you work).

**Decided: No hint.** We mocked up a one-line hint ("Your process is being saved. Drag here later to rewind.") and didn't like it. The empty bar stays as it is, like Fusion's.

**Decided (2026-10-29, Ajia): a first-run tutorial popup.** One short card points at the timeline the first time someone opens a project. *Still open:* its wording, and whether it closes on tap, on the first stroke, or both.

**Decided (2026-10-29, Ajia): no onion skin.** The canvas preview shows the past version alone. Comparing happens side by side (H7). Where that lives is open now that the history page is gone (Q7).

### Part 2 — Detail page structure: layers or forks as rows?

**Decided:** **C — forks are the main graph; layers live in a selected-version panel.**

```
main ──●──●──●──●──●──● (current)
           \
fork 1      ●──●──● (alt background)

[selected version ▸]
 ├ lineart   ✎ pen 4px
 ├ color     ✎ brush 20px  (new)
 └ bg        👁 hidden
```

| Option | Why not / why |
|---|---|
| A. Rows = layers (Ajia's sketch) | Shows build-up well, but mostly duplicates the timeline bar, and forks have no home |
| B. Rows = forks only | Loses the per-layer detail |
| **C. Forks + layer panel** | ✅ Shows what the bar can't (exploration), keeps Ajia's per-layer breakdown as the inspector |
| D. No forks | Simplest, but drops the "exploration" story — Rewind's main differentiator vs. Procreate timelapse |

**Why:** The timeline bar already tells the linear story, so the detail page should show branching exploration. Most projects never fork, so the default stays a clean single line.

### Drawing on a past version

**Decided (2026-10-29, Ajia): read-only + "Fork from here."** Past versions are view-only. Trying to draw shows a notice with a **Fork from here** button, and the same button sits in the past-version banner. Forking starts a new branch at the playhead (mid-version too, down to the stroke), and the canvas switches to it.

**Why:** forks stay deliberate, so the history graph only shows branches the artist meant to make. The extra tap is a small cost next to accidental branches.

**Note:** Q2 proposed dimming the canvas, but Q6 rules out opacity for state, so the prototype keeps the orange ring and the "not allowed" cursor.

Shortlist we chose from:
- **Auto-fork:** drawing on an old version quietly starts a new branch from there, with a toast like "Started a new branch from v3." Nothing is lost, and forks appear naturally. Risk: branches the artist didn't mean to create.
- **Read-only + Restore:** past versions are view-only (canvas dimmed) until you tap "Fork from here." More explicit, but it adds a step and stops the artist mid-stroke.

Ruled out:
- **Discard the future** (like undo): destroys history, which contradicts the premise of Rewind.
- **Insert, Fusion-style:** later pixel strokes would replay over the inserted work. Confusing, and hard to build.

---

## Q3. What can an artist export to share their process?

**Decided (for now):** three export options:
1. **Timelapse** video
2. **Branch version as an image** (a still of any version/fork)
3. **Final image**

**Decided (2026-10-29): manual marks are kept** (H4), so chaptered timelapses can use them.

**⏸ TBD:** which one is the *main* storytelling output. Ideas we discussed:
- **Timelapse with chapters:** pauses briefly at key moments (marked versions, forks, new layers) with a short caption like "tried 3 backgrounds." A format people already post, plus Rewind's reflection. Ajia's manual marks would fit here.
- **Process board:** a static layout of key versions and branches, like a design-process slide. Good for portfolios.

---

## Q4. Canvas page layout

**Decided:** 2026-10-17. **C1: everything floats over a full-screen canvas, and the timeline is a wide floating bar that stays open.**

```
┌──────────────────────────────────────────────┐
│ [← Project]                       [Export]   │
│ ┌──┐                              ┌────────┐ │
│ │✎ │                              │ Layers │ │
│ │🖌│          (canvas, full       │ [ L2 ] │ │
│ │✒ │           screen)            │ [ L1 ] │ │
│ │⌫ │                              └────────┘ │
│ │● │                                         │
│ └──┘                                         │
│ ┌──────────────────────────────────────────┐ │
│ │ ▶ ▢▢▢▢▢▢▢ timeline        ⤢ Open history │ │
│ └──────────────────────────────────────────┘ │
└──────────────────────────────────────────────┘
```

| Option | Trade-off |
|---|---|
| A. Ajia's sketch + timeline | Familiar, but brushes and the timeline both sit at the bottom and compete; the timeline reads as another toolbar |
| B. Timeline docked alone at bottom, tools in fixed side panels | Clear hierarchy, but fixed panels take space from the drawing |
| C. Floating panels, timeline as a collapsible pill | Most canvas space, but a hover-to-expand pill hides history and breaks the "always visible" decision (Q2) |
| **C1. Floating panels, wide floating timeline that stays open** | ✅ The drawing is the focus, and history stays visible. It covers the bottom of the canvas |
| C2. Floating tools, timeline docked as its own strip | Never covers the art and reads like a video editor, but takes ~50px of height from the canvas |

**Why:** The drawing is the main point. History should always be visible, but it shouldn't take space from the canvas.

**Order of importance:** canvas, then timeline, then brushes and settings, then layers, then project navigation and export.

**To explore in mockups:** how the floating bar avoids getting in the way of drawing:
- Keep it slim (~32–40px) and partly see-through.
- Fade it while the pen is down and bring it back when the pen lifts. It dims but never hides, so it stays "always visible."
- Allow panning, so artwork under the bar can always be reached.

---

## Q5. Which device do we design for?

**Decided:** 2026-10-17. **Design for tablet first. The demo will probably be on desktop.**

**Why:** Most digital artists draw on a tablet with a stylus, so a tablet-first design supports the story that Rewind is made for artists. The demo video will probably be recorded on a laptop, so everything also has to work with a mouse.

**Implications**
- **Design frame:** iPad landscape (e.g. 1180×820).
- **Touch targets:** at least 44px for every button, segment, and layer row.
- **No hover-only features.** Hover can preview something on desktop, but every piece of information must also be reachable by touch.
- **Input:** the pencil draws; two-finger drag and pinch pan and zoom. On desktop, the mouse draws and space + drag pans.
- **Demo:** record in a browser window sized to the tablet's proportions, so it looks like the tablet design.

**Decided: Combine the tooltip and the past-version banner into one playhead label.** Hover tooltips don't work on touch. One label sits above the playhead whenever it's on a past version (on any device): "v3 · Oct 17 · 8 min · +12%." It shows information only, with no buttons.
- **On the latest version:** no label.
- **While dragging:** the label follows the playhead, placed above it so a finger doesn't cover it.
- **After letting go on a past version:** the label stays.
- **Desktop hover:** shows the same label in gray as a preview, without moving the playhead.

**Working choice, not final: "Back to now" is a separate button, floating above the bar on the right**, shown only while viewing the past. We also considered putting it inside the bar at the right end, like a video player's "jump to live." That keeps the canvas clearer, but it makes the space for versions narrower.

---

## Q6. Visual system

**Decided:** 2026-10-17. **Soft and app-like: a white canvas, white floating panels, a neutral UI, and color reserved for the artwork.** Set up in the svsd-designs Figma file as variables and text styles.

**References:** the radial tool palette with the "Thickness" card, Paper by FiftyThree, a Japanese design-system board (rounded type, a black pill button with a yellow dot), and soft pastel phone UI. What they share: floating light panels with soft shadows, round buttons, one dark color for "selected," and color used for content instead of UI.

### How we got here

| Direction | Why not / why |
|---|---|
| A. Synth panel (patterned, saturated segments; monospace labels) | Most "art x tech," but loud next to the drawing, and it clashes with the artist's own colors |
| B. Paper studio (flat cream panels, tan accents) | Calm, but read as a website more than an app |
| B2. Soft product (floating cards, shadows, round buttons) | Felt right, but the first version had cream panels and failed contrast |
| B2 contrast pass (tan panels, outlined segments, purple selected everywhere) | Passed WCAG, but the tan panels and heavy outlines lost the softness |
| **B2 middle ground** | ✅ Keeps the soft look and fixes everything that failed |

### Rules

- **The canvas is pure white.** It's the artist's paper.
- **Panels are white too**, separated from the canvas by a faint purple hairline (16% opacity) and a soft shadow.
- **Text and icons are dark purple** (#20255D), never black. Muted text is #5E6189 (4.6:1 on white).
- **Selected brush and play button:** filled dark purple, with white icons.
- **Selected version:** tan fill (#CCB67D) with a 2px dark purple ring, so it doesn't rely on tan alone.
- **Default segments, active layer row, slider track:** Rose 50 (#E5D4CA).
- **Future versions and hidden layers:** dashed outline (#9C98A6) and muted text. **Never use opacity to show state**, since faded content fails contrast.
- **Playhead:** orange (#D54F1F, 4.2:1 on white), so "where you are" stands out from both tan and purple.
- **Accent dot:** tan, used on the "Back to now" pill.
- **Saturated palette colors** (orange, teal, dark green, magenta, and others) are the **default brush swatches**, not UI colors.
- **Type:** M PLUS Rounded 1c (called **"Rounded Mplus 1c"** in Figma). Medium for labels and headings, regular for body text.
- **Shapes:** fully round buttons and pills; panels 22px radius; segments 12px.

### Contrast (WCAG)

| Pair | Ratio |
|---|---|
| Dark purple text on white | 14.2:1 |
| Muted text on white | 4.6:1 |
| Dark purple icon on Rose 50 | ~10:1 |
| Dark purple on tan | 7.1:1 |
| Orange playhead on white | 4.2:1 |
| Dashed outline on white | 2.8:1 (decorative; the icon inside carries the meaning) |

### In Figma (svsd-designs)

- **Variables, Primitives collection (17):** the palette, plus white, `dark-purple-muted` (#5E6189), `outline-grey` (#9C98A6), and `dark-purple-a16` (the panel hairline). Hidden from property pickers.
- **Variables, Color collection (29):** names describe their use (`color/bg/canvas`, `color/bg/segment-selected`, `color/text/muted`, `color/border/panel`, `color/accent/playhead`, `color/swatch/1–8`, and so on). Each points to a primitive.
- **Variables, Shape collection (12):** radii (segment and layer row 12, panel 22, full 999), spacing (4/8/12/16/24), and sizes (touch target 44, segment 44, timeline height 58).
- **Every variable has a CSS name** matching its Figma name, e.g. `var(--color-bg-canvas)`. The prototype's CSS still uses its older names (`--ink`, `--paper`, and so on).
- **Text styles:** Rewind/Title 20, Heading 17, Body 15, Label 15, Caption 13, Caption strong 13.
- **Effect style:** Rewind/Panel shadow (two soft dark purple shadows).
- The original 13 color styles were left as they were.

---

## Q7. No history page: the timeline holds everything

**Decided:** 2026-10-29 (Ajia). **Remove the history page. The timeline stays on the drawing page and shows forks as separate rows.** This replaces Q2's two surfaces and the H1–H7 history page decisions below, which stay here as exploration.

```
│ ▢v1 ▢v2 ▢v3 ▢v4              main   │
│   ╰─▢v2 ▢v3                 fork 1  │
```

- **One row per branch**, with time running left to right like the main row. A fork's row starts under the column where it split off, and a line connects it to the version it came from. Shared versions are drawn only once, in the row they started in.
- **Mid-version forks** sit right under the version they were cut from, joined by a straight line.
- **The playhead sits in the current branch's row.** Tapping a version in another row switches to that branch, at that version.
- **The bar grows a row per fork**: the main row plus two fork rows, then the row area scrolls (2026-10-29). The canvas scales down to make room.
- **Expand / collapse (2026-10-29):** once there's a fork, a toggle by the bar switches between every branch's row ("▾ 3 branches") and only the current branch's row ("▸ fork 1 only"), with all of its history in that one row. Forking expands it, so you see where the new row split off. The bar itself never hides, so it stays "always visible" (Q2, Q4).
- **Most projects never fork**, so the bar usually stays a single row, the same as before.

**Why:** branches live where the drawing is, so artists don't have to open a second screen to see or use them.

**Consequences:**
- H1's two use cases still stand. Use case 2 (variations) is now fully on the canvas page: Fork from here, plus the rows.
- Still open: where these go without the history page:
  - use case 1 (H5's per-layer brush info)
  - H6's actions (Mark, Export image)
  - H7's side-by-side compare
  - H4's key-moment thumbnails
- Q4's "⤢ Open history" button is gone.

---

## H1. What is the history page for?

> **H1–H7 superseded 2026-10-29 by Q7 (no history page).** Kept as exploration; see Q7 for what's still open.

**Decided:** 2026-10-17.

**The product overall is for recovering work.** The two main cases:
1. **"What brush did I use there?"** The artist can't remember which brush, size, or color they used on part of the drawing.
2. **Trying variations without losing the original.** The artist wants to try a different version of part of the drawing without duplicating the file or overwriting what they had.

**The history page tells the story of the process so far**, and lets the artist go back to any part of that story.

**How this splits between the two screens:**
- **Timeline bar (canvas page):** fast recovery while drawing. Drag back, look, return.
- **History page:** the story. See the whole process, including forks, and go back to a chapter of it.

**Implication:** case 1 needs the brush, size, and color for a version to be easy to find and reuse. This belongs in the selected-version panel (H5), where Ajia's sketch already has "reuse a brush or color."

---

## H2. Getting to the history page and back

**Decided:** 2026-10-17.
- **The timeline bar expands into the history page** instead of opening a new screen. The bar grows into the page's graph, so it's clear they show the same history.
- **A "Back to drawing" button** returns to the canvas. It probably collapses back into the bar.

---

## H3. History page layout

**Decided:** 2026-10-17. **Preview on top, graph along the bottom.**

```
┌─[← Back to drawing]──────────────────────┐
│ ┌───────────────────────┐ ┌────────┐     │
│ │                       │ │ v3     │     │
│ │   large preview       │ │ layers │     │
│ │   (selected version)  │ │ brushes│     │
│ │                       │ │ actions│     │
│ └───────────────────────┘ └────────┘     │
│ main ─▢─▪─▪─▢─▪─▪─▪─▢   (graph,          │
│ fork 1        └▪─▪─▢     full width)     │
└──────────────────────────────────────────┘
```

| Option | Trade-off |
|---|---|
| **Preview top, graph bottom** | ✅ The preview takes the canvas's place and the graph sits where the bar was, so the bar visibly grows upward into the graph. The left-to-right graph gets the full width |
| Graph top, preview below | The story comes first, but the bar would jump from the bottom to the top during the expand animation |
| Ajia's sketch: preview left, graph right | A left-to-right graph squeezed into a column only fits a few versions |

**Selected-version panel** (layers, brushes, actions) sits to the right of the preview. Its contents are H5.

---

## H5. Selected-version panel

**Decided:** 2026-10-17. The panel next to the preview shows:
- **Layers breakdown** (Ajia's sketch): each layer with a thumbnail, new strokes outlined, hidden layers marked. **Each layer row also lists the brushes used on that layer in this version, with size, opacity, and color** (e.g. "Lineart · pen 4px, dark purple"). This is where use case 1 ("what brush did I use for that part?") is answered, grouped the way artists think about it.
- **Version details:** date, time spent, % of canvas changed, and what ended the version (a pause, the 10-minute limit, or a layer change).

**Not chosen for now:**
- A separate brushes list. Brush info lives inside each layer row instead. Whether tapping a brush there loads its settings is part of H6 (actions).
- Tapping a spot on the preview to see which stroke, brush, size, and color made it.

---

## H6. Actions on a selected version

**Decided:** 2026-10-17.
- **Fork from here:** return to drawing on a new branch that starts at this version (use case 2, trying variations). The same action as on the canvas page (Q2, read-only + fork).
- **Mark:** make this version a key moment, so it gets a full thumbnail (H4).
- **Export image:** save this version as an image (Q3's "branch version as an image").

**Not chosen for now:**
- "Use this brush" (tap a brush in a layer row to load its settings). The brush info is still shown in the layer rows.
- "Play this branch" as a timelapse in the preview. Playback still exists on the timeline bar's ▶ button.

---

## H7. Comparing two versions

**Decided (2026-10-29, Ajia): side by side.** Two previews next to each other on the history page. We rejected a before/after slider, and onion skin was ruled out (Q2).

**Still open:** how the artist picks the second version (e.g. a "Compare" action in the selected-version panel, then tapping another version on the graph).

---

## H4. Fork graph

**Decided (direction):** 2026-10-17. **Time runs left to right, matching the timeline bar.** Each branch is a row.

**Decided: how each version is shown.** Full thumbnails only at key moments (B), small segments in between with a cropped "what changed" preview (E), and a large preview of whichever version is selected (C).
- **Key moments get full thumbnails**, so the graph reads like a storyboard you can skim.
- **Versions in between are small segments**, the same as on the timeline bar. Hovering or selecting one shows a **crop of only the area drawn in that version** (from the recorded stroke positions), so small changes like "refined the eyes" are visible.
- **Selecting any version shows it large** in the preview area, with its layer breakdown (Ajia's sketch).

**Pain points with thumbnails that this addresses:**
1. Neighboring versions look the same at thumbnail size, but the reason to go back is often a detail. → The crop shows the detail.
2. A readable thumbnail is ~100–120px, so only ~8 fit across a tablet, and long histories lose the overview. → Only key moments are full size.
3. Every fork adds another row of thumbnails. → Rows are mostly small segments.
4. Early versions are mostly blank. → They're segments unless they're a key moment.

| Option | Trade-off |
|---|---|
| A. Thumbnail for every version | Most visual, but has all four problems |
| **B. Thumbnails at key moments only** | ✅ Storyboard you can skim, stays compact. Needs a rule for what's "key" |
| **C. Small graph + one large preview** | ✅ Big enough to judge detail. On its own, the graph doesn't tell the story |
| D. Zoom in to see thumbnails | Flexible, but hardest to build and to discover |
| **E. Crop thumbnails to what changed** | ✅ Shows what you did in that version. Loses the whole-piece context, so it's used for in-between versions only |

**Decided (2026-10-29, Ajia): artist marks, with an automatic fallback.** The artist chooses which versions become thumbnails, which gives them agency and makes the story their own. So marks exist (Q3), and H6's "Mark" action is no longer provisional.
- **Fallback:** without it, a project with no marks would have no thumbnails. Automatic key moments fill in. Candidates: the latest version of each branch, fork points, the first version of each session, big changes (edit size above a set amount).
- **Still open:** which of these candidates to use, and whether the fallback shows only when there are no marks or alongside them.

---

## T1. Drawing engine

**Decided:** 2026-10-17. **p5.brush with its built-in brushes**, following [draw-your-attention](https://draw-your-attention.vercel.app/). We won't design custom brushes.

| Option | Trade-off |
|---|---|
| **p5.brush, built-in brushes** | ✅ Natural textures (pen, marker, spray, charcoal, 2B/HB/2H pencils) with no brush design work. The example draws live by calling `brush.line(prevX, prevY, x, y)` on every drag event, so short segments seem fast enough for live drawing even though the author warns it's meant for high-res artwork |
| Canvas 2D + perfect-freehand + our own stamp brushes | Fast, replays exactly, but brush tuning takes time and it looks plainer |
| Fork Klecks (Kleki's engine, MIT) | Brushes and layers come free, but its history stores pixel tiles in a straight undo list: no stroke data, no forks. We'd be rebuilding history inside a ~600-file codebase |

**Implications**
- **Stroke record:** `{brush, color, weight, layer, seed, segments: [[x1,y1,x2,y2], ...], t}`. Replaying = calling `brush.line` again with the same seed.
- **Scrubbing:** redrawing textured strokes is slow, so rely on the snapshot taken at each version (Q1) and only redraw the strokes after it.
- **Layers:** one WEBGL `p5.Graphics` per layer, using `brush.load(pg)`. Tested 2026-10-17, see "Gotchas" below.
- **Version:** pinned to **p5 2.3.3 + p5.brush 2.2.3**, stored locally in `prototype/lib/`.

**Gotchas from building the prototype (p5.brush 2.2.3)**
- Brush strokes are buffered and only written at the **end of the frame** (p5's `postdraw`), to whichever target is loaded at that moment. Calling `brush.load()` to switch back mid-frame **throws away** the pending strokes.
- `p5.Framebuffer` targets didn't receive brush strokes in testing (with p5 2.2 or 2.3), even though the docs list them. `createGraphics(w, h, WEBGL)` works.
- So in each frame: do all regular p5 drawing first, then load **one** brush target and make the brush calls last. They appear on the next frame.
- Each WEBGL graphics is its own WebGL context (browsers allow ~16), so the prototype caps layers at 8.
- In p5 2.x, `redraw()` is async and returns a Promise.

---

## P1. Canvas page + timeline bar prototype

**Built:** 2026-10-17, in `prototype/`. A clickable HTML mockup that also tests p5.brush.

**Run it**
```
python3 -m http.server 5173 --directory prototype
```
Then open http://localhost:5173. In Claude Code, the `prototype` entry in `.claude/launch.json` does the same.

**What it covers**
- **Canvas page:** color + size rail (left), 6 built-in p5.brush brushes in a tray (bottom), layers with hide, opacity, and delete (right), following Ajia's lo-fi sketch.
- **Timeline bar:** Fusion-style transport (⏮ ◀ ▶ ▶| ⏭) and equal-width version chips that scroll sideways. Each chip shows its most-used tool icon, and its fill shows edit size relative to the biggest version. Hovering shows time, stroke count, % of canvas, tools and sizes, and what closed the version.
- **Versions** close after a pause, a time cap, or a layer add/delete. Under **⚙ Mock settings**, "demo timing" shortens these to a 4s pause and a 30s cap, so you can see it working quickly.
- **Scrubbing** moves stroke by stroke inside a version, and the past is shown full-size on the canvas with a "Viewing v3 · stroke 4/8 · Back to now" banner (Q2). ▶ plays the whole process as a timelapse.
- **Empty state:** the bar is always visible. The hint can be turned on or off in Mock settings, so both versions can be compared (Q2).
- **Tool layout (2026-10-29, Ajia):** brushes moved from the bottom tray into a vertical column on the far left edge, with the color/size rail to its right. Undo and redo buttons sit at the bottom of the rail (also ⌘Z / ⇧⌘Z).
- **Undo scope (working choice):** undo and redo only reach strokes in the version that's still recording. Once a version closes (pause, time cap, layer change), it's history, and you rewind on the timeline instead. Otherwise undo would quietly rewrite saved versions. Undone strokes aren't recorded. Undo works by clearing the stroke's layer and replaying the strokes left on it.
- **Fork rows (2026-10-29, Q7):** each branch is its own row on the bar, connected to its fork point. Tapping another row switches branches. This replaced the fork notch and the branch picker, and the History button is gone.
- **Read-only past + forking (2026-10-29):** drawing on a past version shows a notice. **Fork from here** (in the notice or the banner) starts a new branch at the playhead, down to the stroke. The new branch shares the earlier versions, and its layers are rebuilt by replaying recorded strokes (one layer per frame, per T1's gotchas). 
- **Not built:** pan/zoom, eraser, saving between reloads, the projects page, the first-run popup, marks. Export saves only the final PNG.
