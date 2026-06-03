import type { RosTime } from "@/types/management"

const durationFormatter = new Intl.NumberFormat("zh-CN", {
  maximumFractionDigits: 2,
  minimumFractionDigits: 0,
})

export function formatMillimeterPrecision(value: number) {
  return Number.isFinite(value) ? value.toFixed(3) : "缺失"
}

export function formatHexWord(value: number) {
  return `0x${Math.max(0, Math.trunc(value)).toString(16).toUpperCase().padStart(4, "0")}`
}

export function formatReadableDurationMs(value: number) {
  if (!Number.isFinite(value)) {
    return "时间未知"
  }

  const durationMs = Math.max(0, Math.round(value))

  if (durationMs < 1_000) {
    return `${durationMs} ms`
  }

  if (durationMs < 60_000) {
    return `${durationFormatter.format(durationMs / 1_000)} s`
  }

  const totalSeconds = Math.round(durationMs / 1_000)
  const seconds = totalSeconds % 60
  const totalMinutes = Math.floor(totalSeconds / 60)

  if (totalMinutes < 60) {
    return `${totalMinutes} 分 ${formatTwoDigitValue(seconds)} 秒`
  }

  const minutes = totalMinutes % 60
  const hours = Math.floor(totalMinutes / 60)

  return `${hours} 小时 ${formatTwoDigitValue(minutes)} 分 ${formatTwoDigitValue(
    seconds,
  )} 秒`
}

export function formatRosTime(stamp: RosTime) {
  if (!isValidRosTime(stamp)) {
    return `ROS 时间 ${formatRawRosTime(stamp)}`
  }

  const milliseconds = stamp.sec * 1_000 + Math.floor(stamp.nanosec / 1_000_000)
  const time = new Date(milliseconds)

  if (Number.isNaN(time.getTime())) {
    return `ROS 时间 ${formatRawRosTime(stamp)}`
  }

  return `ROS ${time.toLocaleTimeString("zh-CN", {
    hour12: false,
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  })}.${String(time.getMilliseconds()).padStart(3, "0")}`
}

function isValidRosTime(stamp: RosTime) {
  return (
    Number.isFinite(stamp.sec) &&
    Number.isFinite(stamp.nanosec) &&
    stamp.sec >= 0 &&
    stamp.nanosec >= 0 &&
    stamp.nanosec < 1_000_000_000
  )
}

function formatRawRosTime(stamp: RosTime) {
  const sec = Number.isFinite(stamp.sec) ? Math.trunc(stamp.sec) : String(stamp.sec)
  const nanosec = Number.isFinite(stamp.nanosec)
    ? Math.max(0, Math.trunc(stamp.nanosec))
    : String(stamp.nanosec)

  return `${sec}.${String(nanosec).padStart(9, "0")}`
}

function formatTwoDigitValue(value: number) {
  return String(value).padStart(2, "0")
}
