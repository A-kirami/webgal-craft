import { describe, expect, it } from 'vitest'

import { UNSPECIFIED } from '~/features/editor/command-registry/schema'
import { readJsonFieldValue, writeJsonFieldValue } from '~/features/editor/statement-editor/json-fields'

describe('JSON 字段辅助函数', () => {
  it('readJsonFieldValue 按字段类型做值归一化', () => {
    expect(readJsonFieldValue('{"ratio":"0.25"}', 'ratio', 'number')).toBe(0.25)
    expect(readJsonFieldValue('{"enabled":"true"}', 'enabled', 'switch')).toBe(true)
    expect(readJsonFieldValue('{"asset":123}', 'asset', 'file')).toBe('123')
  })

  it('readJsonFieldValue 遇到非法 JSON 返回空字符串', () => {
    expect(readJsonFieldValue('{invalid', 'ratio', 'number')).toBe('')
  })

  it('writeJsonFieldValue 会保留其他字段并做 number/switch 转换', () => {
    expect(writeJsonFieldValue('{"keep":"x"}', 'ratio', '0.75', 'number')).toBe('{"keep":"x","ratio":0.75}')
    expect(writeJsonFieldValue('{"keep":"x"}', 'enabled', 'true', 'switch')).toBe('{"keep":"x","enabled":true}')
  })

  it('writeJsonFieldValue 在值为空或 UNSPECIFIED 时移除字段', () => {
    expect(writeJsonFieldValue('{"ratio":0.5}', 'ratio', '')).toBe('')
    expect(writeJsonFieldValue('{"ratio":0.5,"keep":"x"}', 'ratio', UNSPECIFIED)).toBe('{"keep":"x"}')
  })
})
