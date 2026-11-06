import {gcm} from '@noble/ciphers/aes.js';
import {pbkdf2Async} from '@noble/hashes/pbkdf2.js';
import {sha256} from '@noble/hashes/sha2.js';
import {bytesToHex, hexToBytes, utf8ToBytes} from '@noble/hashes/utils.js';
import {validateState} from './storage.js';
const iterations = 600000;
const aad = utf8ToBytes('AgroTile|backup|1|AES-256-GCM|PBKDF2-SHA256|600000');
export async function encryptBackup(state, password, randomBytes) {
    if (typeof password !== 'string' || password.length < 12 || password.length > 1024) throw Error('Use uma senha com 12 a 1024 caracteres.');
    const data = validateState(state);
    const salt = await randomBytes(16), nonce = await randomBytes(12);
    const key = await pbkdf2Async(sha256,utf8ToBytes(password),salt,{c:iterations,dkLen:32});
    try {
        const payload = utf8ToBytes(JSON.stringify({app:'AgroTile',version:1,createdAt:new Date().toISOString(),data}));
        const encrypted = JSON.stringify({format:'agrotile-encrypted',version:1,kdf:'PBKDF2-SHA256',iterations,cipher:'AES-256-GCM',salt:bytesToHex(salt),nonce:bytesToHex(nonce),ciphertext:bytesToHex(gcm(key,nonce,aad).encrypt(payload))});
        if (encrypted.length > 40*1024*1024) throw Error('Backup excede o limite de 40 MB. Nenhum arquivo foi salvo.');
        return encrypted;
    } finally { key.fill(0); }
}
export async function decryptBackup(text, password) {
    if (typeof text !== 'string' || text.length > 40*1024*1024) throw Error('Arquivo excede 40 MB.');
    const file = JSON.parse(text);
    if (file.format !== 'agrotile-encrypted' || file.version !== 1 || file.kdf !== 'PBKDF2-SHA256' || file.iterations !== iterations || file.cipher !== 'AES-256-GCM') throw Error('Formato ou versão de backup incompatível.');
    if (!/^[a-f0-9]{32}$/.test(file.salt) || !/^[a-f0-9]{24}$/.test(file.nonce) || typeof file.ciphertext !== 'string' || file.ciphertext.length < 32 || file.ciphertext.length % 2 !== 0 || !/^[a-f0-9]+$/.test(file.ciphertext)) throw Error('Arquivo inválido.');
    if (typeof password !== 'string' || password.length < 12 || password.length > 1024) throw Error('Confira a senha do backup.');
    const key = await pbkdf2Async(sha256,utf8ToBytes(password),hexToBytes(file.salt),{c:iterations,dkLen:32});
    let payload;
    try { payload = JSON.parse(new TextDecoder().decode(gcm(key,hexToBytes(file.nonce),aad).decrypt(hexToBytes(file.ciphertext)))); }
    catch { throw Error('Senha incorreta ou arquivo alterado. Nenhum dado foi restaurado.'); }
    finally { key.fill(0); }
    if (payload.app !== 'AgroTile' || payload.version !== 1 || !Number.isFinite(Date.parse(payload.createdAt))) throw Error('Conteúdo incompatível.');
    return {...payload,data:validateState(payload.data)};
}
