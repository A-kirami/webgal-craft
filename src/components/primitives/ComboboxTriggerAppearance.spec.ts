import { describe, expect, it } from 'vitest'
import { page } from 'vitest/browser'
import { defineComponent } from 'vue'

import { renderInBrowser } from '~/__tests__/browser-render'
// @unocss-safelist hover:bg-background! hover:bg-accent bg-background
import 'virtual:uno.css'

import CascadingCombobox from './CascadingCombobox.vue'
import { buildCascadingComboboxData } from './combobox/cascading-combobox-data'
import Combobox from './Combobox.vue'

import type { Component } from 'vue'

const options = [
  { label: 'Idle', value: 'idle' },
  { label: 'Joy', value: 'joy' },
]

const cascadingData = buildCascadingComboboxData(
  [
    { label: 'chara/variant01', value: 'chara/variant01' },
    { label: 'chara/variant02', value: 'chara/variant02' },
  ],
  { grouping: { mode: 'path' }, resolvedDelimiter: '/' },
)

const ComboboxHarness = defineComponent({
  components: { Combobox },
  setup() {
    const modelValue = ref('')

    return {
      modelValue,
      options,
    }
  },
  template: `
    <div>
      <label for="appearance-combobox">Scene label</label>
      <Combobox
        id="appearance-combobox"
        v-model="modelValue"
        data-testid="appearance-combobox"
        :options="options"
        placeholder="Not selected"
        search-placeholder="Search motion"
      />
    </div>
  `,
})

const CascadingComboboxHarness = defineComponent({
  components: { CascadingCombobox },
  setup() {
    const modelValue = ref('')

    return {
      cascadingData,
      modelValue,
    }
  },
  template: `
    <div>
      <label for="appearance-cascading">Scene label</label>
      <CascadingCombobox
        id="appearance-cascading"
        v-model="modelValue"
        data-testid="appearance-cascading"
        :browse-nodes="cascadingData.browseNodes"
        :search-documents="cascadingData.searchDocuments"
        placeholder="Not selected"
        search-placeholder="Search motion"
      />
    </div>
  `,
})

function backgroundOf(testId: string) {
  return getComputedStyle(page.getByTestId(testId).element()).backgroundColor
}

// Select 的触发器没有 hover 背景，组合框触发器不能因为指针停在关联标签上就呈现悬停态。
function describeTriggerHover(name: string, harness: Component, testId: string) {
  describe(name, () => {
    it('关联标签悬停不会让控件呈现悬停态，指针进入控件才呈现', async () => {
      await renderInBrowser(harness)

      const restBackground = backgroundOf(testId)

      await page.getByText('Scene label').hover()

      await expect.poll(() => backgroundOf(testId)).toBe(restBackground)

      await page.getByTestId(testId).hover()

      await expect.poll(() => backgroundOf(testId)).not.toBe(restBackground)
    })
  })
}

await describeTriggerHover('Combobox 触发器', ComboboxHarness, 'appearance-combobox')
await describeTriggerHover('CascadingCombobox 触发器', CascadingComboboxHarness, 'appearance-cascading')
