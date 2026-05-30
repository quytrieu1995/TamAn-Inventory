export type FrontendPermission =
  | 'recipe.view'
  | 'recipe.manage'
  | 'inventory.receive'
  | 'inventory.issue'
  | 'inventory.adjust'
  | 'production.create'
  | 'report.view'
  | 'report.manage'

export type FrontendSession = {
  userName: string
  permissions: FrontendPermission[]
}

export const hasPermission = (
  session: FrontendSession,
  permission: FrontendPermission
) => {
  return session.permissions.includes(permission)
}

export const mockSession: FrontendSession = {
  userName: 'Kho truong',
  permissions: ['recipe.view', 'inventory.receive', 'inventory.issue', 'report.view']
}
