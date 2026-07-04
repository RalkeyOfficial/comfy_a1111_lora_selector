import type { ComfyApp } from '@comfyorg/comfyui-frontend-types'
import { createRef } from 'react'
import { createRoot } from 'react-dom/client'

// Provided by ComfyUI at runtime; externalized by vite.
// @ts-expect-error no type declarations for the runtime path
import { app as rawApp } from '/scripts/app.js'

import LoraSelector, { type Selection, type SelectorHandle } from './LoraSelector'
import styles from './styles.css?inline'

const app = rawApp as ComfyApp

const NODE_TYPE = 'A1111LoraSelector'
const WIDGET_NAME = 'selection'

// Inject the bundled stylesheet once.
const styleTag = document.createElement('style')
styleTag.textContent = styles
document.head.appendChild(styleTag)

function parseSelection(value: unknown): Selection {
  if (typeof value !== 'string') return []
  try {
    const parsed = JSON.parse(value)
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

app.registerExtension({
  name: 'Ralkey.A1111LoraSelector',
  nodeCreated(node) {
    const anyNode = node as any
    if (anyNode.comfyClass !== NODE_TYPE) return

    const selectionWidget = anyNode.widgets?.find((w: any) => w.name === WIDGET_NAME)
    if (!selectionWidget) return

    // Hide the raw JSON widget; the React grid drives its value. Keep the
    // STRING type so it still serializes into the workflow for the backend.
    selectionWidget.hidden = true
    selectionWidget.computeSize = () => [0, -4]

    const container = document.createElement('div')
    container.className = 'a1111-lora-selector'
    anyNode.addDOMWidget(WIDGET_NAME + '_ui', 'div', container, { serialize: false })

    const handle = createRef<SelectorHandle>()
    let internalWrite = false

    const root = createRoot(container)
    root.render(
      <LoraSelector
        ref={handle}
        getSelection={() => parseSelection(selectionWidget.value)}
        onChange={(selection) => {
          internalWrite = true
          selectionWidget.value = JSON.stringify(selection)
          internalWrite = false
          app.graph?.setDirtyCanvas(true, true)
          // Our React edits don't emit a canvas event, so ComfyUI's change
          // tracker (which snapshots on mouseup for autosave/undo) never sees
          // them. Emit one after the value is written so a page refresh
          // restores the current selection.
          window.dispatchEvent(new Event('mouseup'))
        }}
      />
    )

    // Feed workflow-load values (applied after nodeCreated) into the component.
    let stored = selectionWidget.value
    Object.defineProperty(selectionWidget, 'value', {
      get: () => stored,
      set: (v: string) => {
        stored = v
        if (!internalWrite) handle.current?.load(parseSelection(v))
      },
      configurable: true
    })

    const onRemoved = anyNode.onRemoved
    anyNode.onRemoved = function (this: unknown, ...remArgs: unknown[]) {
      root.unmount()
      onRemoved?.apply(this, remArgs)
    }

    if ((anyNode.size?.[1] ?? 0) < 360) {
      anyNode.setSize([Math.max(anyNode.size?.[0] ?? 0, 400), 360])
    }
  }
})
