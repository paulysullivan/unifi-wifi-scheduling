import { useMemo, useState } from 'react'
import { formatDistanceToNow } from 'date-fns'

const sortValue = {
  name: (d) => d.name || d.hostname || d.mac,
  mac: (d) => d.mac,
  ip: (d) => d.ip,
  connection: (d) => (d.is_wired == null ? null : d.is_wired ? 'Wired' : 'WiFi'),
  network: (d) => d.network,
  groups: (d) => d.groups.join(', '),
  last_seen: (d) => (d.last_seen ? new Date(d.last_seen).getTime() : null),
}

function compareValues(a, b) {
  if (typeof a === 'number' && typeof b === 'number') return a - b
  return String(a).localeCompare(String(b), undefined, { numeric: true, sensitivity: 'base' })
}

export default function DeviceTable({ devices, onEdit, compact = false }) {
  const [sort, setSort] = useState({ key: null, dir: 'asc' })

  const sorted = useMemo(() => {
    if (!sort.key || !devices) return devices
    const get = sortValue[sort.key]
    const sign = sort.dir === 'asc' ? 1 : -1
    return [...devices].sort((a, b) => {
      const va = get(a)
      const vb = get(b)
      // Empty values always sort last, regardless of direction
      if (va == null || va === '') return vb == null || vb === '' ? 0 : 1
      if (vb == null || vb === '') return -1
      return sign * compareValues(va, vb)
    })
  }, [devices, sort])

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
            {!compact && header('ip', 'IP', 'hidden sm:table-cell')}
            {!compact && header('connection', 'Connection', 'hidden sm:table-cell')}
            {!compact && header('network', 'Network / VLAN', 'hidden md:table-cell')}
            {header('groups', 'Group(s)')}
            {!compact && header('last_seen', 'Last Seen', 'hidden md:table-cell')}
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100">
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
                  </span>
                )}
              </td>
              {!compact && (
                <td className="py-2.5 pr-3 text-gray-500 font-mono text-xs">
                  {device.mac}
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
