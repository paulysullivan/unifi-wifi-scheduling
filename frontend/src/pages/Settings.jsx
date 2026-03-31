import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  listCredentials,
  createCredential,
  updateCredential,
  deleteCredential,
  testConnection,
  activateCredential,
} from '../api/credentials'
import { changePassword } from '../api/auth'

export default function Settings() {
  return (
    <div>
      <h1 className="text-2xl font-bold mb-6">Settings</h1>
      <div className="space-y-6">
        <UnifiSection />
        <PasswordSection />
      </div>
    </div>
  )
}

function UnifiSection() {
  const queryClient = useQueryClient()
  const [showForm, setShowForm] = useState(false)
  const [editId, setEditId] = useState(null)
  const [form, setForm] = useState({
    label: '',
    host: 'https://192.168.1.1',
    api_key: '',
    site_id: 'default',
    verify_ssl: false,
  })
  const [testResult, setTestResult] = useState(null)

  const { data: credentials = [] } = useQuery({
    queryKey: ['credentials'],
    queryFn: listCredentials,
  })

  const saveMutation = useMutation({
    mutationFn: (data) =>
      editId ? updateCredential(editId, data) : createCredential(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['credentials'] })
      resetForm()
    },
  })

  const deleteMutation = useMutation({
    mutationFn: deleteCredential,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['credentials'] }),
  })

  const testMutation = useMutation({
    mutationFn: testConnection,
    onSuccess: (data) => setTestResult(data),
  })

  const activateMutation = useMutation({
    mutationFn: activateCredential,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['credentials'] }),
  })

  const resetForm = () => {
    setShowForm(false)
    setEditId(null)
    setForm({
      label: '',
      host: 'https://192.168.1.1',
      api_key: '',
      site_id: 'default',
      verify_ssl: false,
    })
    setTestResult(null)
  }

  const startEdit = (cred) => {
    setEditId(cred.id)
    setForm({
      label: cred.label || '',
      host: cred.host,
      api_key: '',
      site_id: cred.site_id,
      verify_ssl: cred.verify_ssl,
    })
    setShowForm(true)
    setTestResult(null)
  }

  const handleSubmit = (e) => {
    e.preventDefault()
    const data = { ...form }
    if (editId && !data.api_key) delete data.api_key
    saveMutation.mutate(data)
  }

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-5">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-semibold">UniFi Connection</h2>
        {!showForm && (
          <button
            onClick={() => setShowForm(true)}
            className="text-sm text-indigo-600 hover:text-indigo-800 transition"
          >
            + Add Credential
          </button>
        )}
      </div>

      {/* Existing credentials */}
      {credentials.length > 0 && !showForm && (
        <div className="space-y-2 mb-4">
          {credentials.map((cred) => (
            <div
              key={cred.id}
              className="flex items-center justify-between p-3 bg-gray-50 rounded-lg"
            >
              <div>
                <span className="text-sm font-medium">
                  {cred.label || cred.host}
                </span>
                <span className="text-xs text-gray-400 ml-2">
                  {cred.host}
                </span>
                {cred.last_test_success !== null && (
                  <span
                    className={`text-xs ml-2 ${
                      cred.last_test_success ? 'text-green-600' : 'text-red-600'
                    }`}
                  >
                    {cred.last_test_success ? 'Connected' : 'Failed'}
                  </span>
                )}
              </div>
              <div className="flex gap-2">
                {!cred.is_active && (
                  <button
                    onClick={() => activateMutation.mutate(cred.id)}
                    className="text-xs text-indigo-600 hover:text-indigo-800"
                  >
                    Activate
                  </button>
                )}
                {cred.is_active && (
                  <span className="text-xs text-green-600 font-medium">Active</span>
                )}
                <button
                  onClick={() => testMutation.mutate(cred.id)}
                  disabled={testMutation.isPending}
                  className="text-xs text-gray-500 hover:text-gray-700"
                >
                  Test
                </button>
                <button
                  onClick={() => startEdit(cred)}
                  className="text-xs text-gray-500 hover:text-gray-700"
                >
                  Edit
                </button>
                <button
                  onClick={() => {
                    if (confirm('Delete this credential?'))
                      deleteMutation.mutate(cred.id)
                  }}
                  className="text-xs text-red-500 hover:text-red-700"
                >
                  Delete
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {testResult && !showForm && (
        <div
          className={`text-sm p-3 rounded-lg mb-3 ${
            testResult.success
              ? 'bg-green-50 text-green-700'
              : 'bg-red-50 text-red-700'
          }`}
        >
          {testResult.message}
        </div>
      )}

      {showForm && (
        <form onSubmit={handleSubmit} className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div className="col-span-2 sm:col-span-1">
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Label
              </label>
              <input
                type="text"
                value={form.label}
                onChange={(e) => setForm((f) => ({ ...f, label: e.target.value }))}
                placeholder="e.g. UDM Pro Home"
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
              />
            </div>
            <div className="col-span-2 sm:col-span-1">
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Controller URL
              </label>
              <input
                type="text"
                value={form.host}
                onChange={(e) => setForm((f) => ({ ...f, host: e.target.value }))}
                placeholder="https://192.168.1.1"
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
                required
              />
            </div>
            <div className="col-span-2">
              <label className="block text-sm font-medium text-gray-700 mb-1">
                API Key{editId ? ' (leave blank to keep current)' : ''}
              </label>
              <input
                type="password"
                value={form.api_key}
                onChange={(e) =>
                  setForm((f) => ({ ...f, api_key: e.target.value }))
                }
                placeholder="UniFi controller API key"
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
                required={!editId}
              />
              <p className="text-xs text-gray-400 mt-1">
                Generate in UniFi OS → Settings → API Keys
              </p>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Site ID
              </label>
              <input
                type="text"
                value={form.site_id}
                onChange={(e) =>
                  setForm((f) => ({ ...f, site_id: e.target.value }))
                }
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
              />
            </div>
          </div>

          <div className="flex gap-3 justify-end pt-2">
            <button
              type="button"
              onClick={resetForm}
              className="px-4 py-2 text-sm rounded-lg border border-gray-300 hover:bg-gray-50 transition"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saveMutation.isPending}
              className="px-4 py-2 text-sm rounded-lg bg-indigo-600 text-white hover:bg-indigo-700 disabled:opacity-50 transition"
            >
              {saveMutation.isPending ? 'Saving...' : editId ? 'Update' : 'Save'}
            </button>
          </div>
        </form>
      )}
    </div>
  )
}

function PasswordSection() {
  const [current, setCurrent] = useState('')
  const [newPw, setNewPw] = useState('')
  const [confirm, setConfirm] = useState('')
  const [message, setMessage] = useState(null)

  const mutation = useMutation({
    mutationFn: () => changePassword(current, newPw),
    onSuccess: () => {
      setMessage({ type: 'success', text: 'Password changed successfully' })
      setCurrent('')
      setNewPw('')
      setConfirm('')
    },
    onError: (err) => {
      setMessage({
        type: 'error',
        text: err.response?.data?.detail || 'Failed to change password',
      })
    },
  })

  const handleSubmit = (e) => {
    e.preventDefault()
    if (newPw !== confirm) {
      setMessage({ type: 'error', text: 'Passwords do not match' })
      return
    }
    mutation.mutate()
  }

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-5">
      <h2 className="text-lg font-semibold mb-4">Change Password</h2>

      {message && (
        <div
          className={`text-sm p-3 rounded-lg mb-3 ${
            message.type === 'success'
              ? 'bg-green-50 text-green-700'
              : 'bg-red-50 text-red-700'
          }`}
        >
          {message.text}
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-3 max-w-sm">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Current Password
          </label>
          <input
            type="password"
            value={current}
            onChange={(e) => setCurrent(e.target.value)}
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
            required
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            New Password
          </label>
          <input
            type="password"
            value={newPw}
            onChange={(e) => setNewPw(e.target.value)}
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
            required
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Confirm New Password
          </label>
          <input
            type="password"
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
            required
          />
        </div>
        <button
          type="submit"
          disabled={mutation.isPending}
          className="px-4 py-2 text-sm rounded-lg bg-indigo-600 text-white hover:bg-indigo-700 disabled:opacity-50 transition"
        >
          {mutation.isPending ? 'Changing...' : 'Change Password'}
        </button>
      </form>
    </div>
  )
}
