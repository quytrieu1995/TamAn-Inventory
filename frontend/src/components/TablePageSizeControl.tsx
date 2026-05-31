'use client'

type TablePageSizeOption = 10 | 20 | 50

type TablePageSizeControlProps = {
  value: TablePageSizeOption
  onChange: (value: TablePageSizeOption) => void
  label?: string
}

const PAGE_SIZE_OPTIONS: TablePageSizeOption[] = [10, 20, 50]

const TablePageSizeControl = ({ value, onChange, label = 'Hiển thị' }: TablePageSizeControlProps) => {
  return (
    <label className="inline-flex items-center gap-2 text-xs text-slate-600">
      <span>{label}</span>
      <select
        className="rounded-lg border border-slate-200 bg-white px-2 py-1 text-xs"
        value={value}
        onChange={(event) => onChange(Number(event.target.value) as TablePageSizeOption)}
        aria-label="Số lượng dòng hiển thị trên bảng"
      >
        {PAGE_SIZE_OPTIONS.map((size) => (
          <option key={size} value={size}>
            {size}
          </option>
        ))}
      </select>
      <span>dòng</span>
    </label>
  )
}

export default TablePageSizeControl
