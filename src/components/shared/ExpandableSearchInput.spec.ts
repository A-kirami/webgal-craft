import { describe, expect, it } from 'vitest'
import { page } from 'vitest/browser'

import {
  createBrowserClickStub,
  createBrowserInputStub,
  renderInBrowser,
} from '~/__tests__/browser-render'

import ExpandableSearchInput from './ExpandableSearchInput.vue'

const globalStubs = {
  Button: createBrowserClickStub('StubButton'),
  Input: createBrowserInputStub('StubInput'),
}

const sharedRenderOptions = {
  props: {
    clearLabel: 'Clear input',
    placeholder: 'Search files',
    toggleLabel: 'Toggle search',
  },
  global: {
    stubs: globalStubs,
  },
}

describe('ExpandableSearchInput', () => {
  it('点击展开后会自动聚焦搜索输入框', async () => {
    renderInBrowser(ExpandableSearchInput, sharedRenderOptions)

    await page.getByRole('button', { name: 'Toggle search' }).click()

    await expect.element(page.getByRole('searchbox', { name: 'Search files' })).toHaveFocus()
  })

  it('有值时会显示清除按钮，点击后清空并保持焦点', async () => {
    renderInBrowser(ExpandableSearchInput, sharedRenderOptions)

    await page.getByRole('button', { name: 'Toggle search' }).click()
    await page.getByRole('searchbox', { name: 'Search files' }).fill('opening')

    await expect.element(page.getByRole('button', { name: 'Clear input' })).toBeInTheDocument()

    await page.getByRole('button', { name: 'Clear input' }).click()

    await expect.element(page.getByRole('searchbox', { name: 'Search files' })).toHaveValue('')
    await expect.element(page.getByRole('searchbox', { name: 'Search files' })).toHaveFocus()
  })
})
