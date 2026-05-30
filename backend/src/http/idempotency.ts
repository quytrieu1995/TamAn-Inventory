import { createHash } from 'node:crypto'
import type { Request } from 'express'
import type { Pool, PoolClient } from 'pg'
import { ConflictError, ValidationError } from '../core/errors'
import { withTransaction } from '../db/transaction'

const createRequestHash = (request: Request) => {
  const payload = JSON.stringify(request.body ?? {})
  return createHash('sha256').update(payload).digest('hex')
}

export const executeIdempotent = async <T>(
  pool: Pool,
  request: Request,
  endpoint: string,
  callback: (client: PoolClient) => Promise<{ statusCode: number; body: T }>
) => {
  const key = request.header('Idempotency-Key')
  if (!key) {
    throw new ValidationError('Missing Idempotency-Key header')
  }

  const requestHash = createRequestHash(request)

  return withTransaction(pool, async (client) => {
    const existing = await client.query(
      `
        SELECT request_hash, status_code, response_body
        FROM idempotency_keys
        WHERE idempotency_key = $1
          AND endpoint = $2
        FOR UPDATE
      `,
      [key, endpoint]
    )

    if ((existing.rowCount ?? 0) > 0) {
      const record = existing.rows[0] as Record<string, unknown>
      if (String(record.request_hash) !== requestHash) {
        throw new ConflictError('Idempotency key was already used with a different request payload')
      }

      return {
        statusCode: Number(record.status_code),
        body: (record.response_body ?? {}) as T,
        replayed: true
      }
    }

    await client.query(
      `
        INSERT INTO idempotency_keys (
          idempotency_key, endpoint, request_hash, created_at
        )
        VALUES ($1, $2, $3, now())
      `,
      [key, endpoint, requestHash]
    )

    const result = await callback(client)

    await client.query(
      `
        UPDATE idempotency_keys
        SET status_code = $3,
            response_body = $4::jsonb,
            completed_at = now()
        WHERE idempotency_key = $1
          AND endpoint = $2
      `,
      [key, endpoint, result.statusCode, JSON.stringify(result.body)]
    )

    return {
      ...result,
      replayed: false
    }
  })
}

export const cleanupExpiredIdempotencyKeys = async (
  pool: Pool,
  ttlHours: number
) => {
  const cutoffTime = new Date(Date.now() - ttlHours * 60 * 60 * 1000).toISOString()
  const result = await pool.query(
    `
      DELETE FROM idempotency_keys
      WHERE COALESCE(completed_at, created_at) < $1
    `,
    [cutoffTime]
  )

  return {
    deletedCount: result.rowCount ?? 0
  }
}
