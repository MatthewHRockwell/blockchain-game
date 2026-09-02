require("@nomiclabs/hardhat-ethers")
require("./tasks/deploy.js")
require("dotenv").config()

/**
 * @type import("hardhat/config").HardhatUserConfig
 */
module.exports = {
  solidity: "0.8.13",
  paths: {
    sources: "./src"
  },
  networks: {
    hardhat: {},
    localhost: {
      url: "http://127.0.0.1:8545"
    }
  }
}
