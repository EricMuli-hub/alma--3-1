'use strict';
// Compiles contracts/AlmaRegistry.sol into build/AlmaRegistry.json (abi + bytecode).
const fs = require('fs'), path = require('path'), solc = require('solc');
const src = fs.readFileSync(path.join(__dirname, '..', 'contracts', 'AlmaRegistry.sol'), 'utf8');
const out = JSON.parse(solc.compile(JSON.stringify({ language: 'Solidity', sources: { 'AlmaRegistry.sol': { content: src } }, settings: { evmVersion: 'shanghai', optimizer: { enabled: true, runs: 200 }, outputSelection: { '*': { '*': ['abi', 'evm.bytecode.object'] } } } })));
const errs = (out.errors || []).filter(e => e.severity === 'error');
if (errs.length) { console.error(errs.map(e => e.formattedMessage).join('\n')); process.exit(1); }
const c = out.contracts['AlmaRegistry.sol'].AlmaRegistry;
fs.mkdirSync(path.join(__dirname, '..', 'build'), { recursive: true });
fs.writeFileSync(path.join(__dirname, '..', 'build', 'AlmaRegistry.json'), JSON.stringify({ abi: c.abi, bytecode: '0x' + c.evm.bytecode.object }));
console.log('Compiled AlmaRegistry, bytecode', c.evm.bytecode.object.length / 2, 'bytes');
