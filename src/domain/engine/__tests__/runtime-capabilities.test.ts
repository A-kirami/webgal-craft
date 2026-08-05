import { describe, expect, it } from 'vitest'

import {
  isWebgalEditorRuntimeCompatible,
  normalizeWebgalRuntimeVersion,
  resolveEngineRuntimeCapabilities,
  supportsEngineRuntimeCapability,
} from '~/domain/engine/runtime-capabilities'

describe('Engine runtime capabilities', () => {
  it('仅接受严格的 WebGAL 运行时版本', () => {
    expect(normalizeWebgalRuntimeVersion(' 4.6.3 ')).toBe('4.6.3')
    expect(normalizeWebgalRuntimeVersion('4.6')).toBeUndefined()
    expect(normalizeWebgalRuntimeVersion('4.6.3-beta.1')).toBe('4.6.3-beta.1')
    expect(normalizeWebgalRuntimeVersion(undefined)).toBeUndefined()
  })

  it('从引擎版本派生多行语句能力', () => {
    expect(resolveEngineRuntimeCapabilities('4.6.2')).toEqual({
      multilineStatements: false,
    })
    expect(resolveEngineRuntimeCapabilities('4.6.3')).toEqual({
      multilineStatements: true,
    })
    expect(resolveEngineRuntimeCapabilities('4.10.0')).toEqual({
      multilineStatements: true,
    })
  })

  it('保留独立于特性的编辑器最低运行时版本', () => {
    expect(isWebgalEditorRuntimeCompatible('4.6.1')).toBe(false)
    expect(isWebgalEditorRuntimeCompatible('4.6.2')).toBe(true)
  })

  it('无效或早于稳定阈值的预发布版本不会启用运行时能力', () => {
    expect(supportsEngineRuntimeCapability('4.6.3-beta.1', 'multilineStatements')).toBe(false)
    expect(supportsEngineRuntimeCapability(undefined, 'multilineStatements')).toBe(false)
  })
})
