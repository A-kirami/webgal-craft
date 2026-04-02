<script setup lang="ts">
import { useForm } from 'vee-validate'

import GameConfigFieldsSection from '~/components/modals/game-config/GameConfigFieldsSection.vue'
import {
  cloneGameConfigFormValues,
  createEmptyGameConfigFormValues,
  createGameConfigKey,
  createGameConfigSchema,
  serializeGameConfigPatch,
} from '~/features/modals/game-config/game-config-form'
import { configManager } from '~/services/config-manager'
import { useModalStore } from '~/stores/modal'
import { handleError } from '~/utils/error-handler'

import type { GameConfigFormValues } from '~/features/modals/game-config/game-config-form'

interface Props {
  backgroundRootPath: string
  bgmRootPath: string
  gamePath: string
  initialValues: GameConfigFormValues
  serveUrl?: string
}

const props = defineProps<Props>()
const open = defineModel<boolean>('open', { default: false })

const { t } = useI18n()
const modalStore = useModalStore()
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
const isDirty = $computed(() => meta.value.dirty)

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
    await configManager.setConfig(props.gamePath, serializeGameConfigPatch(formValues))
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
      </DialogHeader>

      <ScrollArea data-testid="game-config-modal-scroll-area" class="min-h-0">
        <GameConfigFieldsSection
          :background-root-path="props.backgroundRootPath"
          :bgm-root-path="props.bgmRootPath"
          :game-path="props.gamePath"
          :serve-url="props.serveUrl"
          class="mx-2"
        />
      </ScrollArea>

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
