import { describe, expect, it, vi } from 'vitest'
import { page, userEvent } from 'vitest/browser'

import { renderInBrowser } from '~/__tests__/browser-render'

import FlowchartManagerMenu from './FlowchartManagerMenu.vue'
// @unocss-safelist w-64 w-[var(--reka-popover-trigger-width)] h-6 h-7
import 'virtual:uno.css'

import type { Flowchart } from '~/domain/flowchart/model'

function createFlowchart(overrides: Partial<Flowchart> & Pick<Flowchart, 'id' | 'kind' | 'name'>): Flowchart {
  return {
    edges: [],
    nodes: [],
    ...overrides,
  }
}

const mainFlowchart = createFlowchart({ id: 'main', kind: 'main', name: '主线剧情' })
const branchFlowchart = createFlowchart({ id: 'branch-1', kind: 'character', name: '支线剧情1' })

async function renderMenu(options: {
  activeFlowchartId?: string
  i18nMode?: 'lite' | 'localized'
  onCreate?: () => void
  onDelete?: (flowchartId: string) => void
  onRename?: (flowchartId: string, name: string) => void
  onSelect?: (flowchartId: string) => void
} = {}) {
  return await renderInBrowser(FlowchartManagerMenu, {
    browser: { i18nMode: options.i18nMode },
    props: {
      activeFlowchartId: options.activeFlowchartId ?? 'main',
      flowcharts: [mainFlowchart, branchFlowchart],
      onCreate: options.onCreate,
      onDelete: options.onDelete,
      onRename: options.onRename,
      onSelect: options.onSelect,
    },
  })
}

async function openMenu() {
  await page.getByTestId('flowchart-manager-trigger').click()
}

async function clickByTestId(testId: string) {
  const element = await page.getByTestId(testId).element() as HTMLElement
  element.click()
}

describe('FlowchartManagerMenu', () => {
  it('入口显示当前流程图与类型徽标', async () => {
    await renderMenu()

    const trigger = await page.getByTestId('flowchart-manager-trigger').element()
    expect(trigger.textContent).toContain('edit.flowchart.manager.labelPrefix')
    expect(trigger.textContent).toContain('edit.flowchart.manager.kindMain')
    expect(trigger.textContent).toContain('主线剧情')
  })

  it('主线和支线徽标不带括号，并以不同颜色区分', async () => {
    await renderMenu({ i18nMode: 'localized' })

    await expect.element(page.getByTestId('flowchart-manager-trigger').getByText('主线', { exact: true })).toBeVisible()
    await openMenu()

    const mainBadge = await page.getByTestId('flowchart-select-main').getByText('主线', { exact: true }).element()
    const branchBadge = await page.getByTestId('flowchart-select-branch-1').getByText('支线', { exact: true }).element()
    expect(getComputedStyle(mainBadge).color).not.toBe(getComputedStyle(branchBadge).color)
    expect(getComputedStyle(mainBadge).backgroundColor).not.toBe(getComputedStyle(branchBadge).backgroundColor)
  })

  it('展开后标出当前流程图，点击其他流程图会切换', async () => {
    const onSelect = vi.fn()
    await renderMenu({ onSelect })

    await openMenu()

    const activeRow = await page.getByRole('option').nth(0).element()
    const inactiveRow = await page.getByRole('option').nth(1).element()
    expect(activeRow.getAttribute('aria-selected')).toBe('true')
    expect(inactiveRow.getAttribute('aria-selected')).toBe('false')

    await clickByTestId('flowchart-select-branch-1')
    expect(onSelect).toHaveBeenCalledWith('branch-1')
  })

  it('鼠标打开菜单后只显示悬停行的操作，主线不会因自动焦点常显', async () => {
    await renderMenu()
    await openMenu()
    const mainSelect = await page.getByTestId('flowchart-select-main').element()
    expect(document.activeElement).toBe(mainSelect)

    await page.getByTestId('flowchart-select-branch-1').hover()
    const mainRename = await page.getByTestId('flowchart-rename-main').element()
    const branchRename = await page.getByTestId('flowchart-rename-branch-1').element()
    await expect.poll(() => getComputedStyle(mainRename.parentElement!).opacity).toBe('0')
    await expect.poll(() => getComputedStyle(branchRename.parentElement!).opacity).toBe('1')
  })

  it('键盘进入菜单后显示焦点所在行的操作，并可聚焦重命名按钮', async () => {
    await renderMenu()
    const trigger = await page.getByTestId('flowchart-manager-trigger').element() as HTMLElement
    trigger.focus()
    await userEvent.keyboard('{Enter}')
    const mainSelect = await page.getByTestId('flowchart-select-main').element()
    await expect.poll(() => document.activeElement).toBe(mainSelect)
    const rename = await page.getByTestId('flowchart-rename-main').element()
    await expect.poll(() => getComputedStyle(rename.parentElement!).opacity).toBe('1')

    await userEvent.tab()
    expect(document.activeElement).toBe(rename)
    await expect.poll(() => getComputedStyle(rename.parentElement!).opacity).toBe('1')
  })

  it('菜单宽度与触发器一致', async () => {
    await renderMenu()
    await openMenu()

    const trigger = await page.getByTestId('flowchart-manager-trigger').element()
    const listbox = await page.getByRole('listbox').element()
    await expect.poll(() => listbox.parentElement!.getBoundingClientRect().width).toBeCloseTo(trigger.getBoundingClientRect().width, 0)
  })

  it('底部操作新建支线流程', async () => {
    const onCreate = vi.fn()
    await renderMenu({ onCreate })

    await openMenu()
    await clickByTestId('flowchart-create-branch')

    expect(onCreate).toHaveBeenCalledOnce()
  })

  it('重命名就在下拉内完成并提交新名称', async () => {
    const onRename = vi.fn()
    await renderMenu({ onRename })

    await openMenu()
    await clickByTestId('flowchart-rename-branch-1')

    const input = page.getByRole('textbox', { name: 'edit.flowchart.manager.renameInputLabel' })
    await expect.element(input).toBeVisible()
    await input.fill('新的支线')
    await userEvent.keyboard('{Enter}')

    expect(onRename).toHaveBeenCalledWith('branch-1', '新的支线')
  })

  it('重命名时输入框位于徽标与操作按钮之间，行高和徽标位置不变', async () => {
    await renderMenu({ i18nMode: 'localized' })
    await openMenu()
    const branch = await page.getByTestId('flowchart-select-branch-1').element()
    const rowHeight = branch.closest('li')!.getBoundingClientRect().height
    const originalBadge = await page.getByTestId('flowchart-select-branch-1').getByText('支线', { exact: true }).element()
    const badgeBounds = originalBadge.getBoundingClientRect()
    await clickByTestId('flowchart-rename-branch-1')

    const input = await page.getByRole('textbox').element()
    const row = input.closest('li')!
    expect(row.textContent).toContain('流程：')
    expect(row.textContent).toContain('支线')
    expect(input.closest('button')).toBeNull()
    expect(document.activeElement).toBe(input)
    const badge = await page.getByTestId('flowchart-select-branch-1').getByText('支线', { exact: true }).element()
    const rename = await page.getByTestId('flowchart-rename-branch-1').element()
    expect(badge.getBoundingClientRect().left).toBe(badgeBounds.left)
    expect(input.getBoundingClientRect().left).toBeGreaterThanOrEqual(badge.getBoundingClientRect().right)
    expect(input.getBoundingClientRect().width).toBeGreaterThan(0)
    expect(input.getBoundingClientRect().right).toBeLessThanOrEqual(rename.getBoundingClientRect().left)
    expect(row.getBoundingClientRect().height).toBe(rowHeight)
  })

  it('空名称不会提交重命名', async () => {
    const onRename = vi.fn()
    await renderMenu({ onRename })

    await openMenu()
    await clickByTestId('flowchart-rename-branch-1')

    const input = page.getByRole('textbox', { name: 'edit.flowchart.manager.renameInputLabel' })
    await input.fill(' '.repeat(3))
    await userEvent.keyboard('{Enter}')

    expect(onRename).not.toHaveBeenCalled()
  })

  it('点击输入框不会切换流程，Escape 取消重命名并保留原名', async () => {
    const onRename = vi.fn()
    const onSelect = vi.fn()
    await renderMenu({ i18nMode: 'localized', onRename, onSelect })
    await openMenu()
    await clickByTestId('flowchart-rename-branch-1')

    const input = page.getByRole('textbox')
    await input.click()
    await input.fill('未提交的名称')
    await userEvent.keyboard('{Escape}')

    expect(onSelect).not.toHaveBeenCalled()
    expect(onRename).not.toHaveBeenCalled()
    expect(page.getByRole('textbox').elements()).toHaveLength(0)
    await expect.element(page.getByTestId('flowchart-select-branch-1').getByText('支线剧情1', { exact: true })).toBeVisible()
  })

  it('主线不提供删除入口，支线删除需要二次确认', async () => {
    const onDelete = vi.fn()
    await renderMenu({ onDelete })

    await openMenu()
    expect(page.getByTestId('flowchart-delete-main').elements()).toHaveLength(0)

    await clickByTestId('flowchart-delete-branch-1')
    expect(onDelete).not.toHaveBeenCalled()

    await clickByTestId('flowchart-delete-confirm')
    expect(onDelete).toHaveBeenCalledWith('branch-1')
  })

  it('取消删除不会触发删除', async () => {
    const onDelete = vi.fn()
    await renderMenu({ onDelete })

    await openMenu()
    await clickByTestId('flowchart-delete-branch-1')
    await clickByTestId('flowchart-delete-cancel')

    expect(onDelete).not.toHaveBeenCalled()
  })
})
