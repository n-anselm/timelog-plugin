# Timelog — Obsidian Timeline Plugin

A clean, responsive, and high-performance **Horizontal Timeline Plugin** for Obsidian (`v1.3.0`) that plots your notes and events along a single continuous axis.

> Full disclosure: this is a personal project created with AI (mostly OpenCode with Gemini 4 Argon). Use at your own risk.

---

## Features

- **Single Continuous Axis**: Clean chronological line where time flows left-to-right.
- **Dots, Lucide Icons, Multi-Day Spans & Same-Day Spreading**:
  - Single-day events render as interactive markers along the axis (classic circle or any Lucide icon, either as a filled category-colored badge with auto-contrasted black/white icon or as an outlined icon with a form-fitting contour knockout).
  - Multiple events on the same day spread across the day column and automatically uncluster at `≥ 30 px/day`.
  - Multi-day events (with `date-end`) render as continuous colored bars (`12px` normal / `6px` zoomed out, starting with the category's icon marker) spanning their full inclusive duration.
  - Configurable **Event indicator scale** (`0.5–2.5×`) scales single-day markers, multi-day bar thickness, and merged cluster bubbles.
  - Labels alternate above and below the axis across three stem tiers so nearby events stay legible.
- **Yearly Recurring Events & Birthdays**:
  - Per-category **Recurring yearly** toggle repeats matching events on the same month and day every year from their start year up to a configurable **Recurring events future horizon (years)** (default `3` years) or the note's end date property.
  - Optional **Differentiate initial event** toggle (flips Filled ↔ Outlined marker style, adds a `★` origin badge, and titles birthday origins `"<Name> born"`) and **Birthday label format** (`"<Name>'s birthday"`).
- **Adaptive Ruler & Labels**:
  - **Zoomed Out**: Labels hide and nearby events merge into numbered cluster bubbles (click a bubble to zoom in on it). When zoomed out to multi-year scale, monthly dividers collapse cleanly to year blocks.
  - **Medium Zoom (`≥ 30 px/day`)**: The day/weekday ruler fades in smoothly and labels switch to vertical orientation (with configurable max height).
  - **High Zoom (`≥ 65 px/day`)**: Labels switch to horizontal badges.
- **Condition-Based Categories & Colors**:
  - Organize events with expandable, drag-to-reorder category cards (first match wins) and native color pickers.
  - Build rules matching `Tags` (multi-tag pill input with autocomplete), `Folder`, `File Name`, `File Basename`, `Path`, `Extension`, or any custom frontmatter property (`AND` / `OR` modes).
  - Uncategorized notes are hidden by default (`Show uncategorized notes` toggleable in Settings), plus an optional **Global note filter** (`include` / `exclude`).
  - Filter categories on the fly via toolbar pills or the live `Filter events… (/)` search input.
- **Hover Popups & Image Lightbox**:
  - Hovering an event shows title (or note alias), formatted date/range, relative time (`In 5 days`, `2 years, 1 month ago`, `Ongoing`), category badge, and description.
  - Notes with an `image` frontmatter property display a thumbnail preview in the popup; hovering the thumbnail opens a `75vh` lightbox (`Esc` or mouse-out to close).
- **Smooth Navigation, Velocity Zoom & Hotkeys**:
  - Click-and-drag pan with heavy momentum physics, `Shift + wheel` pan, and trackpad horizontal pan.
  - Cursor-pinned wheel zoom with configurable **Zoom sensitivity** and velocity **Zoom acceleration**.
  - Configurable **Default view zoom (time span)** (e.g. `6 months`, `5 days`, `1 year`) and **Default view offset from today** (e.g. `0`, `-1 month`).
  - Built-in keyboard shortcuts (`Home` reset to default view, `0` / `Z` zoom to fit all events, `←` / `→` pan, `Shift + ←/→` or `PageUp/PageDown` jump `±1 Month`, `=` / `-` zoom, `L` cycle label mode, `/` focus search) — all customizable in Obsidian's **Settings → Hotkeys**.
- **Embedded Markdown Codeblock**:
  Embed interactive timelines inside any note using ```` ```timeline ```` blocks (`folder`, `zoom`, `offset`, `labels`).

---

## Quick Start

1. Click the **Open Timelog** icon (`calendar-range`) in the left ribbon, or run `Timelog: Open Timelog View` from the command palette.
2. Add a date and a matching category tag/property to your note's frontmatter:

```yaml
---
date: 2026-11-14
date-end: 2026-11-17
tags:
  - event
image: "[[cover.jpg]]"
description: "Optional summary shown in the hover popup"
---
```

3. Or embed a timeline inside any note:

````markdown
```timeline
folder: Calendar
zoom: 6 months
offset: -1 month
labels: auto
```
````
