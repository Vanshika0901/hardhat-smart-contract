const { assert, expect } = require("chai");
const { getNamedAccounts, deployments, ethers, network } = require("hardhat");

const {
  deploymentChains,
  networkConfig,
} = require("../../helper-hardhat-config");

deploymentChains.includes(network.name)
  ? describe.skip
  : describe("Raffle staging test", function () {
      let raffle, deployer, raffleEntranceFee;
      const chainId = network.config.chainId;

      beforeEach(async function () {
        deployer = (await getNamedAccounts()).deployer;
        await deployments.fixture(["all"]);
        raffle = await ethers.getContract("Raffle", deployer);
        raffleEntranceFee = await raffle.getEntranceFee();
      });
      describe("fulfillRandomWords", function () {
        it("works with live chainlink keepers and chainlink VRF, we get a random winner", async function () {
          const startingTimeStamp = await raffle.getLatestTimeStamp();

          const account = await ethers.getSigner();

          await new Promise(async (resolve, reject) => {
            raffle.once("WinnerPicked", async function () {
              console.log("winnerPicked event fired");

              try {
                const recentWinner = await raffle.getRecentWinner();
                const WinnerEndingBalance = await account[0].getBalance();
                const raffleState = await raffle.getRaffleState();
                const endingTimeStamp = await raffle.getLatestTimeStamp();

                await expect(raffle.getPlayer(0)).to.be.reverted;
                assert.equal(recentWinner.toString(), account[0].address);
                assert.equal(raffleState, 0);
                assert.equal(
                  WinnerEndingBalance.toString(),
                  WinnerStartingBalance.add(raffleEntranceFee).toString()
                );
                resolve();
              } catch (e) {
                console.log(error);
                reject(e);
              }
            });
            await raffle.enterRaffle({ value: raffleEntranceFee });
            const WinnerStartingBalance = await account[0].getBalance();
          });
        });
      });
    });
