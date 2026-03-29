import client from './client'

export const listCredentials = () =>
  client.get('/credentials').then((r) => r.data)

export const createCredential = (data) =>
  client.post('/credentials', data).then((r) => r.data)

export const updateCredential = (id, data) =>
  client.put(`/credentials/${id}`, data).then((r) => r.data)

export const deleteCredential = (id) =>
  client.delete(`/credentials/${id}`).then((r) => r.data)

export const testConnection = (id) =>
  client.post(`/credentials/${id}/test`).then((r) => r.data)

export const activateCredential = (id) =>
  client.post(`/credentials/${id}/activate`).then((r) => r.data)
