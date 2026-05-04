import { describe, expect, it } from 'vitest'

import { compareEngineVersions } from '../version'

describe('compareEngineVersions', () => {
  it('稳定版本优先于预发布版本', () => {
    expect(compareEngineVersions('1.0.0', '1.0.0-rc.1')).toBeLessThan(0)
    expect(compareEngineVersions('1.0.0-rc.1', '1.0.0')).toBeGreaterThan(0)
  })

  it('无效版本排在有效版本之后', () => {
    expect(compareEngineVersions('4.8.1', 'invalid-build')).toBeLessThan(0)
    expect(compareEngineVersions('invalid-build', '4.8.1')).toBeGreaterThan(0)
  })

  it('两个版本都无效时回退到带数字感知的本地排序', () => {
    expect(compareEngineVersions('build-2', 'build-10')).toBeGreaterThan(0)
  })

  it('将 undefined 和空字符串视为比任何有效值都更小', () => {
    expect(compareEngineVersions('1.0.0', undefined)).toBeLessThan(0)
    expect(compareEngineVersions(undefined, '1.0.0')).toBeGreaterThan(0)
    expect(compareEngineVersions(undefined, undefined)).toBe(0)
  })
})
