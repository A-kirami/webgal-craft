<script setup lang="ts">
import { commandType } from 'webgal-parser/src/interface/sceneInterface'

import { getCommandConfig, getCommandDescription, getFactoryDefaultCommandText } from '~/helper/command-registry'
import { resolveI18n } from '~/helper/command-registry/schema'
import { useCommandPanelStore } from '~/stores/command-panel'

import type { ISentence } from 'webgal-parser/src/interface/sceneInterface'

interface Props {
  type?: commandType
}

const props = defineProps<Props>()

const open = defineModel<boolean>('open', { default: false })

const { t } = useI18n()
const commandPanelStore = useCommandPanelStore()
const effectDialog = useEffectEditorDialog()

let draftEntry = $ref<StatementEntry>()
let initialRawText = $ref('')

const currentType = $computed(() => props.type)
const commandConfig = $computed(() => currentType === undefined ? undefined : getCommandConfig(currentType))
const factoryRawText = $computed(() => currentType === undefined ? '' : getFactoryDefaultCommandText(currentType))
const isDirty = $computed(() => draftEntry !== undefined && draftEntry.rawText !== initialRawText)
const isFactory = $computed(() => draftEntry !== undefined && draftEntry.rawText === factoryRawText)

const modalStore = useModalStore()

const commandName = $computed(() => currentType === undefined ? '' : resolveI18n(getCommandConfig(currentType).label, t))

const dialogTitle = $computed(() => currentType === undefined ? '' : t('edit.visualEditor.commandPanel.editDefaultsTitle', { command: commandName }))

function resetDraft() {
  if (currentType === undefined) {
    draftEntry = undefined
    initialRawText = ''
    return
  }
  const rawText = commandPanelStore.getInsertText(currentType)
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

function handleDraftUpdate(payload: { id: number, rawText: string, parsed: ISentence }) {
  if (!draftEntry) {
    return
  }
  draftEntry = markRaw({
    ...draftEntry,
    rawText: payload.rawText,
    parsed: payload.parsed,
    parseError: false,
  })
}

function handleResetToFactory() {
  if (currentType === undefined) {
    return
  }
  commandPanelStore.resetDefault(currentType)
  draftEntry = buildSingleStatement(factoryRawText)
  notify.success(t('edit.visualEditor.commandPanel.resetSuccess'))
}

function handleSave() {
  if (currentType === undefined || !draftEntry) {
    return
  }
  commandPanelStore.saveDefault(currentType, draftEntry.rawText)
  open.value = false
}

function requestClose() {
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
  <Dialog :open="open" @update:open="val => { if (!val) requestClose() }">
    <DialogScrollContent class="max-w-md">
      <DialogHeader>
        <DialogTitle>
          {{ dialogTitle }}
        </DialogTitle>
        <DialogDescription v-if="commandConfig && currentType !== undefined">
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
