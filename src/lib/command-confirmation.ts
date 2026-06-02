import type {
  ApiError,
  CommandDefinition,
  ServiceRiskLevel,
} from "@/types/management"

interface CommandConfirmationInput {
  command: CommandDefinition
  error: ApiError | null
  operatorConfirmed: boolean
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
  submitting,
}: CommandConfirmationInput): CommandConfirmationState {
  const requiresConfirm =
    command.backend.requires_confirm || error?.code === "command_confirm_required"

  return {
    canSubmit: !submitting && (!requiresConfirm || operatorConfirmed),
    requiresConfirm,
  }
}

export function isHighRisk(riskLevel: ServiceRiskLevel) {
  return riskLevel === "high" || riskLevel === "critical"
}
