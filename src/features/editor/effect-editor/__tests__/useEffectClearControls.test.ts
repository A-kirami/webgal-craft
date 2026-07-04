import { describe, expect, it, vi } from 'vitest'
import { reactive } from 'vue'

import { useEffectClearControls } from '~/features/editor/effect-editor/useEffectClearControls'

import type { EffectControlDeps } from '~/features/editor/effect-editor/types'

function createDeps(initialFields: Record<string, string>) {
  const fields = reactive({ ...initialFields }) as Record<string, string>
  const emitTransform = vi.fn()

  const deps: EffectControlDeps = {
    getFields: () => fields,
    getFieldValue: path => fields[path] ?? '',
    getStoredFieldValue: path => fields[path],
    getNumberValue: () => 0,
    setNumericField: vi.fn(),
    emitTransform,
  }

  return { deps, fields, emitTransform }
}

describe('useEffectClearControls', () => {
  it('会清除成组路径，并只触发一次立即 flush 更新', () => {
    const { deps, fields, emitTransform } = createDeps({
      'scale.x': '1',
      'scale.y': '1',
      'alpha': '0.5',
    })
    const controls = useEffectClearControls(deps)

    expect(controls.canClearPaths(['scale.x', 'scale.y'])).toBe(true)

    controls.clearPaths(['scale.x', 'scale.y'], {
      schedule: 'immediate',
      flush: true,
    })

    expect(fields['scale.x']).toBeUndefined()
    expect(fields['scale.y']).toBeUndefined()
    expect(fields.alpha).toBe('0.5')
    expect(emitTransform).toHaveBeenCalledWith(fields, {
      schedule: 'immediate',
      flush: true,
      deferAutoApply: false,
    })
  })

  it('当所有目标路径本来就不存在时不会触发更新', () => {
    const { deps, emitTransform } = createDeps({})
    const controls = useEffectClearControls(deps)

    expect(controls.canClearPaths(['blur'])).toBe(false)

    controls.clearPaths(['blur'], {
      schedule: 'immediate',
      flush: true,
    })

    expect(emitTransform).not.toHaveBeenCalled()
  })
})
