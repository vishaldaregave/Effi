"use client";

import { ClerkProvider } from "@clerk/nextjs";
import { ConvexReactClient } from "convex/react";
import { ConvexProviderWithClerk } from "convex/react-clerk";
import { useAuth } from "@clerk/nextjs";
import type { ReactNode } from "react";

const convexUrl = process.env.NEXT_PUBLIC_CONVEX_URL;
const clerkKey = process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY;
const convex = convexUrl ? new ConvexReactClient(convexUrl) : null;

function MissingConfiguration() {
  const missing = [
    !clerkKey && "NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY",
    !convexUrl && "NEXT_PUBLIC_CONVEX_URL",
  ].filter((name): name is string => Boolean(name));

  return (
    <main className="min-h-screen flex items-center justify-center p-6 bg-[#f8f7f3]">
      <div className="max-w-md w-full rounded-2xl border border-[#e1dfd9] bg-white p-8 shadow-sm">
        <div className="flex items-center gap-3 mb-4">
          <div className="h-8 w-8 rounded-lg bg-[#e8f0f8] flex items-center justify-center text-[#174f88] font-bold text-lg">
            E
          </div>
          <h1 className="text-xl font-serif text-[#123b68]">Effi Dashboard Setup</h1>
        </div>
        <p className="text-sm text-[#60738a] leading-relaxed mb-4">
          The officer dashboard requires authentication and backend environment variables.
        </p>
        <div className="rounded-lg bg-[#f2f3f3] p-4 text-xs font-mono text-[#123b68] mb-4 space-y-1">
          <div className="text-[#7b8998] font-sans text-[11px] uppercase tracking-wider mb-2">Missing Variables:</div>
          {missing.map((key) => (
            <div key={key} className="text-[#8f2f2f] font-semibold">{key}</div>
          ))}
        </div>
        <p className="text-xs text-[#7b8998] leading-normal">
          Copy <code className="bg-[#f2f3f3] px-1 py-0.5 rounded text-[#123b68]">apps/officer-dashboard/.env.example</code> to <code className="bg-[#f2f3f3] px-1 py-0.5 rounded text-[#123b68]">.env.local</code> and supply your Clerk and Convex keys.
        </p>
      </div>
    </main>
  );
}

function ConvexProvider({ children }: { children: ReactNode }) {
  if (!convex) return children;
  return <ConvexProviderWithClerk client={convex} useAuth={useAuth}>{children}</ConvexProviderWithClerk>;
}

export function AppProviders({ children }: { children: ReactNode }) {
  if (!clerkKey || !convex) return <MissingConfiguration />;
  return <ClerkProvider publishableKey={clerkKey}><ConvexProvider>{children}</ConvexProvider></ClerkProvider>;
}
