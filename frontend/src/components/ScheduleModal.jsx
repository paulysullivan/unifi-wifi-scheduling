import { useState, useEffect } from 'react'
import { useQuery } from '@tanstack/react-query'
import { listGroups } from '../api/groups'

const DAY_LABELS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']

export default function ScheduleModal({ open, schedule, onSave, onClose }) {
  const { data: groups = [] } = useQuery({
    queryKey: ['groups'],
    queryFn: listGroups,
    enabled: open,
  })

  const [form, setForm] = useState({
    group_id: '',
    label: '',
    days_of_week: [],
    restrict_start: '22:00',
    restrict_end: '06:00',
    is_active: true,
  })

  useEffect(() => {
    if (schedule) {
      setForm({
        group_id: schedule.group_id,
        label: schedule.label || '',
        days_of_week: schedule.days_of_week,
        restrict_start: schedule.restrict_start,
        restrict_end: schedule.restrict_end,
        is_active: schedule.is_active,
      })
    } else {
      setForm({
        group_id: groups[0]?.id || '',
        label: '',
        days_of_week: [0, 1, 2, 3, 4],
        restrict_start: '22:00',
        restrict_end: '06:00',
        is_active: true,
      })
    }
  }, [schedule, open, groups])

  if (!open) return null

  const toggleDay = (day) => {
    setForm((f) => ({
      ...f,
      days_of_week: f.days_of_week.includes(day)
        ? f.days_of_week.filter((d) => d !== day)
        : [...f.days_of_week, day].sort(),
    }))
  }

  const handleSubmit = (e) => {
    e.preventDefault()
    onSave({ ...form, group_id: Number(form.group_id) })
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="bg-white rounded-xl shadow-xl max-w-md w-full mx-4 p-6">
        <h3 className="text-lg font-semibold mb-4">
          {schedule ? 'Edit Schedule' : 'New Schedule'}
        </h3>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Group</label>
            <select
              value={form.group_id}
              onChange={(e) => setForm((f) => ({ ...f, group_id: e.target.value }))}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
              required
              disabled={!!schedule}
            >
              <option value="">Select a group...</option>
              {groups.map((g) => (
                <option key={g.id} value={g.id}>
                  {g.name}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Label (optional)
            </label>
            <input
              type="text"
              value={form.label}
              onChange={(e) => setForm((f) => ({ ...f, label: e.target.value }))}
              placeholder="e.g. Bedtime, School Hours"
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Days</label>
            <div className="flex gap-1.5">
              {DAY_LABELS.map((label, i) => (
                <button
                  key={i}
                  type="button"
                  onClick={() => toggleDay(i)}
                  className={`w-10 h-10 rounded-lg text-xs font-medium transition ${
                    form.days_of_week.includes(i)
                      ? 'bg-indigo-600 text-white'
                      : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Block at
              </label>
              <input
                type="time"
                value={form.restrict_start}
                onChange={(e) =>
                  setForm((f) => ({ ...f, restrict_start: e.target.value }))
                }
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
                required
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Unblock at
              </label>
              <input
                type="time"
                value={form.restrict_end}
                onChange={(e) =>
                  setForm((f) => ({ ...f, restrict_end: e.target.value }))
                }
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
                required
              />
            </div>
          </div>

          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={form.is_active}
              onChange={(e) =>
                setForm((f) => ({ ...f, is_active: e.target.checked }))
              }
              className="rounded border-gray-300"
            />
            <span className="text-sm text-gray-700">Active</span>
          </label>

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
              {schedule ? 'Update' : 'Create'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
