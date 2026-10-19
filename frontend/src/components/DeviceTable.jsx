import { useMemo, useState } from 'react'
import { formatDistanceToNow } from 'date-fns'

const sortValue = {
  name: (d) => d.name || d.hostname || d.mac,
  mac: (d) => d.mac,
  ip: (d) => d.ip,
  vendor: (d) => d.vendor,
  connection: (d) => (d.is_wired == null ? null : d.is_wired ? 'Wired' : 'WiFi'),
  network: (d) => d.network,
  groups: (d) => d.groups.join(', '),
  last_seen: (d) => (d.last_seen ? new Date(d.last_seen).getTime() : null),
}

// Locally administered bit (0x02) in the first octet marks a randomized/private MAC
export const isPrivateMac = (mac) => {
  const first = parseInt(mac?.slice(0, 2), 16)
  return Number.isInteger(first) && (first & 0x02) !== 0
}

const connectionLabel = (d) => (d.is_wired == null ? '' : d.is_wired ? 'Wired' : 'WiFi')

// Text filters match a substring; select filters match the exact value
const filterValue = {
  name: (d) => d.name || d.hostname || d.mac,
  mac: (d) => d.mac,
  vendor: (d) => d.vendor || (isPrivateMac(d.mac) ? 'Private MAC' : ''),
  ip: (d) => d.ip,
  connection: connectionLabel,
  network: (d) => d.network || '',
  groups: (d) => (d.groups.length ? d.groups : ['Unassigned']),
}
const selectFilters = ['vendor', 'connection', 'network', 'groups']

function compareValues(a, b) {
  if (typeof a === 'number' && typeof b === 'number') return a - b
  return String(a).localeCompare(String(b), undefined, { numeric: true, sensitivity: 'base' })
}

export default function DeviceTable({ devices, onEdit, compact = false }) {
  const [sort, setSort] = useState({ key: null, dir: 'asc' })
  const [filters, setFilters] = useState({})
  const setFilter = (key, value) => setFilters((prev) => ({ ...prev, [key]: value }))
  const activeFilters = Object.entries(filters).filter(([, v]) => v)

  const options = useMemo(() => {
    const out = {}
    for (const key of selectFilters) {
      const values = new Set()
      for (const d of devices || []) {
        for (const v of [].concat(filterValue[key](d))) if (v) values.add(v)
      }
      out[key] = [...values].sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' }))
    }
    return out
  }, [devices])

  const filtered = useMemo(() => {
    if (!devices || !activeFilters.length) return devices
    return devices.filter((d) =>
      activeFilters.every(([key, want]) => {
        const have = [].concat(filterValue[key](d))
        return selectFilters.includes(key)
          ? have.includes(want)
          : have.some((v) => String(v ?? '').toLowerCase().includes(want.toLowerCase()))
      })
    )
  }, [devices, filters])

  const sorted = useMemo(() => {
    if (!sort.key || !filtered) return filtered
    const get = sortValue[sort.key]
    const sign = sort.dir === 'asc' ? 1 : -1
    return [...filtered].sort((a, b) => {
      const va = get(a)
      const vb = get(b)
      // Empty values always sort last, regardless of direction
      if (va == null || va === '') return vb == null || vb === '' ? 0 : 1
      if (vb == null || vb === '') return -1
      return sign * compareValues(va, vb)
    })
  }, [filtered, sort])

  const toggleSort = (key) =>
    setSort((prev) =>
      prev.key === key ? { key, dir: prev.dir === 'asc' ? 'desc' : 'asc' } : { key, dir: 'asc' }
    )

  const header = (key, label, className = '') => (
    <th
      className={`pb-2 font-medium ${className}`}
      aria-sort={sort.key === key ? (sort.dir === 'asc' ? 'ascending' : 'descending') : 'none'}
    >
      {compact ? (
        label
      ) : (
        <button
          type="button"
          onClick={() => toggleSort(key)}
          className="inline-flex items-center gap-1 font-medium hover:text-gray-900"
        >
          {label}
          <span className="text-xs text-gray-400">
            {sort.key === key ? (sort.dir === 'asc' ? '▲' : '▼') : '↕'}
          </span>
        </button>
      )}
    </th>
  )
  const filterCell = (key, className = '') => {
    const inputClass =
      'w-full border border-gray-200 rounded px-1.5 py-1 text-xs font-normal text-gray-700 focus:ring-1 focus:ring-indigo-500 outline-none'
    return (
      <th className={`pb-2 pr-3 ${className}`}>
        {selectFilters.includes(key) ? (
          <select
            value={filters[key] || ''}
            onChange={(e) => setFilter(key, e.target.value)}
            aria-label={`Filter ${key}`}
            className={inputClass}
          >
            <option value="">All</option>
            {options[key].map((v) => (
              <option key={v} value={v}>
                {v}
              </option>
            ))}
          </select>
        ) : (
          <input
            type="text"
            value={filters[key] || ''}
            onChange={(e) => setFilter(key, e.target.value)}
            placeholder="Filter"
            aria-label={`Filter ${key}`}
            className={inputClass}
          />
        )}
      </th>
    )
  }

  if (!devices?.length) {
    return <p className="text-gray-400 text-sm py-4">No devices found</p>
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-gray-200 text-left text-gray-500">
            {header('name', 'Name')}
            {!compact && header('mac', 'MAC')}
            {!compact && header('vendor', 'Vendor', 'hidden lg:table-cell')}
            {!compact && header('ip', 'IP', 'hidden sm:table-cell')}
            {!compact && header('connection', 'Connection', 'hidden sm:table-cell')}
            {!compact && header('network', 'Network / VLAN', 'hidden md:table-cell')}
            {header('groups', 'Group(s)')}
            {!compact && header('last_seen', 'Last Seen', 'hidden md:table-cell')}
          </tr>
          {!compact && (
            <tr className="border-b border-gray-200">
              {filterCell('name')}
              {filterCell('mac')}
              {filterCell('vendor', 'hidden lg:table-cell')}
              {filterCell('ip', 'hidden sm:table-cell')}
              {filterCell('connection', 'hidden sm:table-cell')}
              {filterCell('network', 'hidden md:table-cell')}
              {filterCell('groups')}
              <th className="pb-2 hidden md:table-cell">
                {activeFilters.length > 0 && (
                  <button
                    type="button"
                    onClick={() => setFilters({})}
                    className="text-xs font-normal text-indigo-600 hover:underline"
                  >
                    Clear filters
                  </button>
                )}
              </th>
            </tr>
          )}
        </thead>
        <tbody className="divide-y divide-gray-100">
          {sorted.length === 0 && (
            <tr>
              <td colSpan={8} className="py-4 text-gray-400">
                No devices match the column filters
              </td>
            </tr>
          )}
          {sorted.map((device) => (
            <tr
              key={device.mac}
              onClick={() => onEdit?.(device)}
              className={`hover:bg-gray-50 transition ${onEdit ? 'cursor-pointer' : ''} ${
                device.groups.length === 0 ? 'bg-amber-50' : ''
              }`}
            >
              <td className="py-2.5 pr-3">
                <span className="font-medium text-gray-900">
                  {device.name || device.hostname || device.mac}
                </span>
                {compact && (
                  <span className="block text-xs text-gray-400 md:hidden">
                    {device.mac}
                    {isPrivateMac(device.mac) && ' · Private MAC'}
                  </span>
                )}
              </td>
              {!compact && (
                <td className="py-2.5 pr-3 text-gray-500 font-mono text-xs">
                  {device.mac}
                  {isPrivateMac(device.mac) && (
                    <span
                      title="Locally administered MAC: likely a private/randomized address, which can change and defeat MAC-based blocking"
                      className="ml-2 px-1.5 py-0.5 rounded bg-purple-100 text-purple-700 font-sans text-[10px] font-medium"
                    >
                      Private
                    </span>
                  )}
                </td>
              )}
              {!compact && (
                <td className="py-2.5 pr-3 text-gray-500 hidden lg:table-cell">
                  {device.vendor ||
                    (isPrivateMac(device.mac) ? (
                      <span className="text-xs text-gray-400">Private MAC</span>
                    ) : (
                      '—'
                    ))}
                </td>
              )}
              {!compact && (
                <td className="py-2.5 pr-3 text-gray-500 hidden sm:table-cell">
                  {device.ip || '—'}
                </td>
              )}
              {!compact && (
                <td className="py-2.5 pr-3 text-gray-600 hidden sm:table-cell">
                  {device.is_wired == null ? '—' : device.is_wired ? 'Wired' : 'WiFi'}
                </td>
              )}
              {!compact && (
                <td className="py-2.5 pr-3 text-gray-600 hidden md:table-cell">
                  {device.network || device.ssid || device.vlan != null ? (
                    <>
                      {device.network}
                      {device.ssid && (
                        <span className="block text-xs text-gray-400">SSID: {device.ssid}</span>
                      )}
                      {device.vlan != null && (
                        <span className="block text-xs text-gray-400">VLAN {device.vlan}</span>
                      )}
                    </>
                  ) : (
                    '—'
                  )}
                </td>
              )}
              <td className="py-2.5 pr-3">
                {device.groups.length > 0 ? (
                  <span className="text-gray-600">{device.groups.join(', ')}</span>
                ) : (
                  <span className="text-amber-600 text-xs">Unassigned</span>
                )}
              </td>
              {!compact && (
                <td className="py-2.5 text-gray-400 hidden md:table-cell">
                  {device.last_seen
                    ? formatDistanceToNow(new Date(device.last_seen), { addSuffix: true })
                    : '—'}
                </td>
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
