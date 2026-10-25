// Recupera o acesso de administrador pelo terminal do servidor (Easypanel › pedidos › Console).
//   node redefinir-senha.js                 lista os administradores
//   node redefinir-senha.js LOGIN NOVASENHA  troca a senha (e reativa o usuário)
const { pool } = require('./lib/db');
const { hashSenha } = require('./lib/auth');

(async () => {
  const [login, senha] = process.argv.slice(2);
  if (!login) {
    const { rows } = await pool.query(`SELECT login, nome, ativo FROM usuarios WHERE 'admin' = ANY(permissoes) ORDER BY id`);
    console.log(rows.length ? 'Administradores:' : 'Nenhum administrador cadastrado.');
    for (const u of rows) console.log(`  login: ${u.login}   nome: ${u.nome}${u.ativo ? '' : '   (desativado)'}`);
    console.log('\nPara trocar a senha: node redefinir-senha.js LOGIN NOVASENHA');
  } else {
    if (!senha || senha.length < 8) throw new Error('A nova senha precisa ter pelo menos 8 caracteres.');
    const { rowCount } = await pool.query(
      'UPDATE usuarios SET senha_hash = $2, ativo = true, versao = versao + 1 WHERE login = $1', [login.toLowerCase(), hashSenha(senha)]);
    console.log(rowCount ? `Senha de "${login}" trocada. Já pode entrar no painel.` : `Login "${login}" não encontrado.`);
  }
  await pool.end();
})().catch((e) => { console.error('Erro:', e.message); process.exit(1); });
