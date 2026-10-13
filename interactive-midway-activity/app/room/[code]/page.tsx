"use client";

import { FormEvent, useCallback, useEffect, useRef, useState } from "react";
import { useParams } from "next/navigation";
import type { RealtimeChannel } from "@supabase/supabase-js";
import { ConfigNotice } from "@/components/ConfigNotice";
import { Histogram } from "@/components/Histogram";
import { PhasePill } from "@/components/PhasePill";
import { StatCard } from "@/components/StatCard";
import { formatNumber } from "@/lib/math";
import { hasSupabaseConfig, supabase } from "@/lib/supabase";
import type { PlayerState } from "@/lib/types";

type SampleRow = { value: number | string };

export default function PlayerRoomPage() {
  const params = useParams<{ code: string }>();
  const code = (params.code ?? "").toUpperCase();
  const [participantId, setParticipantId] = useState<string | null>(null);
  const [player, setPlayer] = useState<PlayerState | null>(null);
  const [sample, setSample] = useState<number[]>([]);
  const [allValues, setAllValues] = useState<number[]>([]);
  const [name, setName] = useState("");
  const [chosenValue, setChosenValue] = useState(50);
  const [guessMean, setGuessMean] = useState("");
  const [guessStddev, setGuessStddev] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const channel = useRef<RealtimeChannel | null>(null);

  const load = useCallback(async (id: string) => {
    const { data, error: rpcError } = await supabase().rpc("get_player_state", {
      p_code: code,
      p_participant_id: id,
    });

    if (rpcError || !data?.[0]) {
      setError(rpcError?.message ?? "This room is no longer available.");
      setLoading(false);
      return;
    }

    const next = data[0] as PlayerState;
    setPlayer(next);
    if (next.own_value !== null) setChosenValue(Number(next.own_value));
    if (next.own_guess_mean !== null) setGuessMean(String(next.own_guess_mean));
    if (next.own_guess_stddev !== null) setGuessStddev(String(next.own_guess_stddev));

    if (next.phase === "guessing" || next.phase === "revealed") {
      const { data: sampleData } = await supabase().rpc("get_visible_sample", {
        p_code: code,
        p_participant_id: id,
      });
      setSample(((sampleData ?? []) as SampleRow[]).map((row) => Number(row.value)));
    }

    if (next.phase === "revealed") {
      const { data: fullData } = await supabase().rpc("get_visible_full_distribution", {
        p_code: code,
        p_participant_id: id,
      });
      setAllValues(((fullData ?? []) as SampleRow[]).map((row) => Number(row.value)));
    }
    setLoading(false);
  }, [code]);

  useEffect(() => {
    if (!hasSupabaseConfig() || !code) return;
    const saved = localStorage.getItem(`outthink-player-${code}`);
    if (saved) setParticipantId(saved);
    else setLoading(false);
  }, [code]);

  useEffect(() => {
    if (!participantId) return;
    void load(participantId);
    // Broadcast handles phase changes immediately. This slower fallback keeps a room
    // consistent if a phone misses a WebSocket event without flooding Supabase.
    const timer = window.setInterval(() => void load(participantId), 3000);
    return () => window.clearInterval(timer);
  }, [participantId, load]);

  useEffect(() => {
    if (!hasSupabaseConfig() || !participantId) return;
    const liveChannel = supabase()
      .channel(`outthink:${code}`, { config: { broadcast: { self: false } } })
      .on("broadcast", { event: "changed" }, () => void load(participantId))
      .subscribe();
    channel.current = liveChannel;
    return () => {
      channel.current = null;
      void supabase().removeChannel(liveChannel);
    };
  }, [code, load, participantId]);

  async function joinRoom(event: FormEvent) {
    event.preventDefault();
    if (!name.trim()) return setError("Add a name so you can be counted.");
    setBusy(true);
    setError("");
    const { data, error: rpcError } = await supabase().rpc("join_room", {
      p_code: code,
      p_display_name: name.trim(),
    });
    setBusy(false);
    if (rpcError || !data?.[0]) return setError(rpcError?.message ?? "Couldn’t join this room.");
    const id = String(data[0].participant_id);
    localStorage.setItem(`outthink-player-${code}`, id);
    setParticipantId(id);
  }

  async function submitNumber(event: FormEvent) {
    event.preventDefault();
    if (!participantId) return;
    setBusy(true);
    setError("");
    const { error: rpcError } = await supabase().rpc("submit_response", {
      p_code: code,
      p_participant_id: participantId,
      p_value: chosenValue,
    });
    setBusy(false);
    if (rpcError) return setError(rpcError.message);
    void load(participantId);
  }

  async function submitEstimate(event: FormEvent) {
    event.preventDefault();
    if (!participantId) return;
    const average = Number(guessMean);
    const standardDeviation = Number(guessStddev);
    if (!Number.isFinite(average) || !Number.isFinite(standardDeviation) || average < 0 || average > 100 || standardDeviation < 0 || standardDeviation > 100) {
      return setError("Use values from 0 to 100 for both estimates.");
    }
    setBusy(true);
    setError("");
    const { error: rpcError } = await supabase().rpc("submit_guess", {
      p_code: code,
      p_participant_id: participantId,
      p_guess_mean: average,
      p_guess_stddev: standardDeviation,
    });
    setBusy(false);
    if (rpcError) return setError(rpcError.message);
    void load(participantId);
  }

  if (!hasSupabaseConfig()) return <ConfigNotice />;

  if (!participantId) {
    return (
      <main className="centered-page room-background">
        <section className="panel join-room-panel">
          <a href="/" className="back-link">← Outthink the Room</a>
          <p className="eyebrow">Room {code || "—"}</p>
          <h1>Ready to think strategically?</h1>
          <p>Use a name your facilitator can recognize. Your answer stays private until the reveal.</p>
          <form onSubmit={joinRoom}>
            <label htmlFor="display-name">Your name</label>
            <input id="display-name" value={name} onChange={(event) => setName(event.target.value)} placeholder="e.g. Maya" maxLength={50} autoFocus />
            <button className="button button-primary" disabled={busy}>{busy ? "Joining…" : "Join this room"}</button>
          </form>
          {error && <p className="error-text">{error}</p>}
        </section>
      </main>
    );
  }

  if (loading || !player) {
    return <main className="centered-page room-background"><p className="loading-text">Connecting to room {code}…</p></main>;
  }

  const numberSubmitted = player.own_value !== null;
  const guessSubmitted = player.own_guess_mean !== null;

  return (
    <main className={`room-background mission-${player.phase}`}>
      <header className="room-header">
        <a href="/" className="wordmark">OUTTHINK <i>THE ROOM</i></a>
        <div><span className="room-code">ROOM {code}</span><PhasePill phase={player.phase} /></div>
      </header>

      <section className="game-shell">
        <div className="room-title-row">
          <div><p className="eyebrow">{player.phase === "collecting" ? "Classified drop // round one" : player.phase === "guessing" ? "The casino floor // round two" : "Vault opened // final results"}</p><h1>{player.title}</h1></div>
          <span className="live-count"><i /> {player.response_count} response{player.response_count === 1 ? "" : "s"}</span>
        </div>

        {player.phase === "collecting" && (
          <section className="panel game-panel intel-panel">
            <p className="prompt-number">CLASSIFIED // DROP 01</p>
            <h2>Choose your cover number.</h2>
            <p className="panel-intro">Transmit one private signal from 0–100. Nobody sees your number until the vault opens. Choose carefully: the room is making its own moves.</p>
            <form onSubmit={submitNumber} className="number-form">
              <div className="intel-console"><span>ENCRYPTED INTEL TOKEN</span><i>/// PRIVATE CHANNEL ACTIVE</i></div>
              <div className="number-readout"><input aria-label="Chosen number" type="number" min="0" max="100" step="1" value={chosenValue} onChange={(event) => setChosenValue(Math.max(0, Math.min(100, Number(event.target.value))))} /><span>/ 100</span></div>
              <input aria-label="Chosen number slider" className="range-input" type="range" min="0" max="100" value={chosenValue} onChange={(event) => setChosenValue(Number(event.target.value))} />
              <div className="range-labels"><span>0</span><span>50</span><span>100</span></div>
              <button className="button button-primary" disabled={busy}>{busy ? "Encrypting…" : numberSubmitted ? "Replace encrypted number" : "Transmit encrypted number"}</button>
            </form>
            {numberSubmitted && <p className="success-text">Signal secured. You can replace your cover number until the handler closes the room.</p>}
          </section>
        )}

        {player.phase === "guessing" && (
          <section className="panel game-panel sample-panel casino-panel">
            <div className="jackpot-strip"><span>♦ TABLE OPEN ♦ TABLE OPEN ♦ TABLE OPEN ♦</span></div>
            <p className="prompt-number">PLACE YOUR TOKENS // ROUND 02</p>
            <h2>Read the table. Call the outcome.</h2>
            <p className="panel-intro">A random <b>{player.sample_percent}%</b> sample is on the felt: <b>{sample.length}</b> of <b>{player.response_count}</b> secret numbers. The rest stay hidden. Put your fictional intel tokens on the full-room mean and spread.</p>
            <div className="casino-chart"><span>LIVE SAMPLE // NO HOUSE EDGE</span><Histogram values={sample} /></div>
            <form onSubmit={submitEstimate} className="estimate-form">
              <div className="estimate-input"><label htmlFor="mean">Mean reel, μ</label><input id="mean" inputMode="decimal" type="number" min="0" max="100" step="0.1" placeholder="42.5" value={guessMean} onChange={(event) => setGuessMean(event.target.value)} /></div>
              <div className="estimate-input"><label htmlFor="stddev">Spread reel, σ</label><input id="stddev" inputMode="decimal" type="number" min="0" max="100" step="0.1" placeholder="18.2" value={guessStddev} onChange={(event) => setGuessStddev(event.target.value)} /></div>
              <button className="button button-primary" disabled={busy}>{busy ? "Placing…" : guessSubmitted ? "Replace token estimates" : "Place token estimates"}</button>
            </form>
            {guessSubmitted && <p className="success-text">Tokens placed. The vault determines the payout when the handler reveals the room.</p>}
          </section>
        )}

        {player.phase === "revealed" && (
          <section className="panel game-panel reveal-panel payout-panel">
            <p className="prompt-number">VAULT OPENED // RESULTS</p>
            <h2>All signals decoded.</h2>
            <p className="panel-intro">The pale bars were hidden while you played. These results use every submitted response. Your token score is based only on how close your two estimates were—not on chance or money.</p>
            <Histogram values={allValues} />
            <div className="stat-grid">
              <StatCard label="Actual mean, μ" value={formatNumber(Number((allValues.reduce((sum, value) => sum + value, 0) / Math.max(allValues.length, 1))))} detail={guessSubmitted ? `Your guess: ${formatNumber(player.own_guess_mean)}` : "No estimate submitted"} />
              <StatCard label="Actual standard deviation, σ" value={formatNumber(calculateStddev(allValues))} detail={guessSubmitted ? `Your guess: ${formatNumber(player.own_guess_stddev)}` : "No estimate submitted"} />
              <StatCard label="Intel token payout" value={guessSubmitted ? `${calculateScore(player.own_guess_mean, player.own_guess_stddev, allValues).toLocaleString()}` : "—"} detail={guessSubmitted ? "Fictional classroom tokens" : "No estimate submitted"} />
            </div>
          </section>
        )}

        {error && <p className="error-text game-error">{error}</p>}
      </section>
    </main>
  );
}

function calculateStddev(values: number[]) {
  if (!values.length) return 0;
  const average = values.reduce((sum, value) => sum + value, 0) / values.length;
  return Math.sqrt(values.reduce((sum, value) => sum + (value - average) ** 2, 0) / values.length);
}

function calculateScore(guessedMean: number | null, guessedStddev: number | null, values: number[]) {
  if (guessedMean === null || guessedStddev === null || !values.length) return 0;
  const actualMean = values.reduce((sum, value) => sum + value, 0) / values.length;
  const actualStddev = calculateStddev(values);
  const totalError = Math.abs(Number(guessedMean) - actualMean) + Math.abs(Number(guessedStddev) - actualStddev);
  return Math.max(0, Math.round(1000 - totalError * 20));
}
