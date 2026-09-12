import { ColorField } from '~/features/editor/command-registry/schema'
import { EffectControlDeps } from '~/features/editor/effect-editor/types'
import { normalizeColorChannel, parseHexColor, rgbToHex } from '~/utils/color'

/** ColorField 且必定有 colorPaths/colorDefaults 的子类型（用于效果编辑器 color 控件） */
type EffectColorField = ColorField & { colorPaths: [string, string, string], colorDefaults: [number, number, number] }

export function useEffectColorControl(deps: EffectControlDeps) {
  // 选择器打开期间暂存最终颜色值，关闭时才执行一次 flush。
  // 以 Popover 生命周期为界可同时覆盖色板拖拽、触摸和键盘输入。
  let activeColorParam: EffectColorField | undefined
  let pendingColorFlushValue: [number, number, number] | undefined

  function isColorEqual(left: [number, number, number], right: [number, number, number]): boolean {
    return left[0] === right[0] && left[1] === right[1] && left[2] === right[2]
  }

  function getColorValue(param: EffectColorField): [number, number, number] {
    const red = normalizeColorChannel(deps.getNumberValue(param.colorPaths[0], param.colorDefaults[0]), param.colorDefaults[0])
    const green = normalizeColorChannel(deps.getNumberValue(param.colorPaths[1], param.colorDefaults[1]), param.colorDefaults[1])
    const blue = normalizeColorChannel(deps.getNumberValue(param.colorPaths[2], param.colorDefaults[2]), param.colorDefaults[2])
    return [red, green, blue]
  }

  function getColorPickerValue(param: EffectColorField): string {
    const [red, green, blue] = getColorValue(param)
    return rgbToHex(red, green, blue)
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

    deps.emitTransform(fields, options)
  }

  function flushColorInteraction(param: EffectColorField) {
    if (activeColorParam !== param) {
      return
    }

    activeColorParam = undefined
    if (!pendingColorFlushValue) {
      return
    }

    const targetColor = pendingColorFlushValue
    pendingColorFlushValue = undefined
    updateColorField(param, targetColor, {
      flush: true,
      deferAutoApply: false,
    })
  }

  function handleColorPickerOpenChange(param: EffectColorField, open: boolean) {
    if (!open) {
      flushColorInteraction(param)
      return
    }

    if (activeColorParam && activeColorParam !== param) {
      flushColorInteraction(activeColorParam)
    }
    activeColorParam = param
    pendingColorFlushValue = undefined
  }

  /** 选择器只回传 hex 字符串；空值与非法值都表示没有要写入的颜色 */
  function handleColorPickerChange(param: EffectColorField, value: string) {
    const parsed = parseHexColor(value)
    if (!parsed) {
      return
    }

    if (isColorEqual(parsed, getColorValue(param))) {
      return
    }

    if (activeColorParam !== param) {
      updateColorField(param, parsed, {
        flush: true,
        deferAutoApply: false,
      })
      return
    }

    pendingColorFlushValue = parsed
    updateColorField(param, parsed, { deferAutoApply: true })
  }

  function cancelColorInteraction() {
    const wasActive = activeColorParam !== undefined
    activeColorParam = undefined
    pendingColorFlushValue = undefined
    if (wasActive) {
      void deps.cancelPreview?.()
    }
  }

  return {
    getColorValue,
    getColorPickerValue,
    updateColorField,
    handleColorPickerOpenChange,
    handleColorPickerChange,
    cancelColorInteraction,
  }
}
