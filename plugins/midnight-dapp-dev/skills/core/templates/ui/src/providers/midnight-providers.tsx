import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import { createProviders, type ConnectedProviders } from "{{API_PACKAGE_NAME}}";
import { useWallet } from "@/hooks/use-wallet";

interface MidnightProvidersContextValue {
  providers: ConnectedProviders | null;
  isReady: boolean;
  error: string | null;
}

const MidnightProvidersContext =
  createContext<MidnightProvidersContextValue | null>(null);

export function MidnightProvidersProvider({
  children,
}: {
  children: ReactNode;
}) {
  const { connectedApi, status } = useWallet();
  const [providers, setProviders] = useState<ConnectedProviders | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (status !== "connected" || !connectedApi) {
      setProviders(null);
      setError(null);
      return;
    }

    let cancelled = false;
    let created: ConnectedProviders | null = null;

    // The keys, ZKIR and contract manifest are served next to the page, under
    // Vite's base path (copy them into public/ with copy-contract-keys).
    const zkAssetsUrl = new URL(import.meta.env.BASE_URL, window.location.origin).toString();

    createProviders(connectedApi, { zkAssetsUrl })
      .then((p) => {
        created = p;
        if (cancelled) {
          void p.dispose();
          return;
        }
        setProviders(p);
        setError(null);
      })
      .catch((err) => {
        if (!cancelled) {
          setError(
            err instanceof Error ? err.message : "Failed to create providers",
          );
        }
      });

    return () => {
      cancelled = true;
      // Close the old providers' indexer connection on reconnect or disconnect.
      void created?.dispose();
    };
  }, [connectedApi, status]);

  return (
    <MidnightProvidersContext.Provider
      value={{ providers, isReady: providers !== null, error }}
    >
      {children}
    </MidnightProvidersContext.Provider>
  );
}

export function useMidnightProviders(): MidnightProvidersContextValue {
  const context = useContext(MidnightProvidersContext);
  if (!context) {
    throw new Error(
      "useMidnightProviders must be used within a MidnightProvidersProvider",
    );
  }
  return context;
}
