---
name: Fixloop
description: Maintenance follow-up for small property-management firms, drawn as a triplicate carbon work-order pad.
colors:
  paper: "#fbfaf6"
  sheet: "#ffffff"
  sheet-2: "#f3f1ea"
  ink: "#22252a"
  ink-2: "#4a4f57"
  ink-3: "#676c75"
  rule: "#2b2b2b"
  hair: "#dedad0"
  hair-2: "#ebe8df"
  ballpoint: "#1c3f94"
  ballpoint-2: "#142f73"
  ballpoint-tint: "#e7edf9"
  serial: "#c8102e"
  serial-tint: "#fbe7ea"
  amber: "#9a5b00"
  ok: "#1f6b3a"
  ok-tint: "#e3f2e7"
  you: "#f6e27a"
  you-ink: "#4a3b00"
  vendor: "#cfe0f5"
  vendor-ink: "#12325e"
  tenant: "#f2b8c6"
  tenant-ink: "#5c1529"
  owner: "#bfe3c8"
  owner-ink: "#134a26"
  series-1: "#2f5fc4"
  series-2: "#d08a00"
  series-3: "#c8457a"
  series-4: "#1aa3b8"
  series-5: "#7a5cc8"
  series-6: "#2f9a5a"
typography:
  headline:
    fontFamily: "'Archivo Variable', 'Archivo', system-ui, sans-serif"
    fontSize: "26px"
    fontWeight: 720
    lineHeight: 1.2
    letterSpacing: "-0.01em"
    fontVariation: "'wdth' 92"
  title:
    fontFamily: "'Archivo Variable', 'Archivo', system-ui, sans-serif"
    fontSize: "18px"
    fontWeight: 680
    lineHeight: 1.2
  title-sm:
    fontFamily: "'Archivo Variable', 'Archivo', system-ui, sans-serif"
    fontSize: "15px"
    fontWeight: 650
    lineHeight: 1.2
  body:
    fontFamily: "'Archivo Variable', 'Archivo', system-ui, sans-serif"
    fontSize: "14px"
    fontWeight: 400
    lineHeight: 1.5
    fontFeature: "'tnum'"
  entered-value:
    fontFamily: "'Archivo Variable', 'Archivo', system-ui, sans-serif"
    fontSize: "14.5px"
    fontWeight: 400
    lineHeight: 1.5
  box-label:
    fontFamily: "'Archivo Variable', 'Archivo', system-ui, sans-serif"
    fontSize: "11.5px"
    fontWeight: 750
    letterSpacing: "0.12em"
    fontVariation: "'wdth' 105"
  field-label:
    fontFamily: "'Archivo Variable', 'Archivo', system-ui, sans-serif"
    fontSize: "10.5px"
    fontWeight: 700
    letterSpacing: "0.11em"
  band:
    fontFamily: "'Archivo Variable', 'Archivo', system-ui, sans-serif"
    fontSize: "12px"
    fontWeight: 780
    letterSpacing: "0.1em"
    fontVariation: "'wdth' 108"
  stat:
    fontFamily: "'Archivo Variable', 'Archivo', system-ui, sans-serif"
    fontSize: "28px"
    fontWeight: 720
    lineHeight: 1.15
    fontVariation: "'wdth' 90"
  serial:
    fontFamily: "'Courier Prime', ui-monospace, monospace"
    fontSize: "12.5px"
    fontWeight: 700
    letterSpacing: "0.02em"
rounded:
  hair: "2px"
  sm: "3px"
  md: "4px"
  pill: "999px"
spacing:
  xs: "6px"
  sm: "8px"
  md: "14px"
  lg: "18px"
  xl: "28px"
components:
  button:
    backgroundColor: "{colors.sheet}"
    textColor: "{colors.ink}"
    rounded: "{rounded.md}"
    padding: "0 14px"
    height: "36px"
  button-hover:
    backgroundColor: "{colors.sheet-2}"
  button-primary:
    backgroundColor: "{colors.ballpoint}"
    textColor: "{colors.sheet}"
    rounded: "{rounded.md}"
    padding: "0 14px"
    height: "36px"
  button-primary-hover:
    backgroundColor: "{colors.ballpoint-2}"
  button-danger:
    backgroundColor: "{colors.sheet}"
    textColor: "{colors.serial}"
    rounded: "{rounded.md}"
    height: "36px"
  button-ghost:
    textColor: "{colors.ink-2}"
    rounded: "{rounded.md}"
    height: "36px"
  input:
    backgroundColor: "{colors.sheet}"
    textColor: "{colors.ballpoint}"
    rounded: "{rounded.md}"
    padding: "7px 11px"
    height: "38px"
  box:
    backgroundColor: "{colors.sheet}"
    textColor: "{colors.ink}"
    rounded: "{rounded.hair}"
  box-head-you:
    backgroundColor: "{colors.you}"
    textColor: "{colors.you-ink}"
    typography: "{typography.box-label}"
    padding: "9px 14px"
  box-head-vendor:
    backgroundColor: "{colors.vendor}"
    textColor: "{colors.vendor-ink}"
    typography: "{typography.box-label}"
    padding: "9px 14px"
  box-head-tenant:
    backgroundColor: "{colors.tenant}"
    textColor: "{colors.tenant-ink}"
    typography: "{typography.box-label}"
    padding: "9px 14px"
  box-head-owner:
    backgroundColor: "{colors.owner}"
    textColor: "{colors.owner-ink}"
    typography: "{typography.box-label}"
    padding: "9px 14px"
  box-head-risk:
    backgroundColor: "{colors.serial}"
    textColor: "{colors.sheet}"
    typography: "{typography.box-label}"
    padding: "9px 14px"
  valve-tag:
    backgroundColor: "{colors.sheet}"
    textColor: "{colors.serial}"
    typography: "{typography.serial}"
    padding: "1px 9px 1px 7px"
  flow-band:
    backgroundColor: "{colors.sheet-2}"
    textColor: "{colors.ink}"
    typography: "{typography.band}"
    height: "34px"
    padding: "0 30px 0 12px"
  stamp:
    textColor: "{colors.ballpoint}"
    rounded: "{rounded.sm}"
    padding: "1px 6px"
  pill:
    backgroundColor: "{colors.sheet-2}"
    textColor: "{colors.ink-2}"
    rounded: "{rounded.pill}"
    padding: "2px 9px"
  topbar:
    backgroundColor: "{colors.ink}"
    height: "56px"
    padding: "0 24px"
---

# Design System: Fixloop

## Overview

**Creative North Star: "The Carbon Copy Holds the Job"**

Every job is a triplicate work order on a paper pad. The colour of the copy says who the job is waiting on right now, and the pipe marker says where it flows next. The pad supplies the materials: an off-white paper ground, white sheets ruled with dark ink form boxes, tiny tracked uppercase field labels, a red serial printed on every reference, and ballpoint blue for whatever a person has written in or can act on. Pipe-marker flow bands and punched valve-tag chips, taken from plant-room labelling, carry the sense of flow.

Density is that of an office form: compact 14px body, 14px cell padding, hairline rules between fields, heavier ink rules around boxes. The system is light only. That was chosen for the use scene, a PM at a laptop in office daylight, and the build sets `color-scheme: light`. It rejects the grey SaaS table with indigo pills: status is a rubber stamp, a holder is a copy colour, and a reference is a red serial on a tag.

**Key Characteristics:**
- Paper ground, white sheets, 1.5px ink form-box rules, 1px hairlines inside.
- Four copy colours, one per party: You canary, Vendor blue, Tenant pink, Owner green. Each has its own dark ink for text on it.
- Red serial for references, at-risk, emergency and late. Ballpoint blue for primary actions, links, focus and entered values.
- Archivo Variable with the width axis in use, plus Courier Prime for serials.
- Flat sheets. Shadows only on things lifted off the pad (dialogs, menus, toasts).

## Colors

A warm paper-and-ink neutral base carrying four pastel carbon-copy colours, with two pen colours (red serial, ballpoint blue) doing all the accent work.

### Primary
- **Ballpoint Blue** (ballpoint): primary buttons, links, focus outlines, caret, checkbox accent, selected chips and category tiles, step progress, and the text of every entered value (field values and input text). If a person wrote it or can press it, it is ballpoint. The darker **Pressed Ballpoint** (ballpoint-2) is for hover and the button's bottom lip. **Ballpoint Wash** (ballpoint-tint) fills info notices, selected tiles and the dropzone on hover.

### Secondary
- **Serial Red** (serial): reference numbers on valve tags, the topbar's bottom rule, the open-jobs counter badge, active tab underline, the at-risk band and box head, emergency priority and bar, late numbers, error text, invalid borders, danger buttons. **Serial Wash** (serial-tint) fills bad notices, bad pills and danger hover.

### Tertiary (the copy colours)
- **Canary Copy** (you, with you-ink text): the job waits on the PM. Also used for text selection, the avatar, and the active nav underline.
- **Vendor Blue Copy** (vendor, with vendor-ink text): the job waits on the vendor.
- **Tenant Pink Copy** (tenant, with tenant-ink text): the job waits on the tenant.
- **Owner Green Copy** (owner, with owner-ink text): the job waits on the owner.
- Signals outside the copy set: **Carbon Amber** (amber) for warn stamps, high priority and warn pills, and **Filed Green** (ok, with ok-tint) for done stamps and ok notices.

### Neutral
- **Pad Paper** (paper): page ground, dialog footers, timeline notes.
- **Sheet White** (sheet): boxes, inputs, buttons, tags, menus.
- **Second Sheet** (sheet-2): button and menu hover, idle bands and pipe steps, meter tracks.
- **Ink** (ink): body text, topbar, toasts, tooltips, the pressed segment.
- **Ink 2 / Ink 3** (ink-2, ink-3): secondary text, then labels, meta and muted text.
- **Form Rule** (rule): the 1.5px border on every box, button, segment, dialog, menu and table header.
- **Hairline / Hairline 2** (hair, hair-2): field-grid cell rules, then row and table-cell separators.

### Chart Series
- Six series hues (series-1 to series-6) were checked for colour-blind separation in this exact order. They live as hex in `SERIES` in `web/src/components/charts.tsx` (Recharts writes them into SVG attributes) and are mirrored as `--c1` to `--c6` in CSS. Single-series charts use series-1, and the latest bar is highlighted in ballpoint.

### Named Rules
**The Copy Colour Rule.** A copy colour means exactly one thing: who the job is waiting on. Use canary, vendor blue, tenant pink and owner green only for the holder (band, box head, current pipe step, timeline dot, party chip, legend). Never use them for decoration or category, and always set text on them in the matching party ink.

**The Two Pens Rule.** Red serial marks references and trouble. Ballpoint blue marks actions and entered values. Don't swap them, and don't add a third pen.

**The Fixed Series Rule.** Assign chart colours from `SERIES` in index order. Never cycle, shuffle or interpolate them. A seventh category becomes "Other".

## Typography

**Body Font:** Archivo Variable (falling back to Archivo, system-ui), with the width axis in use.
**Label/Mono Font:** Courier Prime, 400 and 700 (falling back to ui-monospace).

**Character:** Archivo narrows for headings and figures and widens for tracked uppercase labels, the way a form printer sets a form. Courier Prime is the typewritten serial. Tabular numerals are on globally.

### Hierarchy
- **Headline** (720, 26px, 1.2, -0.01em, width 92%): the page h1. Link pages use 22px.
- **Title** (680, 18px, 1.2): section h2. Dialog heads use 16px.
- **Title Small** (650, 15px, 1.2): h3 and empty-state titles.
- **Body** (400, 14px, 1.5, tabular): everything else. Secondary text runs 12.5 to 13.5px. Empty-state copy is capped at 44ch.
- **Entered Value** (400, 14.5px, ballpoint): field values and input text, styled as ballpoint handwriting on the form.
- **Box Label** (750, 11.5px, 0.12em, uppercase, width 105%): box head titles, the form's printed section names.
- **Field Label** (700, 10.5px, 0.11em, uppercase, ink-3): the printed caption above each value cell, table headers, stat tile captions.
- **Band** (780, 12px, 0.1em, uppercase, width 108%): flow-band group headers. Their counts are set in Courier Prime at 14px.
- **Stat** (720, 28px, 1.15, width 90%): stat tile figures and donut totals.
- **Serial** (Courier Prime 700, 12.5px, 0.02em): references on valve tags, the topbar counter (15px, 0.08em) and nav counts (12px).

### Named Rules
**The Printed Caption Rule.** A tracked uppercase label is always the printed caption of a form field, box, band or table column it sits on. It is never a free-floating line placed above a page heading.

**The Typewriter Rule.** Courier Prime is only for serials, references and counters. Prose and labels stay in Archivo.

## Layout

The page is capped at 1380px and centred, with 28px 28px 80px padding (20px 16px 64px at 1080px and below). The sticky topbar is 56px. The working detail layout is a main column plus a 360px rail (`grid-main`, 20px gap), which stacks at 1080px. Two-up grids use an 18px gap and stack at 760px. Vertical stacks use 18px or 10px gaps.

The spacing rhythm is 6 / 8 / 14 / 18 / 28. Cells and box bodies pad 14px. Box heads pad 9px 14px with a 40px minimum height. Field grids are ruled cells (2 columns by default, 1 at 640px). Stat tiles auto-fit at a 150px minimum inside one ruled frame. List rows are at least 52px. At 760px responsive rows collapse to "what + when", with the tag on its own line.

Link pages for vendors, tenants and owners are phone-first: a 560px column with 18px 16px padding and 16px gaps, an ink header with a serial-red bottom rule, and a full-width serial emergency bar where required. The auth page splits into ink art and a form, and drops the art at 900px. Printing to US Letter with 0.5in margins hides the chrome and keeps boxes unbroken.

The superadmin console (`/ops`) reuses the PM chrome, tiles, tables and dialogs. A 3px serial-red rule under the topbar and a serial `OPS` tag beside the wordmark mark it as staff-only. Its three nav links stay inline at every width and shrink to icons at 640px. Each user row has at most one safe fix as a button; everything else sits in a Manage menu, with the destructive actions in serial red at the bottom. Actions that change an account ask for a reason, which goes to the security log.

## Elevation & Depth

The pad is flat. Sheets sit on paper by their ink rules, not by shadow. Depth appears only when something is physically lifted off the pad: dialogs, menus, toasts, the lightbox image and auth-art sheets use the large lift. An occasional box can use the small lift. Modal backdrops are ink at 45% with a 2px blur.

### Shadow Vocabulary
- **Sheet lift** (`box-shadow: 0 1px 2px rgb(40 32 10 / 0.06), 0 6px 16px -6px rgb(40 32 10 / 0.12)`): an optional lifted box, chart tooltips.
- **Held sheet** (`box-shadow: 0 2px 6px rgb(40 32 10 / 0.08), 0 24px 48px -12px rgb(40 32 10 / 0.28)`): dialogs, menus, toasts, lightbox.

### Named Rules
**The Ruled Not Raised Rule.** Separate content on the page with 1.5px ink rules and 1px hairlines. Only use a shadow for a surface that floats above the pad.

## Shapes

Corners are near-square, the way a printed form is: boxes 2px, stamps, dialogs, menus and thumbnails 3px, buttons, inputs and notices 4px. Full rounding belongs to filter chips and the nav count badge only; pills are 3px outlined stamps like status stamps. Two silhouettes come from the borrowed world. The **valve tag** has a 3px squared left edge, a 12px rounded right end and a punched 6px eyelet. The **pipe marker** is an arrow-ended strip (a 12px chevron notch on pipe steps, which interlock with a -10px overlap). A dashed edge (6px dash, 5px gap, 55% opacity) marks a copy held by an outside party.

## Components

### Buttons
Form-ruled and firm.
- **Shape:** gently squared (4px). 36px tall by default, 30px small, 46px large, with a 15px Lucide icon and a 7px gap.
- **Default:** white sheet, 1.5px ink rule, ink text, 640 weight, 13.5px.
- **Primary:** ballpoint fill and border, white text, a 1px pressed-ballpoint bottom lip. Hover darkens to pressed ballpoint.
- **Danger:** serial text and border on white, serial-wash hover. The solid variant fills serial.
- **Ghost:** no border, ink-2 text, second-sheet hover.
- **States:** pressing moves the button 1px down. Disabled is 50% opacity. Loading swaps the icon for a spinner and sets aria-busy. Transitions are 180ms on the shared ease.

### Inputs / Fields
- **Style:** white, 1px #a9a496 stroke, 4px corners, 38px minimum height, text in ballpoint at 14.5px. The label sits above at 12.5px/650, with an "Optional" marker on the right.
- **Focus:** ballpoint border plus a 3px ballpoint ring at 16%. Global `:focus-visible` is a 2px ballpoint outline offset 2px.
- **Error:** serial border, with serial 12.5px error text announced as an alert.
- **Segmented control:** an ink-ruled strip with hairline dividers. The pressed segment is solid ink.

### Form Box (the pad's signature container)
- White sheet, 1.5px ink rule, 2px corners. The head is ruled off by 1.5px ink and titled in Box Label type.
- **Tone:** the head takes the copy colour of whoever holds the job (you, vendor, tenant, owner). At risk turns the border and head serial red with white text.
- **Field grid:** hairline-ruled cells, each a Field Label caption over an Entered Value. An empty value shows a muted dash.

### Valve Tag (references)
A Courier Prime serial in red on a white tag, with a 1px #b9b3a3 stroke, the valve-tag silhouette and a punched eyelet. As a link, hover turns the stroke serial. Every MR-/WO- reference renders this way.

### Flow Band (queue group header)
A 34px strip in the holder's copy colour and party ink, set in Band type, with a Courier count and a right-aligned "since" note. Vendor, tenant and owner bands add the dashed bottom edge, so the holder never depends on hue alone. The at-risk band is serial with white inset 3px rules top and bottom. Bands end in a 16px pipe-marker arrow pointing where the job flows next; inside a box header they may run flat (`clip-path: none`) where the strip is the header itself.

### Progress Pipe (work-order path)
Interlocking chevron steps 38px tall in 11px/720 tracked uppercase. Steps ahead are second sheet in ink-3. Done steps are #e2ded2 in ink-2. The current step fills with the holder's copy colour (ink if none) and settles in with a 500ms back-ease scale.

### Stamps, Party Chips, Pills
- **Rubber stamp** (status): a 1.5px currentColor outline, 3px corners, 10.5px/780 tracked uppercase. Ballpoint by default, ok for done, amber for warn, serial for bad, ink-3 struck through for dead. The solid variant fills with the colour.
- **Party chip:** a 10x13px copy-colour swatch with a 25% black edge beside the party name.
- **Pill:** a full-round tinted label (ok / warn / bad / info), used for compliance badges. Status uses stamps, not pills.

### Navigation
An ink topbar with a 3px serial bottom rule, the brand's stacked-copies mark, and a red Courier counter of open jobs. Nav links are #c5c1b6 at 13.5px/520, turning white on hover. The active link is white with a 3px canary underline. At 1080px the nav becomes a dropdown sheet with a canary left rule on the active item. Page tabs use a 1.5px ink baseline and a 3px serial underline on the active tab.

### Timeline, Notices, Toasts
Timeline dots are 16px, filled with the actor's copy colour and ringed in its ink. Communications are dashed. Internal notes sit on a canary-tinted slip. Notices are 4px tinted panels (info ballpoint, warn amber, bad serial, ok green). Toasts are ink slips at bottom right with a green or red icon, entering on the back ease.

## Do's and Don'ts

### Do:
- **Do** colour a job by who holds it, using the four copy colours with their own party inks. Pair outside-party copies with the dashed edge.
- **Do** put every reference on a valve tag in Courier Prime serial red.
- **Do** write entered values, primary actions, links and focus in ballpoint (#1c3f94).
- **Do** rule boxes with 1.5px ink (#2b2b2b) and cells with 1px hairlines, at 2-4px corners.
- **Do** assign chart colours from `SERIES` in fixed order, and give every multi-series chart a legend.
- **Do** keep the system light only (`color-scheme: light`). The use scene is office daylight.
- **Do** honour reduced motion. All animation and transition durations collapse to 1ms.

### Don't:
- **Don't** use a copy colour for anything except the job's current holder.
- **Don't** show status as indigo pills in a grey table. Status is a rubber stamp.
- **Don't** put a shadow on a sheet resting on the pad. Shadows are for dialogs, menus, toasts and the lightbox.
- **Don't** add a tracked uppercase line above a page heading. Uppercase labels only caption a form field, box, band or column.
- **Don't** set prose or labels in Courier Prime, or serials in Archivo.
