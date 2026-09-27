import type { Metadata } from 'next'

import SuperAdminPanel from '@/components/super-admin-panel'
import { readBuses } from '@/lib/bus-store'
import { readLayout } from '@/lib/layout-store'
import { SEED_BUSES } from '@/lib/buses'
import { SEED_LAYOUT } from '@/lib/layout'

export const metadata: Metadata = {
  title: 'Super admin · Bus register',
  robots: { index: false, follow: false },
}

export const dynamic = 'force-dynamic'

export default async function SuperAdminPage() {
  let buses = SEED_BUSES
  let layout = SEED_LAYOUT

  try {
    const [fetchedBuses, fetchedLayout] = await Promise.all([
      readBuses().catch((err) => {
        console.error('SuperAdminPage readBuses error:', err)
        return SEED_BUSES
      }),
      readLayout().catch((err) => {
        console.error('SuperAdminPage readLayout error:', err)
        return SEED_LAYOUT
      }),
    ])

    if (Array.isArray(fetchedBuses) && fetchedBuses.length > 0) {
      buses = fetchedBuses
    }
    if (fetchedLayout && Array.isArray(fetchedLayout.zones) && fetchedLayout.zones.length > 0) {
      layout = fetchedLayout
    }
  } catch (error) {
    console.error('SuperAdminPage load error:', error)
  }

  return <SuperAdminPanel initialBuses={buses} initialLayout={layout} />
}
