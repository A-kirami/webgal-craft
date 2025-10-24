<script setup lang="ts">
const open = defineModel<boolean>('open')

const props = defineProps<{
  title: string
  content: string
  confirmText?: string
  cancelText?: string
  type?: 'default' | 'danger'
  onConfirm?: () => void
  onCancel?: () => void
}>()

const handleCancel = () => {
  open.value = false
  props.onCancel?.()
}

const handleConfirm = () => {
  open.value = false
  props.onConfirm?.()
}
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
          {{ cancelText || '取消' }}
        </AlertDialogCancel>
        <AlertDialogAction :variant="type === 'danger' ? 'destructive' : 'default'" @click="handleConfirm">
          {{ confirmText || '确认' }}
        </AlertDialogAction>
      </AlertDialogFooter>
    </AlertDialogContent>
  </AlertDialog>
</template>
