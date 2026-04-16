import {
  autoUpdate,
  flip,
  limitShift,
  offset,
  shift,
  size,
  useFloating,
} from '@floating-ui/vue'

import type { Placement, ReferenceElement } from '@floating-ui/vue'
import type { ComputedRef, CSSProperties, Ref, ShallowRef } from 'vue'

export interface UseCascadingSubmenuFloatingOptions {
  anchor: Ref<ReferenceElement | undefined> | ComputedRef<ReferenceElement | undefined>
  open: Ref<boolean> | ComputedRef<boolean>
  side?: Ref<'left' | 'right'> | ComputedRef<'left' | 'right'> | 'left' | 'right'
}

export interface CascadingSubmenuFloatingApi {
  floatingRef: ShallowRef<HTMLElement | undefined>
  isPositioned: Readonly<Ref<boolean>>
  placedAlign: ComputedRef<'center' | 'end' | 'start'>
  placedSide: ComputedRef<'left' | 'right'>
  wrapperStyle: ComputedRef<CSSProperties>
}

const FRAMES_BEFORE_OPTIMIZED_FALLBACK = 6

function getSideValue(
  side: UseCascadingSubmenuFloatingOptions['side'],
): 'left' | 'right' {
  if (!side) {
    return 'right'
  }

  return typeof side === 'string' ? side : side.value
}

function getSideAndAlignFromPlacement(placement: Placement) {
  const [side, align = 'center'] = placement.split('-')

  return {
    align: align as 'center' | 'end' | 'start',
    side: side as 'bottom' | 'left' | 'right' | 'top',
  }
}

function resolveAnimationTrackingElements(
  reference: ReferenceElement,
  floating: HTMLElement,
): HTMLElement[] {
  const trackedElements = new Set<HTMLElement>()
  const candidateElements = [
    floating,
    reference,
    'contextElement' in reference ? reference.contextElement : undefined,
  ]

  for (const element of candidateElements) {
    if (!(element instanceof HTMLElement)) {
      continue
    }

    trackedElements.add(element)

    const wrapperElement = element.closest<HTMLElement>('[data-reka-popper-content-wrapper]')
    if (wrapperElement) {
      trackedElements.add(wrapperElement)
    }
  }

  return [...trackedElements]
}

function hasActiveAnimations(element: HTMLElement): boolean {
  return element.getAnimations().some((animation) => {
    return animation.playState === 'running'
  })
}

export function useCascadingSubmenuFloating(
  options: UseCascadingSubmenuFloatingOptions,
): CascadingSubmenuFloatingApi {
  const floatingRef = shallowRef<HTMLElement>()
  const desiredPlacement = computed(
    () => `${getSideValue(options.side)}-start` as Placement,
  )
  const middleware = computed(() => {
    return [
      offset({
        mainAxis: 2,
        alignmentAxis: -5,
      }),
      flip({
        mainAxis: true,
        crossAxis: true,
      }),
      shift({
        mainAxis: true,
        crossAxis: false,
        limiter: limitShift(),
      }),
      size({
        apply: ({ elements, rects, availableWidth, availableHeight }) => {
          const { width: anchorWidth, height: anchorHeight } = rects.reference
          const contentStyle = elements.floating.style

          contentStyle.setProperty('--reka-popper-available-width', `${availableWidth}px`)
          contentStyle.setProperty('--reka-popper-available-height', `${availableHeight}px`)
          contentStyle.setProperty('--reka-popper-anchor-width', `${anchorWidth}px`)
          contentStyle.setProperty('--reka-popper-anchor-height', `${anchorHeight}px`)
        },
      }),
    ]
  })

  const { floatingStyles, placement, isPositioned, update } = useFloating(
    options.anchor,
    floatingRef,
    {
      strategy: 'fixed',
      placement: desiredPlacement,
      middleware,
    },
  )

  const placedSide = computed<'left' | 'right'>(
    () => getSideAndAlignFromPlacement(placement.value).side === 'left' ? 'left' : 'right',
  )
  const placedAlign = computed(
    () => getSideAndAlignFromPlacement(placement.value).align,
  )
  const wrapperStyle = computed<CSSProperties>(() => ({
    ...floatingStyles.value,
    minWidth: 'max-content',
    transform: isPositioned.value
      ? floatingStyles.value.transform
      : 'translate(0, -200%)',
  }))

  watch(
    () => [options.open.value, options.anchor.value, floatingRef.value] as const,
    ([isOpen, anchor, floating], _, onCleanup) => {
      if (!isOpen || !anchor || !floating) {
        return
      }

      const referenceElement = anchor
      const floatingElement = floating
      let stopAutoUpdate: (() => void) | undefined
      let fallbackFrameId = 0
      let idleFrameCount = 0

      function restartAutoUpdate(useAnimationFrame: boolean) {
        stopAutoUpdate?.()
        stopAutoUpdate = autoUpdate(referenceElement, floatingElement, update, useAnimationFrame
          ? { animationFrame: true }
          : undefined)
      }

      function scheduleOptimizedFallback() {
        const trackingElements = resolveAnimationTrackingElements(referenceElement, floatingElement)

        const detectAnimationEnd = () => {
          if (trackingElements.some(element => hasActiveAnimations(element))) {
            idleFrameCount = 0
            fallbackFrameId = requestAnimationFrame(detectAnimationEnd)
            return
          }

          idleFrameCount += 1
          if (idleFrameCount < FRAMES_BEFORE_OPTIMIZED_FALLBACK) {
            fallbackFrameId = requestAnimationFrame(detectAnimationEnd)
            return
          }

          restartAutoUpdate(false)
        }

        fallbackFrameId = requestAnimationFrame(detectAnimationEnd)
      }

      update()
      restartAutoUpdate(true)
      scheduleOptimizedFallback()

      onCleanup(() => {
        stopAutoUpdate?.()
        cancelAnimationFrame(fallbackFrameId)
      })
    },
    {
      flush: 'post',
    },
  )

  return {
    floatingRef,
    isPositioned,
    placedAlign,
    placedSide,
    wrapperStyle,
  }
}
