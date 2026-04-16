import { describe, expect, it } from 'vitest'

import { useParamChoiceFieldViewModel } from '../useParamChoiceFieldViewModel'

import type { ParamSelectOptionItem } from '../controls/types'
import type { EditorField, ValueChoiceField } from '~/features/editor/command-registry/schema'

function createChoiceField(key: string = 'motion'): EditorField {
  const field: ValueChoiceField = {
    key,
    label: 'Motion',
    options: [
      { label: 'Static Joy', value: 'joy' },
      { label: 'Static Sad', value: 'sad' },
    ],
    placeholder: 'Select motion',
    type: 'choice',
    variant: 'combobox',
    customizable: true,
    customLabel: 'Custom motion',
  }

  return {
    key,
    field,
    storage: 'arg',
  } as EditorField
}

function createPathChoiceField(key: string = 'expression'): EditorField {
  const field: ValueChoiceField = {
    key,
    label: 'Expression',
    options: [],
    placeholder: 'Search expression',
    type: 'choice',
    variant: 'combobox',
    grouping: { mode: 'path' },
  }

  return {
    key,
    field,
    storage: 'arg',
  } as EditorField
}

describe('useParamChoiceFieldViewModel', () => {
  it('会合并动态和静态选项，并在依赖变化后保持动态选项优先级', async () => {
    const field = createChoiceField()
    const visibleFields = ref([field])
    const dynamicOptions = ref<ParamSelectOptionItem[]>([
      { label: 'Dynamic Joy', value: 'joy' },
      { label: 'Idle', value: 'idle' },
    ])
    const customLabel = ref('Custom motion')
    const placeholder = ref('Search motion')
    const selectValue = ref('joy')

    const viewModel = useParamChoiceFieldViewModel({
      getChoiceFieldMode: () => 'combobox',
      getComboboxPathDelimiter: () => '/',
      getCustomLabel: () => customLabel.value,
      getDynamicOptions: () => dynamicOptions.value,
      getPlaceholder: () => placeholder.value,
      getSelectValue: () => selectValue.value,
      isCustomField: () => false,
      i18nContent: () => '',
      shouldRenderSegmented: () => false,
      t: key => key,
      visibleFields: () => visibleFields.value,
    })

    expect(viewModel.viewModels.value.get(field.key)).toMatchObject({
      comboboxData: undefined,
      customLabel: 'Custom motion',
      isCustomField: false,
      mode: 'combobox',
      options: [
        { label: 'Dynamic Joy', value: 'joy' },
        { label: 'Idle', value: 'idle' },
        { label: 'Static Sad', value: 'sad' },
      ],
      placeholder: 'Search motion',
      renderSegmented: false,
      selectValue: 'joy',
    })

    dynamicOptions.value = [{ label: 'Joy', value: 'joy' }]
    placeholder.value = 'Filter motion'
    customLabel.value = 'Custom expression'
    selectValue.value = 'idle'

    await nextTick()

    expect(viewModel.viewModels.value.get(field.key)).toMatchObject({
      customLabel: 'Custom expression',
      isCustomField: false,
      placeholder: 'Filter motion',
      renderSegmented: false,
      selectValue: 'idle',
    })
    expect(viewModel.viewModels.value.get(field.key)?.options).toEqual([
      { label: 'Joy', value: 'joy' },
      { label: 'Static Sad', value: 'sad' },
    ])
  })

  it('仅在字段显式声明 path grouping 时构建级联浏览节点', () => {
    const field = createPathChoiceField()

    const viewModel = useParamChoiceFieldViewModel({
      getChoiceFieldMode: () => 'combobox',
      getComboboxPathDelimiter: () => '/',
      getCustomLabel: () => '',
      getDynamicOptions: () => [
        { label: 'sakiko/maskon/kime01', value: 'sakiko/maskon/kime01' },
        { label: 'sakiko/default', value: 'sakiko/default' },
      ],
      getPlaceholder: () => 'Search expression',
      getSelectValue: () => '',
      isCustomField: () => false,
      i18nContent: () => '',
      shouldRenderSegmented: () => false,
      t: key => key,
      visibleFields: () => [field],
    })

    expect(viewModel.viewModels.value.get(field.key)?.comboboxData).toMatchObject({
      browseNodes: [
        {
          kind: 'group',
          label: 'sakiko',
          children: [
            {
              kind: 'group',
              label: 'maskon',
              children: [
                { kind: 'item', label: 'kime01', rawLabel: 'sakiko/maskon/kime01', value: 'sakiko/maskon/kime01' },
              ],
            },
            { kind: 'item', label: 'default', rawLabel: 'sakiko/default', value: 'sakiko/default' },
          ],
        },
      ],
      searchDocuments: [
        { rawLabel: 'sakiko/maskon/kime01', pathText: 'sakiko/maskon/kime01', value: 'sakiko/maskon/kime01' },
        { rawLabel: 'sakiko/default', pathText: 'sakiko/default', value: 'sakiko/default' },
      ],
    })
  })

  it('path grouping 字段在分隔符为空时回退为基础 combobox', () => {
    const field = createPathChoiceField()

    const viewModel = useParamChoiceFieldViewModel({
      getChoiceFieldMode: () => 'combobox',
      getComboboxPathDelimiter: () => '',
      getCustomLabel: () => '',
      getDynamicOptions: () => [
        { label: 'sakiko/maskon/kime01', value: 'sakiko/maskon/kime01' },
      ],
      getPlaceholder: () => 'Search expression',
      getSelectValue: () => '',
      isCustomField: () => false,
      i18nContent: () => '',
      shouldRenderSegmented: () => false,
      t: key => key,
      visibleFields: () => [field],
    })

    expect(viewModel.viewModels.value.get(field.key)).toMatchObject({
      comboboxData: undefined,
      mode: 'combobox',
      options: [{ label: 'sakiko/maskon/kime01', value: 'sakiko/maskon/kime01' }],
    })
  })
})
