<script setup lang="ts">
import { HOME_TABS } from '~/features/home/home-tabs'
import { useDiscoverResources } from '~/features/home/useDiscoverResources'
import { useEnginesTour } from '~/features/onboarding/useEnginesTour'
import { useHomeTour } from '~/features/onboarding/useHomeTour'
import { useManagedImportStatus } from '~/features/resource-import/useManagedImportStatus'
import { useResourceStore } from '~/stores/resource'
import { useWorkspaceStore } from '~/stores/workspace'
import { resolveI18nLike } from '~/utils/i18n-like'

const { t } = useI18n()
const workspaceStore = useWorkspaceStore()
const resourceStore = useResourceStore()
const { checkResourcesForActiveTab } = useDiscoverResources()
const managedImport = useManagedImportStatus()

let isHomeSettled = $ref(false)

// 首次资源发现会打开弹窗，引导必须等它结束再开始，否则会先闪一下引导遮罩再弹发现
async function settleInitialDiscovery() {
  try {
    await checkResourcesForActiveTab()
  } finally {
    isHomeSettled = true
  }
}

watch(() => workspaceStore.activeTab, settleInitialDiscovery, { immediate: true })

useHomeTour({
  isPageReady: () => isHomeSettled,
})

useEnginesTour()
</script>

<template>
  <div class="bg-gray-50 flex flex-col h-full min-h-0 overflow-hidden dark:bg-gray-900">
    <AppHeader />
    <main class="mx-auto px-4 py-8 container flex flex-1 flex-col min-h-0 overflow-hidden lg:px-8 sm:px-6">
      <WelcomeSection />
      <ManagedImportStatus
        v-if="managedImport.isBusy.value"
        :activity="managedImport.activeActivity.value"
        :resource-kind="managedImport.activeKind.value"
        :progress="managedImport.progress.value"
        :can-cancel="managedImport.canCancel.value"
        @cancel="managedImport.cancel"
      />
      <Tabs ::="workspaceStore.activeTab" class="flex-1 gap-2.5 grid grid-rows-[auto_minmax(0,1fr)] min-h-0">
        <div data-testid="home-tabs-header" class="flex flex-col gap-2.5">
          <TabsList class="max-w-72 w-full">
            <TabsTrigger
              v-for="tab in HOME_TABS"
              :key="tab.id"
              :value="tab.id"
              class="rounded-sm"
            >
              {{ resolveI18nLike(tab.label, t) }}
            </TabsTrigger>
          </TabsList>
          <SearchView />
        </div>
        <div data-testid="home-tabs-body" class="min-h-0 overflow-hidden">
          <TabsContent value="recent" class="h-full min-h-0 overflow-hidden">
            <GamesTab v-if="resourceStore.games" />
          </TabsContent>
          <TabsContent value="engines" class="h-full min-h-0 overflow-hidden">
            <EnginesTab v-if="resourceStore.engines" />
          </TabsContent>
          <TabsContent value="templates" class="h-full min-h-0 overflow-hidden">
            <TemplatesTab v-if="resourceStore.templates && resourceStore.engines" />
          </TabsContent>
        </div>
      </Tabs>
    </main>
  </div>
</template>
