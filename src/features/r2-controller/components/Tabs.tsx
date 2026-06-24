"use client"

import { useState, useEffect, useRef, useCallback } from "react"
import type { ChassisWebSocketState } from "@/features/r2-controller/hooks/useChassisWebSocket"

type TabDef = {
  id: string
  label: string
  content: React.ReactNode
}

interface TabsProps {
  tabs: TabDef[]
  defaultTab?: string
}

export function Tabs({ tabs, defaultTab }: TabsProps) {
  const [active, setActive] = useState(defaultTab || tabs[0]?.id || "")

  useEffect(() => {
    if (defaultTab && !tabs.find((t) => t.id === active)) {
      setActive(defaultTab)
    }
  }, [defaultTab, tabs, active])

  const current = tabs.find((t) => t.id === active)

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex shrink-0 border-b border-border">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            type="button"
            onClick={() => setActive(tab.id)}
            className={`px-4 py-2 text-sm font-medium transition-colors border-b-2 -mb-px ${
              active === tab.id
                ? "border-primary text-primary"
                : "border-transparent text-muted-foreground hover:text-foreground"
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className="p-3">{current?.content}</div>
      </div>
    </div>
  )
}
