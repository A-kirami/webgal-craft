export type EngineModelType = 'live2d' | 'spine'

export interface EngineModelCapabilities {
  live2d: boolean
  spine: boolean
}

interface EngineModelCapabilityDeclaration {
  live2dSupport?: boolean
  spineSupport?: boolean
}

export function resolveEngineModelCapabilities(
  declaration: EngineModelCapabilityDeclaration,
): EngineModelCapabilities {
  return {
    live2d: declaration.live2dSupport === true,
    spine: declaration.spineSupport === true,
  }
}

export function classifyEngineModelReference(reference: string): EngineModelType | undefined {
  const [rawPath = '', rawQuery = ''] = reference.trim().split('?', 2)
  const modelType = new URLSearchParams(rawQuery).get('type')?.toLowerCase()
  if (modelType === 'spine') {
    return 'spine'
  }

  const path = rawPath.toLowerCase()
  if (path.endsWith('.skel')) {
    return 'spine'
  }
  if (path.endsWith('.json')) {
    return 'live2d'
  }
}
