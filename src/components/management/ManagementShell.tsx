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
import { NavLink } from "react-router-dom"
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
  to: string
}> = [
  { id: "overview", label: "总览", icon: Gauge, to: "/overview" },
  { id: "services", label: "服务", icon: Boxes, to: "/services" },
  { id: "details", label: "详情", icon: ServerCog, to: "/services" },
  { id: "commands", label: "命令", icon: DatabaseZap, to: "/commands" },
  { id: "events", label: "事件", icon: Bell, to: "/events" },
  { id: "settings", label: "设置", icon: Settings, to: "/settings" },
]

interface ManagementShellProps {
  children: ReactNode
  connectionStatus: ReactNode
  detailPath: string
  detailsDisabled: boolean
  refreshing: boolean
  onRefresh: () => void
}

export function ManagementShell({
  children,
  connectionStatus,
  detailPath,
  detailsDisabled,
  refreshing,
  onRefresh,
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
        </header>

        <div className="mx-auto flex min-h-0 w-full max-w-[1600px] flex-1 flex-col gap-3 px-5 py-4 xl:flex-row">
          <main className="min-h-0 min-w-0 flex-1 overflow-hidden">
            {children}
          </main>
          <aside className="order-first shrink-0 overflow-x-auto xl:order-none xl:w-40 xl:overflow-visible">
            <nav
              aria-label="管理导航"
              className="flex w-max gap-2 xl:w-full xl:flex-col"
              role="tablist"
            >
              {navItems.map((item) => {
                const to = item.id === "details" ? detailPath : item.to
                const disabled = item.id === "details" && detailsDisabled

                return (
                  <NavLink
                    aria-disabled={disabled}
                    aria-label={disabled ? "详情：等待服务快照" : undefined}
                    end={item.id !== "details"}
                    key={item.id}
                    to={to}
                    role="tab"
                    className={({ isActive }) => {
                      const active = isActive && !disabled

                      return cn(
                        "inline-flex h-9 items-center gap-2 rounded-md border px-3 text-sm font-medium xl:w-full xl:justify-start",
                        active
                          ? "border-primary bg-primary text-primary-foreground"
                          : "border-border bg-card text-muted-foreground hover:bg-muted hover:text-card-foreground",
                        disabled &&
                          "pointer-events-none cursor-not-allowed opacity-60",
                      )
                    }}
                  >
                    <item.icon aria-hidden="true" className="size-4" />
                    {item.label}
                  </NavLink>
                )
              })}
            </nav>
          </aside>
        </div>
      </div>
    </div>
  )
}
