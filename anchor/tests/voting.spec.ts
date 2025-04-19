import * as anchor from "@coral-xyz/anchor";
import { Keypair, PublicKey } from "@solana/web3.js";
import { BankrunProvider, startAnchor } from "anchor-bankrun";
import { Voting } from "../target/types/voting";

const IDL = require("../target/idl/voting.json");
const PROGRAM_ID = new PublicKey(IDL.address);

describe("Voting", () => {
  let context;
  let provider;
  let votingProgram: anchor.Program<Voting>;

  beforeAll(async () => {
    context = await startAnchor('', [{ name: "voting", programId: PROGRAM_ID }], []);
    provider = new BankrunProvider(context);
    votingProgram = new anchor.Program<Voting>(
      IDL,
      provider,
    );
  });

  it("initializes a poll", async () => {
    await votingProgram.methods.initializePoll(
      new anchor.BN(1),
      "What is your favorite color?",
      new anchor.BN(100),
      new anchor.BN(1744700218),
    ).rpc();

    const [pollAddress] = PublicKey.findProgramAddressSync(
      [new anchor.BN(1).toArrayLike(Buffer, "le", 8)],
      votingProgram.programId,
    );

    const poll = await votingProgram.account.poll.fetch(pollAddress);

    console.log(poll);

    expect(poll.pollId.toNumber()).toBe(1);
    expect(poll.description).toBe("What is your favorite color?");
    expect(poll.pollStart.toNumber()).toBe(100);
  });

  // Test to check if poll_end is in the past. It should FAIL as poll_end must be in the future.
  it("fails if poll_end is less than current time", async () => {
    const now = Math.floor(Date.now() / 1000);
    try {
      await votingProgram.methods.initializePoll(
        new anchor.BN(2),
        "Invalid end time test",
        new anchor.BN(now + 100),         // start time in future
        new anchor.BN(now - 1000),          // end time in the past
      ).rpc();
      throw new Error("Expected poll_end validation to fail");
    } catch (err: any) {
      console.log("Expected failure:", err.message);
      expect(err.message).toMatch(/Poll end time cannot be in the past/);
    }
  });

  it("initializes candidates", async () => {
    await votingProgram.methods.initializeCandidate(
      "Pink",
      new anchor.BN(1),
    ).rpc();
    await votingProgram.methods.initializeCandidate(
      "Blue",
      new anchor.BN(1),
    ).rpc();

    const [pinkAddress] = PublicKey.findProgramAddressSync(
      [new anchor.BN(1).toArrayLike(Buffer, "le", 8), Buffer.from("Pink")],
      votingProgram.programId,
    );
    const pinkCandidate = await votingProgram.account.candidate.fetch(pinkAddress);
    console.log(pinkCandidate);
    expect(pinkCandidate.candidateVotes.toNumber()).toBe(0);
    expect(pinkCandidate.candidateName).toBe("Pink");

    const [blueAddress] = PublicKey.findProgramAddressSync(
      [new anchor.BN(1).toArrayLike(Buffer, "le", 8), Buffer.from("Blue")],
      votingProgram.programId,
    );
    const blueCandidate = await votingProgram.account.candidate.fetch(blueAddress);
    console.log(blueCandidate);
    expect(blueCandidate.candidateVotes.toNumber()).toBe(0);
    expect(blueCandidate.candidateName).toBe("Blue");

    // Check the poll account to see if candidateAmount is incremented
    const [pollAddress] = PublicKey.findProgramAddressSync(
      [new anchor.BN(1).toArrayLike(Buffer, "le", 8)],
      votingProgram.programId,
    );
    const poll = await votingProgram.account.poll.fetch(pollAddress);
    expect(poll.candidateAmount.toNumber()).toBe(2);
  });

  it("vote candidates", async () => {
    await votingProgram.methods.vote(
      "Pink",
      new anchor.BN(1),
    ).rpc();
    // This will now fail because the participant has already voted and we cannot use the same keypair to vote for second candidate i.e. blue
    // await votingProgram.methods.vote(
    //   "Blue",
    //   new anchor.BN(1),
    // ).rpc();

    const [pinkAddress] = PublicKey.findProgramAddressSync(
      [new anchor.BN(1).toArrayLike(Buffer, "le", 8), Buffer.from("Pink")],
      votingProgram.programId,
    );
    const pinkCandidate = await votingProgram.account.candidate.fetch(pinkAddress);
    console.log(pinkCandidate);
    expect(pinkCandidate.candidateVotes.toNumber()).toBe(1);
    expect(pinkCandidate.candidateName).toBe("Pink");

    // const [blueAddress] = PublicKey.findProgramAddressSync(
    //   [new anchor.BN(1).toArrayLike(Buffer, "le", 8), Buffer.from("Blue")],
    //   votingProgram.programId,
    // );
    // const blueCandidate = await votingProgram.account.candidate.fetch(blueAddress);
    // console.log(blueCandidate);
    // expect(blueCandidate.candidateVotes.toNumber()).toBe(1);
    // expect(blueCandidate.candidateName).toBe("Blue");
  });

  // Test if Poll is not started
  it("fails to vote before poll start time", async () => {
    const now = Math.floor(Date.now() / 1000);
    await votingProgram.methods
      .initializePoll(
        new anchor.BN(3),
        "What is your favorite fruit?",
        new anchor.BN(now + 10000), // future start time
        new anchor.BN(now + 20000) // future end time
      )
      .rpc();

    await votingProgram.methods
      .initializeCandidate("Mango", new anchor.BN(3))
      .rpc();

    try {
      await votingProgram.methods.vote("Mango", new anchor.BN(3)).rpc();
      throw new Error("Poll is not started yet, expected error not thrown");
    } catch (err: any) {
      console.log("Expected failure:", err.message);
      expect(err.message).toMatch(/Poll is not started yet/);
    }
  });

  // Test if Poll is already ended
  it("fails to vote after poll end time", async () => {
    const now = Math.floor(Date.now() / 1000);
    await votingProgram.methods
      .initializePoll(
        new anchor.BN(4),
        "What color is the sky?",
        new anchor.BN(now - 10000),
        new anchor.BN(now + 10) // keeping a very short time so that the poll ends quickly
      )
      .rpc();

    await votingProgram.methods
      .initializeCandidate("Blue", new anchor.BN(4))
      .rpc();

    try {
      await votingProgram.methods.vote("Blue", new anchor.BN(4)).rpc();
      throw new Error("Poll is already ended, expected error not thrown");
    } catch (err: any) {
      console.log("Expected failure:", err.message);
      expect(err.message).toMatch(/Poll is already ended/);
    }
  });

});