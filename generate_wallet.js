const axios = require('axios');
const bip39 = require('bip39');
const bitcoin = require('bitcoinjs-lib');
const fs = require('fs');

const parallelLimit = 10;
const iterations = 100;
const batchSize = 10;
const delayBetweenBatches = 5000; // 5 seconds
const apiDelay = 3000; // 3 seconds

let useBlockchainInfoAPI = true;

function appendToFile(filename, data) {
  fs.appendFile(filename, data, (err) => {
    if (err) {
      console.error(`Error saving data to ${filename}:`, err.message);
    } else {
      console.log(`Data saved to ${filename}`);
    }
  });
}

async function main() {
  const walletPromises = [];

  for (let i = 0; i < iterations; i++) {
    walletPromises.push(generateWallet());

    if (walletPromises.length === parallelLimit) {
      await processBatch(walletPromises);
      walletPromises.length = 0;
    }
  }

  if (walletPromises.length > 0) {
    await processBatch(walletPromises);
  }
}

async function processBatch(walletPromises) {
  const results = await Promise.all(walletPromises);

  const activeAddresses = results
    .filter(({ hasTransactions }) => hasTransactions)
    .map(({ address }) => address);

  if (activeAddresses.length > 0) {
    const dataToSave = activeAddresses.join('\n') + '\n';
    appendToFile('active_addresses.txt', dataToSave);
  }
  await new Promise((resolve) => setTimeout(resolve, delayBetweenBatches));
}

async function generateWallet() {
  // Generate a new 12-word mnemonic seed phrase
  const mnemonic = bip39.generateMnemonic(128);
  console.log('Mnemonic:', mnemonic);

  // Convert the mnemonic to a seed
  const seed = await bip39.mnemonicToSeed(mnemonic);

  // Derive the wallet from the seed using BIP32
  const network = bitcoin.networks.bitcoin;
  const hdMaster = bitcoin.bip32.fromSeed(seed, network);
  const account = hdMaster.derivePath("m/44'/0'/0'/0");

  // Generate a new Bitcoin address
  const { address } = bitcoin.payments.p2pkh({
    pubkey: account.derive(0).publicKey,
    network
  });

  console.log('Bitcoin Address:', address);
  const hasTransactions = await checkAddressActivity(address);
  await new Promise((resolve) => setTimeout(resolve, apiDelay));
  return { address, hasTransactions };
}

async function checkAddressActivity(address) {
  try {
    let response;
    if (useBlockchainInfoAPI) {
      response = await axios.get(`https://blockchain.info/rawaddr/${address}`);
    } else {
      response = await axios.get(`https://api.blockcypher.com/v1/btc/main/addrs/${address}`);
    }

    useBlockchainInfoAPI = !useBlockchainInfoAPI;

    let hasTransactions = false;

    if (response.data.txs) {
      hasTransactions = response.data.txs.length > 0;
    } else if (response.data.txrefs) {
      hasTransactions = response.data.txrefs.length > 0;
    }

    if (hasTransactions) {
      console.log("This address has transactions associated with it.");
      return true;
    } else {
      console.log("This address has no transactions associated with it.");
      return false;
    }
  } catch (error) {
    console.error("Error fetching address data:", error.message);
    return false;
  }
}

main().catch((error) => {
  console.error("An unexpected error occurred:", error.message);
});