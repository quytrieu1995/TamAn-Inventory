'use client'

import { useEffect, useMemo, useState } from 'react'
import { apiClient, getDefaultWarehouseId, type AdminPermission, type AdminRole, type AdminUser } from '../../lib/api'
import { useSession } from '../../hooks/use-session'

const MATRIX_ACTIONS = [
  { key: 'view', label: 'Xem' },
  { key: 'create', label: 'Thêm' },
  { key: 'update', label: 'Sửa' },
  { key: 'delete', label: 'Xoá' },
  { key: 'cancel', label: 'Huỷ' },
  { key: 'approve', label: 'Duyệt' }
] as const

const MATRIX_MODULES = [
  { key: 'material', label: 'Nguyên liệu' },
  { key: 'supplier', label: 'Nhà cung cấp' },
  { key: 'recipe', label: 'Công thức' },
  { key: 'production', label: 'Sản xuất' },
  { key: 'report', label: 'Báo cáo' }
] as const
const HIDDEN_MATRIX_PERMISSION_CODES = new Set(['report.cancel'])

const SUPPLEMENTAL_ACTIONS = [
  { key: 'receive', label: 'Nhập kho' },
  { key: 'issue', label: 'Xuất kho' },
  { key: 'adjust', label: 'Điều chỉnh' },
  { key: 'cancel', label: 'Huỷ' },
  { key: 'manage', label: 'Quản trị' }
] as const

type SupplementalActionKey = (typeof SUPPLEMENTAL_ACTIONS)[number]['key']

const SUPPLEMENTAL_MODULES: Array<{
  key: string
  label: string
  permissionByAction: Partial<Record<SupplementalActionKey, string>>
}> = [
  {
    key: 'inventory',
    label: 'Kho nguyên liệu',
    permissionByAction: {
      receive: 'inventory.receive',
      issue: 'inventory.issue',
      adjust: 'inventory.adjust',
      cancel: 'inventory.cancel'
    }
  },
  {
    key: 'material-admin',
    label: 'Quản trị nguyên liệu',
    permissionByAction: { manage: 'material.manage' }
  },
  {
    key: 'supplier-admin',
    label: 'Quản trị nhà cung cấp',
    permissionByAction: { manage: 'supplier.manage' }
  },
  {
    key: 'recipe-admin',
    label: 'Quản trị công thức',
    permissionByAction: { manage: 'recipe.manage' }
  },
  {
    key: 'report-admin',
    label: 'Quản trị báo cáo',
    permissionByAction: { manage: 'report.manage' }
  },
  {
    key: 'user-admin',
    label: 'Quản trị người dùng',
    permissionByAction: { manage: 'user.manage' }
  }
]
const SYSTEM_ROLE_CODES = new Set(['SUPER_ADMIN'])

const UsersPage = () => {
  const { session } = useSession()
  const [activeTab, setActiveTab] = useState<'USER_LIST' | 'SETTINGS'>('USER_LIST')
  const [users, setUsers] = useState<AdminUser[]>([])
  const [roles, setRoles] = useState<AdminRole[]>([])
  const [permissions, setPermissions] = useState<AdminPermission[]>([])
  const [isCreateUserModalOpen, setIsCreateUserModalOpen] = useState(false)
  const [isCreateRoleModalOpen, setIsCreateRoleModalOpen] = useState(false)
  const [isEditRoleModalOpen, setIsEditRoleModalOpen] = useState(false)
  const [selectedRoleDetailId, setSelectedRoleDetailId] = useState('')
  const [createUserRoleId, setCreateUserRoleId] = useState('')
  const [roleCode, setRoleCode] = useState('')
  const [roleName, setRoleName] = useState('')
  const [newRolePermissionCodes, setNewRolePermissionCodes] = useState<string[]>([])
  const [editingPermissionRoleId, setEditingPermissionRoleId] = useState('')
  const [editingRolePermissionCodes, setEditingRolePermissionCodes] = useState<string[]>([])
  const [email, setEmail] = useState('')
  const [fullName, setFullName] = useState('')
  const [createPassword, setCreatePassword] = useState('123456')
  const [editingUserId, setEditingUserId] = useState('')
  const [editingEmail, setEditingEmail] = useState('')
  const [editingFullName, setEditingFullName] = useState('')
  const [editingIsActive, setEditingIsActive] = useState(true)
  const [editingRoleId, setEditingRoleId] = useState('')
  const [editingNewPassword, setEditingNewPassword] = useState('')
  const [feedback, setFeedback] = useState<string | null>(null)

  const canManageUsers = session?.permissions.includes('user.manage') ?? false

  const loadData = async () => {
    const [usersData, rolesData, permissionsData] = await Promise.all([
      apiClient.getAdminUsers(),
      apiClient.getAdminRoles(),
      apiClient.getAdminPermissions()
    ])
    setUsers(usersData)
    setRoles(rolesData)
    setPermissions(permissionsData)
    if (!createUserRoleId && rolesData.length > 0) {
      setCreateUserRoleId(rolesData[0].id)
    }
    if (!selectedRoleDetailId && rolesData.length > 0) {
      setSelectedRoleDetailId(rolesData[0].id)
    }
  }

  useEffect(() => {
    if (!canManageUsers) {
      return
    }
    loadData().catch((error) => {
      setFeedback(error instanceof Error ? error.message : 'Không thể tải dữ liệu quản trị người dùng')
    })
  }, [canManageUsers])

  const matrixPermissionCodes = useMemo(() => {
    const matrixCodes = new Set<string>()
    for (const moduleItem of MATRIX_MODULES) {
      for (const action of MATRIX_ACTIONS) {
        matrixCodes.add(`${moduleItem.key}.${action.key}`)
      }
    }
    return matrixCodes
  }, [])
  const availablePermissionCodes = useMemo(() => new Set(permissions.map((permission) => permission.code)), [permissions])
  const supplementalMatrixRows = useMemo(
    () =>
      SUPPLEMENTAL_MODULES.map((moduleItem) => ({
        ...moduleItem,
        cells: SUPPLEMENTAL_ACTIONS.map((action) => moduleItem.permissionByAction[action.key] ?? null)
      })).filter((row) => row.cells.some((code) => code !== null && availablePermissionCodes.has(code))),
    [availablePermissionCodes]
  )
  const supplementalMatrixCodes = useMemo(
    () =>
      new Set<string>(
        supplementalMatrixRows.flatMap((row) => row.cells.filter((code): code is string => code !== null))
      ),
    [supplementalMatrixRows]
  )
  const supplementalRolePermissions = useMemo(
    () =>
      permissions.filter(
        (permission) => !matrixPermissionCodes.has(permission.code) && !supplementalMatrixCodes.has(permission.code)
      ),
    [permissions, matrixPermissionCodes, supplementalMatrixCodes]
  )
  const editingUser = useMemo(
    () => users.find((user) => user.id === editingUserId) ?? null,
    [users, editingUserId]
  )
  const selectedRoleDetail = useMemo(
    () => roles.find((role) => role.id === selectedRoleDetailId) ?? null,
    [roles, selectedRoleDetailId]
  )
  const permissionDescriptionByCode = useMemo(
    () => new Map(permissions.map((permission) => [permission.code, permission.description])),
    [permissions]
  )
  const isSystemRole = (role: AdminRole) => SYSTEM_ROLE_CODES.has(role.code.toUpperCase())

  const handleCreateUser = async (event: React.FormEvent) => {
    event.preventDefault()
    if (!createUserRoleId) {
      setFeedback('Vui lòng chọn vai trò cho người dùng mới')
      return
    }
    try {
      const createdUser = await apiClient.createAdminUser({ email, fullName, password: createPassword })
      await apiClient.updateUserRoles(createdUser.id, [
        {
          roleId: createUserRoleId,
          plantId: session?.plantId,
          warehouseId: getDefaultWarehouseId()
        }
      ])
      setEmail('')
      setFullName('')
      setCreatePassword('123456')
      await loadData()
      setIsCreateUserModalOpen(false)
      setFeedback('Đã tạo người dùng mới và gán vai trò')
    } catch (error) {
      setFeedback(error instanceof Error ? error.message : 'Không thể tạo người dùng')
    }
  }

  const handleStartEditUser = (user: AdminUser) => {
    setEditingUserId(user.id)
    setEditingEmail(user.email)
    setEditingFullName(user.fullName)
    setEditingIsActive(user.isActive)
    setEditingRoleId(user.assignments[0]?.roleId ?? '')
    setEditingNewPassword('')
  }

  const handleUpdateUser = async (event: React.FormEvent) => {
    event.preventDefault()
    if (!editingUserId) {
      setFeedback('Vui lòng chọn user cần cập nhật')
      return
    }
    if (!editingEmail.trim() || !editingFullName.trim()) {
      setFeedback('Email và họ tên không được để trống')
      return
    }
    if (editingNewPassword && editingNewPassword.length < 6) {
      setFeedback('Mật khẩu mới phải có ít nhất 6 ký tự')
      return
    }

    try {
      await apiClient.updateAdminUser(editingUserId, {
        email: editingEmail.trim(),
        fullName: editingFullName.trim(),
        isActive: editingIsActive
      })
      await apiClient.updateUserRoles(
        editingUserId,
        editingRoleId
          ? [{
              roleId: editingRoleId,
              plantId: session?.plantId,
              warehouseId: getDefaultWarehouseId()
            }]
          : []
      )
      if (editingNewPassword) {
        await apiClient.updateUserPassword(editingUserId, editingNewPassword)
      }
      await loadData()
      setEditingNewPassword('')
      setFeedback('Đã cập nhật thông tin người dùng')
    } catch (error) {
      setFeedback(error instanceof Error ? error.message : 'Không thể cập nhật thông tin người dùng')
    }
  }

  const handleToggleNewRolePermission = (permissionCode: string) => {
    setNewRolePermissionCodes((previous) => {
      if (previous.includes(permissionCode)) {
        return previous.filter((code) => code !== permissionCode)
      }
      return [...previous, permissionCode]
    })
  }

  const handleOpenEditRolePermissions = (role: AdminRole) => {
    if (isSystemRole(role)) {
      setFeedback(`Vai trò hệ thống ${role.code} không cho phép chỉnh sửa quyền`)
      return
    }
    setEditingPermissionRoleId(role.id)
    setEditingRolePermissionCodes(role.permissions)
    setIsEditRoleModalOpen(true)
  }

  const handleToggleEditingRolePermission = (permissionCode: string) => {
    setEditingRolePermissionCodes((previous) => {
      if (previous.includes(permissionCode)) {
        return previous.filter((code) => code !== permissionCode)
      }
      return [...previous, permissionCode]
    })
  }

  const handleCreateRole = async (event: React.FormEvent) => {
    event.preventDefault()
    if (!roleCode.trim() || !roleName.trim()) {
      setFeedback('Vui lòng nhập mã vai trò và tên vai trò')
      return
    }
    if (newRolePermissionCodes.length === 0) {
      setFeedback('Vai trò mới cần ít nhất một quyền')
      return
    }

    try {
      const createdRole = await apiClient.createAdminRole({
        code: roleCode.trim(),
        name: roleName.trim(),
        permissionCodes: newRolePermissionCodes
      })
      setRoleCode('')
      setRoleName('')
      setNewRolePermissionCodes([])
      await loadData()
      setCreateUserRoleId(createdRole.id)
      setSelectedRoleDetailId(createdRole.id)
      setIsCreateRoleModalOpen(false)
      setFeedback('Đã tạo vai trò mới thành công')
    } catch (error) {
      setFeedback(error instanceof Error ? error.message : 'Không thể tạo vai trò mới')
    }
  }

  const handleUpdateRolePermissions = async (event: React.FormEvent) => {
    event.preventDefault()
    if (!editingPermissionRoleId) {
      setFeedback('Không tìm thấy vai trò cần cập nhật')
      return
    }
    if (editingRolePermissionCodes.length === 0) {
      setFeedback('Vai trò cần ít nhất một quyền')
      return
    }

    try {
      await apiClient.updateAdminRolePermissions(editingPermissionRoleId, editingRolePermissionCodes)
      await loadData()
      setIsEditRoleModalOpen(false)
      setFeedback('Đã cập nhật quyền vai trò')
    } catch (error) {
      setFeedback(error instanceof Error ? error.message : 'Không thể cập nhật quyền vai trò')
    }
  }

  if (!canManageUsers) {
    return (
      <main className="app-shell flex flex-col gap-4 py-4 md:gap-6 md:py-6">
        <section className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          Bạn không có quyền truy cập quản lý người dùng
        </section>
      </main>
    )
  }

  return (
    <main className="app-shell flex flex-col gap-4 py-4 md:gap-6 md:py-6">
      <header>
        <h1 className="text-xl font-semibold md:text-3xl">Quản lý người dùng và phân quyền</h1>
        <p className="muted-text text-sm md:text-base">
          Gán vai trò để kiểm soát quyền truy cập tính năng, bao gồm tab công thức và chức năng thêm công thức.
        </p>
      </header>

      <section className="surface-card p-2">
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => setActiveTab('USER_LIST')}
            className={`rounded-lg px-3 py-2 text-sm font-semibold ${activeTab === 'USER_LIST' ? 'bg-slate-900 text-white' : 'bg-slate-100 text-slate-700'}`}
          >
            Danh sách người dùng
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('SETTINGS')}
            className={`rounded-lg px-3 py-2 text-sm font-semibold ${activeTab === 'SETTINGS' ? 'bg-slate-900 text-white' : 'bg-slate-100 text-slate-700'}`}
          >
            Thiết lập phân quyền
          </button>
        </div>
      </section>

      {activeTab === 'USER_LIST' && (
        <section className="surface-card p-4">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
            <h2 className="text-base font-semibold">Danh sách người dùng</h2>
            <button
              type="button"
              onClick={() => setIsCreateUserModalOpen(true)}
              className="rounded-lg bg-gradient-to-r from-blue-600 to-cyan-500 px-4 py-2 text-sm font-semibold text-white"
            >
              Tạo người dùng
            </button>
          </div>
          <div className="overflow-x-auto rounded-xl border border-slate-200">
            <table className="min-w-full divide-y divide-slate-200 text-sm">
              <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-3 py-2">Họ tên</th>
                  <th className="px-3 py-2">Email</th>
                  <th className="px-3 py-2">Vai trò</th>
                  <th className="px-3 py-2">Trạng thái</th>
                  <th className="px-3 py-2 text-right">Thao tác</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 bg-white">
                {users.map((user) => (
                  <tr key={user.id}>
                    <td className="px-3 py-2 font-semibold">{user.fullName}</td>
                    <td className="px-3 py-2">{user.email}</td>
                    <td className="px-3 py-2">{user.assignments.map((assignment) => assignment.roleName).join(', ') || '-'}</td>
                    <td className="px-3 py-2">
                      <span className={`rounded-full px-2 py-1 text-xs font-semibold ${user.isActive ? 'bg-green-100 text-green-700' : 'bg-slate-200 text-slate-700'}`}>
                        {user.isActive ? 'Đang hoạt động' : 'Đã khoá'}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-right">
                      <button
                        type="button"
                        onClick={() => handleStartEditUser(user)}
                        className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                      >
                        Chỉnh sửa
                      </button>
                    </td>
                  </tr>
                ))}
                {users.length === 0 && (
                  <tr>
                    <td colSpan={5} className="px-3 py-4 text-center text-slate-500">
                      Chưa có dữ liệu người dùng
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          <div className="mt-4 rounded-xl border border-slate-200 p-3">
            <h3 className="mb-2 text-sm font-semibold">Cập nhật thông tin người dùng</h3>
            {!editingUser && (
              <p className="text-sm text-slate-500">Chọn “Chỉnh sửa” tại bảng để cập nhật thông tin user</p>
            )}
            {editingUser && (
              <form onSubmit={handleUpdateUser} className="grid grid-cols-1 gap-3 md:grid-cols-6">
                <input
                  className="rounded-lg border border-slate-200 bg-white p-2 text-sm"
                  value={editingFullName}
                  onChange={(event) => setEditingFullName(event.target.value)}
                  placeholder="Họ tên"
                />
                <input
                  className="rounded-lg border border-slate-200 bg-white p-2 text-sm"
                  value={editingEmail}
                  onChange={(event) => setEditingEmail(event.target.value)}
                  placeholder="Email"
                />
                <select
                  className="rounded-lg border border-slate-200 bg-white p-2 text-sm"
                  value={editingIsActive ? 'active' : 'inactive'}
                  onChange={(event) => setEditingIsActive(event.target.value === 'active')}
                  aria-label="Trạng thái người dùng"
                >
                  <option value="active">Đang hoạt động</option>
                  <option value="inactive">Đã khoá</option>
                </select>
                <select
                  className="rounded-lg border border-slate-200 bg-white p-2 text-sm"
                  value={editingRoleId}
                  onChange={(event) => setEditingRoleId(event.target.value)}
                  aria-label="Vai trò người dùng"
                >
                  <option value="">Không gán role</option>
                  {roles.map((role) => (
                    <option key={role.id} value={role.id}>
                      {role.name} ({role.code})
                    </option>
                  ))}
                </select>
                <input
                  className="rounded-lg border border-slate-200 bg-white p-2 text-sm"
                  type="password"
                  value={editingNewPassword}
                  onChange={(event) => setEditingNewPassword(event.target.value)}
                  placeholder="Mật khẩu mới (tuỳ chọn)"
                />
                <div className="flex gap-2">
                  <button type="submit" className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white">
                    Lưu thông tin
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setEditingUserId('')
                      setEditingRoleId('')
                      setEditingNewPassword('')
                    }}
                    className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-700"
                  >
                    Huỷ
                  </button>
                </div>
              </form>
            )}
          </div>
        </section>
      )}

      {activeTab === 'SETTINGS' && (
        <section className="surface-card p-4">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
            <h2 className="text-base font-semibold">Danh sách vai trò</h2>
            <button
              type="button"
              onClick={() => setIsCreateRoleModalOpen(true)}
              className="rounded-lg bg-gradient-to-r from-blue-600 to-cyan-500 px-4 py-2 text-sm font-semibold text-white"
            >
              Tạo vai trò
            </button>
          </div>
          <div className="overflow-x-auto rounded-xl border border-slate-200">
            <table className="min-w-full divide-y divide-slate-200 text-sm">
              <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-3 py-2">Tên vai trò</th>
                  <th className="px-3 py-2">Mã vai trò</th>
                  <th className="px-3 py-2">Số quyền</th>
                  <th className="px-3 py-2 text-right">Thao tác</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 bg-white">
                {roles.map((role) => (
                  <tr key={role.id}>
                    <td className="px-3 py-2 font-semibold">{role.name}</td>
                    <td className="px-3 py-2">{role.code}</td>
                    <td className="px-3 py-2">{role.permissions.length}</td>
                    <td className="px-3 py-2 text-right">
                      <div className="flex justify-end gap-2">
                        <button
                          type="button"
                          onClick={() => setSelectedRoleDetailId(role.id)}
                          className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                        >
                          Xem quyền
                        </button>
                        <button
                          type="button"
                          onClick={() => handleOpenEditRolePermissions(role)}
                          disabled={isSystemRole(role)}
                          className={`rounded-lg px-3 py-1.5 text-xs font-semibold ${
                            isSystemRole(role)
                              ? 'cursor-not-allowed border border-slate-200 bg-slate-100 text-slate-400'
                              : 'border border-blue-200 bg-blue-50 text-blue-700 hover:bg-blue-100'
                          }`}
                        >
                          Chỉnh sửa quyền
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
                {roles.length === 0 && (
                  <tr>
                    <td colSpan={4} className="px-3 py-4 text-center text-slate-500">
                      Chưa có vai trò
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          <div className="mt-4 rounded-xl border border-slate-200 p-3">
            <h3 className="mb-2 text-sm font-semibold">Chi tiết quyền vai trò</h3>
            {!selectedRoleDetail && (
              <p className="text-sm text-slate-500">Chọn vai trò để xem danh sách quyền</p>
            )}
            {selectedRoleDetail && (
              <div className="space-y-2">
                <p className="text-sm">
                  <span className="font-semibold">{selectedRoleDetail.name}</span> ({selectedRoleDetail.code})
                </p>
                <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
                  {selectedRoleDetail.permissions.map((code) => (
                    <div key={`${selectedRoleDetail.id}-${code}`} className="rounded-lg border border-slate-200 bg-white p-2 text-sm">
                      <p className="font-semibold">{code}</p>
                      <p className="text-xs text-slate-500">{permissionDescriptionByCode.get(code) ?? 'Không có mô tả'}</p>
                    </div>
                  ))}
                  {selectedRoleDetail.permissions.length === 0 && (
                    <p className="text-sm text-slate-500">Vai trò này chưa có quyền nào</p>
                  )}
                </div>
              </div>
            )}
          </div>
        </section>
      )}

      {isCreateUserModalOpen && (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-slate-900/40 p-4">
          <div className="w-full max-w-3xl rounded-2xl bg-white p-4 shadow-xl">
            <div className="mb-3 flex items-center justify-between gap-3">
              <h3 className="text-base font-semibold">Tạo người dùng</h3>
              <button
                type="button"
                onClick={() => setIsCreateUserModalOpen(false)}
                className="rounded-lg border border-slate-200 px-3 py-1 text-sm text-slate-700"
              >
                Đóng
              </button>
            </div>
            <form onSubmit={handleCreateUser} className="grid grid-cols-1 gap-3 md:grid-cols-2">
              <input
                className="rounded-lg border border-slate-200 bg-white p-2 text-sm"
                placeholder="Email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
              />
              <input
                className="rounded-lg border border-slate-200 bg-white p-2 text-sm"
                placeholder="Họ tên"
                value={fullName}
                onChange={(event) => setFullName(event.target.value)}
              />
              <input
                className="rounded-lg border border-slate-200 bg-white p-2 text-sm"
                placeholder="Mật khẩu ban đầu"
                value={createPassword}
                onChange={(event) => setCreatePassword(event.target.value)}
              />
              <select
                className="rounded-lg border border-slate-200 bg-white p-2 text-sm"
                value={createUserRoleId}
                onChange={(event) => setCreateUserRoleId(event.target.value)}
                aria-label="Vai trò cho người dùng mới"
              >
                {roles.length === 0 && <option value="">Chưa có vai trò</option>}
                {roles.map((role) => (
                  <option key={role.id} value={role.id}>
                    {role.name} ({role.code})
                  </option>
                ))}
              </select>
              <div className="md:col-span-2">
                <button type="submit" className="rounded-lg bg-gradient-to-r from-blue-600 to-cyan-500 px-4 py-2 text-sm font-semibold text-white">
                  Tạo user và gán role
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {isCreateRoleModalOpen && (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-slate-900/40 p-4">
          <div className="max-h-[90vh] w-full max-w-5xl overflow-y-auto rounded-2xl bg-white p-4 shadow-xl">
            <div className="mb-3 flex items-center justify-between gap-3">
              <h3 className="text-base font-semibold">Tạo vai trò mới</h3>
              <button
                type="button"
                onClick={() => setIsCreateRoleModalOpen(false)}
                className="rounded-lg border border-slate-200 px-3 py-1 text-sm text-slate-700"
              >
                Đóng
              </button>
            </div>
            <form onSubmit={handleCreateRole} className="grid grid-cols-1 gap-3">
              <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                <input
                  className="rounded-lg border border-slate-200 bg-white p-2 text-sm"
                  placeholder="Mã vai trò (VD: PRODUCTION_APPROVER)"
                  value={roleCode}
                  onChange={(event) => setRoleCode(event.target.value)}
                />
                <input
                  className="rounded-lg border border-slate-200 bg-white p-2 text-sm"
                  placeholder="Tên vai trò"
                  value={roleName}
                  onChange={(event) => setRoleName(event.target.value)}
                />
              </div>
              <div className="overflow-x-auto rounded-xl border border-slate-200">
                <table className="min-w-full divide-y divide-slate-200 text-sm">
                  <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
                    <tr>
                      <th className="px-3 py-2">Chức năng</th>
                      {MATRIX_ACTIONS.map((action) => (
                        <th key={action.key} className="px-3 py-2 text-center">{action.label}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {MATRIX_MODULES.map((moduleItem) => (
                      <tr key={moduleItem.key} className="bg-white">
                        <td className="px-3 py-2 font-semibold">{moduleItem.label}</td>
                        {MATRIX_ACTIONS.map((action) => {
                          const code = `${moduleItem.key}.${action.key}`
                      const available = availablePermissionCodes.has(code) && !HIDDEN_MATRIX_PERMISSION_CODES.has(code)
                          const selected = newRolePermissionCodes.includes(code)
                          return (
                            <td key={code} className="px-3 py-2 text-center">
                              {available ? (
                                <input
                                  type="checkbox"
                                  checked={selected}
                                  onChange={() => handleToggleNewRolePermission(code)}
                                  className="h-4 w-4"
                                  aria-label={`${moduleItem.label} - ${action.label}`}
                                />
                              ) : (
                                <span className="text-xs text-slate-400">-</span>
                              )}
                            </td>
                          )
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="rounded-xl border border-slate-200 p-3">
                <p className="mb-2 text-sm font-semibold">Quyền bổ sung</p>
                {supplementalMatrixRows.length > 0 && (
                  <div className="overflow-x-auto rounded-xl border border-slate-200">
                    <table className="min-w-full divide-y divide-slate-200 text-sm">
                      <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
                        <tr>
                          <th className="px-3 py-2">Nhóm quyền</th>
                          {SUPPLEMENTAL_ACTIONS.map((action) => (
                            <th key={action.key} className="px-3 py-2 text-center">{action.label}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {supplementalMatrixRows.map((row) => (
                          <tr key={row.key} className="bg-white">
                            <td className="px-3 py-2 font-semibold">{row.label}</td>
                            {SUPPLEMENTAL_ACTIONS.map((action, actionIndex) => {
                              const code = row.cells[actionIndex]
                              if (!code) {
                                return (
                                  <td key={`${row.key}-${action.key}`} className="px-3 py-2 text-center">
                                    <span className="text-xs text-slate-400">-</span>
                                  </td>
                                )
                              }
                              const selected = newRolePermissionCodes.includes(code)
                              return (
                                <td key={code} className="px-3 py-2 text-center">
                                  <input
                                    type="checkbox"
                                    checked={selected}
                                    onChange={() => handleToggleNewRolePermission(code)}
                                    className="h-4 w-4"
                                    aria-label={`${row.label} - ${action.label}`}
                                  />
                                </td>
                              )
                            })}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
                <div className="mt-3 grid grid-cols-1 gap-2 md:grid-cols-2">
                  {supplementalRolePermissions.map((permission) => {
                    const selected = newRolePermissionCodes.includes(permission.code)
                    return (
                      <label
                        key={`new-role-extra-${permission.id}`}
                        className={`flex items-start gap-2 rounded-lg border p-2 text-sm ${selected ? 'border-blue-200 bg-blue-50' : 'border-slate-200 bg-white'}`}
                      >
                        <input
                          type="checkbox"
                          checked={selected}
                          onChange={() => handleToggleNewRolePermission(permission.code)}
                          className="mt-1"
                        />
                        <span>
                          <span className="font-semibold">{permission.code}</span>
                          <span className="block text-xs text-slate-500">{permission.description}</span>
                        </span>
                      </label>
                    )
                  })}
                </div>
              </div>
              <div>
                <button type="submit" className="rounded-lg bg-gradient-to-r from-blue-600 to-cyan-500 px-4 py-2 text-sm font-semibold text-white">
                  Tạo vai trò
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {isEditRoleModalOpen && (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-slate-900/40 p-4">
          <div className="max-h-[90vh] w-full max-w-5xl overflow-y-auto rounded-2xl bg-white p-4 shadow-xl">
            <div className="mb-3 flex items-center justify-between gap-3">
              <h3 className="text-base font-semibold">Chỉnh sửa quyền vai trò</h3>
              <button
                type="button"
                onClick={() => setIsEditRoleModalOpen(false)}
                className="rounded-lg border border-slate-200 px-3 py-1 text-sm text-slate-700"
              >
                Đóng
              </button>
            </div>
            <form onSubmit={handleUpdateRolePermissions} className="grid grid-cols-1 gap-3">
              <div className="rounded-lg bg-slate-50 p-3 text-sm">
                <p className="font-semibold">
                  Vai trò:
                  {' '}
                  {roles.find((role) => role.id === editingPermissionRoleId)?.name ?? '-'}
                </p>
                <p className="text-slate-600">
                  Mã:
                  {' '}
                  {roles.find((role) => role.id === editingPermissionRoleId)?.code ?? '-'}
                </p>
              </div>
              <div className="overflow-x-auto rounded-xl border border-slate-200">
                <table className="min-w-full divide-y divide-slate-200 text-sm">
                  <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
                    <tr>
                      <th className="px-3 py-2">Chức năng</th>
                      {MATRIX_ACTIONS.map((action) => (
                        <th key={action.key} className="px-3 py-2 text-center">{action.label}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {MATRIX_MODULES.map((moduleItem) => (
                      <tr key={`edit-role-${moduleItem.key}`} className="bg-white">
                        <td className="px-3 py-2 font-semibold">{moduleItem.label}</td>
                        {MATRIX_ACTIONS.map((action) => {
                          const code = `${moduleItem.key}.${action.key}`
                          const available = availablePermissionCodes.has(code) && !HIDDEN_MATRIX_PERMISSION_CODES.has(code)
                          const selected = editingRolePermissionCodes.includes(code)
                          return (
                            <td key={`edit-${code}`} className="px-3 py-2 text-center">
                              {available ? (
                                <input
                                  type="checkbox"
                                  checked={selected}
                                  onChange={() => handleToggleEditingRolePermission(code)}
                                  className="h-4 w-4"
                                  aria-label={`${moduleItem.label} - ${action.label}`}
                                />
                              ) : (
                                <span className="text-xs text-slate-400">-</span>
                              )}
                            </td>
                          )
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="rounded-xl border border-slate-200 p-3">
                <p className="mb-2 text-sm font-semibold">Quyền bổ sung</p>
                {supplementalMatrixRows.length > 0 && (
                  <div className="overflow-x-auto rounded-xl border border-slate-200">
                    <table className="min-w-full divide-y divide-slate-200 text-sm">
                      <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
                        <tr>
                          <th className="px-3 py-2">Nhóm quyền</th>
                          {SUPPLEMENTAL_ACTIONS.map((action) => (
                            <th key={`edit-sup-${action.key}`} className="px-3 py-2 text-center">{action.label}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {supplementalMatrixRows.map((row) => (
                          <tr key={`edit-sup-${row.key}`} className="bg-white">
                            <td className="px-3 py-2 font-semibold">{row.label}</td>
                            {SUPPLEMENTAL_ACTIONS.map((action, actionIndex) => {
                              const code = row.cells[actionIndex]
                              if (!code) {
                                return (
                                  <td key={`edit-sup-${row.key}-${action.key}`} className="px-3 py-2 text-center">
                                    <span className="text-xs text-slate-400">-</span>
                                  </td>
                                )
                              }
                              const selected = editingRolePermissionCodes.includes(code)
                              return (
                                <td key={`edit-${code}`} className="px-3 py-2 text-center">
                                  <input
                                    type="checkbox"
                                    checked={selected}
                                    onChange={() => handleToggleEditingRolePermission(code)}
                                    className="h-4 w-4"
                                    aria-label={`${row.label} - ${action.label}`}
                                  />
                                </td>
                              )
                            })}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
                <div className="mt-3 grid grid-cols-1 gap-2 md:grid-cols-2">
                  {supplementalRolePermissions.map((permission) => {
                    const selected = editingRolePermissionCodes.includes(permission.code)
                    return (
                      <label
                        key={`edit-role-extra-${permission.id}`}
                        className={`flex items-start gap-2 rounded-lg border p-2 text-sm ${selected ? 'border-blue-200 bg-blue-50' : 'border-slate-200 bg-white'}`}
                      >
                        <input
                          type="checkbox"
                          checked={selected}
                          onChange={() => handleToggleEditingRolePermission(permission.code)}
                          className="mt-1"
                        />
                        <span>
                          <span className="font-semibold">{permission.code}</span>
                          <span className="block text-xs text-slate-500">{permission.description}</span>
                        </span>
                      </label>
                    )
                  })}
                </div>
              </div>
              <div>
                <button type="submit" className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white">
                  Lưu quyền vai trò
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {feedback && <p className="text-sm">{feedback}</p>}
    </main>
  )
}

export default UsersPage
