export interface EngineRef {
  id: string
  version?: string
}

export interface StandaloneTemplateBinding {
  kind: 'standalone'
  name: string
}

export interface EngineBuiltinTemplateBinding {
  kind: 'engineBuiltin'
  engine: EngineRef
}

export type TemplateBinding = StandaloneTemplateBinding | EngineBuiltinTemplateBinding

export interface ProjectConfig {
  version: number
  engine?: EngineRef
  template?: TemplateBinding
}

export type VfsSource = 'upper' | 'engineLower' | 'templateLower'

export interface VfsDirEntry {
  name: string
  isDir: boolean
  source: VfsSource
}
