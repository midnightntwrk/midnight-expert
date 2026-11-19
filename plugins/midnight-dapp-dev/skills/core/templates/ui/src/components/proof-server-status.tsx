import { useEffect, useState } from "react";
import { Badge } from "@/components/ui/badge";

const POLL_MS = 10_000;

// Shows whether a local proof server answers. It only matters when the DApp
// proves locally (createProviders with proving: { mode: "local" }), so pass
// that URL to show the badge; without one it renders nothing. With the default
// wallet proving, the wallet generates proofs itself.
export function ProofServerStatus({ proofServerUrl }: { proofServerUrl?: string }) {
  const [isOnline, setIsOnline] = useState<boolean | null>(null);

  useEffect(() => {
    if (!proofServerUrl) {
      setIsOnline(null);
      return;
    }
    let cancelled = false;

    async function check() {
      try {
        // The proof server's /health answers 200 when it's up.
        const response = await fetch(`${proofServerUrl}/health`);
        if (!cancelled) setIsOnline(response.ok);
      } catch {
        if (!cancelled) setIsOnline(false);
      }
    }

    check();
    const timer = setInterval(check, POLL_MS);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [proofServerUrl]);

  if (isOnline === null) return null;

  return (
    <Badge variant={isOnline ? "secondary" : "destructive"}>
      Local proof server: {isOnline ? "Online" : "Offline"}
    </Badge>
  );
}
