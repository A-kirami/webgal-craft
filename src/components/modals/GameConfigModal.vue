<script setup lang="ts">
/* eslint-disable @intlify/vue-i18n/no-raw-text */
const open = defineModel<boolean>('open')
</script>

<template>
  <Dialog ::open="open">
    <DialogContent class="sm:max-w-[425px]">
      <DialogHeader>
        <DialogTitle>{{ $t('modals.gameConfig.title') }}</DialogTitle>
        <DialogDescription>
          Description
        </DialogDescription>
      </DialogHeader>
      Content
      <DialogFooter>
        Footer
      </DialogFooter>
    </DialogContent>
  </Dialog>
</template>
