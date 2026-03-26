import { ColorField } from '~/features/editor/command-registry/schema'
import { createParamDrag } from '~/features/editor/effect-editor/createParamDrag'
import { EffectControlDeps } from '~/features/editor/effect-editor/types'
import { extractRgbColor, normalizeColorChannel } from '~/utils/color'

/** ColorField 且必定有 colorPaths/colorDefaults 的子类型（用于效果编辑器 color 控件） */
type EffectColorField = ColorField & { colorPaths: [string, string, string], colorDefaults: [number, number, number] }

export function useEffectColorControl(deps: EffectControlDeps) {
  // 颜色拖拽期间暂存最终颜色值。
  // color picker 在拖拽过程中高频触发 onChange，每次都 flush 会导致大量 IPC 调用；
  // 拖拽期间仅做 deferred 预览，拖拽结束时（onEnd）才用暂存值执行一次 flush
  let pendingColorFlushValue = $ref<[number, number, number]>()

  function getColorValue(param: EffectColorField): [number, number, number] {
    const red = normalizeColorChannel(deps.getNumberValue(param.colorPaths[0], param.colorDefaults[0]), param.colorDefaults[0])
    const green = normalizeColorChannel(deps.getNumberValue(param.colorPaths[1], param.colorDefaults[1]), param.colorDefaults[1])
    const blue = normalizeColorChannel(deps.getNumberValue(param.colorPaths[2], param.colorDefaults[2]), param.colorDefaults[2])
    return [red, green, blue]
  }

  function getColorPickerValue(param: EffectColorField): { b: number, g: number, r: number } {
    const [r, g, b] = getColorValue(param)
    return { r, g, b }
  }

  function updateColorField(
    param: EffectColorField,
    color: [number, number, number],
    options: { flush?: boolean, deferAutoApply?: boolean } = {},
  ) {
    const fields = deps.getFields()
    deps.setNumericField(fields, param.colorPaths[0], color[0])
    deps.setNumericField(fields, param.colorPaths[1], color[1])
    deps.setNumericField(fields, param.colorPaths[2], color[2])

    deps.emitTransform(fields, { schedule: 'color', ...options })
  }

  const { drag: colorDrag, start: startColorDrag } = createParamDrag<
    EffectColorField,
    Record<string, never>
  >({
    onStart() {
      return {}
    },
    onMove() { /* noop */ },
    onEnd(_event, state) {
      const targetColor = pendingColorFlushValue ?? getColorValue(state.param)
      pendingColorFlushValue = undefined
      updateColorField(state.param, targetColor, {
        flush: true,
        deferAutoApply: false,
      })
    },
  })

  function handleColorPickerChange(param: EffectColorField, rawValue: unknown) {
    const parsed = extractRgbColor(rawValue)
    if (!parsed) {
      return
    }

    const isDraggingCurrentParam = colorDrag.active && colorDrag.state?.param === param
    if (!isDraggingCurrentParam) {
      updateColorField(param, parsed, {
        flush: true,
        deferAutoApply: false,
      })
      return
    }

    pendingColorFlushValue = parsed
    updateColorField(param, parsed, { deferAutoApply: true })
  }

  function clearPendingColorFlush() {
    pendingColorFlushValue = undefined
  }

  return {
    getColorValue,
    getColorPickerValue,
    updateColorField,
    handleColorPickerPointerDown: startColorDrag,
    handleColorPickerChange,
    clearPendingColorFlush,
    colorDrag,
  }
}
