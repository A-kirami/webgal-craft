import { describe, expect, it, vi } from 'vitest'
import { page } from 'vitest/browser'

import {
  createBrowserClickStub,
  createBrowserContainerStub,
  createBrowserInputStub,
  createBrowserValueStub,
  renderInBrowser,
} from '~/__tests__/browser-render'

import EffectDraftCategorySection from './EffectDraftCategorySection.vue'

import type { EffectDraftCategoryControls } from './effectDraftForm.types'

function createControls() {
  const clearPaths = vi.fn()
  const canClearPaths = vi.fn((paths: readonly string[]) => {
    const key = paths.join('|')
    return key === 'position.x'
      || key === 'alpha'
      || key === 'scale.x|scale.y'
      || key === 'colorRed|colorGreen|colorBlue'
  })

  const controls = {
    numberInputId: (path: string) => `number-${path}`,
    sliderInputId: (path: string) => `slider-${path}`,
    dialInputId: (path: string) => `dial-${path}`,
    colorControlId: () => 'color-control',
    segmentedControlId: (path: string) => `segmented-${path}`,
    getFieldValue: () => '',
    getNumberValue: () => 1,
    updateNumberField: vi.fn(),
    canScrubNumber: () => false,
    handleNumberLabelPointerDown: vi.fn(),
    getSliderTrackValue: () => [1],
    getSliderInputValue: () => '1',
    updateSliderField: vi.fn(),
    flushSliderField: vi.fn(),
    isLinkedSliderLocked: () => true,
    toggleLinkedSliderLock: vi.fn(),
    getLinkedSliderLabel: () => 'Scale',
    getAxisCompactLabel: (path: string) => path.endsWith('.x') ? 'X' : 'Y',
    getLinkedSliderInputAriaLabel: (_param: unknown, index: 0 | 1) => `Scale ${index === 0 ? 'X' : 'Y'}`,
    getLinkedSliderInputValue: () => '1',
    updateLinkedSliderField: vi.fn(),
    flushLinkedSliderField: vi.fn(),
    getDialDegree: () => 0,
    getDialIndicatorDegree: () => 0,
    getDialInputValue: () => '0',
    updateDialField: vi.fn(),
    flushDialField: vi.fn(),
    handleDialPointerDown: vi.fn(),
    getColorPickerValue: () => ({ b: 255, g: 255, r: 255 }),
    handleColorPickerPointerDown: vi.fn(),
    handleColorPickerChange: vi.fn(),
    getSegmentedValue: () => '__unspecified__',
    getSegmentedOptions: () => [],
    updateSegmentedField: vi.fn(),
    canClearPaths,
    clearPaths,
    getClearPropertyLabel: (label: string | undefined) => `清除 ${label ?? ''}`.trim(),
  } as EffectDraftCategoryControls

  return {
    controls,
    canClearPaths,
    clearPaths,
  }
}

const globalStubs = {
  Button: createBrowserClickStub('StubButton'),
  ColorPicker: createBrowserValueStub('StubColorPicker'),
  Input: createBrowserInputStub('StubInput'),
  Label: createBrowserContainerStub('StubLabel', 'label'),
  SegmentedControl: createBrowserValueStub('StubSegmentedControl'),
  Slider: createBrowserValueStub('StubSlider'),
}

describe('EffectDraftCategorySection', () => {
  it('只允许可清除字段交互，并将不同控件映射到正确的路径组', async () => {
    const { controls, canClearPaths, clearPaths } = createControls()

    renderInBrowser(EffectDraftCategorySection, {
      props: {
        category: {
          key: 'transform',
          label: 'Transform',
          items: [
            {
              kind: 'position',
              key: 'position',
              params: [
                { key: 'position.x', type: 'number', label: 'Position X', defaultValue: 0 },
                { key: 'position.y', type: 'number', label: 'Position Y', defaultValue: 0 },
              ],
            },
            {
              kind: 'slider',
              key: 'alpha',
              param: { key: 'alpha', type: 'number', label: 'Alpha', min: 0, max: 1, step: 0.01, defaultValue: 1 },
            },
            {
              kind: 'linked-slider',
              key: 'scale',
              param: {
                key: 'scale.x',
                linkedPairKey: 'scale.y',
                type: 'number',
                label: 'Scale X',
                linkedGroupLabel: 'Scale',
                min: 0,
                max: 2,
                step: 0.01,
                defaultValue: 1,
              },
            },
            {
              kind: 'color',
              key: 'tint',
              param: {
                key: 'color',
                type: 'color',
                label: 'Tint',
                colorPaths: ['colorRed', 'colorGreen', 'colorBlue'],
                colorDefaults: [255, 255, 255],
              },
            },
            {
              kind: 'choice',
              key: 'oldFilm',
              param: {
                key: 'oldFilm',
                type: 'choice',
                label: 'Filter',
                variant: 'segmented',
                options: [],
              },
            },
          ],
        },
        controls,
        isPanelLayout: false,
        resolveLabel: (value: string | undefined) => String(value ?? ''),
      },
      global: {
        stubs: globalStubs,
      },
    })

    expect(canClearPaths).toHaveBeenCalledWith(['position.x'])
    expect(canClearPaths).toHaveBeenCalledWith(['position.y'])
    expect(canClearPaths).toHaveBeenCalledWith(['alpha'])
    expect(canClearPaths).toHaveBeenCalledWith(['scale.x', 'scale.y'])
    expect(canClearPaths).toHaveBeenCalledWith(['colorRed', 'colorGreen', 'colorBlue'])

    const positionYLabelText = await page.getByText('Position Y').element()
    const positionYButton = positionYLabelText.closest('label')?.parentElement?.querySelector('button')
    expect(positionYButton).not.toBeNull()
    expect(positionYButton?.className ?? '').toContain('opacity-0')
    expect(positionYButton?.className ?? '').toContain('pointer-events-none')
    expect(positionYButton?.className ?? '').toContain('transition')
    expect(positionYButton?.className ?? '').not.toContain('transition-opacity')
    expect(positionYButton?.className ?? '').toContain('duration-150')
    expect(positionYButton?.getAttribute('disabled')).toBeNull()
    expect(positionYButton?.getAttribute('aria-hidden')).toBe('true')
    expect(positionYButton?.getAttribute('tabindex')).toBe('-1')

    await expect.element(page.getByRole('button', { name: '清除 Position X' })).toBeInTheDocument()
    await expect.element(page.getByRole('button', { name: '清除 Alpha' })).toBeInTheDocument()
    await expect.element(page.getByRole('button', { name: '清除 Scale' })).toBeInTheDocument()
    await expect.element(page.getByRole('button', { name: '清除 Tint' })).toBeInTheDocument()
    await expect.element(page.getByRole('button', { name: '清除 Filter' })).not.toBeInTheDocument()

    await page.getByRole('button', { name: '清除 Position X' }).click()
    await page.getByRole('button', { name: '清除 Alpha' }).click()
    await page.getByRole('button', { name: '清除 Scale' }).click()
    await page.getByRole('button', { name: '清除 Tint' }).click()

    expect(clearPaths).toHaveBeenCalledWith(['position.x'], {
      schedule: 'immediate',
      flush: true,
    })
    expect(clearPaths).toHaveBeenCalledWith(['alpha'], {
      schedule: 'immediate',
      flush: true,
    })
    expect(clearPaths).toHaveBeenCalledWith(['scale.x', 'scale.y'], {
      schedule: 'immediate',
      flush: true,
    })
    expect(clearPaths).toHaveBeenCalledWith(['colorRed', 'colorGreen', 'colorBlue'], {
      schedule: 'immediate',
      flush: true,
    })
  })

  it('将固定宽度放在标签与按钮的公共头部容器上，让按钮贴近标签文本', async () => {
    const { controls } = createControls()

    renderInBrowser(EffectDraftCategorySection, {
      props: {
        category: {
          key: 'effects',
          label: 'Effects',
          items: [
            {
              kind: 'slider',
              key: 'alpha',
              param: { key: 'alpha', type: 'number', label: 'Alpha', min: 0, max: 1, step: 0.01, defaultValue: 1 },
            },
          ],
        },
        controls,
        isPanelLayout: false,
        resolveLabel: (value: string | undefined) => String(value ?? ''),
      },
      global: {
        stubs: globalStubs,
      },
    })

    const labelText = await page.getByText('Alpha').element()
    const label = labelText.closest('label')
    const button = await page.getByRole('button', { name: '清除 Alpha' }).element()
    const header = button.parentElement?.parentElement

    expect(label).not.toBeNull()
    expect(header).not.toBeNull()
    expect(header?.contains(label!)).toBe(true)
    expect(header?.className ?? '').toContain('w-24')
    expect(label?.className ?? '').not.toContain('w-24')
    expect(label?.className ?? '').not.toContain('flex-1')
  })

  it('位移项不应继续使用固定头部和固定输入宽度，以避免在双列网格中把输入框挤出容器', async () => {
    const { controls } = createControls()

    renderInBrowser(EffectDraftCategorySection, {
      props: {
        category: {
          key: 'transform',
          label: 'Transform',
          items: [
            {
              kind: 'position',
              key: 'position',
              params: [
                { key: 'position.x', type: 'number', label: 'Position X', defaultValue: 0 },
                { key: 'position.y', type: 'number', label: 'Position Y', defaultValue: 0 },
              ],
            },
          ],
        },
        controls,
        isPanelLayout: false,
        resolveLabel: (value: string | undefined) => String(value ?? ''),
      },
      global: {
        stubs: globalStubs,
      },
    })

    const clearButton = await page.getByRole('button', { name: '清除 Position X' }).element()
    const header = clearButton.parentElement?.parentElement
    const input = await page.getByRole('spinbutton', { name: 'Position X' }).element()

    expect(header).not.toBeNull()
    expect(header?.className ?? '').not.toContain('w-24')
    expect(input.className).toContain('flex-1')
    expect(input.className).toContain('min-w-0')
    expect(input.className).not.toContain('w-24')
  })

  it('将清除按钮与对应输入放进同一个 row 或 group 容器，以支持 focus-within 高亮', async () => {
    const { controls } = createControls()

    renderInBrowser(EffectDraftCategorySection, {
      props: {
        category: {
          key: 'effects',
          label: 'Effects',
          items: [
            {
              kind: 'slider',
              key: 'alpha',
              param: { key: 'alpha', type: 'number', label: 'Alpha', min: 0, max: 1, step: 0.01, defaultValue: 1 },
            },
            {
              kind: 'linked-slider',
              key: 'scale',
              param: {
                key: 'scale.x',
                linkedPairKey: 'scale.y',
                type: 'number',
                label: 'Scale X',
                linkedGroupLabel: 'Scale',
                min: 0,
                max: 2,
                step: 0.01,
                defaultValue: 1,
              },
            },
          ],
        },
        controls,
        isPanelLayout: false,
        resolveLabel: (value: string | undefined) => String(value ?? ''),
      },
      global: {
        stubs: globalStubs,
      },
    })

    const alphaButton = await page.getByRole('button', { name: '清除 Alpha' }).element()
    const alphaInput = await page.getByRole('spinbutton', { name: 'Alpha' }).element()
    const scaleButton = await page.getByRole('button', { name: '清除 Scale' }).element()
    const scaleInput = await page.getByRole('spinbutton', { name: 'Scale X' }).element()
    const alphaGroup = alphaButton.closest('div[class*="group/field"]')
    const scaleGroup = scaleButton.closest('div[class*="group/field"]')

    expect(alphaButton.className).toContain('group-focus-within/field:opacity-100')
    expect(scaleButton.className).toContain('group-focus-within/field:opacity-100')
    expect(alphaGroup?.contains(alphaInput)).toBe(true)
    expect(scaleGroup?.contains(scaleInput)).toBe(true)
  })
})
