import { Bell, Boxes, DatabaseZap, LifeBuoy, Settings } from "lucide-react"
import type { PropsWithChildren } from "react"

const navItems = [
  { label: "服务", active: true, icon: Boxes },
  { label: "事件", active: false, icon: Bell },
  { label: "命令", active: false, icon: DatabaseZap },
  { label: "设置", active: false, icon: Settings },
]

export function ManagementShell({ children }: PropsWithChildren) {
  return (
    <div className="min-h-screen">
      <header className="border-b border-border bg-card/95 backdrop-blur">
        <div className="mx-auto flex max-w-7xl flex-col gap-4 px-5 py-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <p className="text-sm font-semibold uppercase tracking-normal text-primary">
              R2 管理平台
            </p>
            <p className="mt-1 text-sm text-muted-foreground">
              面向已注册 ROS2 服务的运维控制台
            </p>
          </div>
          <nav aria-label="管理导航" className="flex flex-wrap gap-2">
            {navItems.map((item) => (
              <button
                key={item.label}
                type="button"
                className={
                  item.active
                    ? "inline-flex items-center gap-2 rounded-md border border-primary bg-primary px-3 py-2 text-sm font-medium text-primary-foreground"
                    : "inline-flex items-center gap-2 rounded-md border border-border bg-card px-3 py-2 text-sm font-medium text-muted-foreground hover:bg-muted hover:text-card-foreground"
                }
                aria-current={item.active ? "page" : undefined}
              >
                <item.icon aria-hidden="true" className="size-4" />
                {item.label}
              </button>
            ))}
          </nav>
        </div>
      </header>

      <main className="mx-auto max-w-7xl px-5 py-6">{children}</main>

      <footer className="border-t border-border bg-card/70">
        <div className="mx-auto flex max-w-7xl flex-col gap-2 px-5 py-4 text-sm text-muted-foreground md:flex-row md:items-center md:justify-between">
          <span>使用后端注册表返回的逻辑服务名。</span>
          <span className="inline-flex items-center gap-2">
            <LifeBuoy aria-hidden="true" className="size-4" />
            实时事件与 REST 回退共同保持仪表盘更新。
          </span>
        </div>
      </footer>
    </div>
  )
}
