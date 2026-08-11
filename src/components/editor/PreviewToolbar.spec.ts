import { describe, expect, it } from 'vitest'
import { page, userEvent } from 'vitest/browser'
import { defineComponent, nextTick } from 'vue'

import { createBrowserLiteI18n } from '~/__tests__/browser'
import { renderInBrowser } from '~/__tests__/browser-render'
import { usePreferenceStore } from '~/stores/preference'
// @unocss-safelist p-3 w-48 relative flex inline-flex w-full items-center h-1.25 grow block size-3.5 size-4 size-6
import 'virtual:uno.css'

import PreviewToolbar from './PreviewToolbar.vue'

const passThroughStub = defineComponent({
  inheritAttrs: false,
  setup(_, { slots }) {
    return () => slots.default?.()
  },
})
const emptyStub = defineComponent(() => () => undefined)
const globalStubs = {
  Tooltip: passThroughStub,
  TooltipContent: emptyStub,
  TooltipProvider: passThroughStub,
  TooltipTrigger: passThroughStub,
}

function renderToolbar(connectionStatus: 'connecting' | 'connected' | 'failed' = 'connecting') {
  return renderInBrowser(PreviewToolbar, {
    props: {
      connectionStatus,
      previewAvailable: true,
    },
    global: {
      plugins: [createBrowserLiteI18n()],
      stubs: globalStubs,
    },
  })
}

function getSliderTrack(testId: string) {
  const sliderTrack = page.getByTestId(testId).element().querySelector<HTMLElement>(':scope > [data-orientation="horizontal"]')
  expect(sliderTrack).not.toBeNull()
  return page.elementLocator(sliderTrack!)
}

function getSliderThumb(testId: string) {
  const sliderThumb = page.getByTestId(testId).element().querySelector<HTMLElement>('[role="slider"]')
  expect(sliderThumb).not.toBeNull()
  return page.elementLocator(sliderThumb!)
}

function clickWithoutPointerMovement(element: HTMLElement | SVGElement): void {
  element.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }))
}

describe('PreviewToolbar', () => {
  it('显示预览标题和连接状态', async () => {
    renderToolbar('connected')

    await expect.element(page.getByRole('heading', { name: 'edit.previewPanel.preview' })).toBeVisible()
    await expect.element(page.getByTestId('preview-connection-status')).toHaveAttribute('data-status', 'connected')
  })

  it('窄面板中连接状态不会与操作按钮重叠', async () => {
    renderToolbar('connected')
    const toolbar = page.getByTestId('preview-toolbar').element()
    toolbar.style.width = '180px'
    await nextTick()

    const statusRect = page.getByTestId('preview-connection-status').element().getBoundingClientRect()
    const actionsRect = page.getByTestId('preview-toolbar-actions').element().getBoundingClientRect()
    expect(statusRect.right).toBeLessThanOrEqual(actionsRect.left)
  })

  it('显示带波动圆点的连接中状态', async () => {
    renderToolbar()

    await expect.element(page.getByTestId('preview-connection-status')).toHaveAttribute('data-status', 'connecting')
    await expect.element(page.getByText('edit.previewPanel.connecting')).toBeVisible()
    expect(document.querySelector('[role="status"] .animate-ping')).not.toBeNull()
  })

  it('点击音量和亮度按钮切换对应偏好', async () => {
    const rendered = renderToolbar('connected')
    const preferenceStore = usePreferenceStore(rendered.pinia)

    preferenceStore.previewVolume = [0]
    await nextTick()
    await expect.element(page.getByTestId('preview-volume-zero-icon')).toBeVisible()

    await page.getByRole('button', { name: 'edit.previewPanel.mute' }).click()
    await page.getByRole('button', { name: 'edit.previewPanel.disableBrightness' }).click()

    expect(preferenceStore.previewMuted).toBe(true)
    expect(preferenceStore.previewBrightnessEnabled).toBe(false)
    await expect.element(page.getByRole('button', { name: 'edit.previewPanel.unmute' })).toBeVisible()
    await expect.element(page.getByRole('button', { name: 'edit.previewPanel.enableBrightness' })).toBeVisible()
    await expect.element(page.getByTestId('preview-volume-muted-icon')).toBeVisible()
    await expect.element(page.getByTestId('preview-volume-zero-icon')).not.toBeInTheDocument()
  })

  it('通过键盘打开音量和亮度浮层时将焦点移到对应滑块', async () => {
    const rendered = renderToolbar('connected')
    const preferenceStore = usePreferenceStore(rendered.pinia)

    preferenceStore.previewMuted = true
    preferenceStore.previewBrightnessEnabled = false
    await nextTick()

    const volumeButton = page.getByRole('button', { name: 'edit.previewPanel.unmute' })
    volumeButton.element().focus()
    await userEvent.keyboard('{Enter}')
    await expect.element(getSliderThumb('preview-volume-slider')).toHaveFocus()

    await userEvent.keyboard('{Escape}')
    await expect.element(page.getByText('edit.previewPanel.volume', { exact: true })).not.toBeInTheDocument()

    const brightnessButton = page.getByRole('button', { name: 'edit.previewPanel.enableBrightness' })
    brightnessButton.element().focus()
    await userEvent.keyboard('{Enter}')
    await expect.element(getSliderThumb('preview-brightness-slider')).toHaveFocus()
  })

  it('关闭音量或亮度后 hover 不显示控制浮层', async () => {
    renderToolbar('connected')
    const muteButton = page.getByRole('button', { name: 'edit.previewPanel.mute' })
    const volumeLabel = page.getByText('edit.previewPanel.volume', { exact: true })
    const brightnessButton = page.getByRole('button', { name: 'edit.previewPanel.disableBrightness' })
    const brightnessLabel = page.getByText('edit.previewPanel.brightness', { exact: true })

    await muteButton.hover()
    await expect.element(volumeLabel).toBeVisible()
    await muteButton.click()
    await expect.element(volumeLabel).not.toBeInTheDocument()

    await page.getByTestId('preview-connection-status').hover()
    await page.getByRole('button', { name: 'edit.previewPanel.unmute' }).hover()
    await expect.element(volumeLabel).not.toBeInTheDocument()

    await brightnessButton.hover()
    await expect.element(brightnessLabel).toBeVisible()
    await brightnessButton.click()
    await expect.element(brightnessLabel).not.toBeInTheDocument()

    await page.getByTestId('preview-connection-status').hover()
    await page.getByRole('button', { name: 'edit.previewPanel.enableBrightness' }).hover()
    await expect.element(brightnessLabel).not.toBeInTheDocument()
  })

  it('原地关闭再开启音量或亮度后重新显示控制浮层', async () => {
    const rendered = renderToolbar('connected')
    const preferenceStore = usePreferenceStore(rendered.pinia)
    const muteButton = page.getByRole('button', { name: 'edit.previewPanel.mute' })
    const volumeLabel = page.getByText('edit.previewPanel.volume', { exact: true })
    const brightnessButton = page.getByRole('button', { name: 'edit.previewPanel.disableBrightness' })
    const brightnessLabel = page.getByText('edit.previewPanel.brightness', { exact: true })

    preferenceStore.previewVolume = [25]
    preferenceStore.previewBrightness = [65]
    await nextTick()

    await muteButton.hover()
    await expect.element(volumeLabel).toBeVisible()
    clickWithoutPointerMovement(muteButton.element())
    await expect.element(volumeLabel).not.toBeInTheDocument()

    clickWithoutPointerMovement(page.getByRole('button', { name: 'edit.previewPanel.unmute' }).element())

    expect(preferenceStore.previewVolume).toEqual([25])
    await expect.element(volumeLabel).toBeVisible()

    await brightnessButton.hover()
    await expect.element(brightnessLabel).toBeVisible()
    clickWithoutPointerMovement(brightnessButton.element())
    await expect.element(brightnessLabel).not.toBeInTheDocument()

    clickWithoutPointerMovement(page.getByRole('button', { name: 'edit.previewPanel.enableBrightness' }).element())

    expect(preferenceStore.previewBrightness).toEqual([65])
    await expect.element(brightnessLabel).toBeVisible()
    await page.getByTestId('preview-connection-status').hover()
    await expect.element(brightnessLabel).not.toBeInTheDocument()
  })

  it('原地重新开启后操作音量或亮度滑块保持控制浮层打开', async () => {
    const rendered = renderToolbar('connected')
    const preferenceStore = usePreferenceStore(rendered.pinia)
    const muteButton = page.getByRole('button', { name: 'edit.previewPanel.mute' })
    const volumeLabel = page.getByText('edit.previewPanel.volume', { exact: true })
    const brightnessButton = page.getByRole('button', { name: 'edit.previewPanel.disableBrightness' })
    const brightnessLabel = page.getByText('edit.previewPanel.brightness', { exact: true })

    preferenceStore.previewVolume = [25]
    preferenceStore.previewBrightness = [75]
    await nextTick()

    await muteButton.hover()
    await expect.element(volumeLabel).toBeVisible()
    clickWithoutPointerMovement(muteButton.element())
    await nextTick()
    clickWithoutPointerMovement(page.getByRole('button', { name: 'edit.previewPanel.unmute' }).element())
    await expect.element(volumeLabel).toBeVisible()

    const volumeTrack = getSliderTrack('preview-volume-slider')
    await volumeLabel.hover()
    await expect.element(volumeLabel).toBeVisible()
    await volumeTrack.click()

    expect(preferenceStore.previewVolume[0]).not.toBe(25)
    await expect.element(volumeLabel).toBeVisible()

    await brightnessButton.hover()
    await expect.element(brightnessLabel).toBeVisible()
    clickWithoutPointerMovement(brightnessButton.element())
    await nextTick()
    clickWithoutPointerMovement(page.getByRole('button', { name: 'edit.previewPanel.enableBrightness' }).element())
    await expect.element(brightnessLabel).toBeVisible()

    const brightnessTrack = getSliderTrack('preview-brightness-slider')
    await brightnessLabel.hover()
    await brightnessTrack.click()

    expect(preferenceStore.previewBrightness[0]).not.toBe(75)
    await expect.element(brightnessLabel).toBeVisible()
    await page.getByTestId('preview-connection-status').hover()
    await expect.element(brightnessLabel).not.toBeInTheDocument()
  })

  it('显示当前音量和亮度百分比', async () => {
    const rendered = renderToolbar('connected')
    const preferenceStore = usePreferenceStore(rendered.pinia)

    preferenceStore.previewVolume = [44]
    preferenceStore.previewBrightness = [70]
    await nextTick()

    await page.getByRole('button', { name: 'edit.previewPanel.mute' }).hover()
    await expect.element(page.getByText('44%')).toBeVisible()
    await page.getByRole('button', { name: 'edit.previewPanel.disableBrightness' }).hover()
    await expect.element(page.getByText('70%')).toBeVisible()
  })

  it('从亮度切换到音量时立即关闭亮度浮层并停止命中', async () => {
    renderToolbar('connected')
    const brightnessLabel = page.getByText('edit.previewPanel.brightness', { exact: true })
    const volumeLabel = page.getByText('edit.previewPanel.volume', { exact: true })

    await page.getByRole('button', { name: 'edit.previewPanel.disableBrightness' }).hover()
    await expect.element(brightnessLabel).toBeVisible()
    const brightnessContent = brightnessLabel.element().closest<HTMLElement>('[data-state]')
    expect(brightnessContent).not.toBeNull()

    page.getByRole('button', { name: 'edit.previewPanel.mute' }).element().dispatchEvent(
      new PointerEvent('pointerenter'),
    )
    await nextTick()

    await expect.element(volumeLabel).toBeVisible()
    if (brightnessContent!.isConnected) {
      expect(brightnessContent).toHaveAttribute('data-state', 'closed')
      expect(getComputedStyle(brightnessContent!).pointerEvents).toBe('none')
    }
  })
})
