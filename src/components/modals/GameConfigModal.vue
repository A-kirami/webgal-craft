<script setup lang="ts">
import { Loader2 } from 'lucide-vue-next'

import {
  parseStartupImages,
  serializeStartupImages,
} from '~/features/modals/game-config/game-config-images'
import { configManager } from '~/services/config-manager'
import { gameAssetDir } from '~/services/platform/app-paths'
import { useWorkspaceStore } from '~/stores/workspace'
import { handleError } from '~/utils/error-handler'

const open = defineModel<boolean>('open', { default: false })

const { t } = useI18n()
const workspaceStore = useWorkspaceStore()

let backgroundRootPath = $ref('')
let coverImage = $ref('')
let startupImages = $ref<string[]>([])
let initialCoverImage = $ref('')
let initialStartupImages = $ref<string[]>([])
let hasLoadFailure = $ref(false)
let isLoading = $ref(false)
let isSaving = $ref(false)
let confirmCloseOpen = $ref(false)
let configLoadRequestId = 0

const currentGamePath = $computed(() => workspaceStore.currentGame?.path ?? '')
const currentGameServeUrl = $computed(() => workspaceStore.currentGameServeUrl)
const isUnavailable = $computed(() => !currentGamePath)
const isDirty = $computed(() => {
  return coverImage !== initialCoverImage
    || startupImages.length !== initialStartupImages.length
    || startupImages.some((fileName, index) => fileName !== initialStartupImages[index])
})

watch(
  () => currentGamePath,
  async (gamePath, _previousGamePath, onCleanup) => {
    let isStale = false
    onCleanup(() => {
      isStale = true
    })

    if (!gamePath) {
      backgroundRootPath = ''
      return
    }

    const nextBackgroundRootPath = await gameAssetDir(gamePath, 'background')
    if (isStale) {
      return
    }

    backgroundRootPath = nextBackgroundRootPath
  },
  { immediate: true },
)

function cancelConfigLoad() {
  configLoadRequestId++
  isLoading = false
}

async function loadConfig(gamePath: string) {
  const requestId = ++configLoadRequestId

  isLoading = true
  hasLoadFailure = false
  try {
    const config = await configManager.getConfig(gamePath)
    if (requestId !== configLoadRequestId) {
      return
    }

    const nextCoverImage = config.titleImg ?? ''
    const nextStartupImages = parseStartupImages(config.gameLogo ?? '')

    coverImage = nextCoverImage
    startupImages = nextStartupImages
    initialCoverImage = nextCoverImage
    initialStartupImages = [...nextStartupImages]
  } catch (error) {
    if (requestId !== configLoadRequestId) {
      return
    }

    hasLoadFailure = true
    handleError(error, { context: t('modals.gameConfig.loadFailed') })
  } finally {
    if (requestId === configLoadRequestId) {
      isLoading = false
    }
  }
}

watch(
  () => [open.value, currentGamePath] as const,
  ([isOpen, gamePath]) => {
    cancelConfigLoad()

    if (!isOpen || !gamePath) {
      hasLoadFailure = false
      return
    }

    void loadConfig(gamePath)
  },
  { immediate: true },
)

function handleRetry() {
  if (!open.value || !currentGamePath || isLoading) {
    return
  }

  void loadConfig(currentGamePath)
}

function closeDialog() {
  confirmCloseOpen = false
  open.value = false
}

function requestClose() {
  if (!isDirty) {
    closeDialog()
    return
  }

  confirmCloseOpen = true
}

function handleDialogOpenChange(nextOpen: boolean) {
  if (nextOpen) {
    open.value = true
    return
  }

  requestClose()
}

async function handleSave() {
  if (!currentGamePath || isLoading || isSaving || !isDirty) {
    return
  }

  isSaving = true
  try {
    await configManager.setConfig(currentGamePath, {
      titleImg: coverImage,
      gameLogo: serializeStartupImages(startupImages),
    })
    await workspaceStore.refreshCurrentGameSnapshot()
    notify.success(t('common.saved'))
    initialCoverImage = coverImage
    initialStartupImages = [...startupImages]
    closeDialog()
  } catch (error) {
    handleError(error, { context: t('modals.gameConfig.saveFailed') })
  } finally {
    isSaving = false
  }
}
</script>

<template>
  <Dialog :open="open" @update:open="handleDialogOpenChange">
    <DialogContent
      data-testid="game-config-modal-content"
      class="grid grid-rows-[auto_minmax(0,1fr)_auto] max-h-[80vh] overflow-hidden 2xl:(h-200 max-w-140)"
    >
      <DialogHeader>
        <DialogTitle>{{ $t('modals.gameConfig.title') }}</DialogTitle>
        <DialogDescription>
          {{ $t('modals.gameConfig.description') }}
        </DialogDescription>
      </DialogHeader>

      <ScrollArea data-testid="game-config-modal-scroll-area" class="px-1.5 min-h-0">
        <div class="pr-1">
          <div v-if="isUnavailable" class="text-sm text-muted-foreground px-4 py-6 border rounded-xl bg-muted/20">
            {{ $t('modals.gameConfig.unavailable') }}
          </div>

          <div v-else-if="isLoading" class="flex min-h-64 items-center justify-center">
            <div class="text-sm text-muted-foreground flex flex-col gap-3 items-center">
              <Loader2 class="size-5 animate-spin" />
              <span>{{ $t('common.loading') }}</span>
            </div>
          </div>

          <div v-else class="flex flex-col gap-6">
            <div v-if="hasLoadFailure" class="text-sm text-muted-foreground px-4 py-3 border border-destructive/30 rounded-xl bg-destructive/5">
              {{ $t('modals.gameConfig.loadFailed') }}
              <div class="mt-3 flex justify-start">
                <Button variant="ghost" class="text-sm text-muted-foreground px-0" @click="handleRetry">
                  {{ $t('modals.gameConfig.retry') }}
                </Button>
              </div>
            </div>

            <CoverImagePicker
              ::="coverImage"
              :background-root-path="backgroundRootPath"
              :game-path="currentGamePath"
              :serve-url="currentGameServeUrl"
            />

            <StartupImagesPicker
              ::="startupImages"
              :background-root-path="backgroundRootPath"
              :game-path="currentGamePath"
              :serve-url="currentGameServeUrl"
            />
          </div>
        </div>
      </ScrollArea>

      <DialogFooter>
        <Button
          :disabled="isUnavailable || isLoading || isSaving || hasLoadFailure || !isDirty"
          @click="handleSave"
        >
          {{ $t('common.save') }}
        </Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>

  <SaveChangesModal
    ::open="confirmCloseOpen"
    :title="$t('modals.saveChanges.title', { name: $t('modals.gameConfig.title') })"
    :on-save="handleSave"
    :on-dont-save="closeDialog"
  />
</template>
