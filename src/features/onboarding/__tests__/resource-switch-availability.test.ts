import { describe, expect, it } from 'vitest'

import { createTestEngine, createTestTemplate } from '~/__tests__/factories'

import { hasSwitchableResourceAlternative } from '../resource-switch-availability'

const CURRENT_ENGINE_ID = 'engine-current'

describe('hasSwitchableResourceAlternative', () => {
  it('自带引擎项目没有任何可切换的入口', () => {
    expect(hasSwitchableResourceAlternative({
      currentEngineId: undefined,
      engines: [createTestEngine({ id: 'engine-2' })],
      templates: [createTestTemplate()],
    })).toBe(false)
  })

  it('只有当前引擎且没有模板时没有替代项', () => {
    expect(hasSwitchableResourceAlternative({
      currentEngineId: CURRENT_ENGINE_ID,
      engines: [createTestEngine({ id: CURRENT_ENGINE_ID })],
      templates: [],
    })).toBe(false)
  })

  it('存在另一个编辑器兼容的引擎时有替代项', () => {
    expect(hasSwitchableResourceAlternative({
      currentEngineId: CURRENT_ENGINE_ID,
      engines: [
        createTestEngine({ id: CURRENT_ENGINE_ID }),
        createTestEngine({ id: 'engine-2' }),
      ],
      templates: [],
    })).toBe(true)
  })

  it('另一个引擎不可用时不算替代项', () => {
    expect(hasSwitchableResourceAlternative({
      currentEngineId: CURRENT_ENGINE_ID,
      engines: [
        createTestEngine({ id: CURRENT_ENGINE_ID }),
        createTestEngine({ availability: 'broken', id: 'engine-2' }),
      ],
      templates: [],
    })).toBe(false)
  })

  it('存在可用独立模板时有替代项', () => {
    expect(hasSwitchableResourceAlternative({
      currentEngineId: CURRENT_ENGINE_ID,
      engines: [createTestEngine({ id: CURRENT_ENGINE_ID })],
      templates: [createTestTemplate()],
    })).toBe(true)
  })

  it('独立模板不可用时不算替代项', () => {
    expect(hasSwitchableResourceAlternative({
      currentEngineId: CURRENT_ENGINE_ID,
      engines: [createTestEngine({ id: CURRENT_ENGINE_ID })],
      templates: [createTestTemplate({ availability: 'broken' })],
    })).toBe(false)
  })
})
