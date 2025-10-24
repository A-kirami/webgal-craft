<script setup lang="ts">
import { sep } from '@tauri-apps/api/path'
import { useElementSize } from '@vueuse/core'
import { FolderOpen } from 'lucide-vue-next'
import { computed, nextTick, ref, watch } from 'vue'

const { assetType } = $defineProps<{ assetType: string }>()

let currentPath = $(defineModel<string>('current-path', { required: true }))

const containerRef = ref<HTMLElement | undefined>(undefined)
const { width: containerWidth } = useElementSize(containerRef)

// 常量定义
const ICON_WIDTH = 16
const ITEM_GAP = 10
const SEPARATOR_WIDTH = 14
const SEPARATOR_GROUP_WIDTH = ITEM_GAP * 2 + SEPARATOR_WIDTH
const ELLIPSIS_ICON_WIDTH = 16

const pathSeparator = sep()

// 路径段计算
const pathSegments = computed(() => currentPath.split(pathSeparator).filter(Boolean))
const segmentWidths = ref<number[]>([])
const visibleCount = ref(pathSegments.value.length)

// 计算文本宽度
function measureTextWidth(text: string): number {
  const measureSpan = document.createElement('span')
  measureSpan.className = 'invisible absolute whitespace-nowrap text-xs'
  measureSpan.textContent = text
  document.body.append(measureSpan)
  const width = measureSpan.getBoundingClientRect().width
  measureSpan.remove()
  return width
}

// 计算路径段宽度
function calculateSegmentWidths() {
  const assetTypeWidth = measureTextWidth(assetType)
  const rootNodeWidth = ICON_WIDTH + 4 + assetTypeWidth
  const widths = [rootNodeWidth]
  for (const segment of pathSegments.value) {
    widths.push(measureTextWidth(segment))
  }
  segmentWidths.value = widths
}

// 计算可见宽度
function calculateVisibleWidth(count: number): number {
  if (segmentWidths.value.length === 0) {
    return 0
  }
  const visibleElements = count + 1
  const elementsWidth =
    segmentWidths.value[0]
    + segmentWidths.value.slice(-count).reduce((sum, width) => sum + width, 0)
  const hasEllipsis = pathSegments.value.length > count
  const separatorsWidth = (visibleElements - (hasEllipsis ? 0 : 1)) * SEPARATOR_GROUP_WIDTH
  const ellipsisWidth = hasEllipsis ? ELLIPSIS_ICON_WIDTH : 0
  return elementsWidth + separatorsWidth + ellipsisWidth
}

// 更新 segmentWidths 和 visibleCount，保证顺序
async function updateWidthsAndVisibleCount() {
  await nextTick()
  calculateSegmentWidths()
  await nextTick()
  if (!containerWidth.value || segmentWidths.value.length === 0) {
    return
  }
  let left = 1
  let right = pathSegments.value.length
  while (left <= right) {
    const mid = Math.floor((left + right) / 2)
    const count = Math.max(1, mid)
    if (calculateVisibleWidth(count) <= containerWidth.value) {
      left = mid + 1
    } else {
      right = mid - 1
    }
  }
  visibleCount.value = Math.max(1, right)
}

// 监听器
watch([() => currentPath, containerWidth], updateWidthsAndVisibleCount, { immediate: true })

// 计算可见和隐藏的路径段
const visibleSegments = computed(() => {
  const segments = pathSegments.value
  const count = Math.max(1, visibleCount.value)
  const hidden = segments.slice(0, segments.length - count)
  const visible = segments.slice(-count)
  const last = visible.pop() || ''
  return { hidden, visible, last }
})

// 获取路径URL
function getPathUrl(index: number) {
  return pathSegments.value.slice(0, index + 1).join(pathSeparator)
}

function handleClick(path: string) {
  currentPath = path
}
</script>

<template>
  <Breadcrumb ref="containerRef" class="w-full overflow-hidden">
    <BreadcrumbList class="flex-nowrap whitespace-nowrap">
      <BreadcrumbItem>
        <BreadcrumbLink as="span" class="flex gap-1 cursor-pointer items-center" @click.prevent="handleClick('')">
          <FolderOpen class="size-4" />
          <span class="text-xs">{{ assetType }}</span>
        </BreadcrumbLink>
      </BreadcrumbItem>
      <BreadcrumbSeparator v-if="pathSegments.length > 0" />

      <!-- 隐藏的路径段 -->
      <template v-if="pathSegments.length > visibleCount">
        <BreadcrumbItem>
          <DropdownMenu>
            <DropdownMenuTrigger class="flex gap-1 items-center">
              <BreadcrumbEllipsis class="h-4 w-4" />
              <span class="sr-only">简略路径</span>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start">
              <DropdownMenuItem v-for="(segment, index) in visibleSegments.hidden" :key="index" class="cursor-pointer">
                <BreadcrumbLink as="span" class="text-xs" @click.prevent="handleClick(getPathUrl(index))">
                  {{ segment }}
                </BreadcrumbLink>
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </BreadcrumbItem>
        <BreadcrumbSeparator />
      </template>

      <!-- 可见的路径段 -->
      <template v-for="(segment, index) in visibleSegments.visible" :key="index">
        <BreadcrumbItem>
          <BreadcrumbLink
            as="span"
            class="text-xs cursor-pointer truncate"
            @click.prevent="handleClick(getPathUrl(index + visibleSegments.hidden.length))"
          >
            {{ segment }}
          </BreadcrumbLink>
        </BreadcrumbItem>
        <BreadcrumbSeparator />
      </template>

      <!-- 最后一个路径段 -->
      <BreadcrumbItem>
        <BreadcrumbPage class="text-xs truncate">
          {{ visibleSegments.last }}
        </BreadcrumbPage>
      </BreadcrumbItem>
    </BreadcrumbList>
  </Breadcrumb>
</template>
