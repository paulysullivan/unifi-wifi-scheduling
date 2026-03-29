import logging
import httpx
from datetime import datetime

logger = logging.getLogger(__name__)


class UnifiClient:
    def __init__(
        self,
        host: str,
        username: str,
        password: str,
        site_id: str = "default",
        verify_ssl: bool = False,
    ):
        self.host = host.rstrip("/")
        self.username = username
        self.password = password
        self.site_id = site_id
        self.verify_ssl = verify_ssl
        self._cookies: dict[str, str] = {}
        self._csrf_token: str | None = None
        self._client: httpx.AsyncClient | None = None

    async def _get_client(self) -> httpx.AsyncClient:
        if self._client is None or self._client.is_closed:
            self._client = httpx.AsyncClient(
                verify=self.verify_ssl,
                timeout=httpx.Timeout(30.0),
            )
        return self._client

    async def login(self) -> bool:
        client = await self._get_client()
        resp = await client.post(
            f"{self.host}/api/auth/login",
            json={"username": self.username, "password": self.password},
        )
        if resp.status_code != 200:
            logger.error(f"UniFi login failed: {resp.status_code} {resp.text}")
            return False

        self._csrf_token = resp.headers.get("x-csrf-token")
        self._cookies = dict(resp.cookies)
        return True

    def _headers(self) -> dict[str, str]:
        headers = {}
        if self._csrf_token:
            headers["x-csrf-token"] = self._csrf_token
        return headers

    async def _request(self, method: str, path: str, **kwargs) -> httpx.Response:
        client = await self._get_client()
        url = f"{self.host}{path}"

        for attempt in range(3):
            try:
                resp = await client.request(
                    method,
                    url,
                    headers=self._headers(),
                    cookies=self._cookies,
                    **kwargs,
                )
                if resp.status_code == 401 and attempt == 0:
                    logger.info("Got 401, re-authenticating...")
                    if await self.login():
                        continue
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
            if not await self.login():
                return False, "Login failed — check username/password", None

            resp = await self._request(
                "GET",
                f"/proxy/network/api/s/{self.site_id}/stat/health",
            )
            if resp.status_code == 200:
                data = resp.json()
                site_name = self.site_id
                return True, "Connection successful", site_name
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
        if not await self.login():
            raise RuntimeError("Failed to authenticate with UniFi controller")

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
                        datetime.utcfromtimestamp(client["last_seen"])
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
                        datetime.utcfromtimestamp(client["last_seen"])
                        if "last_seen" in client
                        else None
                    ),
                }

        return list(by_mac.values())

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
