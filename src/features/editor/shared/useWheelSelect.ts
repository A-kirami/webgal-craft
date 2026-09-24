import { useEditSettingsStore } from '~/stores/edit-settings'

import { resolveWheelNotches, resolveWheelSelectValue } from './wheel-select'

/** 两次滚轮事件间隔超过该值视为新的一次滚动，丢弃不足一格的累计量。 */
const WHEEL_ACCUMULATION_RESET_MS = 200

interface UseWheelSelectOptions {
  /** 候选值顺序，滚轮按该顺序切换。 */
  getOptionValues: () => readonly string[]
  getValue: () => string
  onChange: (value: string) => void
}

/**
 * 选择器聚焦后，光标悬停其上滚动滚轮切换候选项。
 *
 * 事件绑定在选择器触发器上，事件触发即表示光标悬停；未聚焦、未开启或已禁用时不拦截滚轮，由外层容器正常滚动。
 * 一旦生效，滚轮归控件所有：不足一格的累计量与到达端点的滚动都不会落到外层容器。
 */
export function useWheelSelect(options: UseWheelSelectOptions) {
  const editSettingsStore = useEditSettingsStore()
  let accumulatedNotches = 0
  let lastWheelTimestamp = 0

  function handleWheelSelect(event: WheelEvent) {
    if (!editSettingsStore.enableWheelSelect) {
      return
    }

    const trigger = event.currentTarget
    if (!(trigger instanceof HTMLElement) || !canTriggerRespondToWheel(trigger)) {
      return
    }

    const notches = resolveWheelNotches(event)
    if (notches === 0) {
      return
    }

    event.preventDefault()

    if (event.timeStamp - lastWheelTimestamp > WHEEL_ACCUMULATION_RESET_MS) {
      accumulatedNotches = 0
    }
    lastWheelTimestamp = event.timeStamp
    accumulatedNotches += notches

    // 一次事件可能携带多格滚轮量，必须全部消费，否则余量会逆转后续滚动的方向
    const stepCount = Math.trunc(accumulatedNotches)
    if (stepCount === 0) {
      return
    }

    accumulatedNotches -= stepCount
    const optionValues = options.getOptionValues()
    const currentValue = options.getValue()
    const direction = stepCount > 0 ? 1 : -1
    let nextValue = currentValue
    for (let step = 0; step < Math.abs(stepCount); step++) {
      const steppedValue = resolveWheelSelectValue(optionValues, nextValue, direction)
      if (steppedValue === undefined) {
        break
      }
      nextValue = steppedValue
    }

    if (nextValue !== currentValue) {
      options.onChange(nextValue)
    }
  }

  return { handleWheelSelect }
}

function canTriggerRespondToWheel(trigger: HTMLElement): boolean {
  if (trigger instanceof HTMLButtonElement && trigger.disabled) {
    return false
  }

  const activeElement = trigger.ownerDocument.activeElement
  return activeElement !== null && trigger.contains(activeElement)
}
