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

  function hasPending(path: string): boolean {
    return pendingTimers.has(path)
  }

  function cancel(path: string) {
    const timer = pendingTimers.get(path)
    if (timer === undefined) {
      return
    }

    clearTimeout(timer)
    pendingTimers.delete(path)
  }

  function cancelAll() {
    for (const path of pendingTimers.keys()) {
      cancel(path)
    }
  }

  async function run(path: string) {
    const state = options.getState(path)
    if (!state || !canExecuteEditorAutoSave(state)) {
      return
    }

    try {
      await options.saveDocument(path)
    } catch (error) {
      options.handleSaveError(error)
    }
  }

  function schedule(path: string) {
    const state = options.getState(path)
    if (!state || !canExecuteEditorAutoSave(state)) {
      return
    }

    cancel(path)
    const timer = setTimeout(() => {
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
