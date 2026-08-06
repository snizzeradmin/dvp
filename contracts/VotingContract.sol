// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/**
 * @title VotingContract
 * @notice Secure, tamper-proof election contract.
 *         All vote-integrity decisions are made here — never on the backend.
 */
contract VotingContract {
    // ─── State ────────────────────────────────────────────────────────────────

    address public immutable owner;
    string  public electionTitle;
    bool    public votingOpen;

    struct Candidate {
        string name;
        string party;
        uint256 voteCount;
        bool exists;
    }

    // candidateId (0-indexed) → Candidate
    mapping(uint256 => Candidate) private candidates;
    uint256 public candidateCount;

    // voter address → whether they are authorized
    mapping(address => bool) private authorizedVoters;

    // voter address → whether they have voted
    mapping(address => bool) private hasVotedMap;

    // voter address → the candidateId they voted for (for transparency)
    mapping(address => uint256) private voterChoice;

    // ─── Events ───────────────────────────────────────────────────────────────

    event VoterAuthorized(address indexed voter, uint256 timestamp);
    event VoteCast(address indexed voter, uint256 indexed candidateId, uint256 timestamp);
    event VotingOpened(string electionTitle, uint256 timestamp);
    event VotingClosed(uint256 timestamp);

    // ─── Modifiers ────────────────────────────────────────────────────────────

    modifier onlyOwner() {
        require(msg.sender == owner, "VotingContract: caller is not the owner");
        _;
    }

    modifier whenVotingOpen() {
        require(votingOpen, "VotingContract: voting is not currently open");
        _;
    }

    modifier whenVotingClosed() {
        require(!votingOpen, "VotingContract: voting is currently open");
        _;
    }

    // ─── Constructor ──────────────────────────────────────────────────────────

    /**
     * @param _electionTitle Human-readable name for this election
     * @param _candidateNames Array of candidate names
     * @param _candidateParties Array of candidate parties (same length as names)
     */
    constructor(
        string memory _electionTitle,
        string[] memory _candidateNames,
        string[] memory _candidateParties
    ) {
        require(_candidateNames.length > 0, "VotingContract: need at least one candidate");
        require(
            _candidateNames.length == _candidateParties.length,
            "VotingContract: name/party array length mismatch"
        );

        owner = msg.sender;
        electionTitle = _electionTitle;
        votingOpen = false;

        for (uint256 i = 0; i < _candidateNames.length; i++) {
            candidates[i] = Candidate({
                name: _candidateNames[i],
                party: _candidateParties[i],
                voteCount: 0,
                exists: true
            });
        }
        candidateCount = _candidateNames.length;
    }

    // ─── Admin functions ──────────────────────────────────────────────────────

    /**
     * @notice Authorize a voter wallet to participate in this election
     */
    function authorizeVoter(address voter) external onlyOwner {
        require(voter != address(0), "VotingContract: invalid voter address");
        authorizedVoters[voter] = true;
        emit VoterAuthorized(voter, block.timestamp);
    }

    /**
     * @notice Authorize multiple voters in a single transaction
     */
    function authorizeVotersBatch(address[] calldata voters) external onlyOwner {
        for (uint256 i = 0; i < voters.length; i++) {
            require(voters[i] != address(0), "VotingContract: invalid address in batch");
            authorizedVoters[voters[i]] = true;
            emit VoterAuthorized(voters[i], block.timestamp);
        }
    }

    /**
     * @notice Open voting (only possible when closed)
     */
    function openVoting() external onlyOwner whenVotingClosed {
        votingOpen = true;
        emit VotingOpened(electionTitle, block.timestamp);
    }

    /**
     * @notice Close voting (only possible when open)
     */
    function closeVoting() external onlyOwner whenVotingOpen {
        votingOpen = false;
        emit VotingClosed(block.timestamp);
    }

    // ─── Voter functions ──────────────────────────────────────────────────────

    /**
     * @notice Cast a vote for a candidate
     * @param candidateId 0-indexed candidate identifier
     */
    function castVote(uint256 candidateId) external whenVotingOpen {
        require(authorizedVoters[msg.sender], "VotingContract: caller is not an authorized voter");
        require(!hasVotedMap[msg.sender],     "VotingContract: caller has already voted");
        require(candidateId < candidateCount, "VotingContract: invalid candidate ID");
        require(candidates[candidateId].exists, "VotingContract: candidate does not exist");

        hasVotedMap[msg.sender] = true;
        voterChoice[msg.sender] = candidateId;
        candidates[candidateId].voteCount++;

        emit VoteCast(msg.sender, candidateId, block.timestamp);
    }

    // ─── View functions ───────────────────────────────────────────────────────

    function hasVoted(address voter) external view returns (bool) {
        return hasVotedMap[voter];
    }

    function isAuthorized(address voter) external view returns (bool) {
        return authorizedVoters[voter];
    }

    function getCandidate(uint256 candidateId)
        external
        view
        returns (string memory name, string memory party, uint256 voteCount)
    {
        require(candidateId < candidateCount, "VotingContract: invalid candidate ID");
        Candidate storage c = candidates[candidateId];
        return (c.name, c.party, c.voteCount);
    }

    /**
     * @notice Get full election results — all candidates with vote counts
     */
    function getResults()
        external
        view
        returns (
            string[] memory names,
            string[] memory parties,
            uint256[] memory votes
        )
    {
        names   = new string[](candidateCount);
        parties = new string[](candidateCount);
        votes   = new uint256[](candidateCount);

        for (uint256 i = 0; i < candidateCount; i++) {
            names[i]   = candidates[i].name;
            parties[i] = candidates[i].party;
            votes[i]   = candidates[i].voteCount;
        }
    }

    /**
     * @notice Returns the candidate ID a voter chose (reverts if they haven't voted)
     */
    function getVoterChoice(address voter) external view returns (uint256) {
        require(hasVotedMap[voter], "VotingContract: voter has not voted");
        return voterChoice[voter];
    }
}
