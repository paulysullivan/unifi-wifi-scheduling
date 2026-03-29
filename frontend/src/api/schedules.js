import client from './client'

export const listSchedules = (params) =>
  client.get('/schedules', { params }).then((r) => r.data)

export const createSchedule = (data) =>
  client.post('/schedules', data).then((r) => r.data)

export const updateSchedule = (id, data) =>
  client.put(`/schedules/${id}`, data).then((r) => r.data)

export const deleteSchedule = (id) =>
  client.delete(`/schedules/${id}`).then((r) => r.data)

export const toggleSchedule = (id) =>
  client.patch(`/schedules/${id}/toggle`).then((r) => r.data)
