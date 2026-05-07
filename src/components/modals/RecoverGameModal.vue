<script setup lang="ts">
import { TriangleAlert } from '@lucide/vue'
import { open as openDialog } from '@tauri-apps/plugin-dialog'
import { openPath } from '@tauri-apps/plugin-opener'

import { AbsPath } from '~/domain/path'
import { gameManager } from '~/services/game-manager'
import { resourceReconcile } from '~/services/resource-reconcile'
import { useEditorViewStateStore } from '~/stores/editor-view-state'
import { useTabsStore } from '~/stores/tabs'

import type { Game } from '~/database/model'

const { t } = useI18n()
let open = $(defineModel<boolean>('open'))

const props = defineProps<{
  game: Game
}>()

const router = useRouter()
const tabsStore = useTabsStore()
const editorViewStateStore = useEditorViewStateStore()

let isRetrying = $ref(false)
let isRelinking = $ref(false)

const isMissing = $computed(() => props.game.availability === 'missing')
const isBroken = $computed(() => props.game.availability === 'broken')
const isBusy = $computed(() => isRetrying || isRelinking)

async function handleRetry() {
  if (isBusy) {
    return
  }
  isRetrying = true
  try {
    const availability = await resourceReconcile.reconcileGameRecord(props.game)
    if (availability !== 'available') {
      notify.error(t('modals.recoverGame.retryFailed'))
      return
    }
    open = false
    notify.success(t('modals.recoverGame.retrySuccess'))
  } finally {
    isRetrying = false
  }
}

async function handleRelink() {
  if (isBusy) {
    return
  }

  const selected = await openDialog({
    title: t('modals.recoverGame.selectNewLocation'),
    directory: true,
    multiple: false,
  })
  if (typeof selected !== 'string') {
    return
  }

  isRelinking = true
  try {
    const updated = await gameManager.relinkGame(props.game.id, AbsPath.from(selected))
    // 重链接后旧路径绑定的标签页与编辑器视图状态需要清掉，避免污染新工作区
    tabsStore.clearProjectState(updated.id)
    editorViewStateStore.clearProjectStates(updated.id)
    open = false
    notify.success(t('modals.recoverGame.relinkSuccess'))

    // 通过路由刷新让工作区在新路径上重新加载
    await router.push('/')
    await router.push(`/edit/${updated.id}`)
  } catch (error) {
    notify.error(error instanceof Error ? error.message : t('modals.recoverGame.relinkFailed'))
  } finally {
    isRelinking = false
  }
}

async function handleOpenFolder() {
  try {
    await openPath(props.game.path)
  } catch (error) {
    logger.error(`打开项目目录失败: ${error}`)
    notify.error(t('modals.recoverGame.openFolderFailed'))
  }
}

async function handleGoHome() {
  open = false
  await router.push('/')
}
</script>

<template>
  <AlertDialog ::open="open">
    <AlertDialogContent>
      <div class="flex flex-col gap-2 sm:flex-row sm:gap-4 max-sm:items-center">
        <div
          class="text-amber-500 rounded-lg bg-amber-500/10 flex shrink-0 size-9 items-center justify-center"
          aria-hidden="true"
        >
          <TriangleAlert class="size-5" aria-hidden="true" />
        </div>
        <AlertDialogHeader>
          <AlertDialogTitle>
            {{ $t('modals.recoverGame.title') }}
          </AlertDialogTitle>
          <AlertDialogDescription>
            <i18n-t v-if="isMissing" keypath="modals.recoverGame.descriptionMissing" tag="p">
              <template #name>
                <span class="text-foreground font-bold">{{ game.metadata.name }}</span>
              </template>
            </i18n-t>
            <i18n-t v-else keypath="modals.recoverGame.descriptionBroken" tag="p">
              <template #name>
                <span class="text-foreground font-bold">{{ game.metadata.name }}</span>
              </template>
            </i18n-t>
            <p class="text-xs text-muted-foreground mt-2 break-all">
              {{ game.path }}
            </p>
          </AlertDialogDescription>
        </AlertDialogHeader>
      </div>
      <AlertDialogFooter class="gap-2 sm:flex-row-reverse sm:justify-start">
        <Button :disabled="isBusy" @click="handleRetry">
          {{ isMissing ? $t('modals.recoverGame.retry') : $t('modals.recoverGame.recheck') }}
        </Button>
        <Button variant="outline" :disabled="isBusy" @click="handleRelink">
          {{ $t('modals.recoverGame.relink') }}
        </Button>
        <Button v-if="isBroken" variant="outline" :disabled="isBusy" @click="handleOpenFolder">
          {{ $t('common.openFolder') }}
        </Button>
        <Button variant="ghost" :disabled="isBusy" @click="handleGoHome">
          {{ $t('modals.recoverGame.backToHome') }}
        </Button>
      </AlertDialogFooter>
    </AlertDialogContent>
  </AlertDialog>
</template>
