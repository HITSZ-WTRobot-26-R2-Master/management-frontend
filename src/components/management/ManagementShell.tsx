import {
  Bell,
  Boxes,
  Crosshair,
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
  { id: "events", label: "事件", icon: Bell, to: "/events" },
  { id: "settings", label: "设置", icon: Settings, to: "/settings" },
]

interface ManagementShellProps {
  children: ReactNode
  connectionStatus: ReactNode
  detailPath: string
  detailsDisabled: boolean
  quickCommands?: ReactNode
  refreshing: boolean
  onRefresh: () => void
}

export function ManagementShell({
  children,
  connectionStatus,
  detailPath,
  detailsDisabled,
  quickCommands,
  refreshing,
  onRefresh,
}: ManagementShellProps) {
  return (
    <div className="flex h-[100dvh] min-h-0 overflow-hidden">
      <div className="flex min-h-0 flex-1 flex-col">
        <header className="shrink-0 border-b border-border bg-card/95 backdrop-blur">
          <div className="mx-auto flex max-w-[1600px] flex-col gap-2 px-3 py-2 lg:flex-row lg:items-center lg:justify-between">
            <div className="min-w-0">
              <p className="text-sm font-semibold uppercase tracking-normal text-primary">
                R2 管理平台
              </p>
              <p className="mt-0.5 text-xs text-muted-foreground">
                面向已注册 ROS2 服务的运维控制台
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2 lg:justify-end">
              {connectionStatus}
              <NavLink
                to="/vision"
                className="inline-flex h-8 items-center gap-2 rounded-md border border-border bg-card px-2.5 text-sm font-semibold text-card-foreground hover:bg-muted"
              >
                <Crosshair aria-hidden="true" className="size-4" />
                R2 Vision
              </NavLink>
              <button
                type="button"
                className="inline-flex h-8 items-center gap-2 rounded-md border border-border bg-card px-2.5 text-sm font-semibold text-card-foreground hover:bg-muted disabled:cursor-not-allowed disabled:opacity-70"
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

        <div className="mx-auto flex min-h-0 w-full max-w-[1600px] flex-1 flex-col gap-3 px-3 py-3 lg:flex-row">
          <main className="min-h-0 min-w-0 flex-1 overflow-hidden">
            {children}
          </main>
          <aside className="order-first shrink-0 overflow-x-auto lg:order-none lg:w-36 lg:overflow-visible">
            <div className="flex w-max gap-2 lg:w-full lg:flex-col">
              <nav
                aria-label="管理导航"
                className="flex gap-2 lg:w-full lg:flex-col"
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
                          "inline-flex h-8 items-center gap-2 rounded-md border px-2.5 text-sm font-medium lg:w-full lg:justify-start",
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
              {quickCommands ? (
                <div
                  aria-label="快捷命令"
                  className="flex gap-2 border-l border-border pl-2 lg:w-full lg:flex-col lg:border-l-0 lg:border-t lg:pl-0 lg:pt-3"
                >
                  {quickCommands}
                </div>
              ) : null}
            </div>
          </aside>
        </div>
      </div>
    </div>
  )
}
