import { beforeEach, describe, expect, it, vi } from 'vitest'

import '~/__tests__/setup'

import { getFactoryDefaultCommandText } from '~/helper/command-registry'
import { parseSentence } from '~/helper/webgal-script/parser'
import { useCommandPanelStore } from '~/stores/command-panel'

vi.mock('~/helper/command-registry', () => ({
  getFactoryDefaultCommandText: vi.fn((type: number) => `factory:${type}`),
}))
vi.mock('~/helper/webgal-script/parser', () => ({
  parseSentence: vi.fn(),
}))
vi.mock('webgal-parser/src/interface/sceneInterface', () => ({
  commandType: { say: 0, changeBg: 1 },
}))

function createParsedSentence(command: number): NonNullable<ReturnType<typeof parseSentence>> {
  return { command } as NonNullable<ReturnType<typeof parseSentence>>
}

describe('useCommandPanelStore', () => {
  let store: ReturnType<typeof useCommandPanelStore>

  beforeEach(() => {
    store = useCommandPanelStore()
    vi.clearAllMocks()
  })

  // --- getInsertText ---

  it('getInsertText 无自定义时返回出厂默认', () => {
    expect(store.getInsertText(0)).toBe('factory:0')
    expect(getFactoryDefaultCommandText).toHaveBeenCalledWith(0)
  })

  // --- saveDefault ---

  it('saveDefault 保存自定义默认值', () => {
    store.saveDefault(0, 'custom say')
    expect(store.getInsertText(0)).toBe('custom say')
  })

  it('saveDefault 值与出厂默认相同时自动删除自定义', () => {
    store.saveDefault(0, 'custom say')
    // 保存与出厂默认相同的值，应自动清除
    store.saveDefault(0, 'factory:0')
    expect(store.defaults[0]).toBeUndefined()
    expect(store.getInsertText(0)).toBe('factory:0')
  })

  // --- resetDefault ---

  it('resetDefault 移除自定义默认值', () => {
    store.saveDefault(1, 'custom bg')
    store.resetDefault(1)
    expect(store.defaults[1]).toBeUndefined()
    expect(store.getInsertText(1)).toBe('factory:1')
  })

  // --- saveGroup ---

  it('saveGroup 创建新组并生成 UUID', () => {
    const result = store.saveGroup({ name: 'test group', rawTexts: ['a', 'b'] })
    expect(result.id).toBeTruthy()
    expect(result.name).toBe('test group')
    expect(result.rawTexts).toEqual(['a', 'b'])
    expect(store.groups).toHaveLength(1)
  })

  it('saveGroup 更新已有组（保留 ID）', () => {
    const created = store.saveGroup({ name: 'original', rawTexts: ['x'] })
    store.saveGroup({ id: created.id, name: 'updated', rawTexts: ['y', 'z'], createdAt: created.createdAt })
    expect(store.groups).toHaveLength(1)
    expect(store.groups[0].name).toBe('updated')
    expect(store.groups[0].rawTexts).toEqual(['y', 'z'])
    expect(store.groups[0].id).toBe(created.id)
  })

  it('saveGroup 自动 trim 名称', () => {
    const result = store.saveGroup({ name: '  padded name  ', rawTexts: [] })
    expect(result.name).toBe('padded name')
  })

  // --- deleteGroup ---

  it('deleteGroup 删除已有组', () => {
    const g = store.saveGroup({ name: 'to delete', rawTexts: [] })
    store.deleteGroup(g.id)
    expect(store.groups).toHaveLength(0)
  })

  it('deleteGroup 对不存在的 ID 无副作用', () => {
    store.saveGroup({ name: 'keep', rawTexts: [] })
    store.deleteGroup('non-existent-id')
    expect(store.groups).toHaveLength(1)
  })

  // --- resetGroup ---

  it('resetGroup 将组内 rawTexts 重置为出厂默认', () => {
    const g = store.saveGroup({ name: 'grp', rawTexts: ['custom say', 'custom bg'] })

    // parseSentence 分别返回对应的命令类型
    vi.mocked(parseSentence)
      .mockReturnValueOnce(createParsedSentence(0))
      .mockReturnValueOnce(createParsedSentence(1))

    store.resetGroup(g.id)

    const updated = store.groups.find(x => x.id === g.id)!
    expect(updated.rawTexts).toEqual(['factory:0', 'factory:1'])
  })

  it('resetGroup 当 parseSentence 返回 undefined 时保留原文本', () => {
    const g = store.saveGroup({ name: 'grp', rawTexts: ['unparseable', 'custom bg'] })

    vi.mocked(parseSentence)
      .mockReturnValueOnce(undefined)
      .mockReturnValueOnce(createParsedSentence(1))

    store.resetGroup(g.id)

    const updated = store.groups.find(x => x.id === g.id)!
    expect(updated.rawTexts).toEqual(['unparseable', 'factory:1'])
  })

  // --- setActiveCategory ---

  it('setActiveCategory 更新当前分类', () => {
    expect(store.activeCategory).toBe('all')
    store.setActiveCategory('groups')
    expect(store.activeCategory).toBe('groups')
  })
})
