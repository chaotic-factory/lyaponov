from typing import Dict, Set
from asyncio import Queue

class BroadcastHub:
    def __init__(self):
        self.rooms: Dict[str, Set[Queue]] = {}

    def join(self, device_id: str, q: Queue):
        self.rooms.setdefault(device_id, set()).add(q)

    def leave(self, device_id: str, q: Queue):
        if device_id in self.rooms:
            self.rooms[device_id].discard(q)
            if not self.rooms[device_id]:
                del self.rooms[device_id]

    async def send(self, device_id: str, msg: str):
        if device_id in self.rooms:
            for q in list(self.rooms[device_id]):
                await q.put(msg)

HUB = BroadcastHub()