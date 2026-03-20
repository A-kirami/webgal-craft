<script setup lang="ts">
import { commandType } from 'webgal-parser/src/interface/sceneInterface'

import { commandEntries, commandPanelCategories, getCategoryLabel, getFactoryDefaultCommandText } from '~/helper/command-registry'
import { resolveI18n } from '~/helper/command-registry/schema'
import { useCommandPanelStore } from '~/stores/command-panel'

import type { ISentence } from 'webgal-parser/src/interface/sceneInterface'
import type { StatementGroup } from '~/stores/command-panel'

interface Props {
  group?: StatementGroup
}

const props = defineProps<Props>()

const open = defineModel<boolean>('open', { default: false })

const { t } = useI18n()
const commandPanelStore = useCommandPanelStore()
const effectDialog = useEffectEditorDialog()

let draftName = $ref('')
let draftEntries = $ref<StatementEntry[]>([])
let initialName = $ref('')
let initialRawTexts = $ref<string[]>([])

const isEditing = $computed(() => !!props.group)
const modalStore = useModalStore()
const isDirty = $computed(() => {
  if (draftName !== initialName) {
    return true
  }
  const currentRawTexts = draftEntries.map(e => e.rawText)
  if (currentRawTexts.length !== initialRawTexts.length) {
    return true
  }
  return currentRawTexts.some((text, i) => text !== initialRawTexts[i])
})
const groupedCommandEntries = commandPanelCategories.map(category => ({
  category,
  entries: commandEntries.filter(entry => entry.category === category),
}))

const previousSpeakers = $computed(() => {
  const result: string[] = []
  let lastSpeaker = ''
  for (const entry of draftEntries) {
    result.push(lastSpeaker)
    const change = extractSpeakerChange(entry.rawText)
    if (change !== undefined) {
      lastSpeaker = change
    }
  }
  return result
})

const canSave = $computed(() => draftName.trim().length > 0 && draftEntries.length > 0)

function resetDraft() {
  draftName = props.group?.name ?? ''
  draftEntries = (props.group?.rawTexts ?? [])
    .map(rawText => buildSingleStatement(rawText))
    .filter((entry): entry is StatementEntry => entry !== undefined)
  initialName = draftName
  initialRawTexts = draftEntries.map(e => e.rawText)
}

watch(
  () => [open.value, props.group?.id] as const,
  ([isOpen]) => {
    if (!isOpen) {
      return
    }
    resetDraft()
  },
  { immediate: true },
)

function handleAppendCommand(type: commandType) {
  const nextEntry = buildSingleStatement(commandPanelStore.getInsertText(type))
  if (!nextEntry) {
    return
  }
  draftEntries = [...draftEntries, nextEntry]
}

function handleEntryUpdate(payload: { id: number, rawText: string, parsed: ISentence }) {
  const index = draftEntries.findIndex(entry => entry.id === payload.id)
  if (index === -1) {
    return
  }

  const nextEntries = [...draftEntries]
  nextEntries.splice(index, 1, markRaw({
    ...nextEntries[index],
    rawText: payload.rawText,
    parsed: payload.parsed,
    parseError: false,
  }))
  draftEntries = nextEntries
}

function handleCollapsedUpdate(index: number, collapsed: boolean) {
  const entry = draftEntries[index]
  if (!entry || entry.collapsed === collapsed) {
    return
  }
  const nextEntries = [...draftEntries]
  nextEntries.splice(index, 1, markRaw({ ...entry, collapsed }))
  draftEntries = nextEntries
}

function moveEntry(index: number, direction: -1 | 1) {
  const targetIndex = index + direction
  if (!draftEntries[index] || !draftEntries[targetIndex]) {
    return
  }
  const nextEntries = [...draftEntries]
  const [item] = nextEntries.splice(index, 1)
  nextEntries.splice(targetIndex, 0, item)
  draftEntries = nextEntries
}

function deleteEntry(id: number) {
  const index = draftEntries.findIndex(entry => entry.id === id)
  if (index === -1) {
    return
  }
  const nextEntries = [...draftEntries]
  nextEntries.splice(index, 1)
  draftEntries = nextEntries
}

function isEntryAtFactory(entry: StatementEntry): boolean {
  if (!entry.parsed) {
    return true
  }
  return entry.rawText === getFactoryDefaultCommandText(entry.parsed.command)
}

function resetEntry(id: number) {
  const index = draftEntries.findIndex(entry => entry.id === id)
  if (index === -1) {
    return
  }
  const entry = draftEntries[index]
  if (!entry.parsed) {
    return
  }
  const factoryRawText = getFactoryDefaultCommandText(entry.parsed.command)
  const rebuilt = buildSingleStatement(factoryRawText)
  if (!rebuilt) {
    return
  }
  const nextEntries = [...draftEntries]
  nextEntries.splice(index, 1, markRaw({ ...rebuilt, id: entry.id }))
  draftEntries = nextEntries
  notify.success(t('edit.visualEditor.commandPanel.resetSuccess'))
}

function handleSaveGroup() {
  if (!canSave) {
    return
  }

  const finalName = draftName.trim()

  commandPanelStore.saveGroup({
    id: props.group?.id,
    createdAt: props.group?.createdAt,
    name: finalName,
    rawTexts: draftEntries.map(entry => entry.rawText),
  })
  open.value = false
}

function requestClose() {
  if (!isDirty) {
    open.value = false
    return
  }
  modalStore.open('SaveChangesModal', {
    title: t('modals.saveChanges.title', { name: draftName || t('edit.visualEditor.commandPanel.createGroup') }),
    onSave: handleSaveGroup,
    onDontSave: () => {
      open.value = false
    },
  })
}
</script>

<template>
  <Dialog :open="open" @update:open="val => { if (!val) requestClose() }">
    <DialogScrollContent class="max-w-4xl" @open-auto-focus="e => { if (isEditing) e.preventDefault() }">
      <div class="flex flex-col gap-4 h-[70vh] min-h-120">
        <DialogHeader>
          <DialogTitle class="flex gap-2 items-center">
            <span v-if="isEditing">{{ $t('edit.visualEditor.commandPanel.editGroup') }}</span>
            <span v-else>{{ $t('edit.visualEditor.commandPanel.createGroup') }}</span>
            <span class="text-muted-foreground">—</span>
            <Input
              ::="draftName"
              :placeholder="$t('edit.visualEditor.commandPanel.groupNamePlaceholder')"
              class="text-base font-normal h-7 max-w-60 shadow-none"
            />
          </DialogTitle>
          <DialogDescription>
            {{ $t('edit.visualEditor.commandPanel.groupDescription') }}
          </DialogDescription>
        </DialogHeader>

        <div class="flex-1 gap-0 grid min-h-0 md:grid-cols-[180px_minmax(0,1fr)]">
          <ScrollArea class="border-r">
            <div class="pr-2 flex flex-col gap-4">
              <section v-for="commandGroup in groupedCommandEntries" :key="commandGroup.category" class="flex flex-col gap-2">
                <h3 class="text-13px text-muted-foreground tracking-wide font-medium uppercase">
                  {{ getCategoryLabel(commandGroup.category, t) }}
                </h3>
                <Button
                  v-for="entry in commandGroup.entries"
                  :key="entry.type"
                  variant="ghost"
                  class="px-3 py-2 opacity-80 h-8 justify-start hover:opacity-100"
                  @click="handleAppendCommand(entry.type)"
                >
                  <div class="mr-2 shrink-0 size-4" :class="entry.icon" />
                  <span class="text-sm truncate">{{ resolveI18n(entry.label, t) }}</span>
                </Button>
              </section>
            </div>
          </ScrollArea>

          <ScrollArea class="flex-scroll-area min-h-0">
            <div v-if="draftEntries.length > 0" class="px-2 flex flex-col gap-2">
              <VisualEditorStatementCard
                v-for="(entry, index) in draftEntries"
                :key="entry.id"
                :collapsed="entry.collapsed"
                :entry="entry"
                :index="index"
                :previous-speaker="previousSpeakers[index]"
                @update="handleEntryUpdate"
                @update:collapsed="val => handleCollapsedUpdate(index, val)"
              >
                <template #actions>
                  <Button
                    variant="ghost"
                    size="sm"
                    class="p-1 opacity-70 size-7 hover:opacity-100"
                    :disabled="index === 0"
                    :title="$t('edit.visualEditor.commandPanel.moveUp')"
                    @click.stop="moveEntry(index, -1)"
                  >
                    <div class="i-lucide-arrow-up size-3" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    class="p-1 opacity-70 size-7 hover:opacity-100"
                    :disabled="index === draftEntries.length - 1"
                    :title="$t('edit.visualEditor.commandPanel.moveDown')"
                    @click.stop="moveEntry(index, 1)"
                  >
                    <div class="i-lucide-arrow-down size-3" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    class="p-1 opacity-70 size-7 hover:opacity-100"
                    :disabled="isEntryAtFactory(entry)"
                    :title="$t('edit.visualEditor.commandPanel.resetDefaults')"
                    @click.stop="resetEntry(entry.id)"
                  >
                    <div class="i-lucide-rotate-ccw size-3" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    class="p-1 opacity-70 size-7 hover:text-destructive hover:opacity-100"
                    :title="$t('common.delete')"
                    @click.stop="deleteEntry(entry.id)"
                  >
                    <div class="i-lucide-trash-2 size-3" />
                  </Button>
                </template>
              </VisualEditorStatementCard>
            </div>
            <div v-else class="text-sm text-muted-foreground px-6 flex h-full items-center justify-center">
              {{ $t('edit.visualEditor.commandPanel.emptyGroup') }}
            </div>
          </ScrollArea>
        </div>

        <DialogFooter>
          <Button variant="outline" class="h-8" @click="requestClose">
            {{ $t('common.cancel') }}
          </Button>
          <Button class="h-8" :disabled="!canSave" @click="handleSaveGroup">
            {{ $t('edit.visualEditor.commandPanel.saveGroup') }}
          </Button>
        </DialogFooter>
      </div>
    </DialogScrollContent>

    <!-- 效果编辑器二级 Dialog -->
    <EffectEditorSubDialog :effect-dialog="effectDialog" />
  </Dialog>
</template>
