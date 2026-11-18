import { useEffect, useState } from "react";
import { DEFAULT_PROOF_SERVER_URL } from "{{API_PACKAGE_NAME}}";
import { Badge } from "@/components/ui/badge";

// Shows whether a local proof server answers. Only matters when the DApp
// proves locally (createProviders with proving: { mode: "local" }); with the
// default wallet proving, the wallet generates proofs itself.
export function ProofServerStatus({ url = DEFAULT_PROOF_SERVER_URL }: { url?: string }) {
  const [isOnline, setIsOnline] = useState<boolean | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function check() {
      try {
        // The proof server's /health answers 200 when it's up.
        const response = await fetch(`${url}/health`);
        if (!cancelled) setIsOnline(response.ok);
      } catch {
        if (!cancelled) setIsOnline(false);
      }
    }

    check();
    return () => {
      cancelled = true;
    };
  }, [url]);

  if (isOnline === null) return null;

  return (
    <Badge variant={isOnline ? "secondary" : "destructive"}>
      Local proof server: {isOnline ? "Online" : "Offline"}
    </Badge>
  );
}
