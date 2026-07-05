"use client"

import { useRef, useCallback } from "react"

interface VerticalSliderProps {
  value: number
  min: number
  max: number
  step: number
  onChange: (v: number) => void
  height?: number
}

export function VerticalSlider({
  value,
  min,
  max,
  step,
  onChange,
  height = 224,
}: VerticalSliderProps) {
  const trackRef = useRef<HTMLDivElement>(null)
  const dragging = useRef(false)

  const clamp = useCallback(
    (v: number) => {
      const stepped = Math.round(v / step) * step
      return Math.min(max, Math.max(min, stepped))
    },
    [min, max, step],
  )

  const pct = ((value - min) / (max - min)) * 100

  const valueFromClientY = useCallback(
    (clientY: number) => {
      const el = trackRef.current
      if (!el) return value
      const rect = el.getBoundingClientRect()
      const fraction = 1 - (clientY - rect.top) / rect.height
      return clamp(min + fraction * (max - min))
    },
    [clamp, min, max, value],
  )

  const handlePointerDown = useCallback(
    (e: React.PointerEvent) => {
      e.preventDefault()
      dragging.current = true
      ;(e.target as HTMLElement).setPointerCapture(e.pointerId)
      onChange(valueFromClientY(e.clientY))
    },
    [onChange, valueFromClientY],
  )

  const handlePointerMove = useCallback(
    (e: React.PointerEvent) => {
      if (!dragging.current) return
      onChange(valueFromClientY(e.clientY))
    },
    [onChange, valueFromClientY],
  )

  const handlePointerUp = useCallback(() => {
    dragging.current = false
  }, [])

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      let delta = 0
      if (e.key === "ArrowUp" || e.key === "ArrowRight") delta = step
      else if (e.key === "ArrowDown" || e.key === "ArrowLeft") delta = -step
      else if (e.key === "PageUp") delta = step * 10
      else if (e.key === "PageDown") delta = -step * 10
      else if (e.key === "Home") { onChange(min); return }
      else if (e.key === "End") { onChange(max); return }
      else return
      e.preventDefault()
      onChange(clamp(value + delta))
    },
    [clamp, max, min, onChange, step, value],
  )

  return (
    <div
      ref={trackRef}
      role="slider"
      aria-valuemin={min}
      aria-valuemax={max}
      aria-valuenow={value}
      aria-orientation="vertical"
      tabIndex={0}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onKeyDown={handleKeyDown}
      className="relative w-8 cursor-pointer rounded-full border border-border bg-muted touch-none select-none"
      style={{ height }}
    >
      <div
        className="absolute bottom-0 left-0 right-0 rounded-full bg-primary transition-[height] duration-75"
        style={{ height: `${pct}%` }}
      />
    </div>
  )
}
