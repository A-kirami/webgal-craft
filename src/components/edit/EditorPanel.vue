<script setup lang="ts">
const editorStore = useEditorStore()
</script>

<template>
  <div class="flex flex-col h-full overflow-hidden divide-y">
    <div class="pr-4 flex gap-2 items-center justify-between">
      <EditorTabs />
      <EditorModeSwitch v-if="editorStore.canToggleMode" />
    </div>
    <FileEditor />
  </div>
</template>
