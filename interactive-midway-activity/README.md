# Outthink the Room

A five-minute, live game-theory activity for a workshop. Students submit a number from 0–100; the facilitator closes responses and chooses how much of the room’s data to show (1–100%). Students see that random sample as a histogram, estimate the whole-room mean and population standard deviation, and then see the complete distribution.

## Run locally

1. Create a Supabase project.
2. In its SQL Editor, run [`supabase/schema.sql`](./supabase/schema.sql) in full.
3. Copy `.env.example` to `.env.local` and fill in the project URL and anon key from Supabase’s **Connect** dialog.
4. Install and run:

   ```powershell
   npm install
   npm run dev
   ```

5. Open `http://localhost:3000`. Create a room from the landing page. Share the room code or its join link with students.

## Run a round

1. Students enter the room code and a name, then submit a 0–100 number.
2. On the facilitator page, choose how much to reveal with the **sample** slider. The default is 50%, but the host can choose 1–100%.
3. Click **Close responses**. The app randomly and permanently selects that proportion of responses and displays only that sample to students.
4. Students estimate the mean (μ) and population standard deviation (σ) for the full room.
5. Click **Reveal full distribution & results**.

The app uses Supabase RPCs rather than direct table access. The unrevealed values cannot be requested by student clients before the reveal. Browser Broadcast events plus a lightweight 1.5-second refresh keep facilitator counts and phase changes live even if Broadcast is unavailable.

## Deploy to Vercel

1. Push this `interactive-midway-activity` directory to a Git repository, or import it as the Vercel project’s root directory.
2. In Vercel, add `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY` as Production environment variables.
3. Deploy. Vercel detects Next.js automatically.

Only the public Supabase URL and anon key belong in Vercel. The SQL keeps the host token and raw response tables private behind narrowly scoped database functions.
