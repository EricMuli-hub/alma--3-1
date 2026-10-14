// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/// Alma registry. Role rules are enforced here, so no server or admin can bypass them.
/// Only fingerprints and storage addresses go on chain. Personal details never do.
contract AlmaRegistry {
    enum Role { None, Institution, Regulator }
    struct Rec { address issuer; string cid; uint64 issuedAt; bool revoked; bool held; bool erased; }
    struct Anchor { bytes32 head; uint64 blocks; uint64 at; }

    address public owner;
    mapping(address => Role) public roleOf;
    mapping(address => bool) public approved;
    mapping(bytes32 => Rec) private recs;
    Anchor[] public anchors;

    event RoleGranted(address indexed who, Role role);
    event Approval(address indexed institution, bool approved);
    event Issued(bytes32 indexed hash, address indexed issuer, string cid);
    event Revoked(bytes32 indexed hash, address indexed issuer);
    event Held(bytes32 indexed hash, address indexed by);
    event Released(bytes32 indexed hash, address indexed by);
    event Erased(bytes32 indexed hash);
    event Anchored(bytes32 head, uint64 blocks);

    error NotOwner();
    error WrongRole();
    error NotApproved();
    error AlreadyIssued();
    error Unknown();
    error NotIssuer();

    constructor() { owner = msg.sender; }

    modifier onlyOwner() { if (msg.sender != owner) revert NotOwner(); _; }
    modifier onlyRegulator() { if (roleOf[msg.sender] != Role.Regulator && msg.sender != owner) revert WrongRole(); _; }

    function grantRole(address who, Role r) external onlyOwner { roleOf[who] = r; emit RoleGranted(who, r); }

    function setApproved(address inst, bool v) external onlyOwner {
        if (roleOf[inst] != Role.Institution) revert WrongRole();
        approved[inst] = v; emit Approval(inst, v);
    }

    function issue(bytes32 h, string calldata cid) external {
        if (roleOf[msg.sender] != Role.Institution) revert WrongRole();
        if (!approved[msg.sender]) revert NotApproved();
        if (recs[h].issuer != address(0)) revert AlreadyIssued();
        recs[h] = Rec(msg.sender, cid, uint64(block.timestamp), false, false, false);
        emit Issued(h, msg.sender, cid);
    }

    function revoke(bytes32 h) external {
        Rec storage r = recs[h];
        if (r.issuer == address(0)) revert Unknown();
        if (r.issuer != msg.sender) revert NotIssuer();
        r.revoked = true; emit Revoked(h, msg.sender);
    }

    function hold(bytes32 h) external onlyRegulator {
        if (recs[h].issuer == address(0)) revert Unknown();
        recs[h].held = true; emit Held(h, msg.sender);
    }

    function release(bytes32 h) external onlyRegulator {
        if (recs[h].issuer == address(0)) revert Unknown();
        recs[h].held = false; emit Released(h, msg.sender);
    }

    /// The platform calls this when the record owner erases their details.
    function markErased(bytes32 h) external onlyOwner {
        if (recs[h].issuer == address(0)) revert Unknown();
        recs[h].erased = true; recs[h].cid = ""; emit Erased(h);
    }

    function anchor(bytes32 head, uint64 blocks) external onlyOwner {
        anchors.push(Anchor(head, blocks, uint64(block.timestamp))); emit Anchored(head, blocks);
    }

    function anchorCount() external view returns (uint256) { return anchors.length; }

    function lookup(bytes32 h) external view returns (bool exists, address issuer, string memory cid, uint64 issuedAt, bool revoked, bool held, bool erased) {
        Rec storage r = recs[h];
        return (r.issuer != address(0), r.issuer, r.cid, r.issuedAt, r.revoked, r.held, r.erased);
    }
}
