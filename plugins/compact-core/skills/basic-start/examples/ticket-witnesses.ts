import type { WitnessContext } from "@midnight-ntwrk/midnight-js-protocol/v9/compact-runtime";
import type { Ledger, Witnesses } from "./managed/ticket/contract/index.js";
import crypto from "node:crypto";

// The ticket's secret and randomness live only in private state on this machine.
export type TicketPrivateState = {
  readonly secret: Uint8Array;
  readonly randomness: Uint8Array;
};

export function createTicketState(): TicketPrivateState {
  return { secret: crypto.randomBytes(32), randomness: crypto.randomBytes(32) };
}

export const ticketWitnesses: Witnesses<TicketPrivateState> = {
  ticket_secret: ({ privateState }: WitnessContext<Ledger, TicketPrivateState>) => [privateState, privateState.secret],

  ticket_randomness: ({ privateState }: WitnessContext<Ledger, TicketPrivateState>) => [
    privateState,
    privateState.randomness,
  ],

  // The Merkle path proving this ticket's commitment is in the `tickets` tree,
  // read from the current public ledger state.
  get_ticket_path: ({ privateState, ledger }: WitnessContext<Ledger, TicketPrivateState>, commitment: Uint8Array) => {
    const path = ledger.tickets.findPathForLeaf(commitment);
    if (!path) throw new Error("Ticket commitment not found in tree");
    return [privateState, path];
  },
};
