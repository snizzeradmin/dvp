const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("VotingContract", function () {
  let contract;
  let owner, voter1, voter2, nonVoter;

  const candidateNames  = ["Alice", "Bob", "Carol"];
  const candidateParties = ["Party A", "Party B", "Party C"];
  const electionTitle   = "Test Election 2026";

  beforeEach(async function () {
    [owner, voter1, voter2, nonVoter] = await ethers.getSigners();
    const VotingContract = await ethers.getContractFactory("VotingContract");
    contract = await VotingContract.deploy(electionTitle, candidateNames, candidateParties);
    await contract.waitForDeployment();
  });

  // ── Deployment ─────────────────────────────────────────────────────────────
  describe("Deployment", function () {
    it("sets the deployer as owner", async function () {
      expect(await contract.owner()).to.equal(owner.address);
    });

    it("stores the election title", async function () {
      expect(await contract.electionTitle()).to.equal(electionTitle);
    });

    it("creates the correct number of candidates", async function () {
      expect(await contract.candidateCount()).to.equal(3);
    });

    it("starts with voting closed", async function () {
      expect(await contract.votingOpen()).to.equal(false);
    });
  });

  // ── Voter authorization ────────────────────────────────────────────────────
  describe("Voter Authorization", function () {
    it("owner can authorize a voter", async function () {
      await contract.authorizeVoter(voter1.address);
      expect(await contract.isAuthorized(voter1.address)).to.equal(true);
    });

    it("non-owner cannot authorize a voter", async function () {
      await expect(
        contract.connect(voter1).authorizeVoter(voter2.address)
      ).to.be.revertedWith("VotingContract: caller is not the owner");
    });

    it("owner can authorize voters in batch", async function () {
      await contract.authorizeVotersBatch([voter1.address, voter2.address]);
      expect(await contract.isAuthorized(voter1.address)).to.equal(true);
      expect(await contract.isAuthorized(voter2.address)).to.equal(true);
    });

    it("emits VoterAuthorized event", async function () {
      await expect(contract.authorizeVoter(voter1.address))
        .to.emit(contract, "VoterAuthorized")
        .withArgs(voter1.address, await getTimestamp());
    });
  });

  // ── Voting open / close ────────────────────────────────────────────────────
  describe("Voting Control", function () {
    it("owner can open voting", async function () {
      await contract.openVoting();
      expect(await contract.votingOpen()).to.equal(true);
    });

    it("owner can close voting", async function () {
      await contract.openVoting();
      await contract.closeVoting();
      expect(await contract.votingOpen()).to.equal(false);
    });

    it("cannot open voting when already open", async function () {
      await contract.openVoting();
      await expect(contract.openVoting()).to.be.revertedWith(
        "VotingContract: voting is currently open"
      );
    });

    it("cannot close voting when already closed", async function () {
      await expect(contract.closeVoting()).to.be.revertedWith(
        "VotingContract: voting is not currently open"
      );
    });
  });

  // ── Vote casting ───────────────────────────────────────────────────────────
  describe("Vote Casting", function () {
    beforeEach(async function () {
      await contract.authorizeVoter(voter1.address);
      await contract.authorizeVoter(voter2.address);
      await contract.openVoting();
    });

    it("authorized voter can cast a vote", async function () {
      await contract.connect(voter1).castVote(0);
      expect(await contract.hasVoted(voter1.address)).to.equal(true);
    });

    it("records the vote count correctly", async function () {
      await contract.connect(voter1).castVote(1);
      await contract.connect(voter2).castVote(1);
      const [, , voteCount] = await contract.getCandidate(1);
      expect(voteCount).to.equal(2);
    });

    it("blocks double voting", async function () {
      await contract.connect(voter1).castVote(0);
      await expect(
        contract.connect(voter1).castVote(0)
      ).to.be.revertedWith("VotingContract: caller has already voted");
    });

    it("blocks unauthorized voters", async function () {
      await expect(
        contract.connect(nonVoter).castVote(0)
      ).to.be.revertedWith("VotingContract: caller is not an authorized voter");
    });

    it("blocks votes when voting is closed", async function () {
      await contract.closeVoting();
      await expect(
        contract.connect(voter1).castVote(0)
      ).to.be.revertedWith("VotingContract: voting is not currently open");
    });

    it("rejects invalid candidate ID", async function () {
      await expect(
        contract.connect(voter1).castVote(99)
      ).to.be.revertedWith("VotingContract: invalid candidate ID");
    });

    it("emits VoteCast event", async function () {
      await expect(contract.connect(voter1).castVote(2))
        .to.emit(contract, "VoteCast")
        .withArgs(voter1.address, 2, await getTimestamp());
    });
  });

  // ── Results ────────────────────────────────────────────────────────────────
  describe("Results", function () {
    it("returns full results with correct structure", async function () {
      await contract.authorizeVoter(voter1.address);
      await contract.authorizeVoter(voter2.address);
      await contract.openVoting();
      await contract.connect(voter1).castVote(0);
      await contract.connect(voter2).castVote(2);

      const [names, parties, votes] = await contract.getResults();
      expect(names.length).to.equal(3);
      expect(votes[0]).to.equal(1); // Alice got 1
      expect(votes[1]).to.equal(0); // Bob got 0
      expect(votes[2]).to.equal(1); // Carol got 1
    });
  });

  // ── Helper ─────────────────────────────────────────────────────────────────
  async function getTimestamp() {
    const block = await ethers.provider.getBlock("latest");
    return block.timestamp;
  }
});
