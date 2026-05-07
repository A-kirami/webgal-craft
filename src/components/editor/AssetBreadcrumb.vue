<script setup lang="ts">
import { AbsPath, RelPath } from '~/domain/path'
import { useWorkspaceStore } from '~/stores/workspace'

const { assetType } = defineProps<{ assetType: string }>()

let currentPath = $(defineModel<string>('current-path', { required: true }))

const workspaceStore = useWorkspaceStore()

const rootPath = $computed(() => {
  const gamePath = workspaceStore.currentGame?.path
  if (!gamePath) {
    return ''
  }

  return AbsPath.join(AbsPath.from(gamePath), RelPath.from(`game/${assetType}`))
})

function handleNavigate(path: string) {
  currentPath = path
}
</script>

<template>
  <PathBreadcrumb
    :root-path="rootPath"
    :current-path="currentPath"
    @navigate="handleNavigate"
  />
</template>
