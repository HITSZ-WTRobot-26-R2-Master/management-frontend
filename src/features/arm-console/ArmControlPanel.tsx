import { useAtomValue } from "jotai"
import {
  AlertTriangle,
  CheckCircle2,
  Hand,
  LoaderCircle,
  Send,
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
import {
  ARM_COMMAND_GROUPS,
  ARM_COMMAND_PARAMS,
  type ArmCommandParamDef,
} from "@/lib/arm-command-params"

type SubmissionState = {
  submitting: boolean
  lastResponse: CommandResponse | null
  error: string | null
}

export function ArmControlPanel() {
  const token = useAtomValue(authTokenAtom)
  const client = useAtomValue(managementApiClientAtom)
  const { discovery } = useCommandDiscovery()

  const hasToken = hasManagementAuthToken(token)

  const armCommands = discovery.commands.filter(
    (c) => c.target === "arm_driver",
  )

  const [confirmCommand, setConfirmCommand] = useState<{
    command: CommandDefinition
    params: ArmCommandParamDef
  } | null>(null)

  const [paramValues, setParamValues] = useState<
    Record<string, Record<string, number>>
  >({})

  const [submissions, setSubmissions] = useState<
    Record<string, SubmissionState>
  >({})

  const getParams = useCallback(
    (cmdName: string): Record<string, number> => {
      return (
        paramValues[cmdName] ?? ARM_COMMAND_PARAMS[cmdName]?.defaults ?? {}
      )
    },
    [paramValues],
  )

  const updateParam = useCallback(
    (cmdName: string, field: string, value: string) => {
      setParamValues((prev) => {
        const current = {
          ...(prev[cmdName] ?? ARM_COMMAND_PARAMS[cmdName]?.defaults ?? {}),
        }
        const num = parseFloat(value)
        if (!isNaN(num) && isFinite(num)) {
          current[field] = num
        }
        return { ...prev, [cmdName]: current }
      })
    },
    [],
  )

  const handleSubmit = useCallback(
    async (cmdName: string) => {
      if (!client) return

      const params = getParams(cmdName)
      const payload: Record<string, number> = {}
      for (const [k, v] of Object.entries(params)) {
        payload[k] = v
      }

      setSubmissions((prev) => ({
        ...prev,
        [cmdName]: { submitting: true, lastResponse: null, error: null },
      }))

      try {
        const response = await client.submitCommand({
          target: "arm_driver",
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
    },
    [client, getParams],
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
            需要在设置页面配置后端地址和认证令牌后才能使用机械臂控制台
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

  if (armCommands.length === 0) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="max-w-md rounded-lg border border-border bg-card p-8 text-center">
          <Hand className="mx-auto mb-3 size-10 text-muted-foreground" />
          <p className="text-sm font-semibold text-card-foreground">
            未发现机械臂命令
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            请检查管理 agent 的命令配置中是否注册了 arm_driver 命令
          </p>
        </div>
      </div>
    )
  }

  const commandMap = Object.fromEntries(armCommands.map((c) => [c.name, c]))

  return (
    <div className="flex h-full flex-col overflow-auto">
      <div className="sticky top-0 z-10 border-b border-border bg-card/95 px-4 py-3 backdrop-blur">
        <div className="flex items-center gap-2">
          <Hand className="size-5 text-primary" />
          <div>
            <h2 className="text-sm font-semibold text-card-foreground">
              机械臂控制台
            </h2>
            <p className="text-xs text-muted-foreground">
              已加载 {armCommands.length} 个命令
            </p>
          </div>
        </div>
      </div>

      <div className="flex-1 space-y-4 p-4">
        {ARM_COMMAND_GROUPS.map((group) => {
          const commandsInGroup = group.commands
            .map((name) => commandMap[name])
            .filter(Boolean)

          if (commandsInGroup.length === 0) return null

          return (
            <CommandGroupCard
              key={group.label}
              groupLabel={group.label}
              commands={commandsInGroup}
              paramValues={getParams}
              onParamChange={updateParam}
              submissions={submissions}
              onTrigger={(cmd) => {
                const params = ARM_COMMAND_PARAMS[cmd.name] ?? {
                  fields: [],
                  defaults: {},
                  description: "",
                }
                setConfirmCommand({ command: cmd, params })
              }}
            />
          )
        })}
      </div>

      <Dialog open={!!confirmCommand} onOpenChange={() => setConfirmCommand(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <AlertTriangle className="size-5 text-amber-500" />
              确认执行机械臂命令
            </DialogTitle>
            <DialogDescription>
              即将执行{" "}
              <code className="rounded bg-muted px-1 py-0.5 text-xs font-medium">
                {confirmCommand?.command.name}
              </code>
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3">
            <p className="text-xs text-muted-foreground">
              {confirmCommand?.params.description}
            </p>
            {confirmCommand && confirmCommand.params.fields.length > 0 && (
              <div className="rounded-md bg-muted/50 p-3">
                <p className="mb-1 text-xs font-medium text-card-foreground">
                  参数:
                </p>
                <ul className="text-xs text-muted-foreground">
                  {confirmCommand.params.fields.map((f) => (
                    <li key={f}>
                      <code className="text-[11px]">{f}</code> ={" "}
                      {getParams(confirmCommand.command.name)[f] ?? "—"}
                    </li>
                  ))}
                </ul>
              </div>
            )}
            <p className="text-xs font-semibold text-amber-600">
              此操作将控制物理机械臂，请确认周围无障碍物
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
                confirmCommand && handleSubmit(confirmCommand.command.name)
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

function CommandGroupCard({
  groupLabel,
  commands,
  paramValues,
  onParamChange,
  submissions,
  onTrigger,
}: {
  groupLabel: string
  commands: CommandDefinition[]
  paramValues: (name: string) => Record<string, number>
  onParamChange: (cmdName: string, field: string, value: string) => void
  submissions: Record<string, SubmissionState>
  onTrigger: (cmd: CommandDefinition) => void
}) {
  return (
    <div className="rounded-lg border border-border bg-card">
      <div className="border-b border-border bg-muted/30 px-4 py-2">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          {groupLabel}
        </h3>
      </div>
      <div className="divide-y divide-border">
        {commands.map((cmd) => {
          const params = ARM_COMMAND_PARAMS[cmd.name]
          const vals = paramValues(cmd.name)
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
                  {params?.description ?? cmd.description}
                </p>
                {params && params.fields.length > 0 && (
                  <div className="flex flex-wrap gap-2">
                    {params.fields.map((field) => (
                      <div key={field} className="flex items-center gap-1.5">
                        <label
                          htmlFor={`${cmd.name}-${field}`}
                          className="text-xs font-mono text-muted-foreground"
                        >
                          {field}
                        </label>
                        <input
                          id={`${cmd.name}-${field}`}
                          type="number"
                          step="0.001"
                          className="h-7 w-24 rounded-md border border-border bg-background px-2 text-xs text-foreground outline-none focus:border-ring focus:ring-1 focus:ring-ring"
                          value={vals[field] ?? ""}
                          onChange={(e) =>
                            onParamChange(cmd.name, field, e.target.value)
                          }
                        />
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div className="flex shrink-0 items-center gap-2">
                <Button
                  size="sm"
                  disabled={sub?.submitting}
                  onClick={() => onTrigger(cmd)}
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
  )
}
