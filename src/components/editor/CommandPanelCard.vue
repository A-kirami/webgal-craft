<script setup lang="ts">
interface Props {
  title: string
  description?: string
  icon?: string
  gradient?: string
  iconBg?: string
  iconText?: string
  interactive?: boolean
  dashed?: boolean
}

const props = withDefaults(defineProps<Props>(), {
  description: '',
  icon: '',
  gradient: 'from-muted-foreground/40 to-muted-foreground/10',
  iconBg: 'bg-muted/60',
  iconText: 'text-foreground/80',
  interactive: true,
  dashed: false,
})

const emit = defineEmits<{
  click: []
}>()

function handleClick() {
  if (!props.interactive) {
    return
  }
  emit('click')
}

function handleKeydown(event: KeyboardEvent) {
  if (event.key !== 'Enter' && event.key !== ' ') {
    return
  }
  event.preventDefault()
  handleClick()
}
</script>

<template>
  <Tooltip :disabled="!description && !$slots.tooltip">
    <TooltipTrigger as-child>
      <div
        role="button"
        :tabindex="interactive ? 0 : -1"
        class="group text-left border rounded-lg bg-card w-full transition-[border-color,background-color,box-shadow,transform] relative overflow-hidden hover:border-primary/35 hover:bg-accent/30 hover:shadow-sm"
        :class="[
          interactive ? 'cursor-pointer active:translate-y-px' : 'cursor-default',
          dashed ? 'border-dashed' : 'border-solid',
        ]"
        @click="handleClick"
        @keydown="handleKeydown"
      >
        <div class="w-1 inset-y-0 left-0 absolute bg-gradient-to-b" :class="gradient" />

        <div class="py-1.75 pl-4 pr-2 flex gap-2.5 min-w-0 items-center">
          <div v-if="icon" class="p-1 rounded-md shrink-0" :class="[iconBg, iconText]">
            <div class="size-4" :class="icon" />
          </div>
          <div class="text-sm font-medium truncate">
            {{ title }}
          </div>
        </div>

        <div class="pl-3 pr-1.5 opacity-0 flex gap-0.5 transition-opacity items-center right-0 top-1/2 absolute from-card from-65% bg-gradient-to-l group-hover:opacity-100 -translate-y-1/2">
          <slot name="actions" />
        </div>
      </div>
    </TooltipTrigger>
    <TooltipContent side="top">
      <slot name="tooltip">
        {{ description }}
      </slot>
    </TooltipContent>
  </Tooltip>
</template>
