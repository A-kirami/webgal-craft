import { injectDialogRootContext } from 'reka-ui'

/**
 * 对话框内容元素，供需要按「整个浮层表面」注册焦点上下文的宿主使用（抽屉、模态框）。
 *
 * reka 在 DialogContent 挂载提交之后才把内容元素写回 DialogRoot 上下文，且这次属性替换本身不触发响应式：
 * 打开/关闭信号到达时读到的仍是挂载前的值，只读一次会把 undefined 永久缓存住（宿主先挂载、后打开时必然命中）。
 * 因此统一以 open 为信号，等本次提交结束后再同步。
 */
export function useDialogContentElement() {
  const rootContext = injectDialogRootContext()
  const contentElement = shallowRef<HTMLElement>()

  function syncContentElement(): void {
    const element = rootContext.contentElement.value
    contentElement.value = element instanceof HTMLElement ? element : undefined
  }

  function scheduleContentElementSync(): void {
    void nextTick(syncContentElement)
  }

  watch(() => rootContext.open.value, scheduleContentElementSync)
  onMounted(scheduleContentElementSync)

  return contentElement
}
