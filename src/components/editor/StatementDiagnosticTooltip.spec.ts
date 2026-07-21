import { describe, expect, it } from 'vitest'
import { page } from 'vitest/browser'
import { h } from 'vue'

import { renderInBrowser } from '~/__tests__/browser-render'
import { RelPath } from '~/domain/path'

import StatementDiagnosticTooltip from './StatementDiagnosticTooltip.vue'

import type { EditorFieldDiagnostic } from '~/features/editor/diagnostics/types'

const warningDiagnostic: EditorFieldDiagnostic = {
  code: 'duplicate-label',
  count: 2,
  field: { kind: 'content' },
  label: 'start',
  severity: 'warning',
  source: 'scene',
}

const errorDiagnostic: EditorFieldDiagnostic = {
  assetKey: {
    assetType: 'background',
    relativePath: RelPath.from('missing.png'),
    root: 'asset',
  },
  code: 'missing-resource',
  field: { kind: 'content' },
  severity: 'error',
  source: 'resource',
  value: 'missing.png',
}

function renderTooltip(diagnostics: readonly EditorFieldDiagnostic[]) {
  renderInBrowser(StatementDiagnosticTooltip, {
    props: { diagnostics },
    browser: {
      i18nMode: 'localized',
    },
    slots: {
      default: () => h('button', { type: 'button' }, 'Field control'),
    },
  })
}

describe('StatementDiagnosticTooltip', () => {
  it('hover warning 控件时显示诊断文案和黄色等级样式', async () => {
    renderTooltip([warningDiagnostic])

    await page.getByRole('button', { name: 'Field control' }).hover()

    const message = page.getByRole('listitem')
    await expect.element(message).toBeVisible()
    await expect.element(message).toHaveTextContent('标签“start”在当前场景中定义了 2 次，跳转目标不明确。')
    const tooltip = message.element().closest('[data-statement-diagnostic-tooltip]')
    expect(tooltip).toHaveClass('bg-yellow-100', 'text-yellow-950')
    expect(tooltip).not.toHaveClass('bg-destructive')
  })

  it('hover error 控件时显示资源诊断和 destructive 等级样式', async () => {
    renderTooltip([errorDiagnostic])

    await page.getByRole('button', { name: 'Field control' }).hover()

    const message = page.getByRole('listitem')
    await expect.element(message).toBeVisible()
    await expect.element(message).toHaveTextContent('资源不存在：missing.png')
    const tooltip = message.element().closest('[data-statement-diagnostic-tooltip]')
    expect(tooltip).toHaveClass('bg-destructive', 'text-destructive-foreground')
    expect(tooltip).not.toHaveClass('bg-yellow-100')
  })

  it('无诊断时 hover 控件不显示 tooltip', async () => {
    renderTooltip([])

    await page.getByRole('button', { name: 'Field control' }).hover()

    await expect.element(page.getByRole('tooltip')).not.toBeInTheDocument()
  })
})
