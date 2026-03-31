import type {
  EffectControlDeps,
  EmitTransformOptions,
} from '~/features/editor/effect-editor/types'

export function useEffectClearControls(deps: EffectControlDeps) {
  function canClearPaths(paths: readonly string[]): boolean {
    return paths.some(path => deps.getFieldValue(path) !== '')
  }

  function clearPaths(paths: readonly string[], options: EmitTransformOptions): void {
    const fields = deps.getFields()
    let changed = false

    for (const path of paths) {
      if (!(path in fields)) {
        continue
      }

      delete fields[path]
      changed = true
    }

    if (!changed) {
      return
    }

    deps.emitTransform(fields, {
      ...options,
      deferAutoApply: !options.flush,
    })
  }

  return {
    canClearPaths,
    clearPaths,
  }
}
