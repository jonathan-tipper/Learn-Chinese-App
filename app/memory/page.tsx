"use client";

import { useEffect, useState } from "react";
import { authedFetch } from "@/lib/authed-fetch";

type Memory = { id: string; key: string; value: string; type: string };

export default function MemoryPage() {
  const [memories, setMemories] = useState<Memory[]>([]);

  async function refresh() {
    const response = await authedFetch("/api/memory/list");
    if (!response.ok) {
      setMemories([]);
      return;
    }
    const data = await response.json();
    setMemories(data.memories ?? []);
  }

  async function remove(memoryId: string) {
    await authedFetch("/api/memory/delete", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ memoryId })
    });
    refresh();
  }

  useEffect(() => {
    refresh();
  }, []);

  return (
    <section>
      <h2>What I remember about you</h2>
      <button onClick={refresh} type="button">Refresh</button>
      {memories.map((memory) => (
        <div className="card" key={memory.id}>
          <strong>{memory.key}</strong>
          <p>{memory.value}</p>
          <small>Type: {memory.type}</small>
          <div><button onClick={() => remove(memory.id)} type="button">Forget</button></div>
        </div>
      ))}
      {!memories.length ? <p className="card">No memories yet. Chat more and ask the coach to remember preferences.</p> : null}
    </section>
  );
}
