{
  "schemaVersion": 1,
  "ok": true,
  "command": "examples",
  "network": null,
  "data": {
    "repo": "midnightntwrk/midnight-examples",
    "commit": "4056c6cf773596bccc2a15fac32cc817d6143a39",
    "toolchain": {
      "Compact language (pragma)": "0.23",
      "Compact compiler (setup-compact-action)": "0.31.1",
      "@midnight-ntwrk/midnight-js-*": "4.1.1",
      "@midnight-ntwrk/testkit-js": "4.1.1",
      "wallet SDK": "1.2.0",
      "Node.js": "22",
      "Yarn": "4.18.0",
      "Vitest": "4.1.0"
    },
    "topic": "DUST sponsorship",
    "matches": [
      {
        "name": "private-party",
        "summary": "Private on-chain data, access control, and DUST sponsorship: one wallet pays the fees for another's transaction",
        "url": "https://github.com/midnightntwrk/midnight-examples/tree/4056c6cf773596bccc2a15fac32cc817d6143a39/examples/private-party",
        "topics": [
          "dust sponsorship",
          "sponsor fees",
          "pay fees for another user",
          "access control",
          "commitment",
          "hashed set membership",
          "private guest list"
        ],
        "files": [
          {
            "path": "examples/private-party/src/sponsor.ts",
            "symbol": "export async function sponsorAndSubmit",
            "about": "Having a sponsor wallet pay the DUST fee and submit",
            "lines": [
              96,
              115
            ],
            "url": "https://github.com/midnightntwrk/midnight-examples/blob/4056c6cf773596bccc2a15fac32cc817d6143a39/examples/private-party/src/sponsor.ts#L96-L115",
            "excerpt": "export async function sponsorAndSubmit(\n  logger: Logger,\n  sponsor: MidnightWalletProvider,\n  userTxHex: string,\n): Promise<string> {\n  // The marker triple matches `FinalizedTransaction = Transaction<SignatureEnabled, Proof, Binding>`.\n  const userTx = Transaction.deserialize<SignatureEnabled, Proof, Binding>(\n    'signature',\n    'proof',\n    'binding',\n    fromHex(userTxHex),\n  );\n\n  logger.info('[sponsor] attaching DUST fee offer...');\n  const sponsored = await sponsor.addDustFeesAndFinalize(userTx);\n\n  const txId = await sponsor.wallet.submitTransaction(sponsored);\n  logger.info(`[sponsor] submitted sponsored tx: ${txId}`);\n  return txId;\n}"
          }
        ],
        "filesMatched": true
      }
    ]
  },
  "warnings": [],
  "error": null,
  "next": []
}
