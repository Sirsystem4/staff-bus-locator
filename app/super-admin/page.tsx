import type { Metadata } from 'next'

import SuperAdminPanel from '@/components/super-admin-panel'
import { readBuses } from '@/lib/bus-store'
import { readLayout } from '@/lib/layout-store'

export const metadata: Metadata = {
  title: 'Super admin · Bus register',
  robots: { index: false, follow: false },
}

export const dynamic = 'force-dynamic'

export default async function SuperAdminPage() {
  const [buses, layout] = await Promise.all([readBuses(), readLayout()])
  return <SuperAdminPanel initialBuses={buses} initialLayout={layout} />
}
