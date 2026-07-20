# Dawn — Design System

Written at the end of the V34–V37 design pass. If you're adding a screen, read
this first: nearly every inconsistency the audit found came from someone
hand-rolling something that already existed.

## The brand

Navy `#16233F` · Amber `#FF9E43` / `#F97316` · Surface `#F8F9FC` · Line `#EBEEF5`
Fraunces (display) + Inter (body). Don't introduce new colours or fonts.

## Type

Use the scale. **Nothing below 12px** — the build fails on it.

| Class | Size | Use |
|---|---|---|
| `.t-micro` | 12px | labels, meta, timestamps |
| `.t-small` | 13px | secondary text |
| `.t-body` | 15px | reading text |
| `.t-title` | 20/22px | section headings |
| `.t-display` | 28/32px | page headings |
| `.t-label` | 11px caps | uppercase micro-labels (tracking keeps it legible) |

## Cards

- `.dawn-card` — the default. White, hairline border, soft shadow.
- `.dawn-card-flat` — no shadow, for dense lists.
- `.dawn-card-inset` — recessed, for a card inside a card.
- `.dawn-row` — a row within a list card; separators handled.

Don't write `bg-white rounded-2xl border border-navy-line`. That's `.dawn-card`.
Red and dashed borders are the exception — they carry meaning.

## Buttons

`.btn` + an intent: `.btn-primary`, `.btn-accent`, `.btn-quiet`, `.btn-danger`.
`.btn-sm` for compact rows.

**Icon-only buttons use `.btn-icon`** — 44px hit area, icon size unchanged.
It belongs on `<button>` and `<a>` only, never a wrapping `<div>`, and it needs
an `aria-label` or a screen reader announces only "button". Both are enforced.

## Inputs

`.inp` on every input, select and textarea. 16px on mobile deliberately: iOS
Safari zooms the viewport on a focused field smaller than that.

## Modals

`.dawn-scrim` > `.dawn-sheet`. Bottom sheet under 640px, centred dialog above.
`.dawn-sheet-wide` for wider content. Put the dismiss handler on the scrim and
`stopPropagation` on the sheet.

## Tables

Wrap in `.dawn-table-wrap`, and mark the identity column `.sticky-col`. Without
it, scrolling a wide table sideways leaves anonymous rows.

**Above ~10 columns, build a mobile card view instead** and hide the table with
`hidden md:block`. The attendance month grid is the reference implementation.

## Layout

`.dawn-page` for page containers. `.pill` + `.pill-{green,amber,red,sky,grey,navy}`
for status. `.dawn-empty` for empty states. `.pb-safe` and `.dawn-bottom-nav`
for anything fixed to the bottom edge — phones with a home indicator clip
content otherwise.

## The guard

`node scripts/check-layout.mjs` — seven checks, run before shipping:

1. no text below 12px
2. every table scrolls
3. no fixed width over 340px
4. every system class used in markup exists in globals.css
5. every icon button has a 44px hit area
6. `.btn-icon` only on interactive elements
7. icon-only controls have accessible names

Check 4 exists because `.inp` was used 95 times and defined nowhere for months —
every one of those fields silently rendered as a browser default. Check 6 exists
because an automated sweep put `.btn-icon` on five wrapper divs.

The principle behind all of them, learned the hard way in V33: a layout or
config regression compiles cleanly, passes every test, breaks no route, and just
makes the product quietly worse until a user finds it.
