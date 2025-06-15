import { expect } from "chai";
import { ethers } from "hardhat";

// Helper to parse units respecting decimals
function toUnits(value, decimals) {
  return BigInt(value) * 10n ** BigInt(decimals);
}

describe("MultiSend", function () {
  let owner, recipient;
  let WBTC, USDT, PEPE;
  let wbtc, usdt, pepe;
  let MultiSend;
  let multiSend;

  beforeEach(async function () {
    [owner, recipient] = await ethers.getSigners();

    // Deploy test tokens
    WBTC = await ethers.getContractFactory("WBTC");
    USDT = await ethers.getContractFactory("USDT");
    PEPE = await ethers.getContractFactory("PEPE");

    wbtc = await WBTC.deploy(owner.address);
    await wbtc.waitForDeployment();

    usdt = await USDT.deploy(owner.address);
    await usdt.waitForDeployment();

    pepe = await PEPE.deploy(owner.address);
    await pepe.waitForDeployment();

    // Deploy MultiSend
    MultiSend = await ethers.getContractFactory("MultiSend");
    multiSend = await MultiSend.deploy();
    await multiSend.waitForDeployment();

    // Approve MultiSend to spend tokens
    const approveAmountWBTC = toUnits(100, 8); // 100 WBTC
    const approveAmountUSDT = toUnits(1000, 6); // 1000 USDT
    const approveAmountPEPE = toUnits(1000, 18); // 1000 PEPE

    await wbtc.approve(await multiSend.getAddress(), approveAmountWBTC);
    await usdt.approve(await multiSend.getAddress(), approveAmountUSDT);
    await pepe.approve(await multiSend.getAddress(), approveAmountPEPE);
  });

  it("should send multiple ERC20 tokens to recipient", async function () {
    const transfers = [
      { token: await wbtc.getAddress(), amount: toUnits(1, 8) }, // 1 WBTC
      { token: await usdt.getAddress(), amount: toUnits(10, 6) }, // 10 USDT
      { token: await pepe.getAddress(), amount: toUnits(10, 18) } // 10 PEPE
    ];

    // Execute multiSend as owner
    await multiSend.multiSend(recipient.address, transfers);

    // Check balances
    expect(await wbtc.balanceOf(recipient.address)).to.equal(transfers[0].amount);
    expect(await usdt.balanceOf(recipient.address)).to.equal(transfers[1].amount);
    expect(await pepe.balanceOf(recipient.address)).to.equal(transfers[2].amount);
  });
});