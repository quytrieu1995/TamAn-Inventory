export class AppError extends Error {
  code: string
  statusCode: number

  constructor(code: string, message: string, statusCode = 400) {
    super(message)
    this.code = code
    this.statusCode = statusCode
  }
}

export class ForbiddenError extends AppError {
  constructor(permission: string) {
    super('FORBIDDEN', `Missing permission ${permission}`, 403)
  }
}

export class NotFoundError extends AppError {
  constructor(entityName: string) {
    super('NOT_FOUND', `${entityName} not found`, 404)
  }
}

export class ConflictError extends AppError {
  constructor(message: string) {
    super('CONFLICT', message, 409)
  }
}

export class ValidationError extends AppError {
  constructor(message: string) {
    super('VALIDATION_ERROR', message, 400)
  }
}
