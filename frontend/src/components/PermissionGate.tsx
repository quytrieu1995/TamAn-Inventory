import type { ReactNode } from 'react'
import type { FrontendPermission, FrontendSession } from '../lib/auth'
import { hasPermission } from '../lib/auth'

type PermissionGateProps = {
  session: FrontendSession
  permission: FrontendPermission
  fallback: ReactNode
  children: ReactNode
}

const PermissionGate = ({
  session,
  permission,
  fallback,
  children
}: PermissionGateProps) => {
  if (!hasPermission(session, permission)) {
    return <>{fallback}</>
  }

  return <>{children}</>
}

export default PermissionGate
