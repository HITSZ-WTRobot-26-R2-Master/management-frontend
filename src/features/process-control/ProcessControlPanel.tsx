import { useAtomValue } from "jotai"
import {
  AlertTriangle,
  CheckCircle2,
  Construction,
  LoaderCircle,
  Play,
  Send,
  Workflow,
  XCircle,
} from "lucide-react"
import { useCallback, useState } from "react"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import { hasManagementAuthToken } from "@/lib/management-api"
import { useCommandDiscovery } from "@/hooks/useCommandDiscovery"
import { authTokenAtom, managementApiClientAtom } from "@/state/operator-shell"
import type { CommandDefinition, CommandResponse } from "@/types/management"

const TARGET_MASTER_FULL = "master_full"

type SubmissionState = {
  submitting: boolean
  lastResponse: CommandResponse | null
  error: string | null
}

export function ProcessControlPanel() {
  const token = useAtomValue(authTokenAtom)
  const client = useAtomValue(managementApiClientAtom)
  const { discovery } = useCommandDiscovery()

  const hasToken = hasManagementAuthToken(token)

  const processControlCommands = discovery.commands.filter(
    (c) => c.target === TARGET_MASTER_FULL,
  )

  const [confirmCommand, setConfirmCommand] =
    useState<CommandDefinition | null>(null)
  const [submissions, setSubmissions] = useState<
    Record<string, SubmissionState>
  >({})

  const handleSubmit = useCallback(
    async (cmdName: string) => {
      if (!client) return

      setSubmissions((prev) => ({
        ...prev,
        [cmdName]: { submitting: true, lastResponse: null, error: null },
      }))

      try {
        const response = await client.submitCommand({
          target: TARGET_MASTER_FULL,
          command: cmdName,
          payload: {},
          confirm: true,
        })
        setSubmissions((prev) => ({
          ...prev,
          [cmdName]: {
            submitting: false,
            lastResponse: response,
            error: null,
          },
        }))
      } catch (err) {
        const message = err instanceof Error ? err.message : "提交失败"
        setSubmissions((prev) => ({
          ...prev,
          [cmdName]: { submitting: false, lastResponse: null, error: message },
        }))
      }

      setConfirmCommand(null)
    },
    [client],
  )

  if (!hasToken) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="max-w-md rounded-lg border border-border bg-card p-8 text-center">
          <AlertTriangle className="mx-auto mb-3 size-10 text-muted-foreground" />
          <p className="text-sm font-semibold text-card-foreground">
            请先配置连接设置
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            需要在设置页面配置后端地址和认证令牌后才能使用流程控制
          </p>
        </div>
      </div>
    )
  }

  if (discovery.loading) {
    return (
      <div className="flex h-full items-center justify-center">
        <LoaderCircle className="size-6 animate-spin text-muted-foreground" />
        <span className="ml-2 text-sm text-muted-foreground">
          加载命令列表...
        </span>
      </div>
    )
  }

  if (discovery.error) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="max-w-md rounded-lg border border-border bg-card p-8 text-center">
          <XCircle className="mx-auto mb-3 size-10 text-red-500" />
          <p className="text-sm font-semibold text-card-foreground">
            命令加载失败
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            {discovery.error.message}
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="flex h-full flex-col overflow-auto">
      <div className="sticky top-0 z-10 border-b border-border bg-card/95 px-4 py-3 backdrop-blur">
        <div className="flex items-center gap-2">
          <Workflow className="size-5 text-primary" />
          <div>
            <h2 className="text-sm font-semibold text-card-foreground">
              流程控制
            </h2>
            <p className="text-xs text-muted-foreground">
              已加载 {processControlCommands.length} 个流程控制命令
            </p>
          </div>
        </div>
      </div>

      <div className="flex-1 space-y-4 p-4">
        {/* Process Monitoring TODO Section */}
        <div className="rounded-lg border border-amber-200 bg-amber-50 p-6">
          <div className="flex items-start gap-3">
            <Construction className="mt-0.5 size-5 shrink-0 text-amber-600" />
            <div>
              <h3 className="text-sm font-semibold text-amber-800">
                流程监控
              </h3>
              <p className="mt-1 text-xs text-amber-700">
                master_full 尚未适配流程监控，此区域保留用于未来流程状态展示。
              </p>
              <ul className="mt-2 list-inside list-disc space-y-0.5 text-xs text-amber-600">
                <li>TODO: 任务阶段/状态展示（待机 / 梅林 / 对抗 / 完成）</li>
                <li>TODO: 动作执行进度追踪</li>
                <li>TODO: 输入话题数据状态</li>
              </ul>
            </div>
          </div>
        </div>

        {/* Process Control Commands Section */}
        {processControlCommands.length > 0 && (
          <div className="rounded-lg border border-border bg-card">
            <div className="border-b border-border bg-muted/30 px-4 py-2">
              <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                流程控制指令
              </h3>
            </div>
            <div className="divide-y divide-border">
              {processControlCommands.map((cmd) => {
                const sub = submissions[cmd.name]

                return (
                  <div
                    key={cmd.name}
                    className="flex flex-col gap-3 px-4 py-3 lg:flex-row lg:items-end lg:justify-between"
                  >
                    <div className="min-w-0 flex-1 space-y-2">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium text-card-foreground">
                          {cmd.name}
                        </span>
                        {sub?.lastResponse && (
                          <span
                            className={cn(
                              "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium",
                              sub.lastResponse.accepted
                                ? "bg-emerald-100 text-emerald-800"
                                : "bg-red-100 text-red-800",
                            )}
                          >
                            {sub.lastResponse.accepted ? (
                              <CheckCircle2 className="size-3" />
                            ) : (
                              <XCircle className="size-3" />
                            )}
                            {sub.lastResponse.result}
                          </span>
                        )}
                        {sub?.error && (
                          <span className="inline-flex items-center rounded-full bg-red-100 px-2 py-0.5 text-[10px] font-medium text-red-800">
                            {sub.error}
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-muted-foreground">
                        {cmd.description}
                      </p>
                    </div>

                    <div className="flex shrink-0 items-center gap-2">
                      <Button
                        size="sm"
                        disabled={sub?.submitting}
                        onClick={() => setConfirmCommand(cmd)}
                      >
                        {sub?.submitting ? (
                          <LoaderCircle className="mr-1.5 size-3.5 animate-spin" />
                        ) : (
                          <Send className="mr-1.5 size-3.5" />
                        )}
                        执行
                      </Button>
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        )}

        {processControlCommands.length === 0 && (
          <div className="flex items-center justify-center py-12">
            <div className="max-w-md rounded-lg border border-border bg-card p-8 text-center">
              <Play className="mx-auto mb-3 size-10 text-muted-foreground" />
              <p className="text-sm font-semibold text-card-foreground">
                未发现流程控制命令
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                请检查管理 agent 的命令配置中是否注册了 {TARGET_MASTER_FULL}{" "}
                命令
              </p>
            </div>
          </div>
        )}
      </div>

      <Dialog
        open={!!confirmCommand}
        onOpenChange={() => setConfirmCommand(null)}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <AlertTriangle className="size-5 text-amber-500" />
              确认执行流程控制命令
            </DialogTitle>
            <DialogDescription>
              即将执行{" "}
              <code className="rounded bg-muted px-1 py-0.5 text-xs font-medium">
                {confirmCommand?.name}
              </code>
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3">
            <p className="text-xs text-muted-foreground">
              {confirmCommand?.description}
            </p>
            <p className="text-xs font-semibold text-amber-600">
              此操作将通过 ROS topic 触发 master_full 内部流程，请确认系统已就绪
            </p>
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setConfirmCommand(null)}
            >
              取消
            </Button>
            <Button
              size="sm"
              onClick={() =>
                confirmCommand && handleSubmit(confirmCommand.name)
              }
            >
              确认执行
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
