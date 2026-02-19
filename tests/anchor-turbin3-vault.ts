import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { AnchorTurbin3Vault } from "../target/types/anchor_turbin3_vault";
import { expect } from "chai";

describe("anchor-turbin3-vault", () => {
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);

  const program = anchor.workspace
    .anchorTurbin3Vault as Program<AnchorTurbin3Vault>;
  const user = provider.wallet.publicKey;

  const [vaultStatePda, stateBump] =
    anchor.web3.PublicKey.findProgramAddressSync(
      [Buffer.from("state"), user.toBuffer()],
      program.programId,
    );

  const [vaultPda, vaultBump] = anchor.web3.PublicKey.findProgramAddressSync(
    [Buffer.from("vault"), user.toBuffer()],
    program.programId,
  );

  before(async () => {
    try {
      const tx = await provider.connection.requestAirdrop(
        user,
        2 * anchor.web3.LAMPORTS_PER_SOL,
      );
      await provider.connection.confirmTransaction(tx);
    } catch (e) {
      console.log(
        "Airdrop failed, but might be using localnet with pre-funded account",
      );
    }
  });

  it("Is initialized!", async () => {
    await program.methods
      .initialize()
      .accountsStrict({
        owner: user,
        vaultState: vaultStatePda,
        vault: vaultPda,
        systemProgram: anchor.web3.SystemProgram.programId,
      })
      .rpc();

    const vaultState = await program.account.vaultState.fetch(vaultStatePda);
    expect(vaultState.vaultBump).to.equal(vaultBump);
    expect(vaultState.stateBump).to.equal(stateBump);

    const vaultBalance = await provider.connection.getBalance(vaultPda);
    const rentExempt =
      await provider.connection.getMinimumBalanceForRentExemption(0);
    expect(vaultBalance).to.equal(rentExempt);
  });

  it("Deposit SOL into the vault", async () => {
    const depositAmount = 0.1 * anchor.web3.LAMPORTS_PER_SOL;

    const initialVaultBalance = await provider.connection.getBalance(vaultPda);
    const initialUserBalance = await provider.connection.getBalance(user);

    await program.methods
      .deposit(new anchor.BN(depositAmount))
      .accountsStrict({
        owner: user,
        vault: vaultPda,
        vaultState: vaultStatePda,
        systemProgram: anchor.web3.SystemProgram.programId,
      })
      .rpc();

    const finalVaultBalance = await provider.connection.getBalance(vaultPda);
    const finalUserBalance = await provider.connection.getBalance(user);

    expect(finalVaultBalance).to.equal(initialVaultBalance + depositAmount);
    expect(finalUserBalance).to.be.below(initialUserBalance - depositAmount);
  });

  it("Withdraw SOL from the vault", async () => {
    const withdrawAmount = 0.05 * anchor.web3.LAMPORTS_PER_SOL;

    const initialVaultBalance = await provider.connection.getBalance(vaultPda);
    const initialUserBalance = await provider.connection.getBalance(user);

    await program.methods
      .withdraw(new anchor.BN(withdrawAmount))
      .accountsStrict({
        owner: user,
        vault: vaultPda,
        vaultState: vaultStatePda,
        systemProgram: anchor.web3.SystemProgram.programId,
      })
      .rpc();

    const finalVaultBalance = await provider.connection.getBalance(vaultPda);
    const finalUserBalance = await provider.connection.getBalance(user);

    expect(finalVaultBalance).to.equal(initialVaultBalance - withdrawAmount);
    expect(finalUserBalance).to.be.above(initialUserBalance);
  });

  it("Close the vault", async () => {
    const initialVaultBalance = await provider.connection.getBalance(vaultPda);
    const initialVaultStateBalance = await provider.connection.getBalance(
      vaultStatePda,
    );
    const initialUserBalance = await provider.connection.getBalance(user);

    await program.methods
      .close()
      .accountsStrict({
        owner: user,
        vault: vaultPda,
        vaultState: vaultStatePda,
        systemProgram: anchor.web3.SystemProgram.programId,
      })
      .rpc();

    const finalUserBalance = await provider.connection.getBalance(user);

    expect(await provider.connection.getBalance(vaultPda)).to.equal(0);

    const vaultStateInfo = await provider.connection.getAccountInfo(
      vaultStatePda,
    );
    expect(vaultStateInfo).to.be.null;

    expect(finalUserBalance).to.be.above(initialUserBalance);
  });
});
