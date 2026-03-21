export interface EditorAutoSaveState {
  isDirty: boolean
  projection: 'text' | 'visual'
}

interface CreateEditorAutoSaveControllerOptions {
  debounceMs: number
  getState: (path: string) => EditorAutoSaveState | undefined
  handleSaveError: (error: unknown) => void
  saveDocument: (path: string) => Promise<void>
}

// 这里只判断文档状态是否仍然值得执行自动保存，不处理用户设置开关。
export function canExecuteEditorAutoSave(state: EditorAutoSaveState): boolean {
  return state.isDirty
}

export function createEditorAutoSaveController(options: CreateEditorAutoSaveControllerOptions) {
  const pendingTimers = new Map<string, ReturnType<typeof setTimeout>>()
  const inFlightPaths = new Set<string>()
  const queuedRuns = new Set<string>()

  function hasPending(path: string): boolean {
    return pendingTimers.has(path) || inFlightPaths.has(path)
  }

  function cancel(path: string) {
    const timer = pendingTimers.get(path)
    if (timer !== undefined) {
      clearTimeout(timer)
      pendingTimers.delete(path)
    }
    queuedRuns.delete(path)
  }

  function cancelAll() {
    const trackedPaths = new Set([
      ...pendingTimers.keys(),
      ...inFlightPaths,
      ...queuedRuns,
    ])
    for (const path of trackedPaths) {
      cancel(path)
    }
  }

  async function run(path: string) {
    if (inFlightPaths.has(path)) {
      queuedRuns.add(path)
      return
    }

    const state = options.getState(path)
    if (!state || !canExecuteEditorAutoSave(state)) {
      queuedRuns.delete(path)
      return
    }

    inFlightPaths.add(path)
    try {
      await options.saveDocument(path)
    } catch (error) {
      options.handleSaveError(error)
    } finally {
      inFlightPaths.delete(path)

      if (queuedRuns.delete(path)) {
        void run(path)
      }
    }
  }

  function schedule(path: string) {
    const state = options.getState(path)
    if (!state || !canExecuteEditorAutoSave(state)) {
      cancel(path)
      return
    }

    cancel(path)
    const timer = setTimeout(() => {
      if (pendingTimers.get(path) !== timer) {
        return
      }
      pendingTimers.delete(path)
      void run(path)
    }, options.debounceMs)
    pendingTimers.set(path, timer)
  }

  return {
    hasPending,
    cancel,
    cancelAll,
    schedule,
  }
}
