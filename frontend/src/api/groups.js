import client from './client'

export const listGroups = () => client.get('/groups').then((r) => r.data)

export const createGroup = (data) =>
  client.post('/groups', data).then((r) => r.data)

export const getGroup = (id) => client.get(`/groups/${id}`).then((r) => r.data)

export const updateGroup = (id, data) =>
  client.put(`/groups/${id}`, data).then((r) => r.data)

export const deleteGroup = (id) =>
  client.delete(`/groups/${id}`).then((r) => r.data)

export const setGroupDevices = (id, macs) =>
  client.put(`/groups/${id}/devices`, { macs }).then((r) => r.data)

export const removeDeviceFromGroup = (groupId, mac) =>
  client.delete(`/groups/${groupId}/devices/${mac}`).then((r) => r.data)
