import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  listSchedules,
  createSchedule,
  updateSchedule,
  deleteSchedule,
  toggleSchedule,
} from '../api/schedules'
import { listGroups } from '../api/groups'
import ScheduleModal from '../components/ScheduleModal'
import ConfirmDialog from '../components/ConfirmDialog'

const DAY_LABELS = ['M', 'T', 'W', 'T', 'F', 'S', 'S']

export default function Schedules() {
  const queryClient = useQueryClient()
  const [showModal, setShowModal] = useState(false)
  const [editSchedule, setEditSchedule] = useState(null)
  const [deleteTarget, setDeleteTarget] = useState(null)

  const { data: schedules = [], isLoading } = useQuery({
    queryKey: ['schedules'],
    queryFn: () => listSchedules(),
  })

  const { data: groups = [] } = useQuery({
    queryKey: ['groups'],
    queryFn: listGroups,
  })

  const groupMap = Object.fromEntries(groups.map((g) => [g.id, g]))

  const createMutation = useMutation({
    mutationFn: createSchedule,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['schedules'] })
      setShowModal(false)
    },
  })

  const updateMutation = useMutation({
    mutationFn: ({ id, data }) => updateSchedule(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['schedules'] })
      setShowModal(false)
      setEditSchedule(null)
    },
  })

  const deleteMutation = useMutation({
    mutationFn: deleteSchedule,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['schedules'] })
      setDeleteTarget(null)
    },
  })

  const toggleMutation = useMutation({
    mutationFn: toggleSchedule,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['schedules'] })
    },
  })

  // Group schedules by group
  const byGroup = {}
  for (const s of schedules) {
    if (!byGroup[s.group_id]) byGroup[s.group_id] = []
    byGroup[s.group_id].push(s)
  }

  const handleSave = (form) => {
    if (editSchedule) {
      updateMutation.mutate({ id: editSchedule.id, data: form })
    } else {
      createMutation.mutate(form)
    }
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold">Schedules</h1>
        <button
          onClick={() => {
            setEditSchedule(null)
            setShowModal(true)
          }}
          className="px-4 py-2 text-sm bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition"
        >
          New Schedule
        </button>
      </div>

      {isLoading ? (
        <p className="text-gray-400 text-sm">Loading...</p>
      ) : schedules.length === 0 ? (
        <p className="text-gray-400 text-sm text-center py-12">
          No schedules configured yet.
        </p>
      ) : (
        <div className="space-y-6">
          {Object.entries(byGroup).map(([groupId, groupSchedules]) => {
            const group = groupMap[Number(groupId)]
            return (
              <div key={groupId}>
                <div className="flex items-center gap-2 mb-2">
                  <div
                    className="w-2.5 h-2.5 rounded-full"
                    style={{
                      backgroundColor: group?.color || '#4f46e5',
                    }}
                  />
                  <h2 className="font-semibold text-gray-900">
                    {group?.name || `Group ${groupId}`}
                  </h2>
                </div>
                <div className="space-y-2">
                  {groupSchedules.map((s) => (
                    <div
                      key={s.id}
                      className="bg-white rounded-xl border border-gray-200 p-4 flex items-center justify-between"
                    >
                      <div className="flex items-center gap-4 flex-1 min-w-0">
                        <div className="min-w-0">
                          <div className="text-sm font-medium text-gray-900 truncate">
                            {s.label || 'Schedule'}
                          </div>
                          <div className="text-xs text-gray-500 mt-0.5">
                            {s.restrict_start} – {s.restrict_end}
                          </div>
                        </div>
                        <div className="flex gap-0.5">
                          {DAY_LABELS.map((label, i) => (
                            <span
                              key={i}
                              className={`w-6 h-6 rounded text-xs flex items-center justify-center ${
                                s.days_of_week.includes(i)
                                  ? 'bg-indigo-100 text-indigo-700 font-medium'
                                  : 'bg-gray-50 text-gray-300'
                              }`}
                            >
                              {label}
                            </span>
                          ))}
                        </div>
                      </div>
                      <div className="flex items-center gap-2 ml-4">
                        <button
                          onClick={() => toggleMutation.mutate(s.id)}
                          className={`text-xs px-2 py-1 rounded ${
                            s.is_active
                              ? 'bg-green-100 text-green-700'
                              : 'bg-gray-100 text-gray-500'
                          }`}
                        >
                          {s.is_active ? 'Active' : 'Off'}
                        </button>
                        <button
                          onClick={() => {
                            setEditSchedule(s)
                            setShowModal(true)
                          }}
                          className="text-xs text-gray-400 hover:text-gray-600 transition"
                        >
                          Edit
                        </button>
                        <button
                          onClick={() => setDeleteTarget(s)}
                          className="text-xs text-red-400 hover:text-red-600 transition"
                        >
                          Delete
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )
          })}
        </div>
      )}

      <ScheduleModal
        open={showModal}
        schedule={editSchedule}
        onSave={handleSave}
        onClose={() => {
          setShowModal(false)
          setEditSchedule(null)
        }}
      />

      <ConfirmDialog
        open={!!deleteTarget}
        title="Delete Schedule"
        message="Are you sure you want to delete this schedule?"
        onConfirm={() => deleteMutation.mutate(deleteTarget.id)}
        onCancel={() => setDeleteTarget(null)}
      />
    </div>
  )
}
