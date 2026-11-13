# Obsidian Timeline Plugin

A clean, responsive, and high-performance **Horizontal Timeline Plugin** for Obsidian that plots your notes and events along a sleek single continuous axis.

---

## Features

- **Single Continuous Axis**: Clean, uninterrupted chronological line where time flows left-to-right.
- **Dots & Multi-Day Spans**:
  - Single-day events are rendered as glowing, interactive dots directly on/along the line.
  - Multi-day events (with `date-end`) are rendered as continuous colored bars spanning across their entire duration.
  - Concurrent events automatically stagger above and below the line with delicate connector stems so no events collide.
- **Adaptive Responsive Labeling**:
  - **Compact / Zoomed Out**: Text labels along the line are cleanly hidden to prevent clutter; hovering over any dot or bar reveals an illuminated floating popup card with title, dates, tags, and summary.
  - **Medium Density**: Text labels smoothly switch to a space-saving vertical orientation, hanging neatly from their markers.
  - **Spacious Zoom**: Text labels expand to full horizontal badges.
  - *Override anytime*: Use the dropdown in the toolbar or settings to force **Auto**, **Vertical**, **Hidden**, or **Horizontal**.
- **Category Filtering & Color Palettes**:
  - Filter events on-the-fly by clicking category pills in the toolbar (e.g. `#event`, `#project`, `#milestone`).
  - Configure custom categories, tags, and colors directly in settings, with curated palettes matching the Linear Calendar plugin.
- **Smooth Navigation & Pan**:
  - Click-and-drag mouse pan anywhere across time.
  - Trackpad / mouse-wheel horizontal scrolling.
  - Quick-jump **Today** button to immediately center the view on the current date with an illuminated vertical indicator line.
  - Quick **Prev** and **Next** month buttons.
  - Zoom slider and `＋`/`－` zoom controls.
- **Obsidian Native Integration**:
  - Click any event dot, bar, or label to open the note.
  - Native hover preview (`hover-link`) integration.
  - Right-click context menu.
  - Real-time reactivity via `MetadataCache` whenever notes are created, modified, or renamed.
- **Embedded Markdown Codeblock**:
  Embed interactive timelines inside any markdown note using ````timeline ```` blocks.

---

## Quick Start

### 1. Dedicated View
- Click the **Timeline icon** (`calendar-range`) in the Obsidian left ribbon.
- Or run the command: `Timeline: Open Timeline View` from the command palette (`Ctrl+P` / `Cmd+P`).

### 2. Note Frontmatter Format
The plugin works out of the box with your existing notes! By default, it scans notes in the `Calendar/` folder:

**Single-day Event:**
```yaml
---
date: 2026-11-14
tags:
  - event
---
```

**Multi-day Event:**
```yaml
---
date: 2026-11-17
date-end: 2026-11-19
tags:
  - event
---
```

*(You can also use custom properties like `startDate`, `endDate`, or put dates like `YYYY-MM-DD` in the note title).*

### 3. Markdown Codeblock
You can embed a timeline directly into any note:

````markdown
```timeline
folder: Calendar
zoom: 40
labels: auto
```
````

---

## Settings Reference

Go to **Settings** $\to$ **Timeline**:
- **Target Folder**: Set to `Calendar` by default, or clear to search the entire vault.
- **Include Subfolders**: Toggle recursive folder scanning.
- **Start Date Properties**: Prioritized list of frontmatter keys (default: `date, startDate, start`).
- **End Date Properties**: Prioritized list of frontmatter keys for multi-day spans (default: `date-end, endDate, end`).
- **Default Zoom Level**: Pixels per day on the horizontal axis ruler.
- **Label Display Mode**: Auto, Vertical, Hidden, or Horizontal.
- **Show Today Marker**: Highlight current date with a glowing line and badge.
- **Show Time Grid**: Vertical grid lines for weeks and days.
- **Categories & Colors**: Add, edit, recolor, or disable categories mapped to note tags.

---

## Systems Principles Applied

Built following the [Systems Principles](https://nanselm.com/systems-principles/) by Nat Anselm:
- **Simplicity is Key (KISS)**: Zero external heavyweight framework dependencies, 22KB compiled bundle, instant load time.
- **Quality**: Robust event collision detection, smooth panning physics, and dark/light mode integration.
- **Aesthetic Design**: Sci-fi inspired glowing nodes, monospace date rulers, and crisp borders.
- **Reliability**: UTC-stable date arithmetic avoiding DST/timezone drift, and defensive handling of malformed frontmatter.
