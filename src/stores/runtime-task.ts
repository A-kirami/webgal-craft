import { defineStore } from 'pinia'

export const useRuntimeTaskStore = defineStore('runtime-task', () => {
  const blockingTaskIds = reactive(new Set<string>())

  const hasBlockingTasks = $computed(() => blockingTaskIds.size > 0)

  function beginBlockingTask(id: string): () => void {
    blockingTaskIds.add(id)
    return () => {
      finishBlockingTask(id)
    }
  }

  function finishBlockingTask(id: string): void {
    blockingTaskIds.delete(id)
  }

  return $$({
    hasBlockingTasks,
    beginBlockingTask,
    finishBlockingTask,
  })
})
