import { describe, expect, it } from 'vitest'

import { registerDynamicOptions, resolveDynamicOptions } from '~/helper/dynamic-options'

describe('动态选项注册表', () => {
  it('注册后可通过类型化键解析', () => {
    registerDynamicOptions('figureMotions', (ctx) => {
      if (!ctx.content) {
        return { options: [], loading: false }
      }
      return {
        options: [{ label: ctx.content, value: ctx.content }],
        loading: false,
      }
    })

    const result = resolveDynamicOptions('figureMotions', {
      content: 'idle',
      gamePath: '/game',
    })

    expect(result).toEqual({
      options: [{ label: 'idle', value: 'idle' }],
      loading: false,
    })
  })

  it('相同键的新解析器应覆盖旧解析器', () => {
    registerDynamicOptions('animationTableEntries', () => ({
      options: [{ label: 'old', value: 'old' }],
      loading: false,
    }))
    registerDynamicOptions('animationTableEntries', () => ({
      options: [{ label: 'new', value: 'new' }],
      loading: false,
    }))

    const result = resolveDynamicOptions('animationTableEntries', {
      content: '',
      gamePath: '/game',
    })

    expect(result).toEqual({
      options: [{ label: 'new', value: 'new' }],
      loading: false,
    })
  })
})
