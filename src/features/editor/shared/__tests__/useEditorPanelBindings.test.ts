import { afterEach, describe, expect, it } from 'vitest'
import { createRenderer } from 'vue'

import {
  useCommandPanelBridgeBinding,
  useCommandPanelBridgeProvider,
  useSidebarPanelBinding,
  useSidebarPanelProvider,
} from '../useEditorPanelBindings'

import type { CommandPanelHandler, SidebarPanelBinding } from '../useEditorPanelBindings'
import type { StatementEntry } from '~/domain/script/sentence'

interface ActivatableBinding {
  isActive?: () => boolean
}

interface TestNode {
  children?: TestNode[]
  text?: string
  type: string
}

interface ActiveBindingContext<TBinding> {
  activeBinding: ShallowRef<TBinding | undefined>
}

interface BindingHarness<TBinding extends ActivatableBinding> {
  activeMode: ReturnType<typeof ref<'text' | 'visual'>>
  primaryBinding: TBinding
  readActiveBinding: () => TBinding | undefined
  secondaryBinding: TBinding
  unmount: () => void
}

interface BindingHarnessOptions<TBinding extends ActivatableBinding> {
  createPrimaryBinding: (activeMode: ReturnType<typeof ref<'text' | 'visual'>>) => TBinding
  createSecondaryBinding: (activeMode: ReturnType<typeof ref<'text' | 'visual'>>) => TBinding
  useBinding: (binding: TBinding) => void
  useProvider: () => ActiveBindingContext<TBinding>
}

const mountedHarnesses: { unmount: () => void }[] = []

const renderer = createRenderer<TestNode, TestNode>({
  patchProp() { /* no-op */ },
  insert(child, parent) {
    parent.children ??= []
    parent.children.push(child)
  },
  remove() { /* no-op */ },
  createElement(type) {
    return { type, children: [] }
  },
  createText(text) {
    return { type: 'text', text }
  },
  createComment(text) {
    return { type: 'comment', text }
  },
  setText(node, text) {
    node.text = text
  },
  setElementText(node, text) {
    node.text = text
  },
  parentNode() {
    // eslint-disable-next-line unicorn/no-null
    return null
  },
  nextSibling() {
    // eslint-disable-next-line unicorn/no-null
    return null
  },
  querySelector() {
    // eslint-disable-next-line unicorn/no-null
    return null
  },
  setScopeId() { /* no-op */ },
  cloneNode(node) {
    return {
      ...node,
      children: node.children ? [...node.children] : undefined,
    }
  },
  insertStaticContent() {
    const node = { type: 'static', children: [] } satisfies TestNode
    return [node, node]
  },
})

function createBindingHarness<TBinding extends ActivatableBinding>(
  options: BindingHarnessOptions<TBinding>,
): BindingHarness<TBinding> {
  const activeMode = ref<'text' | 'visual'>('text')
  const primaryBinding = options.createPrimaryBinding(activeMode)
  const secondaryBinding = options.createSecondaryBinding(activeMode)

  let readActiveBinding = () => undefined as TBinding | undefined

  const PrimaryEditorStub = defineComponent({
    setup() {
      options.useBinding(primaryBinding)
      return () => undefined
    },
  })

  const SecondaryEditorStub = defineComponent({
    setup() {
      options.useBinding(secondaryBinding)
      return () => undefined
    },
  })

  const Root = defineComponent({
    setup() {
      const context = options.useProvider()
      readActiveBinding = () => context.activeBinding.value
      return () => h('div', [h(PrimaryEditorStub), h(SecondaryEditorStub)])
    },
  })

  const container: TestNode = { type: 'root', children: [] }
  const app = renderer.createApp(Root)
  app.mount(container)

  const harness: BindingHarness<TBinding> = {
    activeMode,
    primaryBinding,
    readActiveBinding,
    secondaryBinding,
    unmount() {
      app.unmount()
    },
  }

  mountedHarnesses.push(harness)
  return harness
}

async function flushBindingUpdates() {
  await nextTick()
  await Promise.resolve()
}

function runBindingLifecycleSuite<TBinding extends ActivatableBinding>(
  name: string,
  options: BindingHarnessOptions<TBinding>,
) {
  describe(name, () => {
    it('初始仅注册当前激活的 binding', () => {
      const harness = createBindingHarness(options)

      expect(harness.readActiveBinding()).toBe(harness.primaryBinding)
    })

    it('活跃投影切换后应同步切换当前 binding', async () => {
      const harness = createBindingHarness(options)

      harness.activeMode.value = 'visual'
      await flushBindingUpdates()

      expect(harness.readActiveBinding()).toBe(harness.secondaryBinding)

      harness.activeMode.value = 'text'
      await flushBindingUpdates()

      expect(harness.readActiveBinding()).toBe(harness.primaryBinding)
    })
  })
}

afterEach(() => {
  while (mountedHarnesses.length > 0) {
    mountedHarnesses.pop()?.unmount()
  }
})

runBindingLifecycleSuite<CommandPanelHandler>('useCommandPanelBridgeBinding', {
  createPrimaryBinding(activeMode) {
    return {
      insertCommand() { /* no-op */ },
      insertGroup() { /* no-op */ },
      isActive: () => activeMode.value === 'text',
    }
  },
  createSecondaryBinding(activeMode) {
    return {
      insertCommand() { /* no-op */ },
      insertGroup() { /* no-op */ },
      isActive: () => activeMode.value === 'visual',
    }
  },
  useBinding: useCommandPanelBridgeBinding,
  useProvider: useCommandPanelBridgeProvider,
})

runBindingLifecycleSuite<SidebarPanelBinding>('useSidebarPanelBinding', {
  createPrimaryBinding(activeMode) {
    return {
      enableFocusStatement: false,
      getEntry(): StatementEntry | undefined {
        return
      },
      isActive: () => activeMode.value === 'text',
      onUpdate() { /* no-op */ },
    }
  },
  createSecondaryBinding(activeMode) {
    return {
      enableFocusStatement: true,
      getEntry(): StatementEntry | undefined {
        return
      },
      isActive: () => activeMode.value === 'visual',
      onUpdate() { /* no-op */ },
    }
  },
  useBinding: useSidebarPanelBinding,
  useProvider: useSidebarPanelProvider,
})
