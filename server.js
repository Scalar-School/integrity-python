const express = require('express');
const multer = require('multer');
const crypto = require('crypto');
const axios = require('axios');
const bitcoin = require('bitcoinjs-lib');
const fs = require('fs');
const path = require('path');
const xlsx = require('xlsx'); // Library for handling .xlsx files

const app = express();
const upload = multer({ dest: 'uploads/' });
const PORT = 3000;

// Serve static files (HTML, CSS, etc.) from the 'INTEGRITY-APP' directory
app.use(express.static(path.join(__dirname, 'INTEGRITY-APP')));

app.get('/certify.html', (req, res) => {
    res.sendFile(path.join(__dirname, 'INTEGRITY-APP/certify.html'));
});

// Chaves e endereços fornecidos
const certifierPrivateKey = 'KyeEnQiBSfFwN93t1NoPiy4CTa827ygSt4sU3NaaX7r6VUZgPLcT';  // Chave privada
const certifierAddress = 'bc1qt60nsqrxwcgewjz7ta8dm5v5zsa4g8m7dly4mp';  // Endereço Bitcoin
const recipientAddress = 'bc1q4v7mmmg9lszec0jlykvmre8xqjk9vavvrhjn66';  // Usando o mesmo endereço como destinatário

// Route for handling the certification (file upload)
app.post('/certify', upload.single('data-file'), async (req, res) => {
    try {
        const filePath = req.file.path;

        // Check if the file is .xlsx and process accordingly
        let fileHash;
        if (req.file.mimetype === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet') {
            const workbook = xlsx.readFile(filePath);
            const sheetName = workbook.SheetNames[0];
            const sheet = workbook.Sheets[sheetName];
            const data = xlsx.utils.sheet_to_csv(sheet);
            fileHash = crypto.createHash('sha256').update(data).digest('hex');
        } else {
            // Process non-.xlsx files normally
            const fileBuffer = fs.readFileSync(filePath);
            fileHash = crypto.createHash('sha256').update(fileBuffer).digest('hex');
        }

        // Call the function to create and broadcast the transaction
        const txid = await createAndBroadcastTransaction(fileHash);

        // Cleanup the uploaded file
        fs.unlinkSync(filePath);

        // Send back the transaction ID to the user
        res.json({ txid });
    } catch (error) {
        console.error('Error during certification:', error);
        res.status(500).json({ error: error.message || 'Internal Server Error' });
    }
});

// Function to create and broadcast the Bitcoin transaction
async function createAndBroadcastTransaction(fileHash) {
    const keyPair = bitcoin.ECPair.fromWIF(certifierPrivateKey, bitcoin.networks.bitcoin);

    // Fetch UTXOs from the certifier address
    const utxos = await axios.get(`https://blockstream.info/api/address/${certifierAddress}/utxo`);
    if (utxos.data.length === 0) {
        throw new Error('No UTXOs found for the certifier address.');
    }

    const psbt = new bitcoin.Psbt({ network: bitcoin.networks.bitcoin });

    // Select the first UTXO for the transaction
    const utxo = utxos.data[0];

    // Fetch raw transaction data for the selected UTXO
    const rawTxResponse = await axios.get(`https://blockstream.info/api/tx/${utxo.txid}/hex`);
    const rawTxHex = rawTxResponse.data;

    psbt.addInput({
        hash: utxo.txid,
        index: utxo.vout,
        nonWitnessUtxo: Buffer.from(rawTxHex, 'hex'),
    });

    // Create an OP_RETURN output with the file hash
    const data = Buffer.from(fileHash, 'hex');
    const embed = bitcoin.payments.embed({ data: [data] });
    psbt.addOutput({
        script: embed.output,
        value: 0, // OP_RETURN does not need value
    });

    // Send a small amount of Bitcoin to the recipient address
    psbt.addOutput({
        address: recipientAddress,
        value: 1000, // Transfer 1000 satoshis (example)
    });

    // Estimate the fee dynamically based on the transaction size (in satoshis per byte)
    const feeRate = await getFeeRate(); // Get the current fee rate
    const estimatedTxSize = psbt.extractTransaction().virtualSize() + 50; // Add extra bytes for safety
    const fee = estimatedTxSize * feeRate; // Fee in satoshis

    // Send the change back to the certifier address, minus the fee
    psbt.addOutput({
        address: certifierAddress,
        value: utxo.value - 1000 - fee, // Subtract the transfer amount and fee from UTXO value
    });

    // Sign the transaction
    psbt.signInput(0, keyPair);
    psbt.finalizeAllInputs();

    // Extract the raw transaction in hex format
    const tx = psbt.extractTransaction().toHex();

    // Broadcast the transaction to the Bitcoin network via Blockstream API
    const response = await axios.post('https://blockstream.info/api/tx', tx);
    return response.data; // Returns the transaction ID
}

// Function to fetch the recommended fee rate
async function getFeeRate() {
    const feeRateResponse = await axios.get('https://blockstream.info/api/fee-estimates');
    return feeRateResponse.data['1']; // Fee rate for 1-block confirmation (in satoshis per byte)
}

// Start the server
app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
});
