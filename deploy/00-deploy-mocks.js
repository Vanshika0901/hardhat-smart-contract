const { getNamedAccounts, deployments, network } = require("hardhat");
const { developmentChains } = require("../helper-hardhat-config");

const BASE_FEE = ethers.utils.parseEther("0.25"); // it is a premium, it costs 0.25 link per request
const GAS_PRICE_LINK = 1e9;

module.exports = async function (hre) {
  const { getNamedAccounts, deployments } = hre;
  const { deployer } = await getNamedAccounts();
  const { deploy, log } = deployments;
  const chainId = network.config.chainId;
  const args = [BASE_FEE, GAS_PRICE_LINK];

  if (developmentChains.includes(network.name)) {
    log("Local network detected! Deploying mocks...");
    //deploy our mock vrfCoordinatorV2
    await deploy("VRFCoordinatorV2", {
      from: deployer,
      log: true,
      args: args,
    });
    log("Mocks deployed!...");
    log("-------------------------------------------------");
  }
};

module.exports.tags = ["all", "mocks"];
