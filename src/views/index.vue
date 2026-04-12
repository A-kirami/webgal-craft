<script setup lang="ts">
import { HOME_TABS } from '~/features/home/home-tabs'
import { useDiscoverResources } from '~/features/home/useDiscoverResources'
import { useResourceStore } from '~/stores/resource'
import { useWorkspaceStore } from '~/stores/workspace'
import { resolveI18nLike } from '~/utils/i18n-like'

const { t } = useI18n()
const workspaceStore = useWorkspaceStore()
const resourceStore = useResourceStore()
const { checkResourcesForActiveTab } = useDiscoverResources()

watch(() => workspaceStore.activeTab, checkResourcesForActiveTab, { immediate: true })
</script>

<template>
  <div class="bg-gray-50 flex flex-col h-full min-h-0 overflow-hidden dark:bg-gray-900">
    <AppHeader />
    <main class="mx-auto px-4 py-8 container flex flex-1 flex-col min-h-0 overflow-hidden lg:px-8 sm:px-6">
      <WelcomeSection />
      <Tabs ::="workspaceStore.activeTab" class="mb-6 flex-1 gap-4 grid grid-rows-[auto_minmax(0,1fr)] min-h-0">
        <div data-testid="home-tabs-header" class="space-y-4">
          <TabsList>
            <TabsTrigger
              v-for="tab in HOME_TABS"
              :key="tab.id"
              :value="tab.id"
              class="py-1.5 rounded-sm"
            >
              {{ resolveI18nLike(tab.label, t) }}
            </TabsTrigger>
          </TabsList>
          <SearchView />
        </div>
        <div data-testid="home-tabs-body" class="min-h-0 overflow-hidden">
          <TabsContent value="recent" class="mt-0 h-full min-h-0 overflow-hidden">
            <GamesTab v-if="resourceStore.games" />
          </TabsContent>
          <TabsContent value="engines" class="mt-0 h-full min-h-0 overflow-hidden">
            <EnginesTab v-if="resourceStore.engines" />
          </TabsContent>
        </div>
      </Tabs>
    </main>
  </div>
</template>
