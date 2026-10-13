"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useParams } from "next/navigation";
import type { RealtimeChannel } from "@supabase/supabase-js";
import { ConfigNotice } from "@/components/ConfigNotice";
import { PhasePill } from "@/components/PhasePill";
import { StatCard } from "@/components/StatCard";
import { formatNumber } from "@/lib/math";
import { hasSupabaseConfig, supabase } from "@/lib/supabase";
import type { HostSummary } from "@/lib/types";

export default function HostRoomPage() {
  const params = useParams<{ code: string }>();
  const code = (params.code ?? "").toUpperCase();
  const [token, setToken] = useState<string | null>(null);
  const [summary, setSummary] = useState<HostSummary | null>(null);
  const [samplePercent, setSamplePercent] = useState(50);
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState("");
  const channel = useRef<RealtimeChannel | null>(null);

  const load = useCallback(async (hostToken: string) => {
    const { data, error: rpcError } = await supabase().rpc("host_room_summary", {
      p_code: code,
      p_host_token: hostToken,
    });
    if (rpcError || !data?.[0]) {
      setError(rpcError?.message ?? "This host link is unavailable.");
      return;
    }
    const next = data[0] as HostSummary;
    setSummary(next);
    if (next.phase === "collecting") setSamplePercent(Number(next.sample_percent));
  }, [code]);

  useEffect(() => {
    if (!hasSupabaseConfig() || !code) return;
    const saved = localStorage.getItem(`outthink-host-${code}`);
    if (!saved) {
      setError("This browser doesn’t hold the host key for this room. Open the host link on the device that created it.");
      return;
    }
    setToken(saved);
  }, [code]);

  useEffect(() => {
    if (!token) return;
    void load(token);
    const timer = window.setInterval(() => void load(token), 1500);
    return () => window.clearInterval(timer);
  }, [load, token]);

  useEffect(() => {
    if (!token || !hasSupabaseConfig()) return;
    const liveChannel = supabase()
      .channel(`outthink:${code}`, { config: { broadcast: { self: false } } })
      .on("broadcast", { event: "changed" }, () => void load(token))
      .subscribe();
    channel.current = liveChannel;
    return () => {
      channel.current = null;
      void supabase().removeChannel(liveChannel);
    };
  }, [code, load, token]);

  function announceChange() {
    void channel.current?.send({ type: "broadcast", event: "changed", payload: {} });
  }

  async function closeResponses() {
    if (!token) return;
    if (!summary?.response_count) return setError("Wait for at least one response before closing the room.");
    setBusy(true);
    setError("");
    const { error: rpcError } = await supabase().rpc("host_close_responses", {
      p_code: code,
      p_host_token: token,
      p_sample_percent: samplePercent,
    });
    setBusy(false);
    if (rpcError) return setError(rpcError.message);
    announceChange();
    void load(token);
  }

  async function revealResults() {
    if (!token) return;
    setBusy(true);
    setError("");
    const { error: rpcError } = await supabase().rpc("host_reveal_results", {
      p_code: code,
      p_host_token: token,
    });
    setBusy(false);
    if (rpcError) return setError(rpcError.message);
    announceChange();
    void load(token);
  }

  async function copyJoinLink() {
    await navigator.clipboard.writeText(`${window.location.origin}/room/${code}`);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1800);
  }

  if (!hasSupabaseConfig()) return <ConfigNotice />;

  if (!token || !summary) {
    return <main className="centered-page room-background"><p className={error ? "error-text" : "loading-text"}>{error || "Opening your host controls…"}</p></main>;
  }

  const joinUrl = `${typeof window === "undefined" ? "" : window.location.origin}/room/${code}`;

  return (
    <main className="host-background">
      <header className="room-header host-header">
        <a href="/" className="wordmark">OUTTHINK <i>THE ROOM</i></a>
        <div><span className="host-badge">FACILITATOR</span><PhasePill phase={summary.phase} /></div>
      </header>
      <section className="host-shell">
        <div className="host-title-row">
          <div><p className="eyebrow">Live room controls</p><h1>{summary.title}</h1></div>
          <div className="room-code-display"><span>Room code</span><strong>{code}</strong></div>
        </div>

        <section className="panel share-panel">
          <div><p className="eyebrow">Step 1</p><h2>Get everyone into the room.</h2><p>Share the code or put the join link on your slides.</p></div>
          <div className="join-link"><span>{joinUrl}</span><button className="button button-dark" onClick={copyJoinLink}>{copied ? "Copied" : "Copy link"}</button></div>
        </section>

        <section className="host-stat-grid">
          <StatCard label="Joined" value={String(summary.participant_count)} detail="Players in this room" />
          <StatCard label="Numbers submitted" value={String(summary.response_count)} detail={summary.phase === "collecting" ? "Updates live" : "Responses locked"} />
          <StatCard label="Estimates submitted" value={String(summary.guess_count)} detail={summary.phase === "guessing" ? "Updates live" : summary.phase === "revealed" ? "Final count" : "Opens next"} />
        </section>

        {summary.phase === "collecting" && (
          <section className="panel control-panel">
            <p className="eyebrow">Step 2</p>
            <h2>Choose how much data to reveal.</h2>
            <p>When you close responses, each player sees a random <b>{samplePercent}%</b> sample of the room—not the full set.</p>
            <div className="sample-control">
              <input aria-label="Percent of responses to reveal" type="range" min="1" max="100" value={samplePercent} onChange={(event) => setSamplePercent(Number(event.target.value))} />
              <output>{samplePercent}%</output>
            </div>
            <div className="sample-presets">
              {[25, 50, 75, 100].map((percent) => <button key={percent} className={samplePercent === percent ? "preset-selected" : ""} onClick={() => setSamplePercent(percent)}>{percent}%</button>)}
            </div>
            <button className="button button-primary button-large" onClick={closeResponses} disabled={busy || summary.response_count === 0}>{busy ? "Closing…" : `Close responses & reveal ${samplePercent}% sample`}</button>
            <p className="fine-print">Closing is final: no one can change or add a number afterward.</p>
          </section>
        )}

        {summary.phase === "guessing" && (
          <section className="panel control-panel">
            <p className="eyebrow">Step 3</p>
            <h2>Let the room estimate the unseen data.</h2>
            <p>Players can now see a random <b>{summary.sample_percent}%</b> sample and are estimating the mean and population standard deviation of all {summary.response_count} responses.</p>
            <div className="guess-progress"><div style={{ width: `${Math.min(100, (summary.guess_count / Math.max(1, summary.response_count)) * 100)}%` }} /><span>{summary.guess_count} of {summary.response_count} estimates submitted</span></div>
            <button className="button button-primary button-large" onClick={revealResults} disabled={busy}>{busy ? "Revealing…" : "Reveal full distribution & results"}</button>
          </section>
        )}

        {summary.phase === "revealed" && (
          <section className="panel control-panel final-host-panel">
            <p className="eyebrow">Results</p>
            <h2>The room has its answer.</h2>
            <div className="host-stat-grid results-grid">
              <StatCard label="Full-room mean, μ" value={formatNumber(summary.actual_mean)} detail="All submitted numbers" />
              <StatCard label="Population standard deviation, σ" value={formatNumber(summary.actual_stddev)} detail="Calculated over all responses" />
              <StatCard label="Sample shown" value={`${summary.sample_percent}%`} detail={`${summary.sample_count} responses visible before reveal`} />
            </div>
          </section>
        )}
        {error && <p className="error-text game-error">{error}</p>}
      </section>
    </main>
  );
}
