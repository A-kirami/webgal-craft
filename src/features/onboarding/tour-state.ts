import { reactive } from 'vue'


import type { TourPersistence } from '~/features/onboarding/tour-version'

/**
 * 引导状态的进程内镜像。
 *
 * 每条引导的完成记录存在自己的 useStorage ref 里，而 useStorage 不跨实例同步：
 * 同文档内改写 localStorage 既不会让别的引导读到「editor 引导这一轮跑完了」，
 * 也不会让设置里的「重置全部引导进度」影响到已挂载的引导。这两件事都靠这份模块级状态桥接。
 */
const completedVersions = reactive(new Map<string, string>())
const resetHandlers = new Map<string, () => void>()

export function publishTourCompletion(storageKey: string, version: string): void {
  completedVersions.set(storageKey, version)
}

export function isTourCompleted(persistence: TourPersistence): boolean {
  return completedVersions.get(persistence.storageKey) === persistence.version
}

/** 引导挂载时登记自己的复位回调，返回注销函数 */
export function registerTourReset(storageKey: string, reset: () => void): () => void {
  resetHandlers.set(storageKey, reset)

  return () => {
    resetHandlers.delete(storageKey)
  }
}
