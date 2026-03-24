import { createRenderer } from 'vue'

export interface TestNode {
  children?: TestNode[]
  text?: string
  type: string
}

export function getMissingNode(): TestNode | null {
  // eslint-disable-next-line unicorn/no-null -- Vue 自定义 renderer 的宿主接口要求缺失节点返回 null。
  return null
}

export function createTestRenderer() {
  return createRenderer<TestNode, TestNode>({
    patchProp() { /* noop */ },
    insert(child, parent) {
      parent.children ??= []
      parent.children.push(child)
    },
    remove() { /* noop */ },
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
    parentNode: getMissingNode,
    nextSibling: getMissingNode,
  })
}
