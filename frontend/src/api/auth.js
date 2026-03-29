import client from './client'

export const login = (username, password) =>
  client.post('/auth/login', { username, password }).then((r) => r.data)

export const getMe = () => client.get('/auth/me').then((r) => r.data)

export const changePassword = (currentPassword, newPassword) =>
  client
    .post('/auth/change-password', {
      current_password: currentPassword,
      new_password: newPassword,
    })
    .then((r) => r.data)
