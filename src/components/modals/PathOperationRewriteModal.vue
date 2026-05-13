<script setup lang="ts">
let open = $(defineModel<boolean>('open'))

const {
  title,
  content,
  defaultText,
  dangerText,
  cancelText,
  onDefault,
  onDanger,
  onCancel,
} = defineProps<{
  title: string
  content: string
  defaultText: string
  dangerText: string
  cancelText?: string
  onDefault?: () => void | Promise<void>
  onDanger?: () => boolean | Promise<boolean>
  onCancel?: () => void | Promise<void>
}>()

let actionHandled = $ref(false)

type ModalAction = (() => void | Promise<void>) | undefined

async function runAction(action: ModalAction): Promise<void> {
  actionHandled = true
  try {
    await action?.()
  } catch (error) {
    actionHandled = false
    throw error
  }
}

async function runActionAndClose(action: ModalAction): Promise<void> {
  await runAction(action)
  open = false
}

async function handleDefault(): Promise<void> {
  await runActionAndClose(onDefault)
}

async function handleDanger(): Promise<void> {
  actionHandled = true
  try {
    const shouldClose = await onDanger?.()
    if (shouldClose) {
      open = false
    } else {
      actionHandled = false
    }
  } catch (error) {
    actionHandled = false
    throw error
  }
}

async function handleCancel(): Promise<void> {
  await runActionAndClose(onCancel)
}

watch(() => open, async (nextOpen, previousOpen) => {
  if (nextOpen) {
    actionHandled = false
    return
  }

  if (previousOpen && !actionHandled) {
    await runAction(onCancel)
  }
})
</script>

<template>
  <AlertDialog ::open="open">
    <AlertDialogContent>
      <AlertDialogHeader>
        <AlertDialogTitle>{{ title }}</AlertDialogTitle>
        <AlertDialogDescription>
          {{ content }}
        </AlertDialogDescription>
      </AlertDialogHeader>
      <AlertDialogFooter>
        <AlertDialogCancel @click="handleCancel">
          {{ cancelText ?? $t('common.cancel') }}
        </AlertDialogCancel>
        <Button variant="outline" @click="handleDanger">
          {{ dangerText }}
        </Button>
        <AlertDialogAction @click="handleDefault">
          {{ defaultText }}
        </AlertDialogAction>
      </AlertDialogFooter>
    </AlertDialogContent>
  </AlertDialog>
</template>
