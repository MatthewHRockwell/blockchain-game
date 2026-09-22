import { contracts, addresses } from "../../commons/contracts.mjs"
import { PACKET_TYPES, buildPacketDomain } from "../../commons/trustus.mjs"

/** Chain id of the local Hardhat network the reward contracts are deployed to. */
export const LOCAL_CHAIN_ID = 31337

export const signPacket = async (wallet, request, deadline, receiver) => {
    const domain = buildPacketDomain({
        chainId: LOCAL_CHAIN_ID,
        verifyingContract: addresses[contracts.CLAIM_VERIFIER]
    })

    const value = {
        request,
        deadline,
        receiver
    }

    const sig = await wallet._signTypedData(domain, PACKET_TYPES, value)
    return sig
}
