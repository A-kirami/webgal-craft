<script setup lang="ts">
import { commandType } from 'webgal-parser/src/interface/sceneInterface'

import { useEffectEditorDialog } from '~/composables/useEffectEditorDialog'
import { StatementUpdatePayload } from '~/composables/useStatementEditor'
import { getCommandConfig, getCommandDescription, getFactoryDefaultCommandText } from '~/helper/command-registry/index'
import { resolveI18n } from '~/helper/command-registry/schema'
import { buildSingleStatement, StatementEntry } from '~/helper/webgal-script/sentence'
import { useCommandPanelStore } from '~/stores/command-panel'
import { useModalStore } from '~/stores/modal'

interface Props {
  type?: commandType
}

const props = defineProps<Props>()

const open = defineModel<boolean>('open', { default: false })

const { t } = useI18n()
const commandPanelStore = useCommandPanelStore()
const effectDialog = useEffectEditorDialog()
const modalStore = useModalStore()

let draftEntry = $ref<StatementEntry>()
let initialRawText = $ref('')

const currentType = $computed(() => props.type)
const currentCommandConfig = $computed(() => currentType === undefined ? undefined : getCommandConfig(currentType))
const factoryRawText = $computed(() => currentType === undefined ? '' : getFactoryDefaultCommandText(currentType))
const isDirty = $computed(() => draftEntry !== undefined && draftEntry.rawText !== initialRawText)
const isFactory = $computed(() => draftEntry !== undefined && draftEntry.rawText === factoryRawText)
const commandName = $computed(() => currentCommandConfig ? resolveI18n(currentCommandConfig.label, t) : '')
const dialogTitle = $computed(() => currentType === undefined ? '' : t('edit.visualEditor.commandPanel.editDefaultsTitle', { command: commandName }))

function resetDraft(): void {
  const type = currentType
  if (type === undefined) {
    draftEntry = undefined
    initialRawText = ''
    return
  }

  const rawText = commandPanelStore.getInsertText(type)
  draftEntry = buildSingleStatement(rawText)
  initialRawText = draftEntry?.rawText ?? ''
}

watch(
  () => [open.value, currentType] as const,
  ([isOpen]) => {
    if (!isOpen) {
      return
    }
    resetDraft()
  },
  { immediate: true },
)

function handleDraftUpdate(payload: StatementUpdatePayload): void {
  const currentEntry = draftEntry
  if (!currentEntry) {
    return
  }

  draftEntry = markRaw({
    ...currentEntry,
    rawText: payload.rawText,
    parsed: payload.parsed,
    parseError: false,
  })
}

function handleResetToFactory(): void {
  const type = currentType
  if (type === undefined) {
    return
  }

  const rawText = factoryRawText
  commandPanelStore.resetDefault(type)
  draftEntry = buildSingleStatement(rawText)
  initialRawText = rawText
  notify.success(t('edit.visualEditor.commandPanel.resetSuccess'))
}

function handleSave(): void {
  const type = currentType
  if (type === undefined || !draftEntry) {
    return
  }

  commandPanelStore.saveDefault(type, draftEntry.rawText)
  open.value = false
}

function handleDialogOpenChange(nextOpen: boolean): void {
  if (!nextOpen) {
    requestClose()
  }
}

function requestClose(): void {
  if (!isDirty) {
    open.value = false
    return
  }

  modalStore.open('SaveChangesModal', {
    title: t('modals.saveCommandDefaults.title', { name: commandName }),
    onSave: handleSave,
    onDontSave: () => {
      open.value = false
    },
  })
}
</script>

<template>
  <Dialog :open="open" @update:open="handleDialogOpenChange">
    <DialogScrollContent class="max-w-md">
      <DialogHeader>
        <DialogTitle>
          {{ dialogTitle }}
        </DialogTitle>
        <DialogDescription v-if="currentCommandConfig && currentType !== undefined">
          {{ getCommandDescription(currentType, t) }}
        </DialogDescription>
      </DialogHeader>

      <div class="max-h-[50vh] min-h-80">
        <StatementEditorPanel
          v-if="draftEntry"
          inline
          :entry="draftEntry"
          :show-header="false"
          @update="handleDraftUpdate"
        />
      </div>

      <DialogFooter>
        <Button variant="outline" class="h-8" :disabled="isFactory" @click="handleResetToFactory">
          {{ $t('edit.visualEditor.commandPanel.resetDefaults') }}
        </Button>
        <Button class="h-8" @click="handleSave">
          {{ $t('common.save') }}
        </Button>
      </DialogFooter>
    </DialogScrollContent>

    <!-- 效果编辑器二级 Dialog -->
    <EffectEditorSubDialog :effect-dialog="effectDialog" />
  </Dialog>
</template>
