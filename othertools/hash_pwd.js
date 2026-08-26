const crypto = require('crypto');

function hashPassword(password) {
    return crypto.createHash('sha256').update('mechat_salt_' + password).digest('hex');
}

const input = process.argv[2];
if (!input) {
    console.log('Usage: node hash_pwd.js <password>');
    console.log('Example: node hash_pwd.js mypassword123');
    process.exit(0);
}

console.log('PLAIN:' + input);
console.log('HASH:' + hashPassword(input));
