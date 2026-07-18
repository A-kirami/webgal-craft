import { describe, expect, it } from 'vitest'
import { page, userEvent } from 'vitest/browser'
import { defineComponent } from 'vue'

import { createBrowserContainerStub, renderInBrowser } from '~/__tests__/browser-render'

import Combobox from './Combobox.vue'

import type { InjectionKey, Ref } from 'vue'

const popoverContextKey: InjectionKey<{
  open: Readonly<Ref<boolean>>
  setOpen: (value: boolean) => void
}> = Symbol('ComboboxPopoverContext')

const baseOptions = [
  { label: 'Idle', value: 'idle' },
  { label: 'Joy', value: 'joy' },
  { label: 'Sad', value: 'sad' },
]

const multiKeywordOptions = [
  { label: 'Dark Joy', value: 'dark-joy' },
  { label: 'Dark Sad', value: 'dark-sad' },
  { label: 'Bright Joy', value: 'bright-joy' },
]

const scrollOptions = Array.from({ length: 20 }, (_, index) => ({
  label: `Option ${index + 1}`,
  value: `option-${index + 1}`,
}))

const globalStubs = {
  Button: createBrowserContainerStub('StubButton', 'button'),
  Popover: defineComponent({
    name: 'StubPopover',
    props: {
      open: {
        type: Boolean,
        default: false,
      },
    },
    emits: ['update:open'],
    setup(props, { emit, slots }) {
      const open = computed(() => props.open)

      provide(popoverContextKey, {
        open: readonly(open),
        setOpen(value: boolean) {
          emit('update:open', value)
        },
      })

      return () => slots.default?.()
    },
  }),
  PopoverContent: defineComponent({
    name: 'StubPopoverContent',
    inheritAttrs: false,
    setup(_, { attrs, slots }) {
      const context = inject(popoverContextKey)

      return () => context?.open.value
        ? h('div', attrs, slots.default?.())
        : undefined
    },
  }),
  PopoverTrigger: defineComponent({
    name: 'StubPopoverTrigger',
    setup(_, { slots }) {
      const context = inject(popoverContextKey)

      return () => h('div', {
        onClick: () => context?.setOpen(!context.open.value),
      }, slots.default?.())
    },
  }),
}

const ComboboxHarness = defineComponent({
  components: { Combobox },
  setup() {
    const modelValue = ref('')

    return {
      baseOptions,
      modelValue,
    }
  },
  template: `
    <Combobox
      v-model="modelValue"
      id="motion"
      data-testid="motion-trigger"
      :options="baseOptions"
      placeholder="Select motion"
      search-placeholder="Search motion"
    />
  `,
})

const EmptyComboboxHarness = defineComponent({
  components: { Combobox },
  template: `
    <Combobox
      data-testid="empty-trigger"
      :options="[]"
      placeholder="Select motion"
      search-placeholder="Search motion"
    />
  `,
})

const CenteredComboboxHarness = defineComponent({
  components: { Combobox },
  setup() {
    const modelValue = ref('option-12')

    return {
      modelValue,
      scrollOptions,
    }
  },
  template: `
    <Combobox
      v-model="modelValue"
      data-testid="centered-trigger"
      :options="scrollOptions"
      placeholder="Select option"
      search-placeholder="Search option"
    />
  `,
})

const MultiKeywordComboboxHarness = defineComponent({
  components: { Combobox },
  setup() {
    const modelValue = ref('')

    return {
      modelValue,
      multiKeywordOptions,
    }
  },
  template: `
    <Combobox
      v-model="modelValue"
      data-testid="multi-keyword-trigger"
      :options="multiKeywordOptions"
      placeholder="Select option"
      search-placeholder="Search option"
    />
  `,
})

describe('Combobox', () => {
  it('候选集合为空时显示无可用选项', async () => {
    renderInBrowser(EmptyComboboxHarness, {
      global: {
        stubs: globalStubs,
      },
    })

    await page.getByTestId('empty-trigger').click()

    await expect.element(page.getByRole('status')).toBeVisible()
    await expect.element(page.getByRole('status')).toHaveTextContent('common.noOptions')
    await expect.element(page.getByRole('option')).not.toBeInTheDocument()
  })

  it('打开后会把焦点交给搜索框', async () => {
    renderInBrowser(ComboboxHarness, {
      global: {
        stubs: globalStubs,
      },
    })

    await page.getByTestId('motion-trigger').click()
    await userEvent.keyboard('j')

    await expect.element(page.getByPlaceholder('Search motion')).toHaveValue('j')
  })

  it('会根据搜索词过滤候选项', async () => {
    renderInBrowser(ComboboxHarness, {
      global: {
        stubs: globalStubs,
      },
    })

    await page.getByTestId('motion-trigger').click()
    await page.getByPlaceholder('Search motion').fill('jo')

    await expect.element(page.getByRole('option', { name: 'Joy' })).toBeInTheDocument()
    await expect.element(page.getByRole('option', { name: 'Idle' })).not.toBeInTheDocument()
  })

  it('搜索后方向键导航会从第一个匹配项开始', async () => {
    renderInBrowser(CenteredComboboxHarness, {
      global: {
        stubs: globalStubs,
      },
    })

    await page.getByTestId('centered-trigger').click()
    await page.getByPlaceholder('Search option').fill('1')
    await userEvent.keyboard('{ArrowDown}{Enter}')

    await expect.element(page.getByTestId('centered-trigger')).toHaveTextContent('Option 1')
  })

  it('搜索后直接按 Enter 不会误选最后一个匹配项', async () => {
    renderInBrowser(CenteredComboboxHarness, {
      global: {
        stubs: globalStubs,
      },
    })

    await page.getByTestId('centered-trigger').click()
    await page.getByPlaceholder('Search option').fill('1')
    await userEvent.keyboard('{Enter}')

    await expect.element(page.getByTestId('centered-trigger')).toHaveTextContent('Option 12')
  })

  it('支持方向键高亮并用 Enter 提交', async () => {
    renderInBrowser(ComboboxHarness, {
      global: {
        stubs: globalStubs,
      },
    })

    await page.getByTestId('motion-trigger').click()
    await userEvent.keyboard('{ArrowDown}{ArrowDown}{Enter}')

    await expect.element(page.getByTestId('motion-trigger')).toHaveTextContent('Joy')
  })

  it('无匹配项时显示可播报且不可选择的空状态', async () => {
    renderInBrowser(ComboboxHarness, {
      global: {
        stubs: globalStubs,
      },
    })

    await page.getByTestId('motion-trigger').click()
    await page.getByPlaceholder('Search motion').fill('zzz')

    await expect.element(page.getByRole('status')).toBeVisible()
    await expect.element(page.getByRole('status')).toHaveTextContent('common.noResults')
    await expect.element(page.getByRole('option')).not.toBeInTheDocument()
  })

  it('会把搜索词按空格拆分并要求所有关键词都命中', async () => {
    renderInBrowser(MultiKeywordComboboxHarness, {
      global: {
        stubs: globalStubs,
      },
    })

    await page.getByTestId('multi-keyword-trigger').click()
    await page.getByPlaceholder('Search option').fill('joy dark')

    await expect.element(page.getByRole('option', { name: 'Dark Joy' })).toBeInTheDocument()
    await expect.element(page.getByRole('option', { name: 'Dark Sad' })).not.toBeInTheDocument()
    await expect.element(page.getByRole('option', { name: 'Bright Joy' })).not.toBeInTheDocument()
  })
})
