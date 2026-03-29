import { useQueryClient } from '@tanstack/react-query'
import { useStatus } from '../hooks/useStatus'
import StatusBadge from '../components/StatusBadge'
import ExtendButton from '../components/ExtendButton'

export default function Dashboard() {
  const { data: statuses = [], isLoading, refetch } = useStatus()
  const queryClient = useQueryClient()

  const restricted = statuses.filter((s) => s.is_restricted)
  const totalExtensions = statuses.reduce((sum, s) => sum + s.extension_minutes_today, 0)

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold">Dashboard</h1>
        <button
          onClick={() => refetch()}
          className="px-3 py-1.5 text-sm border border-gray-300 rounded-lg hover:bg-gray-50 transition"
        >
          Refresh
        </button>
      </div>

      {/* Summary bar */}
      <div className="grid grid-cols-3 gap-3 mb-6">
        <SummaryCard label="Groups" value={statuses.length} />
        <SummaryCard
          label="Restricted Now"
          value={restricted.length}
          highlight={restricted.length > 0}
        />
        <SummaryCard label="Extensions Today" value={`${totalExtensions} min`} />
      </div>

      {isLoading ? (
        <p className="text-gray-400 text-sm">Loading...</p>
      ) : statuses.length === 0 ? (
        <div className="text-center py-12 text-gray-400">
          <p className="text-lg mb-2">No groups configured</p>
          <p className="text-sm">Create groups and schedules to get started</p>
        </div>
      ) : (
        <div className="space-y-3">
          {statuses.map((status) => (
            <div
              key={status.group_id}
              className="bg-white rounded-xl border border-gray-200 p-4"
            >
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-3">
                  <div
                    className="w-3 h-3 rounded-full flex-shrink-0"
                    style={{ backgroundColor: status.color || '#4f46e5' }}
                  />
                  <h3 className="font-semibold text-gray-900">{status.name}</h3>
                  <span className="text-xs text-gray-400">
                    {status.device_count} device{status.device_count !== 1 ? 's' : ''}
                  </span>
                </div>
                <StatusBadge restricted={status.is_restricted} />
              </div>

              {status.active_schedule && (
                <div className="flex items-center justify-between mt-3 pt-3 border-t border-gray-100">
                  <div className="text-sm text-gray-600">
                    {status.is_restricted ? (
                      <span>
                        Restricted until{' '}
                        <span className="font-medium">{status.restrict_end}</span>
                      </span>
                    ) : (
                      <span>
                        Blocks at{' '}
                        <span className="font-medium">
                          {status.restrict_start_effective}
                        </span>
                      </span>
                    )}
                    {status.extension_minutes_today > 0 && (
                      <span className="ml-2 text-indigo-600">
                        (+{status.extension_minutes_today} min extended)
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-gray-400">
                      {status.extension_minutes_today}/120 min
                    </span>
                    <ExtendButton
                      groupId={status.group_id}
                      scheduleId={status.active_schedule.id}
                      extensionMinutes={status.extension_minutes_today}
                    />
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function SummaryCard({ label, value, highlight }) {
  return (
    <div className="bg-white rounded-xl border border-gray-200 p-3 text-center">
      <div
        className={`text-xl font-bold ${highlight ? 'text-red-600' : 'text-gray-900'}`}
      >
        {value}
      </div>
      <div className="text-xs text-gray-500 mt-0.5">{label}</div>
    </div>
  )
}
