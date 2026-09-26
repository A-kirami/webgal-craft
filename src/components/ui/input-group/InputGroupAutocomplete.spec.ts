import { describe, expect, it } from 'vitest'
import { page } from 'vitest/browser'

import { renderInBrowser } from '~/__tests__/browser-render'
import { InputGroup, InputGroupAddon, InputGroupAutocomplete, InputGroupButton, InputGroupInput } from '~/components/ui/input-group'
import 'virtual:uno.css'

const options = [
  { label: 'char', value: 'char' },
]

const InputGroupStyleHarness = defineComponent({
  components: { InputGroup, InputGroupAddon, InputGroupAutocomplete, InputGroupButton, InputGroupInput },
  setup() {
    return { options }
  },
  template: `
    <div style="width: 320px;">
      <InputGroup class="h-7 overflow-hidden">
        <InputGroupInput
          data-testid="input-group-reference"
          class="text-xs py-1 pr-0 h-7"
        />
        <InputGroupAddon align="inline-end" class="pr-1.5">
          <InputGroupButton class="text-xs rounded-none h-7">Narration</InputGroupButton>
        </InputGroupAddon>
      </InputGroup>
      <InputGroup class="h-7 overflow-hidden">
        <InputGroupAutocomplete
          data-testid="input-group-autocomplete"
          :options="options"
          class="text-xs py-1 pr-0 h-7"
        />
        <InputGroupAddon align="inline-end" class="pr-1.5">
          <InputGroupButton class="text-xs rounded-none h-7">Narration</InputGroupButton>
        </InputGroupAddon>
      </InputGroup>
    </div>
  `,
})

const ItemClassHarness = defineComponent({
  components: { InputGroup, InputGroupAutocomplete },
  setup() {
    return { options }
  },
  template: `
    <InputGroup class="h-6 overflow-hidden">
      <InputGroupAutocomplete
        data-testid="item-class-autocomplete"
        :options="options"
        class="text-xs pl-2 pr-0 h-6"
        item-class="py-1.25"
      />
    </InputGroup>
  `,
})

function requireHtmlElement(element: HTMLElement | SVGElement): HTMLElement {
  if (!(element instanceof HTMLElement)) {
    throw new TypeError('expected an HTML element')
  }
  return element
}

function requireInputGroup(element: HTMLElement): HTMLElement {
  const inputGroup = element.closest<HTMLElement>('[data-slot="input-group"]')
  if (!inputGroup) {
    throw new TypeError('expected element to be inside an input group')
  }
  return inputGroup
}

describe('InputGroupAutocomplete', () => {
  it('有候选项时不显示独立输入框的行尾图标', async () => {
    await renderInBrowser(InputGroupStyleHarness)

    expect(document.querySelector('[data-testid="autocomplete-indicator"]')).toBeNull()
  })

  it('候选弹层至少覆盖整个 InputGroup 宽度', async () => {
    await renderInBrowser(InputGroupStyleHarness)

    const autocomplete = requireHtmlElement(await page.getByTestId('input-group-autocomplete').element())
    const inputGroup = requireInputGroup(autocomplete)

    await page.getByTestId('input-group-autocomplete').click()
    const listbox = requireHtmlElement(await page.getByRole('listbox').element())
    const listboxWidth = listbox.offsetWidth
    const inputGroupWidth = inputGroup.offsetWidth

    expect(inputGroupWidth).toBeGreaterThan(0)
    expect(listboxWidth).toBeGreaterThan(0)
    expect(listboxWidth).toBeGreaterThanOrEqual(inputGroupWidth - 1)
  })

  it('与 InputGroupInput 使用相同的输入区和焦点样式', async () => {
    await renderInBrowser(InputGroupStyleHarness)

    const inputLocator = page.getByTestId('input-group-reference')
    const autocompleteLocator = page.getByTestId('input-group-autocomplete')
    const input = requireHtmlElement(await inputLocator.element())
    const autocomplete = requireHtmlElement(await autocompleteLocator.element())
    const inputStyle = getComputedStyle(input)
    const autocompleteStyle = getComputedStyle(autocomplete)
    const visualProperties = [
      'height',
      'padding-top',
      'padding-right',
      'padding-bottom',
      'padding-left',
      'font-size',
      'border-top-width',
      'border-top-left-radius',
      'background-color',
      'box-shadow',
    ]

    expect(Object.fromEntries(visualProperties.map(property => [property, autocompleteStyle.getPropertyValue(property)])))
      .toEqual(Object.fromEntries(visualProperties.map(property => [property, inputStyle.getPropertyValue(property)])))

    const inputGroup = requireInputGroup(input)
    const autocompleteGroup = requireInputGroup(autocomplete)

    // 焦点环由 InputGroup 的 :has([data-slot=input-group-control]:focus-visible) 规则绘制。
    // 无头 Chromium 不保证在合成焦点变化后重新计算该祖先规则的样式（同一用例时有时无），
    // 因此这里断言规则的输入条件——两个控件都作为组内焦点目标并进入 :focus-visible——
    // 以及两个组最终解析出的焦点样式一致，而不单独断言绘制出的 box-shadow 是否为 none。
    expect(input.dataset.slot).toBe('input-group-control')
    expect(autocomplete.dataset.slot).toBe('input-group-control')

    await inputLocator.click()
    expect(document.activeElement).toBe(input)
    expect(input.matches(':focus-visible')).toBe(true)
    const inputGroupFocusShadow = getComputedStyle(inputGroup).boxShadow

    await autocompleteLocator.click()
    expect(document.activeElement).toBe(autocomplete)
    expect(autocomplete.matches(':focus-visible')).toBe(true)

    expect(getComputedStyle(autocompleteGroup).boxShadow).toBe(inputGroupFocusShadow)
  })

  it('itemClass 透传到候选行并收紧行高', async () => {
    await renderInBrowser(ItemClassHarness)

    await page.getByTestId('item-class-autocomplete').click()

    const option = requireHtmlElement(await page.getByRole('option', { name: 'char' }).element())
    expect(option).toHaveClass('py-1.25')
    expect(option).not.toHaveClass('py-1.5')
    expect(getComputedStyle(option).paddingTop).toBe('5px')
    expect(option.offsetHeight).toBe(26)
  })

  it('未传 itemClass 时候选行沿用默认的 28px 行高', async () => {
    await renderInBrowser(InputGroupStyleHarness)

    await page.getByTestId('input-group-autocomplete').click()

    const option = requireHtmlElement(await page.getByRole('option', { name: 'char' }).element())
    expect(getComputedStyle(option).paddingTop).toBe('6px')
    expect(option.offsetHeight).toBe(28)
  })
})
