export function ConfigNotice() {
  return (
    <main className="centered-page">
      <section className="panel setup-panel">
        <p className="eyebrow">One small setup step</p>
        <h1>Connect Supabase to start a live room.</h1>
        <p>
          Add <code>NEXT_PUBLIC_SUPABASE_URL</code> and <code>NEXT_PUBLIC_SUPABASE_ANON_KEY</code> to <code>.env.local</code>,
          then run the SQL in <code>supabase/schema.sql</code> in Supabase’s SQL Editor.
        </p>
      </section>
    </main>
  );
}
