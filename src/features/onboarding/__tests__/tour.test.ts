import { describe, expect, it, vi } from 'vitest'

import { createTourConfig, createTourLabels, TOUR_POPOVER_CLASS } from '../tour'

import type { Config, DriveStep, PopoverDOM } from 'driver.js'
import type { I18nT } from '~/utils/i18n-like'

const LABELS = {
  done: '完成',
  next: '下一步',
  previous: '上一步',
  skip: '跳过',
}

type PopoverRenderHook = NonNullable<Config['onPopoverRender']>

function renderPopover(config: Config): PopoverDOM {
  const popover = {
    closeButton: {
      setAttribute: vi.fn(),
      textContent: '',
    },
    wrapper: {
      append: vi.fn(),
      focus: vi.fn(),
      tabIndex: 0,
    },
  } as unknown as PopoverDOM

  config.onPopoverRender?.(popover, {} as Parameters<PopoverRenderHook>[1])
  return popover
}

describe('createTourLabels', () => {
  it('从 tour.common 命名空间取导航文案', () => {
    const echoT = ((key: string) => key) as unknown as I18nT

    expect(createTourLabels(echoT)).toEqual({
      done: 'tour.common.done',
      next: 'tour.common.next',
      previous: 'tour.common.prev',
      skip: 'tour.common.skip',
    })
  })
})

describe('createTourConfig', () => {
  it('把导航按钮文案替换为当前语言', () => {
    const config = createTourConfig({ labels: LABELS, steps: [] })

    expect(config.doneBtnText).toBe('完成')
    expect(config.nextBtnText).toBe('下一步')
    expect(config.prevBtnText).toBe('上一步')
  })

  it('缺少目标元素的步骤等待后就跳过，不会卡住引导', () => {
    const steps: DriveStep[] = [{ element: '[data-tour="missing"]' }]
    const config = createTourConfig({ labels: LABELS, steps })

    expect(config.skipMissingElement).toBe(true)
    expect(config.waitForElement).toBeGreaterThan(0)
    expect(config.steps).toBe(steps)
  })

  it('使用与 tour.css 约定一致的弹窗类名并保留上一步、关闭按钮', () => {
    const config = createTourConfig({ labels: LABELS, steps: [] })

    expect(config.popoverClass).toBe(TOUR_POPOVER_CLASS)
    expect(config.showButtons).toEqual(['next', 'previous', 'close'])
  })

  it('把关闭按钮改写成跳过文案', () => {
    const popover = renderPopover(createTourConfig({ labels: LABELS, steps: [] }))

    expect(popover.closeButton.textContent).toBe('跳过')
    expect(popover.closeButton.setAttribute).toHaveBeenCalledWith('aria-label', '跳过')
  })

  it('把关闭按钮移到弹窗末尾，并把焦点交给 dialog 容器而不是跳过按钮', async () => {
    const popover = renderPopover(createTourConfig({ labels: LABELS, steps: [] }))

    expect(popover.wrapper.append).toHaveBeenCalledWith(popover.closeButton)
    // driver.js 在渲染钩子之后才聚焦，所以这里要等微任务
    expect(popover.wrapper.focus).not.toHaveBeenCalled()

    await Promise.resolve()

    expect(popover.wrapper.tabIndex).toBe(-1)
    expect(popover.wrapper.focus).toHaveBeenCalledTimes(1)
  })

  it('透传引导结束回调', () => {
    const onDestroyed = vi.fn()
    const config = createTourConfig({ labels: LABELS, onDestroyed, steps: [] })

    expect(config.onDestroyed).toBe(onDestroyed)
  })

  it('吃掉遮罩点击，引导只能从卡片上的出口结束', () => {
    const config = createTourConfig({ labels: LABELS, steps: [] })

    // driver.js 只在 overlayClickBehavior 为 'close' 或 'nextStep' 时结束/推进引导
    expect(config.overlayClickBehavior).toBeTypeOf('function')
    expect(config.showButtons).toContain('close')
  })

  it('默认屏蔽高亮区域的交互，防止引导中误触真实操作', () => {
    const config = createTourConfig({ labels: LABELS, steps: [] })

    expect(config.disableActiveInteraction).toBe(true)
  })

  it('overrides 展开在共享配置之后，可覆盖非遮罩类默认值', () => {
    const config = createTourConfig({ labels: LABELS, overrides: { stagePadding: 20 }, steps: [] })

    expect(config.stagePadding).toBe(20)
  })
})
