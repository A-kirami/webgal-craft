<script setup lang="ts">
import { TriangleAlert } from '@lucide/vue'

import type { FastPreviewTimeoutPayload } from '~/types/editorPreviewProtocol'

let open = $(defineModel<boolean>('open'))

const props = defineProps<{
  payload: FastPreviewTimeoutPayload
  onClose?: () => void | Promise<void>
}>()

const { locale, t } = useI18n()

let closeHandled = $ref(false)

const suggestions = $computed(() => [
  {
    key: 'loop',
    text: t('modals.fastPreviewTimeout.suggestionLoop'),
  },
  {
    key: 'distance',
    text: t('modals.fastPreviewTimeout.suggestionDistance'),
  },
  {
    key: 'blocking',
    text: t('modals.fastPreviewTimeout.suggestionBlocking'),
  },
])
const diagnosticSeparator = $computed(() => locale.value === 'en' ? ': ' : '：')
const diagnostics = $computed(() => [
  {
    key: 'scene',
    label: t('modals.fastPreviewTimeout.scene'),
    value: props.payload.sceneName,
  },
  {
    key: 'targetSentence',
    label: t('modals.fastPreviewTimeout.targetSentence'),
    value: String(props.payload.targetSentenceId),
  },
  {
    key: 'sentence',
    label: t('modals.fastPreviewTimeout.sentence'),
    value: String(props.payload.sentenceId),
  },
  {
    key: 'forwardedLineCount',
    label: t('modals.fastPreviewTimeout.forwardedLineCount'),
    value: String(props.payload.forwardedLineCount),
  },
  {
    key: 'elapsedTime',
    label: t('modals.fastPreviewTimeout.elapsedTime'),
    value: `${props.payload.elapsedMs}ms`,
  },
  {
    key: 'maxDuration',
    label: t('modals.fastPreviewTimeout.maxDuration'),
    value: `${props.payload.maxDurationMs}ms`,
  },
])

async function handleClose(): Promise<void> {
  closeHandled = true
  try {
    await props.onClose?.()
  } catch {
    // 关闭回调失败不应阻断弹窗状态收敛。
  } finally {
    open = false
  }
}

watch(() => open, async (nextOpen, previousOpen) => {
  if (nextOpen) {
    closeHandled = false
    return
  }

  if (previousOpen && !closeHandled) {
    try {
      await props.onClose?.()
    } catch {
      // 关闭回调失败不应阻断外部关闭流程。
    } finally {
      closeHandled = true
    }
  }
})
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
            {{ $t('modals.fastPreviewTimeout.title') }}
          </AlertDialogTitle>
          <AlertDialogDescription as="div" class="text-left space-y-3">
            <p>{{ $t('modals.fastPreviewTimeout.summary') }}</p>
            <section class="space-y-1.5">
              <p class="text-foreground font-medium">
                {{ $t('modals.fastPreviewTimeout.suggestionsTitle') }}
              </p>
              <ul class="pl-5 list-disc space-y-1">
                <li
                  v-for="suggestion in suggestions"
                  :key="suggestion.key"
                >
                  {{ suggestion.text }}
                </li>
              </ul>
            </section>
            <p>{{ $t('modals.fastPreviewTimeout.nextStep') }}</p>
            <section class="text-xs p-3 border border-border/70 rounded-md bg-muted/40 space-y-2">
              <p class="text-foreground font-medium">
                {{ $t('modals.fastPreviewTimeout.diagnosticsTitle') }}
              </p>
              <dl class="space-y-1.5">
                <div
                  v-for="diagnostic in diagnostics"
                  :key="diagnostic.key"
                  class="gap-x-2 grid grid-cols-[max-content_minmax(0,1fr)]"
                >
                  <dt>{{ diagnostic.label }}{{ diagnosticSeparator }}</dt>
                  <dd class="text-foreground break-all">
                    {{ diagnostic.value }}
                  </dd>
                </div>
              </dl>
            </section>
          </AlertDialogDescription>
        </AlertDialogHeader>
      </div>
      <AlertDialogFooter>
        <AlertDialogAction @click="handleClose">
          {{ $t('common.confirm') }}
        </AlertDialogAction>
      </AlertDialogFooter>
    </AlertDialogContent>
  </AlertDialog>
</template>
