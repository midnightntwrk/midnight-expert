{
  "schemaVersion": 1,
  "ok": true,
  "command": "decode",
  "network": null,
  "data": {
    "raw": "UnsupportedBlockVersion(1000300)",
    "parsed": {
      "substrate1010": false,
      "ledgerCodes": [],
      "palletModules": [],
      "jsonRpcCodes": [],
      "ledgerNames": []
    },
    "decodings": [
      {
        "kind": "message",
        "id": "unsupported-block-version",
        "name": "UnsupportedBlockVersion",
        "description": "The tool reading the chain doesn't know runtime 1.0.300 (spec_version 1000300), which Preview, Preprod and Mainnet run. Toolkit 1.0.0 and node 1.0.2 can't read its blocks.",
        "fix": "Upgrade the node and toolkit to 1.0.400, which Preview, Preprod and Mainnet run on runtime 1.0.300."
      }
    ]
  },
  "warnings": [],
  "error": null,
  "next": [
    {
      "command": "midnight-cast versions preprod",
      "reason": "See which versions the network expects"
    }
  ]
}
