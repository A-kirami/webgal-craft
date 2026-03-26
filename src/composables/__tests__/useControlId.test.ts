import { describe, expect, it, vi } from 'vitest'

const { useIdMock } = vi.hoisted(() => ({
  useIdMock: vi.fn(() => 'v-42'),
}))

vi.mock('vue', async () => {
  const actual = await vi.importActual<typeof import('vue')>('vue')
  return {
    ...actual,
    useId: useIdMock,
  }
})

import { useControlId } from '~/composables/useControlId'

describe('useControlId 行为', () => {
  it('会对 namespace 和 key 做可访问 id 规范化', () => {
    const { buildControlId } = useControlId('Statement Panel')

    expect(buildControlId('speaker name')).toBe('Statement-Panel-v-42-speaker-name')
  })

  it('非法字符会回退到 field 段名', () => {
    const { buildControlId } = useControlId('!!!')

    expect(buildControlId('###')).toBe('field-v-42-field')
  })

  it.each([
    {
      namespace: '',
      key: '',
      expected: 'field-v-42-field',
    },
    {
      namespace: 'Name#1',
      key: '!!!abc',
      expected: 'Name-1-v-42-abc',
    },
    {
      namespace: '  spaced   namespace  ',
      key: 'key   name%%%',
      expected: 'spaced-namespace-v-42-key-name',
    },
  ])('buildControlId($namespace, $key) => $expected', ({ namespace, key, expected }) => {
    const { buildControlId } = useControlId(namespace)

    expect(buildControlId(key)).toBe(expected)
  })
})
