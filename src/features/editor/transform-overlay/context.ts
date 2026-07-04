import type { useTransformOverlayBridge } from './useTransformOverlayBridge'

type UseTransformOverlayBridgeReturn = ReturnType<typeof useTransformOverlayBridge>

export const TRANSFORM_OVERLAY_BRIDGE_KEY: InjectionKey<UseTransformOverlayBridgeReturn> =
  Symbol('transform-overlay-bridge')
