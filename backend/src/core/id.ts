export const createId = (prefix: string) => {
  void prefix
  return crypto.randomUUID()
}
