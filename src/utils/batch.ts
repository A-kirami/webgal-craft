import { AppError } from '~/types/errors'

export interface BatchResult<T> {
  succeeded: T[]
  failed: { error: AppError, index: number }[]
}

export async function settleBatch<T>(
  tasks: (() => Promise<T>)[],
): Promise<BatchResult<T>> {
  const results = await Promise.allSettled(tasks.map(fn => fn()))
  const succeeded: T[] = []
  const failed: BatchResult<T>['failed'] = []

  for (const [i, result] of results.entries()) {
    if (result.status === 'fulfilled') {
      succeeded.push(result.value)
    } else {
      const error = result.reason instanceof AppError
        ? result.reason
        : new AppError('UNKNOWN', String(result.reason), {
            cause: result.reason,
          })
      failed.push({ error, index: i })
    }
  }

  return { succeeded, failed }
}
