import { findZone, type Layout } from './layout'

export type Bus = {
  number: number
  route: string
  /** null until a transport admin parks the bus. */
  zone: string | null
  /** null until a transport admin parks the bus. */
  position: number | null
}

/** What a super admin supplies when registering a bus. Location is set later by an admin. */
export type BusDraft = {
  number: number
  route: string
}

/** What a transport admin supplies when parking a bus. */
export type LocationDraft = {
  zone: string
  position: number
}

/** Used only to seed data/buses.json the first time the app runs. */
export const SEED_BUSES: Bus[] = [
  { number: 1, route: 'AGEGE', zone: 'A', position: 4 },
  { number: 3, route: 'IJAYE', zone: 'B', position: 15 },
  { number: 6, route: 'OYINGBO', zone: 'C', position: 6 },
  { number: 7, route: 'IGANDO', zone: 'D', position: 12 },
  { number: 10, route: 'ODOGUNYAN', zone: 'E', position: 9 },
  { number: 20, route: 'MILE 2', zone: 'F', position: 18 },
  { number: 36, route: 'IMOTA', zone: 'A', position: 11 },
  { number: 41, route: 'GBERIGBE', zone: 'D', position: 8 },
  { number: 42, route: 'EGBEDA', zone: 'C', position: 2 },
]

export const pad2 = (value: number) => String(value).padStart(2, '0')

export const isParked = (bus: Bus): bus is Bus & { zone: string; position: number } =>
  bus.zone !== null && bus.position !== null

export const formatLocation = (bus: Bus) =>
  isParked(bus) ? `Zone ${bus.zone} · Position ${pad2(bus.position)}` : 'Not parked yet'

type SearchField = 'number' | 'route' | 'zone' | 'position'

/** Words that bind the token after them to a specific field: "zone a", "pos 12". */
const FIELD_ALIASES: Record<string, SearchField> = {
  zone: 'zone',
  pos: 'position',
  position: 'position',
  slot: 'position',
  bus: 'number',
  no: 'number',
  number: 'number',
  route: 'route',
}

const fieldValues = (bus: Bus, field: SearchField): string[] => {
  switch (field) {
    case 'number':
      return [pad2(bus.number), String(bus.number)]
    case 'route':
      return [bus.route]
    case 'zone':
      return bus.zone === null ? [] : [bus.zone]
    case 'position':
      return bus.position === null ? [] : [pad2(bus.position), String(bus.position)]
  }
}

const compareToField = (bus: Bus, field: SearchField, value: string): number => {
  const needle = value.toLowerCase()
  if (!needle) return 0
  let best = 0
  for (const candidate of fieldValues(bus, field)) {
    const haystack = candidate.toLowerCase()
    if (haystack === needle) best = Math.max(best, 3)
    else if (haystack.startsWith(needle)) best = Math.max(best, 2)
    else if (haystack.includes(needle)) best = Math.max(best, 1)
  }
  return best
}

const ALL_FIELDS: SearchField[] = ['number', 'route', 'zone', 'position']

/**
 * Scores one whitespace-separated AND-group against a bus. Returns 0 when any
 * token fails, so "zone a" only matches a bus that is genuinely parked in zone A.
 */
const matchGroup = (bus: Bus, tokens: string[]): number => {
  let score = 0
  for (let i = 0; i < tokens.length; i += 1) {
    const token = tokens[i]
    const boundField = FIELD_ALIASES[token]

    if (boundField && i + 1 < tokens.length) {
      const value = tokens[i + 1]
      i += 1
      const bound = compareToField(bus, boundField, value)
      if (!bound) return 0
      score += bound + 2
      continue
    }

    const best = ALL_FIELDS.reduce((top, field) => Math.max(top, compareToField(bus, field, token)), 0)
    if (!best) return 0
    score += best
  }
  return score
}

export const tokenize = (query: string) => query.toLowerCase().split(/\s+/).filter(Boolean)

/** Commas separate alternatives; spaces narrow within each alternative. */
const parseGroups = (query: string): string[][] =>
  query.split(',').map((group) => tokenize(group)).filter((group) => group.length)

export const searchBuses = (buses: Bus[], query: string): Bus[] => {
  const groups = parseGroups(query)
  if (!groups.length) return buses

  const exact = query.trim().toLowerCase()

  return buses
    .map((bus) => {
      let score = 0
      for (const group of groups) {
        const groupScore = matchGroup(bus, group)
        if (groupScore) score = Math.max(score, groupScore)
      }
      if (score === 0) return { bus, score }
      if (pad2(bus.number) === exact || String(bus.number) === exact) score += 100
      if (bus.route.toLowerCase() === exact) score += 80
      return { bus, score }
    })
    .filter((entry) => entry.score > 0)
    .sort((a, b) => b.score - a.score || a.bus.number - b.bus.number)
    .map((entry) => entry.bus)
}

export const escapeRegExp = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

/** Super admin fields: identity and route only. Shared by the form and the server action. */
export const validateBus = (draft: BusDraft, existingNumbers: number[]): string | null => {
  const { number, route } = draft

  if (!Number.isInteger(number) || number < 1 || number > 9999) {
    return 'Bus number must be a whole number between 1 and 9999.'
  }
  if (existingNumbers.includes(number)) {
    return `Bus ${pad2(number)} already exists. Each bus number must be unique.`
  }
  if (typeof route !== 'string' || !route.trim()) {
    return 'Route name is required.'
  }
  if (route.trim().length > 40) {
    return 'Route name must be 40 characters or fewer.'
  }
  return null
}

/** Transport admin fields, checked against the current car park layout. */
export const validateLocation = (location: LocationDraft, layout: Layout): string | null => {
  const zone = findZone(layout, location.zone)
  if (!zone) {
    return `Zone "${location.zone}" is not part of the car park layout.`
  }
  if (!Number.isInteger(location.position) || location.position < 1 || location.position > zone.positions) {
    return `Position must be a whole number between 1 and ${zone.positions} for zone ${zone.name}.`
  }
  return null
}

export const nextBusNumber = (buses: Bus[]): number =>
  buses.reduce((highest, bus) => Math.max(highest, bus.number), 0) + 1

/** Placeholder so components have a valid Bus before any real bus exists. */
export const EMPTY_BUS: Bus = { number: 0, route: '', zone: null, position: null }
