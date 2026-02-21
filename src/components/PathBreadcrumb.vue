<script setup lang="ts">
import { FolderOpen, MoreHorizontal } from 'lucide-vue-next'

interface PathBreadcrumbProps {
  /** 根目录绝对路径（用于推导根节点文案） */
  rootPath: string
  /** 当前相对路径，统一使用 / 分隔 */
  currentPath: string
  /** 是否显示根节点图标 */
  showRootIcon?: boolean
  /** 根节点图标组件（可选） */
  rootIcon?: Component
  /** 折叠策略 */
  collapseMode?: 'auto'
}

interface PathBreadcrumbEmits {
  /** 点击任意路径段时触发，value 为相对路径（root 为 ''） */
  navigate: [value: string]
}

const {
  rootPath,
  currentPath,
  showRootIcon = true,
  rootIcon,
  collapseMode = 'auto',
} = defineProps<PathBreadcrumbProps>()

const emit = defineEmits<PathBreadcrumbEmits>()
const { t } = useI18n()

let containerRef = $ref<HTMLElement | undefined>()
let measureRowRefs = $ref<Record<number, HTMLElement>>({})
let candidateWidths = $ref<number[]>([])

const normalizedCurrentPath = $computed(() => normalizeRelativePath(currentPath))
const pathSegments = $computed(() => normalizedCurrentPath ? normalizedCurrentPath.split('/') : [])
const middleSegments = $computed(() => pathSegments.slice(0, -1))
const hasLastSegment = $computed(() => pathSegments.length > 0)
const lastSegment = $computed(() => pathSegments.at(-1) ?? '')
const maxVisibleMiddleCount = $computed(() => middleSegments.length)
const visibleCountOptions = $computed(() => Array.from({ length: maxVisibleMiddleCount + 1 }, (_, index) => index))

const resolvedRootLabel = $computed(() => inferRootLabel(rootPath))
const resolvedRootIcon = $computed(() => rootIcon ?? FolderOpen)

const { visibleMiddleCount, recalculate } = $(useBreadcrumbCollapse({
  containerRef: $$(containerRef),
  maxVisibleMiddleCount: $$(maxVisibleMiddleCount),
  candidateWidths: $$(candidateWidths),
}))

const activeVisibleMiddleCount = $computed(() =>
  collapseMode === 'auto' ? visibleMiddleCount : maxVisibleMiddleCount,
)

const safeVisibleCount = $computed(() => clampCount(activeVisibleMiddleCount))

const hiddenSegments = $computed(() => middleSegments.slice(0, middleSegments.length - safeVisibleCount))
const hiddenSegmentsToggleLabel = $computed(() => t('common.breadcrumb.showHiddenSegmentsCount', { count: hiddenSegments.length }))

const visibleMiddleSegments = $computed(() => middleSegments.slice(middleSegments.length - safeVisibleCount))

const hasCollapsedSegments = $computed(() => hiddenSegments.length > 0)

// -- 工具函数 --

function normalizeRelativePath(path: string): string {
  return path
    .replaceAll('\\', '/')
    .replace(/^\/+/, '')
    .replace(/\/+$/, '')
}

function inferRootLabel(path: string): string {
  return path.replaceAll('\\', '/').split('/').findLast(Boolean) ?? ''
}

function clampCount(count: number): number {
  return Math.max(0, Math.min(count, maxVisibleMiddleCount))
}

function getPathByIndex(index: number): string {
  return pathSegments.slice(0, index + 1).join('/')
}

function getHiddenSegmentsByCount(visibleCount: number): string[] {
  return middleSegments.slice(0, middleSegments.length - clampCount(visibleCount))
}

function getVisibleMiddleSegmentsByCount(visibleCount: number): string[] {
  return middleSegments.slice(middleSegments.length - clampCount(visibleCount))
}

// -- 事件处理与 DOM 测量 --

function handleNavigate(path: string) {
  emit('navigate', normalizeRelativePath(path))
}

function setMeasureRowRef(visibleCount: number, element: Element | null) {
  if (element instanceof HTMLElement) {
    measureRowRefs[visibleCount] = element
    return
  }
  delete measureRowRefs[visibleCount]
}

async function collectCandidateWidths() {
  await nextTick()
  candidateWidths = visibleCountOptions.map(count => measureRowRefs[count]?.offsetWidth ?? 0)
  recalculate()
}

watch(
  [
    () => visibleCountOptions,
    () => pathSegments,
    () => resolvedRootLabel,
    () => showRootIcon,
    () => resolvedRootIcon,
    () => collapseMode,
  ],
  collectCandidateWidths,
  { immediate: true, flush: 'post' },
)
</script>

<template>
  <div ref="containerRef" class="w-full relative overflow-hidden">
    <Breadcrumb class="w-full overflow-hidden">
      <BreadcrumbList class="flex-nowrap min-w-0 whitespace-nowrap">
        <BreadcrumbItem class="shrink-0">
          <BreadcrumbLink as="span" class="flex gap-1 cursor-pointer items-center" @click.prevent="handleNavigate('')">
            <template v-if="showRootIcon">
              <slot name="root-icon">
                <component :is="resolvedRootIcon" class="shrink-0 size-4" />
              </slot>
            </template>
            <span class="text-xs">{{ resolvedRootLabel }}</span>
          </BreadcrumbLink>
        </BreadcrumbItem>
        <BreadcrumbSeparator v-if="hasLastSegment" />

        <template v-if="hasCollapsedSegments">
          <BreadcrumbItem class="shrink-0">
            <DropdownMenu>
              <DropdownMenuTrigger class="flex cursor-pointer items-center">
                <MoreHorizontal class="size-4" />
                <span class="sr-only">{{ hiddenSegmentsToggleLabel }}</span>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start">
                <DropdownMenuItem
                  v-for="(segment, index) in hiddenSegments"
                  :key="`${segment}-${index}`"
                  class="cursor-pointer"
                  @click="handleNavigate(getPathByIndex(index))"
                >
                  <span class="text-xs">{{ segment }}</span>
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
        </template>

        <template v-for="(segment, index) in visibleMiddleSegments" :key="`${segment}-${index}`">
          <BreadcrumbItem class="shrink-0">
            <BreadcrumbLink
              as="span"
              class="text-xs cursor-pointer"
              @click.prevent="handleNavigate(getPathByIndex(index + hiddenSegments.length))"
            >
              {{ segment }}
            </BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
        </template>

        <BreadcrumbItem v-if="hasLastSegment" class="min-w-0">
          <BreadcrumbPage class="text-xs truncate">
            {{ lastSegment }}
          </BreadcrumbPage>
        </BreadcrumbItem>
      </BreadcrumbList>
    </Breadcrumb>

    <!-- 离屏测量候选布局宽度，用于计算最优折叠结果 -->
    <div aria-hidden="true" class="opacity-0 h-0 pointer-events-none left-0 top-0 absolute overflow-hidden -z-10">
      <div
        v-for="visibleCount in visibleCountOptions"
        :key="visibleCount"
        :ref="element => setMeasureRowRef(visibleCount, element as Element | null)"
        class="w-max"
      >
        <Breadcrumb class="w-max overflow-hidden">
          <BreadcrumbList class="flex-nowrap whitespace-nowrap">
            <BreadcrumbItem class="shrink-0">
              <BreadcrumbLink as="span" class="flex gap-1 items-center">
                <template v-if="showRootIcon">
                  <slot name="root-icon">
                    <component :is="resolvedRootIcon" class="shrink-0 size-4" />
                  </slot>
                </template>
                <span class="text-xs">{{ resolvedRootLabel }}</span>
              </BreadcrumbLink>
            </BreadcrumbItem>
            <BreadcrumbSeparator v-if="hasLastSegment" />

            <template v-if="getHiddenSegmentsByCount(visibleCount).length > 0">
              <BreadcrumbItem class="shrink-0">
                <span class="flex items-center">
                  <MoreHorizontal class="size-4" />
                </span>
              </BreadcrumbItem>
              <BreadcrumbSeparator />
            </template>

            <template v-for="(segment, index) in getVisibleMiddleSegmentsByCount(visibleCount)" :key="`${segment}-${index}`">
              <BreadcrumbItem class="shrink-0">
                <span class="text-xs">
                  {{ segment }}
                </span>
              </BreadcrumbItem>
              <BreadcrumbSeparator />
            </template>

            <BreadcrumbItem v-if="hasLastSegment">
              <span class="text-xs">{{ lastSegment }}</span>
            </BreadcrumbItem>
          </BreadcrumbList>
        </Breadcrumb>
      </div>
    </div>
  </div>
</template>
