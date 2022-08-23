const { assert, expect } = require("chai");
const { getNamedAccounts, deployments, ethers, network } = require("hardhat");
const {
  deploymentChains,
  networkConfig,
} = require("../../helper-hardhat-config");

!deploymentChains.includes(network.name)
  ? describe.skip
  : describe("Raffle unit test", function () {
      let raffle, vrfCoordinatorV2Mock, deployer, raffleEntranceFee, interval;
      const chainId = network.config.chainId;

      beforeEach(async function () {
        deployer = (await getNamedAccounts()).deployer;
        await deployments.fixture(["all"]);
        raffle = await ethers.getContract("Raffle", deployer);
        vrfCoordinatorV2Mock = await ethers.getContract(
          "VRFCoordinatorV2Mock",
          deployer
        );
        raffleEntranceFee = await raffle.getEntranceFee();
        interval = await raffle.getInterval();
      });
      describe("constructor", function () {
        it("initializes raffle correctly", async function () {
          const raffleState = await raffle.getRaffleState();
          const interval = await raffle.getInterval();
          assert.equal(raffleState.toString(), "0");
          assert.equal(interval.toString(), networkConfig[chainId]["interval"]);
        });
      });

      describe("enterRaffle function", function () {
        it("reverts when you dont pay enough", async function () {
          await expect(raffle.enterRaffle()).to.be.revertedWith(
            "Raffle__NotEnoughEthEntered"
          );
          it("records players when they enter", async function () {
            await raffle.enterRaffle({ value: raffleEntranceFee });
            const playerFromContract = await raffle.getPlayer(0);
            assert.equal(playerFromContract, deployer);
          });
          it("emits event on enter", async function () {
            await raffle
              .enterRaffle({ value: raffleEntranceFee })
              .to.emit("raffle", RaffleEnter);
          });
          it("doesn't allow entrance when raffle is calculating", async function () {
            await raffle.enterRaffle({ value: raffleEntranceFee });
            await network.provider.send("evm_increaseTime", [
              interval.toNumber() + 1,
            ]);
            await network.provider.send("evm_mine", []);
            //we pretend to be chainlink keeper
            await raffle.performUpkeep([]);
            await expect(
              raffle.enterRaffle({ value: raffleEntranceFee })
            ).to.be.revertedWith("Raffle__NotOpen");
          });
        });
        describe("checkUpkeep", function () {
          it("return false if people haven't sent the ETH", async function () {
            await raffle.enterRaffle({ value: raffleEntranceFee });
            await network.provider.send("evm_increaseTime", [
              interval.toNumber() + 1,
            ]);
            await network.provider.send("evm_mine", []);
            const { upkeepNeeded } = await raffle.callStatic.checkUpkeep([]);
            assert(!upkeepNeeded);
          });
          it("return false if raffle isn't open", async function () {
            await raffle.enterRaffle({ value: raffleEntranceFee });
            await network.provider.send("evm_increaseTime", [
              interval.toNumber() + 1,
            ]);
            await network.provider.send("evm_mine", []);
            await raffle.performUpkeep([]);
            const raffleState = await raffle.getRaffleState();
            const { upkeepNeeded } = await raffle.callStatic.checkUpkeep([]);
            assert.equal(raffleState.toString(), "1");
            assert.equal(upkeepNeeded, false);
          });
          it("returns false if enough time hasn't passed", async function () {
            await raffle.enterRaffle({ value: raffleEntranceFee });
            await network.provider.send("evm_increaseTime", [
              interval.toNumber() - 1,
            ]);
            await network.provider.request({ method: "evm_mine", params: [] });
            const { upkeepNeeded } = await raffle.callStatic.checkUpkeep("0x");
            assert(!upkeepNeeded);
          });
          it("returns true if enough time has passed, has players, eth and is open", async function () {
            await raffle.enterRaffle({ value: raffleEntranceFee });
            await network.provider.send("evm_increaseTime", [
              interval.toNumber() + 1,
            ]);
            await network.provider.request({ method: "evm_mine", params: [] });
            const { upkeepNeeded } = await raffle.callStatic.checkUpkeep("0x");
            assert(upkeepNeeded);
          });
        });
        describe("performUpkeep", function () {
          it("it can only run if checkUpkeep is true", async function () {
            await raffle.enterRaffle({ value: raffleEntranceFee });
            await network.provider.send("evm_increaseTime", [
              interval.toNumber() + 1,
            ]);
            await network.provider.send("evm_mine", []);
            const tx = await raffle.performUpkeep([]);
            assert(tx);
          });
          it("reverts when checkUpkeep is false", async function () {
            await expect(raffle.performUpkeep([])).to.be.revertedWith(
              "Raffle__UpkeepNotNeeded"
            );
          });
          it("updates the raffle state and emits a requestId", async () => {
            // Too many asserts in this test!
            await raffle.enterRaffle({ value: raffleEntranceFee });
            await network.provider.send("evm_increaseTime", [
              interval.toNumber() + 1,
            ]);
            await network.provider.request({ method: "evm_mine", params: [] });
            const txResponse = await raffle.performUpkeep("0x"); // emits requestId
            const txReceipt = await txResponse.wait(1); // waits 1 block
            const raffleState = await raffle.getRaffleState(); // updates state
            const requestId = txReceipt.events[1].args.requestId;
            assert(requestId.toNumber() > 0);
            assert(raffleState == 1); // 0 = open, 1 = calculating
          });
        });
        describe("fulfillRandomWords", function () {
          beforeEach(async function () {
            await raffle.enterRaffle({ value: raffleEntranceFee });
            await network.provider.send("evm_increaseTime", [
              interval.toNumber() + 1,
            ]);
            await network.provider.send("evm_mine", []);
          });
          it("can only be called after performupkeep", async () => {
            await expect(
              vrfCoordinatorV2Mock.fulfillRandomWords(0, raffle.address) // reverts if not fulfilled
            ).to.be.revertedWith("nonexistent request");
            await expect(
              vrfCoordinatorV2Mock.fulfillRandomWords(1, raffle.address) // reverts if not fulfilled
            ).to.be.revertedWith("nonexistent request");
          });
          it("pick a winner, reset the lottery and sends money", async function () {
            const additionalEntrants = 3;
            const startingIndex = 1; //deployer 0
            const account = await ethers.getSigner();
            for (
              let i = startingIndex;
              i < startingIndex + additionalEntrants;
              i++
            ) {
              const accountsConnectedRaffle = await raffle.connect(account[i]);
              await accountsConnectedRaffle.enterRaffle({
                value: raffleEntranceFee,
              });
            }
            const startingTimeStamp = await raffle.getLatestTimeStamp();

            await new Promise(async (resolve, reject) => {
              raffle.once("WinnerPicked", async () => {
                console.log("Found the event!");
                try {
                  const recentWinner = await raffle.getRecentWinner();
                  console.log(recentWinner);
                  console.log(account[2].address);
                  console.log(account[0].address);
                  console.log(account[1].address);
                  console.log(account[3].address);
                  const WinnerEndingBalance = await account[1].getBalance();
                  const raffleState = await raffle.getRaffleState();
                  const endingTimeStamp = await raffle.getLatestTimeStamp();
                  const numPlayers = await raffle.getNumberOfPlayers();
                  assert.equal(numPlayers.toString(), "0");
                  assert.equal(raffleState.toString(), "0");
                  assert(endingTimeStamp > startingTimeStamp);
                  assert.equal(
                    WinnerEndingBalance.toString(),
                    WinnerStartingBalance.add(
                      raffleEntranceFee
                        .mul(additionalEntrants)
                        .add(raffleEntranceFee)
                    ).toString()
                  );
                } catch (e) {
                  reject(e);
                }
                resolve();
              });
              const tx = await raffle.performUpkeep("0x");
              const txReceipt = await tx.wait(1);
              const WinnerStartingBalance = await account[1].getBalance();
              await vrfCoordinatorV2Mock.fulfillRandomWords(
                txReceipt.events[1].args.requestId,
                raffle.address
              );
            });
          });
        });
      });
    });
