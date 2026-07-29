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
      <InputGroup class="h-7 shadow-none overflow-hidden">
        <InputGroupInput
          data-testid="input-group-reference"
          class="text-xs py-1 pr-0 h-7 shadow-none"
        />
        <InputGroupAddon align="inline-end" class="pr-1.5">
          <InputGroupButton class="text-xs rounded-none h-7">Narration</InputGroupButton>
        </InputGroupAddon>
      </InputGroup>
      <InputGroup class="h-7 shadow-none overflow-hidden">
        <InputGroupAutocomplete
          data-testid="input-group-autocomplete"
          :options="options"
          class="text-xs py-1 pr-0 h-7 shadow-none"
        />
        <InputGroupAddon align="inline-end" class="pr-1.5">
          <InputGroupButton class="text-xs rounded-none h-7">Narration</InputGroupButton>
        </InputGroupAddon>
      </InputGroup>
    </div>
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
  it('有候选项时不显示独立输入框的行尾图标', () => {
    renderInBrowser(InputGroupStyleHarness)

    expect(document.querySelector('[data-testid="autocomplete-indicator"]')).toBeNull()
  })

  it('候选弹层至少覆盖整个 InputGroup 宽度', async () => {
    renderInBrowser(InputGroupStyleHarness)

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
    renderInBrowser(InputGroupStyleHarness)

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

    await inputLocator.click()
    const inputGroupFocusShadow = getComputedStyle(inputGroup).boxShadow
    expect(inputGroupFocusShadow).not.toBe('none')
    await autocompleteLocator.click()

    expect(getComputedStyle(autocompleteGroup).boxShadow).toBe(inputGroupFocusShadow)
  })
})
