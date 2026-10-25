// Login da equipe: senha com scrypt e sessão em cookie assinado.
const crypto = require('crypto');
const { pool, lerConfig, salvarConfig } = require('./db');

const PERMISSOES = {
  admin: 'Administrador',
  pedidos: 'Pedidos e delivery',
  cozinha: 'Cozinha',
  garcom: 'Garçom',
  caixa: 'Caixa / balcão',
  entregador: 'Entregador',
};
const DURACAO = 14 * 24 * 3600 * 1000; // 14 dias
let segredo = process.env.SESSION_SECRET || null;

async function prepararSegredo() {
  if (segredo) return;
  const salvo = await lerConfig('segredo_sessao');
  if (salvo) { segredo = salvo; return; }
  segredo = crypto.randomBytes(32).toString('hex');
  await salvarConfig('segredo_sessao', segredo);
}

function hashSenha(senha) {
  const sal = crypto.randomBytes(16);
  const h = crypto.scryptSync(String(senha), sal, 64);
  return 'scrypt$' + sal.toString('hex') + '$' + h.toString('hex');
}

function confereSenha(senha, salvo) {
  const [, salHex, hHex] = String(salvo).split('$');
  if (!salHex || !hHex) return false;
  const h = crypto.scryptSync(String(senha), Buffer.from(salHex, 'hex'), 64);
  return crypto.timingSafeEqual(h, Buffer.from(hHex, 'hex'));
}

const assinar = (txt) => crypto.createHmac('sha256', segredo).update(txt).digest('base64url');

function criarCookie(usuario, req) {
  const exp = Date.now() + DURACAO;
  const corpo = usuario.id + '.' + usuario.versao + '.' + exp;
  const seguro = (req.headers['x-forwarded-proto'] || '').includes('https') ? '; Secure' : '';
  return `nm_sessao=${corpo}.${assinar(corpo)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${DURACAO / 1000}${seguro}`;
}

const cookieSair = 'nm_sessao=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0';

async function usuarioDaRequisicao(req) {
  const m = /(?:^|;\s*)nm_sessao=([^;]+)/.exec(req.headers.cookie || '');
  if (!m) return null;
  const partes = m[1].split('.');
  if (partes.length !== 4) return null;
  const [id, versao, exp, ass] = partes;
  const corpo = id + '.' + versao + '.' + exp;
  const esperado = assinar(corpo);
  if (ass.length !== esperado.length || !crypto.timingSafeEqual(Buffer.from(ass), Buffer.from(esperado))) return null;
  if (Number(exp) < Date.now()) return null;
  const { rows } = await pool.query(
    'SELECT id, nome, login, permissoes, ativo, versao FROM usuarios WHERE id = $1', [Number(id)]);
  const u = rows[0];
  // versao muda quando a senha é trocada ou o usuário é desativado: derruba sessões antigas
  if (!u || !u.ativo || String(u.versao) !== versao) return null;
  return u;
}

function pode(usuario, ...perms) {
  if (!usuario) return false;
  if (usuario.permissoes.includes('admin')) return true;
  return perms.some((p) => usuario.permissoes.includes(p));
}

module.exports = { PERMISSOES, prepararSegredo, hashSenha, confereSenha, criarCookie, cookieSair, usuarioDaRequisicao, pode };
