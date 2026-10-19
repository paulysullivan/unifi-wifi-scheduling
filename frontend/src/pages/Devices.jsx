import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { listDevices, syncDevices, updateDevice } from '../api/devices'
import { listGroups, getGroup, setGroupDevices, removeDeviceFromGroup } from '../api/groups'
import DeviceTable, { isPrivateMac } from '../components/DeviceTable'

const ACTIVITY_OPTIONS = [
  { value: '1', label: 'Last 24 hours' },
  { value: '7', label: 'Last 7 days' },
  { value: '30', label: 'Last 30 days' },
  { value: 'all', label: 'All history' },
]

export default function Devices() {
  const queryClient = useQueryClient()
  const [search, setSearch] = useState('')
  const [activity, setActivity] = useState('7')
  const [selectedDevice, setSelectedDevice] = useState(null)

  const { data: devices = [], isLoading } = useQuery({
    queryKey: ['devices'],
    queryFn: () => listDevices(),
  })

  const { data: groups = [] } = useQuery({
    queryKey: ['groups'],
    queryFn: listGroups,
  })

  const syncMutation = useMutation({
    mutationFn: syncDevices,
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['devices'] })
      alert(`Found ${data.devices_found} devices (${data.new_devices} new, ${data.updated_devices} updated)`)
    },
    onError: (err) => {
      alert(err.response?.data?.detail || 'Sync failed')
    },
  })

  const updateMutation = useMutation({
    mutationFn: ({ mac, data }) => updateDevice(mac, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['devices'] })
      setSelectedDevice(null)
    },
  })

  const cutoff = activity === 'all' ? null : Date.now() - Number(activity) * 86400000

  const filtered = devices.filter((d) => {
    if (cutoff != null && !(d.last_seen && new Date(d.last_seen).getTime() >= cutoff)) {
      return false
    }
    const q = search.toLowerCase()
    return (
      !q ||
      d.name?.toLowerCase().includes(q) ||
      d.mac.toLowerCase().includes(q) ||
      d.vendor?.toLowerCase().includes(q) ||
      d.hostname?.toLowerCase().includes(q) ||
      d.ip?.includes(q)
    )
  })

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold">Devices</h1>
        <button
          onClick={() => syncMutation.mutate()}
          disabled={syncMutation.isPending}
          className="px-4 py-2 text-sm bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-50 transition"
        >
          {syncMutation.isPending ? 'Syncing...' : 'Sync from Network'}
        </button>
      </div>

      <div className="flex flex-col sm:flex-row gap-2 mb-4">
        <input
          type="text"
          placeholder="Search devices..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="flex-1 border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none"
        />
        <select
          value={activity}
          onChange={(e) => setActivity(e.target.value)}
          aria-label="Activity filter"
          className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none"
        >
          {ACTIVITY_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      </div>
      {activity !== 'all' && !isLoading && filtered.length < devices.length && (
        <p className="text-xs text-gray-500 mb-3">
          Showing recently active devices.{' '}
          <button
            type="button"
            onClick={() => setActivity('all')}
            className="text-indigo-600 hover:underline"
          >
            Show full history ({devices.length} devices)
          </button>
        </p>
      )}

      {isLoading ? (
        <p className="text-gray-400 text-sm">Loading...</p>
      ) : (
        <DeviceTable devices={filtered} onEdit={setSelectedDevice} />
      )}

      {/* Device edit panel */}
      {selectedDevice && (
        <DeviceEditPanel
          device={selectedDevice}
          groups={groups}
          onClose={() => setSelectedDevice(null)}
          onSave={(name) => {
            updateMutation.mutate({ mac: selectedDevice.mac, data: { name } })
          }}
          onGroupChange={async (groupId, mac, add) => {
            if (add) {
              const group = await getGroup(groupId)
              const currentMacs = group.devices?.map((d) => d.mac) || []
              if (!currentMacs.includes(mac)) {
                await setGroupDevices(groupId, [...currentMacs, mac])
              }
            } else {
              await removeDeviceFromGroup(groupId, mac)
            }
            queryClient.invalidateQueries({ queryKey: ['devices'] })
            queryClient.invalidateQueries({ queryKey: ['groups'] })
          }}
        />
      )}
    </div>
  )
}

function DeviceEditPanel({ device, groups, onClose, onSave, onGroupChange }) {
  const [name, setName] = useState(device.name || '')

  const toggleGroup = (group) => {
    const isInGroup = device.groups.includes(group.name)
    // We need to get current group members and add/remove this device
    // For simplicity, use the setGroupDevices endpoint per group
    if (isInGroup) {
      // Remove from group: we need the group's current macs minus this device
      // We'll use the onGroupChange callback which calls setGroupDevices
      onGroupChange(group.id, device.mac, false)
    } else {
      onGroupChange(group.id, device.mac, true)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/50">
      <div className="bg-white rounded-t-xl sm:rounded-xl shadow-xl w-full sm:max-w-md mx-0 sm:mx-4 p-6 max-h-[80vh] overflow-y-auto">
        <div className="flex justify-between items-center mb-4">
          <h3 className="text-lg font-semibold">Edit Device</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
            &times;
          </button>
        </div>

        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Name</label>
            <div className="flex gap-2">
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="flex-1 border border-gray-300 rounded-lg px-3 py-2 text-sm"
              />
              <button
                onClick={() => onSave(name)}
                className="px-3 py-2 text-sm bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition"
              >
                Save
              </button>
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">MAC</label>
            <p className="text-sm text-gray-500 font-mono">{device.mac}</p>
            {device.vendor && <p className="text-xs text-gray-500 mt-1">{device.vendor}</p>}
            {isPrivateMac(device.mac) && (
              <p className="text-xs text-purple-700 mt-1">
                Likely a private (randomized) address. It may change, which can defeat MAC-based blocking.
              </p>
            )}
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">IP</label>
            <p className="text-sm text-gray-500">{device.ip || '—'}</p>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Groups
            </label>
            {groups.length > 0 ? (
              <div className="space-y-1.5">
                {groups.map((g) => {
                  const isInGroup = device.groups.includes(g.name)
                  return (
                    <label
                      key={g.id}
                      className="flex items-center gap-2.5 cursor-pointer hover:bg-gray-50 rounded-lg px-2 py-1.5 -mx-2"
                    >
                      <input
                        type="checkbox"
                        checked={isInGroup}
                        onChange={() => toggleGroup(g)}
                        className="rounded border-gray-300"
                      />
                      <div
                        className="w-2.5 h-2.5 rounded-full flex-shrink-0"
                        style={{ backgroundColor: g.color || '#4f46e5' }}
                      />
                      <span className="text-sm">{g.name}</span>
                    </label>
                  )
                })}
              </div>
            ) : (
              <p className="text-sm text-gray-400">No groups created yet</p>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
