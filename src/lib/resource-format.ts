const BINARY_BYTE_UNITS = ["B", "KiB", "MiB", "GiB", "TiB"] as const

export function formatPercent(value: number) {
  return `${value.toFixed(1)}%`
}

export function formatBytes(value: number) {
  if (!Number.isFinite(value)) {
    return "未上报"
  }

  const sign = value < 0 ? "-" : ""
  let absoluteValue = Math.abs(value)
  let unitIndex = 0

  while (
    absoluteValue >= 1024 &&
    unitIndex < BINARY_BYTE_UNITS.length - 1
  ) {
    absoluteValue /= 1024
    unitIndex += 1
  }

  return `${sign}${formatByteAmount(absoluteValue, unitIndex)} ${BINARY_BYTE_UNITS[unitIndex]}`
}

function formatByteAmount(value: number, unitIndex: number) {
  if (unitIndex === 0 || value >= 100) {
    return value.toFixed(0)
  }

  if (value >= 10) {
    return value.toFixed(1)
  }

  return value.toFixed(2)
}
