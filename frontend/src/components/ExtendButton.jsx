import { useMutation, useQueryClient } from '@tanstack/react-query'
import { addExtension } from '../api/extensions'
import { format } from 'date-fns'

export default function ExtendButton({ groupId, scheduleId, extensionMinutes, maxMinutes = 120 }) {
  const queryClient = useQueryClient()
  const atMax = extensionMinutes >= maxMinutes

  const mutation = useMutation({
    mutationFn: () =>
      addExtension({
        group_id: groupId,
        schedule_id: scheduleId,
        date: format(new Date(), 'yyyy-MM-dd'),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['status'] })
      queryClient.invalidateQueries({ queryKey: ['extensions'] })
    },
  })

  return (
    <button
      onClick={() => mutation.mutate()}
      disabled={atMax || mutation.isPending}
      className="px-3 py-1.5 text-sm font-medium rounded-lg bg-indigo-600 text-white hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed transition"
    >
      {mutation.isPending ? 'Extending...' : '+ 15 min'}
    </button>
  )
}
