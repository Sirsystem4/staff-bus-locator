import BusFinder from '@/components/bus-finder'
import { readBuses } from '@/lib/bus-store'
import { readLayout } from '@/lib/layout-store'

// Buses and the car park layout are read on the server so the page always renders current data.
export const dynamic = 'force-dynamic'

export default async function Page() {
  const [buses, layout] = await Promise.all([readBuses(), readLayout()])
  return <BusFinder initialBuses={buses} layout={layout} />
}
