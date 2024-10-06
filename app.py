from flask import Flask, request, jsonify
from scripts.certify_data import gerar_hash_csv, create_transaction_with_op_return

app = Flask(__name__)

@app.route('/')
def index():
    return 'Bem-vindo ao Projeto Integrity'

# Endpoint para certificar dados do CSV
@app.route('/certify', methods=['POST'])
def certify():
    try:
        csv_file_path = request.form['csv_file']
        hash_hex = gerar_hash_csv(csv_file_path)
        tx_id = create_transaction_with_op_return(hash_hex)
        return jsonify({"transaction_id": tx_id})
    except Exception as e:
        return jsonify({"error": str(e)})

if __name__ == '__main__':
    app.run(debug=True)
