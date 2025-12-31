import type { EventBusKey } from '@vueuse/core'

/**
 * 文件系统事件类型定义
 */
export type FileSystemEvent =
  | { type: 'file:created', path: string, parentId?: string }
  | { type: 'file:removed', path: string }
  | { type: 'file:renamed', oldPath: string, newPath: string }
  | { type: 'file:modified', path: string }
  | { type: 'directory:created', path: string, parentId?: string }
  | { type: 'directory:removed', path: string }
  | { type: 'directory:renamed', oldPath: string, newPath: string }
  | { type: 'directory:modified', path: string }

/**
 * 文件系统事件总线 Key
 */
const fileSystemEventKey: EventBusKey<FileSystemEvent> = Symbol('file-system')

/**
 * 类型安全的事件总线
 */
const fileSystemEventBus = useEventBus(fileSystemEventKey)

/**
 * Handler 和包装函数的映射关系
 * 用于支持通过原始 handler 取消订阅
 */
const handlerMap = new WeakMap<
  (event: FileSystemEvent) => void,
  (event: FileSystemEvent) => void
>()

/**
 * 文件系统事件组合函数
 * 提供类型安全的事件发布和订阅
 */
export function useFileSystemEvents() {
  return {
    /**
     * 发布文件系统事件
     */
    emit: (event: FileSystemEvent) => {
      fileSystemEventBus.emit(event)
    },

    /**
     * 订阅文件系统事件
     * @param eventType 事件类型
     * @param handler 事件处理函数
     * @returns 取消订阅的函数
     */
    on: <T extends FileSystemEvent['type']>(
      eventType: T,
      handler: (event: Extract<FileSystemEvent, { type: T }>) => void,
    ) => {
      const wrappedHandler = (event: FileSystemEvent) => {
        if (event.type === eventType) {
          handler(event as Extract<FileSystemEvent, { type: T }>)
        }
      }

      handlerMap.set(handler as (event: FileSystemEvent) => void, wrappedHandler)

      const unsubscribe = fileSystemEventBus.on(wrappedHandler)

      return () => {
        unsubscribe()
        handlerMap.delete(handler as (event: FileSystemEvent) => void)
      }
    },

    /**
     * 取消订阅
     * @param handler 要取消订阅的事件处理函数
     */
    off: (handler: (event: FileSystemEvent) => void) => {
      const wrappedHandler = handlerMap.get(handler)
      if (wrappedHandler) {
        fileSystemEventBus.off(wrappedHandler)
        handlerMap.delete(handler)
      }
    },

    /**
     * 清除所有监听器
     */
    reset: () => {
      fileSystemEventBus.reset()
    },
  }
}
