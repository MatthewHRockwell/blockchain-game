// SPDX-License-Identifier: MIT
pragma solidity 0.8.13;

import "solmate/src/tokens/ERC721.sol";
import "@openzeppelin/contracts/utils/Strings.sol";
import "./ClaimManager.sol";

///@title ClaimManagerERC721
///@author nutcloud🧙‍♂️.eth
///@notice Basic claim manager example which mints an ERC721 NFT for the claimer
contract ClaimManagerERC721 is ERC721, ClaimManager {
    ///-------------------------------------------------------
    ///	Storage variables
    ///-------------------------------------------------------

    /// @notice Records whether an address has claimed or not
    mapping(address => bool) public hasClaimed;

    string private _baseURI;

    uint256 public nonce;

    ///-------------------------------------------------------
    ///	Constructor
    ///-------------------------------------------------------

    constructor(
        string memory name,
        string memory symbol,
        string memory baseURI,
        address claimVerifier
    ) ERC721(name, symbol) ClaimManager(claimVerifier) {
        _baseURI = baseURI;
    }

    function tokenURI(uint256 id)
        public
        view
        override(ERC721)
        returns (string memory)
    {
        require(_ownerOf[id] != address(0), "NOT MINTED");

        // Strings.toString, not abi.encodePacked: packing a uint256 appends its 32
        // raw bytes, so tokenURI(0) used to return the baseURI followed by 32 NUL
        // bytes instead of "0".
        return string(abi.encodePacked(_baseURI, Strings.toString(id)));
    }

    ///-------------------------------------------------------
    ///	Claiming logic
    ///-------------------------------------------------------

    /// @notice Distributes rewards to the claimer
    /// @param claimer The address of the claimer
    function _claim(address claimer) internal override(ClaimManager) {
        require(!hasClaimed[claimer], "ClaimManagerMock: already claimed");

        hasClaimed[claimer] = true;

        _mint(claimer, nonce++);
    }
}
