import client from './client'

export const listDevices = (params) =>
  client.get('/devices', { params }).then((r) => r.data)

export const syncDevices = () =>
  client.post('/devices/sync').then((r) => r.data)

export const updateDevice = (mac, data) =>
  client.put(`/devices/${mac}`, data).then((r) => r.data)
