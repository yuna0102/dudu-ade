import { useEffect, useRef, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Popover, PopoverAnchor, PopoverContent } from '@/components/ui/popover'
import { isImeOwnedKeyboardEvent } from '@/lib/ime-composition-keyboard-event'
import { cn } from '@/lib/utils'
import { AREA_PALETTE, isHexColor, parseHexColor, withRecentColor } from './board-area-colors'
import { DUDU_ADE_COPY } from './dudu-ade-copy'
import { readPersistedJson, writePersistedJsonSoon } from './dudu-ade-persistence'

const RECENT_COLORS_KEY = 'dudu-ade:recent-area-colors'

function readRecentColors(): string[] {
  const stored = readPersistedJson<unknown[]>(RECENT_COLORS_KEY, [], Array.isArray)
  return stored.filter(isHexColor)
}

function Swatch({
  color,
  label,
  current,
  onPick
}: {
  color: string
  label: string
  current: boolean
  onPick: (color: string) => void
}): React.JSX.Element {
  return (
    <button
      type="button"
      aria-label={label}
      aria-pressed={current}
      title={label}
      className={cn(
        'size-6 rounded-full border border-black/10',
        current && 'ring-2 ring-foreground ring-offset-1 ring-offset-background'
      )}
      style={{ background: color }}
      onClick={() => onPick(color)}
    />
  )
}

/** Palette, typed color and recent colors. Every pick applies at once. */
export function BoardColorPanel({
  color,
  onPick
}: {
  color: string
  onPick: (color: string) => void
}): React.JSX.Element {
  const [recent, setRecent] = useState(readRecentColors)
  const [typed, setTyped] = useState(color)
  const [invalid, setInvalid] = useState(false)
  const same = (other: string): boolean => other.toUpperCase() === color.toUpperCase()
  const pick = (next: string): void => {
    const list = withRecentColor(recent, next)
    setRecent(list)
    writePersistedJsonSoon(RECENT_COLORS_KEY, list)
    setTyped(next)
    setInvalid(false)
    onPick(next)
  }
  const applyTyped = (): void => {
    const parsed = parseHexColor(typed)
    setInvalid(parsed === null)
    if (parsed) {
      pick(parsed)
    }
  }
  return (
    <div className="flex w-56 flex-col gap-3 p-3">
      <div className="grid grid-cols-6 gap-2">
        {AREA_PALETTE.map((entry) => (
          <Swatch
            key={entry.color}
            color={entry.color}
            label={entry.name}
            current={same(entry.color)}
            onPick={pick}
          />
        ))}
      </div>
      {recent.length > 0 ? (
        <div className="flex flex-col gap-1.5">
          <div className="text-2xs text-muted-foreground">{DUDU_ADE_COPY.recentColors}</div>
          <div className="flex gap-2">
            {recent.map((entry) => (
              <Swatch key={entry} color={entry} label={entry} current={same(entry)} onPick={pick} />
            ))}
          </div>
        </div>
      ) : null}
      <div className="flex flex-col gap-1.5">
        <div className="text-2xs text-muted-foreground">{DUDU_ADE_COPY.customColor}</div>
        <div className="flex items-center gap-1.5">
          <input
            aria-label={DUDU_ADE_COPY.customColor}
            aria-invalid={invalid}
            className="h-7 min-w-0 flex-1 rounded border border-border bg-background px-2 font-mono text-xs outline-none aria-invalid:border-destructive"
            value={typed}
            spellCheck={false}
            onChange={(event) => {
              setTyped(event.target.value)
              setInvalid(false)
            }}
            onKeyDown={(event) => {
              if (event.key === 'Enter' && !isImeOwnedKeyboardEvent(event)) {
                applyTyped()
              }
            }}
          />
          <Button variant="secondary" size="xs" onClick={applyTyped}>
            {DUDU_ADE_COPY.applyColor}
          </Button>
        </div>
        {invalid ? (
          <div className="text-2xs text-destructive">{DUDU_ADE_COPY.invalidColor}</div>
        ) : null}
      </div>
    </div>
  )
}

/**
 * The area's color dot and its picker. The picker lives in a portal, outside the board's zoom, so it keeps its
 * size on screen. Cards stop pointer events from reaching the document, so an outside press is watched here.
 */
export function BoardColorPopover({
  color,
  open,
  onOpenChange,
  onPick
}: {
  color: string
  open: boolean
  onOpenChange: (open: boolean) => void
  onPick: (color: string) => void
}): React.JSX.Element {
  const dotRef = useRef<HTMLButtonElement>(null)
  const contentRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!open) {
      return
    }
    const onPress = (event: PointerEvent): void => {
      const target = event.target as Node
      if (!dotRef.current?.contains(target) && !contentRef.current?.contains(target)) {
        onOpenChange(false)
      }
    }
    window.addEventListener('pointerdown', onPress, true)
    return () => window.removeEventListener('pointerdown', onPress, true)
  }, [open, onOpenChange])
  return (
    <Popover open={open} onOpenChange={onOpenChange}>
      <PopoverAnchor asChild>
        <button
          ref={dotRef}
          type="button"
          className="size-3.5 shrink-0 rounded-full border border-black/10"
          style={{ background: color }}
          aria-label={DUDU_ADE_COPY.categoryColor}
          title={DUDU_ADE_COPY.categoryColor}
          onPointerDown={(event) => event.stopPropagation()}
          onClick={() => onOpenChange(!open)}
        />
      </PopoverAnchor>
      <PopoverContent
        ref={contentRef}
        align="start"
        collisionPadding={8}
        className="w-auto p-0"
        onPointerDown={(event) => event.stopPropagation()}
        onInteractOutside={(event) => event.preventDefault()}
      >
        <BoardColorPanel color={color} onPick={onPick} />
      </PopoverContent>
    </Popover>
  )
}
