task("deploy", "deploy contracts")
    .setAction(async({ _ }, { ethers }) => {
        const [deployer] = await ethers.getSigners()
        const deployerAddress = await deployer.getAddress()
        console.log("deployer address: ", deployerAddress)
    
        const ClaimVerifier = await ethers.getContractFactory('ClaimVerifier')
        const claimVerifier = await ClaimVerifier.deploy()
        await claimVerifier.deployed()
    
        const ClaimManagerERC721 = await ethers.getContractFactory('ClaimManagerERC721')
        const claimManagerERC721 = await ClaimManagerERC721.deploy('Lost Temple Artifact', 'LTA', 'lost-temple-local-artifact/', claimVerifier.address)
        await claimManagerERC721.deployed()

        let tx = await claimVerifier.setIsTrusted(deployerAddress, true)
        await tx.wait()
    
        tx = await claimVerifier.setIsClaimManager(claimManagerERC721.address, true);
        await tx.wait()
    
        console.log(
            "ClaimVerifier deployed to: ", claimVerifier.address,
            "ClaimManagerERC721 artifact reward deployed to: ", claimManagerERC721.address,
            "Trusted signer: ", deployerAddress,
        )
    })

