import { beforeEach, describe, expect, it, vi } from 'vitest'
import { computed, nextTick, ref } from 'vue'

import { useStatementGroupDraft } from '../useStatementGroupDraft'

const {
  buildPreviousSpeakersMock,
  buildSingleStatementMock,
  getFactoryDefaultCommandTextMock,
  splitStatementsMock,
} = vi.hoisted(() => ({
  buildPreviousSpeakersMock: vi.fn(),
  buildSingleStatementMock: vi.fn(),
  getFactoryDefaultCommandTextMock: vi.fn(),
  splitStatementsMock: vi.fn(),
}))

vi.mock('~/features/editor/command-registry/index', () => ({
  commandEntries: [],
  commandPanelCategories: [],
  getFactoryDefaultCommandText: getFactoryDefaultCommandTextMock,
}))

vi.mock('~/domain/script/sentence', () => ({
  buildSingleStatement: buildSingleStatementMock,
  splitStatements: splitStatementsMock,
}))

vi.mock('~/utils/speaker', () => ({
  buildPreviousSpeakers: buildPreviousSpeakersMock,
}))

describe('useStatementGroupDraft', () => {
  beforeEach(() => {
    buildSingleStatementMock.mockReset()
    buildPreviousSpeakersMock.mockReset()
    getFactoryDefaultCommandTextMock.mockReset()
    splitStatementsMock.mockReset()
    let nextEntryId = 1

    buildSingleStatementMock.mockImplementation((rawText: string) => ({
      id: nextEntryId++,
      parsed: undefined,
      parseError: false,
      rawText,
    }))
    buildPreviousSpeakersMock.mockReturnValue([''])
    getFactoryDefaultCommandTextMock.mockReturnValue('say:Hello;')
    splitStatementsMock.mockImplementation((text: string) => text === '' ? [] : text.split('\n'))
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
      initialEditorMode: 'visual',
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

  it('打开时使用当前编辑器模式作为初始视图', async () => {
    const open = ref(true)
    const initialEditorMode = ref<'text' | 'visual'>('text')
    const draft = useStatementGroupDraft({
      commandPanelStore: {
        getInsertText: vi.fn(),
        saveGroup: vi.fn(),
      },
      group: computed(() => ({
        createdAt: Date.parse('2026-03-25T00:00:00Z'),
        id: 'group-mode-initial',
        name: 'Mode',
        rawTexts: ['say:Hello;'],
      })),
      initialEditorMode,
      modalStore: { open: vi.fn() },
      open,
      t: key => key,
    })

    await nextTick()
    expect(draft.editorMode.value).toBe('text')

    initialEditorMode.value = 'visual'
    open.value = false
    await nextTick()
    open.value = true
    await nextTick()

    expect(draft.editorMode.value).toBe('visual')
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
      initialEditorMode: 'visual',
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
      initialEditorMode: 'visual',
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
      initialEditorMode: 'visual',
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

  it('切换到文本模式后可编辑并无损切回可视化模式', async () => {
    const open = ref(true)
    const draft = useStatementGroupDraft({
      commandPanelStore: {
        getInsertText: vi.fn(),
        saveGroup: vi.fn(),
      },
      group: computed(() => ({
        createdAt: Date.parse('2026-03-25T00:00:00Z'),
        id: 'group-mode',
        name: 'Mode',
        rawTexts: ['changeFigure:hero.png\n  -id=hero;', 'say:Done;'],
      })),
      initialEditorMode: 'visual',
      modalStore: { open: vi.fn() },
      open,
      t: key => key,
    })

    await nextTick()
    draft.switchEditorMode('text')

    expect(draft.editorMode.value).toBe('text')
    expect(draft.draftText.value).toBe('changeFigure:hero.png\n  -id=hero;\nsay:Done;')

    draft.draftText.value = 'say:Changed;\nwait:1000;'
    draft.switchEditorMode('visual')

    expect(draft.editorMode.value).toBe('visual')
    expect(draft.draftEntries.value.map(entry => entry.rawText)).toEqual(['say:Changed;', 'wait:1000;'])
  })

  it('文本模式保存时使用最新文本拆分结果', async () => {
    const open = ref(true)
    const saveGroup = vi.fn()
    const draft = useStatementGroupDraft({
      commandPanelStore: {
        getInsertText: vi.fn(),
        saveGroup,
      },
      group: computed(() => undefined),
      initialEditorMode: 'visual',
      modalStore: { open: vi.fn() },
      open,
      t: key => key,
    })

    await nextTick()
    draft.draftName.value = 'New group'
    draft.switchEditorMode('text')
    draft.draftText.value = 'say:Hello;\nwait:1000;'
    draft.handleSaveGroup()

    expect(saveGroup).toHaveBeenCalledWith({
      createdAt: undefined,
      id: undefined,
      name: 'New group',
      rawTexts: ['say:Hello;', 'wait:1000;'],
    })
    expect(open.value).toBe(false)
  })

  it('文本无法无损拆分时不会切换或保存', async () => {
    const open = ref(true)
    const saveGroup = vi.fn()
    const draft = useStatementGroupDraft({
      commandPanelStore: {
        getInsertText: vi.fn(),
        saveGroup,
      },
      group: computed(() => undefined),
      initialEditorMode: 'visual',
      modalStore: { open: vi.fn() },
      open,
      t: key => key,
    })

    await nextTick()
    draft.draftName.value = 'Lossy'
    draft.switchEditorMode('text')
    splitStatementsMock.mockImplementation((text: string) => {
      if (text === 'say:Hello;\n') {
        return ['say:Hello;']
      }
      return text === '' ? [] : text.split('\n')
    })
    draft.draftText.value = 'say:Hello;\n'

    expect(draft.textModeHasLoss.value).toBe(true)
    draft.switchEditorMode('visual')
    draft.handleSaveGroup()

    expect(draft.editorMode.value).toBe('text')
    expect(saveGroup).not.toHaveBeenCalled()
  })
})
