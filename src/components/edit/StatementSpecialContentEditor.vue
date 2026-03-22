<script setup lang="ts">
import { useControlId } from '~/composables/useControlId'
import { StatementEditorSurface } from '~/helper/statement-editor/surface-context'
import { ChooseContentItem, SetVarContent, StyleRuleContentItem } from '~/helper/webgal-script/content'

interface Props {
  surface: StatementEditorSurface
  mode: 'setVar' | 'choose' | 'applyStyle'
  setVarContent: SetVarContent
  chooseItems: ChooseContentItem[]
  styleRuleItems: StyleRuleContentItem[]
  sceneRootPath: string
}

const props = defineProps<Props>()

const emit = defineEmits<{
  setVarName: [value: string]
  setVarValue: [value: string]
  chooseName: [payload: { index: number, value: string }]
  chooseFile: [payload: { index: number, file: string }]
  removeChoose: [index: number]
  addChoose: []
  styleOldName: [payload: { index: number, value: string }]
  styleNewName: [payload: { index: number, value: string }]
  removeStyleRule: [index: number]
  addStyleRule: []
}>()

const isInline = $computed(() => props.surface === 'inline')
const { buildControlId } = useControlId('statement-special')
const setVarNameInputId = buildControlId('set-var-name')
const setVarValueInputId = buildControlId('set-var-value')

const choosePairItems = $computed(() =>
  props.chooseItems.map(item => ({ first: item.name, second: item.file })),
)

const stylePairItems = $computed(() =>
  props.styleRuleItems.map(item => ({ first: item.oldName, second: item.newName })),
)
</script>

<template>
  <div v-if="mode === 'setVar'" :class="isInline ? 'flex gap-1.5 max-w-full min-w-0 items-center' : 'flex flex-col gap-2'">
    <template v-if="isInline">
      <Input
        :model-value="setVarContent.name"
        :placeholder="$t('edit.visualEditor.params.varName')"
        class="text-xs px-2.5 h-6 max-w-full min-w-24 w-auto shadow-none field-sizing-content"
        @update:model-value="emit('setVarName', String($event))"
      />
      <span class="text-xs text-muted-foreground shrink-0">=</span>
      <Input
        :model-value="setVarContent.value"
        :placeholder="$t('edit.visualEditor.params.varValue')"
        class="text-xs px-2.5 h-6 max-w-full min-w-24 w-auto shadow-none field-sizing-content"
        @update:model-value="emit('setVarValue', String($event))"
      />
    </template>
    <template v-else>
      <div class="flex flex-col gap-1">
        <Label :for="setVarNameInputId" class="text-xs text-muted-foreground font-medium w-fit">
          {{ $t('edit.visualEditor.params.varName') }}
        </Label>
        <Input
          :id="setVarNameInputId"
          :model-value="setVarContent.name"
          class="text-xs h-7 shadow-none"
          @update:model-value="emit('setVarName', String($event))"
        />
      </div>
      <div class="flex flex-col gap-1">
        <Label :for="setVarValueInputId" class="text-xs text-muted-foreground font-medium w-fit">
          {{ $t('edit.visualEditor.params.varValue') }}
        </Label>
        <Input
          :id="setVarValueInputId"
          :model-value="setVarContent.value"
          class="text-xs h-7 shadow-none"
          @update:model-value="emit('setVarValue', String($event))"
        />
      </div>
    </template>
  </div>

  <PairListEditor
    v-else-if="mode === 'choose'"
    :surface="surface"
    :items="choosePairItems"
    :first-label="$t('edit.visualEditor.placeholder.optionName')"
    :second-label="$t('edit.visualEditor.placeholder.sceneFile')"
    :first-placeholder="$t('edit.visualEditor.placeholder.optionName')"
    :second-placeholder="$t('edit.visualEditor.filePicker.scene')"
    :add-label="$t('edit.visualEditor.addOption')"
    @update-first="emit('chooseName', $event)"
    @update-second="emit('chooseFile', { index: $event.index, file: $event.value })"
    @remove="emit('removeChoose', $event)"
    @add="emit('addChoose')"
  >
    <template #second-field="{ item, index }">
      <FilePicker
        :model-value="item.second"
        :root-path="sceneRootPath"
        :extensions="['.txt']"
        :popover-title="$t('edit.visualEditor.filePicker.scene')"
        :placeholder="$t('edit.visualEditor.filePicker.scene')"
        class="flex-1 [&_input]:(text-xs pl-2.5 h-6 min-w-24 shadow-none field-sizing-content)"
        @update:model-value="emit('chooseFile', { index, file: String($event) })"
      />
    </template>
    <template #second-field-panel="{ item, index, inputId }">
      <FilePicker
        :input-id="inputId"
        :model-value="item.second"
        :root-path="sceneRootPath"
        :extensions="['.txt']"
        :popover-title="$t('edit.visualEditor.filePicker.scene')"
        :placeholder="$t('edit.visualEditor.filePicker.scene')"
        class="[&_input]:(text-xs h-7 shadow-none)"
        @update:model-value="emit('chooseFile', { index, file: String($event) })"
      />
    </template>
  </PairListEditor>

  <PairListEditor
    v-else
    :surface="surface"
    :items="stylePairItems"
    :first-label="$t('edit.visualEditor.placeholder.oldStyleName')"
    :second-label="$t('edit.visualEditor.placeholder.newStyleName')"
    :first-placeholder="$t('edit.visualEditor.placeholder.oldStyleName')"
    :second-placeholder="$t('edit.visualEditor.placeholder.newStyleName')"
    :add-label="$t('edit.visualEditor.addStyleRule')"
    @update-first="emit('styleOldName', $event)"
    @update-second="emit('styleNewName', $event)"
    @remove="emit('removeStyleRule', $event)"
    @add="emit('addStyleRule')"
  />
</template>
