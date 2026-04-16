import { describe, expect, it } from 'vitest'

import { editSettingsDefinition } from '../edit-settings'

describe('editSettingsDefinition', () => {
  it('用独立开关控制路径型 combobox 分隔符字段的可见性', () => {
    const { fields } = editSettingsDefinition.schema.visualEditor

    expect(fields.enableComboboxPathDelimiter).toMatchObject({
      type: 'switch',
      default: true,
    })
    expect(fields.comboboxPathDelimiter.visibleWhen).toBe('enableComboboxPathDelimiter')
  })
})
