export const toSuccessResponse = <T>(data: T, meta: Record<string, unknown> = {}) => {
  return {
    success: true,
    data,
    meta
  }
}
