import client from './client'

export const listExtensions = (params) =>
  client.get('/extensions', { params }).then((r) => r.data)

export const addExtension = (data) =>
  client.post('/extensions', data).then((r) => r.data)

export const deleteExtension = (id) =>
  client.delete(`/extensions/${id}`).then((r) => r.data)
