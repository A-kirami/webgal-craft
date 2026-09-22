interface PopoverTriggerHandle {
  $el?: HTMLElement
}

/**
 * 组合框触发器的打开状态与交互意图。
 *
 * 关联 label 只把 click 转发到控件，不在控件上产生指针或键盘事件；据此区分“直接操作控件”与“标签激活”，
 * 让 label 激活只聚焦控件，与 Select 的触发器保持一致。
 */
export function useComboboxTrigger() {
  const open = ref(false)
  const triggerElementRef = useTemplateRef<PopoverTriggerHandle>('triggerElementRef')
  // Blink 会把关联 label 的 :hover 一并作用到触发器上；只有指针真正进入触发器时才保留悬停反馈。
  const isTriggerHovered = ref(false)
  let hasOpenIntent = false

  function handleTriggerPointerDown(event: PointerEvent) {
    // 右键、中键分别触发 contextmenu/auxclick，不产生 click，不能算作打开意图
    if (event.button !== 0) {
      return
    }

    hasOpenIntent = true
  }

  function handleTriggerPointerEnter(event: PointerEvent) {
    isTriggerHovered.value = true

    // 按住主按钮移回触发器：pointerdown 发生在这里，此时释放仍会点击触发器
    if ((event.buttons & 1) !== 0) {
      hasOpenIntent = true
    }
  }

  function handleTriggerPointerLeave(event: PointerEvent) {
    isTriggerHovered.value = false

    // 只在按住指针拖出时清除：抬起后的 pointerleave（如触摸）先于 click 分发，清除会让点击失效
    if (event.buttons !== 0) {
      hasOpenIntent = false
    }
  }

  // 指针流被取消（如触摸滚动）后不会再产生 click，清除意图避免残留到后续的标签激活
  function handleTriggerPointerCancel() {
    hasOpenIntent = false
  }

  function handleTriggerKeydown(event: KeyboardEvent) {
    if (event.key === 'Enter' || event.key === ' ') {
      hasOpenIntent = true
      return
    }

    // 与 Select 一致：方向键在触发器上直接展开候选面板
    if ((event.key === 'ArrowDown' || event.key === 'ArrowUp') && !open.value) {
      event.preventDefault()
      open.value = true
    }
  }

  function handleOpenChange(nextOpen: boolean) {
    if (nextOpen && !hasOpenIntent) {
      return
    }

    hasOpenIntent = false
    open.value = nextOpen
  }

  // 选中选项、按 Escape 属于浮层内部关闭：把焦点还给触发器；点击外部关闭时保留用户的新焦点。
  function closeWithTriggerFocus() {
    open.value = false
    void nextTick(() => triggerElementRef.value?.$el?.focus())
  }

  return {
    closeWithTriggerFocus,
    handleOpenChange,
    handleTriggerKeydown,
    handleTriggerPointerCancel,
    handleTriggerPointerDown,
    handleTriggerPointerEnter,
    handleTriggerPointerLeave,
    isTriggerHovered,
    open,
    triggerElementRef,
  }
}
