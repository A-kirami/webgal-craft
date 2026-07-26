interface UseExportElapsedTimerOptions {
  now?: () => number
  updateIntervalMs?: number
}

const DEFAULT_UPDATE_INTERVAL_MS = 1000

export function formatExportElapsedSeconds(seconds: number, locale: string): string {
  return new Intl.NumberFormat(locale, {
    maximumFractionDigits: 1,
    minimumFractionDigits: 0,
  }).format(seconds)
}

export function useExportElapsedTimer(options: UseExportElapsedTimerOptions = {}) {
  const elapsedMs = shallowRef<number>()
  const now = options.now ?? (() => performance.now())
  let startedAt: number | undefined

  function updateElapsed(): void {
    if (startedAt === undefined) {
      return
    }

    elapsedMs.value = Math.max(0, now() - startedAt)
  }

  const { pause, resume } = useIntervalFn(
    updateElapsed,
    options.updateIntervalMs ?? DEFAULT_UPDATE_INTERVAL_MS,
    { immediate: false },
  )

  function start(): void {
    pause()
    elapsedMs.value = 0
    startedAt = now()
    resume()
  }

  function stop(): void {
    if (startedAt === undefined) {
      return
    }

    updateElapsed()
    startedAt = undefined
    pause()
  }

  function reset(): void {
    pause()
    startedAt = undefined
    elapsedMs.value = undefined
  }

  return {
    elapsedMs: readonly(elapsedMs),
    reset,
    start,
    stop,
  }
}
