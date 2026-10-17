import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useSearchParams } from 'react-router-dom'
import {
  listGroups,
  createGroup,
  updateGroup,
  getGroup,
  deleteGroup,
  setGroupDevices,
  removeDeviceFromGroup,
  pauseGroup,
  unpauseGroup,
  getGroupLogs,
  getWlans,
} from '../api/groups'
import { listDevices } from '../api/devices'
import GroupCard from '../components/GroupCard'
import ConfirmDialog from '../components/ConfirmDialog'

export default function Groups() {
  const queryClient = useQueryClient()
  const [searchParams, setSearchParams] = useSearchParams()
  const selectedId = searchParams.get('id')
  const [showCreate, setShowCreate] = useState(false)
  const [deleteTarget, setDeleteTarget] = useState(null)
  const [editTarget, setEditTarget] = useState(null)

  const { data: groups = [] } = useQuery({
    queryKey: ['groups'],
    queryFn: listGroups,
  })

  const { data: groupDetail } = useQuery({
    queryKey: ['group', selectedId],
    queryFn: () => getGroup(selectedId),
    enabled: !!selectedId,
  })

  const createMutation = useMutation({
    mutationFn: createGroup,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['groups'] })
      setShowCreate(false)
    },
  })

  const updateMutation = useMutation({
    mutationFn: ({ id, data }) => updateGroup(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['groups'] })
      queryClient.invalidateQueries({ queryKey: ['group'] })
      setEditTarget(null)
    },
  })

  const deleteMutation = useMutation({
    mutationFn: deleteGroup,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['groups'] })
      setSearchParams({})
      setDeleteTarget(null)
    },
  })

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold">Groups</h1>
        <button
          onClick={() => setShowCreate(true)}
          className="px-4 py-2 text-sm bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition"
        >
          New Group
        </button>
      </div>

      {!selectedId ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {groups.map((g) => (
            <GroupCard key={g.id} group={g} />
          ))}
          {groups.length === 0 && (
            <p className="text-gray-400 text-sm col-span-full py-8 text-center">
              No groups yet. Create one to get started.
            </p>
          )}
        </div>
      ) : (
        <GroupDetail
          group={groupDetail}
          onBack={() => setSearchParams({})}
          onDelete={() => setDeleteTarget(groupDetail)}
          onEdit={() => setEditTarget(groupDetail)}
          queryClient={queryClient}
        />
      )}

      {showCreate && (
        <CreateGroupModal
          onSave={(data) => createMutation.mutate(data)}
          onClose={() => setShowCreate(false)}
        />
      )}

      {editTarget && (
        <CreateGroupModal
          group={editTarget}
          onSave={(data) => updateMutation.mutate({ id: editTarget.id, data })}
          onClose={() => setEditTarget(null)}
        />
      )}

      <ConfirmDialog
        open={!!deleteTarget}
        title="Delete Group"
        message={`Are you sure you want to delete "${deleteTarget?.name}"? Devices will not be deleted.`}
        onConfirm={() => deleteMutation.mutate(deleteTarget.id)}
        onCancel={() => setDeleteTarget(null)}
      />
    </div>
  )
}

function GroupDetail({ group, onBack, onDelete, onEdit, queryClient }) {
  const [showAddDevices, setShowAddDevices] = useState(false)

  const removeMutation = useMutation({
    mutationFn: ({ groupId, mac }) => removeDeviceFromGroup(groupId, mac),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['group'] })
      queryClient.invalidateQueries({ queryKey: ['devices'] })
    },
  })

  const pauseMutation = useMutation({
    mutationFn: () => pauseGroup(group?.id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['group'] })
      queryClient.invalidateQueries({ queryKey: ['groups'] })
      queryClient.invalidateQueries({ queryKey: ['status'] })
      queryClient.invalidateQueries({ queryKey: ['groupLogs'] })
    },
    onError: (err) => alert(err.response?.data?.detail || 'Pause failed'),
  })

  const unpauseMutation = useMutation({
    mutationFn: () => unpauseGroup(group?.id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['group'] })
      queryClient.invalidateQueries({ queryKey: ['groups'] })
      queryClient.invalidateQueries({ queryKey: ['status'] })
      queryClient.invalidateQueries({ queryKey: ['groupLogs'] })
    },
    onError: (err) => alert(err.response?.data?.detail || 'Unpause failed'),
  })

  const { data: logs = [] } = useQuery({
    queryKey: ['groupLogs', group?.id],
    queryFn: () => getGroupLogs(group.id),
    enabled: !!group?.id,
  })

  if (!group) return <p className="text-gray-400 text-sm">Loading...</p>

  const isPaused = group.is_paused
  const pausePending = pauseMutation.isPending || unpauseMutation.isPending

  return (
    <div>
      <button
        onClick={onBack}
        className="text-sm text-indigo-600 hover:text-indigo-800 mb-4 transition"
      >
        &larr; Back to groups
      </button>

      <div className="bg-white rounded-xl border border-gray-200 p-5 mb-4">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-3">
            <div
              className="w-4 h-4 rounded-full"
              style={{ backgroundColor: group.color || '#4f46e5' }}
            />
            <h2 className="text-xl font-bold">{group.name}</h2>
            {group.wlan_id && (
              <span className="text-xs text-gray-500">WiFi network linked</span>
            )}
            {isPaused && (
              <span className="text-xs bg-red-100 text-red-700 px-2 py-0.5 rounded-full font-medium">
                Paused
              </span>
            )}
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={() =>
                isPaused ? unpauseMutation.mutate() : pauseMutation.mutate()
              }
              disabled={pausePending}
              className={`px-3 py-1.5 text-sm rounded-lg transition disabled:opacity-50 ${
                isPaused
                  ? 'bg-green-600 text-white hover:bg-green-700'
                  : 'bg-red-600 text-white hover:bg-red-700'
              }`}
            >
              {pausePending
                ? '...'
                : isPaused
                ? 'Unpause WiFi'
                : 'Pause WiFi'}
            </button>
            <button
              onClick={onEdit}
              className="text-sm text-gray-600 hover:text-gray-900 transition"
            >
              Edit
            </button>
            <button
              onClick={onDelete}
              className="text-sm text-red-600 hover:text-red-800 transition"
            >
              Delete
            </button>
          </div>
        </div>
        {group.description && (
          <p className="text-sm text-gray-500">{group.description}</p>
        )}
      </div>

      <div className="bg-white rounded-xl border border-gray-200 p-5 mb-4">
        <div className="flex items-center justify-between mb-3">
          <h3 className="font-semibold">
            Devices ({group.devices?.length || 0})
          </h3>
          <button
            onClick={() => setShowAddDevices(true)}
            className="text-sm text-indigo-600 hover:text-indigo-800 transition"
          >
            + Add Devices
          </button>
        </div>
        {group.devices?.length > 0 ? (
          <div className="divide-y divide-gray-100">
            {group.devices.map((d) => (
              <div
                key={d.mac}
                className="flex items-center justify-between py-2"
              >
                <div>
                  <span className="text-sm font-medium">
                    {d.name || d.hostname || d.mac}
                  </span>
                  <span className="text-xs text-gray-400 ml-2">{d.mac}</span>
                </div>
                <button
                  onClick={() =>
                    removeMutation.mutate({ groupId: group.id, mac: d.mac })
                  }
                  className="text-xs text-red-500 hover:text-red-700 transition"
                >
                  Remove
                </button>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-gray-400 text-sm">No devices in this group</p>
        )}
      </div>

      {group.schedules?.length > 0 && (
        <div className="bg-white rounded-xl border border-gray-200 p-5 mb-4">
          <h3 className="font-semibold mb-3">Schedules</h3>
          <div className="space-y-2">
            {group.schedules.map((s) => (
              <div
                key={s.id}
                className="flex items-center justify-between text-sm"
              >
                <span>
                  {s.label || 'Schedule'}: {s.restrict_start} – {s.restrict_end}
                </span>
                <span
                  className={`text-xs ${
                    s.is_active ? 'text-green-600' : 'text-gray-400'
                  }`}
                >
                  {s.is_active ? 'Active' : 'Disabled'}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="bg-white rounded-xl border border-gray-200 p-5 mb-4">
        <h3 className="font-semibold mb-2">UDM Pro Implementation</h3>
        <p className="text-xs text-gray-500 mb-3">
          Blocking is enforced via the UniFi stamgr API. Each device is individually blocked/unblocked
          using <code className="bg-gray-100 px-1 rounded">cmd: block-sta</code> and{' '}
          <code className="bg-gray-100 px-1 rounded">cmd: unblock-sta</code> commands
          sent to <code className="bg-gray-100 px-1 rounded">/api/s/{'{site}'}/cmd/stamgr</code>.
          Blocked devices are disconnected from the network and cannot reconnect until unblocked.
        </p>
        <h4 className="text-sm font-medium text-gray-700 mb-2">
          Enforcement Log ({logs.length})
        </h4>
        {logs.length > 0 ? (
          <div className="divide-y divide-gray-100 max-h-64 overflow-y-auto">
            {logs.map((log) => (
              <div key={log.id} className="py-2 text-sm">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span
                      className={`inline-block w-2 h-2 rounded-full ${
                        log.action === 'block' ? 'bg-red-500' : 'bg-green-500'
                      }`}
                    />
                    <span className="font-medium capitalize">{log.action}</span>
                    <span className="text-xs text-gray-400">
                      ({log.triggered_by.replace('_', ' ')})
                    </span>
                  </div>
                  <span className="text-xs text-gray-400">
                    {new Date(log.executed_at).toLocaleString()}
                  </span>
                </div>
                <div className="text-xs text-gray-500 mt-1">
                  {log.device_macs.length} device{log.device_macs.length !== 1 ? 's' : ''}{' '}
                  {log.success ? (
                    <span className="text-green-600">succeeded</span>
                  ) : (
                    <span className="text-red-600">
                      failed{log.error_message ? `: ${log.error_message}` : ''}
                    </span>
                  )}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-gray-400 text-xs">No enforcement actions yet</p>
        )}
      </div>

      {showAddDevices && (
        <AddDevicesModal
          groupId={group.id}
          currentMacs={group.devices?.map((d) => d.mac) || []}
          onClose={() => setShowAddDevices(false)}
          queryClient={queryClient}
        />
      )}
    </div>
  )
}

function AddDevicesModal({ groupId, currentMacs, onClose, queryClient }) {
  const [selectedMacs, setSelectedMacs] = useState(new Set(currentMacs))
  const [search, setSearch] = useState('')

  const { data: allDevices = [] } = useQuery({
    queryKey: ['devices'],
    queryFn: () => listDevices(),
  })

  const saveMutation = useMutation({
    mutationFn: () => setGroupDevices(groupId, [...selectedMacs]),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['group'] })
      queryClient.invalidateQueries({ queryKey: ['devices'] })
      queryClient.invalidateQueries({ queryKey: ['groups'] })
      onClose()
    },
  })

  const filtered = allDevices.filter((d) => {
    const q = search.toLowerCase()
    return (
      !q ||
      d.name?.toLowerCase().includes(q) ||
      d.mac.toLowerCase().includes(q) ||
      d.hostname?.toLowerCase().includes(q)
    )
  })

  const toggle = (mac) => {
    setSelectedMacs((prev) => {
      const next = new Set(prev)
      if (next.has(mac)) next.delete(mac)
      else next.add(mac)
      return next
    })
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/50">
      <div className="bg-white rounded-t-xl sm:rounded-xl shadow-xl w-full sm:max-w-lg mx-0 sm:mx-4 p-6 max-h-[80vh] flex flex-col">
        <h3 className="text-lg font-semibold mb-3">Add Devices to Group</h3>
        <input
          type="text"
          placeholder="Search..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full mb-3 border border-gray-300 rounded-lg px-3 py-2 text-sm"
        />
        <div className="flex-1 overflow-y-auto divide-y divide-gray-100">
          {filtered.map((d) => (
            <label
              key={d.mac}
              className="flex items-center gap-3 py-2 cursor-pointer hover:bg-gray-50"
            >
              <input
                type="checkbox"
                checked={selectedMacs.has(d.mac)}
                onChange={() => toggle(d.mac)}
                className="rounded border-gray-300"
              />
              <div>
                <span className="text-sm font-medium">
                  {d.name || d.hostname || d.mac}
                </span>
                <span className="text-xs text-gray-400 ml-2">{d.mac}</span>
              </div>
            </label>
          ))}
        </div>
        <div className="flex gap-3 justify-end pt-4 border-t border-gray-200 mt-3">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm rounded-lg border border-gray-300 hover:bg-gray-50 transition"
          >
            Cancel
          </button>
          <button
            onClick={() => saveMutation.mutate()}
            disabled={saveMutation.isPending}
            className="px-4 py-2 text-sm rounded-lg bg-indigo-600 text-white hover:bg-indigo-700 disabled:opacity-50 transition"
          >
            Save ({selectedMacs.size} selected)
          </button>
        </div>
      </div>
    </div>
  )
}

function CreateGroupModal({ group, onSave, onClose }) {
  const [name, setName] = useState(group?.name || '')
  const [description, setDescription] = useState(group?.description || '')
  const [color, setColor] = useState(group?.color || '#4f46e5')
  const [wlanId, setWlanId] = useState(group?.wlan_id || '')

  const { data: wlans = [] } = useQuery({
    queryKey: ['wlans'],
    queryFn: getWlans,
    retry: false,
  })

  const handleSubmit = (e) => {
    e.preventDefault()
    onSave({ name, description: description || null, color, wlan_id: wlanId || null })
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="bg-white rounded-xl shadow-xl max-w-sm w-full mx-4 p-6">
        <h3 className="text-lg font-semibold mb-4">New Group</h3>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Name</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
              required
              autoFocus
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Description (optional)
            </label>
            <input
              type="text"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Color</label>
            <input
              type="color"
              value={color}
              onChange={(e) => setColor(e.target.value)}
              className="h-10 w-20 rounded border border-gray-300 cursor-pointer"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              WiFi network
            </label>
            <select
              value={wlanId}
              onChange={(e) => setWlanId(e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm bg-white"
            >
              <option value="">None</option>
              {wlans.map((w) => (
                <option key={w.id} value={w.id}>
                  {w.name}
                </option>
              ))}
            </select>
            <p className="text-xs text-amber-600 mt-1">
              Blocking this group will turn off this entire WiFi network for every
              device on it. Use a dedicated network for this group.
            </p>
          </div>
          <div className="flex gap-3 justify-end pt-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-sm rounded-lg border border-gray-300 hover:bg-gray-50 transition"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="px-4 py-2 text-sm rounded-lg bg-indigo-600 text-white hover:bg-indigo-700 transition"
            >
              Create
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
