"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { ConfigNotice } from "@/components/ConfigNotice";
import { hasSupabaseConfig, supabase } from "@/lib/supabase";

export default function HomePage() {
  const router = useRouter();
  const [roomCode, setRoomCode] = useState("");
  const [title, setTitle] = useState("Outthink the Room");
  const [busy, setBusy] = useState<"join" | "create" | null>(null);
  const [error, setError] = useState("");

  if (!hasSupabaseConfig()) return <ConfigNotice />;

  async function createRoom(event: FormEvent) {
    event.preventDefault();
    setBusy("create");
    setError("");
    const { data, error: rpcError } = await supabase().rpc("create_room", { p_title: title.trim() || "Outthink the Room" });
    setBusy(null);

    if (rpcError || !data?.[0]) {
      setError(rpcError?.message ?? "Couldn’t create the room. Please try again.");
      return;
    }

    const room = data[0] as { code: string; host_token: string };
    localStorage.setItem(`outthink-host-${room.code}`, room.host_token);
    router.push(`/host/${room.code}`);
  }

  function joinRoom(event: FormEvent) {
    event.preventDefault();
    const code = roomCode.trim().toUpperCase();
    if (!/^[A-Z0-9]{6}$/.test(code)) {
      setError("Enter the six-character room code.");
      return;
    }
    setBusy("join");
    router.push(`/room/${code}`);
  }

  return (
    <main className="landing">
      <nav className="topbar"><span className="wordmark">OUTTHINK <i>THE ROOM</i></span><span className="nav-note">Game theory, live.</span></nav>
      <section className="hero-grid">
        <div className="hero-copy">
          <p className="eyebrow">A five-minute thinking game</p>
          <h1>Can you outthink everyone else?</h1>
          <p className="hero-subtitle">
            Choose a number. See a random half of the room. Then estimate what the whole room did.
          </p>
          <div className="game-rules">
            <span><b>01</b> Submit a number from 0–100</span>
            <span><b>02</b> Study a 50% sample</span>
            <span><b>03</b> Estimate μ and σ</span>
          </div>
        </div>

        <div className="landing-actions">
          <form className="panel join-card" onSubmit={joinRoom}>
            <p className="eyebrow">Playing?</p>
            <h2>Join a room</h2>
            <label htmlFor="room-code">Room code</label>
            <input id="room-code" value={roomCode} onChange={(event) => setRoomCode(event.target.value.toUpperCase())} placeholder="ABC123" maxLength={6} autoComplete="off" />
            <button className="button button-primary" disabled={busy !== null}>{busy === "join" ? "Opening room…" : "Join game"}</button>
          </form>

          <form className="host-row" onSubmit={createRoom}>
            <label htmlFor="game-title">Hosting? Name your room</label>
            <div>
              <input id="game-title" value={title} onChange={(event) => setTitle(event.target.value)} maxLength={80} />
              <button className="button button-dark" disabled={busy !== null}>{busy === "create" ? "Creating…" : "Create room"}</button>
            </div>
          </form>
          {error && <p className="error-text">{error}</p>}
        </div>
      </section>
    </main>
  );
}
