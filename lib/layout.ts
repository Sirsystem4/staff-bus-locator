/**
 * The car park layout is data, not code. A super admin maintains the zones and how
 * many numbered positions each zone has; transport admins pick from whatever is
 * currently defined here.
 */

export type Zone = {
  /** Unique, and the value stored on each bus, so renaming cascades. */
  name: string
  /** Number of numbered positions, 01..positions. */
  positions: number
}

export type Layout = {
  zones: Zone[]
}

export const MAX_POSITIONS_PER_ZONE = 60
export const MAX_ZONES = 24
export const MAX_ZONE_NAME_LENGTH = 12

export const SEED_LAYOUT: Layout = {
  zones: ['A', 'B', 'C', 'D', 'E', 'F'].map((name) => ({ name, positions: 20 })),
}

export const findZone = (layout: Layout, name: string | null): Zone | undefined =>
  name === null ? undefined : layout.zones.find((zone) => zone.name === name)

export const zoneNames = (layout: Layout): string[] => layout.zones.map((zone) => zone.name)

/** Position labels for a zone, e.g. ['01','02',...]. Empty when the zone is unknown. */
export const positionOptions = (layout: Layout, zoneName: string | null): string[] => {
  const zone = findZone(layout, zoneName)
  if (!zone) return []
  return Array.from({ length: zone.positions }, (_, i) => String(i + 1).padStart(2, '0'))
}

export const isValidPosition = (layout: Layout, zoneName: string | null, position: number): boolean => {
  const zone = findZone(layout, zoneName)
  return Boolean(zone) && Number.isInteger(position) && position >= 1 && position <= zone!.positions
}

/** Super admin fields for a zone. `existingNames` excludes the record being edited. */
export const validateZone = (
  draft: { name: string; positions: number },
  existingNames: string[],
): string | null => {
  const name = typeof draft.name === 'string' ? draft.name.trim() : ''

  if (!name) return 'Zone name is required.'
  if (name.length > MAX_ZONE_NAME_LENGTH) {
    return `Zone name must be ${MAX_ZONE_NAME_LENGTH} characters or fewer.`
  }
  if (existingNames.some((existing) => existing.toLowerCase() === name.toLowerCase())) {
    return `Zone "${name}" already exists. Zone names must be unique.`
  }
  if (!Number.isInteger(draft.positions) || draft.positions < 1 || draft.positions > MAX_POSITIONS_PER_ZONE) {
    return `Positions must be a whole number between 1 and ${MAX_POSITIONS_PER_ZONE}.`
  }
  if (existingNames.length >= MAX_ZONES) {
    return `A car park can have at most ${MAX_ZONES} zones.`
  }
  return null
}
