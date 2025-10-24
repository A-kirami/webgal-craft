<script setup lang="ts">
const workspaceStore = useWorkspaceStore()
const resourceStore = useResourceStore()
</script>

<template>
  <div class="bg-gray-50 dark:bg-gray-900">
    <AppHeader />
    <main class="mx-auto px-4 py-8 container lg:px-8 sm:px-6">
      <WelcomeSection />
      <div class="mb-6">
        <Tabs v-model="workspaceStore.activeTab">
          <TabsList>
            <TabsTrigger value="recent" class="py-1.5 rounded-sm">
              {{ $t('home.tabs.recent') }}
            </TabsTrigger>
            <TabsTrigger value="engines" class="py-1.5 rounded-sm">
              {{ $t('home.tabs.engines') }}
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
