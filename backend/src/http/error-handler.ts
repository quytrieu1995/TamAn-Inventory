import type { NextFunction, Request, Response } from 'express'
import { ZodError } from 'zod'
import { AppError } from '../core/errors'
import { logger } from '../core/logger'

export const errorHandler = (
  error: unknown,
  _request: Request,
  response: Response,
  _next: NextFunction
) => {
  if (error instanceof AppError) {
    return response.status(error.statusCode).json({
      success: false,
      error: {
        code: error.code,
        message: error.message
      }
    })
  }

  if (error instanceof ZodError) {
    return response.status(400).json({
      success: false,
      error: {
        code: 'VALIDATION_ERROR',
        message: error.issues.map((issue) => issue.message).join('; ')
      }
    })
  }

  const message = error instanceof Error ? error.message : 'Unknown error'
  logger.error({ error }, 'Unhandled error')

  return response.status(500).json({
    success: false,
    error: {
      code: 'INTERNAL_SERVER_ERROR',
      message
    }
  })
}
