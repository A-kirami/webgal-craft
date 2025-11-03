<script setup lang="ts">
import { TriangleAlert } from 'lucide-vue-next'

const { t } = useI18n()
const open = defineModel<boolean>('open')

const props = defineProps<{
  engine: Engine
}>()

function handleConfirm() {
  engineManager.uninstallEngine(props.engine)
  notify.success(t('modals.deleteEngine.uninstallSuccess'))
}
</script>

<template>
  <AlertDialog ::open="open">
    <AlertDialogContent>
      <div class="flex flex-col gap-2 sm:flex-row sm:gap-4 max-sm:items-center">
        <div
          class="text-destructive rounded-lg bg-destructive/10 flex shrink-0 size-9 items-center justify-center"
          aria-hidden="true"
        >
          <TriangleAlert class="size-5" aria-hidden="true" />
        </div>
        <AlertDialogHeader>
          <AlertDialogTitle>
            {{ $t('modals.deleteEngine.title') }}
          </AlertDialogTitle>
          <AlertDialogDescription>
            <i18n-t keypath="modals.deleteEngine.description" tag="p">
              <template #name>
                <span class="text-black font-bold">{{ engine.metadata.name }}</span>
              </template>
            </i18n-t>
            <p>{{ $t('modals.deleteEngine.warning') }}</p>
          </AlertDialogDescription>
        </AlertDialogHeader>
      </div>
      <AlertDialogFooter>
        <AlertDialogCancel>{{ $t('common.cancel') }}</AlertDialogCancel>
        <AlertDialogAction variant="destructive" @click="handleConfirm">
          {{ $t('common.confirm') }}
        </AlertDialogAction>
      </AlertDialogFooter>
    </AlertDialogContent>
  </AlertDialog>
</template>
