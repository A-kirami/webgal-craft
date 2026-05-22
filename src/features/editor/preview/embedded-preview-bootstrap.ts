export const WEBGAL_PREVIEW_BOOTSTRAP_REQUEST = 'webgal.preview.bootstrap.request' as const
export const WEBGAL_PREVIEW_BOOTSTRAP_PROVIDE = 'webgal.preview.bootstrap.provide' as const

export interface PreviewBootstrapRequestMessage {
  type: typeof WEBGAL_PREVIEW_BOOTSTRAP_REQUEST
}

export interface PreviewBootstrapProvideMessage {
  type: typeof WEBGAL_PREVIEW_BOOTSTRAP_PROVIDE
  embeddedLaunchId: string
}

export function isPreviewBootstrapRequestMessage(value: unknown): value is PreviewBootstrapRequestMessage {
  return typeof value === 'object'
    && value !== null
    && 'type' in value
    && value.type === WEBGAL_PREVIEW_BOOTSTRAP_REQUEST
}

export function createPreviewBootstrapProvideMessage(
  embeddedLaunchId: string,
): PreviewBootstrapProvideMessage {
  return {
    type: WEBGAL_PREVIEW_BOOTSTRAP_PROVIDE,
    embeddedLaunchId,
  }
}
