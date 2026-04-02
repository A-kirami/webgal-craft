export const DEFAULT_PREVIEW_PANEL_ASPECT_RATIO = '16/9'

const DEFAULT_PREVIEW_PANEL_STAGE_WIDTH = 2560
const DEFAULT_PREVIEW_PANEL_STAGE_HEIGHT = 1440

export interface PreviewPanelGameConfigLike {
  stageHeight?: unknown
  stageWidth?: unknown
}

export interface PreviewPanelStageSize {
  aspectRatio: string
  stageHeight: number
  stageWidth: number
}

export interface ResolvePreviewPanelStageSizeOptions {
  currentGamePath?: string
  gameConfig?: PreviewPanelGameConfigLike
  requestedPath?: string
}

export function resolvePreviewPanelStageSize(
  options: ResolvePreviewPanelStageSizeOptions,
): PreviewPanelStageSize | undefined {
  const { currentGamePath, gameConfig, requestedPath } = options

  if (requestedPath && currentGamePath !== requestedPath) {
    return
  }

  const parsedStageWidth = Number(gameConfig?.stageWidth)
  const parsedStageHeight = Number(gameConfig?.stageHeight)
  const hasValidStageWidth = Number.isFinite(parsedStageWidth) && parsedStageWidth > 0
  const hasValidStageHeight = Number.isFinite(parsedStageHeight) && parsedStageHeight > 0
  const stageWidth = hasValidStageWidth ? parsedStageWidth : DEFAULT_PREVIEW_PANEL_STAGE_WIDTH
  const stageHeight = hasValidStageHeight ? parsedStageHeight : DEFAULT_PREVIEW_PANEL_STAGE_HEIGHT
  const hasResolvedStageSize = hasValidStageWidth && hasValidStageHeight

  return {
    aspectRatio: hasResolvedStageSize
      ? `${stageWidth}/${stageHeight}`
      : DEFAULT_PREVIEW_PANEL_ASPECT_RATIO,
    stageHeight,
    stageWidth,
  }
}
