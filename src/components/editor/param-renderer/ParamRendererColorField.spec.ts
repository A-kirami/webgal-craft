import { describe, expect, it } from 'vitest'

// 浏览器测试环境 uno.css 不含按需工具类（HMR 不生效），布局相关的类必须 safelist
// @unocss-safelist group flex flex-1 flex-none flex-row flex-col flex-wrap items-center justify-center relative block inline-flex w-full w-auto w-fit w-8 w-16 min-w-0 min-w-7 min-w-14 max-w-24 max-w-full max-w-none h-6 h-7 h-8 h-full h-auto gap-0.5 gap-1 gap-1.5 gap-2 p-0 p-0.5 px-1 px-1.5 px-2.5 py-0 py-1 py-1.5 -my-0.5 self-stretch aspect-square shrink-0 grow rounded-md rounded-none rounded-sm border border-0 border-input border-border border-l ring-1 ring-inset ring-foreground/10 outline-none overflow-hidden bg-transparent text-xs text-sm text-right text-muted-foreground font-medium tabular-nums select-none cursor-text cursor-ew-resize touch-none order-first order-last pl-2 pr-2 pr-0.5 has-[>button]:ml-0 field-sizing-content supports-[field-sizing:content]:w-auto supports-[field-sizing:content]:field-sizing-content group-data-[surface=panel]:h-7 group-data-[surface=panel]:font-medium dark:bg-input/30
import 'virtual:uno.css'

import { renderInBrowser } from '~/__tests__/browser-render'
import { statementEditorSurfaceKey } from '~/features/editor/statement-editor/surface-context'

import ParamRenderer from './ParamRenderer.vue'

import type { ColorField, EditorField } from '~/features/editor/command-registry/schema'

const COLOR_VALUE = '#69D9FF'

// 侧边面板 min-size 160 减去 p-4 内边距和滚动条后，可用宽度低于胶囊的内容宽度
const NARROW_WIDTH = 120
const WIDE_WIDTH = 240

function createColorField(): EditorField {
  const field: ColorField = {
    key: 'fontColor',
    label: '字体颜色',
    type: 'color',
  }

  return {
    key: 'fontColor',
    storage: 'arg',
    field,
    argField: {
      field,
      storageKey: 'fontColor',
    },
  }
}

/** 渲染面板下的真实颜色字段，并把容器收窄到指定宽度 */
function renderColorField(width: number) {
  const { container } = renderInBrowser(ParamRenderer, {
    props: {
      canScrub: () => false,
      fields: [createColorField()],
      fileRootPaths: {},
      getAutocompleteOptions: () => [],
      getDynamicOptions: () => [],
      getFieldSelectOptions: () => [],
      supportsExtendedFigurePositions: false,
      getFieldSelectValue: () => '',
      getFieldValue: () => COLOR_VALUE,
      getFieldDiagnostics: () => [],
      isFieldVisible: () => true,
    },
    global: {
      provide: {
        [statementEditorSurfaceKey]: 'panel',
      },
    },
  })

  container.style.width = `${width}px`

  const label = container.querySelector<HTMLElement>('label')
  const pill = container.querySelector<HTMLElement>('[data-slot="input-group"]')
  if (!label || !pill) {
    throw new TypeError('颜色字段没有渲染出标签或胶囊')
  }

  return { label, pill }
}

function box(element: Element): DOMRect {
  return element.getBoundingClientRect()
}

/** 胶囊内的字段都定宽且不收缩，胶囊被压缩时会直接越出边框，因此逐个字段比对边框盒 */
function expectFieldsInsidePill(pill: HTMLElement) {
  const pillBox = box(pill)
  expect(pill.children.length).toBeGreaterThan(0)

  for (const child of pill.children) {
    const childBox = box(child)
    expect(childBox.left).toBeGreaterThanOrEqual(pillBox.left - 0.5)
    expect(childBox.right).toBeLessThanOrEqual(pillBox.right + 0.5)
  }
}

describe('ParamRenderer 颜色字段布局', () => {
  it('面板宽度不足时换行到标签下方，字段不越出胶囊边框', () => {
    const { label, pill } = renderColorField(NARROW_WIDTH)

    expect(box(pill).top).toBeGreaterThanOrEqual(box(label).bottom)
    expectFieldsInsidePill(pill)
  })

  it('面板宽度充足时标签与胶囊保持同行', () => {
    const { label, pill } = renderColorField(WIDE_WIDTH)

    const labelBox = box(label)
    const pillBox = box(pill)
    expect(pillBox.top).toBeLessThan(labelBox.bottom)
    expect(pillBox.bottom).toBeGreaterThan(labelBox.top)
    expectFieldsInsidePill(pill)
  })
})
