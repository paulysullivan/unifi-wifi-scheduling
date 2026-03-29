import { useState, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { login as loginApi } from '../api/auth'

export function useAuth() {
  const [token, setToken] = useState(() => localStorage.getItem('token'))
  const navigate = useNavigate()

  const login = useCallback(async (username, password) => {
    const data = await loginApi(username, password)
    localStorage.setItem('token', data.access_token)
    setToken(data.access_token)
    navigate('/', { replace: true })
  }, [navigate])

  const logout = useCallback(() => {
    localStorage.removeItem('token')
    setToken(null)
    navigate('/login', { replace: true })
  }, [navigate])

  return { token, login, logout }
}
