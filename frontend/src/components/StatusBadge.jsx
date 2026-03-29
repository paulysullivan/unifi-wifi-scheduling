import clsx from 'clsx'

export default function StatusBadge({ restricted }) {
  return (
    <span
      className={clsx(
        'inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium',
        restricted
          ? 'bg-red-100 text-red-700'
          : 'bg-green-100 text-green-700'
      )}
    >
      <span
        className={clsx(
          'w-1.5 h-1.5 rounded-full',
          restricted ? 'bg-red-500' : 'bg-green-500'
        )}
      />
      {restricted ? 'Blocked' : 'Active'}
    </span>
  )
}
