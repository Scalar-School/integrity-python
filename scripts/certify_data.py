import hashlib
import csv
import requests
from mnemonic import Mnemonic
from bitcoinlib.wallets import Wallet
from bitcoinlib.transactions import Transaction
from bitcoinlib.keys import Key

# Função para gerar o hash das linhas do CSV
def gerar_hash_csv(csv_file):
    with open(csv_file, mode='r', newline='') as file:
        reader = csv.reader(file)
        for row in reader:
            linha_str = ','.join(row).encode('utf-8')
            hash_obj = hashlib.sha256(linha_str)
            hash_hex = hash_obj.hexdigest()
            print(f'Linha: {linha_str.decode()} -> Hash: {hash_hex}')
    return hash_hex

# Informações da carteira
certifier_mnemonic = "asset casino silent eye explain coil hollow exercise cabbage unknown problem picnic"
certifier_address = 'bc1qmgrc5at3v5g6jfz4f8ywjvkzlvw7luxpde9jvl'

# Converter a frase mnemônica para chave privada
def mnemonic_to_private_key(certifier_mnemonic):
    mnemo = Mnemonic("english")
    seed = mnemo.to_seed(certifier_mnemonic)
    key = Key(import_key=seed[:32])  # Pegando os primeiros 32 bytes do seed
    return key.wif()

# Criar a transação com OP_RETURN
def create_transaction_with_op_return(data):
    try:
        tx = Transaction()
        utxos_response = requests.get(f'https://blockstream.info/api/address/{certifier_address}/utxo')
        utxos = utxos_response.json()

        if not utxos:
            raise Exception('Nenhum UTXO encontrado.')

        utxo = utxos[0]

        tx.add_input(utxo['txid'], utxo['vout'])
        tx.add_output(0, data.encode('utf-8'), script_type='op_return')

        change_value = utxo['value'] - 1000
        if change_value <= 0:
            raise Exception('Valor de troco inválido ou insuficiente.')

        tx.add_output(change_value, certifier_address)

        wif_key = mnemonic_to_private_key(certifier_mnemonic)
        wallet = Wallet.import_key(wif_key)
        tx.sign(wallet)

        response = requests.post('https://mempool.space/api/tx', data=tx.as_hex())
        return response.text

    except Exception as e:
        return str(e)
