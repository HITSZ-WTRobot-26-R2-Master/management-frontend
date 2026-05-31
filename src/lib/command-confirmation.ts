import type {
  ApiError,
  CommandDefinition,
  ServiceRiskLevel,
} from "@/types/management"

interface CommandConfirmationInput {
  command: CommandDefinition
  error: ApiError | null
  operatorConfirmed: boolean
  reason: string
  submitting: boolean
}

export interface CommandConfirmationState {
  canSubmit: boolean
  requiresConfirm: boolean
}

export function getCommandConfirmationState({
  command,
  error,
  operatorConfirmed,
  reason,
  submitting,
}: CommandConfirmationInput): CommandConfirmationState {
  const requiresConfirm =
    command.backend.requires_confirm ||
    isHighRisk(command.backend.risk_level) ||
    error?.code === "command_confirm_required"

  return {
    canSubmit:
      !submitting &&
      reason.trim().length > 0 &&
      (!requiresConfirm || operatorConfirmed),
    requiresConfirm,
  }
}

export function isHighRisk(riskLevel: ServiceRiskLevel) {
  return riskLevel === "high" || riskLevel === "critical"
}
