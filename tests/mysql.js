// Arguments du client « mysql » pour les tests, d'après LR_DB_HOST / LR_DB_USER / LR_DB_PASS (comme le reste des tests).
const args = ['-h', process.env.LR_DB_HOST || '127.0.0.1', '-u', process.env.LR_DB_USER || 'root'];
if (process.env.LR_DB_PASS) args.push('-p' + process.env.LR_DB_PASS);
module.exports = { args };
