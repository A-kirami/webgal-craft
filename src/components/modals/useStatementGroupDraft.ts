import { computed, markRaw, ref, toValue, watch } from 'vue'
import { commandType } from 'webgal-parser/src/interface/sceneInterface'

import { StatementUpdatePayload } from '~/composables/useStatementEditor'
import { commandEntries, commandPanelCategories, getFactoryDefaultCommandText } from '~/helper/command-registry/index'
import { buildSingleStatement, StatementEntry } from '~/helper/webgal-script/sentence'
import { StatementGroup } from '~/stores/command-panel'
import { buildPreviousSpeakers } from '~/utils/speaker'

import type { MaybeRefOrGetter, Ref } from 'vue'

interface CommandPanelStoreAdapter {
  getInsertText: (type: commandType) => string
  saveGroup: (input: Omit<StatementGroup, 'id' | 'createdAt'> & Partial<Pick<StatementGroup, 'id' | 'createdAt'>>) => StatementGroup | undefined
}

interface ModalStoreAdapter {
  open: (
    name: 'SaveChangesModal',
    payload: {
      title: string
      onSave: () => void | Promise<void>
      onDontSave: () => void | Promise<void>
    },
  ) => void
}

interface UseStatementGroupDraftOptions {
  group: MaybeRefOrGetter<StatementGroup | undefined>
  open: Ref<boolean>
  t: (key: string, params?: Record<string, string>) => string
  commandPanelStore: CommandPanelStoreAdapter
  modalStore: ModalStoreAdapter
}

export function useStatementGroupDraft(options: UseStatementGroupDraftOptions) {
  const draftName = ref('')
  const draftEntries = ref<StatementEntry[]>([])
  const collapsedEntryIds = ref<Partial<Record<number, true>>>({})
  const initialName = ref('')
  const initialRawTexts = ref<string[]>([])

  const group = computed(() => toValue(options.group))
  const isEditing = computed(() => !!group.value)
  const currentRawTexts = computed(() => draftEntries.value.map(entry => entry.rawText))
  const trimmedDraftName = computed(() => draftName.value.trim())
  const isDirty = computed(() => {
    if (trimmedDraftName.value !== initialName.value) {
      return true
    }
    if (currentRawTexts.value.length !== initialRawTexts.value.length) {
      return true
    }
    return currentRawTexts.value.some((text, index) => text !== initialRawTexts.value[index])
  })
  const groupedCommandEntries = commandPanelCategories.map(category => ({
    category,
    entries: commandEntries.filter(entry => entry.category === category),
  }))
  const previousSpeakers = computed(() => buildPreviousSpeakers(draftEntries.value))
  const canSave = computed(() => trimmedDraftName.value.length > 0 && draftEntries.value.length > 0)

  function closeDialog(): void {
    options.open.value = false
  }

  function findDraftEntryIndex(id: number): number {
    return draftEntries.value.findIndex(entry => entry.id === id)
  }

  function replaceDraftEntry(index: number, entry: StatementEntry): void {
    const nextEntries = [...draftEntries.value]
    nextEntries.splice(index, 1, markRaw(entry))
    draftEntries.value = nextEntries
  }

  function removeDraftEntry(index: number): void {
    const nextEntries = [...draftEntries.value]
    nextEntries.splice(index, 1)
    draftEntries.value = nextEntries
  }

  function reconcileCollapsedEntries(): void {
    const validIds = new Set(draftEntries.value.map(entry => entry.id))
    const nextCollapsedEntryIds: Partial<Record<number, true>> = {}
    let changed = false

    for (const rawEntryId of Object.keys(collapsedEntryIds.value)) {
      const entryId = Number(rawEntryId)
      if (validIds.has(entryId)) {
        nextCollapsedEntryIds[entryId] = true
        continue
      }

      changed = true
    }

    if (changed) {
      collapsedEntryIds.value = nextCollapsedEntryIds
    }
  }

  function resetDraft(): void {
    draftName.value = group.value?.name ?? ''
    draftEntries.value = (group.value?.rawTexts ?? [])
      .map(rawText => buildSingleStatement(rawText))
      .filter((entry): entry is StatementEntry => entry !== undefined)
    collapsedEntryIds.value = {}
    initialName.value = trimmedDraftName.value
    initialRawTexts.value = draftEntries.value.map(entry => entry.rawText)
  }

  function isEntryCollapsed(entryId: number): boolean {
    return collapsedEntryIds.value[entryId] === true
  }

  function handleDialogOpenChange(nextOpen: boolean): void {
    if (!nextOpen) {
      requestClose()
    }
  }

  function handleDialogOpenAutoFocus(event: Event): void {
    if (isEditing.value) {
      event.preventDefault()
    }
  }

  function handleAppendCommand(type: commandType): void {
    const nextEntry = buildSingleStatement(options.commandPanelStore.getInsertText(type))
    if (!nextEntry) {
      return
    }
    draftEntries.value = [...draftEntries.value, nextEntry]
  }

  function handleEntryUpdate(payload: StatementUpdatePayload): void {
    const target = payload.target
    if (target.kind !== 'statement') {
      return
    }

    const index = findDraftEntryIndex(target.statementId)
    if (index === -1) {
      return
    }

    replaceDraftEntry(index, {
      ...draftEntries.value[index]!,
      rawText: payload.rawText,
      parsed: payload.parsed,
      parseError: false,
    })
  }

  function handleCollapsedUpdate(index: number, collapsed: boolean): void {
    const entry = draftEntries.value[index]
    if (!entry) {
      return
    }

    if (collapsed) {
      collapsedEntryIds.value = {
        ...collapsedEntryIds.value,
        [entry.id]: true,
      }
      return
    }

    if (!isEntryCollapsed(entry.id)) {
      return
    }

    const nextCollapsedEntryIds = { ...collapsedEntryIds.value }
    delete nextCollapsedEntryIds[entry.id]
    collapsedEntryIds.value = nextCollapsedEntryIds
  }

  function moveEntry(index: number, direction: -1 | 1): void {
    const targetIndex = index + direction
    if (!draftEntries.value[index] || !draftEntries.value[targetIndex]) {
      return
    }
    const nextEntries = [...draftEntries.value]
    const [item] = nextEntries.splice(index, 1)
    nextEntries.splice(targetIndex, 0, item)
    draftEntries.value = nextEntries
  }

  function deleteEntry(id: number): void {
    const index = findDraftEntryIndex(id)
    if (index === -1) {
      return
    }
    removeDraftEntry(index)
  }

  function isEntryAtFactory(entry: StatementEntry): boolean {
    if (!entry.parsed) {
      return true
    }
    return entry.rawText === getFactoryDefaultCommandText(entry.parsed.command)
  }

  function resetEntry(id: number): void {
    const index = findDraftEntryIndex(id)
    if (index === -1) {
      return
    }
    const entry = draftEntries.value[index]
    if (!entry.parsed) {
      return
    }

    const factoryRawText = getFactoryDefaultCommandText(entry.parsed.command)
    const rebuilt = buildSingleStatement(factoryRawText)
    if (!rebuilt) {
      return
    }

    replaceDraftEntry(index, { ...rebuilt, id: entry.id })
    notify.success(options.t('edit.visualEditor.commandPanel.resetSuccess'))
  }

  function handleSaveGroup(): void {
    if (!canSave.value) {
      return
    }

    options.commandPanelStore.saveGroup({
      id: group.value?.id,
      createdAt: group.value?.createdAt,
      name: trimmedDraftName.value,
      rawTexts: currentRawTexts.value,
    })
    closeDialog()
  }

  function requestClose(): void {
    if (!isDirty.value) {
      closeDialog()
      return
    }

    options.modalStore.open('SaveChangesModal', {
      title: options.t('modals.saveChanges.title', { name: draftName.value || options.t('edit.visualEditor.commandPanel.createGroup') }),
      onSave: handleSaveGroup,
      onDontSave: closeDialog,
    })
  }

  watch(
    () => [options.open.value, group.value?.id] as const,
    ([isOpen]) => {
      if (!isOpen) {
        return
      }
      resetDraft()
    },
    { immediate: true },
  )

  watch(
    () => draftEntries.value.map(entry => entry.id),
    reconcileCollapsedEntries,
  )

  return {
    draftName,
    draftEntries,
    isEditing,
    previousSpeakers,
    groupedCommandEntries,
    canSave,
    isDirty,
    isEntryCollapsed,
    isEntryAtFactory,
    handleDialogOpenChange,
    handleDialogOpenAutoFocus,
    handleAppendCommand,
    handleEntryUpdate,
    handleCollapsedUpdate,
    moveEntry,
    deleteEntry,
    resetEntry,
    handleSaveGroup,
    requestClose,
  }
}
