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

const PC_COMMAND_NAMES = new Set(["global_start", "retry_prepare"])
const RETRY_COMMAND_NAMES = new Set([
  "retry_take_spear",
  "retry_merlin",
  "retry_combat",
])

type SubmissionState = {
  submitting: boolean
  lastResponse: CommandResponse | null
  error: string | null
}

type RetryParams = Record<string, unknown>

function retryDefaultParams(cmdName: string): RetryParams {
  switch (cmdName) {
    case "retry_take_spear":
      return { spear_index: 1, previous_spear_needs_dock: false }
    case "retry_merlin":
      return { r2_taken_count: 0, taken_r2_blocks: [] }
    case "retry_combat":
      return { combat_source: 1, combat_place_layer: 1 }
    default:
      return {}
  }
}

export function ProcessControlPanel() {
  const token = useAtomValue(authTokenAtom)
  const client = useAtomValue(managementApiClientAtom)
  const { discovery } = useCommandDiscovery()

  const hasToken = hasManagementAuthToken(token)

  const pcCommands = discovery.commands.filter((c) =>
    PC_COMMAND_NAMES.has(c.name),
  )
  const retryCommands = discovery.commands.filter((c) =>
    RETRY_COMMAND_NAMES.has(c.name),
  )

  const [confirmCommand, setConfirmCommand] =
    useState<CommandDefinition | null>(null)
  const [confirmPayload, setConfirmPayload] = useState<RetryParams>({})
  const [submissions, setSubmissions] = useState<
    Record<string, SubmissionState>
  >({})
  const [retryParams, setRetryParams] = useState<Record<string, RetryParams>>(
    () => {
      const init: Record<string, RetryParams> = {}
      for (const name of RETRY_COMMAND_NAMES) {
        init[name] = retryDefaultParams(name)
      }
      return init
    },
  )

  const updateRetryParam = useCallback(
    (cmdName: string, key: string, value: unknown) => {
      setRetryParams((prev) => ({
        ...prev,
        [cmdName]: { ...prev[cmdName], [key]: value },
      }))
    },
    [],
  )

  const handleSubmit = useCallback(
    async (cmdName: string, payload: RetryParams) => {
      if (!client) return

      setSubmissions((prev) => ({
        ...prev,
        [cmdName]: { submitting: true, lastResponse: null, error: null },
      }))

      try {
        const response = await client.submitCommand({
          target: TARGET_MASTER_FULL,
          command: cmdName,
          payload,
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
      setConfirmPayload({})
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
    <div className="flex h-full flex-col overflow-hidden">
      {/* Header */}
      <div className="sticky top-0 z-10 shrink-0 border-b border-border bg-card/95 px-4 py-3 backdrop-blur">
        <div className="flex items-center gap-2">
          <Workflow className="size-5 text-primary" />
          <div>
            <h2 className="text-sm font-semibold text-card-foreground">
              流程控制
            </h2>
            <p className="text-xs text-muted-foreground">
              {pcCommands.length} 流程控制指令 · {retryCommands.length} 重试类型
            </p>
          </div>
        </div>
      </div>

      {/* Body: sidebar + main */}
      <div className="flex min-h-0 flex-1">
        {/* Left Sidebar — process control commands */}
        <aside className="flex w-40 shrink-0 flex-col border-r border-border bg-card">
          <div className="border-b border-border px-3 py-2.5">
            <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              流程控制指令
            </h3>
          </div>
          <div className="flex-1 space-y-1.5 overflow-auto p-2">
            {pcCommands.map((cmd) => {
              const sub = submissions[cmd.name]
              return (
                <div key={cmd.name} className="space-y-1">
                  <button
                    type="button"
                    className={cn(
                      "flex w-full items-center gap-1.5 rounded-md border px-2.5 py-2 text-left text-xs font-medium transition-colors",
                      "border-border bg-card text-card-foreground hover:bg-muted",
                      sub?.submitting && "opacity-60",
                    )}
                    disabled={sub?.submitting}
                    onClick={() => {
                      setConfirmPayload({})
                      setConfirmCommand(cmd)
                    }}
                  >
                    {sub?.submitting ? (
                      <LoaderCircle className="size-3 shrink-0 animate-spin" />
                    ) : (
                      <Send className="size-3 shrink-0" />
                    )}
                    <span className="truncate">{cmd.name}</span>
                  </button>
                  {sub?.lastResponse && (
                    <span
                      className={cn(
                        "inline-flex w-full items-center gap-1 rounded px-1.5 py-0.5 text-[10px] font-medium",
                        sub.lastResponse.accepted
                          ? "bg-emerald-100 text-emerald-800"
                          : "bg-red-100 text-red-800",
                      )}
                    >
                      {sub.lastResponse.accepted ? (
                        <CheckCircle2 className="size-2.5" />
                      ) : (
                        <XCircle className="size-2.5" />
                      )}
                      {sub.lastResponse.result}
                    </span>
                  )}
                  {sub?.error && (
                    <span className="inline-flex w-full items-center rounded bg-red-100 px-1.5 py-0.5 text-[10px] font-medium text-red-800">
                      {sub.error}
                    </span>
                  )}
                </div>
              )
            })}
            {pcCommands.length === 0 && (
              <p className="px-1 py-4 text-center text-[10px] text-muted-foreground">
                未发现流程控制命令
              </p>
            )}
          </div>
        </aside>

        {/* Main content */}
        <main className="min-w-0 flex-1 overflow-auto">
          <div className="space-y-4 p-4">
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
                    <li>
                      触发 topic：master_switch (UInt8) — 全局启动/重试准备，已实现
                    </li>
                    <li>
                      触发 topic：retry_command (MasterRetry) — 重试触发，已实现
                    </li>
                    <li>
                      TODO: 状态 topic（独立 topic）—
                      获取当前流程阶段（待机 / 梅林 / 对抗 / 完成）
                    </li>
                    <li>TODO: 动作执行进度追踪</li>
                  </ul>
                </div>
              </div>
            </div>

            {/* Retry Cards */}
            {retryCommands.length > 0 && (
              <div className="space-y-3">
                <div className="flex items-center gap-2">
                  <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    重试触发
                  </h3>
                  <span className="text-[10px] text-muted-foreground">
                    {retryCommands.length} 种重试类型
                  </span>
                </div>
                <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
                  {retryCommands.map((cmd) => (
                    <RetryCard
                      key={cmd.name}
                      command={cmd}
                      params={retryParams[cmd.name] ?? {}}
                      submission={submissions[cmd.name]}
                      onParamChange={(key, value) =>
                        updateRetryParam(cmd.name, key, value)
                      }
                      onExecute={(payload) => {
                        setConfirmPayload(payload)
                        setConfirmCommand(cmd)
                      }}
                    />
                  ))}
                </div>
              </div>
            )}

            {retryCommands.length === 0 && (
              <div className="flex items-center justify-center py-12">
                <div className="max-w-md rounded-lg border border-border bg-card p-8 text-center">
                  <Play className="mx-auto mb-3 size-10 text-muted-foreground" />
                  <p className="text-sm font-semibold text-card-foreground">
                    未发现重试命令
                  </p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    请检查管理 agent 的命令配置中是否注册了重试命令
                  </p>
                </div>
              </div>
            )}
          </div>
        </main>
      </div>

      {/* Confirmation Dialog — shared */}
      <Dialog
        open={!!confirmCommand}
        onOpenChange={() => {
          setConfirmCommand(null)
          setConfirmPayload({})
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <AlertTriangle className="size-5 text-amber-500" />
              确认执行
              {PC_COMMAND_NAMES.has(confirmCommand?.name ?? "")
                ? "流程控制命令"
                : "重试命令"}
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
            {Object.keys(confirmPayload).length > 0 && (
              <div className="rounded-md bg-muted/50 p-2">
                <p className="mb-1 text-[10px] font-semibold text-muted-foreground">
                  参数
                </p>
                {Object.entries(confirmPayload).map(([key, value]) => (
                  <p
                    key={key}
                    className="text-xs text-card-foreground"
                  >{`${key}: ${JSON.stringify(value)}`}</p>
                ))}
              </div>
            )}
            <p className="text-xs font-semibold text-amber-600">
              此操作将通过 ROS topic 触发 master_full 内部流程，请确认系统已就绪
            </p>
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                setConfirmCommand(null)
                setConfirmPayload({})
              }}
            >
              取消
            </Button>
            <Button
              size="sm"
              onClick={() =>
                confirmCommand &&
                handleSubmit(confirmCommand.name, confirmPayload)
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

/* ── Retry Card ── */

interface RetryCardProps {
  command: CommandDefinition
  params: RetryParams
  submission?: SubmissionState
  onParamChange: (key: string, value: unknown) => void
  onExecute: (payload: RetryParams) => void
}

function RetryCard({
  command,
  params,
  submission,
  onParamChange,
  onExecute,
}: RetryCardProps) {
  return (
    <div className="rounded-lg border border-border bg-card">
      <div className="border-b border-border bg-muted/30 px-4 py-3">
        <h4 className="text-sm font-medium text-card-foreground">
          {command.name}
        </h4>
        <p className="mt-0.5 text-xs text-muted-foreground">
          {command.description}
        </p>
      </div>

      <div className="space-y-3 px-4 py-3">
        <RetryParamsInput
          cmdName={command.name}
          params={params}
          onChange={onParamChange}
        />
      </div>

      <div className="flex items-center justify-between border-t border-border px-4 py-3">
        <div className="flex items-center gap-2">
          {submission?.lastResponse && (
            <span
              className={cn(
                "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium",
                submission.lastResponse.accepted
                  ? "bg-emerald-100 text-emerald-800"
                  : "bg-red-100 text-red-800",
              )}
            >
              {submission.lastResponse.accepted ? (
                <CheckCircle2 className="size-3" />
              ) : (
                <XCircle className="size-3" />
              )}
              {submission.lastResponse.result}
            </span>
          )}
          {submission?.error && (
            <span className="inline-flex items-center rounded-full bg-red-100 px-2 py-0.5 text-[10px] font-medium text-red-800">
              {submission.error}
            </span>
          )}
        </div>
        <Button
          size="sm"
          disabled={submission?.submitting}
          onClick={() => onExecute(params)}
        >
          {submission?.submitting ? (
            <LoaderCircle className="mr-1.5 size-3.5 animate-spin" />
          ) : (
            <Send className="mr-1.5 size-3.5" />
          )}
          执行
        </Button>
      </div>
    </div>
  )
}

/* ── Retry Params Input ── */

function RetryParamsInput({
  cmdName,
  params,
  onChange,
}: {
  cmdName: string
  params: RetryParams
  onChange: (key: string, value: unknown) => void
}) {
  switch (cmdName) {
    case "retry_take_spear":
      return (
        <>
          <RadioGroup
            label="spear_index"
            options={[
              { value: 1, label: "1" },
              { value: 2, label: "2" },
              { value: 3, label: "3" },
            ]}
            selected={(params.spear_index as number) ?? 1}
            onChange={(v) => onChange("spear_index", v)}
          />
          <ParamField label="previous_spear_needs_dock">
            <label className="flex items-center gap-2 text-xs text-card-foreground">
              <input
                type="checkbox"
                className="size-3.5 rounded border-border"
                checked={(params.previous_spear_needs_dock as boolean) ?? false}
                onChange={(e) =>
                  onChange("previous_spear_needs_dock", e.target.checked)
                }
              />
              需要先对接上一矛头
            </label>
          </ParamField>
        </>
      )

    case "retry_merlin":
      return (
        <>
          <RadioGroup
            label="r2_taken_count"
            options={[
              { value: 0, label: "0" },
              { value: 1, label: "1" },
              { value: 2, label: "2" },
              { value: 3, label: "3" },
              { value: 4, label: "4" },
            ]}
            selected={(params.r2_taken_count as number) ?? 0}
            onChange={(v) => onChange("r2_taken_count", v)}
          />
          <MultiCheckbox
            label="taken_r2_blocks"
            options={Array.from({ length: 12 }, (_, i) => i + 1)}
            selected={(params.taken_r2_blocks as number[]) ?? []}
            onChange={(v) => onChange("taken_r2_blocks", v)}
          />
        </>
      )

    case "retry_combat":
      return (
        <>
          <RadioGroup
            label="combat_source"
            options={[
              { value: 1, label: "HasScroll" },
              { value: 2, label: "TakeScroll1" },
              { value: 3, label: "TakeScroll2" },
            ]}
            selected={(params.combat_source as number) ?? 1}
            onChange={(v) => onChange("combat_source", v)}
          />
          <RadioGroup
            label="combat_place_layer"
            options={[
              { value: 1, label: "Middle" },
              { value: 2, label: "Top" },
            ]}
            selected={(params.combat_place_layer as number) ?? 1}
            onChange={(v) => onChange("combat_place_layer", v)}
          />
        </>
      )

    default:
      return (
        <p className="text-xs text-muted-foreground">
          此重试类型无额外参数
        </p>
      )
  }
}

function RadioGroup({
  label,
  options,
  selected,
  onChange,
}: {
  label: string
  options: { value: number; label: string }[]
  selected: number
  onChange: (value: number) => void
}) {
  return (
    <div className="space-y-1.5">
      <label className="text-[10px] font-medium text-muted-foreground">
        {label}
      </label>
      <div className="flex flex-wrap gap-1.5">
        {options.map((opt) => (
          <button
            key={opt.value}
            type="button"
            className={cn(
              "rounded-md border px-2.5 py-1 text-xs font-medium transition-colors",
              selected === opt.value
                ? "border-primary bg-primary text-primary-foreground"
                : "border-border bg-card text-card-foreground hover:bg-muted",
            )}
            onClick={() => onChange(opt.value)}
          >
            {opt.label}
          </button>
        ))}
      </div>
    </div>
  )
}

function MultiCheckbox({
  label,
  options,
  selected,
  onChange,
}: {
  label: string
  options: number[]
  selected: number[]
  onChange: (value: number[]) => void
}) {
  return (
    <div className="space-y-1.5">
      <label className="text-[10px] font-medium text-muted-foreground">
        {label}
      </label>
      <div className="flex flex-wrap gap-1.5">
        {options.map((opt) => {
          const checked = selected.includes(opt)
          return (
            <button
              key={opt}
              type="button"
              className={cn(
                "rounded-md border px-2.5 py-1 text-xs font-medium transition-colors",
                checked
                  ? "border-primary bg-primary text-primary-foreground"
                  : "border-border bg-card text-card-foreground hover:bg-muted",
              )}
              onClick={() =>
                onChange(
                  checked
                    ? selected.filter((v) => v !== opt)
                    : [...selected, opt].sort((a, b) => a - b),
                )
              }
            >
              {opt}
            </button>
          )
        })}
      </div>
    </div>
  )
}

function ParamField({
  label,
  children,
}: {
  label: string
  children: React.ReactNode
}) {
  return (
    <div className="space-y-1">
      <label className="text-[10px] font-medium text-muted-foreground">
        {label}
      </label>
      {children}
    </div>
  )
}
