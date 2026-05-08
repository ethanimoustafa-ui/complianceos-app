'use client'

import { useEffect, useRef, useCallback } from 'react'
import { cn } from '@/lib/utils'
import type { PlaceholderDef, PlaceholderValue } from '@/types'
import { PlaceholderChip } from './PlaceholderChip'
import { createRoot, type Root } from 'react-dom/client'

const TOKEN_RE = /\{\{\s*([a-zA-Z0-9_\-.]+)\s*\}\}/g

interface InlineChipEditorProps {
  value: string
  onChange: (next: string) => void
  placeholderDefs: PlaceholderDef[]
  placeholderValues: Record<string, PlaceholderValue | undefined>
  onPlaceholderChange: (key: string, v: PlaceholderValue | undefined) => void
  dir?: 'ltr' | 'rtl'
  fontFamily?: string
  textSize?: string
  placeholder?: string
  multiline?: boolean
  className?: string
}

/**
 * ContentEditable surface that renders text with inline `{{token}}` chips.
 *
 * Storage model: `value` is plain string with literal `{{token}}` markers — same
 * shape used by render-time `renderTemplate(...)`. We rebuild a normalised DOM
 * (text nodes + non-editable chip spans) on every external change.
 *
 * Cursor handling: we save/restore caret offset relative to the text-content
 * skeleton (chip nodes count as a single character offset, like atomic glyphs),
 * which keeps typing stable across re-renders. Chips themselves are
 * `contenteditable=false` so the caret skips over them on arrow-key navigation.
 *
 * RTL: caller passes `dir="rtl"` for Arabic. Chips render with `dir="ltr"`
 * internally so token IDs always read LTR while body text follows surrounding dir.
 *
 * Paste: stripped to plain text via `event.preventDefault()` + insertText.
 */
export function InlineChipEditor({
  value,
  onChange,
  placeholderDefs,
  placeholderValues,
  onPlaceholderChange,
  dir,
  fontFamily,
  textSize = 'text-sm',
  placeholder,
  multiline = true,
  className,
}: InlineChipEditorProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const isComposingRef = useRef(false)
  // Snapshot of the value most recently authored *by this editor* (i.e., emitted
  // to the parent through onChange). When the parent re-renders us with the
  // exact same string, we skip the rebuild — that prevents caret-jump on every
  // keystroke. When the parent passes a different string (template applied,
  // language changed, etc.) we rebuild.
  const lastEmittedRef = useRef<string>('')
  // Track chip-roots so we can unmount them cleanly when rebuilding.
  const chipRootsRef = useRef<Root[]>([])

  // Build a defByKey lookup so we can render synthetic defs for tokens that
  // haven't been declared yet (the user just typed them).
  const defByKey = (() => {
    const m = new Map<string, PlaceholderDef>()
    for (const d of placeholderDefs) m.set(d.key, d)
    return m
  })()

  // Read current text out of the DOM, converting chip nodes back to {{token}}.
  const serialize = useCallback((root: HTMLElement): string => {
    let out = ''
    const walk = (node: Node) => {
      if (node.nodeType === Node.TEXT_NODE) {
        out += node.textContent ?? ''
      } else if (node.nodeType === Node.ELEMENT_NODE) {
        const el = node as HTMLElement
        const token = el.getAttribute('data-token')
        if (token) {
          out += `{{${token}}}`
          return
        }
        if (el.tagName === 'BR') {
          out += '\n'
          return
        }
        if (el.tagName === 'DIV' || el.tagName === 'P') {
          // contenteditable browsers wrap each line in a div/p; preserve newlines.
          if (out.length > 0 && !out.endsWith('\n')) out += '\n'
          for (const child of Array.from(el.childNodes)) walk(child)
          return
        }
        for (const child of Array.from(el.childNodes)) walk(child)
      }
    }
    for (const child of Array.from(root.childNodes)) walk(child)
    return out
  }, [])

  // Save caret as a single integer offset in the serialised string.
  const getCaretOffset = useCallback((root: HTMLElement): number | null => {
    const sel = window.getSelection()
    if (!sel || sel.rangeCount === 0) return null
    const range = sel.getRangeAt(0)
    if (!root.contains(range.startContainer)) return null

    let offset = 0
    let found = false
    const walk = (node: Node): boolean => {
      if (found) return true
      if (node === range.startContainer) {
        if (node.nodeType === Node.TEXT_NODE) {
          offset += range.startOffset
        } else {
          // Element ancestor — count children up to startOffset.
          for (let i = 0; i < range.startOffset; i++) {
            const child = node.childNodes[i]
            if (child) walkAll(child)
          }
        }
        found = true
        return true
      }
      if (node.nodeType === Node.TEXT_NODE) {
        offset += (node.textContent ?? '').length
        return false
      }
      const el = node as HTMLElement
      const token = el.getAttribute?.('data-token')
      if (token) {
        offset += `{{${token}}}`.length
        return false
      }
      if (el.tagName === 'BR') {
        offset += 1
        return false
      }
      if (el.tagName === 'DIV' || el.tagName === 'P') {
        if (offset > 0) offset += 0 // leading newline handled in serialize
      }
      for (const child of Array.from(node.childNodes)) {
        if (walk(child)) return true
      }
      return false
    }
    const walkAll = (node: Node) => {
      if (node.nodeType === Node.TEXT_NODE) {
        offset += (node.textContent ?? '').length
        return
      }
      const el = node as HTMLElement
      const token = el.getAttribute?.('data-token')
      if (token) {
        offset += `{{${token}}}`.length
        return
      }
      if (el.tagName === 'BR') {
        offset += 1
        return
      }
      for (const child of Array.from(node.childNodes)) walkAll(child)
    }
    walk(root)
    return offset
  }, [])

  // Restore caret given a saved offset against a freshly-rebuilt root.
  const setCaretOffset = useCallback((root: HTMLElement, target: number) => {
    let remaining = target
    let placed = false
    const sel = window.getSelection()
    if (!sel) return
    const range = document.createRange()

    const walk = (node: Node): boolean => {
      if (placed) return true
      if (node.nodeType === Node.TEXT_NODE) {
        const len = (node.textContent ?? '').length
        if (remaining <= len) {
          range.setStart(node, remaining)
          range.setEnd(node, remaining)
          placed = true
          return true
        }
        remaining -= len
        return false
      }
      const el = node as HTMLElement
      const token = el.getAttribute?.('data-token')
      if (token) {
        const w = `{{${token}}}`.length
        if (remaining <= 0) {
          // place caret right before the chip
          const parent = el.parentNode
          if (parent) {
            const idx = Array.from(parent.childNodes).indexOf(el)
            range.setStart(parent, idx)
            range.setEnd(parent, idx)
            placed = true
            return true
          }
        }
        remaining -= w
        return false
      }
      if (el.tagName === 'BR') {
        if (remaining <= 0) {
          const parent = el.parentNode
          if (parent) {
            const idx = Array.from(parent.childNodes).indexOf(el)
            range.setStart(parent, idx)
            range.setEnd(parent, idx)
            placed = true
            return true
          }
        }
        remaining -= 1
        return false
      }
      for (const child of Array.from(node.childNodes)) {
        if (walk(child)) return true
      }
      return false
    }
    walk(root)
    if (!placed) {
      // fall through to end of root
      range.selectNodeContents(root)
      range.collapse(false)
    }
    sel.removeAllRanges()
    sel.addRange(range)
  }, [])

  // Build (or rebuild) the editor's DOM children from the current `value`.
  const rebuild = useCallback(() => {
    const root = containerRef.current
    if (!root) return
    // Defer unmount of prior chip roots to a microtask. React 18+ blocks
    // synchronous root unmounts during the parent's commit phase, which is
    // exactly when this `rebuild()` runs (called from a useEffect).
    const oldRoots = chipRootsRef.current
    chipRootsRef.current = []
    queueMicrotask(() => {
      for (const r of oldRoots) {
        try { r.unmount() } catch { /* ignore */ }
      }
    })
    root.innerHTML = ''

    const text = value
    let lastIdx = 0
    let m: RegExpExecArray | null
    TOKEN_RE.lastIndex = 0
    while ((m = TOKEN_RE.exec(text)) !== null) {
      // Append plain-text segment before this token.
      if (m.index > lastIdx) {
        appendTextWithBreaks(root, text.slice(lastIdx, m.index))
      }
      // Append a chip span hosting a React subtree.
      const tokenKey = m[1]
      const chipHost = document.createElement('span')
      chipHost.setAttribute('contenteditable', 'false')
      chipHost.setAttribute('data-token', tokenKey)
      chipHost.style.display = 'inline-block'
      chipHost.style.verticalAlign = 'baseline'
      chipHost.style.userSelect = 'none'
      // Pass a zero-width char so cursor placement around the chip is consistent.
      root.appendChild(chipHost)

      const def = defByKey.get(tokenKey) ?? { key: tokenKey, label: tokenKey, type: 'date' as const }
      const value_ = placeholderValues[tokenKey]
      const chipRoot = createRoot(chipHost)
      chipRoot.render(
        <PlaceholderChip
          def={def}
          value={value_}
          onChange={(v) => onPlaceholderChange(tokenKey, v)}
          onClear={() => onPlaceholderChange(tokenKey, undefined)}
          isRTL={dir === 'rtl'}
          size="sm"
        />,
      )
      chipRootsRef.current.push(chipRoot)

      lastIdx = m.index + m[0].length
    }
    if (lastIdx < text.length) {
      appendTextWithBreaks(root, text.slice(lastIdx))
    }
  }, [value, dir, placeholderValues, defByKey, onPlaceholderChange])

  // Whenever `value` changes externally (template applied, language switch),
  // rebuild and place caret at end. Also rebuild when the chip definitions or
  // values change so visual chip state reflects truth.
  useEffect(() => {
    // Skip if the DOM already represents this value (we just emitted it).
    if (value === lastEmittedRef.current && containerRef.current) {
      // Still rebuild chips so that values prop updates re-render chips.
      // Strategy: rebuild but try to preserve caret.
      const offset = getCaretOffset(containerRef.current)
      rebuild()
      if (offset !== null) setCaretOffset(containerRef.current, offset)
      return
    }
    rebuild()
    lastEmittedRef.current = value
    // Place cursor at end after external rebuilds.
    if (containerRef.current) {
      setCaretOffset(containerRef.current, value.length)
    }
    // Cleanup chip roots when component unmounts.
    return () => {
      // No-op here; cleanup only on unmount handled by next effect.
    }
  }, [value, placeholderValues, placeholderDefs, rebuild, getCaretOffset, setCaretOffset])

  // Cleanup chip roots on unmount.
  useEffect(() => {
    return () => {
      // Defer unmounts so they don't fire synchronously inside React's
      // own commit phase (which warns under StrictMode).
      const roots = chipRootsRef.current
      chipRootsRef.current = []
      queueMicrotask(() => {
        for (const r of roots) {
          try { r.unmount() } catch { /* ignore */ }
        }
      })
    }
  }, [])

  const handleInput = useCallback(() => {
    if (isComposingRef.current) return
    const root = containerRef.current
    if (!root) return
    const next = serialize(root)
    if (next === lastEmittedRef.current) return
    lastEmittedRef.current = next
    onChange(next)
  }, [onChange, serialize])

  const handlePaste = useCallback((e: React.ClipboardEvent<HTMLDivElement>) => {
    e.preventDefault()
    const text = e.clipboardData.getData('text/plain')
    if (!text) return
    insertPlainText(text, multiline)
    handleInput()
  }, [handleInput, multiline])

  const handleKeyDown = useCallback((e: React.KeyboardEvent<HTMLDivElement>) => {
    if (!multiline && e.key === 'Enter') {
      e.preventDefault()
      return
    }
    // Enter inserts a real \n — easier to round-trip than browser-default <div>s.
    if (multiline && e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      insertPlainText('\n', true)
      handleInput()
    }
  }, [multiline, handleInput])

  const showPlaceholder = value.length === 0

  return (
    <div className="relative">
      <div
        ref={containerRef}
        contentEditable
        suppressContentEditableWarning
        onInput={handleInput}
        onPaste={handlePaste}
        onKeyDown={handleKeyDown}
        onCompositionStart={() => { isComposingRef.current = true }}
        onCompositionEnd={() => { isComposingRef.current = false; handleInput() }}
        dir={dir}
        style={{ fontFamily, whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}
        className={cn(
          'w-full text-slate-700 focus:outline-none',
          textSize,
          className,
        )}
        role="textbox"
        aria-multiline={multiline}
      />
      {showPlaceholder && placeholder && (
        <span
          className={cn(
            'pointer-events-none absolute inset-0 px-0 text-slate-400 select-none',
            textSize,
          )}
          dir={dir}
          style={{ fontFamily }}
        >
          {placeholder}
        </span>
      )}
    </div>
  )
}

// Insert plain text at the current selection inside whichever contentEditable
// is currently focused. Browser-side: prefer Range API but fall back to
// execCommand('insertText') which is broadly compatible.
function insertPlainText(text: string, multiline: boolean) {
  const sel = window.getSelection()
  if (!sel || sel.rangeCount === 0) return
  const range = sel.getRangeAt(0)
  range.deleteContents()
  // Split on \n into text+<br>+text+<br>+... Fragments preserve a single insertion.
  if (!multiline || !text.includes('\n')) {
    range.insertNode(document.createTextNode(text))
  } else {
    const frag = document.createDocumentFragment()
    const lines = text.split('\n')
    lines.forEach((line, i) => {
      if (i > 0) frag.appendChild(document.createElement('br'))
      if (line) frag.appendChild(document.createTextNode(line))
    })
    range.insertNode(frag)
  }
  // Collapse to end of insertion.
  range.collapse(false)
  sel.removeAllRanges()
  sel.addRange(range)
}

// Append a string to a root, splitting on newlines into text + <br> nodes
// so the contentEditable preserves them visually.
function appendTextWithBreaks(root: HTMLElement, text: string) {
  if (!text) return
  const parts = text.split('\n')
  parts.forEach((part, i) => {
    if (i > 0) root.appendChild(document.createElement('br'))
    if (part) root.appendChild(document.createTextNode(part))
  })
}
