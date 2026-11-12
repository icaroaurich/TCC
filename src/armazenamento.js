// Guarda os dados em arquivos JSON dentro de data/ (sem banco de dados por enquanto).
const fs = require('fs');
const path = require('path');

const crypto = require('crypto');

// DATA_DIR permite usar outra pasta (ex.: nos testes, para não mexer nos dados reais).
// No Railway, com um volume ligado ao serviço, os dados vão para <volume>/data e não se perdem a cada deploy.
const VOLUME = process.env.RAILWAY_VOLUME_MOUNT_PATH;
const PASTA = process.env.DATA_DIR || (VOLUME ? path.join(VOLUME, 'data') : path.join(__dirname, '..', 'data'));

function caminho(nome) {
  return path.join(PASTA, nome + '.json');
}

// Lê data/<nome>.json. Se não existir, devolve o valor padrão.
function ler(nome, padrao = []) {
  try {
    return JSON.parse(fs.readFileSync(caminho(nome), 'utf8'));
  } catch (e) {
    if (e.code === 'ENOENT') return padrao;
    throw e;
  }
}

// Grava em um .tmp e depois renomeia: se o processo cair no meio, o arquivo antigo continua inteiro.
// O .tmp tem nome único para duas gravações nunca escreverem no mesmo arquivo temporário.
function gravar(nome, dados) {
  fs.mkdirSync(PASTA, { recursive: true });
  const tmp = `${caminho(nome)}.${process.pid}-${crypto.randomBytes(4).toString('hex')}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(dados, null, 2), 'utf8');
  fs.renameSync(tmp, caminho(nome));
}

// Lê, altera e grava de uma vez (as chamadas são síncronas, então não se misturam).
function atualizar(nome, alterar, padrao = []) {
  const dados = ler(nome, padrao);
  const resultado = alterar(dados);
  gravar(nome, dados);
  return resultado;
}

module.exports = { ler, gravar, atualizar, PASTA };
