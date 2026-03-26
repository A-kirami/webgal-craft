import { beforeEach, describe, expect, it, vi } from 'vitest'
import { computed, nextTick, ref } from 'vue'

import { useStatementGroupDraft } from '../useStatementGroupDraft'

const {
  buildPreviousSpeakersMock,
  buildSingleStatementMock,
  getFactoryDefaultCommandTextMock,
} = vi.hoisted(() => ({
  buildPreviousSpeakersMock: vi.fn(),
  buildSingleStatementMock: vi.fn(),
  getFactoryDefaultCommandTextMock: vi.fn(),
}))

vi.mock('~/features/editor/command-registry/index', () => ({
  commandEntries: [],
  commandPanelCategories: [],
  getFactoryDefaultCommandText: getFactoryDefaultCommandTextMock,
}))

vi.mock('~/domain/script/sentence', () => ({
  buildSingleStatement: buildSingleStatementMock,
}))

vi.mock('~/utils/speaker', () => ({
  buildPreviousSpeakers: buildPreviousSpeakersMock,
}))

describe('useStatementGroupDraft', () => {
  beforeEach(() => {
    buildSingleStatementMock.mockReset()
    buildPreviousSpeakersMock.mockReset()
    getFactoryDefaultCommandTextMock.mockReset()
    let nextEntryId = 1

    buildSingleStatementMock.mockImplementation((rawText: string) => ({
      id: nextEntryId++,
      parsed: undefined,
      parseError: false,
      rawText,
    }))
    buildPreviousSpeakersMock.mockReturnValue([''])
    getFactoryDefaultCommandTextMock.mockReturnValue('say:Hello;')
  })

  it('打开时会初始化草稿并计算已修改状态', async () => {
    const open = ref(true)
    const group = ref({
      createdAt: Date.parse('2026-03-25T00:00:00Z'),
      id: 'group-1',
      name: 'Group A',
      rawTexts: ['say:A;', 'say:B;'],
    })

    const draft = useStatementGroupDraft({
      commandPanelStore: {
        getInsertText: vi.fn(),
        saveGroup: vi.fn(),
      },
      group: computed(() => group.value),
      modalStore: {
        open: vi.fn(),
      },
      open,
      t: key => key,
    })

    await nextTick()

    expect(draft.draftName.value).toBe('Group A')
    expect(draft.draftEntries.value.map(entry => entry.rawText)).toEqual(['say:A;', 'say:B;'])
    expect(draft.isDirty.value).toBe(false)

    draft.draftName.value = 'Group B'
    expect(draft.isDirty.value).toBe(true)
  })

  it('名称只有首尾空白变化时不算已修改', async () => {
    const open = ref(true)
    const modalOpen = vi.fn()

    const draft = useStatementGroupDraft({
      commandPanelStore: {
        getInsertText: vi.fn(),
        saveGroup: vi.fn(),
      },
      group: computed(() => ({
        createdAt: Date.parse('2026-03-25T00:00:00Z'),
        id: 'group-trimmed',
        name: 'Stable',
        rawTexts: ['say:Stable;'],
      })),
      modalStore: {
        open: modalOpen,
      },
      open,
      t: key => key,
    })

    await nextTick()
    draft.draftName.value = ' Stable '

    expect(draft.isDirty.value).toBe(false)

    draft.requestClose()

    expect(modalOpen).not.toHaveBeenCalled()
    expect(open.value).toBe(false)
  })

  it('存在未保存修改时关闭会弹出保存确认并可执行保存', async () => {
    const open = ref(true)
    const saveGroup = vi.fn()
    const modalOpen = vi.fn()

    const draft = useStatementGroupDraft({
      commandPanelStore: {
        getInsertText: vi.fn(),
        saveGroup,
      },
      group: computed(() => ({
        createdAt: Date.parse('2026-03-25T00:00:00Z'),
        id: 'group-2',
        name: 'Origin',
        rawTexts: ['say:Hello;'],
      })),
      modalStore: {
        open: modalOpen,
      },
      open,
      t: key => key,
    })

    await nextTick()
    draft.draftName.value = ' Updated Name '

    draft.requestClose()

    expect(modalOpen).toHaveBeenCalledTimes(1)
    const [, payload] = modalOpen.mock.calls[0]!
    await payload.onSave()

    expect(saveGroup).toHaveBeenCalledWith({
      createdAt: Date.parse('2026-03-25T00:00:00Z'),
      id: 'group-2',
      name: 'Updated Name',
      rawTexts: ['say:Hello;'],
    })
    expect(open.value).toBe(false)
  })

  it('未修改时关闭会直接关闭弹窗', async () => {
    const open = ref(true)
    const modalOpen = vi.fn()

    const draft = useStatementGroupDraft({
      commandPanelStore: {
        getInsertText: vi.fn(),
        saveGroup: vi.fn(),
      },
      group: computed(() => ({
        createdAt: Date.parse('2026-03-25T00:00:00Z'),
        id: 'group-3',
        name: 'Stable',
        rawTexts: ['say:Stable;'],
      })),
      modalStore: {
        open: modalOpen,
      },
      open,
      t: key => key,
    })

    await nextTick()

    draft.requestClose()

    expect(modalOpen).not.toHaveBeenCalled()
    expect(open.value).toBe(false)
  })
})
