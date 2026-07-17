import { describe, expect, it } from 'vitest'
import { page, userEvent } from 'vitest/browser'

import { renderInBrowser } from '~/__tests__/browser-render'
// @unocss-safelist whitespace-pre
import 'virtual:uno.css'

import Autocomplete from './Autocomplete.vue'

const options = [
  { label: 'start', value: 'start' },
  { label: 'next', value: 'next' },
]

const LAYOUT_TOLERANCE_PX = 1

const groupedOptions = [
  { label: 'Left Figure', value: 'fig-left', group: 'Preset' },
  { label: 'hero', value: 'hero', group: 'Figure ID' },
]

const singleGroupOptions = [
  { label: 'hero', value: 'hero', group: 'Figure ID' },
  { label: 'villain', value: 'villain', group: 'Figure ID' },
]

const displayValueOptions = [
  { label: 'Left Figure', value: 'fig-left' },
  { label: 'Center Figure', value: 'fig-center' },
]

const whitespaceOptions = [
  { label: 'option    label', value: 'option    label' },
]

function requireHtmlElement(element: HTMLElement | SVGElement): HTMLElement {
  if (!(element instanceof HTMLElement)) {
    throw new TypeError('expected an HTML element')
  }
  return element
}

const PortalHarness = defineComponent({
  components: { Autocomplete },
  setup() {
    const modelValue = ref('')

    return {
      modelValue,
      options,
    }
  },
  template: `
    <div>
      <div data-testid="local-layer" style="position: relative; height: 32px; overflow: hidden;">
        <Autocomplete
          v-model="modelValue"
          data-testid="scene-autocomplete"
          :options="options"
          placeholder="Label"
        />
      </div>
      <button data-testid="outside-target" style="position: fixed; right: 16px; bottom: 16px;">
        Outside
      </button>
    </div>
  `,
})

const ClosedValueHarness = defineComponent({
  components: { Autocomplete },
  setup() {
    const modelValue = ref('sta')

    return {
      modelValue,
      options,
    }
  },
  template: `
    <Autocomplete
      v-model="modelValue"
      data-testid="closed-value-autocomplete"
      :options="options"
    />
  `,
})

const LabelHarness = defineComponent({
  components: { Autocomplete },
  setup() {
    const modelValue = ref('')

    return {
      modelValue,
      options,
    }
  },
  template: `
    <div>
      <label for="label-autocomplete">Scene label</label>
      <Autocomplete
        id="label-autocomplete"
        v-model="modelValue"
        data-testid="label-autocomplete"
        :options="options"
      />
    </div>
  `,
})

function createSizingHarness(
  inputWidth: number,
  sizingOptions: { label: string, value: string }[] = options,
) {
  return defineComponent({
    components: { Autocomplete },
    setup() {
      const modelValue = ref('')

      return {
        modelValue,
        sizingOptions,
      }
    },
    template: `
      <div style="width: ${inputWidth}px;">
        <Autocomplete
          v-model="modelValue"
          style="width: 100%;"
          data-testid="sizing-autocomplete"
          :options="sizingOptions"
        />
      </div>
    `,
  })
}

async function readSizingWidths(
  inputWidth: number,
  sizingOptions: { label: string, value: string }[] = options,
) {
  renderInBrowser(createSizingHarness(inputWidth, sizingOptions))

  const input = page.getByTestId('sizing-autocomplete')
  await input.click()
  const listbox = page.getByRole('listbox')
  await expect.element(listbox).toBeVisible()
  const inputElement = requireHtmlElement(await input.element())
  const listboxElement = requireHtmlElement(await listbox.element())
  const measuredInputWidth = inputElement.offsetWidth
  const measuredListboxWidth = listboxElement.offsetWidth

  expect(measuredInputWidth).toBeGreaterThan(0)
  expect(measuredListboxWidth).toBeGreaterThan(0)

  return {
    inputWidth: measuredInputWidth,
    listboxWidth: measuredListboxWidth,
  }
}

const GroupedHarness = defineComponent({
  components: { Autocomplete },
  setup() {
    const modelValue = ref('')

    return {
      groupedOptions,
      modelValue,
    }
  },
  template: `
    <Autocomplete
      v-model="modelValue"
      data-testid="target-autocomplete"
      :options="groupedOptions"
      placeholder="Target"
    />
  `,
})

const SingleGroupHarness = defineComponent({
  components: { Autocomplete },
  setup() {
    const modelValue = ref('')

    return {
      modelValue,
      singleGroupOptions,
    }
  },
  template: `
    <Autocomplete
      v-model="modelValue"
      data-testid="figure-autocomplete"
      :options="singleGroupOptions"
      placeholder="Figure ID"
    />
  `,
})

const DisplayValueHarness = defineComponent({
  components: { Autocomplete },
  setup() {
    const modelValue = ref('fig-center')

    return {
      displayValueOptions,
      modelValue,
    }
  },
  template: `
    <div>
      <Autocomplete
        v-model="modelValue"
        data-testid="display-autocomplete"
        :options="displayValueOptions"
        placeholder="Target"
      />
      <output data-testid="model-value">{{ modelValue }}</output>
    </div>
  `,
})

const ReactiveLabelHarness = defineComponent({
  components: { Autocomplete },
  setup() {
    const modelValue = ref('fig-center')
    const label = ref('Center Figure')
    const reactiveOptions = computed(() => [
      { label: label.value, value: 'fig-center' },
    ])

    return {
      label,
      modelValue,
      reactiveOptions,
    }
  },
  template: `
    <div>
      <Autocomplete
        v-model="modelValue"
        data-testid="reactive-label-autocomplete"
        :options="reactiveOptions"
      />
      <button data-testid="update-label" @click="label = 'Centered Figure'">
        Update label
      </button>
    </div>
  `,
})

const ReactiveOptionsHarness = defineComponent({
  components: { Autocomplete },
  setup() {
    const modelValue = ref('')
    const reactiveOptions = ref([...options])

    return {
      modelValue,
      reactiveOptions,
    }
  },
  template: `
    <div>
      <button data-testid="clear-options" @click="reactiveOptions = []">
        Clear options
      </button>
      <Autocomplete
        v-model="modelValue"
        data-testid="reactive-options-autocomplete"
        :options="reactiveOptions"
      />
    </div>
  `,
})

describe('Autocomplete', () => {
  it('点击关联标签时只聚焦输入框，直接点击输入框时才展开候选项', async () => {
    renderInBrowser(LabelHarness)

    const input = page.getByTestId('label-autocomplete')
    await page.getByText('Scene label').click()

    await expect.element(input).toHaveFocus()
    await expect.element(input).toHaveAttribute('aria-expanded', 'false')
    await expect.element(page.getByRole('listbox')).not.toBeInTheDocument()

    await input.click()

    await expect.element(input).toHaveAttribute('aria-expanded', 'true')
    await expect.element(page.getByRole('option', { name: 'start' })).toBeInTheDocument()
  })

  it('候选项动态变空后关闭浮层，继续输入也不会进入幽灵展开状态', async () => {
    renderInBrowser(ReactiveOptionsHarness)

    const input = page.getByTestId('reactive-options-autocomplete')
    await input.click()
    await expect.element(input).toHaveAttribute('aria-expanded', 'true')

    await page.getByTestId('clear-options').click()
    await expect.element(input).toHaveAttribute('aria-expanded', 'false')
    await expect.element(page.getByRole('listbox')).not.toBeInTheDocument()

    await input.fill('custom')
    await expect.element(input).toHaveValue('custom')
    await expect.element(input).toHaveAttribute('aria-expanded', 'false')

    const inputElement = await input.element()
    const enter = new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true })
    expect(inputElement.dispatchEvent(enter)).toBe(true)
  })

  it('候选浮层通过 Portal 渲染，避免被局部容器裁剪', async () => {
    renderInBrowser(PortalHarness)

    await page.getByTestId('scene-autocomplete').click()
    await expect.element(page.getByRole('option', { name: 'start' })).toBeInTheDocument()

    const localLayer = await page.getByTestId('local-layer').element()
    const option = await page.getByRole('option', { name: 'start' }).element()

    expect(localLayer.contains(option)).toBe(false)
  })

  it('候选项保留标签中的连续空格', async () => {
    renderInBrowser(createSizingHarness(320, whitespaceOptions))

    await page.getByTestId('sizing-autocomplete').click()
    const option = requireHtmlElement(await page.getByRole('option').element())

    // eslint-disable-next-line unicorn/prefer-dom-node-text-content -- innerText 反映 CSS 空白折叠，textContent 无法覆盖该回归。
    expect(option.innerText).toBe('option    label')
  })

  it('候选内容较短时浮层宽度与输入框相同', async () => {
    const { inputWidth, listboxWidth } = await readSizingWidths(320)

    expect(Math.abs(listboxWidth - inputWidth)).toBeLessThanOrEqual(LAYOUT_TOLERANCE_PX)
  })

  it('输入框较窄时保留候选浮层的最小宽度', async () => {
    const { inputWidth, listboxWidth } = await readSizingWidths(48)
    const rootFontSize = Number.parseFloat(getComputedStyle(document.documentElement).fontSize)

    expect(listboxWidth).toBeGreaterThan(inputWidth)
    expect(listboxWidth).toBeGreaterThanOrEqual(8 * rootFontSize - LAYOUT_TOLERANCE_PX)
  })

  it('候选内容较长时浮层可以超过输入框宽度', async () => {
    const { inputWidth, listboxWidth } = await readSizingWidths(160, [{
      label: 'A very long autocomplete option that needs more horizontal space',
      value: 'long-option',
    }])

    expect(listboxWidth).toBeGreaterThan(inputWidth)
  })

  it('存在匹配候选项时直接按回车保留原始输入', async () => {
    renderInBrowser(PortalHarness)

    const input = page.getByTestId('scene-autocomplete')
    await input.fill('sta')
    const option = page.getByRole('option', { name: 'start' })
    await expect.element(option).toBeInTheDocument()
    await expect.element(option).not.toHaveAttribute('data-highlighted')
    await expect.element(input).not.toHaveAttribute('aria-activedescendant')

    await userEvent.keyboard('{Enter}')

    expect(document.querySelector('[role="listbox"]')).toBeNull()
    await expect.element(input).toHaveValue('sta')
    await expect.element(input).toHaveAttribute('aria-expanded', 'false')
  })

  it.each(['Home', 'End'])('候选浮层关闭时按 %s 后重新展开不会保留自动高亮', async (key) => {
    renderInBrowser(ClosedValueHarness)

    const input = page.getByTestId('closed-value-autocomplete')
    const inputElement = await input.element() as HTMLInputElement
    inputElement.focus()
    const selectionPosition = key === 'Home' ? inputElement.value.length : 0
    inputElement.setSelectionRange(selectionPosition, selectionPosition)
    await userEvent.keyboard(`{${key}}`)
    await expect.element(input).toHaveAttribute('aria-expanded', 'false')

    await input.click()

    const option = page.getByRole('option', { name: 'start' })
    await expect.element(option).toBeInTheDocument()
    await expect.element(option).not.toHaveAttribute('data-highlighted')
    await expect.element(input).not.toHaveAttribute('aria-activedescendant')

    await userEvent.keyboard('{Enter}')

    await expect.element(input).toHaveValue('sta')
    await expect.element(input).toHaveAttribute('aria-expanded', 'false')
  })

  it('候选浮层关闭时方向键仍可展开并选择候选项', async () => {
    renderInBrowser(ClosedValueHarness)

    const input = page.getByTestId('closed-value-autocomplete')
    const inputElement = await input.element() as HTMLInputElement
    inputElement.focus()

    await userEvent.keyboard('{ArrowDown}{Enter}')

    await expect.element(input).toHaveValue('start')
    await expect.element(input).toHaveAttribute('aria-expanded', 'false')
  })

  it('输入法候选导航不会高亮 Autocomplete 候选项', async () => {
    renderInBrowser(PortalHarness)

    const input = page.getByTestId('scene-autocomplete')
    await input.click()
    const inputElement = await input.element() as HTMLInputElement
    inputElement.dispatchEvent(new CompositionEvent('compositionstart', { bubbles: true }))
    await userEvent.keyboard('{ArrowDown}')
    inputElement.value = 'sta'
    inputElement.dispatchEvent(new CompositionEvent('compositionend', {
      bubbles: true,
      data: 'sta',
    }))

    const option = page.getByRole('option', { name: 'start' })
    await expect.element(option).toBeInTheDocument()
    await expect.element(option).not.toHaveAttribute('data-highlighted')
    await expect.element(input).not.toHaveAttribute('aria-activedescendant')

    await userEvent.keyboard('{Enter}')

    await expect.element(input).toHaveValue('sta')
    await expect.element(input).toHaveAttribute('aria-expanded', 'false')
  })

  it('输入自定义值后按回车关闭候选浮层，并可再次触发候选项', async () => {
    renderInBrowser(PortalHarness)

    const input = page.getByTestId('scene-autocomplete')
    await input.fill('custom')
    await expect.element(input).toHaveAttribute('aria-expanded', 'true')
    await expect.element(page.getByRole('option')).not.toBeInTheDocument()

    await userEvent.keyboard('{Enter}')

    expect(document.querySelector('[role="listbox"]')).toBeNull()
    await expect.element(input).toHaveValue('custom')
    await expect.element(input).toHaveAttribute('aria-expanded', 'false')

    await input.click()

    await expect.element(input).toHaveAttribute('aria-expanded', 'true')
    await expect.element(page.getByRole('option', { name: 'start' })).toBeInTheDocument()
  })

  it('候选浮层已展开时再次点击输入框不会清空筛选条件', async () => {
    renderInBrowser(PortalHarness)

    const input = page.getByTestId('scene-autocomplete')
    await input.fill('sta')
    await expect.element(page.getByRole('option', { name: 'start' })).toBeInTheDocument()
    await expect.element(page.getByRole('option', { name: 'next' })).not.toBeInTheDocument()

    await input.click()

    await expect.element(page.getByRole('option', { name: 'start' })).toBeInTheDocument()
    await expect.element(page.getByRole('option', { name: 'next' })).not.toBeInTheDocument()
  })

  it('使用方向键和回车选择候选项', async () => {
    renderInBrowser(PortalHarness)

    const input = page.getByTestId('scene-autocomplete')
    await input.click()
    const firstOption = page.getByRole('option', { name: 'start' })
    await expect.element(firstOption).not.toHaveAttribute('data-highlighted')
    await expect.element(input).not.toHaveAttribute('aria-activedescendant')

    await userEvent.keyboard('{ArrowDown}{Enter}')

    await expect.element(input).toHaveValue('start')
    await expect.element(input).toHaveAttribute('aria-expanded', 'false')
  })

  it('指针移入候选项后才高亮该项', async () => {
    renderInBrowser(PortalHarness)

    const input = page.getByTestId('scene-autocomplete')
    await input.click()
    const nextOption = page.getByRole('option', { name: 'next' })

    await nextOption.hover()

    const nextOptionElement = await nextOption.element()
    await expect.element(nextOption).toHaveAttribute('data-highlighted')
    await expect.element(input).toHaveAttribute('aria-activedescendant', nextOptionElement.id)
  })

  it('点击候选项后恢复输入框焦点', async () => {
    renderInBrowser(PortalHarness)

    const input = page.getByTestId('scene-autocomplete')
    await input.click()
    await page.getByRole('option', { name: 'next' }).click()

    await expect.element(input).toHaveValue('next')
    await expect.element(input).toHaveFocus()
  })

  it('输入自定义值后点击外部时立即关闭候选浮层', async () => {
    renderInBrowser(PortalHarness)

    const input = page.getByTestId('scene-autocomplete')
    const outsideTarget = page.getByTestId('outside-target')
    await input.fill('custom')
    await expect.element(page.getByRole('option')).not.toBeInTheDocument()

    await outsideTarget.click()

    expect(document.querySelector('[role="listbox"]')).toBeNull()
    await expect.element(input).toHaveValue('custom')
    await expect.element(input).toHaveAttribute('aria-expanded', 'false')
    await expect.element(outsideTarget).toHaveFocus()
  })

  it('存在多个语义分组时显示分组标题', async () => {
    renderInBrowser(GroupedHarness)

    await page.getByTestId('target-autocomplete').click()

    await expect.element(
      page.getByRole('group', { name: 'Preset' }).getByRole('option', { name: 'Left Figure' }),
    ).toBeInTheDocument()
    await expect.element(
      page.getByRole('group', { name: 'Figure ID' }).getByRole('option', { name: 'hero' }),
    ).toBeInTheDocument()
  })

  it('过滤候选项时隐藏没有匹配项的分组', async () => {
    renderInBrowser(GroupedHarness)

    await page.getByTestId('target-autocomplete').fill('her')

    await expect.element(page.getByRole('group', { name: 'Figure ID' })).toBeVisible()
    await expect.element(
      page.getByRole('group', { name: 'Preset', includeHidden: true }),
    ).not.toBeVisible()
  })

  it('只有一个语义分组时隐藏分组标题', async () => {
    renderInBrowser(SingleGroupHarness)

    await page.getByTestId('figure-autocomplete').click()

    await expect.element(page.getByText('Figure ID')).not.toBeInTheDocument()
    await expect.element(page.getByRole('group')).not.toBeInTheDocument()
    await expect.element(page.getByRole('option', { name: 'hero' })).toBeInTheDocument()
  })

  it('输入框显示候选项名称，同时 v-model 保留候选项值', async () => {
    renderInBrowser(DisplayValueHarness)

    await expect.element(page.getByTestId('display-autocomplete')).toHaveValue('Center Figure')
    await expect.element(page.getByTestId('model-value')).toHaveTextContent('fig-center')

    await page.getByTestId('display-autocomplete').click()
    await page.getByRole('option', { name: 'Left Figure' }).click()

    await expect.element(page.getByTestId('display-autocomplete')).toHaveValue('Left Figure')
    await expect.element(page.getByTestId('model-value')).toHaveTextContent('fig-left')
  })

  it('自由输入时输入框和 v-model 都使用输入文本', async () => {
    renderInBrowser(DisplayValueHarness)

    await page.getByTestId('display-autocomplete').fill('custom-target')

    await expect.element(page.getByTestId('display-autocomplete')).toHaveValue('custom-target')
    await expect.element(page.getByTestId('model-value')).toHaveTextContent('custom-target')
  })

  it('在候选项显示名中移动光标后键入时整体替换显示名', async () => {
    renderInBrowser(DisplayValueHarness)

    const input = page.getByTestId('display-autocomplete')
    await input.click()

    const element = await input.element() as HTMLInputElement
    element.setSelectionRange(6, 6)
    await userEvent.keyboard('custom-target')

    await expect.element(input).toHaveValue('custom-target')
    await expect.element(page.getByTestId('model-value')).toHaveTextContent('custom-target')
  })

  it('删除候选项显示名时清空字段值而不是保存残缺名称', async () => {
    renderInBrowser(DisplayValueHarness)

    const input = page.getByTestId('display-autocomplete')
    await input.click()

    const element = await input.element() as HTMLInputElement
    element.setSelectionRange(element.value.length, element.value.length)
    await userEvent.keyboard('{Backspace}')

    await expect.element(input).toHaveValue('')
    await expect.element(page.getByTestId('model-value')).toBeEmptyDOMElement()
  })

  it('使用输入法输入自定义值时替换候选项显示名', async () => {
    renderInBrowser(DisplayValueHarness)

    const input = page.getByTestId('display-autocomplete')
    await input.click()

    const element = await input.element() as HTMLInputElement
    element.dispatchEvent(new CompositionEvent('compositionstart', { bubbles: true }))
    await nextTick()
    element.value = '自定义目标'
    element.dispatchEvent(new CompositionEvent('compositionend', {
      bubbles: true,
      data: '自定义目标',
    }))

    await expect.element(input).toHaveValue('自定义目标')
    await expect.element(page.getByTestId('model-value')).toHaveTextContent('自定义目标')
  })

  it('候选项标签变化时更新非编辑状态下的显示名', async () => {
    renderInBrowser(ReactiveLabelHarness)

    const input = page.getByTestId('reactive-label-autocomplete')
    await expect.element(input).toHaveValue('Center Figure')

    await page.getByTestId('update-label').click()

    await expect.element(input).toHaveValue('Centered Figure')
  })
})
