import { formatDistanceToNow } from 'date-fns'

export default function DeviceTable({ devices, onEdit, compact = false }) {
  if (!devices?.length) {
    return <p className="text-gray-400 text-sm py-4">No devices found</p>
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-gray-200 text-left text-gray-500">
            <th className="pb-2 font-medium">Name</th>
            {!compact && <th className="pb-2 font-medium">MAC</th>}
            {!compact && <th className="pb-2 font-medium hidden sm:table-cell">IP</th>}
            <th className="pb-2 font-medium">Group(s)</th>
            {!compact && (
              <th className="pb-2 font-medium hidden md:table-cell">Last Seen</th>
            )}
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100">
          {devices.map((device) => (
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
