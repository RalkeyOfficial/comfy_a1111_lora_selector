# Comfy A1111 Lora Selector

An A1111-style lora browser node for ComfyUI. Scroll and filter your loras in a
card grid, click to select, tweak strengths, and read/edit each lora's details —
then feed the result into any node that takes a `LORA_STACK`.

## Features

- **Card grid** of every lora with preview thumbnails, embedded in the node.
- **Subdirectory filter** derived from your loras folder tree (`/head`,
  `/head/face`, …) plus a text filter.
- **Enabled list** at the bottom of the node: preview, name, strength and a
  remove button per active lora, in a resizable panel that snaps open/closed.
- **Detail modal** per lora with previews, description, trigger words, tags and
  an editable **recommended weight** slider and **personal note** — edits are
  saved back to disk.
- Selection **persists** across browser refresh and server restart through
  ComfyUI's normal workflow autosave.
- Reads both metadata layouts:
  - **A1111**: `NAME.json` + `NAME.png` / `NAME_0.png`, `NAME_1.png`, …
  - **ComfyUI downloader**: `NAME.cminfo.json` + `NAME.preview.jpeg`

  Display fields (description, base model, trigger words, tags) come from the
  `.cminfo.json` when present, otherwise the `.json`. The editable **recommended
  weight** and **note** always live in the A1111 `NAME.json`, which this
  extension owns for edits — so editing them for a downloader lora creates a
  `NAME.json` alongside the existing `NAME.cminfo.json`.

## The node

**A1111 Lora Selector** (category *loaders*)

| | |
|---|---|
| Output | `LORA_STACK` — `[(name, strength, strength), …]` |
| Optional input | `optional_lora_stack` (`LORA_STACK`) — prepended to the result |

The output is compatible with existing lora-stack consumers (e.g. Easy-Use's
`EasyLoraStack`). Each selected lora contributes a single strength applied to
both model and clip.

## Installation

```bash
cd ComfyUI/custom_nodes
git clone https://github.com/RalkeyOfficial/comfy_a1111_lora_selector.git
cd comfy_a1111_lora_selector/ui
npm install
npm run build
# restart ComfyUI
```

> The extension needs the compiled frontend in `dist/`. If you install manually
> you **must** run `npm run build` in `ui/` before it will work.

## Development

```bash
cd ui
npm install
npm run watch   # rebuilds dist/ on change
```

Reload the browser after a rebuild to pick up the new bundle. The frontend is
bundled into a single `dist/main.js` (CSS inlined) so ComfyUI loads it as one
extension module.

## How it works

- `lora_selector_node.py` — the node. Reads a hidden JSON `selection` widget
  that the frontend drives and turns it into a `LORA_STACK`.
- `__init__.py` — registers the node and its API routes:
  - `GET /comfy_a1111_lora_selector/loras` — the lora list
  - `GET /comfy_a1111_lora_selector/info?name=` — normalized metadata
  - `GET /comfy_a1111_lora_selector/preview?name=&i=` — a preview image
  - `POST /comfy_a1111_lora_selector/info` — save recommended weight / note to the
    A1111 `NAME.json` sidecar
- `ui/src/main.tsx` — mounts the React UI as a DOM widget on the node.
- `ui/src/LoraSelector.tsx` — the grid, filters, enabled list and detail modal.

## Project layout

```
comfy_a1111_lora_selector/
├── __init__.py             # node + API routes, serves dist/
├── lora_selector_node.py   # A1111LoraSelector node
├── pyproject.toml
├── dist/                   # built frontend (generated)
└── ui/                     # React/Vite/TypeScript source
    ├── src/
    │   ├── main.tsx        # extension entry, DOM widget
    │   ├── LoraSelector.tsx
    │   ├── styles.css
    │   └── comfy.d.ts
    ├── package.json
    └── vite.config.ts
```

## License

MIT
