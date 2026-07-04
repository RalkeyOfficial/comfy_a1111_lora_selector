import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent
} from 'react'

// Provided by ComfyUI at runtime; externalized by vite.
// @ts-expect-error no type declarations for the runtime path
import { api as rawApi } from '/scripts/api.js'

const api = rawApi as {
  fetchApi(route: string, options?: RequestInit): Promise<Response>
  apiURL(route: string): string
}

export interface SelectionItem {
  name: string
  strength: number
  on: boolean
}
export type Selection = SelectionItem[]

export interface SelectorHandle {
  load: (selection: Selection) => void
}

interface LoraInfo {
  name: string
  format: 'a1111' | 'comfy-downloader' | null
  description: string
  descriptionHtml: boolean
  baseModel: string | null
  activationText: string
  trainedWords: string[]
  negativeText: string
  preferredWeight: number | null
  notes: string
  tags: string[]
  modelName: string | null
  creator: string | null
  previewCount: number
}

interface LoraSelectorProps {
  getSelection: () => Selection
  onChange: (selection: Selection) => void
}

function dirOf(name: string): string {
  const i = name.lastIndexOf('/')
  return i === -1 ? '' : name.slice(0, i)
}

function baseName(name: string): string {
  const file = name.slice(name.lastIndexOf('/') + 1)
  const dot = file.lastIndexOf('.')
  return dot === -1 ? file : file.slice(0, dot)
}

// Every ancestor directory path, e.g. "a/b/c.safetensors" -> ["a", "a/b"].
function ancestorDirs(names: string[]): string[] {
  const dirs = new Set<string>()
  for (const name of names) {
    const parts = dirOf(name).split('/').filter(Boolean)
    let acc = ''
    for (const part of parts) {
      acc = acc ? acc + '/' + part : part
      dirs.add(acc)
    }
  }
  return [...dirs].sort()
}

function previewUrl(name: string, index: number): string {
  return api.apiURL(
    `/a1111_lora_selector/preview?name=${encodeURIComponent(name)}&i=${index}`
  )
}

function htmlToText(html: string): string {
  return html
    .replace(/<\s*br\s*\/?>/gi, '\n')
    .replace(/<li[^>]*>/gi, '• ')
    .replace(/<\/(p|div|li|h[1-6]|ul|ol)>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

function Thumb({ name, small }: { name: string; small?: boolean }) {
  const [failed, setFailed] = useState(false)
  const cls = small ? 'als-thumb als-thumb-sm' : 'als-thumb'
  if (failed) {
    return <div className={cls}>{baseName(name).slice(0, 2).toUpperCase()}</div>
  }
  return (
    <img
      className={cls + ' als-thumb-img'}
      src={previewUrl(name, 0)}
      loading="lazy"
      alt=""
      onError={() => setFailed(true)}
    />
  )
}

function DetailOverlay({ name, onClose }: { name: string; onClose: () => void }) {
  const [info, setInfo] = useState<LoraInfo | null>(null)
  const [weight, setWeight] = useState(1)
  const [note, setNote] = useState('')
  const saveTimer = useRef<ReturnType<typeof setTimeout>>()

  useEffect(() => {
    let cancelled = false
    api
      .fetchApi(`/a1111_lora_selector/info?name=${encodeURIComponent(name)}`)
      .then((res) => (res.ok ? res.json() : null))
      .then((data: LoraInfo | null) => {
        if (cancelled || !data) return
        setInfo(data)
        setWeight(data.preferredWeight == null ? 1 : data.preferredWeight)
        setNote(data.notes)
      })
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [name])

  const save = (preferredWeight: number, notes: string) => {
    clearTimeout(saveTimer.current)
    saveTimer.current = setTimeout(() => {
      void api.fetchApi('/a1111_lora_selector/info', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, preferredWeight, notes })
      })
    }, 400)
  }

  const description =
    info && info.description
      ? info.descriptionHtml
        ? htmlToText(info.description)
        : info.description
      : ''

  return (
    <div className="als-detail" onClick={onClose}>
      <div className="als-detail-body" onClick={(e) => e.stopPropagation()}>
        <button className="als-close" onClick={onClose}>
          ×
        </button>

        <header className="als-dsec">
          <h3>{info?.modelName || baseName(name)}</h3>
          <div className="als-path">{name}</div>
          <div className="als-dmeta">
            {info?.baseModel && <span className="als-badge">{info.baseModel}</span>}
            {info?.creator && <span className="als-muted">by {info.creator}</span>}
          </div>
        </header>

        {info && info.previewCount > 0 && (
          <section className="als-dsec">
            <div className="als-gallery">
              {Array.from({ length: info.previewCount }, (_, i) => (
                <img key={i} src={previewUrl(name, i)} loading="lazy" alt="" />
              ))}
            </div>
          </section>
        )}

        <section className="als-dsec">
          <h4>Recommended weight</h4>
          <div className="als-weight">
            <input
              type="range"
              min={0}
              max={2}
              step={0.05}
              value={weight}
              onChange={(e) => {
                const v = Number(e.target.value)
                setWeight(v)
                save(v, note)
              }}
            />
            <span className="als-weight-val">{weight.toFixed(2)}</span>
          </div>
        </section>

        {info?.activationText && (
          <section className="als-dsec">
            <h4>
              Trigger words
              <button
                className="als-copy"
                title="Copy"
                onClick={() => void navigator.clipboard?.writeText(info.activationText)}
              >
                copy
              </button>
            </h4>
            <div className="als-mono">{info.activationText}</div>
          </section>
        )}

        {description && (
          <section className="als-dsec">
            <h4>Description</h4>
            <div className="als-desc">{description}</div>
          </section>
        )}

        {info?.negativeText && (
          <section className="als-dsec">
            <h4>Negative</h4>
            <div className="als-mono">{info.negativeText}</div>
          </section>
        )}

        <section className="als-dsec">
          <h4>Personal note</h4>
          <textarea
            className="als-note"
            placeholder="Your notes about this lora…"
            value={note}
            onChange={(e) => {
              setNote(e.target.value)
              save(weight, e.target.value)
            }}
          />
        </section>

        {info && info.tags.length > 0 && (
          <section className="als-dsec">
            <h4>Tags</h4>
            <div className="als-tags">
              {info.tags.map((tag) => (
                <span key={tag} className="als-tag">
                  {tag}
                </span>
              ))}
            </div>
          </section>
        )}
      </div>
    </div>
  )
}

const LoraSelector = forwardRef<SelectorHandle, LoraSelectorProps>(
  ({ getSelection, onChange }, ref) => {
    const [loras, setLoras] = useState<string[]>([])
    const [selection, setSelection] = useState<Selection>(getSelection)
    const [activeDir, setActiveDir] = useState('')
    const [filter, setFilter] = useState('')
    const [detail, setDetail] = useState<string | null>(null)
    const [listHeight, setListHeight] = useState(150)
    const [gridHidden, setGridHidden] = useState(false)
    const drag = useRef<{ startY: number; startH: number } | null>(null)
    const bodyRef = useRef<HTMLDivElement>(null)

    useImperativeHandle(ref, () => ({ load: setSelection }), [])

    // The widget value from a loaded workflow is applied (via node.configure)
    // after this component first renders, so re-read it once we've mounted.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    useEffect(() => setSelection(getSelection()), [])

    useEffect(() => {
      let cancelled = false
      api
        .fetchApi('/a1111_lora_selector/loras', { cache: 'no-store' })
        .then((res) => res.json())
        .then((data: string[]) => {
          if (!cancelled && Array.isArray(data)) setLoras(data)
        })
        .catch(() => {})
      return () => {
        cancelled = true
      }
    }, [])

    const dirs = useMemo(() => ancestorDirs(loras), [loras])
    const selectedByName = useMemo(() => {
      const map = new Map<string, SelectionItem>()
      for (const item of selection) map.set(item.name, item)
      return map
    }, [selection])

    const visible = useMemo(() => {
      const needle = filter.trim().toLowerCase()
      return loras.filter((name) => {
        const dir = dirOf(name)
        const inDir = !activeDir || dir === activeDir || dir.startsWith(activeDir + '/')
        const matches = !needle || name.toLowerCase().includes(needle)
        return inDir && matches
      })
    }, [loras, activeDir, filter])

    const commit = (next: Selection) => {
      setSelection(next)
      onChange(next)
    }

    const toggle = (name: string) => {
      if (selectedByName.has(name)) {
        commit(selection.filter((item) => item.name !== name))
      } else {
        commit([...selection, { name, strength: 1, on: true }])
      }
    }

    const patch = (name: string, changes: Partial<SelectionItem>) =>
      commit(selection.map((item) => (item.name === name ? { ...item, ...changes } : item)))

    const remove = (name: string) => commit(selection.filter((item) => item.name !== name))

    const enabled = selection.filter((item) => item.on)

    const onHandleDown = (e: ReactPointerEvent) => {
      e.preventDefault()
      e.stopPropagation()
      e.currentTarget.setPointerCapture(e.pointerId)
      drag.current = { startY: e.clientY, startH: listHeight }
    }
    const onHandleMove = (e: ReactPointerEvent) => {
      if (!drag.current) return
      const body = bodyRef.current
      // Keep the list within the master (body) area so it can't grow up past
      // the grid into the filters. The list occupies at most everything but
      // the handle; the grid takes whatever is left.
      const maxList = body ? Math.max(0, body.clientHeight - 14) : 600
      let next = Math.min(Math.max(drag.current.startH + (drag.current.startY - e.clientY), 0), maxList)
      if (next <= 60) next = 0
      else if (next >= maxList - 60) next = maxList
      setListHeight(next)
      // Fully open: drop the grid entirely so no sliver/scrollbar peeks through.
      setGridHidden(next === maxList)
    }
    const onHandleUp = (e: ReactPointerEvent) => {
      drag.current = null
      e.currentTarget.releasePointerCapture(e.pointerId)
    }

    return (
      <div className="als-root">
        <div className="als-toolbar">
          <input
            className="als-search"
            placeholder="Filter loras…"
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
          />
          <span className="als-count">{selection.length} selected</span>
        </div>

        <div className="als-dirs">
          <button
            className={activeDir === '' ? 'als-dir active' : 'als-dir'}
            onClick={() => setActiveDir('')}
          >
            All
          </button>
          {dirs.map((dir) => (
            <button
              key={dir}
              className={activeDir === dir ? 'als-dir active' : 'als-dir'}
              onClick={() => setActiveDir(dir)}
            >
              /{dir}
            </button>
          ))}
        </div>

        <div className="als-body" ref={bodyRef}>
        {!gridHidden && (
        <div className="als-grid">
          {visible.length === 0 && <div className="als-empty">No loras found</div>}
          {visible.map((name) => {
            const item = selectedByName.get(name)
            return (
              <div
                key={name}
                className={item ? 'als-card selected' : 'als-card'}
                onClick={() => toggle(name)}
              >
                <button
                  className="als-info"
                  title="Details"
                  onClick={(e) => {
                    e.stopPropagation()
                    setDetail(name)
                  }}
                >
                  i
                </button>
                <Thumb name={name} />
                <div className="als-name" title={name}>
                  {baseName(name)}
                </div>
                {item && (
                  <div className="als-controls" onClick={(e) => e.stopPropagation()}>
                    <input
                      type="checkbox"
                      checked={item.on}
                      title="Enabled"
                      onChange={(e) => patch(name, { on: e.target.checked })}
                    />
                    <input
                      className="als-strength"
                      type="number"
                      step={0.05}
                      min={-10}
                      max={10}
                      value={item.strength}
                      onChange={(e) => patch(name, { strength: Number(e.target.value) })}
                    />
                  </div>
                )}
              </div>
            )
          })}
        </div>
        )}

        <div className="als-list-section">
          <div
            className="als-handle"
            title="Drag to resize"
            onPointerDown={onHandleDown}
            onPointerMove={onHandleMove}
            onPointerUp={onHandleUp}
          />
          <div className="als-list" style={{ height: listHeight }}>
            {enabled.length === 0 && <div className="als-empty">No enabled loras</div>}
            {enabled.map((item) => (
              <div key={item.name} className="als-list-row">
                <Thumb name={item.name} small />
                <span className="als-list-name" title={item.name}>
                  {baseName(item.name)}
                </span>
                <input
                  className="als-strength"
                  type="number"
                  step={0.05}
                  min={-10}
                  max={10}
                  value={item.strength}
                  onChange={(e) => patch(item.name, { strength: Number(e.target.value) })}
                />
                <button
                  className="als-remove"
                  title="Remove"
                  onClick={() => remove(item.name)}
                >
                  ×
                </button>
              </div>
            ))}
          </div>
        </div>
        </div>

        {detail && <DetailOverlay name={detail} onClose={() => setDetail(null)} />}
      </div>
    )
  }
)

LoraSelector.displayName = 'LoraSelector'

export default LoraSelector
