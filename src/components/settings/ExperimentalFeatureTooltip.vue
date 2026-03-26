<script setup lang="ts">
import { FlaskConical } from 'lucide-vue-next'
</script>

<template>
  <TooltipProvider :delay-duration="0">
    <Tooltip>
      <TooltipTrigger>
        <FlaskConical class="text-blue-500 size-4" />
      </TooltipTrigger>
      <TooltipContent>
        <p>{{ $t('settings.experimental.tooltip') }}</p>
      </TooltipContent>
    </Tooltip>
  </TooltipProvider>
</template>
