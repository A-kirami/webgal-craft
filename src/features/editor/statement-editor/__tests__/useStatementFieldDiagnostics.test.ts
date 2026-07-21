import { beforeEach, describe, expect, it, vi } from 'vitest'
import { computed, ref } from 'vue'

import { RelPath } from '~/domain/path'
import { parseSentence } from '~/domain/script/parser'
import { useStatementFieldDiagnostics } from '~/features/editor/statement-editor/useStatementFieldDiagnostics'

import type { SceneEditorDiagnostic } from '~/features/editor/diagnostics/types'

const { useResourceIndexMock } = vi.hoisted(() => ({
  useResourceIndexMock: vi.fn(),
}))

vi.mock('~/services/resource-index/service', () => ({
  useResourceIndex: useResourceIndexMock,
}))

function missingArgumentDiagnostic(key: string): SceneEditorDiagnostic {
  return {
    assetKey: {
      assetType: 'animation',
      relativePath: RelPath.from(`${key}.json`),
      root: 'asset',
    },
    code: 'missing-resource',
    field: { kind: 'argument', key },
    severity: 'error',
    source: 'resource',
    statementIndex: 0,
    value: key,
  }
}

describe('useStatementFieldDiagnostics', () => {
  const hasAssetKey = vi.fn()
  const resourceIndexStatus = ref<'idle' | 'ready'>('ready')

  beforeEach(() => {
    hasAssetKey.mockReset()
    resourceIndexStatus.value = 'ready'
    useResourceIndexMock.mockReturnValue({
      hasAssetKey,
      status: resourceIndexStatus,
    })
  })

  it('已发布诊断按完整字段地址解析且不会回退到本地资源检查', () => {
    const diagnostics = ref<readonly SceneEditorDiagnostic[] | undefined>([
      missingArgumentDiagnostic('enter'),
    ])
    const parsed = computed(() => parseSentence('setTransition: -enter=effects/missing -exit=effects/missing;'))
    hasAssetKey.mockReturnValue(false)

    const result = useStatementFieldDiagnostics({ diagnostics, parsed })

    expect(result.getFieldDiagnostics({ kind: 'argument', key: 'enter' })).toEqual([
      missingArgumentDiagnostic('enter'),
    ])
    expect(result.getFieldStatus({ kind: 'argument', key: 'enter' })).toBe('error')
    expect(result.getFieldStatus({ kind: 'argument', key: 'exit' })).toBe('none')
    expect(hasAssetKey).not.toHaveBeenCalled()
  })

  it('已发布空诊断代表文档无问题且不会触发本地 fallback', () => {
    const diagnostics = ref<readonly SceneEditorDiagnostic[] | undefined>([])
    const parsed = computed(() => parseSentence('changeBg:missing.png;'))
    hasAssetKey.mockReturnValue(false)

    const result = useStatementFieldDiagnostics({ diagnostics, parsed })

    expect(result.getFieldStatus({ kind: 'content' })).toBe('none')
    expect(hasAssetKey).not.toHaveBeenCalled()
  })

  it('临时草稿使用统一资源规则即时计算字段错误', () => {
    const parsed = computed(() => parseSentence('setTransition: -enter=effects/missing -exit=effects/exists;'))
    hasAssetKey.mockImplementation(key => key.relativePath === 'effects/exists.json')

    const result = useStatementFieldDiagnostics({ parsed })

    expect(result.getFieldDiagnostics({ kind: 'argument', key: 'enter' })).toMatchObject([
      {
        code: 'missing-resource',
        field: { kind: 'argument', key: 'enter' },
        severity: 'error',
        value: 'effects/missing',
      },
    ])
    expect(result.getFieldStatus({ kind: 'argument', key: 'enter' })).toBe('error')
    expect(result.getFieldStatus({ kind: 'argument', key: 'exit' })).toBe('none')
  })

  it('资源索引未就绪时不产生临时草稿误报', () => {
    resourceIndexStatus.value = 'idle'
    const parsed = computed(() => parseSentence('changeBg:missing.png;'))

    const result = useStatementFieldDiagnostics({ parsed })

    expect(result.getFieldStatus({ kind: 'content' })).toBe('none')
    expect(hasAssetKey).not.toHaveBeenCalled()
  })
})
