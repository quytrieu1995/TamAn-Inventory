import type { Pool, PoolClient } from 'pg'

type TransactionRetryOptions = {
  maxRetries?: number
  initialDelayMs?: number
}

const sleep = async (milliseconds: number) => {
  await new Promise((resolve) => setTimeout(resolve, milliseconds))
}

const isRetryableTransactionError = (error: unknown) => {
  if (!(error instanceof Error)) {
    return false
  }

  const pgError = error as Error & { code?: string }
  return pgError.code === '40P01' || pgError.code === '40001'
}

export const withTransaction = async <T>(
  pool: Pool,
  callback: (client: PoolClient) => Promise<T>,
  options: TransactionRetryOptions = {}
) => {
  const maxRetries = options.maxRetries ?? 3
  const initialDelayMs = options.initialDelayMs ?? 25

  for (let attempt = 0; attempt <= maxRetries; attempt += 1) {
    const client = await pool.connect()
    try {
      await client.query('BEGIN')
      const result = await callback(client)
      await client.query('COMMIT')
      return result
    } catch (error) {
      await client.query('ROLLBACK')

      const shouldRetry = attempt < maxRetries && isRetryableTransactionError(error)
      if (!shouldRetry) {
        throw error
      }

      const backoffMs = initialDelayMs * 2 ** attempt
      await sleep(backoffMs)
    } finally {
      client.release()
    }
  }

  throw new Error('Transaction retry exhausted unexpectedly')
}
