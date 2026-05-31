const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL ?? 'http://127.0.0.1:4000/api/v1'
const DEFAULT_USER_ID = process.env.NEXT_PUBLIC_DEFAULT_USER_ID ?? '77777777-7777-4777-8777-777777777777'
const DEFAULT_PLANT_ID = process.env.NEXT_PUBLIC_DEFAULT_PLANT_ID ?? '11111111-1111-4111-8111-111111111111'
const DEFAULT_WAREHOUSE_ID = process.env.NEXT_PUBLIC_DEFAULT_WAREHOUSE_ID ?? '22222222-2222-4222-8222-222222222222'
const AUTH_STORAGE_KEY = 'app-authenticated'

const getUserId = () => {
  if (typeof window === 'undefined') {
    return DEFAULT_USER_ID
  }

  const persisted = window.localStorage.getItem('app-user-id')
  return persisted || DEFAULT_USER_ID
}

const isAuthenticated = () => {
  if (typeof window === 'undefined') {
    return true
  }

  if (window.localStorage.getItem(AUTH_STORAGE_KEY) === '1') {
    return true
  }

  return Boolean(window.localStorage.getItem('app-user-id'))
}

const getDefaultHeaders = () => {
  return {
    'x-user-id': getUserId(),
    'x-plant-id': DEFAULT_PLANT_ID,
    'x-warehouse-ids': DEFAULT_WAREHOUSE_ID
  }
}

type ApiEnvelope<T> = {
  success: boolean
  data: T
  meta?: Record<string, unknown>
}

type ApiErrorEnvelope = {
  success?: boolean
  error?: {
    code?: string
    message?: string
  }
}

const getApiErrorMessage = (rawBody: string, fallback: string) => {
  if (!rawBody) {
    return fallback
  }

  try {
    const parsed = JSON.parse(rawBody) as ApiErrorEnvelope
    const message = parsed?.error?.message
    if (typeof message === 'string' && message.trim()) {
      return message
    }
  } catch {
    // ignore parse errors and fallback below
  }

  return fallback
}

const requestJson = async <T>(path: string, init?: RequestInit) => {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...getDefaultHeaders(),
      ...(init?.headers ?? {})
    },
    cache: 'no-store'
  })

  if (!response.ok) {
    const body = await response.text()
    const fallbackMessage = response.status >= 500
      ? 'Hệ thống đang bận, vui lòng thử lại sau'
      : 'Yêu cầu không hợp lệ hoặc không thể xử lý'
    throw new Error(getApiErrorMessage(body, fallbackMessage))
  }

  const payload = (await response.json()) as ApiEnvelope<T>
  return payload.data
}

const requestJsonPublic = async <T>(path: string, init?: RequestInit) => {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...(init?.headers ?? {})
    },
    cache: 'no-store'
  })

  if (!response.ok) {
    const body = await response.text()
    const fallbackMessage = response.status >= 500
      ? 'Hệ thống đang bận, vui lòng thử lại sau'
      : 'Yêu cầu không hợp lệ hoặc không thể xử lý'
    throw new Error(getApiErrorMessage(body, fallbackMessage))
  }

  const payload = (await response.json()) as ApiEnvelope<T>
  return payload.data
}

export type DashboardMetrics = {
  totalReceipt: number
  totalIssue: number
  totalDisposal: number
  movementCount: number
}

export type MaterialStockRow = {
  materialId: string
  code: string
  name: string
  batchId: string
  batchNo: string
  quantityOnHand: number
  minimumStock: number
  storageDays: number
}

export type MonthlySummary = {
  monthKey: string
  warehouseId: string
  totalReceiptAmount: number
  totalIssueAmount: number
  totalDisposalAmount: number
  endingInventoryAmount: number
  movementCount: number
}

export type SessionInfo = {
  userId: string
  plantId: string
  warehouseIds: string[]
  permissions: string[]
  profile: {
    id: string
    email: string
    fullName: string
  } | null
  roles: string[]
}

export type LoginResult = {
  userId: string
  email: string
  fullName: string
}

export type MasterMaterial = {
  id: string
  code: string
  name: string
  uom: string
  minimumStock: number
  maxStorageDays: number
  isActive: boolean
}

export type MasterFinishedGood = {
  id: string
  code: string
  name: string
  uom: string
  isActive: boolean
}

export type MasterRecipe = {
  id: string
  finishedGoodId: string
  versionNo: number
  name: string
  productCode: string
  productName: string
  productIsActive: boolean
}

export type RecipeDetail = {
  id: string
  finishedGoodId: string
  name: string
  versionNo: number
  items: Array<{
    materialId: string
    qtyPerUnit: number
  }>
}

export type MasterSupplier = {
  id: string
  code: string
  name: string
}

export type SupplierRow = {
  id: string
  code: string
  name: string
  contactName: string
  phone: string
  email: string
  paymentTerms: string
}

export type SupplierReceiptRow = {
  id: string
  receiptNo: string
  receivedAt: string
  note: string
  warehouseId: string
  itemCount: number
  totalQuantity: number
  totalAmount: number
}

export type SupplierDetailResponse = {
  supplier: SupplierRow
  receipts: SupplierReceiptRow[]
}

export type PurchaseReceiptDetail = {
  id: string
  receiptNo: string
  receivedAt: string
  note: string
  warehouseId: string
  supplier: {
    id: string
    code: string
    name: string
  }
  items: Array<{
    id: string
    materialId: string
    materialCode: string
    materialName: string
    materialUom: string
    batchNo: string
    quantity: number
    unitPrice: number
    lineTotal: number
  }>
}

export type ProductionOrderRow = {
  id: string
  orderNo: string
  finishedGoodId: string
  recipeId: string
  plannedQty: number
  actualQty: number
  status: string
  statusLabel: string
  warehouseId: string
  createdAt: string
}

export type FinishedGoodStockRow = {
  finishedGoodId: string
  code: string
  name: string
  uom: string
  quantityOnHand: number
}

export type AdminRole = {
  id: string
  code: string
  name: string
  permissions: string[]
}

export type AdminUser = {
  id: string
  email: string
  fullName: string
  isActive: boolean
  assignments: Array<{
    roleId: string
    roleCode: string
    roleName: string
    plantId: string | null
    warehouseId: string | null
  }>
}

export const apiClient = {
  getSession: () => {
    return requestJson<SessionInfo>('/auth/me')
  },
  login: (email: string, password: string) => {
    return requestJsonPublic<LoginResult>('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password })
    })
  },
  updateMyPassword: (currentPassword: string, newPassword: string) => {
    return requestJson<{ updated: boolean }>('/auth/password', {
      method: 'PUT',
      body: JSON.stringify({ currentPassword, newPassword })
    })
  },
  getDashboard: () => {
    return requestJson<DashboardMetrics>(`/reports/dashboard?warehouseId=${DEFAULT_WAREHOUSE_ID}`)
  },
  getMaterialStocks: () => {
    return requestJson<MaterialStockRow[]>(`/inventory/stocks?warehouseId=${DEFAULT_WAREHOUSE_ID}`)
  },
  getMonthlySummary: (monthKey: string) => {
    return requestJson<MonthlySummary>(`/reports/monthly?warehouseId=${DEFAULT_WAREHOUSE_ID}&monthKey=${monthKey}`)
  },
  getMaterialsMaster: () => {
    return requestJson<MasterMaterial[]>('/master/materials')
  },
  getFinishedGoodsMaster: () => {
    return requestJson<MasterFinishedGood[]>('/master/finished-goods')
  },
  deleteFinishedGood: (finishedGoodId: string) => {
    return requestJson<{ deleted: boolean }>(`/finished-goods/${finishedGoodId}`, {
      method: 'DELETE'
    })
  },
  updateFinishedGoodStatus: (finishedGoodId: string, isActive: boolean) => {
    return requestJson<{ id: string, isActive: boolean }>(`/finished-goods/${finishedGoodId}/status`, {
      method: 'PUT',
      body: JSON.stringify({ isActive })
    })
  },
  getRecipesMaster: () => {
    return requestJson<MasterRecipe[]>('/master/recipes')
  },
  getRecipeById: (recipeId: string) => {
    return requestJson<RecipeDetail>(`/recipes/${recipeId}`)
  },
  getSuppliersMaster: () => {
    return requestJson<MasterSupplier[]>('/master/suppliers')
  },
  getProductionOrders: () => {
    return requestJson<ProductionOrderRow[]>(`/production-orders?warehouseId=${DEFAULT_WAREHOUSE_ID}`)
  },
  getFinishedGoodStocks: () => {
    return requestJson<FinishedGoodStockRow[]>(`/inventory/finished-goods/stocks?warehouseId=${DEFAULT_WAREHOUSE_ID}`)
  },
  createFinishedGoodReceipt: (input: {
    warehouseId: string
    finishedGoodId: string
    quantity: number
    unitCost: number
    movedAt: string
    referenceId: string
    referenceType?: string
  }) => {
    return requestJson('/inventory/finished-goods/receipts', {
      method: 'POST',
      body: JSON.stringify(input)
    })
  },
  createFinishedGoodIssue: (input: {
    warehouseId: string
    finishedGoodId: string
    quantity: number
    unitCost: number
    movedAt: string
    referenceId: string
    referenceType?: string
  }) => {
    return requestJson('/inventory/finished-goods/issues', {
      method: 'POST',
      body: JSON.stringify(input)
    })
  },
  createReceipt: (input: {
    receiptId: string
    receiptNo: string
    supplierId: string
    warehouseId: string
    receivedAt: string
    note?: string
    items: Array<{
      materialId: string
      batchNo: string
      quantity: number
      unitPrice: number
    }>
  }) => {
    return requestJson('/inventory/receipts', {
      method: 'POST',
      headers: {
        'Idempotency-Key': `receipt-${input.receiptId}`
      },
      body: JSON.stringify(input)
    })
  },
  createIssue: (input: {
    warehouseId: string
    referenceType: string
    referenceId: string
    movedAt: string
    items: Array<{
      materialId: string
      quantity: number
    }>
  }) => {
    return requestJson('/inventory/issues', {
      method: 'POST',
      headers: {
        'Idempotency-Key': `issue-${input.referenceId}`
      },
      body: JSON.stringify(input)
    })
  },
  createDisposal: (input: {
    warehouseId: string
    referenceId: string
    movedAt: string
    items: Array<{
      materialId: string
      quantity: number
    }>
  }) => {
    return requestJson('/inventory/disposals', {
      method: 'POST',
      headers: {
        'Idempotency-Key': `disposal-${input.referenceId}`
      },
      body: JSON.stringify(input)
    })
  },
  createProductionOrder: (input: {
    warehouseId: string
    orderNo: string
    finishedGoodId: string
    plannedQty: number
  }) => {
    return requestJson('/production-orders', {
      method: 'POST',
      body: JSON.stringify(input)
    })
  },
  approveProductionOrder: (orderId: string) => {
    return requestJson(`/production-orders/${orderId}/approve`, {
      method: 'POST'
    })
  },
  completeProductionOrder: (input: {
    orderId: string
    actualQty: number
    movedAt: string
    outputUnitCost: number
  }) => {
    return requestJson(`/production-orders/${input.orderId}/complete`, {
      method: 'POST',
      headers: {
        'Idempotency-Key': `complete-${input.orderId}-${input.movedAt}`
      },
      body: JSON.stringify({
        actualQty: input.actualQty,
        movedAt: input.movedAt,
        outputUnitCost: input.outputUnitCost
      })
    })
  },
  createRecipe: (input: {
    id: string
    name: string
    product: {
      code: string
      name: string
      uom: string
    }
    items: Array<{
      materialId: string
      qtyPerUnit: number
    }>
  }) => {
    return requestJson('/recipes', {
      method: 'POST',
      body: JSON.stringify(input)
    })
  },
  updateRecipe: (recipeId: string, input: {
    name: string
    productName?: string
    items: Array<{
      materialId: string
      qtyPerUnit: number
    }>
  }) => {
    return requestJson<RecipeDetail>(`/recipes/${recipeId}`, {
      method: 'PUT',
      body: JSON.stringify(input)
    })
  },
  getSuppliers: () => {
    return requestJson<SupplierRow[]>('/suppliers')
  },
  getSupplierDetail: (supplierId: string) => {
    return requestJson<SupplierDetailResponse>(`/suppliers/${supplierId}/receipts`)
  },
  getPurchaseReceiptDetail: (receiptId: string) => {
    return requestJson<PurchaseReceiptDetail>(`/purchase-receipts/${receiptId}`)
  },
  createSupplier: (input: Omit<SupplierRow, 'id'>) => {
    return requestJson<SupplierRow>('/suppliers', {
      method: 'POST',
      body: JSON.stringify(input)
    })
  },
  updateSupplier: (supplierId: string, input: Omit<SupplierRow, 'id'>) => {
    return requestJson<SupplierRow>(`/suppliers/${supplierId}`, {
      method: 'PUT',
      body: JSON.stringify(input)
    })
  },
  deleteSupplier: (supplierId: string) => {
    return requestJson<{ deleted: boolean }>(`/suppliers/${supplierId}`, {
      method: 'DELETE'
    })
  },
  createMaterial: (input: {
    code: string
    name: string
    uom: string
    minimumStock: number
    maxStorageDays: number
  }) => {
    return requestJson('/materials', {
      method: 'POST',
      body: JSON.stringify(input)
    })
  },
  updateMaterial: (materialId: string, input: {
    code: string
    name: string
    uom: string
    minimumStock: number
    maxStorageDays: number
  }) => {
    return requestJson(`/materials/${materialId}`, {
      method: 'PUT',
      body: JSON.stringify(input)
    })
  },
  updateMaterialStatus: (materialId: string, isActive: boolean) => {
    return requestJson<{ id: string, isActive: boolean }>(`/materials/${materialId}/status`, {
      method: 'PUT',
      body: JSON.stringify({ isActive })
    })
  },
  deleteMaterial: (materialId: string) => {
    return requestJson<{ deleted: boolean }>(`/materials/${materialId}`, {
      method: 'DELETE'
    })
  },
  getAdminRoles: () => {
    return requestJson<AdminRole[]>('/admin/roles')
  },
  getAdminUsers: () => {
    return requestJson<AdminUser[]>('/admin/users')
  },
  createAdminUser: (input: { email: string, fullName: string, password?: string }) => {
    return requestJson<AdminUser>('/admin/users', {
      method: 'POST',
      body: JSON.stringify(input)
    })
  },
  updateUserRoles: (userId: string, assignments: Array<{
    roleId: string
    plantId?: string | null
    warehouseId?: string | null
  }>) => {
    return requestJson(`/admin/users/${userId}/roles`, {
      method: 'PUT',
      body: JSON.stringify({ assignments })
    })
  },
  updateUserPassword: (userId: string, newPassword: string) => {
    return requestJson<{ userId: string, updated: boolean }>(`/admin/users/${userId}/password`, {
      method: 'PUT',
      body: JSON.stringify({ newPassword })
    })
  },
  setActiveUser: (userId: string) => {
    if (typeof window === 'undefined') {
      return
    }
    window.localStorage.setItem('app-user-id', userId)
    window.localStorage.setItem(AUTH_STORAGE_KEY, '1')
  },
  logout: () => {
    if (typeof window === 'undefined') {
      return
    }
    window.localStorage.removeItem('app-user-id')
    window.localStorage.removeItem(AUTH_STORAGE_KEY)
  },
  isAuthenticated
}

export const authClient = {
  isAuthenticated,
  login: async (email: string, password: string) => {
    const data = await apiClient.login(email, password)
    apiClient.setActiveUser(data.userId)
    return data
  },
  logout: () => {
    apiClient.logout()
  }
}

export const getDefaultWarehouseId = () => DEFAULT_WAREHOUSE_ID

export const formatCurrencyVnd = (value: number) => {
  return new Intl.NumberFormat('vi-VN', {
    style: 'currency',
    currency: 'VND',
    maximumFractionDigits: 0
  }).format(value)
}
