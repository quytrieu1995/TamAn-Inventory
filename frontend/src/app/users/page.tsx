'use client'

import { useEffect, useMemo, useState } from 'react'
import { apiClient, getDefaultWarehouseId, type AdminRole, type AdminUser } from '../../lib/api'
import { useSession } from '../../hooks/use-session'

const UsersPage = () => {
  const { session, reload } = useSession()
  const [users, setUsers] = useState<AdminUser[]>([])
  const [roles, setRoles] = useState<AdminRole[]>([])
  const [selectedUserId, setSelectedUserId] = useState('')
  const [selectedRoleId, setSelectedRoleId] = useState('')
  const [passwordUserId, setPasswordUserId] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [email, setEmail] = useState('')
  const [fullName, setFullName] = useState('')
  const [createPassword, setCreatePassword] = useState('123456')
  const [feedback, setFeedback] = useState<string | null>(null)

  const canManageUsers = session?.permissions.includes('user.manage') ?? false

  const loadData = async () => {
    const [usersData, rolesData] = await Promise.all([
      apiClient.getAdminUsers(),
      apiClient.getAdminRoles()
    ])
    setUsers(usersData)
    setRoles(rolesData)
    if (!selectedUserId && usersData.length > 0) {
      setSelectedUserId(usersData[0].id)
    }
    if (!passwordUserId && usersData.length > 0) {
      setPasswordUserId(usersData[0].id)
    }
    if (!selectedRoleId && rolesData.length > 0) {
      setSelectedRoleId(rolesData[0].id)
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

  const selectedUser = useMemo(
    () => users.find((user) => user.id === selectedUserId) ?? null,
    [users, selectedUserId]
  )

  const handleCreateUser = async (event: React.FormEvent) => {
    event.preventDefault()
    try {
      await apiClient.createAdminUser({ email, fullName, password: createPassword })
      setEmail('')
      setFullName('')
      setCreatePassword('123456')
      await loadData()
      setFeedback('Đã tạo người dùng mới')
    } catch (error) {
      setFeedback(error instanceof Error ? error.message : 'Không thể tạo người dùng')
    }
  }

  const handleAssignRole = async () => {
    if (!selectedUserId || !selectedRoleId) {
      return
    }
    try {
      await apiClient.updateUserRoles(selectedUserId, [
        {
          roleId: selectedRoleId,
          plantId: session?.plantId,
          warehouseId: getDefaultWarehouseId()
        }
      ])
      await loadData()
      setFeedback('Đã cập nhật phân quyền người dùng')
    } catch (error) {
      setFeedback(error instanceof Error ? error.message : 'Không thể cập nhật phân quyền')
    }
  }

  const handleUpdateUserPassword = async () => {
    if (!passwordUserId) {
      return
    }
    if (newPassword.length < 6) {
      setFeedback('Mật khẩu mới phải có ít nhất 6 ký tự')
      return
    }

    try {
      await apiClient.updateUserPassword(passwordUserId, newPassword)
      setNewPassword('')
      await reload()
      setFeedback('Đã cập nhật mật khẩu người dùng')
    } catch (error) {
      setFeedback(error instanceof Error ? error.message : 'Không thể cập nhật mật khẩu')
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

      <section className="surface-card p-4">
        <h2 className="mb-3 text-base font-semibold">Tạo người dùng</h2>
        <form onSubmit={handleCreateUser} className="grid grid-cols-1 gap-3 md:grid-cols-3">
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
          <button type="submit" className="rounded-lg bg-gradient-to-r from-blue-600 to-cyan-500 px-4 py-2 text-sm font-semibold text-white">
            Tạo user
          </button>
        </form>
      </section>

      <section className="surface-card p-4">
        <h2 className="mb-3 text-base font-semibold">Gán role cho user</h2>
        <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
          <select className="rounded-lg border border-slate-200 bg-white p-2 text-sm" value={selectedUserId} onChange={(event) => setSelectedUserId(event.target.value)}>
            {users.map((user) => (
              <option key={user.id} value={user.id}>
                {user.fullName} - {user.email}
              </option>
            ))}
          </select>
          <select className="rounded-lg border border-slate-200 bg-white p-2 text-sm" value={selectedRoleId} onChange={(event) => setSelectedRoleId(event.target.value)}>
            {roles.map((role) => (
              <option key={role.id} value={role.id}>
                {role.name} ({role.code})
              </option>
            ))}
          </select>
          <button type="button" onClick={handleAssignRole} className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white">
            Cập nhật phân quyền
          </button>
        </div>
        {selectedUser && (
          <div className="mt-3 rounded-lg bg-slate-50 p-3 text-sm">
            <p className="font-semibold">{selectedUser.fullName}</p>
            <p className="text-slate-600">Role hiện tại: {selectedUser.assignments.map((assignment) => assignment.roleName).join(', ') || 'Chưa có'}</p>
          </div>
        )}
      </section>

      <section className="surface-card p-4">
        <h2 className="mb-3 text-base font-semibold">Cập nhật mật khẩu người dùng</h2>
        <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
          <select className="rounded-lg border border-slate-200 bg-white p-2 text-sm" value={passwordUserId} onChange={(event) => setPasswordUserId(event.target.value)}>
            {users.map((user) => (
              <option key={user.id} value={user.id}>
                {user.fullName} - {user.email}
              </option>
            ))}
          </select>
          <input
            className="rounded-lg border border-slate-200 bg-white p-2 text-sm"
            type="password"
            placeholder="Mật khẩu mới"
            value={newPassword}
            onChange={(event) => setNewPassword(event.target.value)}
          />
          <button type="button" onClick={handleUpdateUserPassword} className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white">
            Cập nhật mật khẩu
          </button>
        </div>
      </section>

      {feedback && <p className="text-sm">{feedback}</p>}
    </main>
  )
}

export default UsersPage
