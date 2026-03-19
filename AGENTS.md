# AGENTS.md

This file guides AI coding assistants working on this project.

---

## Mission

Build a **Next.js media product** with the editorial seriousness of a newspaper and the restraint of a contemporary minimal design studio.

The target is:
- **serious, calm, precise, intelligent, typographic**;
- **minimal but not empty**;
- **modern but not trendy**;
- **barely-there UI**, where interface chrome recedes and content structure does the work.

The reference attitude is a hybrid of:
- the authority and editorial discipline of **L'Orient-Le Jour**;
- the reduced, refined, almost invisible interface language of studios like **Norgram** or **Open Statement**;
- a design culture shaped by typography, grids, sequencing, captions, indexes, metadata, and pacing.

This product must **not** feel like a SaaS dashboard, not like a generic news template, and not like a flashy portfolio site.

It must feel like:
**a publication first, an interface second.**

---

## Core interpretation of the brief

When translating this design language to web UI/UX, follow this principle:

> The interface should almost disappear, while structure, typography, spacing, and editorial sequencing carry the experience.

This means:
- fewer visible components;
- fewer boxes;
- fewer borders;
- fewer colors;
- fewer signals competing at once;
- more whitespace;
- better typography;
- stronger alignment;
- more deliberate rhythm.

The user should feel:
- orientation without clutter;
- seriousness without heaviness;
- modernity without startup gloss;
- minimalism without vagueness;
- editorial authority without visual nostalgia.

---

## Aesthetic north star

### The product should feel
- editorial;
- restrained;
- exacting;
- calm;
- literate;
- contemporary;
- lightly architectural;
- typographically led;
- frictionless to read;
- quietly premium.

### The product should not feel
- dashboard-heavy;
- boxy;
- card-based by default;
- dark and oppressive unless explicitly required;
- overly interactive;
- decorative;
- tech-brand glossy;
- Swiss-cliche or faux-minimal;
- like a Figma component kit dropped on top of content.

---

## Product definition

This is a **media application**.

Core page types may include:
- home / front page;
- article page;
- live briefing / review page;
- archive / index;
- topic pages;
- country pages;
- source pages;
- author pages;
- special dossiers;
- internal editorial tools only when required.

The interface must support:
- scanning;
- deep reading;
- comparison;
- filtering;
- source transparency;
- chronology;
- editorial packaging;
- conversion from article inventory to final review output.

But all of that should be expressed with **editorial composition**, not dashboard logic.

---

## Primary design rules

### 1. Typography carries the identity
Typography is the main design system.

Prioritize:
- elegant hierarchy;
- serious text rendering;
- strong headline / deck / metadata relationships;
- excellent spacing;
- subtle contrast;
- stable rhythm in long lists and long-form reading.

Do not rely on visual styling to compensate for weak typographic structure.

### 2. Whitespace is infrastructure
Whitespace is not emptiness. It defines rank, pace, grouping, and confidence.

Prefer:
- generous outer margins;
- measured inner spacing;
- clear vertical rhythm;
- large quiet zones around headlines and filters;
- restrained grouping by distance rather than by containers.

### 3. Use the grid quietly
The grid should be felt more than seen.

Prefer:
- clean multi-column editorial layouts;
- asymmetry only when justified by reading hierarchy;
- stable content widths;
- rails for metadata or navigation when useful;
- alignment across sections.

Do not make the grid loud or performative.

### 4. Interface chrome must recede
Buttons, chips, tabs, filters, dropdowns, and controls should be quiet.

Use minimal visible affordance:
- light borders;
- subtle background shifts;
- restrained active states;
- underlines or rules rather than filled pills when possible.

The content and the structure must dominate, not the controls.

### 5. Editorial seriousness over "product excitement"
This is not growth UI.

Avoid:
- celebratory metrics;
- glossy KPI tiles;
- large colorful status indicators;
- fake productivity aesthetics;
- empty ornament.

When counts or statistics are needed, render them as calm editorial facts.

### 6. Minimalism must still be usable
Barely-there UI does **not** mean ambiguous UI.

Everything important must remain:
- legible;
- keyboard navigable;
- obviously interactive when interactive;
- structurally clear;
- accessible in contrast and focus behavior.

---

## Visual language

### Overall tone
Default visual mode should be **light**, quiet, and low-contrast.

Prefer:
- warm off-white or neutral paper-like backgrounds;
- near-black text;
- muted greys;
- one restrained accent color.

Dark mode is optional, not the default reference, unless the project explicitly requires it.

### Suggested palette attitude
Use a palette such as:
- background: warm off-white / paper grey;
- text: near-black;
- secondary text: muted charcoal / warm grey;
- rules: very light grey;
- accent: restrained editorial red or deep muted tone.

Accent color should be used for:
- current section marker;
- active nav state;
- selected filter state;
- key editorial cue;
- rare data emphasis.

Do not use accent as decoration.

### Borders and rules
Prefer:
- 1px hairlines;
- thin dividers;
- quiet underlines;
- occasional field outlines where function demands it.

Avoid:
- thick borders;
- heavy card frames;
- repeated boxed modules;
- hard shadows.

### Corners and shape
Corners should be:
- square;
- very slightly rounded only if necessary.

Avoid soft consumer-product rounding everywhere.

### Shadows
Use almost none.

If depth is needed, use:
- tonal contrast;
- layering by spacing;
- gentle overlays;
- extremely subtle shadow only for floating elements.

---

## Explicit anti-patterns

Do **not** produce:
- dark dashboard aesthetics by default;
- boxed KPI rows across the page;
- chunky outlined controls everywhere;
- card grids for everything;
- glassmorphism;
- neumorphism;
- gradients;
- glows;
- glossy black interfaces;
- hero banners with empty drama;
- fake brutalism;
- oversized rounded corners;
- too many badges;
- heavy dividers;
- loud hover states;
- template news-site UI;
- portfolio-studio gimmicks that reduce readability;
- "premium SaaS" styling;
- ornamental interactions.

Specifically avoid the common failure mode:
**a media product that looks like an analytics dashboard.**

---

## Technical defaults

Use these defaults unless the repository or user says otherwise:
- **Next.js App Router**;
- **TypeScript**;
- **Tailwind CSS**;
- **Server Components by default**;
- **Client Components only when needed**;
- **CSS Grid and flex used carefully**;
- **minimal dependency footprint**.

shadcn/ui may be used only as an implementation base.
Its default visual style must be overridden heavily.

Do not let component libraries dictate aesthetics.

---

## One-sentence reminder

**Design this product like a serious publication with an almost invisible interface: typographic, minimal, modern, calm, and exact.**
