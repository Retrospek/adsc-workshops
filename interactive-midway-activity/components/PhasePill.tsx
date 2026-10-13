import type { RoomPhase } from "@/lib/types";

const labels: Record<RoomPhase, string> = {
  collecting: "Accepting numbers",
  guessing: "Estimating results",
  revealed: "Results revealed",
};

export function PhasePill({ phase }: { phase: RoomPhase }) {
  return <span className={`phase-pill phase-${phase}`}>{labels[phase]}</span>;
}
