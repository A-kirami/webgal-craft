export interface EngineManifest {
  schemaVersion: string
  id: string
  name: string
  version: string
  engineType: string
  webgalVersion: string
  description?: string
  descriptions?: Record<string, string>
  maintainer?: string
  license?: string
  icon?: string
  urls?: Record<string, string>
  live2dSupport?: boolean
  spineSupport?: boolean
}

export type EngineManifestResult =
  | { status: 'ok', manifest: EngineManifest }
  | { status: 'missing' }
  | { status: 'invalid', reason: string }
  | { status: 'unsupportedSchema', schemaVersion: string, supportedMajor: number }
