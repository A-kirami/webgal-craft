<script setup lang="ts">
const open = defineModel<boolean>('open')
</script>

<template>
  <Dialog ::open="open">
    <DialogContent class="sm:max-w-[425px]">
      <DialogHeader>
        <DialogTitle>更新</DialogTitle>
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
