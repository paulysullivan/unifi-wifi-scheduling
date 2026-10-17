import logging
import httpx
from timeutil import utcfromtimestamp

logger = logging.getLogger(__name__)


class UnifiClient:
    def __init__(
        self,
        host: str,
        api_key: str,
        site_id: str = "default",
        verify_ssl: bool = False,
    ):
        self.host = host.rstrip("/")
        self.api_key = api_key
        self.site_id = site_id
        self.verify_ssl = verify_ssl
        self._client: httpx.AsyncClient | None = None

    async def _get_client(self) -> httpx.AsyncClient:
        if self._client is None or self._client.is_closed:
            self._client = httpx.AsyncClient(
                verify=self.verify_ssl,
                timeout=httpx.Timeout(30.0),
            )
        return self._client

    def _headers(self) -> dict[str, str]:
        return {"X-API-Key": self.api_key}

    async def _request(self, method: str, path: str, **kwargs) -> httpx.Response:
        client = await self._get_client()
        url = f"{self.host}{path}"

        for attempt in range(3):
            try:
                resp = await client.request(
                    method,
                    url,
                    headers=self._headers(),
                    **kwargs,
                )
                if resp.status_code == 401:
                    logger.error("UniFi API key authentication failed (401)")
                return resp
            except httpx.HTTPError as e:
                if attempt == 2:
                    raise
                logger.warning(f"Request failed (attempt {attempt + 1}): {e}")
                import asyncio
                await asyncio.sleep(2 ** attempt)

        raise RuntimeError("Request failed after retries")

    async def test_connection(self) -> tuple[bool, str, str | None]:
        try:
            resp = await self._request(
                "GET",
                f"/proxy/network/api/s/{self.site_id}/stat/health",
            )
            if resp.status_code == 200:
                return True, "Connection successful", self.site_id
            elif resp.status_code == 401:
                return False, "Authentication failed — check API key", None
            return False, f"API returned status {resp.status_code}", None
        except Exception as e:
            return False, f"Connection error: {str(e)}", None

    async def get_active_clients(self) -> list[dict]:
        resp = await self._request(
            "GET",
            f"/proxy/network/api/s/{self.site_id}/stat/sta",
        )
        resp.raise_for_status()
        return resp.json().get("data", [])

    async def get_all_clients(self) -> list[dict]:
        resp = await self._request(
            "GET",
            f"/proxy/network/api/s/{self.site_id}/stat/alluser",
        )
        resp.raise_for_status()
        return resp.json().get("data", [])

    async def sync_devices(self) -> list[dict]:
        active = await self.get_active_clients()
        all_clients = await self.get_all_clients()

        # Index all clients by MAC, then overlay active clients (preferred)
        by_mac: dict[str, dict] = {}
        for client in all_clients:
            mac = client.get("mac", "").lower()
            if mac:
                by_mac[mac] = {
                    "mac": mac,
                    "name": client.get("name") or client.get("hostname"),
                    "hostname": client.get("hostname"),
                    "ip": client.get("ip") or client.get("last_ip"),
                    "device_type": client.get("dev_cat_name") or client.get("oui"),
                    "last_seen": (
                        utcfromtimestamp(client["last_seen"])
                        if "last_seen" in client
                        else None
                    ),
                }

        for client in active:
            mac = client.get("mac", "").lower()
            if mac:
                by_mac[mac] = {
                    "mac": mac,
                    "name": client.get("name") or client.get("hostname"),
                    "hostname": client.get("hostname"),
                    "ip": client.get("ip"),
                    "device_type": client.get("dev_cat_name") or client.get("oui"),
                    "last_seen": (
                        utcfromtimestamp(client["last_seen"])
                        if "last_seen" in client
                        else None
                    ),
                }

        return list(by_mac.values())

    async def get_wlans(self) -> list[dict]:
        resp = await self._request(
            "GET",
            f"/proxy/network/api/s/{self.site_id}/rest/wlanconf",
        )
        resp.raise_for_status()
        return resp.json().get("data", [])

    async def set_wlan_enabled(self, wlan_id: str, enabled: bool) -> bool:
        resp = await self._request(
            "PUT",
            f"/proxy/network/api/s/{self.site_id}/rest/wlanconf/{wlan_id}",
            json={"enabled": enabled},
        )
        if resp.status_code == 200:
            return True
        logger.error(f"Failed to set WLAN {wlan_id} enabled={enabled}: {resp.status_code} {resp.text}")
        return False

    async def block_device(self, mac: str) -> bool:
        resp = await self._request(
            "POST",
            f"/proxy/network/api/s/{self.site_id}/cmd/stamgr",
            json={"cmd": "block-sta", "mac": mac.lower()},
        )
        if resp.status_code == 200:
            return True
        logger.error(f"Failed to block {mac}: {resp.status_code} {resp.text}")
        return False

    async def unblock_device(self, mac: str) -> bool:
        resp = await self._request(
            "POST",
            f"/proxy/network/api/s/{self.site_id}/cmd/stamgr",
            json={"cmd": "unblock-sta", "mac": mac.lower()},
        )
        if resp.status_code == 200:
            return True
        logger.error(f"Failed to unblock {mac}: {resp.status_code} {resp.text}")
        return False

    async def block_devices(self, macs: list[str]) -> tuple[list[str], list[str]]:
        succeeded, failed = [], []
        for mac in macs:
            if await self.block_device(mac):
                succeeded.append(mac)
            else:
                failed.append(mac)
        return succeeded, failed

    async def unblock_devices(self, macs: list[str]) -> tuple[list[str], list[str]]:
        succeeded, failed = [], []
        for mac in macs:
            if await self.unblock_device(mac):
                succeeded.append(mac)
            else:
                failed.append(mac)
        return succeeded, failed

    async def close(self):
        if self._client and not self._client.is_closed:
            await self._client.aclose()
