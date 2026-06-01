import type { Metadata } from 'next'
import type { ReactNode } from 'react'
import AppShell from '../components/AppShell'
import './globals.css'

export const metadata: Metadata = {
  title: 'TamAn Inventory',
  description: 'Nền tảng quản lý tồn kho, sản xuất và báo cáo cho TamAn'
}

const RootLayout = ({ children }: { children: ReactNode }) => {
  return (
    <html lang="vi" suppressHydrationWarning>
      <body>
        <AppShell>{children}</AppShell>
      </body>
    </html>
  )
}

export default RootLayout
