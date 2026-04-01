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
  <div class="bg-gray-50 dark:bg-gray-900">
    <AppHeader />
    <main class="mx-auto px-4 py-8 container lg:px-8 sm:px-6">
      <WelcomeSection />
      <div class="mb-6">
        <Tabs ::="workspaceStore.activeTab">
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
          <TabsContent value="recent" class="mt-4">
            <GamesTab v-if="resourceStore.games" />
          </TabsContent>
          <TabsContent value="engines" class="mt-4">
            <EnginesTab v-if="resourceStore.engines" />
          </TabsContent>
        </Tabs>
      </div>
    </main>
  </div>
</template>
