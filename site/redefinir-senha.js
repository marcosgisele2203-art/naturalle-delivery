// Recupera o acesso de administrador pelo terminal do servidor (Easypanel › pedidos › Console).
//   node redefinir-senha.js         lista os administradores
//   node redefinir-senha.js LOGIN   pergunta a nova senha e troca (e reativa o usuário)
// A senha é perguntada (e não escrita no comando) porque o terminal muda símbolos como $ # ! &.
const readline = require('readline');
const { pool } = require('./lib/db');
const { hashSenha } = require('./lib/auth');

// lê linha por linha (guarda o que já foi digitado, mesmo colado de uma vez)
let rl, linhas;
async function perguntar(texto) {
  if (!rl) { rl = readline.createInterface({ input: process.stdin }); linhas = rl[Symbol.asyncIterator](); }
  process.stdout.write(texto);
  const { value, done } = await linhas.next();
  if (done) throw new Error('Nenhuma senha digitada. Nada foi trocado.');
  return value;
}

(async () => {
  const [login, senhaNoComando] = process.argv.slice(2);
  if (!login) {
    const { rows } = await pool.query(`SELECT login, nome, ativo FROM usuarios WHERE 'admin' = ANY(permissoes) ORDER BY id`);
    console.log(rows.length ? 'Administradores:' : 'Nenhum administrador cadastrado.');
    for (const u of rows) console.log(`  login: ${u.login}   nome: ${u.nome}${u.ativo ? '' : '   (desativado)'}`);
    console.log('\nPara trocar a senha: node redefinir-senha.js LOGIN');
  } else {
    const { rows } = await pool.query('SELECT id FROM usuarios WHERE login = $1', [login.toLowerCase()]);
    if (!rows[0]) throw new Error(`Login "${login}" não encontrado. Rode sem nada para ver os logins.`);
    let senha = senhaNoComando;
    if (!senha) {
      senha = await perguntar('Nova senha (pelo menos 8 caracteres): ');
      const de_novo = await perguntar('Digite a nova senha de novo: ');
      rl.close();
      if (senha !== de_novo) throw new Error('As duas senhas são diferentes. Nada foi trocado.');
    }
    if (senha.length < 8) throw new Error('A nova senha precisa ter pelo menos 8 caracteres. Nada foi trocado.');
    await pool.query('UPDATE usuarios SET senha_hash = $2, ativo = true, versao = versao + 1 WHERE id = $1', [rows[0].id, hashSenha(senha)]);
    // mostra o começo e o tamanho para conferir que o terminal não cortou nada
    console.log(`Senha de "${login}" trocada (${senha.length} caracteres, começa com "${senha.slice(0, 2)}"). Já pode entrar no painel.`);
  }
  await pool.end();
})().catch(async (e) => { console.error('Erro:', e.message); await pool.end().catch(() => {}); process.exit(1); });
