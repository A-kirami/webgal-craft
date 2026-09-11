import { describe, expect, it, vi } from 'vitest'
import { page, userEvent } from 'vitest/browser'

import { renderInBrowser } from '~/__tests__/browser-render'
import { useShortcutContextRegistry } from '~/features/editor/shortcut/shortcut-context-registry'
import { useShortcutContext } from '~/features/editor/shortcut/useShortcutContext'
import enMessages from '~/locales/en.yml'
import { usePreferenceStore } from '~/stores/preference'

import ColorPicker from './ColorPicker.vue'

// 浏览器测试环境 uno.css 不含按需工具类（HMR 不生效），可见性相关的类必须 safelist
// @unocss-safelist inline-flex h-6 w-11 w-12 w-24 w-40 w-56 min-w-7 min-w-14 p-2px h-full w-full w-auto h-36 h-3 size-4 size-4.5 size-5 size-8 aspect-square shrink-0 grow items-center justify-center flex flex-col grid grid-cols-9 gap-1 gap-1.5 gap-2 gap-2.5 gap-3 relative block overflow-hidden flex-1 min-w-0 text-xs self-stretch p-0 p-0.5 gap-0.5 px-1 px-1.5 py-0 pr-0.5 w-8 text-right text-center font-mono w-px h-px bg-border border-l border-border h-auto -my-0.5 flex-none w-fit w-16 max-w-24 field-sizing-content supports-[field-sizing:content]:w-auto supports-[field-sizing:content]:field-sizing-content
import 'virtual:uno.css'

interface HarnessOptions {
  disableAlpha?: boolean
  initialValue?: string
}

function createHarness(options: HarnessOptions = {}) {
  return defineComponent({
    components: { ColorPicker },
    setup() {
      const modelValue = ref(options.initialValue ?? '#000000')

      return {
        disableAlpha: options.disableAlpha ?? false,
        modelValue,
      }
    },
    template: `
      <div>
        <ColorPicker
          v-model="modelValue"
          :disable-alpha="disableAlpha"
          data-testid="color-picker-trigger"
        />
        <output data-testid="model-value">{{ modelValue }}</output>
      </div>
    `,
  })
}

async function openPanel() {
  await page.getByTestId('color-picker-trigger').click()
  await expect.element(page.getByTestId('color-picker-format-switch')).toBeInTheDocument()
}

function modelValueText(): string {
  return document.querySelector('[data-testid="model-value"]')?.textContent ?? ''
}

/** 焦点移出字段（失焦） */
async function blurField() {
  await userEvent.keyboard('{Tab}')
}

/** 按住 Shift 点击：userEvent 不支持修饰键，直接派发原生 click */
function shiftClick(element: Element) {
  element.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, shiftKey: true }))
}

/**
 * 断言输入框宽度贴合文本：放得下，余量也不超过一个档位（8px）。
 * 文本宽度按元素实际字体测量，不依赖测试环境的字体；声明了 min-width 时下限由它决定（更窄的文本不再收缩）。
 */
function expectFieldFitsText(field: HTMLInputElement, text: string) {
  const style = getComputedStyle(field)
  const chrome = (['paddingLeft', 'paddingRight', 'borderLeftWidth', 'borderRightWidth'] as const)
    .reduce((sum, prop) => sum + Number.parseFloat(style[prop]), 0)
  const context = document.createElement('canvas').getContext('2d')!
  context.font = style.font
  const textWidth = context.measureText(text).width
  // 'auto' 解析为 NaN，按无下限处理
  const minWidth = Number.parseFloat(style.minWidth) || 0
  const expectedWidth = Math.max(textWidth + chrome, minWidth)
  const width = field.getBoundingClientRect().width

  // 下界留 0.5px 舍入余量：fit 宽度是文本宽度加内边距，被 min-width 顶住时等于 min-width
  expect(width).toBeGreaterThanOrEqual(expectedWidth - 0.5)
  expect(width).toBeLessThanOrEqual(expectedWidth + 8)
}

interface ScrubModifiers {
  altKey?: boolean
  shiftKey?: boolean
}

function dispatchPointerEvent(
  element: Element,
  type: string,
  options: ScrubModifiers & { clientX: number, pointerId: number },
): void {
  element.dispatchEvent(new PointerEvent(type, {
    altKey: options.altKey ?? false,
    bubbles: true,
    button: 0,
    buttons: type === 'pointerup' ? 0 : 1,
    clientX: options.clientX,
    clientY: 0,
    isPrimary: true,
    pointerId: options.pointerId,
    shiftKey: options.shiftKey ?? false,
  }))
}

/** 在透明度 % 符号上按住后水平拖拽 deltaX 像素（正值向右，透明度增大） */
function scrubAlphaPercent(testId: string, deltaX: number, modifiers: ScrubModifiers = {}): void {
  const handle = page.getByTestId(testId).element()
  const startX = 100
  const endX = startX + deltaX

  dispatchPointerEvent(handle, 'pointerdown', { clientX: startX, pointerId: 1, ...modifiers })
  dispatchPointerEvent(handle, 'pointermove', { clientX: endX, pointerId: 1, ...modifiers })
  dispatchPointerEvent(handle, 'pointerup', { clientX: endX, pointerId: 1, ...modifiers })
}

describe('ColorPicker', () => {
  it('触发器显示色块与可直接编辑的色值/透明度输入框', async () => {
    renderInBrowser(createHarness({ initialValue: '#56d799' }))

    const trigger = page.getByTestId('color-picker-trigger')
    await expect.element(trigger).toBeInTheDocument()
    const swatch = trigger.element().querySelector<HTMLElement>('[role="presentation"]')
    expect(swatch?.style.getPropertyValue('--swatch-base')).toBe('#56d799')

    await expect.element(page.getByTestId('color-picker-hex-field')).toHaveValue('56D799')
    await expect.element(page.getByTestId('color-picker-row-alpha-field')).toHaveValue(100)
  })

  it('半透明颜色在触发器显示 6 位裸 hex 与透明度', async () => {
    renderInBrowser(createHarness({ initialValue: 'rgba(86, 215, 153, 0.5)' }))

    await expect.element(page.getByTestId('color-picker-hex-field')).toHaveValue('56D799')
    await expect.element(page.getByTestId('color-picker-row-alpha-field')).toHaveValue(50)
  })

  it('在触发器 hex 字段提交会保留当前透明度', async () => {
    renderInBrowser(createHarness({ initialValue: 'rgba(86, 215, 153, 0.5)' }))

    await page.getByTestId('color-picker-hex-field').fill('#00ff00')
    await userEvent.keyboard('{Enter}')

    await expect.element(page.getByTestId('model-value')).toHaveTextContent('#00FF0080')
  })

  it('空值下在触发器 hex 字段粘贴 8 位 hex 会采用其中的透明度', async () => {
    renderInBrowser(createHarness({ initialValue: '' }))

    await page.getByTestId('color-picker-hex-field').fill('#66ccff80')
    await userEvent.keyboard('{Enter}')

    await expect.element(page.getByTestId('model-value')).toHaveTextContent('#66CCFF80')
    await expect.element(page.getByTestId('color-picker-row-alpha-field')).toHaveValue(50)
  })

  it.each([
    { label: 'rgba 串', input: 'rgba(102, 204, 255, 0.5)', expected: '#66CCFF80' },
    { label: 'hsla 串', input: 'hsla(210, 100%, 70%, 0.5)', expected: '#66B2FF80' },
  ])('粘贴$label时采用其中的透明度而不是当前透明度', async ({ input, expected }) => {
    renderInBrowser(createHarness({ initialValue: '#ff000033' }))

    await page.getByTestId('color-picker-hex-field').fill(input)
    await userEvent.keyboard('{Enter}')

    await expect.element(page.getByTestId('model-value')).toHaveTextContent(expected)
  })

  it('粘贴越界分量的色值时按 CSS 语义裁剪', async () => {
    renderInBrowser(createHarness({ initialValue: '#000000' }))

    await page.getByTestId('color-picker-hex-field').fill('rgb(300, 0, 0)')
    await userEvent.keyboard('{Enter}')

    await expect.element(page.getByTestId('model-value')).toHaveTextContent('#FF0000')
  })

  it('非法颜色不显示色值', async () => {
    renderInBrowser(createHarness({ initialValue: 'not-a-color' }))

    await expect.element(page.getByTestId('color-picker-hex-field')).toHaveValue('')
  })

  it.each([
    { label: '中文', locale: 'zh-Hans', placeholder: '未选择', messages: undefined },
    { label: '英文', locale: 'en', placeholder: 'Not selected', messages: { en: enMessages } },
  ])('空值时色值框留空、显示$label占位符且宽度容得下', async ({ locale, placeholder, messages }) => {
    renderInBrowser(createHarness({ initialValue: '' }), {
      browser: { i18nMode: 'localized', locale, messages },
    })

    const hexField = page.getByTestId('color-picker-hex-field')
    await expect.element(hexField).toHaveValue('')
    await expect.element(hexField).toHaveAttribute('placeholder', placeholder)

    // 占位符参与 fit 宽度，不会被截断
    expectFieldFitsText(hexField.element() as HTMLInputElement, placeholder)
  })

  it.each([
    { label: '空值', value: '' },
    { label: '无法解析的值', value: 'not-a-color' },
  ])('$label 时色块显示未设置斜线且背景保持透明', ({ value }) => {
    renderInBrowser(createHarness({ initialValue: value }))

    const swatch = page.getByTestId('color-picker-trigger').element().querySelector<HTMLElement>('[role="presentation"]')
    expect(swatch?.dataset.empty).toBe('true')

    const { backgroundColor, backgroundImage, backgroundRepeat, backgroundSize } = getComputedStyle(swatch as HTMLElement)
    // 斜线取主题 destructive 色（浅色/深色主题各一）；Chromium 把 `to bottom right` 序列化为 `to right bottom`
    expect(backgroundImage).toMatch(/^linear-gradient\(to (?:bottom right|right bottom),/)
    expect(backgroundImage).toMatch(/oklch\(0\.(577 0\.245 27\.325|704 0\.191 22\.216)\)/)
    expect(backgroundImage).not.toContain('repeating-conic-gradient')
    expect(backgroundColor).toBe('rgba(0, 0, 0, 0)')

    // 斜线层端点内缩，不顶到色块圆角
    expect(backgroundRepeat).toBe('no-repeat')
    expect(backgroundSize).toMatch(/calc\(100% - 4px\)/)
    // 带宽 0.7px（45° 下竖直投影像 1px 细线）
    expect(backgroundImage).toContain('calc(50% - 1px)')
    expect(backgroundImage).toContain('calc(50% + 1px)')
  })

  it('有颜色值时色块铺棋盘格衬底且不带斜线', () => {
    renderInBrowser(createHarness({ initialValue: 'rgba(86, 215, 153, 0.5)' }))

    const swatch = page.getByTestId('color-picker-trigger').element().querySelector<HTMLElement>('[role="presentation"]')
    expect(swatch?.dataset.empty).toBeUndefined()

    const { backgroundColor, backgroundImage } = getComputedStyle(swatch as HTMLElement)
    expect(backgroundImage).toContain('repeating-conic-gradient')
    expect(backgroundImage).not.toContain('oklch(')
    expect(backgroundColor).not.toBe('rgba(0, 0, 0, 0)')
  })

  it('在触发器色值框直接输入并提交会更新 model', async () => {
    renderInBrowser(createHarness({}))

    await page.getByTestId('color-picker-hex-field').fill('#00ff00')
    await userEvent.keyboard('{Enter}')

    await expect.element(page.getByTestId('model-value')).toHaveTextContent('#00FF00')
  })

  it('在触发器透明度框提交后 emit 8 位 hex', async () => {
    renderInBrowser(createHarness({}))

    await page.getByTestId('color-picker-row-alpha-field').fill('50')
    await userEvent.keyboard('{Enter}')

    await expect.element(page.getByTestId('model-value')).toHaveTextContent('#00000080')
  })

  it('在触发器色值框输入后失焦也会提交', async () => {
    renderInBrowser(createHarness({}))

    await page.getByTestId('color-picker-hex-field').fill('#00ff00')
    await blurField()

    await expect.element(page.getByTestId('model-value')).toHaveTextContent('#00FF00')
  })

  it('空值时触发器色值框聚焦后失焦不写入颜色', async () => {
    renderInBrowser(createHarness({ initialValue: '' }))

    await page.getByTestId('color-picker-hex-field').click()
    await blurField()

    expect(modelValueText()).toBe('')
  })

  it('空值时在色值框输入非法值后失焦不写入颜色', async () => {
    renderInBrowser(createHarness({ initialValue: '' }))

    await page.getByTestId('color-picker-hex-field').fill('#zzz')
    await blurField()

    expect(modelValueText()).toBe('')
  })

  it('空值时在色值框输入裸 hex 会写入', async () => {
    renderInBrowser(createHarness({ initialValue: '' }))

    await page.getByTestId('color-picker-hex-field').fill('000000')
    await blurField()

    await expect.element(page.getByTestId('model-value')).toHaveTextContent('#000000')
    await expect.element(page.getByTestId('color-picker-hex-field')).toHaveValue('000000')
  })

  it('空值时触发器透明度控件不可用', () => {
    renderInBrowser(createHarness({ initialValue: '' }))

    const alphaField = page.getByTestId('color-picker-row-alpha-field').element() as HTMLInputElement
    expect(alphaField.disabled).toBe(true)
    expect(alphaField.value).toBe('')
    expect(page.getByTestId('color-picker-row-alpha-scrubber').element()).toHaveAttribute('aria-disabled', 'true')
  })

  it('输入色值后触发器透明度控件恢复可用', async () => {
    renderInBrowser(createHarness({ initialValue: '' }))

    await page.getByTestId('color-picker-hex-field').fill('000000')
    await blurField()
    await expect.element(page.getByTestId('model-value')).toHaveTextContent('#000000')

    await expect.element(page.getByTestId('color-picker-row-alpha-field')).toBeEnabled()
    await page.getByTestId('color-picker-row-alpha-field').fill('50')
    await blurField()

    await expect.element(page.getByTestId('model-value')).toHaveTextContent('#00000080')
  })

  // 未提交时 model 保持调用方传入的写法：picker 只把"自己写入"的值统一为大写
  it('色值框输入非法值后失焦保留原色值', async () => {
    renderInBrowser(createHarness({ initialValue: '#00ff00' }))

    await page.getByTestId('color-picker-hex-field').fill('#zzz')
    await blurField()

    await expect.element(page.getByTestId('model-value')).toHaveTextContent('#00ff00')
    await expect.element(page.getByTestId('color-picker-hex-field')).toHaveValue('00FF00')
  })

  it('清空色值框后失焦清除颜色', async () => {
    renderInBrowser(createHarness({ initialValue: '#00ff00' }))

    await page.getByTestId('color-picker-hex-field').fill('')
    await blurField()

    expect(modelValueText()).toBe('')
    await expect.element(page.getByTestId('color-picker-hex-field')).toHaveValue('')
    // 没有颜色可修饰，透明度控件随之不可用
    expect((page.getByTestId('color-picker-row-alpha-field').element() as HTMLInputElement).disabled).toBe(true)
  })

  it('清空色值框后按 Enter 清除颜色', async () => {
    renderInBrowser(createHarness({ initialValue: '#00ff00' }))

    await page.getByTestId('color-picker-hex-field').fill('')
    await userEvent.keyboard('{Enter}')

    expect(modelValueText()).toBe('')
  })

  it('清空颜色后打开面板不会被面板的基线色写回', async () => {
    renderInBrowser(createHarness({ initialValue: '#56d799' }))

    await page.getByTestId('color-picker-hex-field').fill('')
    await blurField()
    expect(modelValueText()).toBe('')

    await openPanel()

    // 面板把空值归一成自己的取色基线（黑色），只用于取色，不代表模型值
    await expect.element(page.getByTestId('color-picker-panel-hex-field')).toHaveValue('000000')

    // 不加交互直接关闭面板不写入颜色，模型保持为空
    await userEvent.keyboard('{Escape}')
    expect(modelValueText()).toBe('')
  })

  it('色值框容忍带 # 的输入', async () => {
    renderInBrowser(createHarness({ initialValue: '' }))

    await page.getByTestId('color-picker-hex-field').fill('#ff0000')
    await blurField()

    await expect.element(page.getByTestId('model-value')).toHaveTextContent('#FF0000')
    await expect.element(page.getByTestId('color-picker-hex-field')).toHaveValue('FF0000')
  })

  it('色值框的 Home 仍是文本编辑键', async () => {
    renderInBrowser(createHarness({ initialValue: '#123456' }))

    const hexField = page.getByTestId('color-picker-hex-field')
    await hexField.click()
    await userEvent.keyboard('{Home}')
    await userEvent.keyboard('0')

    // Home 把光标移到开头，新字符插到最前而不是跳到最小值
    await expect.element(hexField).toHaveValue('0123456')
  })

  it('空值时面板色值框聚焦后失焦不写入颜色', async () => {
    renderInBrowser(createHarness({ initialValue: '' }))
    await openPanel()

    await page.getByTestId('color-picker-panel-hex-field').click()
    await blurField()

    expect(modelValueText()).toBe('')
  })

  it('空值时面板通道框聚焦后失焦不写入颜色', async () => {
    renderInBrowser(createHarness({ initialValue: '' }))
    await openPanel()
    await page.getByTestId('color-picker-format-switch').click()

    await page.getByRole('spinbutton', { exact: true, name: 'R' }).click()
    await blurField()

    expect(modelValueText()).toBe('')
  })

  it('面板通道框输入后失焦会提交', async () => {
    renderInBrowser(createHarness({ initialValue: '#000000' }))
    await openPanel()
    await page.getByTestId('color-picker-format-switch').click()

    await page.getByRole('spinbutton', { exact: true, name: 'R' }).fill('255')
    await blurField()

    await expect.element(page.getByTestId('model-value')).toHaveTextContent('#FF0000')
  })

  it('色值与透明度之间渲染分割线', async () => {
    renderInBrowser(createHarness({ initialValue: '#56d799' }))

    // 触发器没有独立的分割线元素，由透明度输入框的左边框承担
    const hexField = page.getByTestId('color-picker-hex-field').element()
    const alphaField = page.getByTestId('color-picker-row-alpha-field').element()
    expect(hexField.nextElementSibling).toBe(alphaField)

    const alphaFieldStyle = getComputedStyle(alphaField)
    expect(alphaFieldStyle.borderLeftWidth).toBe('1px')
    expect(alphaFieldStyle.borderLeftColor).not.toBe('rgba(0, 0, 0, 0)')

    // 边框跨过容器内边距（上下各 2px），与容器边框内沿齐平
    const hexBox = hexField.getBoundingClientRect()
    const alphaBox = alphaField.getBoundingClientRect()
    expect(hexBox.top - alphaBox.top).toBe(2)
    expect(alphaBox.bottom - hexBox.bottom).toBe(2)

    await openPanel()
    const panelHexField = page.getByTestId('color-picker-panel-hex-field').element()
    const panelDivider = page.getByTestId('color-picker-panel-field-divider').element()
    expect(panelHexField.nextElementSibling).toBe(panelDivider)
    expect(panelDivider.nextElementSibling).toBe(page.getByTestId('color-picker-alpha-field').element())
  })

  it('透明度输入框宽度只够容纳最大值 100', async () => {
    renderInBrowser(createHarness({ initialValue: '#26B3FF' }))

    const alphaField = page.getByTestId('color-picker-row-alpha-field').element() as HTMLInputElement
    expect(alphaField.value).toBe('100')
    expectFieldFitsText(alphaField, '100')
  })

  it('色值输入框按内容宽度收缩，胶囊不撑满容器', async () => {
    renderInBrowser(createHarness({ initialValue: '#26B3FF' }))

    const hexField = page.getByTestId('color-picker-hex-field').element() as HTMLInputElement
    const pill = document.querySelector<HTMLElement>('[data-slot="input-group"]')!

    // 贴合当前色值，不预留最长值（6 位）的空档
    expectFieldFitsText(hexField, '26B3FF')
    // 胶囊按内容收缩：色块 + 色值 + 分割线 + 透明度 + % 约 124px
    expect(pill.getBoundingClientRect().width).toBeLessThan(160)
  })

  it('从空值开始输入第一个字符时色值框不塌陷', async () => {
    renderInBrowser(createHarness({ initialValue: '' }), {
      browser: { i18nMode: 'localized', locale: 'zh-Hans' },
    })

    const hexField = page.getByTestId('color-picker-hex-field').element() as HTMLInputElement
    const emptyWidth = hexField.getBoundingClientRect().width

    await page.getByTestId('color-picker-hex-field').fill('2')

    expect(hexField.value).toBe('2')
    expect(hexField.getBoundingClientRect().width).toBeGreaterThanOrEqual(emptyWidth - 0.5)
  })

  it('disableAlpha 时触发器不渲染透明度输入框且提交会剥离透明度', async () => {
    renderInBrowser(createHarness({ disableAlpha: true, initialValue: '#56d799' }))

    await expect.element(page.getByTestId('color-picker-row-alpha-field')).not.toBeInTheDocument()

    await page.getByTestId('color-picker-hex-field').fill('#ff000080')
    await userEvent.keyboard('{Enter}')

    await expect.element(page.getByTestId('model-value')).toHaveTextContent('#FF0000')
  })

  it('打开面板渲染色板、滑条与字段', async () => {
    renderInBrowser(createHarness({}))
    await openPanel()

    // 色板 thumb + 色相滑条 thumb + 透明度滑条 thumb
    await vi.waitFor(() => {
      expect(document.querySelectorAll('[role="slider"]')).toHaveLength(3)
    })
    await expect.element(page.getByTestId('color-picker-panel-hex-field')).toBeInTheDocument()
    await expect.element(page.getByTestId('color-picker-alpha-field')).toBeInTheDocument()
  })

  it('色板 thumb 中心填充当前颜色且不含透明度', async () => {
    renderInBrowser(createHarness({ initialValue: 'rgba(86, 215, 153, 0.5)' }))
    await openPanel()

    const thumb = document.querySelector<HTMLElement>('[data-testid="color-picker-area-thumb"]')
    expect(thumb?.style.backgroundColor).toBe('rgb(86, 215, 153)')
  })

  it('透明度滑条 thumb 保持透明以透出轨道', async () => {
    renderInBrowser(createHarness({ initialValue: 'rgba(86, 215, 153, 0.5)' }))
    await openPanel()

    const thumb = document.querySelector<HTMLElement>('[data-testid="color-picker-alpha-thumb"]')
    expect(thumb?.style.backgroundColor).toBe('')
    expect(thumb?.style.backgroundImage).toBe('')
  })

  it('色相滑条 thumb 填充当前色相的纯色', async () => {
    renderInBrowser(createHarness({ initialValue: '#800000' }))
    await openPanel()

    // 当前颜色是暗红 rgb(128, 0, 0)，但 thumb 应对应轨道位置显示满饱和度的纯红
    const thumb = document.querySelector<HTMLElement>('[data-testid="color-picker-hue-thumb"]')
    expect(thumb?.style.backgroundColor).toBe('rgb(255, 0, 0)')
  })

  it('hex 字段提交合法值后 emit 规范化 hex', async () => {
    renderInBrowser(createHarness({}))
    await openPanel()

    await page.getByTestId('color-picker-panel-hex-field').fill('ff0000')
    await userEvent.keyboard('{Enter}')

    await expect.element(page.getByTestId('model-value')).toHaveTextContent('#FF0000')
  })

  it('面板 hex 字段对半透明颜色显示 6 位裸 hex 且提交时保留透明度', async () => {
    renderInBrowser(createHarness({ initialValue: 'rgba(86, 215, 153, 0.5)' }))
    await openPanel()

    await expect.element(page.getByTestId('color-picker-panel-hex-field')).toHaveValue('56D799')

    await page.getByTestId('color-picker-panel-hex-field').fill('ff0000')
    await userEvent.keyboard('{Enter}')

    await expect.element(page.getByTestId('model-value')).toHaveTextContent('#FF000080')
  })

  it('hex 字段输入非法值时不 emit', async () => {
    renderInBrowser(createHarness({ initialValue: '#00ff00' }))
    await openPanel()

    await page.getByTestId('color-picker-panel-hex-field').fill('#zzz')
    await userEvent.keyboard('{Enter}')

    await expect.element(page.getByTestId('model-value')).toHaveTextContent('#00ff00')
  })

  it('格式循环钮依次切换 HEX → RGB → HSL 并记住选择', async () => {
    const { pinia } = renderInBrowser(createHarness({}))
    await openPanel()

    const formatSwitch = page.getByTestId('color-picker-format-switch')
    await expect.element(formatSwitch).toHaveTextContent('HEX')

    await formatSwitch.click()
    await expect.element(formatSwitch).toHaveTextContent('RGB')
    await expect.element(page.getByRole('spinbutton', { exact: true, name: 'R' })).toBeInTheDocument()
    expect(usePreferenceStore(pinia).colorPickerFormat).toBe('rgb')

    await formatSwitch.click()
    await expect.element(formatSwitch).toHaveTextContent('HSL')
    await expect.element(page.getByRole('spinbutton', { exact: true, name: 'H' })).toBeInTheDocument()

    await formatSwitch.click()
    await expect.element(formatSwitch).toHaveTextContent('HEX')
    await expect.element(page.getByTestId('color-picker-panel-hex-field')).toBeInTheDocument()
  })

  it('格式循环钮 Shift 点击反向循环', async () => {
    renderInBrowser(createHarness({}))
    await openPanel()

    const formatSwitch = page.getByTestId('color-picker-format-switch')
    await formatSwitch.click()
    await expect.element(formatSwitch).toHaveTextContent('RGB')

    shiftClick(formatSwitch.element())
    await expect.element(formatSwitch).toHaveTextContent('HEX')

    // 继续反向应环绕到顺序末位的 HSL
    shiftClick(formatSwitch.element())
    await expect.element(formatSwitch).toHaveTextContent('HSL')
  })

  it('格式钮的可访问名带出当前格式', async () => {
    renderInBrowser(createHarness({}), { browser: { i18nMode: 'localized', locale: 'zh-Hans' } })
    await openPanel()

    const formatSwitch = page.getByTestId('color-picker-format-switch')
    await expect.element(formatSwitch).toHaveAttribute('aria-label', '切换颜色格式（当前 HEX）')

    await formatSwitch.click()
    await expect.element(formatSwitch).toHaveAttribute('aria-label', '切换颜色格式（当前 RGB）')
  })

  it('格式钮的提示以 tooltip 呈现', async () => {
    renderInBrowser(createHarness({}), { browser: { i18nMode: 'localized', locale: 'zh-Hans' } })
    await openPanel()

    await page.getByTestId('color-picker-format-switch').hover()

    await expect.element(page.getByTestId('color-picker-format-tooltip')).toHaveTextContent('切换颜色格式')
  })

  it('透明度字段提交后 emit 8 位 hex', async () => {
    renderInBrowser(createHarness({}))
    await openPanel()

    await page.getByTestId('color-picker-alpha-field').fill('50')
    await userEvent.keyboard('{Enter}')

    await expect.element(page.getByTestId('model-value')).toHaveTextContent('#00000080')
  })

  it('透明度与通道框为 number 类型，色值框保持文本类型', async () => {
    renderInBrowser(createHarness({}))
    await openPanel()

    expect((page.getByTestId('color-picker-hex-field').element() as HTMLInputElement).type).toBe('text')
    expect((page.getByTestId('color-picker-row-alpha-field').element() as HTMLInputElement).type).toBe('number')
    expect((page.getByTestId('color-picker-panel-hex-field').element() as HTMLInputElement).type).toBe('text')
    expect((page.getByTestId('color-picker-alpha-field').element() as HTMLInputElement).type).toBe('number')

    await page.getByTestId('color-picker-format-switch').click()
    expect((page.getByRole('spinbutton', { exact: true, name: 'R' }).element() as HTMLInputElement).type).toBe('number')

    await page.getByTestId('color-picker-format-switch').click()
    expect((page.getByRole('spinbutton', { exact: true, name: 'H' }).element() as HTMLInputElement).type).toBe('number')
  })

  it('数值框把范围下发给原生 min/max', async () => {
    renderInBrowser(createHarness({ initialValue: '#56D799' }))
    await openPanel()

    const triggerAlpha = page.getByTestId('color-picker-row-alpha-field').element() as HTMLInputElement
    const panelAlpha = page.getByTestId('color-picker-alpha-field').element() as HTMLInputElement
    expect([triggerAlpha.min, triggerAlpha.max]).toEqual(['0', '100'])
    expect([panelAlpha.min, panelAlpha.max]).toEqual(['0', '100'])

    await page.getByTestId('color-picker-format-switch').click()
    const redField = page.getByRole('spinbutton', { exact: true, name: 'R' }).element() as HTMLInputElement
    expect([redField.min, redField.max]).toEqual(['0', '255'])

    await page.getByTestId('color-picker-format-switch').click()
    const hueField = page.getByRole('spinbutton', { exact: true, name: 'H' }).element() as HTMLInputElement
    expect([hueField.min, hueField.max]).toEqual(['0', '360'])
  })

  it('触发器透明度框聚焦后滚轮向下按 1 减小透明度', async () => {
    renderInBrowser(createHarness({ initialValue: '#56D799' }))

    const field = page.getByTestId('color-picker-row-alpha-field')
    await field.click()
    await userEvent.wheel(field, { delta: { y: 120 } })

    await expect.element(page.getByTestId('model-value')).toHaveTextContent('#56D799FC')
    await expect.element(field).toHaveValue(99)
  })

  it('触发器透明度框未聚焦时滚轮不改变颜色', async () => {
    renderInBrowser(createHarness({ initialValue: '#56D799' }))

    const field = page.getByTestId('color-picker-row-alpha-field')
    await userEvent.wheel(field, { delta: { y: 120 } })

    expect(modelValueText()).toBe('#56D799')
    await expect.element(field).toHaveValue(100)
  })

  it('滚轮把数值推到边界外时裁剪到合法范围', async () => {
    renderInBrowser(createHarness({ initialValue: '#00000000' }))

    const field = page.getByTestId('color-picker-row-alpha-field')
    await field.click()
    await userEvent.wheel(field, { delta: { y: 120 } })

    await expect.element(page.getByTestId('model-value')).toHaveTextContent('#00000000')
    await expect.element(field).toHaveValue(0)
  })

  it('面板通道框聚焦后滚轮按 1 调整并同步颜色', async () => {
    renderInBrowser(createHarness({ initialValue: '#56D799' }))
    await openPanel()
    await page.getByTestId('color-picker-format-switch').click()

    const redField = page.getByRole('spinbutton', { exact: true, name: 'R' })
    await redField.click()
    await userEvent.wheel(redField, { delta: { y: -120 } })

    await expect.element(redField).toHaveValue(87)
    await expect.element(page.getByTestId('model-value')).toHaveTextContent('#57D799')
  })

  it('触发器透明度框 Home/End 跳到 0 与 100', async () => {
    renderInBrowser(createHarness({ initialValue: '#56D799' }))

    const field = page.getByTestId('color-picker-row-alpha-field')
    await field.click()

    await userEvent.keyboard('{Home}')
    await expect.element(field).toHaveValue(0)
    await expect.element(page.getByTestId('model-value')).toHaveTextContent('#56D79900')

    await userEvent.keyboard('{End}')
    await expect.element(field).toHaveValue(100)
    await expect.element(page.getByTestId('model-value')).toHaveTextContent('#56D799')
  })

  it('面板透明度框 Home/End 跳到 0 与 100', async () => {
    renderInBrowser(createHarness({ initialValue: '#56D799' }))
    await openPanel()

    const field = page.getByTestId('color-picker-alpha-field')
    await field.click()

    await userEvent.keyboard('{Home}')
    await expect.element(field).toHaveValue(0)
    await expect.element(page.getByTestId('model-value')).toHaveTextContent('#56D79900')

    await userEvent.keyboard('{End}')
    await expect.element(field).toHaveValue(100)
    await expect.element(page.getByTestId('model-value')).toHaveTextContent('#56D799')
  })

  it('透明度框方向键在上限处停住', async () => {
    renderInBrowser(createHarness({ initialValue: '#56D799' }))

    const field = page.getByTestId('color-picker-row-alpha-field')
    await field.click()
    await userEvent.keyboard('{ArrowUp}')
    await userEvent.keyboard('{ArrowUp}')

    await expect.element(field).toHaveValue(100)
    expect(modelValueText()).toBe('#56D799')
  })

  it('面板通道框 Home/End 跳到该通道的范围两端', async () => {
    renderInBrowser(createHarness({ initialValue: '#56D799' }))
    await openPanel()
    await page.getByTestId('color-picker-format-switch').click()

    const redField = page.getByRole('spinbutton', { exact: true, name: 'R' })
    await redField.click()

    await userEvent.keyboard('{End}')
    await expect.element(redField).toHaveValue(255)
    await expect.element(page.getByTestId('model-value')).toHaveTextContent('#FFD799')

    await userEvent.keyboard('{Home}')
    await expect.element(redField).toHaveValue(0)
    await expect.element(page.getByTestId('model-value')).toHaveTextContent('#00D799')
  })

  it('方向键在通道边界处停住', async () => {
    renderInBrowser(createHarness({ initialValue: '#000000' }))
    await openPanel()
    await page.getByTestId('color-picker-format-switch').click()

    const redField = page.getByRole('spinbutton', { exact: true, name: 'R' })
    await redField.click()
    await userEvent.keyboard('{ArrowDown}')
    await userEvent.keyboard('{ArrowDown}')

    // 原生 min 生效时停在 0，未生效时草稿会落到 -2（等失焦提交才被裁剪）
    await expect.element(redField).toHaveValue(0)
  })

  it('在触发器透明度 % 上向左拖拽按 1%/px 降低透明度', async () => {
    renderInBrowser(createHarness({ initialValue: '#56D799' }))

    scrubAlphaPercent('color-picker-row-alpha-scrubber', -20)

    await expect.element(page.getByTestId('model-value')).toHaveTextContent('#56D799CC')
    await expect.element(page.getByTestId('color-picker-row-alpha-field')).toHaveValue(80)
  })

  it('在触发器透明度 % 上按住 Shift 拖拽按 10%/px 调整', async () => {
    renderInBrowser(createHarness({ initialValue: '#56D799' }))

    scrubAlphaPercent('color-picker-row-alpha-scrubber', -3, { shiftKey: true })

    await expect.element(page.getByTestId('model-value')).toHaveTextContent('#56D799B3')
    await expect.element(page.getByTestId('color-picker-row-alpha-field')).toHaveValue(70)
  })

  it('在触发器透明度 % 上拖拽后焦点落在透明度框而不是色值框', async () => {
    renderInBrowser(createHarness({ initialValue: '#56D799' }))

    scrubAlphaPercent('color-picker-row-alpha-scrubber', -20)

    await expect.element(page.getByTestId('color-picker-row-alpha-field')).toHaveFocus()
    expect(document.activeElement).not.toBe(page.getByTestId('color-picker-hex-field').element())
  })

  it('在触发器透明度 % 上拖拽时把结果裁剪到 0-100', async () => {
    renderInBrowser(createHarness({ initialValue: '#000000' }))

    // 已在不透明端：继续向右拖拽不写入新颜色
    scrubAlphaPercent('color-picker-row-alpha-scrubber', 60)
    expect(modelValueText()).toBe('#000000')

    scrubAlphaPercent('color-picker-row-alpha-scrubber', -300)
    await expect.element(page.getByTestId('model-value')).toHaveTextContent('#00000000')
    await expect.element(page.getByTestId('color-picker-row-alpha-field')).toHaveValue(0)
  })

  it('空值时在触发器透明度 % 上拖拽不写入颜色', () => {
    renderInBrowser(createHarness({ initialValue: '' }))

    scrubAlphaPercent('color-picker-row-alpha-scrubber', -25)

    expect(modelValueText()).toBe('')
  })

  it('在面板透明度 % 上拖拽调整透明度', async () => {
    renderInBrowser(createHarness({ initialValue: '#56D799' }))
    await openPanel()

    scrubAlphaPercent('color-picker-alpha-scrubber', -30)
    await expect.element(page.getByTestId('model-value')).toHaveTextContent('#56D799B3')
    await expect.element(page.getByTestId('color-picker-alpha-field')).toHaveValue(70)

    scrubAlphaPercent('color-picker-alpha-scrubber', 10)
    await expect.element(page.getByTestId('model-value')).toHaveTextContent('#56D799CC')
    await expect.element(page.getByTestId('color-picker-alpha-field')).toHaveValue(80)
  })

  // 面板是取色面：空值由它归一成基线色，交互即产生具体颜色；触发器的透明度控件相反（见上）
  it('空值时在面板透明度 % 上拖拽以基线色写入', async () => {
    renderInBrowser(createHarness({ initialValue: '' }))
    await openPanel()

    scrubAlphaPercent('color-picker-alpha-scrubber', -25)

    await expect.element(page.getByTestId('model-value')).toHaveTextContent('#000000BF')
  })

  it('在面板 RGB 透明度 % 上拖拽后焦点落在透明度框而不是通道框', async () => {
    renderInBrowser(createHarness({ initialValue: '#56D799' }))
    await openPanel()
    await page.getByTestId('color-picker-format-switch').click()

    scrubAlphaPercent('color-picker-alpha-scrubber', -20)

    await expect.element(page.getByTestId('color-picker-alpha-field')).toHaveFocus()
    expect(document.activeElement).not.toBe(page.getByRole('spinbutton', { exact: true, name: 'R' }).element())
  })

  it('disableAlpha 时不渲染透明度滑条与字段', async () => {
    renderInBrowser(createHarness({ disableAlpha: true }))
    await openPanel()

    // 只剩色板 thumb 与色相滑条 thumb
    await vi.waitFor(() => {
      expect(document.querySelectorAll('[role="slider"]')).toHaveLength(2)
    })
    await expect.element(page.getByTestId('color-picker-alpha-field')).not.toBeInTheDocument()
  })

  it('色相滑条支持键盘调整', async () => {
    renderInBrowser(createHarness({ initialValue: '#ff0000' }))
    await openPanel()

    const hueThumb = document.querySelectorAll<HTMLElement>('[role="slider"]')[1]
    hueThumb.focus()
    await userEvent.keyboard('{ArrowRight}')

    await vi.waitFor(() => {
      const text = document.querySelector('[data-testid="model-value"]')?.textContent
      expect(text).toMatch(/^#[\da-f]{6}$/i)
      expect(text?.toLowerCase()).not.toBe('#ff0000')
    })
  })

  it('选中最近使用的颜色会应用到当前值', async () => {
    const { pinia } = renderInBrowser(createHarness({}))
    usePreferenceStore(pinia).recentColors = ['#ff0000']
    await openPanel()

    await expect.element(page.getByTestId('color-picker-recent')).toBeInTheDocument()
    await page.getByRole('option').click()

    await expect.element(page.getByTestId('model-value')).toHaveTextContent('#FF0000')
  })

  it('关闭选择器时把当前颜色写入最近使用', async () => {
    const { pinia } = renderInBrowser(createHarness({ initialValue: '#56d799' }))
    await openPanel()

    expect(usePreferenceStore(pinia).recentColors).toEqual([])

    await userEvent.keyboard('{Escape}')

    await vi.waitFor(() => {
      expect(usePreferenceStore(pinia).recentColors).toEqual(['#56D799'])
    })
  })

  /** 宿主表面：选择器挂在它内部，它把自己的焦点上下文登记在自身上（与编辑器各面板一致） */
  function createSurfaceHarness(options: { isModalOpen?: boolean } = {}) {
    return defineComponent({
      components: { ColorPicker },
      setup() {
        const surfaceRef = ref<HTMLDivElement>()

        useShortcutContext({
          isModalOpen: options.isModalOpen ?? false,
          panelFocus: 'none',
        })

        useShortcutContext({
          panelFocus: 'editor',
        }, {
          target: surfaceRef,
          trackFocus: true,
        })

        return { surfaceRef }
      },
      template: `
        <div>
          <div ref="surfaceRef" data-testid="host-surface">
            <ColorPicker :model-value="'#FF0000'" data-testid="color-picker-trigger" />
          </div>
        </div>
      `,
    })
  }

  function resolvedPanelFocus(): unknown {
    return useShortcutContextRegistry().resolveContext().panelFocus
  }

  it('焦点落在面板内时宿主表面的快捷键上下文保持有效', async () => {
    renderInBrowser(createSurfaceHarness())
    await openPanel()

    // 面板渲染在 teleport 出来的浮层里，触发按钮仍留在宿主表面内
    const panelField = page.getByTestId('color-picker-panel-hex-field').element() as HTMLInputElement
    expect(document.querySelector('[data-testid="host-surface"]')?.contains(panelField)).toBe(false)

    panelField.focus()
    expect(resolvedPanelFocus()).toBe('editor')

    // 面板内的色板手柄同样属于宿主表面
    page.getByTestId('color-picker-area').element().dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, button: 0, pointerId: 1 }))
    ;(page.getByTestId('color-picker-area-thumb').element() as HTMLElement).focus()
    expect(resolvedPanelFocus()).toBe('editor')
  })

  it('模态浮层打开时不回算浮层内的焦点', async () => {
    renderInBrowser(createSurfaceHarness({ isModalOpen: true }))
    await openPanel()

    const panelField = page.getByTestId('color-picker-panel-hex-field').element() as HTMLInputElement
    panelField.focus()

    expect(resolvedPanelFocus()).toBe('none')
  })

  it('焦点被移到面板外不会关闭面板，点击面板外才关闭', async () => {
    renderInBrowser(defineComponent({
      components: { ColorPicker },
      setup() {
        return {}
      },
      template: `
        <div style="padding-bottom: 360px">
          <button type="button" data-testid="outside-button">outside</button>
          <ColorPicker :model-value="'#FF0000'" data-testid="color-picker-trigger" />
        </div>
      `,
    }))
    await openPanel()

    // 应用侧主动移动焦点（例如撤销后聚焦到语句卡片）不应该把工具面板关掉
    ;(page.getByTestId('outside-button').element() as HTMLButtonElement).focus()
    await nextTick()
    await expect.element(page.getByTestId('color-picker-area')).toBeVisible()

    // 关闭仍由点击面板外负责
    await page.getByTestId('outside-button').click()
    await expect.element(page.getByTestId('color-picker-area')).not.toBeInTheDocument()
  })

  it('拖拽中透传实时值，模型要等松手才写入', async () => {
    const previews: string[] = []
    renderInBrowser(defineComponent({
      components: { ColorPicker },
      setup() {
        const modelValue = ref('#FF0000')

        return {
          modelValue,
          onPreview: (value: string) => previews.push(value),
        }
      },
      template: `
        <div>
          <ColorPicker v-model="modelValue" data-testid="color-picker-trigger" @preview="onPreview" />
          <output data-testid="model-value">{{ modelValue }}</output>
        </div>
      `,
    }))
    await openPanel()

    // 面板内的拖拽（这里用透明度 % 触发）先发实时流，模型保持不动
    const handle = page.getByTestId('color-picker-alpha-scrubber').element()
    dispatchPointerEvent(handle, 'pointerdown', { clientX: 100, pointerId: 1 })
    dispatchPointerEvent(handle, 'pointermove', { clientX: 60, pointerId: 1 })

    await vi.waitFor(() => {
      expect(previews).toEqual(['#FF000099'])
    })
    expect(modelValueText()).toBe('#FF0000')

    dispatchPointerEvent(handle, 'pointerup', { clientX: 60, pointerId: 1 })
    await expect.element(page.getByTestId('model-value')).toHaveTextContent('#FF000099')
  })
})
