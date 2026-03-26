import { EditorField } from '~/features/editor/command-registry/schema'
import { cn } from '~/lib/utils'

import type { NumberField } from '~/features/editor/command-registry/schema'

type PanelXyPadEditorField = EditorField & {
  field: NumberField & {
    panelPairKey: string
    panelWidget: 'xy-pad'
  }
}

interface UseParamXyPadOptions {
  visibleFields: () => EditorField[]
  visibleFieldIndexMap: () => Map<string, number>
  getFieldValue: (field: EditorField) => string | number | boolean
  labelFn: (field: EditorField) => string
  controlClassFn: (field: EditorField) => string
}

export function useParamXyPad(options: UseParamXyPadOptions) {
  function isPanelXyPadField(field: EditorField): field is PanelXyPadEditorField {
    return field.field.type === 'number'
      && field.field.panelWidget === 'xy-pad'
      && typeof field.field.panelPairKey === 'string'
      && field.field.panelPairKey.length > 0
  }

  function readFieldAxis(field: EditorField): string {
    const segment = field.key.includes('.')
      ? field.key.slice(field.key.lastIndexOf('.') + 1)
      : field.key
    return segment.toLowerCase()
  }

  function resolvePanelXyPair(
    field: EditorField,
  ): { currentIndex: number, pairIndex: number, xField: EditorField, yField: EditorField } | undefined {
    if (!isPanelXyPadField(field)) {
      return
    }

    const fields = options.visibleFields()
    const indexMap = options.visibleFieldIndexMap()

    const pairField = fields.find(item => item.key === field.field.panelPairKey)
    if (!pairField || !isPanelXyPadField(pairField) || pairField.field.panelPairKey !== field.key) {
      return
    }

    const currentIndex = indexMap.get(field.key)
    const pairIndex = indexMap.get(pairField.key)
    if (currentIndex === undefined || pairIndex === undefined) {
      return
    }

    const fieldAxis = readFieldAxis(field)
    const pairAxis = readFieldAxis(pairField)

    if (fieldAxis === 'x' && pairAxis === 'y') {
      return { currentIndex, pairIndex, xField: field, yField: pairField }
    }

    if (fieldAxis === 'y' && pairAxis === 'x') {
      return { currentIndex, pairIndex, xField: pairField, yField: field }
    }

    if (field.key.localeCompare(pairField.key) <= 0) {
      return { currentIndex, pairIndex, xField: field, yField: pairField }
    }

    return { currentIndex, pairIndex, xField: pairField, yField: field }
  }

  function shouldSkipField(field: EditorField): boolean {
    const pair = resolvePanelXyPair(field)
    return !!pair && pair.currentIndex > pair.pairIndex
  }

  function shouldRenderPanelXyPad(field: EditorField): boolean {
    const pair = resolvePanelXyPair(field)
    return !!pair && pair.currentIndex < pair.pairIndex
  }

  function readPanelXyField(field: EditorField, axis: 'x' | 'y'): EditorField | undefined {
    const pair = resolvePanelXyPair(field)
    if (!pair) {
      return
    }
    return axis === 'x' ? pair.xField : pair.yField
  }

  function panelXyLabel(field: EditorField, axis: 'x' | 'y'): string {
    const xyField = readPanelXyField(field, axis)
    return xyField ? options.labelFn(xyField) : ''
  }

  function stripTrailingAxisSuffix(text: string): string {
    const trimmed = text.trim()
    if (!trimmed) {
      return ''
    }
    const stripped = trimmed.replace(/\s*[xXyY]$/, '').trim()
    return stripped || trimmed
  }

  function panelXyGroupLabel(field: EditorField): string {
    const xLabel = panelXyLabel(field, 'x')
    const yLabel = panelXyLabel(field, 'y')

    const normalizedX = stripTrailingAxisSuffix(xLabel)
    if (normalizedX !== xLabel.trim()) {
      return normalizedX
    }

    const normalizedY = stripTrailingAxisSuffix(yLabel)
    if (normalizedY !== yLabel.trim()) {
      return normalizedY
    }

    return xLabel || yLabel || options.labelFn(field)
  }

  function displayLabel(field: EditorField): string {
    if (shouldRenderPanelXyPad(field)) {
      return panelXyGroupLabel(field)
    }
    return options.labelFn(field)
  }

  function panelXyValue(field: EditorField, axis: 'x' | 'y'): string | number | boolean {
    const xyField = readPanelXyField(field, axis)
    return xyField ? options.getFieldValue(xyField) : ''
  }

  function getNumericField(field: EditorField): NumberField | undefined {
    return field.field.type === 'number' ? field.field : undefined
  }

  function panelXyMin(field: EditorField): number | undefined {
    const xMin = getNumericField(readPanelXyField(field, 'x') ?? field)?.min
    const yMin = getNumericField(readPanelXyField(field, 'y') ?? field)?.min
    return xMin ?? yMin
  }

  function panelXyMax(field: EditorField): number | undefined {
    const xMax = getNumericField(readPanelXyField(field, 'x') ?? field)?.max
    const yMax = getNumericField(readPanelXyField(field, 'y') ?? field)?.max
    return xMax ?? yMax
  }

  function panelXyStep(field: EditorField): number {
    const xStep = getNumericField(readPanelXyField(field, 'x') ?? field)?.scrubStep
    const yStep = getNumericField(readPanelXyField(field, 'y') ?? field)?.scrubStep
    return xStep ?? yStep ?? 0.001
  }

  function panelXyControlClass(field: EditorField): string {
    const xClass = options.controlClassFn(readPanelXyField(field, 'x') ?? field)
    const yClass = options.controlClassFn(readPanelXyField(field, 'y') ?? field)
    return cn(xClass, yClass)
  }

  return {
    shouldSkipField,
    shouldRenderPanelXyPad,
    displayLabel,
    panelXyValue,
    panelXyMin,
    panelXyMax,
    panelXyStep,
    panelXyControlClass,
    readPanelXyField,
  }
}
