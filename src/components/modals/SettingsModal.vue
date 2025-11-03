<script setup lang="tsx">
const open = defineModel<boolean>('open')

const TabItem = (props: { value: string, label: string }) => {
  return (
    <TabsTrigger
      value={props.value}
      class="py-1.5 w-full justify-start data-[state=active]:bg-muted data-[state=active]:shadow-none"
    >
      {props.label}
    </TabsTrigger>
  )
}
</script>

<template>
  <Dialog ::open="open">
    <DialogContent class="grid-rows-[auto_1fr] min-w-180 md:h-150">
      <DialogHeader>
        <DialogTitle>{{ $t('common.settings') }}</DialogTitle>
        <DialogDescription>
          {{ $t('modals.settings.description') }}
        </DialogDescription>
      </DialogHeader>
      <Tabs default-value="general" orientation="vertical" class="flex flex-row gap-2 w-full overflow-hidden">
        <TabsList class="p-0 bg-transparent flex-col gap-1 min-w-40 justify-start">
          <TabItem value="general" :label="$t('modals.settings.tabs.general')" />
          <TabItem value="edit" :label="$t('modals.settings.tabs.edit')" />
          <TabItem value="preview" :label="$t('modals.settings.tabs.preview')" />
          <TabItem value="storage" :label="$t('modals.settings.tabs.storage')" />
        </TabsList>
        <ScrollArea class="w-full">
          <TabsContent value="general" class="mt-1 px-4">
            <GeneralSettings />
          </TabsContent>
          <TabsContent value="edit" class="mt-1 px-4">
            <EditSettings />
          </TabsContent>
          <TabsContent value="preview" class="mt-1 px-4">
            <PreviewSettings />
          </TabsContent>
          <TabsContent value="storage" class="mt-1 px-4">
            <StorageSettings />
          </TabsContent>
        </ScrollArea>
      </Tabs>
    </DialogContent>
  </Dialog>
</template>
