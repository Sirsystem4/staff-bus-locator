'use client'

import { useEffect, useRef, useState } from 'react'
import { ArrowLeft, Check, Database, KeyRound, Pencil, Plus, ShieldCheck, Trash2, TriangleAlert, X } from 'lucide-react'

import { verifySuperAdminAccessCode } from '@/app/actions/auth'
import { createBus, deleteBus, getBuses, updateBusRoute } from '@/app/actions/buses'
import { addZone, deleteZone, getLayout, updateZone } from '@/app/actions/zones'
import { supabase } from '@/lib/supabase/client'
import {
  formatLocation,
  nextBusNumber,
  pad2,
  validateBus,
  type Bus,
  type BusDraft,
} from '@/lib/buses'
import { MAX_POSITIONS_PER_ZONE, type Layout, type Zone } from '@/lib/layout'

const blankDraft = (number: number): BusDraft => ({ number, route: '' })
const blankZone = (): Zone => ({ name: '', positions: 20 })

type ScrollTarget = React.RefObject<HTMLElement | HTMLFormElement | null>
type FieldTarget = React.RefObject<HTMLInputElement | null>

export default function SuperAdminPanel({ initialBuses, initialLayout }: { initialBuses: Bus[]; initialLayout: Layout }) {
  const [buses, setBuses] = useState<Bus[]>(initialBuses)
  const [layout, setLayout] = useState<Layout>(initialLayout)
  const [unlocked, setUnlocked] = useState(false)
  const [code, setCode] = useState('')
  const [authError, setAuthError] = useState('')
  const [verifying, setVerifying] = useState(false)

  // Real-time synchronization via Supabase Postgres changes
  useEffect(() => {
    const channel = supabase
      .channel('super-admin-realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'buses' }, async () => {
        const fresh = await getBuses()
        setBuses(fresh)
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'zones' }, async () => {
        const fresh = await getLayout()
        setLayout(fresh)
      })
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [])

  const [editing, setEditing] = useState<number | null>(null)
  const [draft, setDraft] = useState<BusDraft>(blankDraft(nextBusNumber(initialBuses)))
  const [formError, setFormError] = useState('')
  const [notice, setNotice] = useState('')
  const [busy, setBusy] = useState(false)
  const [pendingDelete, setPendingDelete] = useState<number | null>(null)

  const [zoneDraft, setZoneDraft] = useState<Zone>(blankZone())
  const [editingZone, setEditingZone] = useState<string | null>(null)
  const [zoneError, setZoneError] = useState('')
  const [zoneNotice, setZoneNotice] = useState('')
  const [zoneBusy, setZoneBusy] = useState(false)
  const [pendingZoneDelete, setPendingZoneDelete] = useState<string | null>(null)

  const busFormRef = useRef<HTMLElement>(null)
  const routeInputRef = useRef<HTMLInputElement>(null)
  const zoneFormRef = useRef<HTMLFormElement>(null)
  const zoneNameInputRef = useRef<HTMLInputElement>(null)

  const revealForm = (section: ScrollTarget, field?: FieldTarget) => {
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    section.current?.scrollIntoView({ behavior: reduced ? 'auto' : 'smooth', block: 'center' })
    // preventScroll keeps the focus from cancelling the smooth scroll above.
    field?.current?.focus({ preventScroll: true })
  }

  const busesInZone = (name: string) => buses.filter((bus) => bus.zone === name).length

  const unlock = async (event: React.FormEvent) => {
    event.preventDefault()
    if (verifying) return
    setAuthError('')
    setVerifying(true)
    const granted = await verifySuperAdminAccessCode(code)
    setVerifying(false)
    if (!granted) {
      setAuthError('That super admin code is not correct.')
      setCode('')
      return
    }
    setCode('')
    setUnlocked(true)
  }

  const startAdd = () => {
    setEditing(null)
    setDraft(blankDraft(nextBusNumber(buses)))
    setFormError('')
    setNotice('')
  }

  const startEdit = (bus: Bus) => {
    setEditing(bus.number)
    setDraft({ ...bus })
    setFormError('')
    setNotice('')
    revealForm(busFormRef, routeInputRef)
  }

  const submit = async (event: React.FormEvent) => {
    event.preventDefault()
    if (busy) return
    setNotice('')

    const others = buses.filter((bus) => bus.number !== (editing ?? draft.number)).map((bus) => bus.number)
    const problem = validateBus(draft, others)
    if (problem) {
      setFormError(problem)
      return
    }

    setBusy(true)
    const result = editing === null ? await createBus(draft) : await updateBusRoute(draft)
    setBusy(false)

    if (!result.ok) {
      setFormError(result.error)
      return
    }

    setBuses(result.buses)
    setFormError('')
    setNotice(
      editing === null
        ? `Bus ${pad2(draft.number)} added. A transport admin still needs to record where it is parked.`
        : `Bus ${pad2(draft.number)} updated.`,
    )
    startAdd()
  }

  const remove = async (number: number) => {
    if (busy) return
    setBusy(true)
    const result = await deleteBus(number)
    setBusy(false)
    setPendingDelete(null)
    setNotice('')

    if (!result.ok) {
      setFormError(result.error)
      return
    }
    setBuses(result.buses)
    setNotice(`Bus ${pad2(number)} removed.`)
    if (editing === number) startAdd()
  }

  const resetZoneForm = () => {
    setEditingZone(null)
    setZoneDraft(blankZone())
    setZoneError('')
  }

  const startEditZone = (zone: Zone) => {
    setEditingZone(zone.name)
    setZoneDraft({ ...zone })
    setZoneError('')
    revealForm(zoneFormRef, zoneNameInputRef)
  }

  const submitZone = async (event: React.FormEvent) => {
    event.preventDefault()
    if (zoneBusy) return
    setZoneNotice('')
    setZoneBusy(true)
    const result = editingZone === null ? await addZone(zoneDraft) : await updateZone(editingZone, zoneDraft)
    setZoneBusy(false)

    if (!result.ok) {
      setZoneError(result.error)
      return
    }

    setLayout(result.layout)
    setBuses(result.buses)
    setZoneError('')
    setZoneNotice(
      editingZone === null
        ? `Zone "${zoneDraft.name.trim()}" added. Transport admins can now park buses there.`
        : result.affected > 0
          ? `Zone "${zoneDraft.name.trim()}" updated. ${result.affected} bus${result.affected === 1 ? '' : 'es'} moved or marked as not parked.`
          : `Zone "${zoneDraft.name.trim()}" updated.`,
    )
    resetZoneForm()
  }

  const removeZone = async (name: string) => {
    if (zoneBusy) return
    setZoneBusy(true)
    const result = await deleteZone(name)
    setZoneBusy(false)
    setPendingZoneDelete(null)
    setZoneNotice('')

    if (!result.ok) {
      setZoneError(result.error)
      return
    }
    setLayout(result.layout)
    setBuses(result.buses)
    setZoneError('')
    setZoneNotice(
      result.affected > 0
        ? `Zone "${name}" removed. ${result.affected} bus${result.affected === 1 ? ' was' : 'es were'} marked as not parked.`
        : `Zone "${name}" removed.`,
    )
    if (editingZone === name) resetZoneForm()
  }

  if (!unlocked) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-[#f5f7fa] p-5 text-[#17263d]">
        <form onSubmit={unlock} className="w-full max-w-sm rounded-2xl border border-[#dce4ed] bg-white p-7 shadow-[0_8px_30px_rgba(21,34,56,0.05)]">
          <div className="mb-4 flex size-11 items-center justify-center rounded-xl bg-[#e9f2fc] text-[#0758a6]"><ShieldCheck size={22} /></div>
          <h1 className="text-xl font-bold">Super admin access</h1>
          <p className="mt-1 text-sm text-[#718095]">The bus register can only be changed with the super admin code.</p>

          <label className="mt-6 block text-sm font-bold">
            Super admin code
            <input
              autoFocus
              value={code}
              onChange={(e) => { setCode(e.target.value.replace(/\D/g, '').slice(0, 4)); setAuthError('') }}
              inputMode="numeric"
              autoComplete="off"
              maxLength={4}
              placeholder="••••"
              aria-invalid={authError ? true : undefined}
              className={`mt-2 w-full rounded-xl border bg-white px-3 py-3 text-center text-2xl font-bold tracking-[0.5em] outline-none ${authError ? 'border-[#d9534f]' : 'border-[#d6e0ea] focus:border-[#4e9de3]'}`}
            />
          </label>

          {authError && <p role="alert" className="mt-2 text-sm font-semibold text-[#c0392b]">{authError}</p>}

          <button type="submit" disabled={code.length !== 4 || verifying} className="mt-5 flex w-full items-center justify-center gap-2 rounded-xl bg-[#0758a6] py-3 text-sm font-bold text-white hover:bg-[#064984] disabled:cursor-not-allowed disabled:opacity-40">
            <KeyRound size={16} /> {verifying ? 'Checking...' : 'Unlock bus register'}
          </button>

          <a href="/" className="mt-4 flex items-center justify-center gap-1.5 text-sm font-semibold text-[#6b7a8d] hover:text-[#0758a6]"><ArrowLeft size={15} /> Back to bus finder</a>
        </form>
      </main>
    )
  }

  const parked = buses.filter((bus) => bus.zone !== null).length
  const zoneCounts = layout.zones.map((zone) => ({ ...zone, count: busesInZone(zone.name) }))
  const totalPositions = layout.zones.reduce((sum, zone) => sum + zone.positions, 0)

  return (
    <main className="min-h-screen bg-[#f5f7fa] text-[#17263d]">
      <header className="border-b border-[#dce4ed] bg-white">
        <div className="mx-auto flex max-w-[1180px] flex-wrap items-center justify-between gap-3 px-5 py-4 lg:px-8">
          <div className="flex items-center gap-3">
            <div className="flex size-10 items-center justify-center rounded-xl bg-[#0758a6] text-white"><ShieldCheck size={22} /></div>
            <div>
              <p className="text-lg font-bold tracking-tight">Super admin · Bus register</p>
              <p className="text-xs text-[#738297]">Add, edit and remove staff buses</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <span className="hidden items-center gap-1.5 rounded-lg border border-[#bbf7d0] bg-[#f0fdf4] px-3 py-2 text-sm font-semibold text-[#166534] sm:flex" title="Directly synced with Supabase PostgreSQL">
              <span className="size-2.5 rounded-full bg-[#22c55e] animate-pulse" /> Supabase connected
            </span>
            <span className="flex items-center gap-1.5 rounded-lg border border-[#dce4ed] px-3 py-2 text-sm font-semibold text-[#516176]">
              <span className="size-2.5 rounded-full bg-[#28aa70]" /> Unlocked
            </span>
            <button onClick={() => setUnlocked(false)} className="rounded-lg border border-[#dce4ed] px-3 py-2 text-sm font-semibold text-[#516176] hover:bg-[#f5f7fa]">Lock</button>
            <a href="/" className="flex items-center gap-1.5 rounded-lg bg-[#0758a6] px-3 py-2 text-sm font-bold text-white hover:bg-[#064984]"><ArrowLeft size={15} /> Staff view</a>
          </div>
        </div>
      </header>

      <div className="mx-auto max-w-[1180px] px-5 py-8 lg:px-8">
        <div className="mb-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <div className="rounded-2xl border border-[#dce4ed] bg-white p-4">
            <p className="text-xs font-bold uppercase tracking-wider text-[#8290a1]">Buses on register</p>
            <p className="mt-1 text-2xl font-extrabold text-[#0758a6]">{buses.length}</p>
          </div>
          <div className="rounded-2xl border border-[#dce4ed] bg-white p-4">
            <p className="text-xs font-bold uppercase tracking-wider text-[#8290a1]">Awaiting location</p>
            <p className={`mt-1 text-2xl font-extrabold ${buses.length - parked > 0 ? 'text-[#b8860b]' : 'text-[#0758a6]'}`}>{buses.length - parked}</p>
            <p className="mt-0.5 text-[11px] text-[#8290a1]">Transport admin to place</p>
          </div>
          <div className="rounded-2xl border border-[#dce4ed] bg-white p-4">
            <p className="text-xs font-bold uppercase tracking-wider text-[#8290a1]">Zones defined</p>
            <p className="mt-1 text-2xl font-extrabold text-[#0758a6]">{layout.zones.length}</p>
            <p className="mt-0.5 text-[11px] text-[#8290a1]">{totalPositions} positions total</p>
          </div>
          <div className="rounded-2xl border border-[#dce4ed] bg-white p-4">
            <p className="text-xs font-bold uppercase tracking-wider text-[#8290a1]">Next free number</p>
            <p className="mt-1 text-2xl font-extrabold text-[#0758a6]">{pad2(nextBusNumber(buses))}</p>
          </div>
        </div>

        {notice && <p role="status" className="mb-4 flex items-center gap-2 rounded-xl border border-[#bfe4d1] bg-[#e9f7f0] px-4 py-3 text-sm font-semibold text-[#218d5e]"><Check size={16} /> {notice}</p>}

        <div className="grid gap-6 lg:grid-cols-[360px_minmax(0,1fr)]">
          <section ref={busFormRef} className="rounded-2xl border border-[#dce4ed] bg-white p-6 shadow-[0_8px_30px_rgba(21,34,56,0.05)]">
            <div className="mb-1 flex items-center justify-between">
              <h2 className="font-bold">{editing === null ? 'Add a bus' : `Edit bus ${pad2(editing)}`}</h2>
              {editing !== null && <button onClick={startAdd} className="flex items-center gap-1 text-xs font-bold text-[#6b7a8d] hover:text-[#0758a6]"><X size={14} /> Cancel</button>}
            </div>
            <p className="mb-5 text-xs leading-5 text-[#7a899b]">Super admin registers the bus and its route. Zone and position are recorded daily by transport admins.</p>

            <form onSubmit={submit} className="space-y-4">
              <label className="block text-sm font-bold">
                Bus number
                <input
                  type="number"
                  min={1}
                  disabled={editing !== null}
                  value={draft.number || ''}
                  onChange={(e) => setDraft({ ...draft, number: Number(e.target.value) })}
                  className="mt-2 w-full rounded-xl border border-[#d6e0ea] bg-white px-3 py-2.5 text-sm outline-none focus:border-[#4e9de3] disabled:bg-[#f4f6f9] disabled:text-[#8290a1]"
                />
                {editing !== null && <span className="mt-1 block text-xs font-normal text-[#8290a1]">The bus number identifies the record and cannot be changed.</span>}
              </label>

              <label className="block text-sm font-bold">
                Route name
                <input
                  ref={routeInputRef}
                  value={draft.route}
                  onChange={(e) => setDraft({ ...draft, route: e.target.value })}
                  placeholder="e.g. AGEGE"
                  maxLength={40}
                  className="mt-2 w-full rounded-xl border border-[#d6e0ea] bg-white px-3 py-2.5 text-sm outline-none focus:border-[#4e9de3]"
                />
              </label>

              {formError && <p role="alert" className="flex items-start gap-1.5 rounded-lg bg-[#fdecea] px-3 py-2 text-sm font-semibold text-[#c0392b]"><TriangleAlert size={15} className="mt-0.5 shrink-0" /> {formError}</p>}

              <button type="submit" disabled={busy} className="flex w-full items-center justify-center gap-2 rounded-xl bg-[#0758a6] py-3 text-sm font-bold text-white hover:bg-[#064984] disabled:opacity-50">
                {editing === null ? <><Plus size={17} /> Add bus</> : <><Check size={17} /> Save changes</>}
              </button>
            </form>
          </section>

          <section className="rounded-2xl border border-[#dce4ed] bg-white p-6 shadow-[0_8px_30px_rgba(21,34,56,0.05)]">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="font-bold">Bus register</h2>
              <span className="text-xs font-semibold text-[#8190a2]">{buses.length} buses</span>
            </div>

            {buses.length === 0 ? (
              <p className="rounded-xl bg-[#f7f9fb] p-8 text-center text-sm text-[#6f7e91]">No buses yet. Use the form to add the first one.</p>
            ) : (
              <ul className="divide-y divide-[#eef2f6]">
                {buses.map((bus) => (
                  <li key={bus.number} className="flex flex-wrap items-center justify-between gap-3 py-3">
                    <div className="flex items-center gap-3">
                      <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-[#0758a6] text-xs font-extrabold text-white">{pad2(bus.number)}</span>
                      <div>
                        <p className="text-sm font-bold">{bus.route}</p>
                        <p className={`text-xs ${bus.zone === null ? 'font-semibold text-[#b8860b]' : 'text-[#8592a1]'}`}>{formatLocation(bus)}</p>
                      </div>
                    </div>

                    {pendingDelete === bus.number ? (
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-semibold text-[#c0392b]">Remove bus {pad2(bus.number)}?</span>
                        <button onClick={() => remove(bus.number)} className="rounded-lg bg-[#c0392b] px-2.5 py-1.5 text-xs font-bold text-white hover:bg-[#a93226]">Yes, remove</button>
                        <button onClick={() => setPendingDelete(null)} className="rounded-lg border border-[#dce4ed] px-2.5 py-1.5 text-xs font-bold text-[#516176] hover:bg-[#f5f7fa]">Cancel</button>
                      </div>
                    ) : (
                      <div className="flex items-center gap-1.5">
                        <button onClick={() => startEdit(bus)} aria-label={`Edit bus ${pad2(bus.number)}`} className="rounded-lg border border-[#dce4ed] p-2 text-[#516176] hover:bg-[#edf4fb] hover:text-[#0758a6]"><Pencil size={15} /></button>
                        <button onClick={() => setPendingDelete(bus.number)} aria-label={`Remove bus ${pad2(bus.number)}`} className="rounded-lg border border-[#dce4ed] p-2 text-[#516176] hover:bg-[#fdecea] hover:text-[#c0392b]"><Trash2 size={15} /></button>
                      </div>
                    )}
                  </li>
                ))}
              </ul>
            )}

            <div className="mt-5 grid grid-cols-3 gap-2 border-t border-[#eef2f6] pt-4 sm:grid-cols-6">
              {zoneCounts.map(({ name, count, positions }) => (
                <div key={name} className="rounded-lg bg-[#f4f7fa] px-2 py-2 text-center">
                  <p className="text-[10px] font-bold uppercase tracking-wider text-[#7c8b9c]">Zone {name}</p>
                  <p className="text-sm font-extrabold text-[#0758a6]">{count}<span className="text-[10px] font-semibold text-[#8b98a8]"> / {positions}</span></p>
                </div>
              ))}
            </div>
          </section>
        </div>

        <section className="mt-6 rounded-2xl border border-[#dce4ed] bg-white p-6 shadow-[0_8px_30px_rgba(21,34,56,0.05)]">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <h2 className="text-lg font-bold">Car park layout</h2>
              <p className="mt-1 text-sm text-[#718095]">The zones and positions transport admins can choose from. Removing a zone marks its buses as not parked.</p>
            </div>
            <span className="rounded-lg bg-[#edf4fb] px-3 py-2 text-xs font-bold text-[#0758a6]">{layout.zones.length} zones · {totalPositions} positions</span>
          </div>

          {zoneNotice && <p role="status" className="mt-4 flex items-center gap-2 rounded-xl border border-[#bfe4d1] bg-[#e9f7f0] px-4 py-3 text-sm font-semibold text-[#218d5e]"><Check size={16} /> {zoneNotice}</p>}

          <div className="mt-5 grid gap-6 lg:grid-cols-[320px_minmax(0,1fr)]">
            <form ref={zoneFormRef} onSubmit={submitZone} className="rounded-xl border border-[#dce4ed] bg-[#f9fbfc] p-4">
              <div className="mb-4 flex items-center justify-between">
                <h3 className="text-sm font-bold">{editingZone === null ? 'Add a zone' : `Edit zone ${editingZone}`}</h3>
                {editingZone !== null && <button type="button" onClick={resetZoneForm} className="flex items-center gap-1 text-xs font-bold text-[#6b7a8d] hover:text-[#0758a6]"><X size={14} /> Cancel</button>}
              </div>

              <label className="block text-sm font-bold">
                Zone name
                <input
                  ref={zoneNameInputRef}
                  value={zoneDraft.name}
                  onChange={(e) => { setZoneDraft({ ...zoneDraft, name: e.target.value }); setZoneError('') }}
                  placeholder="e.g. A or NORTH"
                  maxLength={12}
                  className="mt-2 w-full rounded-xl border border-[#d6e0ea] bg-white px-3 py-2.5 text-sm uppercase outline-none focus:border-[#4e9de3]"
                />
                <span className="mt-1 block text-xs font-normal text-[#8290a1]">Shown on the car park signs and used by admins when parking a bus.</span>
              </label>

              <label className="mt-4 block text-sm font-bold">
                Number of positions
                <input
                  type="number"
                  min={1}
                  max={MAX_POSITIONS_PER_ZONE}
                  value={zoneDraft.positions || ''}
                  onChange={(e) => { setZoneDraft({ ...zoneDraft, positions: Number(e.target.value) }); setZoneError('') }}
                  className="mt-2 w-full rounded-xl border border-[#d6e0ea] bg-white px-3 py-2.5 text-sm outline-none focus:border-[#4e9de3]"
                />
                <span className="mt-1 block text-xs font-normal text-[#8290a1]">Positions are numbered 01 to this number.</span>
              </label>

              {zoneError && <p role="alert" className="mt-3 flex items-start gap-1.5 rounded-lg bg-[#fdecea] px-3 py-2 text-sm font-semibold text-[#c0392b]"><TriangleAlert size={15} className="mt-0.5 shrink-0" /> {zoneError}</p>}

              <button type="submit" disabled={zoneBusy} className="mt-4 flex w-full items-center justify-center gap-2 rounded-xl bg-[#0758a6] py-2.5 text-sm font-bold text-white hover:bg-[#064984] disabled:opacity-50">
                {editingZone === null ? <><Plus size={16} /> Add zone</> : <><Check size={16} /> Save zone</>}
              </button>
            </form>

            <div>
              {layout.zones.length === 0 ? (
                <p className="rounded-xl bg-[#f7f9fb] p-8 text-center text-sm text-[#6f7e91]">No zones defined yet.</p>
              ) : (
                <ul className="divide-y divide-[#eef2f6]">
                  {layout.zones.map((zone) => {
                    const parkedHere = busesInZone(zone.name)
                    const overCapacity = parkedHere > zone.positions
                    return (
                      <li key={zone.name} className="flex flex-wrap items-center justify-between gap-3 py-3">
                        <div className="flex items-center gap-3">
                          <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-[#0758a6] text-sm font-extrabold text-white">{zone.name}</span>
                          <div>
                            <p className="text-sm font-bold">{zone.positions} positions</p>
                            <p className="text-xs text-[#8592a1]">{parkedHere} bus{parkedHere === 1 ? '' : 'es'} parked here{overCapacity && <span className="ml-1 font-semibold text-[#c0392b]">· over capacity</span>}</p>
                          </div>
                        </div>

                        {pendingZoneDelete === zone.name ? (
                          <div className="flex items-center gap-2">
                            <span className="text-xs font-semibold text-[#c0392b]">
                              {parkedHere > 0 ? `Remove zone and un-park ${parkedHere} bus${parkedHere === 1 ? '' : 'es'}?` : `Remove zone ${zone.name}?`}
                            </span>
                            <button onClick={() => removeZone(zone.name)} disabled={zoneBusy} className="rounded-lg bg-[#c0392b] px-2.5 py-1.5 text-xs font-bold text-white hover:bg-[#a93226]">Yes, remove</button>
                            <button onClick={() => setPendingZoneDelete(null)} className="rounded-lg border border-[#dce4ed] px-2.5 py-1.5 text-xs font-bold text-[#516176] hover:bg-[#f5f7fa]">Cancel</button>
                          </div>
                        ) : (
                          <div className="flex items-center gap-1.5">
                            <button onClick={() => startEditZone(zone)} aria-label={`Edit zone ${zone.name}`} className="rounded-lg border border-[#dce4ed] p-2 text-[#516176] hover:bg-[#edf4fb] hover:text-[#0758a6]"><Pencil size={15} /></button>
                            <button onClick={() => setPendingZoneDelete(zone.name)} aria-label={`Remove zone ${zone.name}`} disabled={layout.zones.length <= 1} className="rounded-lg border border-[#dce4ed] p-2 text-[#516176] hover:bg-[#fdecea] hover:text-[#c0392b] disabled:opacity-40"><Trash2 size={15} /></button>
                          </div>
                        )}
                      </li>
                    )
                  })}
                </ul>
              )}

              <p className="mt-4 rounded-lg bg-[#f7f9fb] px-3 py-2 text-xs leading-5 text-[#6f7e91]">
                Renaming a zone moves every bus parked there. Reducing its positions marks any bus beyond the new last position as not parked.
              </p>
            </div>
          </div>
        </section>
      </div>
    </main>
  )
}
