#!/usr/bin/env -S deno run --allow-read

import { Server } from "npm:@modelcontextprotocol/sdk@1.8.0/server/index.js";
import { StdioServerTransport } from "npm:@modelcontextprotocol/sdk@1.8.0/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "npm:@modelcontextprotocol/sdk@1.8.0/types.js";

import init, { decode } from "npm:@stellar/stellar-xdr-json@23.0.0-rc.1";
await init();

import {
  GetObjectCommand,
  ListObjectsV2Command,
  S3Client,
} from "npm:@aws-sdk/client-s3@3.844.0";
import { ZstdCodec } from "npm:zstd-codec@0.1.5";

const AWS_BUCKET = "aws-public-blockchain";

const cache = await caches.open("ledger_data");

const server = new Server(
  {
    name: "mcp-stellar-meta",
    version: "0.1.0",
  },
  {
    capabilities: {
      tools: {},
    },
  },
);

server.setRequestHandler(ListToolsRequestSchema, async () => {
  return {
    tools: [
      {
        name: "latest_ledger",
        description: "Get the latest ledger sequence number.",
        inputSchema: {
          type: "object",
          properties: {},
          required: [],
        },
      },
      {
        name: "ledger_get_transaction_hashes",
        description:
          "Get list of transaction hashes of transactions in a Stellar ledger.",
        inputSchema: {
          type: "object",
          properties: {
            ledgerSequence: {
              type: "string",
              description: "The ledger sequence number.",
            },
          },
          required: ["ledgerSequence"],
        },
      },
      {
        name: "transaction_get_details",
        description:
          "Get all details about a transaction from a Stellar ledger.",
        inputSchema: {
          type: "object",
          properties: {
            ledgerSequence: {
              type: "string",
              description: "The ledger sequence number.",
            },
            transactionHash: {
              type: "string",
              description:
                "The transaction hash of the transaction (like the ID).",
            },
          },
          required: ["ledgerSequence", "transactionHash"],
        },
      },
    ],
  };
});

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const s3Client = new S3Client({
    region: "us-east-2",
    credentials: { accessKeyId: "", secretAccessKey: "" },
    signer: { sign: async (req) => req },
  });

  switch (request.params.name) {
    case "latest_ledger": {
      try {
        const rootPrefix = "v1.1/stellar/ledgers/pubnet/";
        const listCommand = new ListObjectsV2Command({
          Bucket: AWS_BUCKET,
          Prefix: rootPrefix,
          MaxKeys: 1000,
        });
        const response = await s3Client.send(listCommand);
        if (!response.Contents || response.Contents.length === 0) {
          throw new Error("No ledger files found");
        }
        const sequenceNumbers = response.Contents
          .map((obj) => {
            const parts = obj.Key.split("/");
            const filename = parts.pop();
            const match = filename.match(/--(\d+)\.xdr\.zstd$/);
            return match ? parseInt(match[1], 10) : 0;
          })
          .filter((seq) => seq > 0);
        const latestLedgerSequence = Math.max(...sequenceNumbers);
        return {
          content: [{
            type: "text",
            text: `${latestLedgerSequence}`,
          }],
        };
      } catch (error) {
        return {
          content: [{
            type: "text",
            text: `Error finding latest ledger: ${error.message}`,
          }],
        };
      }
    }

    case "ledger_get_transaction_hashes": {
      const ledgerSequence = String(request.params.arguments?.ledgerSequence);
      try {
        const ledger = await getLedger(s3Client, ledgerSequence);
        const txHashes = ledger.v1.tx_processing.map((t) =>
          t.result.transaction_hash
        );
        const truncTxHashes = txHashes.map((h) => h.slice(0, 9));
        return {
          content: [{
            type: "text",
            text: JSON.stringify(truncTxHashes),
          }],
        };
      } catch (error) {
        return {
          content: [{
            type: "text",
            text: `Error fetching ledger ${ledgerSequence}: ${error}.`,
          }],
        };
      }
    }

    case "transaction_get_details": {
      const ledgerSequence = String(request.params.arguments?.ledgerSequence);
      const txHash = String(request.params.arguments?.transactionHash);
      try {
        const ledger = await getLedger(s3Client, ledgerSequence);
        // const txs = ledger.v1.tx_set.v1.phases.flatMap((p) =>
        //   p.v0.flatMap((p) => p.txset_comp_txs_maybe_discounted_fee.txs)
        // );
        // const txs_hashes = txs.map((t) => {
        //   '{"network_id":"Public Global Stellar Network ; September 2015","tagged_transaction":{"tx":inputs}}'
        // })
        const tx_idx = ledger.v1.tx_processing.findIndex((t) =>
          t.result.transaction_hash.slice(0, txHash.length) == txHash
        );
        const tx_processing = ledger.v1.tx_processing[tx_idx];
        // const tx = txs[tx_idx];
        const data = {
          // envelope: tx,
          result: tx_processing.result,
          events: tx_processing.tx_apply_processing.v3?.soroban_meta?.events,
        };
        return {
          content: [{
            type: "text",
            text: JSON.stringify(data),
          }],
        };
      } catch (error) {
        return {
          content: [{
            type: "text",
            text: `Error fetching ledger ${ledgerSequence}: ${error}.`,
          }],
        };
      }
    }

    default:
      throw new Error("Unknown tool");
  }
});

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch((error) => {
  console.error("Server error:", error);
  Deno.exit(1);
});

// Helper functions

function getPathForLedger(ledgerSequence) {
  const seq = Number(ledgerSequence);

  const PARTITION_SIZE = 64000;
  const BATCH_SIZE = 1;
  const MAX_UINT32 = 0xFFFFFFFF;

  // Calculate partition boundaries
  const partitionStart = Math.floor(seq / PARTITION_SIZE) * PARTITION_SIZE;
  const partitionEnd = partitionStart + PARTITION_SIZE - 1;

  // Calculate batch boundaries
  const ledgersIntoPartition = seq % PARTITION_SIZE;
  const batchStart = partitionStart +
    Math.floor(ledgersIntoPartition / BATCH_SIZE) * BATCH_SIZE;

  // Calculate hex prefixes using inverted sequence numbers
  const partitionPrefixHex = (MAX_UINT32 - partitionStart)
    .toString(16)
    .padStart(8, "0")
    .toUpperCase();

  const batchPrefixHex = (MAX_UINT32 - batchStart)
    .toString(16)
    .padStart(8, "0")
    .toUpperCase();

  // Assemble path components
  const partitionDir =
    `${partitionPrefixHex}--${partitionStart}-${partitionEnd}`;
  const batchFile = `${batchPrefixHex}--${batchStart}.xdr.zstd`;

  return `v1.1/stellar/ledgers/pubnet/${partitionDir}/${batchFile}`;
}

const streamToBuffer = async (stream) => {
  const chunks = [];
  for await (const chunk of stream) {
    chunks.push(chunk);
  }
  return Buffer.concat(chunks);
};

async function getLedger(s3Client, ledgerSequence) {
  let ledgerXdr;
  const cacheUrl = `http://localhost/${ledgerSequence}.xdr`;
  const cached = await cache.match(cacheUrl);
  if (cached) {
    ledgerXdr = Buffer.from(await cached.arrayBuffer());
  } else {
    const key = getPathForLedger(ledgerSequence);
    const getObjectParams = {
      Bucket: AWS_BUCKET,
      Key: key,
    };
    const command = new GetObjectCommand(getObjectParams);
    const response = await s3Client.send(command);
    const compressedBuffer = await streamToBuffer(response.Body);
    ledgerXdr = await new Promise((resolve, reject) => {
      ZstdCodec.run((zstd) => {
        try {
          const streaming = new zstd.Streaming();
          resolve(Buffer.from(streaming.decompress(compressedBuffer)));
        } catch (error) {
          reject(error);
        }
      });
    });
    await cache.put(cacheUrl, new Response(ledgerXdr));
  }
  const base64XdrString = ledgerXdr.toString("base64");
  const batchJson = decode("LedgerCloseMetaBatch", base64XdrString);
  const batch = JSON.parse(batchJson);
  // Assumption: That batches only ever contain one ledger.
  return batch.ledger_close_metas[0];
}
