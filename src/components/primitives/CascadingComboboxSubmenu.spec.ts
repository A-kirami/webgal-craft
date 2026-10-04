import { describe, expect, it } from 'vitest'
import { page, userEvent } from 'vitest/browser'
import { defineComponent } from 'vue'

import { renderInBrowser } from '~/__tests__/browser-render'
import AlertDialog from '~/components/ui/alert-dialog/AlertDialog.vue'
import AlertDialogContent from '~/components/ui/alert-dialog/AlertDialogContent.vue'
import AlertDialogTitle from '~/components/ui/alert-dialog/AlertDialogTitle.vue'
import Dialog from '~/components/ui/dialog/Dialog.vue'
import DialogScrollContent from '~/components/ui/dialog/DialogScrollContent.vue'
import DialogTitle from '~/components/ui/dialog/DialogTitle.vue'
// @unocss-safelist min-w-[var(--reka-popover-trigger-width)]
import 'virtual:uno.css'

import CascadingCombobox from './CascadingCombobox.vue'
import { buildCascadingComboboxData } from './combobox/cascading-combobox-data'

interface CascadingSubmenuTestHooks {
  __openCascadingSubmenuOverlay?: () => void
}

const expressionData = buildCascadingComboboxData([
  { label: 'group-a/exp_angry01', value: 'group-a/exp_angry01' },
  { label: 'group-a/exp_bsmile01', value: 'group-a/exp_bsmile01' },
  { label: 'group-a/nested-group/exp_shy01', value: 'group-a/nested-group/exp_shy01' },
], {
  grouping: { mode: 'path' },
  resolvedDelimiter: '/',
})

const selectedExpression = 'group-a/nested-group/exp_shy01'

const WideTriggerHarness = defineComponent({
  components: { CascadingCombobox },
  setup() {
    const modelValue = ref(selectedExpression)

    return {
      expressionData,
      modelValue,
    }
  },
  template: `
    <div style="display: grid; width: 400px">
      <CascadingCombobox
        v-model="modelValue"
        data-testid="wide-trigger"
        :browse-nodes="expressionData.browseNodes"
        :search-documents="expressionData.searchDocuments"
        placeholder="Select expression"
        search-placeholder="Search expression"
      />
    </div>
  `,
})

const ModalHarness = defineComponent({
  components: {
    AlertDialog,
    AlertDialogContent,
    AlertDialogTitle,
    CascadingCombobox,
    // eslint-disable-next-line vue/no-reserved-component-names -- 与业务代码一致，沿用 shadcn 的 Dialog 组件名
    Dialog,
    DialogScrollContent,
    DialogTitle,
  },
  setup() {
    const modelValue = ref(selectedExpression)
    const modalOpen = ref(true)
    const overlayOpen = ref(false)
    const testHooks = globalThis as typeof globalThis & CascadingSubmenuTestHooks

    testHooks.__openCascadingSubmenuOverlay = () => {
      overlayOpen.value = true
    }

    onBeforeUnmount(() => {
      delete testHooks.__openCascadingSubmenuOverlay
    })

    return {
      expressionData,
      modalOpen,
      modelValue,
      overlayOpen,
    }
  },
  template: `
    <Dialog v-model:open="modalOpen">
      <DialogScrollContent class="max-w-md">
        <DialogTitle>Defaults</DialogTitle>
        <CascadingCombobox
          v-model="modelValue"
          data-testid="modal-trigger"
          :browse-nodes="expressionData.browseNodes"
          :search-documents="expressionData.searchDocuments"
          placeholder="Select expression"
          search-placeholder="Search expression"
        />
      </DialogScrollContent>
    </Dialog>

    <!-- 与 ModalWindow 一致：模态框在打开时才挂载，其浮层因此晚于子菜单进入 body -->
    <AlertDialog v-if="overlayOpen" v-model:open="overlayOpen">
      <AlertDialogContent>
        <AlertDialogTitle>Save changes</AlertDialogTitle>
      </AlertDialogContent>
    </AlertDialog>
  `,
})

function getRect(selector: string): DOMRect {
  const element = document.querySelector<HTMLElement>(selector)
  expect(element).not.toBeNull()
  return element!.getBoundingClientRect()
}

function findSubmenuRow(layerDepth: number, label: string): HTMLElement {
  const layerSelector = `[data-layer-depth="${CSS.escape(String(layerDepth))}"]`
  const row = [...document.querySelectorAll<HTMLElement>(`${layerSelector} [data-node-id]`)]
    .find(element => element.textContent?.includes(label))
  expect(row).toBeDefined()
  return row!
}

// 指针命中检测等价于浏览器实际的 hover/click 命中，能同时覆盖「浮层被禁用指针」与「浮层被更高层遮挡」
function isPointerOn(element: HTMLElement): boolean {
  const rect = element.getBoundingClientRect()
  const hit = document.elementFromPoint(rect.x + rect.width / 2, rect.y + rect.height / 2)
  return hit !== null && element.contains(hit)
}

describe('CascadingCombobox 子菜单浮层', () => {
  it('只有一级菜单继承触发器宽度，子菜单按自身内容定宽', async () => {
    await page.viewport(1024, 768)
    await renderInBrowser(WideTriggerHarness)

    await page.getByTestId('wide-trigger').click()
    await expect.element(page.getByText('exp_shy01', { exact: true })).toBeInTheDocument()

    const triggerRect = getRect('[data-testid="wide-trigger"]')
    const rootRect = getRect('[data-cascading-root-panel]')
    const firstSubmenuRect = getRect('[data-layer-depth="1"]')
    const secondSubmenuRect = getRect('[data-layer-depth="2"]')

    expect(rootRect.width).toBeGreaterThanOrEqual(triggerRect.width - 32)
    expect(firstSubmenuRect.width).toBeLessThan(rootRect.width / 2)
    expect(secondSubmenuRect.width).toBeLessThan(rootRect.width / 2)
  })

  it('模态框内的子菜单可命中且点击选中后不关闭模态框', async () => {
    await page.viewport(1024, 768)
    await renderInBrowser(ModalHarness)

    const trigger = page.getByTestId('modal-trigger')
    await trigger.click()
    await expect.element(page.getByText('exp_bsmile01', { exact: true })).toBeInTheDocument()

    const leafRow = findSubmenuRow(1, 'exp_bsmile01')
    expect(isPointerOn(leafRow)).toBe(true)

    await userEvent.click(leafRow)

    await expect.element(trigger).toHaveTextContent('group-a/exp_bsmile01')
    await expect.element(page.getByText('Defaults')).toBeInTheDocument()
  })

  it('后打开的模态框遮罩会盖住已展开的子菜单浮层', async () => {
    await page.viewport(1024, 768)
    await renderInBrowser(ModalHarness)

    await page.getByTestId('modal-trigger').click()
    await expect.element(page.getByText('exp_bsmile01', { exact: true })).toBeInTheDocument()

    const leafRow = findSubmenuRow(1, 'exp_bsmile01')
    expect(isPointerOn(leafRow)).toBe(true)

    const testHooks = globalThis as typeof globalThis & CascadingSubmenuTestHooks
    expect(testHooks.__openCascadingSubmenuOverlay).toBeDefined()
    testHooks.__openCascadingSubmenuOverlay!()

    await expect.element(page.getByText('Save changes')).toBeInTheDocument()
    await expect.poll(() => isPointerOn(leafRow)).toBe(false)
  })
})
