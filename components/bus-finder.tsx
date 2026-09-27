'use client'

import { Fragment, useEffect, useMemo, useState } from 'react'
import { ArrowLeft, ArrowRight, BusFront, Check, ChevronDown, CircleHelp, Database, KeyRound, MapPin, Navigation, Search, ShieldCheck, X } from 'lucide-react'
import { verifyAdminAccessCode } from '@/app/actions/auth'
import { getBuses, moveBus } from '@/app/actions/buses'
import { supabase } from '@/lib/supabase/client'
import type { Bus } from '@/lib/buses'
import { escapeRegExp, EMPTY_BUS, formatLocation, isParked, pad2, searchBuses, tokenize } from '@/lib/buses'
import { findZone, positionOptions, type Layout, type Zone } from '@/lib/layout'


export default function BusFinder({ initialBuses, layout }: { initialBuses: Bus[]; layout: Layout }) {
  const [buses, setBuses] = useState<Bus[]>(initialBuses)
  const [query, setQuery] = useState('')
  const [selected, setSelected] = useState<Bus>(initialBuses[0] ?? EMPTY_BUS)
  const [mode, setMode] = useState<'staff' | 'admin'>('staff')
  const [loggedIn, setLoggedIn] = useState(false)
  const [showLogin, setShowLogin] = useState(false)
  const [showHelp, setShowHelp] = useState(false)
  const [viewingBus, setViewingBus] = useState<Bus | null>(null)
  const [viewingZone, setViewingZone] = useState<Zone | null>(null)
  const [isLiveConnected, setIsLiveConnected] = useState(true)
  const [adminCode, setAdminCode] = useState('')
  const [authError, setAuthError] = useState('')
  const [verifying, setVerifying] = useState(false)
  const [draft, setDraft] = useState(selected)
  const [saved, setSaved] = useState(false)
  const [saveError, setSaveError] = useState('')
  const [saving, setSaving] = useState(false)

  // Real-time synchronization via Supabase Postgres changes
  useEffect(() => {
    const channel = supabase
      .channel('bus-finder-realtime')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'buses' },
        async () => {
          const fresh = await getBuses()
          setBuses(fresh)
          setSelected((curr) => {
            const updated = fresh.find((b) => b.number === curr.number)
            return updated ?? curr
          })
          setViewingBus((curr) => {
            if (!curr) return null
            const updated = fresh.find((b) => b.number === curr.number)
            return updated ?? curr
          })
        },
      )
      .subscribe((status) => {
        setIsLiveConnected(status === 'SUBSCRIBED')
      })

    return () => {
      supabase.removeChannel(channel)
    }
  }, [])

  const busLabel = (bus: Bus) => pad2(bus.number)
  const zoneList = layout.zones
  const firstZoneName = zoneList[0]?.name ?? ''
  const isSearching = query.trim().length > 0
  const visible = useMemo(() => searchBuses(buses, query), [buses, query])
  const matchesPerZone = useMemo(() => {
    const counts: Record<string, number> = {}
    for (const bus of visible) {
      if (bus.zone === null) continue
      counts[bus.zone] = (counts[bus.zone] ?? 0) + 1
    }
    return counts
  }, [visible])
  const highlight = (text: string) => {
    const tokens = tokenize(query)
    if (!tokens.length) return text
    const pattern = new RegExp(`(${tokens.map(escapeRegExp).join('|')})`, 'ig')
    return String(text)
      .split(pattern)
      .map((part, index) =>
        index % 2 === 1 ? (
          <mark key={index} className="rounded bg-[#fde68a] px-0.5 text-inherit">{part}</mark>
        ) : (
          <Fragment key={index}>{part}</Fragment>
        ),
      )
  }
  const selectBus = (bus: Bus) => {
    setSelected(bus)
    setDraft({
      ...bus,
      zone: bus.zone ?? firstZoneName,
      position: bus.position ?? 1,
    })
    setSaved(false)
    setSaveError('')
  }
  const runSearch = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Escape') { setQuery(''); return }
    if (event.key === 'Enter' && visible.length) {
      event.preventDefault()
      selectBus(visible[0])
      setViewingBus(visible[0])
    }
  }

  // A single unambiguous match is almost always the bus the user is looking for.
  useEffect(() => {
    if (!isSearching || visible.length !== 1) return
    const match = visible[0]
    setSelected((current) => (current.number === match.number ? current : match))
    setDraft((current) => (current.number === match.number ? current : match))
  }, [isSearching, visible])

  const saveLocation = async () => {
    if (saving || !draft.number) return
    setSaving(true)
    setSaveError('')
    const targetZone = draft.zone ?? firstZoneName
    const targetPosition = draft.position ?? 1
    const result = await moveBus(draft.number, { zone: targetZone, position: targetPosition })
    setSaving(false)

    if (!result.ok) {
      setSaveError(result.error)
      return
    }
    const updatedBus: Bus = {
      ...draft,
      zone: targetZone,
      position: targetPosition,
    }
    setBuses(result.buses)
    setSelected(updatedBus)
    setDraft(updatedBus)
    setSaved(true)
  }
  const clearLocation = async () => {
    if (saving || !draft.number) return
    setSaving(true)
    setSaveError('')
    const result = await moveBus(draft.number, null)
    setSaving(false)

    if (!result.ok) {
      setSaveError(result.error)
      return
    }
    const unparkedBus: Bus = {
      ...draft,
      zone: null,
      position: null,
    }
    setBuses(result.buses)
    setSelected(unparkedBus)
    setDraft({
      ...unparkedBus,
      zone: firstZoneName,
      position: 1,
    })
    setSaved(false)
  }
  const signIn = async (event: React.FormEvent) => {
    event.preventDefault()
    if (verifying) return
    setAuthError('')
    setVerifying(true)
    const granted = await verifyAdminAccessCode(adminCode)
    setVerifying(false)
    if (!granted) {
      setAuthError('That access code is not correct. Please try again.')
      setAdminCode('')
      return
    }
    setLoggedIn(true)
    setMode('admin')
    setShowLogin(false)
    setAdminCode('')
  }

  if (!initialBuses.length) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-[#f5f7fa] p-6 text-[#17263d]">
        <div className="max-w-md rounded-2xl border border-[#dce4ed] bg-white p-10 text-center shadow-[0_8px_30px_rgba(21,34,56,0.05)]">
          <BusFront className="mx-auto text-[#0758a6]" size={34} />
          <h1 className="mt-4 text-xl font-bold">No buses have been added yet</h1>
          <p className="mt-2 text-sm text-[#718095]">A super admin needs to add the staff buses before staff can search for them.</p>
          <a href="/super-admin" className="mt-6 inline-block rounded-xl bg-[#0758a6] px-4 py-3 text-sm font-bold text-white hover:bg-[#064984]">Go to super admin</a>
        </div>
      </main>
    )
  }

  return (
    <main className="min-h-screen bg-[#f5f7fa] text-[#17263d]">
      <header className="border-b border-[#dce4ed] bg-white">
        <div className="mx-auto flex max-w-[1360px] items-center justify-between gap-4 px-4 py-3.5 sm:px-5 sm:py-4 lg:px-10">
          <div className="flex min-w-0 items-center gap-3">
            <div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-[#0758a6] text-white">
              <BusFront size={23} />
            </div>
            <div className="min-w-0">
              <p className="truncate text-base font-bold tracking-tight sm:text-lg">Staff Bus Finder</p>
              <p className="truncate text-xs text-[#738297]">Main car park · Manual location updates</p>
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            {/* <span className="hidden items-center gap-1.5 rounded-full border border-[#bbf7d0] bg-[#f0fdf4] px-2.5 py-1 text-xs font-semibold text-[#166534] md:flex" title="Realtime synchronized with Supabase database">
              <span className={`size-2 rounded-full ${isLiveConnected ? 'bg-[#22c55e] animate-pulse' : 'bg-[#eab308]'}`} />
              {isLiveConnected ? 'Supabase live Now' : 'Reconnecting...'}
            </span> */}
            <button
              onClick={() => {
                if (!loggedIn) {
                  setShowLogin(true)
                } else if (mode === 'admin') {
                  setMode('staff')
                } else {
                  setMode('admin')
                  const currentBus =
                    (draft.number && buses.find((b) => b.number === draft.number)) ||
                    (selected.number && buses.find((b) => b.number === selected.number)) ||
                    buses[0]
                  if (currentBus) selectBus(currentBus)
                }
              }}
              className={`flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs font-bold transition sm:px-3 sm:py-2 sm:text-sm ${loggedIn && mode === 'admin'
                  ? 'border-[#0758a6] bg-[#edf4fb] text-[#0758a6]'
                  : 'border-[#dce4ed] bg-white text-[#516176] hover:bg-[#f5f7fa] hover:text-[#0758a6]'
                }`}
            >
              {loggedIn && mode === 'admin' ? (
                <>
                  <ArrowLeft size={16} />
                  <span>Staff view</span>
                </>
              ) : (
                <>
                  {/* <ShieldCheck size={16} /> */}
                  <span>{loggedIn ? 'Admin panel' : 'Transport admin'}</span>
                </>
              )}
            </button>
            <button
              onClick={() => setShowHelp(true)}
              aria-label="Help"
              title="Help and usage guide"
              className="hidden rounded-lg p-2 text-[#718096] hover:bg-[#f1f5f9] md:flex"
            >
              <CircleHelp size={19} />
            </button>
          </div>
        </div>
      </header>

      <div className="mx-auto max-w-[1360px] px-5 py-8 lg:px-10 lg:py-10">
        <div className="mb-7">
          <p className="mb-2 text-sm font-bold uppercase tracking-[0.16em] text-[#0758a6]">
            {mode === 'admin' ? 'Transport Admin Control' : 'Car park locator'}
          </p>
          <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">
            {mode === 'admin' ? 'Update bus parking positions.' : 'Find your bus without the guesswork.'}
          </h1>
          <p className="mt-3 max-w-xl text-base leading-7 text-[#647286]">
            {mode === 'admin'
              ? 'Select a shuttle and assign or clear its assigned parking zone and bay position.'
              : "Search a bus number or route. We'll show its zone, row and position in the car park."}
          </p>
        </div>

        {mode === 'staff' ? <>
          <div className="mb-4 flex max-w-2xl items-center gap-3 rounded-2xl border border-[#dce4ed] bg-white p-2 shadow-[0_8px_30px_rgba(21,34,56,0.05)] focus-within:border-[#62a5e8] focus-within:ring-4 focus-within:ring-[#dcecff]">
            <Search className="ml-3 shrink-0 text-[#7c8a9c]" size={21} />
            <input
              aria-label="Search buses"
              aria-describedby="search-count"
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={runSearch}
              placeholder="Search bus number, route, zone or position..."
              className="min-w-0 flex-1 bg-transparent py-2 text-base outline-none placeholder:text-[#9aa7b7]"
            />
            {query && <button aria-label="Clear search" onClick={() => setQuery('')} className="shrink-0 rounded p-1 hover:bg-[#eef3f8]"><X size={17} className="text-[#8190a1]" /></button>}
            <span id="search-count" aria-live="polite" className="hidden shrink-0 rounded-lg bg-[#edf4fb] px-3 py-2 text-xs font-bold text-[#0758a6] sm:block">
              {isSearching ? `${visible.length} of ${buses.length}` : `${buses.length} buses`}
            </span>
          </div>
          <div className="mb-7 flex max-w-2xl flex-wrap items-center gap-2">
            <span className="text-xs font-bold uppercase tracking-wider text-[#8b98a8]">Quick filter</span>
            {zoneList.map((zone) => (
              <button
                key={zone.name}
                onClick={() => setQuery(isSearching && query.trim().toLowerCase() === `zone ${zone.name.toLowerCase()}` ? '' : `zone ${zone.name}`)}
                aria-pressed={isSearching && query.trim().toLowerCase() === `zone ${zone.name.toLowerCase()}`}
                className={`rounded-lg border px-2.5 py-1 text-xs font-bold transition ${isSearching && query.trim().toLowerCase() === `zone ${zone.name.toLowerCase()}`
                  ? 'border-[#0758a6] bg-[#0758a6] text-white'
                  : 'border-[#dce4ed] bg-white text-[#5b6b80] hover:border-[#9fc6ec] hover:text-[#0758a6]'
                  }`}
              >
                Zone {zone.name}
              </button>
            ))}
          </div>
          <div className="grid gap-6 lg:grid-cols-[1fr_390px]">
            <section className="rounded-2xl border border-[#dce4ed] bg-white p-5 shadow-[0_8px_30px_rgba(21,34,56,0.05)]"><div className="mb-5 flex items-center justify-between"><div><h2 className="font-bold">{isSearching ? `Search results for "${query.trim()}"` : 'Car park zones'}</h2><p className="mt-1 text-xs text-[#7a899b]">{isSearching ? `${visible.length} of ${buses.length} buses match, best match first` : 'Select a bus to see walking directions'}</p></div><span className="flex items-center gap-1.5 text-xs font-semibold text-[#219363]"><span className="size-2.5 rounded-full bg-[#28aa70]" /> Updated now</span></div>
              {isSearching && (
                <div className="mb-5">
                  {visible.length === 0 ? (
                    <div className="rounded-xl border-2 border-dashed border-[#dce4ed] bg-[#f9fbfc] p-8 text-center">
                      <Search className="mx-auto text-[#9aa7b7]" size={28} />
                      <p className="mt-3 text-base font-bold">No buses match &quot;{query.trim()}&quot;</p>
                      <p className="mt-1 text-sm text-[#6f7e91]">Try a bus number like <span className="font-bold text-[#0758a6]">07</span>, a route like <span className="font-bold text-[#0758a6]">igando</span>, or a spot like <span className="font-bold text-[#0758a6]">zone d</span>.</p>
                      <button onClick={() => setQuery('')} className="mt-4 rounded-lg border border-[#dce4ed] bg-white px-3 py-2 text-sm font-bold text-[#0758a6] hover:bg-[#edf4fb]">Clear search</button>
                    </div>
                  ) : (
                    <ul className="space-y-2">
                      {visible.map((bus, index) => (
                        <li key={bus.number}>
                          <button
                            onClick={() => {
                              selectBus(bus)
                              setViewingBus(bus)
                            }}
                            className={`flex w-full items-center justify-between rounded-xl border-2 p-3 text-left transition hover:border-[#4e9de3] hover:bg-[#eef7ff] ${selected.number === bus.number ? 'border-[#4e9de3] bg-[#eef7ff]' : 'border-[#dce4ed] bg-white'
                              }`}
                          >
                            <div className="flex items-center gap-3">
                              <span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-[#0758a6] text-sm font-extrabold text-white">{highlight(busLabel(bus))}</span>
                              <div className="min-w-0">
                                <p className="truncate text-sm font-bold">{highlight(bus.route)}</p>
                                <p className={`text-xs ${isParked(bus) ? 'text-[#7a899b]' : 'font-semibold text-[#b8860b]'}`}>{isParked(bus) ? highlight(`Zone ${bus.zone} · Position ${pad2(bus.position)}`) : 'Not parked yet'}</p>
                              </div>
                            </div>
                            <div className="flex shrink-0 items-center gap-2">
                              {index === 0 && <span className="rounded-full bg-[#e9f7f0] px-2 py-0.5 text-[10px] font-bold uppercase text-[#218d5e]">Best match</span>}
                              <span className="hidden sm:inline-flex items-center gap-1 rounded-md bg-[#edf4fb] px-2 py-1 text-xs font-semibold text-[#0758a6]">View details</span>
                              <ArrowRight size={16} className="text-[#9aa7b7]" />
                            </div>
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              )}<div className="grid grid-cols-2 gap-3 sm:grid-cols-3">{zoneList.map((zone) => {
                const name = zone.name
                const total = buses.filter((bus) => bus.zone === name).length
                const matches = matchesPerZone[name] ?? 0
                const dimmed = isSearching && matches === 0
                const topMatch = isSearching ? visible.find((bus) => bus.zone === name) : undefined
                const firstBus = topMatch ?? buses.find((bus) => bus.zone === name)
                return (
                  <button
                    key={name}
                    disabled={dimmed}
                    onClick={() => setViewingZone(zone)}
                    aria-label={`Zone ${name}, ${isSearching ? `${matches} matching of ${total}` : `${total} buses`} parked, ${zone.positions} positions. Click to view all buses in this zone.`}
                    className={`min-h-32 rounded-xl border-2 p-4 text-left transition ${dimmed
                      ? 'cursor-not-allowed border-[#e8edf2] bg-[#f7f9fb] opacity-45'
                      : 'hover:-translate-y-0.5 hover:shadow-md'
                      } ${selected.zone === name ? 'border-[#4e9de3] bg-[#eef7ff]' : 'border-[#dce4ed] bg-[#f9fbfc]'}`}
                  >
                    <div className="flex items-start justify-between">
                      <span className="flex size-9 items-center justify-center rounded-lg bg-[#0758a6] text-lg font-extrabold text-white">{name}</span>
                      <MapPin size={17} className="text-[#7e8da0]" />
                    </div>
                    <p className="mt-4 text-xs font-bold uppercase tracking-wider text-[#7c8b9c]">Zone {name}</p>
                    <p className="mt-1 text-sm font-bold">
                      {isSearching ? (
                        <>{matches} of {total} match{matches === 1 ? 'es' : ''}</>
                      ) : (
                        <>{total} buses parked</>
                      )}
                    </p>
                    <p className="mt-0.5 text-[11px] text-[#8b98a8]">{zone.positions} positions</p>
                  </button>
                )
              })}</div><div className="mt-5 rounded-xl bg-[#f1f5f8] p-4"><div className="flex items-center gap-3"><Navigation size={18} className="text-[#0758a6]" /><div><p className="text-sm font-bold">How to use the layout</p><p className="mt-1 text-xs leading-5 text-[#6f7e91]">Enter through the main gate, then follow the zone signs. Every zone has its own numbered positions.</p></div></div></div></section>
            <aside className="space-y-4"><div className="rounded-2xl border border-[#dce4ed] bg-white p-5 shadow-[0_8px_30px_rgba(21,34,56,0.05)]"><p className="text-xs font-bold uppercase tracking-[0.15em] text-[#8290a1]">Selected bus</p><div className="mt-1 flex items-center justify-between"><h2 className="text-2xl font-bold">Bus {busLabel(selected)}</h2><span className={`rounded-full px-2.5 py-1 text-xs font-bold ${isParked(selected) ? 'bg-[#e9f7f0] text-[#218d5e]' : 'bg-[#fdf3d8] text-[#b8860b]'}`}>{isParked(selected) ? 'Parked' : 'Not parked yet'}</span></div><div className={`mt-5 rounded-xl p-4 ${isParked(selected) ? 'bg-[#edf4fb]' : 'bg-[#fdf3d8]'}`}><p className="text-xs font-bold uppercase tracking-wider text-[#6c7d91]">Parked at</p><p className={`mt-1 text-lg font-extrabold ${isParked(selected) ? 'text-[#0758a6]' : 'text-[#b8860b]'}`}>{formatLocation(selected)}</p>{!isParked(selected) && <p className="mt-1 text-xs leading-5 text-[#7a6a3a]">A transport admin has not recorded where this bus is parked yet.</p>}</div><PositionMap bus={selected} buses={buses} layout={layout} /><div className="mt-4 flex items-center gap-3"><div className="flex size-9 items-center justify-center rounded-lg bg-[#e9f7f0] text-[#218d5e]"><Navigation size={18} /></div><div><p className="text-xs text-[#8290a1]">Route</p><p className="font-bold">{selected.route}</p></div></div><button onClick={() => setViewingBus(selected)} className="mt-4 flex w-full items-center justify-center gap-2 rounded-xl bg-[#0758a6] py-3 text-sm font-bold text-white hover:bg-[#064984] transition">View full bus details <ArrowRight size={16} /></button></div><div id="bus-list" className="rounded-2xl border border-[#dce4ed] bg-white p-5 shadow-[0_8px_30px_rgba(21,34,56,0.05)]"><div className="mb-3 flex items-center justify-between"><h2 className="font-bold">{isSearching ? 'Matches' : 'All buses'}</h2><span className="text-xs font-semibold text-[#8190a2]">{visible.length} shown</span></div><div className="max-h-64 space-y-1 overflow-auto">{visible.length === 0 ? <p className="rounded-xl bg-[#f7f9fb] p-4 text-center text-sm text-[#6f7e91]">No buses match your search.</p> : visible.map((bus) => <button key={bus.number} onClick={() => { selectBus(bus); setViewingBus(bus); }} className={`flex w-full items-center justify-between rounded-xl px-3 py-3 text-left transition ${selected.number === bus.number ? 'bg-[#edf4fb]' : 'hover:bg-[#f5f7fa]'}`}><div className="flex items-center gap-3"><span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-[#0758a6] text-xs font-extrabold text-white">{busLabel(bus)}</span><div className="min-w-0"><p className="truncate text-sm font-bold">{highlight(bus.route)}</p><p className={`text-xs ${isParked(bus) ? 'text-[#8592a1]' : 'font-semibold text-[#b8860b]'}`}>{isParked(bus) ? highlight(`Zone ${bus.zone} · Pos ${pad2(bus.position)}`) : 'Not parked yet'}</p></div></div><ArrowRight size={15} className="shrink-0 text-[#9aa7b7]" /></button>)}</div></div></aside>
          </div>
        </> : <AdminPanel loggedIn={loggedIn} draft={draft} setDraft={setDraft} buses={buses} selectBus={selectBus} saveLocation={saveLocation} clearLocation={clearLocation} saved={saved} saving={saving} saveError={saveError} layout={layout} />}
        <footer className="mt-8 flex flex-col gap-2 text-xs text-[#8491a1] sm:flex-row sm:items-center sm:justify-between"><p>Locations are updated by authorized Transport/Admin staff.</p><div className="flex flex-wrap items-center gap-x-4 gap-y-1"><p>Car park layout · {zoneList.length} zone{zoneList.length === 1 ? '' : 's'} ({zoneList.map((zone) => zone.name).join(', ')}) · {zoneList.reduce((sum, zone) => sum + zone.positions, 0)} positions</p><a href="/super-admin" className="font-semibold text-[#6b7a8d] underline-offset-2 hover:text-[#0758a6] hover:underline">Super admin</a></div></footer>
      </div>

      {showLogin && (
        <div className="fixed inset-0 z-20 flex items-center justify-center bg-[#17263d]/35 p-5">
          <div className="w-full max-w-sm rounded-2xl bg-white p-6 shadow-2xl">
            <div className="flex items-start justify-between">
              <div>
                <div className="mb-3 flex size-10 items-center justify-center rounded-xl bg-[#e9f2fc] text-[#0758a6]">
                  <KeyRound size={20} />
                </div>
                <h2 className="text-xl font-bold">Admin sign in</h2>
                <p className="mt-1 text-sm text-[#718095]">Enter the 4-digit transport admin code to update bus locations.</p>
              </div>
              <button onClick={() => setShowLogin(false)} aria-label="Close login">
                <X className="text-[#8190a1]" />
              </button>
            </div>
            <form onSubmit={signIn} className="mt-6">
              <label className="block text-sm font-bold">
                Access code
                <input
                  autoFocus
                  value={adminCode}
                  onChange={(e) => {
                    setAdminCode(e.target.value.replace(/\D/g, '').slice(0, 4))
                    setAuthError('')
                  }}
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  maxLength={4}
                  placeholder="••••"
                  aria-invalid={authError ? true : undefined}
                  className={`mt-2 w-full rounded-xl border bg-white px-3 py-3 text-center text-2xl font-bold tracking-[0.5em] outline-none ${
                    authError ? 'border-[#d9534f]' : 'border-[#d6e0ea] focus:border-[#4e9de3]'
                  }`}
                />
              </label>
              {authError && <p role="alert" className="mt-2 text-sm font-semibold text-[#c0392b]">{authError}</p>}
              <button
                type="submit"
                disabled={adminCode.length !== 4 || verifying}
                className="mt-5 w-full rounded-xl bg-[#0758a6] py-3 text-sm font-bold text-white transition hover:bg-[#064984] disabled:cursor-not-allowed disabled:opacity-40"
              >
                {verifying ? 'Checking...' : 'Continue as admin'}
              </button>
            </form>
            <div className="mt-4 border-t border-[#edf2f7] pt-3 text-center">
              <a
                href="/super-admin"
                className="inline-flex items-center gap-1 text-xs font-semibold text-[#0758a6] transition hover:underline"
              >
                <ShieldCheck size={14} /> Need Super Admin? Open Bus Register & Zones →
              </a>
            </div>
          </div>
        </div>
      )}

      {showHelp && (
        <div className="fixed inset-0 z-30 flex items-center justify-center bg-[#17263d]/40 p-4">
          <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl">
            <div className="flex items-start justify-between">
              <div className="flex items-center gap-3">
                <div className="flex size-10 items-center justify-center rounded-xl bg-[#e9f2fc] text-[#0758a6]">
                  <CircleHelp size={22} />
                </div>
                <div>
                  <h2 className="text-lg font-bold">Staff Bus Finder Guide</h2>
                  <p className="text-xs text-[#718095]">Help and system information</p>
                </div>
              </div>
              <button onClick={() => setShowHelp(false)} aria-label="Close help" className="rounded-lg p-1 text-[#8190a1] hover:bg-[#f1f5f9]">
                <X size={20} />
              </button>
            </div>

            <div className="mt-5 space-y-3.5 text-sm text-[#4b5563]">
              <div className="rounded-xl border border-[#e2e8f0] bg-[#f8fafc] p-3.5">
                <p className="font-bold text-[#17263d]">🔍 Finding Your Bus</p>
                <p className="mt-1 text-xs leading-relaxed text-[#64748b]">
                  Search by bus number (e.g. <span className="font-bold text-[#0758a6]">07</span>), destination route (e.g. <span className="font-bold text-[#0758a6]">IGANDO</span>), or location (e.g. <span className="font-bold text-[#0758a6]">Zone D</span>). Press <kbd className="rounded bg-white px-1.5 py-0.5 border text-[11px] font-mono shadow-xs">Enter</kbd> to quickly select the top match.
                </p>
              </div>

              <div className="rounded-xl border border-[#e2e8f0] bg-[#f8fafc] p-3.5">
                <p className="font-bold text-[#17263d]">📍 Parking Slots & Positions</p>
                <p className="mt-1 text-xs leading-relaxed text-[#64748b]">
                  Each zone is divided into numbered position slots. The visual map displays the exact spot your shuttle is currently parked at in the car park.
                </p>
              </div>

              <div className="rounded-xl border border-[#e2e8f0] bg-[#f8fafc] p-3.5">
                <p className="font-bold text-[#17263d]">⚡ Live Supabase Database</p>
                <p className="mt-1 text-xs leading-relaxed text-[#64748b]">
                  The app is synchronized with the live Supabase cloud database. When transport admins update a bus position, every connected screen receives the update instantaneously.
                </p>
              </div>
            </div>

            <button onClick={() => setShowHelp(false)} className="mt-6 w-full rounded-xl bg-[#0758a6] py-3 text-sm font-bold text-white hover:bg-[#064984]">
              Close guide
            </button>
          </div>
        </div>
      )}

      {viewingBus && (
        <BusDetailsDialog
          bus={viewingBus}
          buses={buses}
          layout={layout}
          onClose={() => setViewingBus(null)}
          onViewZone={(zoneName) => {
            setViewingBus(null)
            const targetZone = findZone(layout, zoneName)
            if (targetZone) setViewingZone(targetZone)
          }}
        />
      )}

      {viewingZone && (
        <ZoneDetailsDialog
          zone={viewingZone}
          buses={buses}
          layout={layout}
          onClose={() => setViewingZone(null)}
          onSelectBus={(bus) => {
            setViewingZone(null)
            selectBus(bus)
            setViewingBus(bus)
          }}
        />
      )}
    </main>
  )
}

function AdminPanel({
  loggedIn,
  draft,
  setDraft,
  buses,
  selectBus,
  saveLocation,
  clearLocation,
  saved,
  saving,
  saveError,
  layout,
}: {
  loggedIn: boolean
  draft: Bus
  setDraft: (bus: Bus) => void
  buses: Bus[]
  selectBus: (bus: Bus) => void
  saveLocation: () => void | Promise<void>
  clearLocation: () => void | Promise<void>
  saved: boolean
  saving: boolean
  saveError: string
  layout: Layout
}) {
  const activeZoneName = draft.zone ?? layout.zones[0]?.name ?? ''
  const activeZone = findZone(layout, activeZoneName)
  const availablePositions = positionOptions(layout, activeZoneName)
  // A draft position can outlive its zone if the layout shrank, so keep the select on a real option.
  const safePosition =
    draft.position !== null && draft.position >= 1 && draft.position <= (activeZone?.positions ?? 0)
      ? draft.position
      : 1
  const isCurrentlyParked = buses.find((b) => b.number === draft.number)?.zone !== null

  if (!loggedIn) {
    return (
      <div className="rounded-2xl border border-[#dce4ed] bg-white p-10 text-center shadow-sm">
        <ShieldCheck className="mx-auto text-[#0758a6]" size={34} />
        <h2 className="mt-4 text-xl font-bold">Admin access required</h2>
        <p className="mt-2 text-sm text-[#718095]">Sign in as Transport/Admin staff to update a bus location.</p>
      </div>
    )
  }

  return (
    <section className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_360px]">
      <div className="rounded-2xl border border-[#dce4ed] bg-white p-6 shadow-sm">
        <div className="mb-6">
          <p className="text-xs font-bold uppercase tracking-[0.15em] text-[#0758a6]">Transport control</p>
          <h2 className="mt-1 text-2xl font-bold">Update a bus location</h2>
          <p className="mt-2 text-sm text-[#718095]">Choose the bus, then record the zone and position it is parked in today.</p>
        </div>

        <div className="grid gap-5 sm:grid-cols-2">
          <label className="text-sm font-bold sm:col-span-2">
            Bus number
            <select
              value={draft.number ? String(draft.number) : ''}
              onChange={(e) => {
                const selectedNumber = Number(e.target.value)
                const bus = buses.find((item) => item.number === selectedNumber)
                if (bus) {
                  selectBus(bus)
                }
              }}
              className="mt-2 w-full rounded-xl border border-[#d6e0ea] bg-white px-3 py-3 font-medium text-[#17263d] focus:border-[#0758a6] focus:outline-none focus:ring-2 focus:ring-[#dcecff]"
            >
              <option value="">Select a bus</option>
              {buses.map((bus) => (
                <option key={bus.number} value={String(bus.number)}>
                  Bus {pad2(bus.number)} · {bus.route} {isParked(bus) ? `(Zone ${bus.zone} · Pos ${pad2(bus.position)})` : '(Not parked yet)'}
                </option>
              ))}
            </select>
          </label>

          <Select
            label="Zone"
            value={activeZoneName}
            onChange={(value) => setDraft({ ...draft, zone: value, position: 1 })}
            options={layout.zones.map((zone) => zone.name)}
          />

          <Select
            label={`Position${activeZone ? ` (${activeZone.positions} available)` : ''}`}
            value={pad2(safePosition)}
            onChange={(value) => setDraft({ ...draft, position: Number(value) })}
            options={availablePositions}
          />

          <div className="text-sm font-bold sm:col-span-2">
            Route
            <input
              value={draft.route || ''}
              placeholder="Select a bus above"
              readOnly
              className="mt-2 w-full rounded-xl border border-[#e3e8ee] bg-[#f4f6f9] px-3 py-3 text-[#6b7a8d]"
            />
            <span className="mt-1 block text-xs font-normal text-[#8290a1]">
              Route names are maintained by the super admin in the bus register.
            </span>
          </div>
        </div>

        <button
          onClick={saveLocation}
          disabled={saving || !draft.number}
          className="mt-6 flex w-full items-center justify-center gap-2 rounded-xl bg-[#0758a6] py-3.5 text-sm font-bold text-white hover:bg-[#064984] disabled:opacity-50"
        >
          {saved && !saveError ? (
            <>
              <Check size={17} /> Location saved
            </>
          ) : saving ? (
            'Saving...'
          ) : (
            'Save location'
          )}
        </button>

        <button
          onClick={clearLocation}
          disabled={saving || !draft.number || !isCurrentlyParked}
          className="mt-2 w-full rounded-xl border border-[#dce4ed] py-2.5 text-sm font-bold text-[#516176] hover:bg-[#f5f7fa] disabled:opacity-40"
        >
          Mark as not parked
        </button>

        {saveError && (
          <p role="alert" className="mt-2 text-sm font-semibold text-[#c0392b]">
            {saveError}
          </p>
        )}
      </div>

      <div className="rounded-2xl border border-[#dce4ed] bg-[#eef7ff] p-6">
        <p className="text-xs font-bold uppercase tracking-wider text-[#0758a6]">Staff will see</p>
        <p className="mt-3 text-2xl font-extrabold text-[#0758a6]">
          {draft.number ? `Bus ${pad2(draft.number)}` : 'No bus selected'}
        </p>
        <p className="mt-2 text-lg font-bold">
          {draft.number ? `Zone ${activeZoneName || '—'} · Position ${pad2(safePosition)}` : 'Select a bus to preview'}
        </p>
        <div className="mt-5 flex items-start gap-2 text-sm leading-6 text-[#5e7188]">
          <MapPin size={17} className="mt-1 shrink-0 text-[#0758a6]" />
          Changes are saved to Supabase and immediately visible in real time to every staff member using this page.
        </div>
      </div>
    </section>
  )
}

/**
 * Visual position map for the selected bus's zone.
 * Renders only the buses parked in this zone, facing the entrance (downward):
 * - Number of 3D buses = number of buses parked in this zone
 * - Selected bus is blue
 * - Other parked buses in the zone are grey
 * - Labeled with "Zone [name]" and "Entrance" at the bottom
 */
function PositionMap({ bus, buses, layout }: { bus: Bus; buses: Bus[]; layout: Layout }) {
  if (!isParked(bus)) return null
  const zoneName = bus.zone
  const position = bus.position
  const zone = findZone(layout, zoneName)
  if (!zone) return null

  // Buses parked in this zone, sorted by position
  let parkedInZone = buses
    .filter((b) => b.zone === zoneName && b.position !== null)
    .sort((a, b) => (a.position ?? 0) - (b.position ?? 0))

  // Ensure current bus is present
  if (!parkedInZone.some((b) => b.number === bus.number)) {
    parkedInZone = [...parkedInZone, bus].sort((a, b) => (a.position ?? 0) - (b.position ?? 0))
  }

  return (
    <div className="mt-5 border-t border-[#eef2f6] pt-5">
      <div className="mb-4 flex items-center justify-between">
        <div>
          <p className="text-xs font-bold uppercase tracking-wider text-[#6c7d91]">
            Zone {zone.name} Parking Map
          </p>
          <p className="text-[11px] text-[#8b98a8]">
            {parkedInZone.length} bus{parkedInZone.length === 1 ? '' : 'es'} parked in Zone {zone.name}
          </p>
        </div>
        <span className="inline-flex items-center gap-1.5 rounded-full bg-[#edf4fb] px-2.5 py-1 text-xs font-bold text-[#0758a6]">
          <span className="size-2 rounded-full bg-[#2563eb]" />
          Bus #{pad2(bus.number)} · Pos {pad2(position)}
        </span>
      </div>

      {/* Map Card */}
      <div className="flex flex-col items-center justify-center rounded-2xl border border-[#dce4ed] bg-[#fbfcfd] px-4 py-7 shadow-xs">
        {/* Vertical column of 3D Miniature Buses - only for parked buses in this zone */}
        <div className="flex flex-col items-center gap-3.5">
          {parkedInZone.map((parkedBus) => {
            const isTarget = parkedBus.number === bus.number

            return (
              <div
                key={parkedBus.number}
                className="group relative flex items-center justify-center"
              >
                {/* 3D Miniature Bus SVG Image (Facing Entrance / Downward) */}
                <div
                  className={`relative flex items-center justify-center transition-transform duration-200 ${
                    isTarget ? 'z-10 scale-105' : 'opacity-90 hover:scale-102 hover:opacity-100'
                  }`}
                >
                  <img
                    src={isTarget ? '/mini-bus-blue.svg' : '/mini-bus-grey.svg'}
                    alt={
                      isTarget
                        ? `Selected Bus ${pad2(parkedBus.number)} at Position ${pad2(parkedBus.position!)}`
                        : `Bus ${pad2(parkedBus.number)} at Position ${pad2(parkedBus.position!)}`
                    }
                    className={`h-20 w-14 object-contain transition-all ${
                      isTarget
                        ? 'drop-shadow-[0_8px_16px_rgba(37,99,235,0.4)]'
                        : 'drop-shadow-sm'
                    }`}
                  />

                  {/* Bus Number Label on the Roof */}
                  <span
                    className={`pointer-events-none absolute text-[10px] font-extrabold tracking-wider ${
                      isTarget ? 'text-white' : 'text-[#334155]'
                    }`}
                  >
                    #{pad2(parkedBus.number)}
                  </span>
                </div>

                {/* Position and Route indicator on the side */}
                <div className="absolute left-[calc(100%+14px)] flex items-center whitespace-nowrap">
                  <div
                    className={`flex flex-col rounded-md px-2 py-0.5 text-left text-xs transition ${
                      isTarget
                        ? 'bg-[#0758a6] text-white shadow-xs'
                        : 'bg-[#eef2f6] text-[#475569] opacity-85 group-hover:opacity-100'
                    }`}
                  >
                    <span className="font-extrabold tabular-nums">
                      Pos {pad2(parkedBus.position!)}
                    </span>
                    <span className={`text-[10px] truncate max-w-[120px] ${isTarget ? 'text-[#bfdbfe]' : 'text-[#64748b]'}`}>
                      {parkedBus.route}
                    </span>
                  </div>
                </div>
              </div>
            )
          })}
        </div>

        {/* Zone Name Label */}
        <div className="mt-7 text-center">
          <p className="text-lg font-bold tracking-tight text-[#17263d]">
            Zone {zone.name}
          </p>
        </div>

        {/* Entrance Label */}
        <div className="mt-3.5 flex flex-col items-center">
          <span className="text-2xl font-bold tracking-tight text-[#17263d]">
            Entrance
          </span>
          <p className="mt-1 text-[11px] font-medium text-[#7c8b9d]">
            Enter from main gate and follow pedestrian lane
          </p>
        </div>
      </div>
    </div>
  )
}


function Select({ label, value, onChange, options }: { label: string; value: string; onChange: (value: string) => void; options: string[] }) { return <label className="text-sm font-bold">{label}<span className="relative mt-2 block"><select value={value} onChange={(e) => onChange(e.target.value)} className="w-full appearance-none rounded-xl border border-[#d6e0ea] bg-white px-3 py-3">{options.map((option) => <option key={option}>{option}</option>)}</select><ChevronDown size={16} className="pointer-events-none absolute right-3 top-3.5 text-[#8190a1]" /></span></label> }

/**
 * Mobile-responsive dialog showing complete bus location details,
 * bay position map, and walking directions.
 */
function BusDetailsDialog({
  bus,
  buses,
  layout,
  onClose,
  onViewZone,
}: {
  bus: Bus
  buses: Bus[]
  layout: Layout
  onClose: () => void
  onViewZone: (zoneName: string) => void
}) {
  const parked = isParked(bus)
  const zone = parked ? findZone(layout, bus.zone) : undefined

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-[#17263d]/55 p-0 backdrop-blur-xs transition-opacity duration-200 sm:items-center sm:p-4">
      <div
        className="flex max-h-[92vh] w-full flex-col overflow-hidden rounded-t-3xl border-t border-[#dce4ed] bg-white shadow-2xl transition-all sm:max-h-[88vh] sm:max-w-lg sm:rounded-2xl sm:border"
        role="dialog"
        aria-modal="true"
        aria-labelledby="bus-dialog-title"
      >
        {/* Mobile handle indicator */}
        <div className="flex justify-center pb-1 pt-3 sm:hidden">
          <div className="h-1.5 w-12 rounded-full bg-[#dce4ed]" />
        </div>

        {/* Dialog Header */}
        <div className="flex items-center justify-between border-b border-[#eef2f6] px-5 py-4">
          <div className="flex items-center gap-3">
            <div className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-[#0758a6] text-white shadow-sm">
              <span className="text-base font-extrabold">{pad2(bus.number)}</span>
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <h2 id="bus-dialog-title" className="text-xl font-bold tracking-tight text-[#17263d]">
                  Bus {pad2(bus.number)}
                </h2>
                <span
                  className={`rounded-full px-2.5 py-0.5 text-xs font-bold ${parked ? 'bg-[#e9f7f0] text-[#218d5e]' : 'bg-[#fdf3d8] text-[#b8860b]'
                    }`}
                >
                  {parked ? 'Parked' : 'Not parked yet'}
                </span>
              </div>
              <p className="truncate text-xs font-medium text-[#718095]">{bus.route}</p>
            </div>
          </div>
          <button
            onClick={onClose}
            aria-label="Close dialog"
            className="rounded-xl p-2.5 text-[#718096] transition hover:bg-[#f1f5f9]"
          >
            <X size={20} />
          </button>
        </div>

        {/* Dialog Scrollable Body */}
        <div className="flex-1 space-y-4 overflow-y-auto overscroll-contain p-5">
          {/* Location status card */}
          <div
            className={`rounded-2xl border p-4.5 ${parked ? 'border-[#b9dbf8] bg-[#edf4fb]' : 'border-[#fae3ad] bg-[#fdf8ea]'
              }`}
          >
            <p className="text-xs font-bold uppercase tracking-wider text-[#6c7d91]">Current Location</p>
            <p className={`mt-1 text-2xl font-extrabold ${parked ? 'text-[#0758a6]' : 'text-[#b8860b]'}`}>
              {formatLocation(bus)}
            </p>
            {parked ? (
              <p className="mt-1.5 text-xs leading-relaxed text-[#516176]">
                This shuttle is positioned at slot bay <strong className="text-[#0758a6]">#{pad2(bus.position)}</strong> in Zone <strong className="text-[#0758a6]">{bus.zone}</strong>.
              </p>
            ) : (
              <p className="mt-1.5 text-xs leading-relaxed text-[#7a6a3a]">
                A transport admin has not recorded today&apos;s parking position for this bus yet. It will appear on the map as soon as recorded.
              </p>
            )}
          </div>

          {/* Position map */}
          {parked && (
            <div className="rounded-2xl border border-[#dce4ed] bg-white p-4.5">
              <PositionMap bus={bus} buses={buses} layout={layout} />
              {zone && (
                <button
                  type="button"
                  onClick={() => onViewZone(zone.name)}
                  className="mt-4 flex w-full items-center justify-center gap-1.5 rounded-xl border border-[#0758a6] bg-[#f0f7fe] py-2.5 text-xs font-bold text-[#0758a6] transition hover:bg-[#e1f0fe]"
                >
                  <MapPin size={15} /> View all buses in Zone {zone.name} →
                </button>
              )}
            </div>
          )}

          {/* Route info & Walking guidance */}
          <div className="space-y-3 rounded-2xl border border-[#dce4ed] bg-[#fbfcfd] p-4.5">
            <div className="flex items-center gap-3">
              <div className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-[#e9f7f0] text-[#218d5e]">
                <Navigation size={18} />
              </div>
              <div className="min-w-0">
                <p className="text-xs font-bold uppercase tracking-wider text-[#8290a1]">Route Destination</p>
                <p className="truncate text-sm font-bold text-[#17263d]">{bus.route}</p>
              </div>
            </div>

            {parked && (
              <div className="border-t border-[#edf2f7] pt-3 text-xs leading-relaxed text-[#647286]">
                <p className="mb-1.5 font-bold text-[#17263d]">Walking directions:</p>
                <ol className="list-decimal space-y-1 pl-4">
                  <li>Enter through the main car park pedestrian gate.</li>
                  <li>Follow the overhead signage towards <strong className="text-[#0758a6]">Zone {bus.zone}</strong>.</li>
                  <li>Locate bay slot number <strong className="text-[#0758a6]">{pad2(bus.position)}</strong>.</li>
                </ol>
              </div>
            )}
          </div>
        </div>

        {/* Dialog Footer */}
        <div className="border-t border-[#eef2f6] bg-[#fbfcfd] p-4">
          <button
            onClick={onClose}
            className="w-full rounded-xl bg-[#0758a6] py-3 text-sm font-bold text-white transition hover:bg-[#064984]"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  )
}

/**
 * Mobile-responsive dialog displaying all buses currently parked in a specific zone,
 * along with an interactive bay slot map.
 */
function ZoneDetailsDialog({
  zone,
  buses,
  layout,
  onClose,
  onSelectBus,
}: {
  zone: Zone
  buses: Bus[]
  layout: Layout
  onClose: () => void
  onSelectBus: (bus: Bus) => void
}) {
  const parkedInZone = buses
    .filter((b) => b.zone === zone.name && b.position !== null)
    .sort((a, b) => (a.position ?? 0) - (b.position ?? 0))

  const slots = Array.from({ length: zone.positions }, (_, i) => i + 1)
  const emptyCount = zone.positions - parkedInZone.length

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-[#17263d]/55 p-0 backdrop-blur-xs transition-opacity duration-200 sm:items-center sm:p-4">
      <div
        className="flex max-h-[92vh] w-full flex-col overflow-hidden rounded-t-3xl border-t border-[#dce4ed] bg-white shadow-2xl transition-all sm:max-h-[88vh] sm:max-w-xl sm:rounded-2xl sm:border"
        role="dialog"
        aria-modal="true"
        aria-labelledby="zone-dialog-title"
      >
        {/* Mobile handle indicator */}
        <div className="flex justify-center pb-1 pt-3 sm:hidden">
          <div className="h-1.5 w-12 rounded-full bg-[#dce4ed]" />
        </div>

        {/* Dialog Header */}
        <div className="flex items-center justify-between border-b border-[#eef2f6] px-5 py-4">
          <div className="flex items-center gap-3">
            <div className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-[#0758a6] text-white shadow-sm">
              <span className="text-xl font-extrabold">{zone.name}</span>
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 id="zone-dialog-title" className="text-xl font-bold tracking-tight text-[#17263d]">
                  Zone {zone.name}
                </h2>
                <span className="rounded-full bg-[#edf4fb] px-2.5 py-0.5 text-xs font-bold text-[#0758a6]">
                  {parkedInZone.length} of {zone.positions} parked
                </span>
              </div>
              <p className="text-xs font-medium text-[#718095]">
                {emptyCount > 0 ? `${emptyCount} empty slot${emptyCount === 1 ? '' : 's'} available` : 'Zone is full'}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            aria-label="Close dialog"
            className="rounded-xl p-2.5 text-[#718096] transition hover:bg-[#f1f5f9]"
          >
            <X size={20} />
          </button>
        </div>

        {/* Dialog Scrollable Body */}
        <div className="flex-1 space-y-5 overflow-y-auto overscroll-contain p-5">
          {/* Visual Bay Slot Map */}
          <div className="rounded-2xl border border-[#dce4ed] bg-[#f9fbfc] p-4.5">
            <div className="mb-3 flex items-center justify-between">
              <p className="text-xs font-bold uppercase tracking-wider text-[#6c7d91]">
                Bay Slot Map ({zone.positions} Total Positions)
              </p>
              <div className="flex items-center gap-3 text-[11px] text-[#718095]">
                <span className="flex items-center gap-1.5">
                  <span className="size-2.5 rounded-sm bg-[#0758a6]" /> Parked
                </span>
                <span className="flex items-center gap-1.5">
                  <span className="size-2.5 rounded-sm bg-[#eef2f6]" /> Empty
                </span>
              </div>
            </div>

            <ul className="grid grid-cols-5 gap-1.5 sm:grid-cols-6" aria-label={`Position map for zone ${zone.name}`}>
              {slots.map((slot) => {
                const busInSlot = parkedInZone.find((b) => b.position === slot)
                return (
                  <li key={slot}>
                    <button
                      type="button"
                      disabled={!busInSlot}
                      onClick={() => {
                        if (busInSlot) onSelectBus(busInSlot)
                      }}
                      title={busInSlot ? `Bus ${pad2(busInSlot.number)} (${busInSlot.route})` : `Slot ${pad2(slot)} empty`}
                      className={`flex aspect-square w-full flex-col items-center justify-center rounded-lg text-xs font-bold tabular-nums transition ${busInSlot
                        ? 'cursor-pointer bg-[#0758a6] text-white shadow-sm ring-1 ring-[#0758a6] hover:bg-[#064984]'
                        : 'cursor-default bg-[#eef2f6] text-[#9aa7b7]'
                        }`}
                    >
                      <span className="leading-tight">{pad2(slot)}</span>
                      {busInSlot && (
                        <span className="text-[9px] font-extrabold opacity-95">#{pad2(busInSlot.number)}</span>
                      )}
                    </button>
                  </li>
                )
              })}
            </ul>
            <p className="mt-3 text-[11px] text-[#718095]">
              Tap any occupied slot above to view full details for that bus.
            </p>
          </div>

          {/* Parked Buses List */}
          <div>
            <div className="mb-2.5 flex items-center justify-between">
              <h3 className="text-sm font-bold text-[#17263d]">
                Buses Parked in Zone {zone.name}
              </h3>
              <span className="text-xs font-semibold text-[#8190a2]">
                {parkedInZone.length} shuttle{parkedInZone.length === 1 ? '' : 's'}
              </span>
            </div>

            {parkedInZone.length === 0 ? (
              <div className="rounded-2xl border-2 border-dashed border-[#dce4ed] bg-[#f9fbfc] p-8 text-center">
                <BusFront className="mx-auto text-[#9aa7b7]" size={34} />
                <p className="mt-3 text-sm font-bold text-[#17263d]">No buses parked in Zone {zone.name}</p>
                <p className="mt-1 text-xs text-[#6f7e91]">All {zone.positions} position slots are currently empty and available.</p>
              </div>
            ) : (
              <div className="space-y-2">
                {parkedInZone.map((bus) => (
                  <button
                    key={bus.number}
                    type="button"
                    onClick={() => onSelectBus(bus)}
                    className="flex w-full items-center justify-between rounded-xl border border-[#dce4ed] bg-white p-3.5 text-left transition hover:border-[#4e9de3] hover:bg-[#eef7ff]"
                  >
                    <div className="flex items-center gap-3">
                      <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-[#0758a6] text-xs font-extrabold text-white">
                        {pad2(bus.number)}
                      </span>
                      <div className="min-w-0">
                        <p className="truncate text-sm font-bold text-[#17263d]">{bus.route}</p>
                        <p className="text-xs font-semibold text-[#0758a6]">
                          Position {pad2(bus.position!)}
                        </p>
                      </div>
                    </div>
                    <div className="flex shrink-0 items-center gap-1.5 text-xs font-bold text-[#0758a6]">
                      <span>View details</span>
                      <ArrowRight size={14} />
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Dialog Footer */}
        <div className="border-t border-[#eef2f6] bg-[#fbfcfd] p-4">
          <button
            onClick={onClose}
            className="w-full rounded-xl bg-[#0758a6] py-3 text-sm font-bold text-white transition hover:bg-[#064984]"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  )
}
