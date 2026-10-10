export function Footer() {
  return (
    <footer className="border-t border-line">
      <div className="mx-auto flex max-w-6xl flex-col gap-2 px-5 py-8 text-sm text-faint sm:flex-row sm:items-center sm:justify-between">
        <p>AgentFlow AI is a portfolio project. The public demo has daily usage limits.</p>
        <p>Built with Next.js, TypeScript, Supabase, and the Anthropic API.</p>
      </div>
    </footer>
  );
}
