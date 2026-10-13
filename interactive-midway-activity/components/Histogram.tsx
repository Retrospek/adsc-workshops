"use client";

import { histogram } from "@/lib/math";

export function Histogram({ values, muted = false }: { values: number[]; muted?: boolean }) {
  const bins = histogram(values);
  const maximum = Math.max(1, ...bins.map((bin) => bin.count));

  return (
    <div className={`histogram ${muted ? "histogram-muted" : ""}`} role="img" aria-label="Distribution histogram">
      <div className="histogram-bars">
        {bins.map((bin) => (
          <div className="histogram-bin" key={bin.label}>
            <span className="histogram-value">{bin.count || ""}</span>
            <div className="histogram-track">
              <div className="histogram-bar" style={{ height: `${(bin.count / maximum) * 100}%` }} />
            </div>
            <span className="histogram-label">{bin.label}</span>
          </div>
        ))}
      </div>
      <p className="chart-axis">Submitted number</p>
    </div>
  );
}
