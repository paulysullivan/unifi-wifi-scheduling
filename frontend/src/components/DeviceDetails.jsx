// One-line summary of a device: vendor, wired/WiFi, network, SSID and VLAN
export default function DeviceDetails({ device }) {
  const parts = [
    device.vendor,
    device.is_wired == null ? null : device.is_wired ? 'Wired' : 'WiFi',
    device.network,
    device.ssid && `SSID: ${device.ssid}`,
    device.vlan != null && `VLAN ${device.vlan}`,
  ].filter(Boolean)

  if (!parts.length) return null
  return <p className="text-xs text-gray-400 mt-0.5">{parts.join(' · ')}</p>
}
