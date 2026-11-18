import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { WalletProvider } from "../providers/wallet-context";
import { useWallet } from "../hooks/use-wallet";

function TestConsumer() {
  const { status, shieldedAddress, error, connect, disconnect } = useWallet();
  return (
    <div>
      <span data-testid="status">{status}</span>
      <span data-testid="address">{shieldedAddress ?? "none"}</span>
      <span data-testid="error">{error ?? "none"}</span>
      <button onClick={connect}>connect</button>
      <button onClick={disconnect}>disconnect</button>
    </div>
  );
}

describe("WalletContext", () => {
  beforeEach(() => {
    localStorage.clear();
    delete (window as unknown as Record<string, unknown>).midnight;
  });

  it("starts disconnected", () => {
    render(
      <WalletProvider>
        <TestConsumer />
      </WalletProvider>,
    );
    expect(screen.getByTestId("status")).toHaveTextContent("disconnected");
    expect(screen.getByTestId("address")).toHaveTextContent("none");
  });

  it("shows error when wallet not found", async () => {
    const user = userEvent.setup();
    render(
      <WalletProvider>
        <TestConsumer />
      </WalletProvider>,
    );

    await user.click(screen.getByText("connect"));

    expect(screen.getByTestId("status")).toHaveTextContent("error");
    expect(screen.getByTestId("error")).toHaveTextContent("No Midnight wallet");
  });

  it("connects successfully with mock wallet", async () => {
    const mockApi = {
      getConfiguration: vi.fn().mockResolvedValue({
        indexerUri: "http://localhost:8088/api/v3/graphql",
        indexerWsUri: "ws://localhost:8088/api/v3/graphql/ws",
        substrateNodeUri: "http://localhost:9944",
        networkId: "undeployed",
      }),
      getShieldedAddresses: vi.fn().mockResolvedValue({
        shieldedAddress: "mn_shield_test1abc123",
        shieldedCoinPublicKey: "coinpub123",
        shieldedEncryptionPublicKey: "encpub123",
      }),
    };

    (window as unknown as Record<string, unknown>).midnight = {
      mnLace: {
        name: "Lace",
        apiVersion: "4.1.0",
        icon: "",
        rdns: "lace",
        connect: vi.fn().mockResolvedValue(mockApi),
      },
    };

    const user = userEvent.setup();
    render(
      <WalletProvider>
        <TestConsumer />
      </WalletProvider>,
    );

    await user.click(screen.getByText("connect"));

    await vi.waitFor(() => {
      expect(screen.getByTestId("status")).toHaveTextContent("connected");
    });

    expect(screen.getByTestId("address")).toHaveTextContent(
      "mn_shield_test1abc123",
    );
  });

  it("disconnects and clears state", async () => {
    const user = userEvent.setup();
    render(
      <WalletProvider>
        <TestConsumer />
      </WalletProvider>,
    );

    await user.click(screen.getByText("disconnect"));

    expect(screen.getByTestId("status")).toHaveTextContent("disconnected");
    expect(screen.getByTestId("address")).toHaveTextContent("none");
  });
});
