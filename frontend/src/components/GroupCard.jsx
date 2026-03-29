import { useNavigate } from 'react-router-dom'

export default function GroupCard({ group }) {
  const navigate = useNavigate()

  return (
    <div
      onClick={() => navigate(`/groups?id=${group.id}`)}
      className="bg-white rounded-xl border border-gray-200 p-4 hover:shadow-md transition cursor-pointer"
    >
      <div className="flex items-center gap-3 mb-2">
        <div
          className="w-3 h-3 rounded-full flex-shrink-0"
          style={{ backgroundColor: group.color || '#4f46e5' }}
        />
        <h3 className="font-semibold text-gray-900 truncate">{group.name}</h3>
      </div>
      <div className="text-sm text-gray-500 space-y-1">
        <p>{group.device_count} device{group.device_count !== 1 ? 's' : ''}</p>
        {group.schedule_summary && (
          <p className="text-xs text-gray-400">{group.schedule_summary}</p>
        )}
      </div>
    </div>
  )
}
