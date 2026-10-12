{
  "schemaVersion": 1,
  "ok": true,
  "command": "decode",
  "network": null,
  "data": {
    "raw": "1010: Invalid Transaction: Custom error: 171",
    "parsed": {
      "substrate1010": true,
      "ledgerCodes": [
        "171"
      ],
      "palletModules": [],
      "jsonRpcCodes": [],
      "ledgerNames": []
    },
    "decodings": [
      {
        "kind": "substrate",
        "code": 1010,
        "name": "InvalidTransaction",
        "description": "Substrate transaction pool rejected the extrinsic. This is an envelope code, not a Midnight ledger code.",
        "steps": [
          "Find Custom error: N in the error message (u8, 0–255).",
          "Run: midnight-cast decode ledger N   (or: midnight-cast decode N)",
          "If DispatchError::Module { index, error }, run: midnight-cast decode pallet <index> <error>",
          "If there is no inner Custom(N), rejection was upstream Substrate validation (nonce, fee, size, etc.)."
        ],
        "docUrl": "https://docs.midnight.network/how-to/decode-1010-transaction-rejection-errors",
        "ledgerDocUrl": "https://docs.midnight.network/nodes/error-codes"
      },
      {
        "kind": "ledger",
        "code": 171,
        "name": "OutOfDustValidityWindow",
        "description": "DUST outside validity time window",
        "fix": "Use fresher DUST",
        "docUrl": "https://docs.midnight.network/nodes/error-codes",
        "network": "preprod",
        "ledger": "8.1.3",
        "mapLedger": "8.1.3",
        "networkLedger": "8.1.3",
        "mapUpdated": "2026-10",
        "relatedHint": "Indexers before 4.3.5 could also reject the first transaction of a block with this error (fixed in 4.3.4 and 4.3.5). If only first-in-block transactions fail, check the indexer version."
      }
    ]
  },
  "warnings": [],
  "error": null,
  "next": [
    {
      "command": "midnight-cast explain 1010",
      "reason": "How to read a 1010 rejection",
      "tool": {
        "name": "explain",
        "arguments": {
          "topic": "1010"
        }
      }
    },
    {
      "command": "midnight-cast versions preprod",
      "reason": "Compare the indexer version with the support matrix"
    }
  ]
}
