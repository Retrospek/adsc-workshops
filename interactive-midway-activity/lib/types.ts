export type RoomPhase = "collecting" | "guessing" | "revealed";

export type PlayerState = {
  title: string;
  phase: RoomPhase;
  participant_count: number;
  response_count: number;
  sample_count: number;
  sample_percent: number;
  own_value: number | null;
  own_guess_mean: number | null;
  own_guess_stddev: number | null;
};

export type HostSummary = {
  title: string;
  phase: RoomPhase;
  participant_count: number;
  response_count: number;
  guess_count: number;
  sample_count: number;
  sample_percent: number;
  actual_mean: number | null;
  actual_stddev: number | null;
};
