import { describe, it, expect, beforeEach } from "vitest";
import { stringAsciiCV, uintCV, optionalCV, listCV, buffCV, boolCV, principalCV } from "@stacks/transactions";

const ERR_NOT_AUTHORIZED = 100;
const ERR_INVALID_HASH = 101;
const ERR_INVALID_TIER = 102;
const ERR_INVALID_TITLE = 103;
const ERR_INVALID_DESCRIPTION = 104;
const ERR_INVALID_EDITION_LIMIT = 105;
const ERR_EDITION_LIMIT_REACHED = 106;
const ERR_INVALID_ROYALTY_RATE = 107;
const ERR_PAUSED = 108;
const ERR_INVALID_METADATA_URI = 109;
const ERR_INVALID_TAGS = 110;
const ERR_NFT_NOT_FOUND = 111;
const ERR_NOT_OWNER = 112;
const ERR_TRANSFER_NOT_ALLOWED = 113;
const ERR_INVALID_FEE = 114;
const ERR_INSUFFICIENT_BALANCE = 115;

interface NFTMetadata {
  creator: string;
  tourTitle: string;
  description: string;
  contentHash: Uint8Array;
  accessTier: string;
  mintTime: number;
  editionLimit: number;
  editionCount: number;
  royaltyRate: number;
  isTransferable: boolean;
  metadataUri: string | null;
  tags: string[];
}

interface Result<T> {
  ok: boolean;
  value: T;
}

class NFTMintContractMock {
  state: {
    lastNftId: number;
    contractOwner: string;
    mintFee: number;
    maxEditionLimit: number;
    paused: boolean;
    nftMetadata: Map<number, NFTMetadata>;
    nftOwners: Map<number, string>;
  } = {
    lastNftId: 0,
    contractOwner: "ST1TEST",
    mintFee: 1000,
    maxEditionLimit: 100,
    paused: false,
    nftMetadata: new Map(),
    nftOwners: new Map(),
  };
  blockHeight: number = 0;
  caller: string = "ST1TEST";
  registry: Set<string> = new Set(["ST1TEST"]);
  stxTransfers: Array<{ amount: number; from: string; to: string }> = [];

  constructor() {
    this.reset();
  }

  reset() {
    this.state = {
      lastNftId: 0,
      contractOwner: "ST1TEST",
      mintFee: 1000,
      maxEditionLimit: 100,
      paused: false,
      nftMetadata: new Map(),
      nftOwners: new Map(),
    };
    this.blockHeight = 0;
    this.caller = "ST1TEST";
    this.registry = new Set(["ST1TEST"]);
    this.stxTransfers = [];
  }

  isRegisteredInstitution(principal: string): boolean {
    return this.registry.has(principal);
  }

  setPaused(newPaused: boolean): Result<boolean> {
    if (this.caller !== this.state.contractOwner) return { ok: false, value: ERR_NOT_AUTHORIZED };
    this.state.paused = newPaused;
    return { ok: true, value: true };
  }

  setMintFee(newFee: number): Result<boolean> {
    if (this.caller !== this.state.contractOwner) return { ok: false, value: ERR_NOT_AUTHORIZED };
    if (newFee <= 0) return { ok: false, value: ERR_INVALID_FEE };
    this.state.mintFee = newFee;
    return { ok: true, value: true };
  }

  setMaxEditionLimit(newLimit: number): Result<boolean> {
    if (this.caller !== this.state.contractOwner) return { ok: false, value: ERR_NOT_AUTHORIZED };
    if (newLimit <= 0) return { ok: false, value: ERR_INVALID_EDITION_LIMIT };
    this.state.maxEditionLimit = newLimit;
    return { ok: true, value: true };
  }

  mintNft(
    tourTitle: string,
    description: string,
    contentHash: Uint8Array,
    accessTier: string,
    editionLimit: number,
    royaltyRate: number,
    isTransferable: boolean,
    metadataUri: string | null,
    tags: string[]
  ): Result<number> {
    if (this.state.paused) return { ok: false, value: ERR_PAUSED };
    if (!this.isRegisteredInstitution(this.caller)) return { ok: false, value: ERR_NOT_AUTHORIZED };
    if (tourTitle.length === 0 || tourTitle.length > 100) return { ok: false, value: ERR_INVALID_TITLE };
    if (description.length > 500) return { ok: false, value: ERR_INVALID_DESCRIPTION };
    if (contentHash.length !== 32) return { ok: false, value: ERR_INVALID_HASH };
    if (!["basic", "premium", "exclusive"].includes(accessTier)) return { ok: false, value: ERR_INVALID_TIER };
    if (editionLimit <= 0 || editionLimit > this.state.maxEditionLimit) return { ok: false, value: ERR_INVALID_EDITION_LIMIT };
    if (royaltyRate > 20) return { ok: false, value: ERR_INVALID_ROYALTY_RATE };
    if (metadataUri && metadataUri.length > 256) return { ok: false, value: ERR_INVALID_METADATA_URI };
    if (tags.length > 10) return { ok: false, value: ERR_INVALID_TAGS };

    this.stxTransfers.push({ amount: this.state.mintFee, from: this.caller, to: this.state.contractOwner });

    const nftId = this.state.lastNftId + 1;
    const metadata: NFTMetadata = {
      creator: this.caller,
      tourTitle,
      description,
      contentHash,
      accessTier,
      mintTime: this.blockHeight,
      editionLimit,
      editionCount: 1,
      royaltyRate,
      isTransferable,
      metadataUri,
      tags,
    };
    this.state.nftMetadata.set(nftId, metadata);
    this.state.nftOwners.set(nftId, this.caller);
    this.state.lastNftId = nftId;
    return { ok: true, value: nftId };
  }

  transferNft(nftId: number, recipient: string): Result<boolean> {
    const metadata = this.state.nftMetadata.get(nftId);
    if (!metadata) return { ok: false, value: ERR_NFT_NOT_FOUND };
    const owner = this.state.nftOwners.get(nftId);
    if (!owner || owner !== this.caller) return { ok: false, value: ERR_NOT_OWNER };
    if (!metadata.isTransferable) return { ok: false, value: ERR_TRANSFER_NOT_ALLOWED };
    this.state.nftOwners.set(nftId, recipient);
    return { ok: true, value: true };
  }

  getNftDetails(nftId: number): NFTMetadata | null {
    return this.state.nftMetadata.get(nftId) || null;
  }

  getNftOwner(nftId: number): string | null {
    return this.state.nftOwners.get(nftId) || null;
  }

  getLastNftId(): Result<number> {
    return { ok: true, value: this.state.lastNftId };
  }

  isPaused(): Result<boolean> {
    return { ok: true, value: this.state.paused };
  }

  getMintFee(): Result<number> {
    return { ok: true, value: this.state.mintFee };
  }
}

describe("NFTMintContract", () => {
  let contract: NFTMintContractMock;

  beforeEach(() => {
    contract = new NFTMintContractMock();
    contract.reset();
  });

  it("mints an NFT successfully", () => {
    const contentHash = new Uint8Array(32).fill(0);
    const result = contract.mintNft(
      "Tour1",
      "Desc",
      contentHash,
      "basic",
      10,
      5,
      true,
      "uri",
      ["tag1"]
    );
    expect(result.ok).toBe(true);
    expect(result.value).toBe(1);
    const details = contract.getNftDetails(1);
    expect(details?.tourTitle).toBe("Tour1");
    expect(details?.accessTier).toBe("basic");
    expect(details?.editionLimit).toBe(10);
    expect(details?.royaltyRate).toBe(5);
    expect(details?.isTransferable).toBe(true);
    expect(details?.metadataUri).toBe("uri");
    expect(details?.tags).toEqual(["tag1"]);
    expect(contract.stxTransfers).toEqual([{ amount: 1000, from: "ST1TEST", to: "ST1TEST" }]);
    const owner = contract.getNftOwner(1);
    expect(owner).toBe("ST1TEST");
  });

  it("rejects mint when paused", () => {
    contract.setPaused(true);
    const contentHash = new Uint8Array(32).fill(0);
    const result = contract.mintNft(
      "Tour1",
      "Desc",
      contentHash,
      "basic",
      10,
      5,
      true,
      "uri",
      ["tag1"]
    );
    expect(result.ok).toBe(false);
    expect(result.value).toBe(ERR_PAUSED);
  });

  it("rejects mint with invalid title", () => {
    const contentHash = new Uint8Array(32).fill(0);
    const result = contract.mintNft(
      "",
      "Desc",
      contentHash,
      "basic",
      10,
      5,
      true,
      "uri",
      ["tag1"]
    );
    expect(result.ok).toBe(false);
    expect(result.value).toBe(ERR_INVALID_TITLE);
  });

  it("rejects mint with invalid hash", () => {
    const contentHash = new Uint8Array(31).fill(0);
    const result = contract.mintNft(
      "Tour1",
      "Desc",
      contentHash,
      "basic",
      10,
      5,
      true,
      "uri",
      ["tag1"]
    );
    expect(result.ok).toBe(false);
    expect(result.value).toBe(ERR_INVALID_HASH);
  });

  it("transfers NFT successfully", () => {
    const contentHash = new Uint8Array(32).fill(0);
    contract.mintNft(
      "Tour1",
      "Desc",
      contentHash,
      "basic",
      10,
      5,
      true,
      "uri",
      ["tag1"]
    );
    const result = contract.transferNft(1, "ST2RECIP");
    expect(result.ok).toBe(true);
    expect(result.value).toBe(true);
    const owner = contract.getNftOwner(1);
    expect(owner).toBe("ST2RECIP");
  });

  it("rejects transfer if not owner", () => {
    const contentHash = new Uint8Array(32).fill(0);
    contract.mintNft(
      "Tour1",
      "Desc",
      contentHash,
      "basic",
      10,
      5,
      true,
      "uri",
      ["tag1"]
    );
    contract.caller = "ST3FAKE";
    const result = contract.transferNft(1, "ST2RECIP");
    expect(result.ok).toBe(false);
    expect(result.value).toBe(ERR_NOT_OWNER);
  });

  it("rejects transfer if not transferable", () => {
    const contentHash = new Uint8Array(32).fill(0);
    contract.mintNft(
      "Tour1",
      "Desc",
      contentHash,
      "basic",
      10,
      5,
      false,
      "uri",
      ["tag1"]
    );
    const result = contract.transferNft(1, "ST2RECIP");
    expect(result.ok).toBe(false);
    expect(result.value).toBe(ERR_TRANSFER_NOT_ALLOWED);
  });

  it("sets mint fee successfully", () => {
    const result = contract.setMintFee(2000);
    expect(result.ok).toBe(true);
    expect(result.value).toBe(true);
    expect(contract.state.mintFee).toBe(2000);
  });

  it("rejects set mint fee if not owner", () => {
    contract.caller = "ST3FAKE";
    const result = contract.setMintFee(2000);
    expect(result.ok).toBe(false);
    expect(result.value).toBe(ERR_NOT_AUTHORIZED);
  });

  it("gets last NFT ID correctly", () => {
    const contentHash = new Uint8Array(32).fill(0);
    contract.mintNft(
      "Tour1",
      "Desc",
      contentHash,
      "basic",
      10,
      5,
      true,
      "uri",
      ["tag1"]
    );
    const result = contract.getLastNftId();
    expect(result.ok).toBe(true);
    expect(result.value).toBe(1);
  });

  it("checks paused status", () => {
    contract.setPaused(true);
    const result = contract.isPaused();
    expect(result.ok).toBe(true);
    expect(result.value).toBe(true);
  });

  it("gets mint fee", () => {
    const result = contract.getMintFee();
    expect(result.ok).toBe(true);
    expect(result.value).toBe(1000);
  });
});