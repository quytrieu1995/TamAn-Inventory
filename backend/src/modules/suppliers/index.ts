type Supplier = {
  id: string
  plantId: string
  code: string
  name: string
  paymentTerms?: string
}

type MaterialPriceHistory = {
  supplierId: string
  materialId: string
  unitPrice: number
  effectiveAt: string
}

export const supplierModuleBoundaries = {
  name: 'suppliers',
  responsibilities: [
    'Manage supplier master data',
    'Store procurement receipts and purchase prices',
    'Preserve input price history for costing'
  ],
  outOfScope: [
    'Production planning',
    'Recipe confidentiality'
  ]
} as const

export const createSupplierService = () => {
  const suppliers = new Map<string, Supplier>()
  const priceHistory: MaterialPriceHistory[] = []

  const upsertSupplier = async (supplier: Supplier) => {
    suppliers.set(supplier.id, supplier)
    return supplier
  }

  const recordMaterialPrice = async (input: MaterialPriceHistory) => {
    priceHistory.push(input)
    return input
  }

  const getLatestPrice = async (supplierId: string, materialId: string) => {
    const history = priceHistory
      .filter((item) => item.supplierId === supplierId && item.materialId === materialId)
      .sort((left, right) => new Date(right.effectiveAt).getTime() - new Date(left.effectiveAt).getTime())

    return history[0] ?? null
  }

  return {
    upsertSupplier,
    recordMaterialPrice,
    getLatestPrice
  }
}
