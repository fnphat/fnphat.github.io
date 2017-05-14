function to_satoshi (btc_unit) {
    return {'value': Math.round(btc_unit * Math.pow(10, 8)), 'unit': 'satoshis'};
}

function to_btc (satoshis_unit) {
    return {'value': (satoshis_unit * Math.pow(10, -8)).toFixed(8), 'unit': 'BTC'};
}

function to_mbtc (btc_unit) {
    return {'value': (btc_unit * Math.pow(10, 3)).toFixed(5), 'unit': 'mBTC'};
}

function to_usd (satoshis, btc_market_value) {
    var btc = to_btc(satoshis);
    return {'value': (btc.value * btc_market_value).toFixed(2), 'unit': 'USD'};
}

function decode_tx (tx_obj, network) {
    var tx_hash = tx_obj.getId();
    var inputs = [];
    var outputs = [];
    
    tx_obj.ins.forEach( function(input, i) {
        inputs.push({'tx': input.hash.reverse().toString('hex'), 'index': input.index});
    });
    tx_obj.outs.forEach( function(output, i) {
        outputs.push({'addr': bitcoinjs.address.fromOutputScript(output.script, network), 'amount': output.value});
    });
    
    return {'tx_hash': tx_hash, 'inputs': inputs, 'outputs': outputs};
}

function fee (tx_obj, network, total_input_amount) {
    var outputs = decode_tx (tx_obj, network).outputs;
    var total_output_amount = 0;
    var fee;
    
    outputs.forEach( function(output, i) {
        total_output_amount += output.amount;
    });
    fee = total_input_amount-total_output_amount;
    
    return fee;
}

function signed_tx_size (tx_obj, network) {
    var decoded = decode_tx (tx_obj, network);
    var num_inputs = decoded.inputs.length;
    var outputs_size = decoded.outputs.length * 34;
    var uncomp_size = 10 + (num_inputs * 180) + outputs_size;
    var comp_size = 10 + (num_inputs * 148) + outputs_size;
    
    return {'comp': comp_size,'uncomp': uncomp_size};
}

function create_unsigned_tx (network, inputs, outputs) {
    // inputs = [{'tx': , 'vout': <integer>}, ...]
    // outputs = [{'address': , 'amount': <in satoshis>), ...]
    var i;
    var unsigned_tx_hex;
    var txb = new bitcoinjs.TransactionBuilder(network);
    
    i = 1;
    for (input of inputs) {
        console.log('input: ' +input.tx+ ', ' +input.vout);
        txb.addInput(input.tx, input.vout);
        i++;
    }
    i = 1;
    for (output of outputs) {
        console.log('output: ' +output.address+ ', ' +output.amount);
        // In satoshis
        txb.addOutput(output.address, output.amount);
        i++;
    }
    unsigned_tx_hex = txb.buildIncomplete().toHex();
   
    return unsigned_tx_hex;
}

function decode_tx_for_humans (tx_obj, network, total_input_amount, ideal_fee_per_byte, btc_market_value, target_fee) {
    var msg = '';
    var btc;
    var usd;
    var fee;
    var total_output_amount = 0;
    var decoded = decode_tx (tx_obj, network);
    var size = signed_tx_size (tx_obj, network);
    
    msg += '\nTx hash: ' +decoded.tx_hash;
    msg += '\n---';
    decoded.inputs.forEach( function (input, i) {
        msg += '\nInput #' +i+ ': ' +input.tx+ '/' +input.index;
    });
    msg += '\n---';
    decoded.outputs.forEach( function (output, i) {
        total_output_amount += output.amount;
        btc = to_btc(output.amount);
        usd = (btc.value*btc_market_value).toFixed(2);
        msg += '\nOutput #' +i+ ': ' +output.addr+ '/' +output.amount+ ' = ' +btc.value+ ' ' +btc.unit+ ' (' +usd+ ' USD)';
    });
    msg += '\n===';
    btc = to_btc(total_input_amount);
    usd = to_usd(total_input_amount, btc_market_value);
    msg += '\nTotal input : ' +total_input_amount+ ' sat = ' +btc.value+ ' ' +btc.unit+ ' (' +usd.value+ ' ' +usd.unit+ ')';
    
    btc = to_btc(total_output_amount);
    usd = to_usd(total_output_amount, btc_market_value);
    msg += '\nTotal output: ' +total_output_amount+ ' sat = ' +btc.value+ ' ' +btc.unit+ ' (' +usd.value+ ' ' +usd.unit+ ')';
    
    fee = total_input_amount-total_output_amount
    btc = to_btc(fee);
    usd = to_usd(fee, btc_market_value);
    msg += '\nFee       : ' +fee+ ' sat = ' +btc.value+ ' ' +btc.unit+ ' (' +usd.value+ ' ' +usd.unit+ ')';
    
    btc = to_btc(target_fee);
    usd = to_usd(target_fee, btc_market_value);
    msg += '\n---';
    msg += '\nTarget fee: ' +target_fee+ ' sat = ' +btc.value+ ' ' +btc.unit+ ' (' +usd.value+ ' ' +usd.unit+ ')';

    delta = fee-target_fee;
    btc = to_btc(delta);
    usd = to_usd(delta, btc_market_value);
    msg += '\nDelta fee : ' +delta+ ' sat = ' +btc.value+ ' ' +btc.unit+ ' (' +usd.value+ ' ' +usd.unit+ ')';
    
    
    msg += '\nEstimated size of signed tx (comp. pubkey)  : ' +size.comp+ ' bytes';
    msg += '\nEstimated size of signed tx (uncomp. pubkey): ' +size.uncomp+ ' bytes';
    
    fee = ideal_fee_per_byte*size.comp;
    btc = to_btc(fee);
    usd = to_usd(fee, btc_market_value);
    msg += '\nIdeal tx fee (compressed pubkey)  : ' +btc.value+ ' ' +btc.unit+ ' (' +usd.value+ ' ' +usd.unit+ ')';
    
    fee = ideal_fee_per_byte*size.uncomp;
    btc = to_btc(fee);
    usd = to_usd(fee, btc_market_value);
    msg += '\nIdeal tx fee (uncompressed pubkey): ' +btc.value+ ' ' +btc.unit+ ' (' +usd.value+ ' ' +usd.unit+ ')';

    return msg;
}

function parse_to_inputs_outputs(data_str) {
    inputs = [];
    outputs = [];
    for (line of data_str.split('\n')) {
        switch (line[0]) {
            case '+':   input = line.substring(1).split('/');
                        inputs.push({'tx': input[0], 'vout': parseInt(input[1]), 'amount': to_satoshi(input[2]).value});
                        break;
            case '-':   output = line.substring(1).split('/');
                        outputs.push({'address': output[0], 'amount': to_satoshi(output[1]).value});
                        break;
            default:    throw 'Unknown data: ' +line;
        }
    }
    return {'inputs': inputs, 'outputs': outputs}
}
