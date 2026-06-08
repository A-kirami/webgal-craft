import { liveQuery } from 'dexie'

export function useDexieLiveQuery<T>(query: () => T | Promise<T>) {
  const value = shallowRef<T>()
  const subscription = liveQuery(query).subscribe({
    next: (nextValue) => {
      value.value = nextValue
    },
  })

  tryOnScopeDispose(() => {
    subscription.unsubscribe()
  })

  return value
}
