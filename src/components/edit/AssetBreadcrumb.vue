<script setup lang="ts">
import { sep } from '@tauri-apps/api/path'

const { assetType } = defineProps<{ assetType: string }>()

let currentPath = $(defineModel<string>('current-path', { required: true }))

const workspaceStore = useWorkspaceStore()
const pathSeparator = sep()

const rootPath = computedAsync(async () => {
  const gamePath = workspaceStore.currentGame?.path
  if (!gamePath) {
    return ''
  }
  return await gameAssetDir(gamePath, assetType)
}, '')

function toNativePath(path: string): string {
  if (!path || pathSeparator === '/') {
    return path
  }
  return path.replaceAll('/', pathSeparator)
}

function handleNavigate(path: string) {
  currentPath = toNativePath(path)
}
</script>

<template>
  <PathBreadcrumb
    :root-path="rootPath"
    :current-path="currentPath"
    @navigate="handleNavigate"
  />
</template>
