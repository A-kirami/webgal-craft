import { nextTick } from 'vue'

import type { Component } from 'vue'

/** reka 弹窗家族：需要验证真实关闭路径时，这些组件不能留在 stub 里 */
const DIALOG_COMPONENT_NAMES = new Set([
  'Dialog',
  'DialogClose',
  'DialogContent',
  'DialogDescription',
  'DialogFooter',
  'DialogHeader',
  'DialogTitle',
])

/**
 * 从 stub 表里摘掉弹窗组件，让 `Dialog` / `DialogContent` 走真实实现。
 * 关闭行为（Escape、点击遮罩）由 reka 的 DismissableLayer 驱动，
 * 只有真实组件才能覆盖到这条路径。
 */
export function withRealDialogStubs(stubs: Record<string, Component>): Record<string, Component> {
  return Object.fromEntries(
    Object.entries(stubs).filter(([name]) => !DIALOG_COMPONENT_NAMES.has(name)),
  )
}

/**
 * 触发「点击弹窗外部」。
 * 弹窗打开期间 body 的 `pointer-events` 被关闭，真实点击到不了遮罩元素，
 * 这里直接向 body 派发 `pointerdown`，命中与点击遮罩相同的 outside 关闭路径。
 */
export async function clickOutsideDialog(): Promise<void> {
  document.body.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }))
  await nextTick()
}
