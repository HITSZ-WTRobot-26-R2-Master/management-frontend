import {
  Bell,
  Boxes,
  DatabaseZap,
  Gauge,
  RefreshCw,
  ServerCog,
  Settings,
} from "lucide-react"
import type { ReactNode } from "react"
import { cn } from "@/lib/utils"

export type ManagementTab =
  | "overview"
  | "services"
  | "details"
  | "commands"
  | "events"
  | "settings"

const navItems: Array<{
  id: ManagementTab
  label: string
  icon: typeof Gauge
}> = [
  { id: "overview", label: "总览", icon: Gauge },
  { id: "services", label: "服务", icon: Boxes },
  { id: "details", label: "详情", icon: ServerCog },
  { id: "commands", label: "命令", icon: DatabaseZap },
  { id: "events", label: "事件", icon: Bell },
  { id: "settings", label: "设置", icon: Settings },
]

interface ManagementShellProps {
  activeTab: ManagementTab
  children: ReactNode
  connectionStatus: ReactNode
  refreshing: boolean
  onRefresh: () => void
  onTabChange: (tab: ManagementTab) => void
}

export function ManagementShell({
  activeTab,
  children,
  connectionStatus,
  refreshing,
  onRefresh,
  onTabChange,
}: ManagementShellProps) {
  return (
    <div className="flex h-[100dvh] min-h-0 overflow-hidden">
      <div className="flex min-h-0 flex-1 flex-col">
        <header className="shrink-0 border-b border-border bg-card/95 backdrop-blur">
          <div className="mx-auto flex max-w-[1600px] flex-col gap-3 px-5 py-3 xl:flex-row xl:items-center xl:justify-between">
            <div className="min-w-0">
              <p className="text-sm font-semibold uppercase tracking-normal text-primary">
                R2 管理平台
              </p>
              <p className="mt-0.5 text-sm text-muted-foreground">
                面向已注册 ROS2 服务的运维控制台
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2 xl:justify-end">
              {connectionStatus}
              <button
                type="button"
                className="inline-flex h-9 items-center gap-2 rounded-md border border-border bg-card px-3 text-sm font-semibold text-card-foreground hover:bg-muted disabled:cursor-not-allowed disabled:opacity-70"
                disabled={refreshing}
                onClick={onRefresh}
              >
                <RefreshCw
                  aria-hidden="true"
                  className={cn("size-4", refreshing && "animate-spin")}
                />
                刷新
              </button>
            </div>
          </div>
          <div className="mx-auto max-w-[1600px] px-5 pb-3">
            <nav
              aria-label="管理导航"
              className="flex flex-wrap gap-2"
              role="tablist"
            >
              {navItems.map((item) => {
                const active = item.id === activeTab

                return (
                  <button
                    key={item.id}
                    type="button"
                    className={cn(
                      "inline-flex h-9 items-center gap-2 rounded-md border px-3 text-sm font-medium",
                      active
                        ? "border-primary bg-primary text-primary-foreground"
                        : "border-border bg-card text-muted-foreground hover:bg-muted hover:text-card-foreground",
                    )}
                    aria-selected={active}
                    role="tab"
                    onClick={() => onTabChange(item.id)}
                  >
                    <item.icon aria-hidden="true" className="size-4" />
                    {item.label}
                  </button>
                )
              })}
            </nav>
          </div>
        </header>

        <main className="mx-auto min-h-0 w-full max-w-[1600px] flex-1 overflow-hidden px-5 py-4">
          {children}
        </main>
      </div>
    </div>
  )
}
