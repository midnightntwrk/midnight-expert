import { WalletProvider } from "@/providers/wallet-context";
import { MidnightProvidersProvider } from "@/providers/midnight-providers";
import { WalletWidget } from "@/components/wallet-widget";
import { NetworkBadge } from "@/components/network-badge";
import { ProofServerStatus } from "@/components/proof-server-status";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

export function App() {
  return (
    <WalletProvider>
      <MidnightProvidersProvider>
        <div className="min-h-screen bg-background">
          <header className="border-b">
            <div className="container mx-auto flex items-center justify-between px-4 py-3">
              <h1 className="text-lg font-semibold">{{PROJECT_NAME}}</h1>
              <div className="flex items-center gap-3">
                <NetworkBadge />
                {/* Pass proofServerUrl when createProviders uses proving: { mode: "local" } */}
                <ProofServerStatus />
                <WalletWidget />
              </div>
            </div>
          </header>
          <main className="container mx-auto px-4 py-8">
            <Card>
              <CardHeader>
                <CardTitle>Welcome to {{PROJECT_NAME}}</CardTitle>
                <CardDescription>
                  Connect your Lace wallet to get started. Your contract
                  components go here.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-muted-foreground">
                  This template provides wallet connection, Midnight provider
                  assembly, and reactive state management. Wire up your contract
                  in the API package to start building.
                </p>
              </CardContent>
            </Card>
          </main>
        </div>
      </MidnightProvidersProvider>
    </WalletProvider>
  );
}
