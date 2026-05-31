<script setup lang="ts">
import { ArrowRightLeft, Info } from '@lucide/vue'
import { useForm } from 'vee-validate'

import {
  cloneGameConfigFormValues,
  createEmptyGameConfigFormValues,
  createGameConfigKey,
  createGameConfigSchema,
  serializeGameConfigEntries,
} from '~/features/modals/game-config/game-config-form'
import { configManager } from '~/services/config-manager'
import { useModalStore } from '~/stores/modal'
import { useWorkspaceStore } from '~/stores/workspace'
import { handleError } from '~/utils/error-handler'

import type { Game } from '~/database/model'
import type { AbsPath } from '~/domain/path'
import type { GameConfigFormValues } from '~/features/modals/game-config/game-config-form'

interface Props {
  backgroundRootPath: AbsPath
  bgmRootPath: AbsPath
  gamePath: AbsPath
  initialValues: GameConfigFormValues
  serveUrl?: string
  unmanagedLineCount: number
  game?: Game
  engineLabel?: string
}

const props = defineProps<Props>()
const open = defineModel<boolean>('open', { default: false })

const { t } = useI18n()
const modalStore = useModalStore()
const workspaceStore = useWorkspaceStore()
const validationSchema = createGameConfigSchema(t)

const {
  handleSubmit,
  meta,
  resetForm,
  setFieldValue,
} = useForm({
  validationSchema,
  initialValues: createEmptyGameConfigFormValues(),
})

let isSaving = $ref(false)
let iconEditorOpen = $ref(false)
const isDirty = $computed(() => meta.value.dirty)
const iconPreviewAsset = $computed(() => {
  const currentGame = workspaceStore.currentGame
  if (currentGame?.path === props.gamePath) {
    return currentGame.previewAssets.icon
  }

  return props.game?.previewAssets.icon
})
const iconPreviewPath = $computed(() => iconPreviewAsset?.path)
const iconPreviewCacheVersion = $computed(() => iconPreviewAsset?.cacheVersion)

function resetToEmptyForm() {
  resetForm({
    values: createEmptyGameConfigFormValues(),
  })
}

function resetToPreparedForm() {
  const formValues = cloneGameConfigFormValues(props.initialValues)

  resetForm({
    values: formValues,
  })

  if (!formValues.gameKey) {
    setFieldValue('gameKey', createGameConfigKey())
  }
}

watch(
  () => [open.value, props.gamePath, props.initialValues] as const,
  ([isOpen, gamePath]) => {
    if (!isOpen || !gamePath) {
      resetToEmptyForm()
      return
    }

    resetToPreparedForm()
  },
  { deep: true, immediate: true },
)

function closeDialog() {
  open.value = false
}

function requestClose() {
  if (!isDirty) {
    closeDialog()
    return
  }

  modalStore.open('SaveChangesModal', {
    title: t('modals.saveChanges.title', { name: t('modals.gameConfig.title') }),
    onSave: handleSave,
    onDontSave: closeDialog,
  })
}

function handleDialogOpenChange(nextOpen: boolean) {
  if (nextOpen) {
    open.value = true
    return
  }

  requestClose()
}

const submitConfig = handleSubmit(async (formValues) => {
  if (!props.gamePath || isSaving) {
    return
  }

  isSaving = true
  try {
    await configManager.setConfig(props.gamePath, serializeGameConfigEntries(formValues))
    notify.success(t('common.saved'))
    resetForm({
      values: cloneGameConfigFormValues(formValues),
    })
    closeDialog()
  } catch (error) {
    handleError(error, { context: t('modals.gameConfig.saveFailed') })
  } finally {
    isSaving = false
  }
})

async function handleSave() {
  if (!props.gamePath || isSaving || !isDirty) {
    return
  }

  await submitConfig()
}

function openSwitchEngine() {
  if (props.game) {
    modalStore.open('SwitchEngineModal', { game: props.game })
  }
}

function openSwitchTemplate() {
  if (props.game) {
    modalStore.open('SwitchTemplateModal', { game: props.game })
  }
}

</script>

<template>
  <Dialog :open="open" @update:open="handleDialogOpenChange">
    <DialogContent
      data-testid="game-config-modal-content"
      class="grid grid-rows-[auto_minmax(0,1fr)_auto] max-h-[85vh] overflow-hidden 2xl:(h-200 max-w-160)"
    >
      <DialogHeader>
        <DialogTitle>{{ $t('modals.gameConfig.title') }}</DialogTitle>
        <DialogDescription>
          {{ $t('modals.gameConfig.description') }}
        </DialogDescription>
        <div
          v-if="props.unmanagedLineCount > 0"
          data-testid="game-config-unmanaged-notice"
          class="text-xs text-muted-foreground px-3 py-2 rounded-md bg-muted/60 flex gap-2 items-start"
        >
          <Info class="mt-0.5 shrink-0 size-3.5" aria-hidden="true" />
          <span>{{ $t('modals.gameConfig.custom.unmanagedNotice') }}</span>
        </div>
      </DialogHeader>

      <ScrollArea data-testid="game-config-modal-scroll-area" class="min-h-0">
        <section
          data-testid="game-config-icon-editor-field"
          class="mx-2 mb-5 flex flex-col gap-2"
        >
          <h3
            id="game-config-icon-editor-label"
            class="text-sm font-medium"
          >
            {{ $t('modals.gameConfig.iconEditor.entryTitle') }}
          </h3>
          <button
            type="button"
            class="group text-left max-w-24 w-full"
            aria-labelledby="game-config-icon-editor-label"
            @click="iconEditorOpen = true"
          >
            <div
              data-testid="game-config-icon-editor-surface"
              :class="[
                'border rounded-md aspect-square relative flex items-center justify-center overflow-hidden',
                iconPreviewPath
                  ? 'bg-checkerboard'
                  : 'border-dashed bg-muted/30 transition-colors duration-200 group-focus-visible:border-primary/40 group-focus-visible:bg-muted/50 group-hover:border-primary/40 group-hover:bg-muted/50',
              ]"
            >
              <AssetImage
                v-if="iconPreviewPath"
                :path="iconPreviewPath"
                :root-path="props.gamePath"
                :serve-url="props.serveUrl"
                :cache-version="iconPreviewCacheVersion"
                :alt="$t('modals.gameConfig.iconEditor.previewAlt')"
                fallback-image="/placeholder.svg"
                object-fit="contain"
                class="size-full"
              />
              <div
                v-else
                class="text-xs text-muted-foreground px-4 text-center flex flex-col gap-2 h-full items-center justify-center"
              >
                <div class="i-lucide-image size-5" aria-hidden="true" />
                <span>{{ $t('modals.gameConfig.iconEditor.noIcon') }}</span>
              </div>
              <div
                data-testid="game-config-icon-editor-edit-overlay"
                class="bg-black/0 flex transition-colors duration-200 items-center inset-0 justify-center absolute group-focus-visible:bg-black/45 group-hover:bg-black/45"
              >
                <span class="text-sm font-medium px-3 py-1.5 rounded-full bg-background/95 opacity-0 inline-flex gap-1.5 shadow-sm transition-opacity duration-200 items-center group-focus-visible:opacity-100 group-hover:opacity-100">
                  {{ $t('common.edit') }}
                </span>
              </div>
            </div>
          </button>
        </section>

        <GameConfigFieldsSection
          :background-root-path="props.backgroundRootPath"
          :bgm-root-path="props.bgmRootPath"
          :game-path="props.gamePath"
          :serve-url="props.serveUrl"
          class="mx-2"
        />

        <!-- 引擎与模板配置 -->
        <div v-if="props.game?.engineId" class="mx-2 mt-4 pt-4 border-t flex flex-col gap-3">
          <div class="flex items-center justify-between">
            <div>
              <div class="text-sm font-medium">
                {{ $t('edit.statusBar.engine') }}
              </div>
              <div class="text-xs text-muted-foreground">
                {{ props.engineLabel ?? $t('common.unknown') }}
              </div>
            </div>
            <Button
              variant="outline"
              size="sm"
              @click="openSwitchEngine"
            >
              <ArrowRightLeft class="mr-1 size-3.5" />
              {{ $t('modals.switchEngine.title') }}
            </Button>
          </div>

          <div class="flex items-center justify-between">
            <div>
              <div class="text-sm font-medium">
                {{ $t('edit.statusBar.template') }}
              </div>
            </div>
            <Button
              variant="outline"
              size="sm"
              @click="openSwitchTemplate"
            >
              <ArrowRightLeft class="mr-1 size-3.5" />
              {{ $t('modals.switchTemplate.title') }}
            </Button>
          </div>
        </div>
      </ScrollArea>

      <IconEditorDialog
        ::open="iconEditorOpen"
        :game-path="props.gamePath"
      />

      <DialogFooter>
        <Button
          :disabled="!props.gamePath || isSaving || !isDirty"
          @click="handleSave"
        >
          {{ $t('common.save') }}
        </Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>
</template>
