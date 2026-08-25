const express = require('express');
const http = require('http');
const path = require('path');
const crypto = require('crypto');

const { Server } = require('socket.io');
const { Pool } = require('pg');
const multer = require('multer');


// ============================================================
// APLICAÇÃO
// ============================================================

const app = express();
const server = http.createServer(app);


// ============================================================
// CONFIGURAÇÕES
// ============================================================

const PORT =
    Number(process.env.PORT) ||
    10000;

const NODE_ENV =
    process.env.NODE_ENV ||
    'production';

const IS_PRODUCTION =
    NODE_ENV === 'production';

const MAX_JSON_SIZE =
    '15mb';

const MAX_UPLOAD_SIZE =
    10 * 1024 * 1024;

const SESSION_HOURS =
    12;


// ============================================================
// SOCKET.IO
// UMA ÚNICA INICIALIZAÇÃO
// ============================================================

const io = new Server(
    server,
    {
        cors: {
            origin: true,

            methods: [
                'GET',
                'POST',
                'PUT',
                'PATCH',
                'DELETE',
                'OPTIONS'
            ],

            credentials: true
        },

        transports: [
            'websocket',
            'polling'
        ],

        pingTimeout: 20000,
        pingInterval: 25000
    }
);


// ============================================================
// UPLOAD
// MEMÓRIA — ARQUIVOS PEQUENOS
// ============================================================

const upload = multer({
    storage:
        multer.memoryStorage(),

    limits: {
        fileSize:
            MAX_UPLOAD_SIZE
    }
});


// ============================================================
// MIDDLEWARES EXPRESS
// ============================================================

app.disable('x-powered-by');

app.use(
    express.json({
        limit:
            MAX_JSON_SIZE
    })
);

app.use(
    express.urlencoded({
        limit:
            MAX_JSON_SIZE,

        extended:
            true
    })
);


// ============================================================
// HEADERS DE SEGURANÇA
// ============================================================

app.use(
    (req, res, next) => {

        res.setHeader(
            'X-Content-Type-Options',
            'nosniff'
        );

        res.setHeader(
            'X-Frame-Options',
            'SAMEORIGIN'
        );

        res.setHeader(
            'Referrer-Policy',
            'strict-origin-when-cross-origin'
        );

        res.setHeader(
            'Permissions-Policy',
            'camera=(self), geolocation=(self)'
        );

        next();
    }
);


// ============================================================
// LOG DE REQUISIÇÕES
// NÃO REGISTRA SENHAS
// ============================================================

app.use(
    (req, res, next) => {

        const inicio =
            Date.now();

        res.on(
            'finish',
            () => {

                const tempo =
                    Date.now() -
                    inicio;

                console.log(
                    `[HTTP] ${req.method} ${req.originalUrl} ` +
                    `${res.statusCode} ${tempo}ms`
                );
            }
        );

        next();
    }
);


// ============================================================
// ARQUIVOS ESTÁTICOS
// ============================================================

app.use(
    express.static(
        path.join(
            __dirname
        ),
        {
            index: false,

            etag: true,

            maxAge:
                IS_PRODUCTION
                    ? '5m'
                    : 0
        }
    )
);


// ============================================================
// POSTGRESQL
// ============================================================

if (
    !process.env.DATABASE_URL
) {

    console.warn(
        '⚠️ DATABASE_URL não encontrada.'
    );
}


const pool =
    new Pool({

        connectionString:
            process.env.DATABASE_URL,

        ssl:
            process.env.DATABASE_URL
                ? {
                    rejectUnauthorized:
                        false
                }
                : false,

        max: 10,

        idleTimeoutMillis:
            30000,

        connectionTimeoutMillis:
            15000
    });


// ============================================================
// ERROS DO POOL
// ============================================================

pool.on(
    'error',
    err => {

        console.error(
            '❌ Erro inesperado PostgreSQL:',
            err
        );
    }
);


// ============================================================
// FUNÇÕES AUXILIARES
// ============================================================

function normalizarEmail(email) {

    return String(
        email ||
        ''
    )
    .trim()
    .toLowerCase();
}


function textoSeguro(valor) {

    return String(
        valor ??
        ''
    ).trim();
}


function horaAtualRS() {

    return new Date()
        .toLocaleTimeString(
            'pt-BR',
            {
                hour:
                    '2-digit',

                minute:
                    '2-digit',

                second:
                    '2-digit',

                timeZone:
                    'America/Sao_Paulo'
            }
        );
}


function dataHoraAtualISO() {

    return new Date()
        .toISOString();
}


function numeroRS(valor) {

    if (
        typeof valor ===
        'number'
    ) {

        return Number.isFinite(
            valor
        )
            ? valor
            : 0;
    }


    let texto =
        String(
            valor ??
            ''
        )
        .replace(
            /R\$/gi,
            ''
        )
        .replace(
            /\s/g,
            ''
        );


    if (
        texto.includes(',')
    ) {

        texto =
            texto
                .replace(
                    /\./g,
                    ''
                )
                .replace(
                    ',',
                    '.'
                );
    }


    const numero =
        Number(texto);


    return Number.isFinite(
        numero
    )
        ? numero
        : 0;
}


function parseReservas(valor) {

    if (
        Array.isArray(valor)
    ) {

        return valor;
    }


    try {

        const parsed =
            JSON.parse(
                valor ||
                '[]'
            );


        return Array.isArray(
            parsed
        )
            ? parsed
            : [];

    } catch {

        return [];
    }
}


function emailValido(email) {

    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/
        .test(
            normalizarEmail(
                email
            )
        );
}


function idValido(valor) {

    const id =
        Number(valor);


    return (
        Number.isInteger(id) &&
        id > 0
    );
}


// ============================================================
// RESPOSTAS PADRONIZADAS
// ============================================================

function respostaErro(
    res,
    status,
    mensagem,
    extra = {}
) {

    return res
        .status(status)
        .json({
            sucesso: false,
            erro: mensagem,
            ...extra
        });
}


function respostaSucesso(
    res,
    dados = {}
) {

    return res.json({
        sucesso: true,
        ...dados
    });
}


// ============================================================
// SENHAS
//
// COMPATIBILIDADE:
// - usuários antigos continuam entrando com senha antiga
// - após login correto, senha antiga é migrada automaticamente
//   para PBKDF2
// ============================================================

const PASSWORD_PREFIX =
    'pbkdf2';

const PASSWORD_ITERATIONS =
    120000;

const PASSWORD_KEY_LENGTH =
    64;

const PASSWORD_DIGEST =
    'sha512';


function senhaJaProtegida(senha) {

    return String(
        senha ||
        ''
    )
    .startsWith(
        `${PASSWORD_PREFIX}$`
    );
}


function gerarHashSenha(
    senha
) {

    const salt =
        crypto
            .randomBytes(16)
            .toString('hex');


    const hash =
        crypto
            .pbkdf2Sync(
                String(senha),
                salt,
                PASSWORD_ITERATIONS,
                PASSWORD_KEY_LENGTH,
                PASSWORD_DIGEST
            )
            .toString('hex');


    return [
        PASSWORD_PREFIX,
        PASSWORD_ITERATIONS,
        salt,
        hash
    ].join('$');
}


function compararSenha(
    senhaDigitada,
    senhaBanco
) {

    const salva =
        String(
            senhaBanco ||
            ''
        );


    // --------------------------------------------------------
    // CADASTRO ANTIGO — TEXTO SIMPLES
    // --------------------------------------------------------

    if (
        !senhaJaProtegida(
            salva
        )
    ) {

        return String(
            senhaDigitada
        ) === salva;
    }


    // --------------------------------------------------------
    // SENHA NOVA — PBKDF2
    // --------------------------------------------------------

    try {

        const partes =
            salva.split('$');


        if (
            partes.length !== 4
        ) {

            return false;
        }


        const [
            prefixo,
            iteracoesTexto,
            salt,
            hashEsperado
        ] =
            partes;


        if (
            prefixo !==
            PASSWORD_PREFIX
        ) {

            return false;
        }


        const iteracoes =
            Number(
                iteracoesTexto
            );


        if (
            !Number.isInteger(
                iteracoes
            )
            ||
            iteracoes <= 0
        ) {

            return false;
        }


        const hashDigitado =
            crypto
                .pbkdf2Sync(
                    String(
                        senhaDigitada
                    ),
                    salt,
                    iteracoes,
                    PASSWORD_KEY_LENGTH,
                    PASSWORD_DIGEST
                )
                .toString('hex');


        const bufferEsperado =
            Buffer.from(
                hashEsperado,
                'hex'
            );


        const bufferDigitado =
            Buffer.from(
                hashDigitado,
                'hex'
            );


        if (
            bufferEsperado.length !==
            bufferDigitado.length
        ) {

            return false;
        }


        return crypto
            .timingSafeEqual(
                bufferEsperado,
                bufferDigitado
            );

    } catch {

        return false;
    }
}


// ============================================================
// TOKEN DE SESSÃO
// PREPARADO PARA O INDEX USAR TAMBÉM
// ============================================================

function gerarTokenSessao() {

    return crypto
        .randomBytes(48)
        .toString('hex');
}


function gerarHashToken(
    token
) {

    return crypto
        .createHash('sha256')
        .update(
            String(token)
        )
        .digest('hex');
}


function calcularExpiracaoSessao() {

    return new Date(
        Date.now() +
        SESSION_HOURS *
        60 *
        60 *
        1000
    );
}


// ============================================================
// BUSCAR USUÁRIO
// ============================================================

async function buscarUsuarioPorEmail(
    email
) {

    const resultado =
        await pool.query(
            `
            SELECT *
            FROM usuarios
            WHERE LOWER(email) = LOWER($1)
            LIMIT 1
            `,
            [
                normalizarEmail(
                    email
                )
            ]
        );


    return resultado
        .rows[0] ||
        null;
}


// ============================================================
// NÃO DEVOLVER SENHA AO INDEX
// ============================================================

function usuarioPublico(
    usuario
) {

    if (!usuario) {

        return null;
    }


    const {
        senha,
        ...seguro
    } =
        usuario;


    return seguro;
}


// ============================================================
// BUSCAR SERVIÇO
// ============================================================

async function buscarServico(
    servicoId
) {

    if (
        !idValido(
            servicoId
        )
    ) {

        return null;
    }


    const resultado =
        await pool.query(
            `
            SELECT *
            FROM servicos
            WHERE id = $1
            LIMIT 1
            `,
            [
                Number(
                    servicoId
                )
            ]
        );


    return resultado
        .rows[0] ||
        null;
}


// ============================================================
// COMPATIBILIDADE DE EMPRESA
// SERVIÇOS ANTIGOS + NOVOS
// ============================================================

function emailEmpresaLegado(
    servico
) {

    return normalizarEmail(

        servico?.empresa_email ||

        servico?.empresaEmail ||

        servico?.email_empresa ||

        servico?.emailEmpresa ||

        servico?.cliente_email ||

        servico?.clienteEmail ||

        servico?.contratante_email ||

        servico?.contratanteEmail ||

        servico?.criado_por ||

        servico?.criadoPor ||

        ''
    );
}


function nomeEmpresaLegado(
    servico
) {

    return textoSeguro(

        servico?.empresa_nome ||

        servico?.empresaNome ||

        servico?.nome_empresa ||

        servico?.nomeEmpresa ||

        servico?.cliente_nome ||

        servico?.clienteNome ||

        servico?.contratante_nome ||

        servico?.contratanteNome ||

        ''
    );
}


async function resolverEmpresaDoServico(
    servico
) {

    if (!servico) {

        return {
            email: '',
            nome: ''
        };
    }


    let email =
        emailEmpresaLegado(
            servico
        );


    let nome =
        nomeEmpresaLegado(
            servico
        );


    // --------------------------------------------------------
    // JÁ TEM E-MAIL
    // --------------------------------------------------------

    if (email) {

        if (!nome) {

            try {

                const usuario =
                    await buscarUsuarioPorEmail(
                        email
                    );


                nome =
                    usuario?.nome ||
                    '';

            } catch {}
        }


        return {
            email,
            nome
        };
    }


    // --------------------------------------------------------
    // TENTAR IDs DE ESTRUTURAS ANTIGAS
    // --------------------------------------------------------

    const idsPossiveis =
        [
            servico.empresa_id,
            servico.empresaId,
            servico.cliente_id,
            servico.clienteId,
            servico.usuario_empresa_id,
            servico.usuarioEmpresaId
        ]
        .map(Number)
        .filter(
            id =>
                Number.isInteger(id) &&
                id > 0
        );


    for (
        const empresaId
        of idsPossiveis
    ) {

        try {

            const resultado =
                await pool.query(
                    `
                    SELECT
                        id,
                        nome,
                        email,
                        tipo

                    FROM usuarios

                    WHERE id = $1

                    LIMIT 1
                    `,
                    [
                        empresaId
                    ]
                );


            if (
                resultado.rows.length
            ) {

                email =
                    normalizarEmail(
                        resultado
                            .rows[0]
                            .email
                    );


                nome =
                    resultado
                        .rows[0]
                        .nome ||
                    nome;


                break;
            }

        } catch {}
    }


    // --------------------------------------------------------
    // TENTAR PELO NOME DA EMPRESA
    // --------------------------------------------------------

    if (
        !email &&
        nome
    ) {

        try {

            const resultado =
                await pool.query(
                    `
                    SELECT
                        nome,
                        email

                    FROM usuarios

                    WHERE
                        LOWER(nome) =
                        LOWER($1)

                    AND
                        LOWER(
                            COALESCE(
                                tipo,
                                ''
                            )
                        )
                        IN (
                            'empresa',
                            'cliente',
                            'contratante'
                        )

                    LIMIT 1
                    `,
                    [
                        nome
                    ]
                );


            if (
                resultado.rows.length
            ) {

                email =
                    normalizarEmail(
                        resultado
                            .rows[0]
                            .email
                    );


                nome =
                    resultado
                        .rows[0]
                        .nome ||
                    nome;
            }

        } catch {}
    }


    // --------------------------------------------------------
    // ACHOU → SALVAR NO FORMATO NOVO
    // SEM APAGAR DADO ANTIGO
    // --------------------------------------------------------

    if (
        email &&
        servico.id
    ) {

        try {

            await pool.query(
                `
                UPDATE servicos

                SET
                    empresa_email =
                        COALESCE(
                            NULLIF(
                                empresa_email,
                                ''
                            ),
                            $1
                        ),

                    empresa_nome =
                        COALESCE(
                            NULLIF(
                                empresa_nome,
                                ''
                            ),
                            $2
                        )

                WHERE id = $3
                `,
                [
                    email,
                    nome ||
                    '',
                    servico.id
                ]
            );

        } catch (
            erro
        ) {

            console.warn(
                `⚠️ Serviço #${servico.id}: ` +
                `não foi possível atualizar vínculo legado:`,
                erro.message
            );
        }
    }


    return {
        email,
        nome
    };
}


// ============================================================
// VALOR COMPATÍVEL
// ============================================================

function valorServicoCompat(
    servico
) {

    return numeroRS(

        servico?.valor_diaria ??

        servico?.valorDiaria ??

        servico?.valor_servico ??

        servico?.valorServico ??

        servico?.valor ??

        servico?.preco ??

        servico?.diaria ??

        servico?.valor_total ??

        servico?.valorTotal ??

        0
    );
}


// ============================================================
// NORMALIZAR SERVIÇO PARA O INDEX
// ============================================================

async function normalizarServicoSaida(
    servico
) {

    const empresa =
        await resolverEmpresaDoServico(
            servico
        );


    const valorCompat =
        valorServicoCompat(
            servico
        );


    const dataHorario =
        textoSeguro(
            servico.data_horario
        );


    let data =
        textoSeguro(
            servico.data
        );


    let horarioInicio =
        textoSeguro(
            servico.horario_inicio
        );


    if (
        dataHorario &&
        dataHorario.includes('T')
    ) {

        const partes =
            dataHorario.split('T');


        if (!data) {

            data =
                partes[0] ||
                '';
        }


        if (!horarioInicio) {

            horarioInicio =
                String(
                    partes[1] ||
                    ''
                )
                .slice(
                    0,
                    5
                );
        }
    }


    return {
        ...servico,

        empresa_email:
            empresa.email ||
            servico.empresa_email ||
            '',

        empresa_nome:
            empresa.nome ||
            servico.empresa_nome ||
            'Empresa contratante',

        data,

        horario_inicio:
            horarioInicio,

        valor:
            numeroRS(
                servico.valor
            ) > 0
                ? numeroRS(
                    servico.valor
                )
                : valorCompat,

        valor_diaria:
            numeroRS(
                servico.valor_diaria
            ) > 0
                ? numeroRS(
                    servico.valor_diaria
                )
                : valorCompat
    };
}


// ============================================================
// PERMISSÕES BÁSICAS
// ============================================================

function prestadorEhTitular(
    servico,
    email
) {

    return normalizarEmail(
        servico?.prestador_email
    )
    ===
    normalizarEmail(
        email
    );
}


async function empresaEhResponsavel(
    servico,
    email
) {

    const empresa =
        await resolverEmpresaDoServico(
            servico
        );


    return (
        empresa.email ===
        normalizarEmail(
            email
        )
    );
}


// ============================================================
// AUDITORIA
// ============================================================

async function registrarAuditoria(
    email,
    acao,
    detalhes
) {

    try {

        await pool.query(
            `
            INSERT INTO auditoria_sistema (
                usuario_email,
                acao,
                detalhes
            )

            VALUES (
                $1,
                $2,
                $3
            )
            `,
            [
                normalizarEmail(
                    email
                ) ||
                'sistema',

                textoSeguro(
                    acao
                ),

                textoSeguro(
                    detalhes
                )
            ]
        );

    } catch (
        erro
    ) {

        console.error(
            'Erro Auditoria:',
            erro.message
        );
    }
}


// ============================================================
// LEDGER FINANCEIRO
// ============================================================

async function registrarLedger(
    servicoId,
    email,
    tipoMovimento,
    valor
) {

    try {

        await pool.query(
            `
            INSERT INTO ledger_transacoes (
                servico_id,
                usuario_email,
                tipo_movimento,
                valor
            )

            VALUES (
                $1,
                $2,
                $3,
                $4
            )
            `,
            [
                servicoId,

                normalizarEmail(
                    email
                ) ||
                'sistema',

                textoSeguro(
                    tipoMovimento
                ),

                numeroRS(
                    valor
                )
            ]
        );

    } catch (
        erro
    ) {

        console.error(
            'Erro Ledger:',
            erro.message
        );
    }
}


// ============================================================
// ATUALIZAÇÃO EM TEMPO REAL
// ============================================================

function emitirAtualizacao(
    servicoId = null,
    tipo = 'servico'
) {

    const payload = {

        servicoId,

        tipo,

        atualizadoEm:
            new Date()
                .toISOString()
    };


    io.emit(
        'atualizar_servicos',
        payload
    );


    io.emit(
        'servicosAtualizados',
        payload
    );


    io.emit(
        'servicos_atualizados',
        payload
    );


    io.emit(
        'servico_atualizado',
        payload
    );
}


// ============================================================
// BANCO DE DADOS
//
// SOMENTE:
// CREATE TABLE IF NOT EXISTS
// ALTER TABLE ADD COLUMN IF NOT EXISTS
//
// NÃO EXISTE DROP TABLE.
// NÃO APAGA CADASTROS.
// ============================================================

async function criarTabelas() {

    try {

        // ====================================================
        // USUÁRIOS
        // ====================================================

        await pool.query(`
            CREATE TABLE IF NOT EXISTS usuarios (

                id SERIAL PRIMARY KEY,

                tipo TEXT,

                nome TEXT,

                doc TEXT,

                responsavel TEXT,

                email TEXT UNIQUE,

                senha TEXT,

                whatsapp TEXT,

                endereco TEXT,

                rg_cnh TEXT,

                profissao TEXT,

                tipo_chave_pix TEXT,

                pix TEXT,

                banco TEXT,

                conta TEXT,

                experiencia TEXT,

                descricao TEXT,

                criado_em TIMESTAMP
                    DEFAULT CURRENT_TIMESTAMP,

                atualizado_em TIMESTAMP
                    DEFAULT CURRENT_TIMESTAMP
            );
        `);


        // ====================================================
        // PRESTADORES
        // ====================================================

        await pool.query(`
            CREATE TABLE IF NOT EXISTS prestadores (

                id SERIAL PRIMARY KEY,

                email TEXT UNIQUE,

                reputacao NUMERIC(3,2)
                    DEFAULT 5.0,

                advertencias INTEGER
                    DEFAULT 0,

                criado_em TIMESTAMP
                    DEFAULT CURRENT_TIMESTAMP
            );
        `);


        // ====================================================
        // SERVIÇOS
        // ====================================================

        await pool.query(`
            CREATE TABLE IF NOT EXISTS servicos (

                id SERIAL PRIMARY KEY,

                titulo TEXT,

                categoria TEXT,

                local TEXT,

                cidade TEXT,

                endereco TEXT,

                valor TEXT,

                valor_diaria NUMERIC(12,2)
                    DEFAULT 0,

                valor_liquido NUMERIC(12,2)
                    DEFAULT 0,

                valor_total NUMERIC(12,2)
                    DEFAULT 0,

                data TEXT,

                horario_inicio TEXT,

                data_horario TEXT,

                horario_fim TEXT,

                forma_pgto TEXT,

                descricao TEXT,

                exigencias TEXT,

                instrucoes_escala TEXT,

                contrato_texto TEXT,

                prazo_confirmacao TEXT,

                empresa_email TEXT,

                empresa_nome TEXT,

                empresa_whatsapp TEXT,

                empresa_descricao TEXT,

                responsavel_servico TEXT,

                whatsapp_responsavel TEXT,

                recorrencia TEXT
                    DEFAULT 'unico',

                status TEXT
                    DEFAULT 'ativo',

                motivo_cancelamento TEXT,

                cancelado_em TIMESTAMP,

                prestador_email TEXT,

                prestador_id INTEGER,

                prestador_nome TEXT,

                prestador_pix TEXT,

                prestador_whatsapp TEXT,

                reservas JSONB
                    DEFAULT '[]'::jsonb,

                mensagens JSONB
                    DEFAULT '[]'::jsonb,

                contrato_assinado TEXT,

                contrato_assinado_em TIMESTAMP,

                contrato_aceito BOOLEAN
                    DEFAULT FALSE,

                contrato_aceito_em TIMESTAMP,

                presenca_confirmada BOOLEAN
                    DEFAULT FALSE,

                presenca_hora TEXT,

                presenca_latitude TEXT,

                presenca_longitude TEXT,

                presenca_precisao TEXT,

                selfie_confirmacao TEXT,

                confirmacao_expirada BOOLEAN
                    DEFAULT FALSE,

                confirmado_em TIMESTAMP,

                substituido_em TIMESTAMP,

                motivo_substituicao TEXT,

                status_checkin TEXT
                    DEFAULT 'pendente',

                foto_ponto TEXT,

                checkin_hora TEXT,

                checkin_foto TEXT,

                checkin_latitude TEXT,

                checkin_longitude TEXT,

                intervalo_inicio TEXT,

                intervalo_fim TEXT,

                intervalo_retorno TEXT,

                em_intervalo BOOLEAN
                    DEFAULT FALSE,

                checkout_hora TEXT,

                checkout_foto TEXT,

                checkout_latitude TEXT,

                checkout_longitude TEXT,

                validado_empresa BOOLEAN
                    DEFAULT FALSE,

                validado_em TIMESTAMP,

                pagamento_autorizado BOOLEAN
                    DEFAULT FALSE,

                pagamento_autorizado_em TIMESTAMP,

                pagamento_realizado BOOLEAN
                    DEFAULT FALSE,

                pagamento_realizado_em TIMESTAMP,

                comprovante_pagamento BOOLEAN
                    DEFAULT FALSE,

                comprovante_pagamento_arquivo TEXT,

                documento_comprovante TEXT,

                nota_oficial TEXT,

                criado_em TIMESTAMP
                    DEFAULT CURRENT_TIMESTAMP,

                atualizado_em TIMESTAMP
                    DEFAULT CURRENT_TIMESTAMP
            );
        `);


        // ====================================================
        // AUDITORIA
        // ====================================================

        await pool.query(`
            CREATE TABLE IF NOT EXISTS auditoria_sistema (

                id SERIAL PRIMARY KEY,

                usuario_email TEXT,

                acao TEXT NOT NULL,

                detalhes TEXT,

                criado_em TIMESTAMP
                    DEFAULT CURRENT_TIMESTAMP
            );
        `);


        // ====================================================
        // LEDGER
        // ====================================================

        await pool.query(`
            CREATE TABLE IF NOT EXISTS ledger_transacoes (

                id SERIAL PRIMARY KEY,

                servico_id INTEGER,

                usuario_email TEXT,

                usuario_id INTEGER,

                tipo TEXT,

                tipo_movimento TEXT,

                valor NUMERIC(12,2)
                    NOT NULL,

                status TEXT
                    NOT NULL
                    DEFAULT 'PROCESSADO',

                criado_em TIMESTAMP
                    DEFAULT CURRENT_TIMESTAMP
            );
        `);


        // ====================================================
        // PAGAMENTOS
        // ====================================================

        await pool.query(`
            CREATE TABLE IF NOT EXISTS pagamentos (

                id SERIAL PRIMARY KEY,

                servico_id INTEGER
                    NOT NULL,

                empresa_email TEXT,

                prestador_email TEXT,

                valor NUMERIC(12,2)
                    DEFAULT 0,

                forma_pagamento TEXT,

                status TEXT
                    DEFAULT 'PENDENTE',

                comprovante TEXT,

                autorizado_em TIMESTAMP,

                pago_em TIMESTAMP,

                criado_em TIMESTAMP
                    DEFAULT CURRENT_TIMESTAMP,

                atualizado_em TIMESTAMP
                    DEFAULT CURRENT_TIMESTAMP
            );
        `);


        // ====================================================
        // DOCUMENTOS
        // ====================================================

        await pool.query(`
            CREATE TABLE IF NOT EXISTS documentos_rs (

                id SERIAL PRIMARY KEY,

                servico_id INTEGER,

                empresa_email TEXT,

                prestador_email TEXT,

                categoria TEXT,

                nome TEXT,

                arquivo TEXT,

                criado_em TIMESTAMP
                    DEFAULT CURRENT_TIMESTAMP
            );
        `);


        // ====================================================
        // CHAT
        // ====================================================

        await pool.query(`
            CREATE TABLE IF NOT EXISTS conversas (

                id SERIAL PRIMARY KEY,

                servico_id INTEGER
                    NOT NULL,

                empresa_email TEXT
                    NOT NULL,

                prestador_email TEXT
                    NOT NULL,

                criado_em TIMESTAMP
                    DEFAULT CURRENT_TIMESTAMP,

                atualizado_em TIMESTAMP
                    DEFAULT CURRENT_TIMESTAMP,

                ativo BOOLEAN
                    DEFAULT TRUE,

                UNIQUE (
                    servico_id,
                    empresa_email,
                    prestador_email
                )
            );
        `);


        await pool.query(`
            CREATE TABLE IF NOT EXISTS mensagens_chat (

                id SERIAL PRIMARY KEY,

                conversa_id INTEGER
                    NOT NULL
                    REFERENCES conversas(id)
                    ON DELETE CASCADE,

                servico_id INTEGER
                    NOT NULL,

                remetente_email TEXT
                    NOT NULL,

                destinatario_email TEXT
                    NOT NULL,

                mensagem TEXT
                    NOT NULL,

                tipo TEXT
                    DEFAULT 'texto',

                lida BOOLEAN
                    DEFAULT FALSE,

                criado_em TIMESTAMP
                    DEFAULT CURRENT_TIMESTAMP
            );
        `);


        // ====================================================
        // SESSÕES
        // ====================================================

        await pool.query(`
            CREATE TABLE IF NOT EXISTS sessoes_rs (

                id SERIAL PRIMARY KEY,

                usuario_id INTEGER,

                usuario_email TEXT
                    NOT NULL,

                token_hash TEXT
                    UNIQUE
                    NOT NULL,

                criado_em TIMESTAMP
                    DEFAULT CURRENT_TIMESTAMP,

                expira_em TIMESTAMP
                    NOT NULL,

                ultimo_acesso TIMESTAMP
                    DEFAULT CURRENT_TIMESTAMP,

                revogada BOOLEAN
                    DEFAULT FALSE
            );
        `);


        // ====================================================
        // HISTÓRICO DE ESCALA / SUBSTITUIÇÃO
        // ====================================================

        await pool.query(`
            CREATE TABLE IF NOT EXISTS historico_escalas (

                id SERIAL PRIMARY KEY,

                servico_id INTEGER
                    NOT NULL,

                trabalhador_email TEXT,

                tipo TEXT,

                origem TEXT,

                destino TEXT,

                motivo TEXT,

                criado_em TIMESTAMP
                    DEFAULT CURRENT_TIMESTAMP
            );
        `);


        // ====================================================
        // GARANTIR COLUNAS EM BANCOS ANTIGOS
        // ====================================================

        const alteracoes = [

            // USUÁRIOS

            `
            ALTER TABLE usuarios
            ADD COLUMN IF NOT EXISTS descricao TEXT
            `,

            `
            ALTER TABLE usuarios
            ADD COLUMN IF NOT EXISTS criado_em TIMESTAMP
            DEFAULT CURRENT_TIMESTAMP
            `,

            `
            ALTER TABLE usuarios
            ADD COLUMN IF NOT EXISTS atualizado_em TIMESTAMP
            DEFAULT CURRENT_TIMESTAMP
            `,


            // SERVIÇOS — INTERFACE NOVA

            `
            ALTER TABLE servicos
            ADD COLUMN IF NOT EXISTS categoria TEXT
            `,

            `
            ALTER TABLE servicos
            ADD COLUMN IF NOT EXISTS cidade TEXT
            `,

            `
            ALTER TABLE servicos
            ADD COLUMN IF NOT EXISTS endereco TEXT
            `,

            `
            ALTER TABLE servicos
            ADD COLUMN IF NOT EXISTS data TEXT
            `,

            `
            ALTER TABLE servicos
            ADD COLUMN IF NOT EXISTS horario_inicio TEXT
            `,

            `
            ALTER TABLE servicos
            ADD COLUMN IF NOT EXISTS data_horario TEXT
            `,

            `
            ALTER TABLE servicos
            ADD COLUMN IF NOT EXISTS horario_fim TEXT
            `,

            `
            ALTER TABLE servicos
            ADD COLUMN IF NOT EXISTS forma_pgto TEXT
            `,

            `
            ALTER TABLE servicos
            ADD COLUMN IF NOT EXISTS valor_diaria NUMERIC(12,2)
            DEFAULT 0
            `,

            `
            ALTER TABLE servicos
            ADD COLUMN IF NOT EXISTS valor_liquido NUMERIC(12,2)
            DEFAULT 0
            `,

            `
            ALTER TABLE servicos
            ADD COLUMN IF NOT EXISTS valor_total NUMERIC(12,2)
            DEFAULT 0
            `,

            `
            ALTER TABLE servicos
            ADD COLUMN IF NOT EXISTS descricao TEXT
            `,

            `
            ALTER TABLE servicos
            ADD COLUMN IF NOT EXISTS exigencias TEXT
            `,

            `
            ALTER TABLE servicos
            ADD COLUMN IF NOT EXISTS instrucoes_escala TEXT
            `,

            `
            ALTER TABLE servicos
            ADD COLUMN IF NOT EXISTS contrato_texto TEXT
            `,

            `
            ALTER TABLE servicos
            ADD COLUMN IF NOT EXISTS prazo_confirmacao TEXT
            `,


            // EMPRESA

            `
            ALTER TABLE servicos
            ADD COLUMN IF NOT EXISTS empresa_email TEXT
            `,

            `
            ALTER TABLE servicos
            ADD COLUMN IF NOT EXISTS empresa_nome TEXT
            `,

            `
            ALTER TABLE servicos
            ADD COLUMN IF NOT EXISTS empresa_whatsapp TEXT
            `,

            `
            ALTER TABLE servicos
            ADD COLUMN IF NOT EXISTS empresa_descricao TEXT
            `,

            `
            ALTER TABLE servicos
            ADD COLUMN IF NOT EXISTS responsavel_servico TEXT
            `,

            `
            ALTER TABLE servicos
            ADD COLUMN IF NOT EXISTS whatsapp_responsavel TEXT
            `,


            // RECORRÊNCIA

            `
            ALTER TABLE servicos
            ADD COLUMN IF NOT EXISTS recorrencia TEXT
            DEFAULT 'unico'
            `,


            // STATUS

            `
            ALTER TABLE servicos
            ADD COLUMN IF NOT EXISTS motivo_cancelamento TEXT
            `,

            `
            ALTER TABLE servicos
            ADD COLUMN IF NOT EXISTS cancelado_em TIMESTAMP
            `,


            // RESERVAS

            `
            ALTER TABLE servicos
            ADD COLUMN IF NOT EXISTS reservas JSONB
            DEFAULT '[]'::jsonb
            `,

            `
            ALTER TABLE servicos
            ADD COLUMN IF NOT EXISTS mensagens JSONB
            DEFAULT '[]'::jsonb
            `,


            // CONTRATO

            `
            ALTER TABLE servicos
            ADD COLUMN IF NOT EXISTS contrato_assinado TEXT
            `,

            `
            ALTER TABLE servicos
            ADD COLUMN IF NOT EXISTS contrato_assinado_em TIMESTAMP
            `,

            `
            ALTER TABLE servicos
            ADD COLUMN IF NOT EXISTS contrato_aceito BOOLEAN
            DEFAULT FALSE
            `,

            `
            ALTER TABLE servicos
            ADD COLUMN IF NOT EXISTS contrato_aceito_em TIMESTAMP
            `,


            // CONFIRMAÇÃO

            `
            ALTER TABLE servicos
            ADD COLUMN IF NOT EXISTS presenca_confirmada BOOLEAN
            DEFAULT FALSE
            `,

            `
            ALTER TABLE servicos
            ADD COLUMN IF NOT EXISTS presenca_hora TEXT
            `,

            `
            ALTER TABLE servicos
            ADD COLUMN IF NOT EXISTS presenca_latitude TEXT
            `,

            `
            ALTER TABLE servicos
            ADD COLUMN IF NOT EXISTS presenca_longitude TEXT
            `,

            `
            ALTER TABLE servicos
            ADD COLUMN IF NOT EXISTS presenca_precisao TEXT
            `,

            `
            ALTER TABLE servicos
            ADD COLUMN IF NOT EXISTS selfie_confirmacao TEXT
            `,

            `
            ALTER TABLE servicos
            ADD COLUMN IF NOT EXISTS confirmacao_expirada BOOLEAN
            DEFAULT FALSE
            `,

            `
            ALTER TABLE servicos
            ADD COLUMN IF NOT EXISTS confirmado_em TIMESTAMP
            `,

            `
            ALTER TABLE servicos
            ADD COLUMN IF NOT EXISTS substituido_em TIMESTAMP
            `,

            `
            ALTER TABLE servicos
            ADD COLUMN IF NOT EXISTS motivo_substituicao TEXT
            `,


            // CHECK-IN

            `
            ALTER TABLE servicos
            ADD COLUMN IF NOT EXISTS status_checkin TEXT
            DEFAULT 'pendente'
            `,

            `
            ALTER TABLE servicos
            ADD COLUMN IF NOT EXISTS foto_ponto TEXT
            `,

            `
            ALTER TABLE servicos
            ADD COLUMN IF NOT EXISTS checkin_hora TEXT
            `,

            `
            ALTER TABLE servicos
            ADD COLUMN IF NOT EXISTS checkin_foto TEXT
            `,

            `
            ALTER TABLE servicos
            ADD COLUMN IF NOT EXISTS checkin_latitude TEXT
            `,

            `
            ALTER TABLE servicos
            ADD COLUMN IF NOT EXISTS checkin_longitude TEXT
            `,


            // INTERVALO

            `
            ALTER TABLE servicos
            ADD COLUMN IF NOT EXISTS intervalo_inicio TEXT
            `,

            `
            ALTER TABLE servicos
            ADD COLUMN IF NOT EXISTS intervalo_fim TEXT
            `,

            `
            ALTER TABLE servicos
            ADD COLUMN IF NOT EXISTS intervalo_retorno TEXT
            `,

            `
            ALTER TABLE servicos
            ADD COLUMN IF NOT EXISTS em_intervalo BOOLEAN
            DEFAULT FALSE
            `,


            // CHECK-OUT

            `
            ALTER TABLE servicos
            ADD COLUMN IF NOT EXISTS checkout_hora TEXT
            `,

            `
            ALTER TABLE servicos
            ADD COLUMN IF NOT EXISTS checkout_foto TEXT
            `,

            `
            ALTER TABLE servicos
            ADD COLUMN IF NOT EXISTS checkout_latitude TEXT
            `,

            `
            ALTER TABLE servicos
            ADD COLUMN IF NOT EXISTS checkout_longitude TEXT
            `,


            // VALIDAÇÃO

            `
            ALTER TABLE servicos
            ADD COLUMN IF NOT EXISTS validado_empresa BOOLEAN
            DEFAULT FALSE
            `,

            `
            ALTER TABLE servicos
            ADD COLUMN IF NOT EXISTS validado_em TIMESTAMP
            `,


            // PAGAMENTO

            `
            ALTER TABLE servicos
            ADD COLUMN IF NOT EXISTS pagamento_autorizado BOOLEAN
            DEFAULT FALSE
            `,

            `
            ALTER TABLE servicos
            ADD COLUMN IF NOT EXISTS pagamento_autorizado_em TIMESTAMP
            `,

            `
            ALTER TABLE servicos
            ADD COLUMN IF NOT EXISTS pagamento_realizado BOOLEAN
            DEFAULT FALSE
            `,

            `
            ALTER TABLE servicos
            ADD COLUMN IF NOT EXISTS pagamento_realizado_em TIMESTAMP
            `,

            `
            ALTER TABLE servicos
            ADD COLUMN IF NOT EXISTS comprovante_pagamento BOOLEAN
            DEFAULT FALSE
            `,

            `
            ALTER TABLE servicos
            ADD COLUMN IF NOT EXISTS comprovante_pagamento_arquivo TEXT
            `,

            `
            ALTER TABLE servicos
            ADD COLUMN IF NOT EXISTS documento_comprovante TEXT
            `,

            `
            ALTER TABLE servicos
            ADD COLUMN IF NOT EXISTS nota_oficial TEXT
            `,


            // CONTROLE DE DATA

            `
            ALTER TABLE servicos
            ADD COLUMN IF NOT EXISTS criado_em TIMESTAMP
            DEFAULT CURRENT_TIMESTAMP
            `,

            `
            ALTER TABLE servicos
            ADD COLUMN IF NOT EXISTS atualizado_em TIMESTAMP
            DEFAULT CURRENT_TIMESTAMP
            `
        ];


        for (
            const sql
            of alteracoes
        ) {

            try {

                await pool.query(
                    sql
                );

            } catch (
                erro
            ) {

                console.warn(
                    '⚠️ Coluna não aplicada:',
                    erro.message
                );
            }
        }


        // ====================================================
        // ÍNDICES
        // ====================================================

        await pool.query(`
            CREATE INDEX IF NOT EXISTS
                idx_usuarios_email_lower
            ON usuarios (
                LOWER(email)
            );
        `);


        await pool.query(`
            CREATE INDEX IF NOT EXISTS
                idx_servicos_empresa
            ON servicos (
                empresa_email
            );
        `);


        await pool.query(`
            CREATE INDEX IF NOT EXISTS
                idx_servicos_prestador
            ON servicos (
                prestador_email
            );
        `);


        await pool.query(`
            CREATE INDEX IF NOT EXISTS
                idx_servicos_status
            ON servicos (
                status
            );
        `);


        await pool.query(`
            CREATE INDEX IF NOT EXISTS
                idx_servicos_data
            ON servicos (
                data
            );
        `);


        await pool.query(`
            CREATE INDEX IF NOT EXISTS
                idx_documentos_empresa
            ON documentos_rs (
                empresa_email
            );
        `);


        await pool.query(`
            CREATE INDEX IF NOT EXISTS
                idx_documentos_prestador
            ON documentos_rs (
                prestador_email
            );
        `);


        await pool.query(`
            CREATE INDEX IF NOT EXISTS
                idx_documentos_servico
            ON documentos_rs (
                servico_id
            );
        `);


        await pool.query(`
            CREATE INDEX IF NOT EXISTS
                idx_conversas_empresa
            ON conversas (
                empresa_email
            );
        `);


        await pool.query(`
            CREATE INDEX IF NOT EXISTS
                idx_conversas_prestador
            ON conversas (
                prestador_email
            );
        `);


        await pool.query(`
            CREATE INDEX IF NOT EXISTS
                idx_chat_conversa
            ON mensagens_chat (
                conversa_id
            );
        `);


        await pool.query(`
            CREATE INDEX IF NOT EXISTS
                idx_chat_destinatario_lida
            ON mensagens_chat (
                destinatario_email,
                lida
            );
        `);


        await pool.query(`
            CREATE INDEX IF NOT EXISTS
                idx_auditoria_email
            ON auditoria_sistema (
                usuario_email
            );
        `);


        await pool.query(`
            CREATE INDEX IF NOT EXISTS
                idx_auditoria_data
            ON auditoria_sistema (
                criado_em
            );
        `);


        await pool.query(`
            CREATE INDEX IF NOT EXISTS
                idx_sessoes_email
            ON sessoes_rs (
                usuario_email
            );
        `);


        await pool.query(`
            CREATE INDEX IF NOT EXISTS
                idx_sessoes_token
            ON sessoes_rs (
                token_hash
            );
        `);


        // ====================================================
        // ÍNDICE DE PAGAMENTO
        //
        // Não usamos UNIQUE aqui ainda para evitar quebrar
        // bancos antigos que já possam ter duplicatas.
        // O controle de duplicidade será feito nas rotas.
        // ====================================================

        await pool.query(`
            CREATE INDEX IF NOT EXISTS
                idx_pagamentos_servico_prestador
            ON pagamentos (
                servico_id,
                prestador_email
            );
        `);


        console.log(
            '✅ Estrutura do banco RS Connect verificada.'
        );


        console.log(
            '✅ Cadastros existentes preservados.'
        );

    } catch (
        erro
    ) {

        console.error(
            '❌ Erro ao preparar banco RS Connect:',
            erro
        );


        throw erro;
    }
}


// ============================================================
// CONECTAR AO BANCO
// ============================================================

async function testarBanco() {

    const client =
        await pool.connect();


    try {

        await client.query(
            'SELECT NOW()'
        );


        console.log(
            '✅ PostgreSQL conectado.'
        );

    } finally {

        client.release();
    }
}


// ============================================================
// LIMPAR SESSÕES EXPIRADAS
// ============================================================

async function limparSessoesExpiradas() {

    try {

        await pool.query(
            `
            DELETE FROM sessoes_rs

            WHERE
                expira_em <
                CURRENT_TIMESTAMP

            OR
                revogada = TRUE
            `
        );

    } catch (
        erro
    ) {

        console.warn(
            'Aviso ao limpar sessões:',
            erro.message
        );
    }
}


// ============================================================
// CRIAR SESSÃO
// ============================================================

async function criarSessaoUsuario(
    usuario
) {

    const token =
        gerarTokenSessao();


    const tokenHash =
        gerarHashToken(
            token
        );


    const expiracao =
        calcularExpiracaoSessao();


    await pool.query(
        `
        INSERT INTO sessoes_rs (

            usuario_id,
            usuario_email,
            token_hash,
            expira_em

        )

        VALUES (
            $1,
            $2,
            $3,
            $4
        )
        `,
        [
            usuario.id ||
            null,

            normalizarEmail(
                usuario.email
            ),

            tokenHash,

            expiracao
        ]
    );


    return {
        token,
        expiraEm:
            expiracao.toISOString()
    };
}


// ============================================================
// IDENTIFICAR TOKEN
// PREPARADO PARA AS ROTAS SENSÍVEIS
// ============================================================

function extrairBearerToken(
    req
) {

    const header =
        String(
            req.headers.authorization ||
            ''
        );


    if (
        !header
            .toLowerCase()
            .startsWith(
                'bearer '
            )
    ) {

        return '';
    }


    return header
        .slice(7)
        .trim();
}


// ============================================================
// BUSCAR SESSÃO PELO TOKEN
// ============================================================

async function buscarSessaoPorToken(
    token
) {

    if (!token) {

        return null;
    }


    const tokenHash =
        gerarHashToken(
            token
        );


    const resultado =
        await pool.query(
            `
            SELECT *
            FROM sessoes_rs

            WHERE
                token_hash = $1

            AND
                revogada = FALSE

            AND
                expira_em >
                CURRENT_TIMESTAMP

            LIMIT 1
            `,
            [
                tokenHash
            ]
        );


    return resultado
        .rows[0] ||
        null;
}


// ============================================================
// MIDDLEWARE DE AUTENTICAÇÃO
//
// Por enquanto será usado nas partes sensíveis.
// As rotas antigas continuam compatíveis.
// ============================================================

async function autenticarOpcional(
    req,
    res,
    next
) {

    try {

        const token =
            extrairBearerToken(
                req
            );


        if (!token) {

            req.sessaoRS =
                null;

            return next();
        }


        const sessao =
            await buscarSessaoPorToken(
                token
            );


        if (!sessao) {

            req.sessaoRS =
                null;

            return next();
        }


        req.sessaoRS =
            sessao;


        await pool.query(
            `
            UPDATE sessoes_rs

            SET
                ultimo_acesso =
                    CURRENT_TIMESTAMP

            WHERE id = $1
            `,
            [
                sessao.id
            ]
        );


        next();

    } catch (
        erro
    ) {

        console.error(
            'Erro autenticação:',
            erro
        );


        next();
    }
}


app.use(
    autenticarOpcional
);


// ============================================================
// RATE LIMIT SIMPLES PARA LOGIN
//
// SEM INSTALAR PACOTE NOVO.
// EVITA MUITAS TENTATIVAS SEGUIDAS.
// ============================================================

const tentativasLogin =
    new Map();


function chaveLogin(
    req,
    email
) {

    return `${req.ip}|${normalizarEmail(email)}`;
}


function verificarLimiteLogin(
    req,
    email
) {

    const chave =
        chaveLogin(
            req,
            email
        );


    const agora =
        Date.now();


    const janela =
        15 * 60 * 1000;


    const maxTentativas =
        10;


    let registro =
        tentativasLogin.get(
            chave
        );


    if (
        !registro ||
        agora -
        registro.inicio >
        janela
    ) {

        registro = {
            inicio:
                agora,

            tentativas:
                0
        };
    }


    if (
        registro.tentativas >=
        maxTentativas
    ) {

        tentativasLogin.set(
            chave,
            registro
        );


        return false;
    }


    return true;
}


function registrarFalhaLogin(
    req,
    email
) {

    const chave =
        chaveLogin(
            req,
            email
        );


    const agora =
        Date.now();


    const janela =
        15 * 60 * 1000;


    let registro =
        tentativasLogin.get(
            chave
        );


    if (
        !registro ||
        agora -
        registro.inicio >
        janela
    ) {

        registro = {
            inicio:
                agora,

            tentativas:
                0
        };
    }


    registro.tentativas++;


    tentativasLogin.set(
        chave,
        registro
    );
}


function limparFalhasLogin(
    req,
    email
) {

    tentativasLogin.delete(
        chaveLogin(
            req,
            email
        )
    );
}


// ============================================================
// CADASTRAR USUÁRIO
// FUNÇÃO CENTRAL
// ============================================================

async function cadastrarUsuarioHandler(
    req,
    res
) {

    const d =
        req.body ||
        {};


    try {

        const tipo =
            textoSeguro(
                d.tipo
            )
            .toLowerCase();


        const nome =
            textoSeguro(
                d.nome
            );


        const email =
            normalizarEmail(
                d.email
            );


        const senha =
            String(
                d.senha ||
                ''
            );


        if (
            !tipo ||
            !nome ||
            !email ||
            !senha
        ) {

            return respostaErro(
                res,
                400,
                'Preencha tipo, nome, e-mail e senha.'
            );
        }


        if (
            ![
                'empresa',
                'prestador'
            ].includes(
                tipo
            )
        ) {

            return respostaErro(
                res,
                400,
                'Tipo de usuário inválido.'
            );
        }


        if (
            !emailValido(
                email
            )
        ) {

            return respostaErro(
                res,
                400,
                'Informe um e-mail válido.'
            );
        }


        if (
            senha.length < 6
        ) {

            return respostaErro(
                res,
                400,
                'A senha precisa ter pelo menos 6 caracteres.'
            );
        }


        const existe =
            await buscarUsuarioPorEmail(
                email
            );


        if (existe) {

            return respostaErro(
                res,
                409,
                'Este e-mail já está cadastrado.'
            );
        }


        const senhaProtegida =
            gerarHashSenha(
                senha
            );


        const resultado =
            await pool.query(
                `
                INSERT INTO usuarios (

                    tipo,
                    nome,
                    doc,
                    responsavel,
                    email,
                    senha,
                    whatsapp,
                    endereco,
                    rg_cnh,
                    profissao,
                    tipo_chave_pix,
                    pix,
                    banco,
                    conta,
                    experiencia,
                    descricao,
                    criado_em,
                    atualizado_em

                )

                VALUES (

                    $1,$2,$3,$4,
                    $5,$6,$7,$8,
                    $9,$10,$11,$12,
                    $13,$14,$15,$16,
                    CURRENT_TIMESTAMP,
                    CURRENT_TIMESTAMP

                )

                RETURNING *
                `,
                [
                    tipo,

                    nome,

                    d.doc ||
                    d.documento ||
                    '',

                    d.responsavel ||
                    '',

                    email,

                    senhaProtegida,

                    d.whatsapp ||
                    '',

                    d.endereco ||
                    '',

                    d.rgCnh ||
                    d.rg_cnh ||
                    '',

                    d.profissao ||
                    '',

                    d.tipoChavePix ||
                    d.tipo_chave_pix ||
                    '',

                    d.pix ||
                    '',

                    d.banco ||
                    '',

                    d.conta ||
                    '',

                    d.experiencia ||
                    '',

                    d.descricao ||
                    ''
                ]
            );


        const usuario =
            resultado.rows[0];


        if (
            tipo ===
            'prestador'
        ) {

            await pool.query(
                `
                INSERT INTO prestadores (
                    email
                )

                VALUES ($1)

                ON CONFLICT (
                    email
                )

                DO NOTHING
                `,
                [
                    email
                ]
            );
        }


        await registrarAuditoria(
            email,
            'CADASTRO_USUARIO',
            `Novo usuário tipo ${tipo} cadastrado.`
        );


        return respostaSucesso(
            res,
            {
                mensagem:
                    'Cadastro realizado com sucesso.',

                id:
                    usuario.id,

                usuario:
                    usuarioPublico(
                        usuario
                    )
            }
        );

    } catch (
        erro
    ) {

        console.error(
            'Erro cadastro:',
            erro
        );


        if (
            erro.code ===
            '23505'
        ) {

            return respostaErro(
                res,
                409,
                'Este e-mail já está cadastrado.'
            );
        }


        return respostaErro(
            res,
            500,
            'Erro ao criar cadastro.'
        );
    }
}


// ============================================================
// LOGIN
// FUNÇÃO CENTRAL
// ============================================================

async function loginHandler(
    req,
    res
) {

    const email =
        normalizarEmail(
            req.body?.email
        );


    const senha =
        String(
            req.body?.senha ||
            ''
        );


    try {

        if (
            !email ||
            !senha
        ) {

            return respostaErro(
                res,
                400,
                'Informe e-mail e senha.'
            );
        }


        if (
            !verificarLimiteLogin(
                req,
                email
            )
        ) {

            return respostaErro(
                res,
                429,
                'Muitas tentativas de login. Aguarde alguns minutos.'
            );
        }


        const usuario =
            await buscarUsuarioPorEmail(
                email
            );


        if (
            !usuario
        ) {

            registrarFalhaLogin(
                req,
                email
            );


            return respostaErro(
                res,
                401,
                'E-mail ou senha incorretos.'
            );
        }


        const senhaCorreta =
            compararSenha(
                senha,
                usuario.senha
            );


        if (
            !senhaCorreta
        ) {

            registrarFalhaLogin(
                req,
                email
            );


            return respostaErro(
                res,
                401,
                'E-mail ou senha incorretos.'
            );
        }


        // ====================================================
        // MIGRAÇÃO AUTOMÁTICA
        //
        // Se era usuário antigo com senha sem hash,
        // protege a senha agora.
        // ====================================================

        if (
            !senhaJaProtegida(
                usuario.senha
            )
        ) {

            try {

                const senhaNova =
                    gerarHashSenha(
                        senha
                    );


                await pool.query(
                    `
                    UPDATE usuarios

                    SET
                        senha = $1,
                        atualizado_em =
                            CURRENT_TIMESTAMP

                    WHERE id = $2
                    `,
                    [
                        senhaNova,
                        usuario.id
                    ]
                );


                console.log(
                    `🔐 Senha antiga migrada com segurança: ${email}`
                );

            } catch (
                erroMigracao
            ) {

                console.warn(
                    'Aviso: login funcionou, mas a senha antiga não pôde ser migrada:',
                    erroMigracao.message
                );
            }
        }


        limparFalhasLogin(
            req,
            email
        );


        // ====================================================
        // NOVA SESSÃO
        // ====================================================

        await limparSessoesExpiradas();


        const sessao =
            await criarSessaoUsuario(
                usuario
            );


        await registrarAuditoria(
            email,
            'LOGIN',
            'Login realizado com sucesso.'
        );


        return respostaSucesso(
            res,
            {
                mensagem:
                    'Login realizado com sucesso.',

                usuario:
                    usuarioPublico(
                        usuario
                    ),

                token:
                    sessao.token,

                expiraEm:
                    sessao.expiraEm
            }
        );

    } catch (
        erro
    ) {

        console.error(
            'Erro login:',
            erro
        );


        return respostaErro(
            res,
            500,
            'Erro ao realizar login.'
        );
    }
}


// ============================================================
// ROTAS DE LOGIN
//
// TODAS FUNCIONAM.
// ISSO EVITA NOVO "Cannot POST /login"
// ============================================================

app.post(
    '/api/auth/login',
    loginHandler
);


app.post(
    '/api/login',
    loginHandler
);


app.post(
    '/login',
    loginHandler
);


// ============================================================
// ROTAS DE CADASTRO
//
// TODAS FUNCIONAM.
// ============================================================

app.post(
    '/api/auth/registrar',
    cadastrarUsuarioHandler
);


app.post(
    '/api/cadastro',
    cadastrarUsuarioHandler
);


app.post(
    '/cadastro',
    cadastrarUsuarioHandler
);


// ============================================================
// VALIDAR SESSÃO
// ============================================================

app.get(
    '/api/auth/sessao',

    async (
        req,
        res
    ) => {

        try {

            const token =
                extrairBearerToken(
                    req
                );


            if (!token) {

                return respostaErro(
                    res,
                    401,
                    'Sessão não informada.'
                );
            }


            const sessao =
                await buscarSessaoPorToken(
                    token
                );


            if (!sessao) {

                return respostaErro(
                    res,
                    401,
                    'Sessão expirada ou inválida.'
                );
            }


            const usuario =
                await buscarUsuarioPorEmail(
                    sessao.usuario_email
                );


            if (!usuario) {

                return respostaErro(
                    res,
                    401,
                    'Usuário da sessão não encontrado.'
                );
            }


            return respostaSucesso(
                res,
                {
                    usuario:
                        usuarioPublico(
                            usuario
                        ),

                    expiraEm:
                        sessao.expira_em
                }
            );

        } catch (
            erro
        ) {

            console.error(
                erro
            );


            return respostaErro(
                res,
                500,
                'Erro ao validar sessão.'
            );
        }
    }
);


// ============================================================
// LOGOUT
// ============================================================

app.post(
    '/api/auth/logout',

    async (
        req,
        res
    ) => {

        try {

            const token =
                extrairBearerToken(
                    req
                );


            if (token) {

                const tokenHash =
                    gerarHashToken(
                        token
                    );


                await pool.query(
                    `
                    UPDATE sessoes_rs

                    SET
                        revogada = TRUE

                    WHERE
                        token_hash = $1
                    `,
                    [
                        tokenHash
                    ]
                );
            }


            return respostaSucesso(
                res,
                {
                    mensagem:
                        'Sessão encerrada.'
                }
            );

        } catch (
            erro
        ) {

            return respostaErro(
                res,
                500,
                'Erro ao encerrar sessão.'
            );
        }
    }
);


// ============================================================
// PERFIL DO USUÁRIO
// ============================================================

app.get(
    '/api/usuarios/:email',

    async (
        req,
        res
    ) => {

        try {

            const email =
                normalizarEmail(
                    req.params.email
                );


            const usuario =
                await buscarUsuarioPorEmail(
                    email
                );


            if (!usuario) {

                return respostaErro(
                    res,
                    404,
                    'Usuário não encontrado.'
                );
            }


            return respostaSucesso(
                res,
                {
                    usuario:
                        usuarioPublico(
                            usuario
                        )
                }
            );

        } catch (
            erro
        ) {

            console.error(
                erro
            );


            return respostaErro(
                res,
                500,
                'Erro ao carregar perfil.'
            );
        }
    }
);


// ============================================================
// INICIALIZAÇÃO DO BANCO
// O server.listen VIRÁ SOMENTE NA PARTE 4
// ============================================================

let bancoInicializado =
    false;


async function inicializarBancoRS() {

    if (
        bancoInicializado
    ) {

        return;
    }


    await testarBanco();

    await criarTabelas();

    await limparSessoesExpiradas();


    bancoInicializado =
        true;


    console.log(
        '✅ Banco RS Connect pronto.'
    );
}


// ============================================================
// FIM DA PARTE 1
// NÃO COLE server.listen AQUI.
// A PARTE 2 CONTINUA IMEDIATAMENTE ABAIXO.
// ============================================================
// ============================================================
// RS CONNECT
// SERVER.JS — PARTE 2 DE 4
//
// SERVIÇOS + EDIÇÃO + CANCELAMENTO
// TITULAR + 2 RESERVAS
// CONTRATO
// CONFIRMAÇÃO DA ESCALA
// SUBSTITUIÇÃO AUTOMÁTICA
// ============================================================


// ============================================================
// FUSO HORÁRIO DO SISTEMA
// ============================================================

process.env.TZ =
    process.env.TZ ||
    'America/Sao_Paulo';


// ============================================================
// RESERVAS — COMPATIBILIDADE
// ============================================================

function normalizarReserva(
    reserva
) {

    if (!reserva) {

        return null;
    }


    if (
        typeof reserva ===
        'string'
    ) {

        const email =
            normalizarEmail(
                reserva
            );


        if (!email) {

            return null;
        }


        return {
            email,
            nome:
                email,
            whatsapp:
                '',
            pix:
                '',
            entrou_em:
                null
        };
    }


    const email =
        normalizarEmail(
            reserva.email ||
            reserva.prestador_email ||
            reserva.prestadorEmail
        );


    if (!email) {

        return null;
    }


    return {

        ...reserva,

        email,

        nome:
            textoSeguro(
                reserva.nome ||
                reserva.prestador_nome ||
                reserva.prestadorNome ||
                email
            ),

        whatsapp:
            textoSeguro(
                reserva.whatsapp ||
                reserva.prestador_whatsapp
            ),

        pix:
            textoSeguro(
                reserva.pix ||
                reserva.prestador_pix
            ),

        entrou_em:
            reserva.entrou_em ||
            reserva.entrouEm ||
            null
    };
}


function obterReservasServico(
    servico
) {

    return parseReservas(
        servico?.reservas
    )
    .map(
        normalizarReserva
    )
    .filter(Boolean)
    .slice(
        0,
        2
    );
}


function reservaContemEmail(
    reservas,
    email
) {

    const procurado =
        normalizarEmail(
            email
        );


    return reservas.some(
        reserva =>
            normalizarEmail(
                reserva?.email
            )
            ===
            procurado
    );
}


// ============================================================
// SERVIÇO COMPLETO PARA O INDEX
//
// O INDEX novo usa reserva1_email / reserva2_email,
// enquanto o banco preserva o JSON "reservas".
// ============================================================

async function servicoParaIndex(
    servico
) {

    const normalizado =
        await normalizarServicoSaida(
            servico
        );


    const reservas =
        obterReservasServico(
            normalizado
        );


    const reserva1 =
        reservas[0] ||
        null;


    const reserva2 =
        reservas[1] ||
        null;


    return {

        ...normalizado,

        reservas,

        reserva1_email:
            reserva1?.email ||
            '',

        reserva1_nome:
            reserva1?.nome ||
            '',

        reserva1_whatsapp:
            reserva1?.whatsapp ||
            '',

        reserva2_email:
            reserva2?.email ||
            '',

        reserva2_nome:
            reserva2?.nome ||
            '',

        reserva2_whatsapp:
            reserva2?.whatsapp ||
            ''
    };
}


// ============================================================
// BUSCAR DADOS DE PRESTADOR
// ============================================================

async function buscarDadosPrestador(
    email
) {

    const usuario =
        await buscarUsuarioPorEmail(
            email
        );


    if (!usuario) {

        return null;
    }


    return {

        id:
            usuario.id,

        email:
            normalizarEmail(
                usuario.email
            ),

        nome:
            textoSeguro(
                usuario.nome ||
                usuario.email
            ),

        whatsapp:
            textoSeguro(
                usuario.whatsapp
            ),

        pix:
            textoSeguro(
                usuario.pix
            ),

        profissao:
            textoSeguro(
                usuario.profissao
            ),

        experiencia:
            textoSeguro(
                usuario.experiencia
            )
    };
}


// ============================================================
// REGISTRAR HISTÓRICO DE ESCALA
// ============================================================

async function registrarHistoricoEscala(
    {
        servicoId,
        trabalhadorEmail = '',
        tipo = '',
        origem = '',
        destino = '',
        motivo = ''
    }
) {

    try {

        await pool.query(
            `
            INSERT INTO historico_escalas (

                servico_id,
                trabalhador_email,
                tipo,
                origem,
                destino,
                motivo

            )

            VALUES (
                $1,$2,$3,$4,$5,$6
            )
            `,
            [
                Number(
                    servicoId
                ),

                normalizarEmail(
                    trabalhadorEmail
                ),

                textoSeguro(
                    tipo
                ),

                textoSeguro(
                    origem
                ),

                textoSeguro(
                    destino
                ),

                textoSeguro(
                    motivo
                )
            ]
        );

    } catch (
        erro
    ) {

        console.warn(
            'Aviso histórico de escala:',
            erro.message
        );
    }
}


// ============================================================
// VERIFICAR SE USUÁRIO JÁ PARTICIPA DA VAGA
// ============================================================

function prestadorJaEstaNaVaga(
    servico,
    email
) {

    const procurado =
        normalizarEmail(
            email
        );


    if (
        prestadorEhTitular(
            servico,
            procurado
        )
    ) {

        return true;
    }


    const reservas =
        obterReservasServico(
            servico
        );


    return reservaContemEmail(
        reservas,
        procurado
    );
}


// ============================================================
// PROMOVER PRIMEIRA RESERVA PARA TITULAR
//
// Ordem:
//
// Titular sai/não confirma
// → Reserva 1 vira Titular
// → Reserva 2 vira Reserva 1
// → Reserva 2 fica aberta
// ============================================================

async function promoverPrimeiraReserva(
    servico,
    motivo = 'SUBSTITUICAO'
) {

    if (!servico) {

        return {
            promoveu: false,
            motivo:
                'Serviço inválido.'
        };
    }


    const reservas =
        obterReservasServico(
            servico
        );


    const antigoTitular =
        normalizarEmail(
            servico.prestador_email
        );


    const novoTitular =
        reservas.shift();


    // ========================================================
    // NÃO EXISTE RESERVA
    // VAGA VOLTA A FICAR ABERTA
    // ========================================================

    if (!novoTitular) {

        await pool.query(
            `
            UPDATE servicos

            SET
                prestador_email = NULL,
                prestador_id = NULL,
                prestador_nome = NULL,
                prestador_pix = NULL,
                prestador_whatsapp = NULL,

                reservas = '[]'::jsonb,

                contrato_assinado = NULL,
                contrato_assinado_em = NULL,

                contrato_aceito = FALSE,
                contrato_aceito_em = NULL,

                presenca_confirmada = FALSE,
                presenca_hora = NULL,
                presenca_latitude = NULL,
                presenca_longitude = NULL,
                presenca_precisao = NULL,
                selfie_confirmacao = NULL,

                confirmacao_expirada = TRUE,

                confirmado_em = NULL,

                substituido_em =
                    CURRENT_TIMESTAMP,

                motivo_substituicao = $1,

                checkin_hora = NULL,
                checkin_foto = NULL,
                checkin_latitude = NULL,
                checkin_longitude = NULL,

                intervalo_inicio = NULL,
                intervalo_fim = NULL,
                intervalo_retorno = NULL,
                em_intervalo = FALSE,

                checkout_hora = NULL,
                checkout_foto = NULL,
                checkout_latitude = NULL,
                checkout_longitude = NULL,

                status =
                    'ativo',

                atualizado_em =
                    CURRENT_TIMESTAMP

            WHERE id = $2
            `,
            [
                motivo,
                servico.id
            ]
        );


        await registrarHistoricoEscala({
            servicoId:
                servico.id,

            trabalhadorEmail:
                antigoTitular,

            tipo:
                'TITULAR_REMOVIDO',

            origem:
                antigoTitular,

            destino:
                '',

            motivo
        });


        await registrarAuditoria(
            antigoTitular ||
            'sistema',

            'VAGA_REABERTA',

            `Serviço #${servico.id}: Titular removido e nenhuma Reserva disponível. Motivo: ${motivo}.`
        );


        emitirAtualizacao(
            servico.id,
            'substituicao'
        );


        return {
            promoveu: false,
            vagaAberta: true
        };
    }


    // ========================================================
    // BUSCAR ID DO NOVO TITULAR
    // ========================================================

    const usuarioNovo =
        await buscarUsuarioPorEmail(
            novoTitular.email
        );


    // ========================================================
    // PROMOVER
    // ========================================================

    await pool.query(
        `
        UPDATE servicos

        SET
            prestador_email = $1,

            prestador_id = $2,

            prestador_nome = $3,

            prestador_whatsapp = $4,

            prestador_pix = $5,

            reservas = $6::jsonb,

            contrato_assinado = NULL,

            contrato_assinado_em = NULL,

            contrato_aceito = FALSE,

            contrato_aceito_em = NULL,

            presenca_confirmada = FALSE,

            presenca_hora = NULL,

            presenca_latitude = NULL,

            presenca_longitude = NULL,

            presenca_precisao = NULL,

            selfie_confirmacao = NULL,

            confirmacao_expirada = FALSE,

            confirmado_em = NULL,

            substituido_em =
                CURRENT_TIMESTAMP,

            motivo_substituicao = $7,

            checkin_hora = NULL,

            checkin_foto = NULL,

            checkin_latitude = NULL,

            checkin_longitude = NULL,

            intervalo_inicio = NULL,

            intervalo_fim = NULL,

            intervalo_retorno = NULL,

            em_intervalo = FALSE,

            checkout_hora = NULL,

            checkout_foto = NULL,

            checkout_latitude = NULL,

            checkout_longitude = NULL,

            validado_empresa = FALSE,

            validado_em = NULL,

            pagamento_autorizado = FALSE,

            pagamento_autorizado_em = NULL,

            status =
                'aguardando_confirmacao',

            atualizado_em =
                CURRENT_TIMESTAMP

        WHERE id = $8
        `,
        [
            novoTitular.email,

            usuarioNovo?.id ||
            null,

            novoTitular.nome ||
            novoTitular.email,

            novoTitular.whatsapp ||
            '',

            novoTitular.pix ||
            '',

            JSON.stringify(
                reservas
            ),

            motivo,

            servico.id
        ]
    );


    await registrarHistoricoEscala({
        servicoId:
            servico.id,

        trabalhadorEmail:
            antigoTitular,

        tipo:
            'SUBSTITUICAO',

        origem:
            antigoTitular,

        destino:
            novoTitular.email,

        motivo
    });


    await registrarHistoricoEscala({
        servicoId:
            servico.id,

        trabalhadorEmail:
            novoTitular.email,

        tipo:
            'PROMOVIDO_TITULAR',

        origem:
            'RESERVA_1',

        destino:
            'TITULAR',

        motivo
    });


    await registrarAuditoria(
        novoTitular.email,

        'RESERVA_PROMOVIDA',

        `Serviço #${servico.id}: ${novoTitular.email} promovido para Titular. Motivo: ${motivo}.`
    );


    emitirAtualizacao(
        servico.id,
        'substituicao'
    );


    return {
        promoveu: true,

        antigoTitular,

        novoTitular:
            novoTitular.email
    };
}


// ============================================================
// DATA/HORA LIMITE DE CONFIRMAÇÃO
// ============================================================

function obterLimiteConfirmacao(
    servico
) {

    const data =
        textoSeguro(
            servico?.data
        );


    const prazo =
        textoSeguro(
            servico?.prazo_confirmacao
        );


    if (
        !data ||
        !prazo
    ) {

        return null;
    }


    const dataHora =
        new Date(
            `${data}T${prazo}:00`
        );


    if (
        Number.isNaN(
            dataHora.getTime()
        )
    ) {

        return null;
    }


    return dataHora;
}


// ============================================================
// VERIFICAR UM SERVIÇO EXPIRADO
// ============================================================

async function verificarConfirmacaoServico(
    servico
) {

    if (!servico) {

        return false;
    }


    if (
        !servico.prestador_email
    ) {

        return false;
    }


    if (
        servico.presenca_confirmada
    ) {

        return false;
    }


    if (
        servico.checkin_hora
    ) {

        return false;
    }


    const status =
        textoSeguro(
            servico.status
        )
        .toLowerCase();


    if (
        status.includes(
            'cancel'
        )
        ||
        status ===
        'pago'
        ||
        status.includes(
            'finaliz'
        )
    ) {

        return false;
    }


    const limite =
        obterLimiteConfirmacao(
            servico
        );


    // Sem prazo informado:
    // não cancela automaticamente.
    if (!limite) {

        return false;
    }


    if (
        Date.now() <
        limite.getTime()
    ) {

        return false;
    }


    // Evitar executar várias vezes
    // para o mesmo titular já marcado.

    if (
        servico.confirmacao_expirada
    ) {

        return false;
    }


    // Marca antes de promover,
    // reduzindo risco de corrida.

    const marcado =
        await pool.query(
            `
            UPDATE servicos

            SET
                confirmacao_expirada = TRUE,
                atualizado_em =
                    CURRENT_TIMESTAMP

            WHERE
                id = $1

            AND
                presenca_confirmada = FALSE

            AND
                COALESCE(
                    confirmacao_expirada,
                    FALSE
                ) = FALSE

            RETURNING id
            `,
            [
                servico.id
            ]
        );


    if (
        !marcado.rows.length
    ) {

        return false;
    }


    await registrarAuditoria(
        servico.prestador_email,

        'CONFIRMACAO_EXPIRADA',

        `Serviço #${servico.id}: Titular não confirmou dentro do prazo.`
    );


    await promoverPrimeiraReserva(
        servico,
        'NAO_CONFIRMOU_NO_PRAZO'
    );


    return true;
}


// ============================================================
// VERIFICAR TODAS AS CONFIRMAÇÕES
// FUNÇÃO SERÁ AGENDADA NA PARTE 4
// ============================================================

async function verificarConfirmacoesExpiradas() {

    try {

        const resultado =
            await pool.query(
                `
                SELECT *
                FROM servicos

                WHERE
                    prestador_email
                    IS NOT NULL

                AND
                    presenca_confirmada = FALSE

                AND
                    COALESCE(
                        confirmacao_expirada,
                        FALSE
                    ) = FALSE

                AND
                    prazo_confirmacao
                    IS NOT NULL

                AND
                    prazo_confirmacao <> ''

                AND
                    LOWER(
                        COALESCE(
                            status,
                            ''
                        )
                    )
                    NOT IN (
                        'cancelado',
                        'pago',
                        'finalizado'
                    )
                `
            );


        for (
            const servico
            of resultado.rows
        ) {

            try {

                await verificarConfirmacaoServico(
                    servico
                );

            } catch (
                erro
            ) {

                console.error(
                    `Erro ao verificar confirmação do serviço #${servico.id}:`,
                    erro.message
                );
            }
        }

    } catch (
        erro
    ) {

        console.error(
            'Erro na verificação automática de confirmações:',
            erro.message
        );
    }
}


// ============================================================
// LISTAR SERVIÇOS
// ============================================================

async function listarServicosHandler(
    req,
    res
) {

    try {

        // Antes de entregar a lista,
        // resolve confirmações vencidas.

        await verificarConfirmacoesExpiradas();


        const resultado =
            await pool.query(
                `
                SELECT *
                FROM servicos
                ORDER BY id DESC
                `
            );


        const servicos =
            [];


        for (
            const registro
            of resultado.rows
        ) {

            servicos.push(
                await servicoParaIndex(
                    registro
                )
            );
        }


        return res.json(
            servicos
        );

    } catch (
        erro
    ) {

        console.error(
            'Erro ao listar serviços:',
            erro
        );


        return respostaErro(
            res,
            500,
            'Erro ao buscar serviços.'
        );
    }
}


// ============================================================
// ROTAS DE LISTAGEM
// ============================================================

app.get(
    '/api/servicos',
    listarServicosHandler
);


app.get(
    '/servicos',
    listarServicosHandler
);


// ============================================================
// SERVIÇO INDIVIDUAL
// ============================================================

app.get(
    '/api/servicos/:id',

    async (
        req,
        res
    ) => {

        try {

            const id =
                Number(
                    req.params.id
                );


            const servico =
                await buscarServico(
                    id
                );


            if (!servico) {

                return respostaErro(
                    res,
                    404,
                    'Serviço não encontrado.'
                );
            }


            await verificarConfirmacaoServico(
                servico
            );


            const atualizado =
                await buscarServico(
                    id
                );


            return respostaSucesso(
                res,
                {
                    servico:
                        await servicoParaIndex(
                            atualizado
                        )
                }
            );

        } catch (
            erro
        ) {

            return respostaErro(
                res,
                500,
                'Erro ao carregar serviço.'
            );
        }
    }
);


// ============================================================
// PUBLICAR SERVIÇO
// FUNÇÃO CENTRAL
// ============================================================

async function criarServicoHandler(
    req,
    res
) {

    const s =
        req.body ||
        {};


    try {

        const empresaEmail =
            normalizarEmail(

                s.empresa_email ||

                s.empresaEmail ||

                req.sessaoRS
                    ?.usuario_email ||

                req.headers[
                    'x-user-email'
                ]
            );


        if (!empresaEmail) {

            return respostaErro(
                res,
                400,
                'Empresa não identificada.'
            );
        }


        const empresaUsuario =
            await buscarUsuarioPorEmail(
                empresaEmail
            );


        if (!empresaUsuario) {

            return respostaErro(
                res,
                404,
                'Cadastro da empresa não encontrado.'
            );
        }


        const tipo =
            textoSeguro(
                empresaUsuario.tipo
            )
            .toLowerCase();


        if (
            ![
                'empresa',
                'cliente',
                'contratante'
            ]
            .includes(
                tipo
            )
        ) {

            return respostaErro(
                res,
                403,
                'Somente empresas podem publicar serviços.'
            );
        }


        const titulo =
            textoSeguro(
                s.titulo
            );


        const categoria =
            textoSeguro(
                s.categoria ||
                s.funcao
            );


        if (
            !titulo ||
            !categoria
        ) {

            return respostaErro(
                res,
                400,
                'Informe título e função/categoria.'
            );
        }


        const valorUnitario =
            numeroRS(

                s.valor_diaria ??

                s.valor ??

                s.preco ??

                0
            );


        if (
            valorUnitario < 0
        ) {

            return respostaErro(
                res,
                400,
                'Valor do serviço inválido.'
            );
        }


        const recorrencia =
            textoSeguro(
                s.recorrencia ||
                'unico'
            );


        let valorTotal =
            valorUnitario;


        if (
            recorrencia ===
            'semanal'
        ) {

            valorTotal =
                valorUnitario *
                4;

        } else if (
            recorrencia ===
            'quinzenal'
        ) {

            valorTotal =
                valorUnitario *
                2;
        }


        // Por enquanto o valor líquido
        // permanece igual ao valor contratado.
        // Assim não descontamos taxa sem regra definida.

        const valorLiquido =
            valorUnitario;


        const data =
            textoSeguro(
                s.data
            );


        const horarioInicio =
            textoSeguro(

                s.horario_inicio ||

                s.horarioInicio ||

                s.horario
            );


        const dataHorario =
            textoSeguro(
                s.data_horario ||
                s.dataHorario
            )
            ||
            (
                data &&
                horarioInicio
                    ?
                    `${data}T${horarioInicio}`
                    :
                    ''
            );


        const empresaNome =
            textoSeguro(

                s.empresa_nome ||

                s.empresaNome ||

                empresaUsuario.nome ||

                empresaEmail
            );


        const resultado =
            await pool.query(
                `
                INSERT INTO servicos (

                    titulo,
                    categoria,
                    local,
                    cidade,
                    endereco,

                    valor,
                    valor_diaria,
                    valor_liquido,
                    valor_total,

                    data,
                    horario_inicio,
                    data_horario,
                    horario_fim,

                    forma_pgto,

                    descricao,
                    exigencias,
                    instrucoes_escala,

                    contrato_texto,
                    prazo_confirmacao,

                    empresa_email,
                    empresa_nome,
                    empresa_whatsapp,
                    empresa_descricao,

                    responsavel_servico,
                    whatsapp_responsavel,

                    recorrencia,

                    status,

                    criado_em,
                    atualizado_em

                )

                VALUES (

                    $1,$2,$3,$4,$5,

                    $6,$7,$8,$9,

                    $10,$11,$12,$13,

                    $14,

                    $15,$16,$17,

                    $18,$19,

                    $20,$21,$22,$23,

                    $24,$25,

                    $26,

                    'ativo',

                    CURRENT_TIMESTAMP,
                    CURRENT_TIMESTAMP
                )

                RETURNING *
                `,
                [
                    titulo,

                    categoria,

                    textoSeguro(
                        s.local ||
                        s.cidade
                    ),

                    textoSeguro(
                        s.cidade
                    ),

                    textoSeguro(
                        s.endereco
                    ),

                    String(
                        valorUnitario
                    ),

                    valorUnitario,

                    valorLiquido,

                    valorTotal,

                    data,

                    horarioInicio,

                    dataHorario,

                    textoSeguro(
                        s.horario_fim ||
                        s.horarioFim
                    ),

                    textoSeguro(
                        s.forma_pgto ||
                        s.formaPagamento ||
                        s.formaPgto ||
                        'Pix'
                    ),

                    textoSeguro(
                        s.descricao
                    ),

                    textoSeguro(
                        s.exigencias
                    ),

                    textoSeguro(
                        s.instrucoes_escala ||
                        s.instrucoesEscala
                    ),

                    textoSeguro(
                        s.contrato_texto ||
                        s.contratoTexto ||
                        s.contrato
                    ),

                    textoSeguro(
                        s.prazo_confirmacao ||
                        s.prazoConfirmacao
                    ),

                    empresaEmail,

                    empresaNome,

                    textoSeguro(
                        s.empresa_whatsapp ||
                        s.empresaWhatsapp ||
                        empresaUsuario.whatsapp
                    ),

                    textoSeguro(
                        s.empresa_descricao ||
                        s.empresaDescricao ||
                        empresaUsuario.descricao
                    ),

                    textoSeguro(
                        s.responsavel_servico ||
                        s.responsavelServico
                    ),

                    textoSeguro(
                        s.whatsapp_responsavel ||
                        s.whatsappResponsavel
                    ),

                    recorrencia
                ]
            );


        const servico =
            resultado.rows[0];


        await registrarAuditoria(
            empresaEmail,

            'SERVICO_CRIADO',

            `Serviço #${servico.id} criado: ${titulo}.`
        );


        emitirAtualizacao(
            servico.id,
            'novo_servico'
        );


        return respostaSucesso(
            res,
            {
                mensagem:
                    'Serviço publicado no Radar.',

                servico:
                    await servicoParaIndex(
                        servico
                    )
            }
        );

    } catch (
        erro
    ) {

        console.error(
            'Erro ao publicar serviço:',
            erro
        );


        return respostaErro(
            res,
            500,
            'Erro ao publicar serviço.'
        );
    }
}


// ============================================================
// PUBLICAR — ROTAS COMPATÍVEIS
// ============================================================

app.post(
    '/api/servicos',
    criarServicoHandler
);


app.post(
    '/servicos',
    criarServicoHandler
);


// ============================================================
// EDITAR SERVIÇO
// ============================================================

async function editarServicoHandler(
    req,
    res
) {

    try {

        const id =
            Number(
                req.params.id
            );


        if (
            !idValido(id)
        ) {

            return respostaErro(
                res,
                400,
                'ID inválido.'
            );
        }


        const servico =
            await buscarServico(
                id
            );


        if (!servico) {

            return respostaErro(
                res,
                404,
                'Serviço não encontrado.'
            );
        }


        const emailEmpresa =
            normalizarEmail(

                req.body
                    ?.empresa_email ||

                req.body
                    ?.empresaEmail ||

                req.sessaoRS
                    ?.usuario_email ||

                req.headers[
                    'x-user-email'
                ]
            );


        const permitido =
            await empresaEhResponsavel(
                servico,
                emailEmpresa
            );


        if (!permitido) {

            return respostaErro(
                res,
                403,
                'Somente a empresa responsável pode editar este serviço.'
            );
        }


        const titulo =
            textoSeguro(
                req.body?.titulo ||
                servico.titulo
            );


        const categoria =
            textoSeguro(
                req.body?.categoria ||
                servico.categoria
            );


        const descricao =
            req.body?.descricao !== undefined
                ?
                textoSeguro(
                    req.body.descricao
                )
                :
                servico.descricao;


        const local =
            req.body?.local !== undefined
                ?
                textoSeguro(
                    req.body.local
                )
                :
                servico.local;


        const endereco =
            req.body?.endereco !== undefined
                ?
                textoSeguro(
                    req.body.endereco
                )
                :
                servico.endereco;


        const novoValor =
            req.body?.valor !== undefined ||
            req.body?.valor_diaria !== undefined
                ?
                numeroRS(
                    req.body.valor_diaria ??
                    req.body.valor
                )
                :
                valorServicoCompat(
                    servico
                );


        if (
            novoValor < 0
        ) {

            return respostaErro(
                res,
                400,
                'Valor inválido.'
            );
        }


        const resultado =
            await pool.query(
                `
                UPDATE servicos

                SET
                    titulo = $1,
                    categoria = $2,
                    descricao = $3,
                    local = $4,
                    endereco = $5,

                    valor =
                        $6,

                    valor_diaria =
                        $7,

                    atualizado_em =
                        CURRENT_TIMESTAMP

                WHERE id = $8

                RETURNING *
                `,
                [
                    titulo,

                    categoria,

                    descricao,

                    local,

                    endereco,

                    String(
                        novoValor
                    ),

                    novoValor,

                    id
                ]
            );


        await registrarAuditoria(
            emailEmpresa,

            'SERVICO_EDITADO',

            `Serviço #${id} editado.`
        );


        emitirAtualizacao(
            id,
            'servico_editado'
        );


        return respostaSucesso(
            res,
            {
                mensagem:
                    'Serviço atualizado.',

                servico:
                    await servicoParaIndex(
                        resultado.rows[0]
                    )
            }
        );

    } catch (
        erro
    ) {

        console.error(
            'Erro edição:',
            erro
        );


        return respostaErro(
            res,
            500,
            'Erro ao editar serviço.'
        );
    }
}


app.put(
    '/api/servicos/:id',
    editarServicoHandler
);


app.put(
    '/servicos/:id',
    editarServicoHandler
);


// ============================================================
// CANCELAR SERVIÇO
//
// NÃO DELETE.
// O registro continua no histórico.
// ============================================================

async function cancelarServicoHandler(
    req,
    res
) {

    try {

        const id =
            Number(
                req.params.id
            );


        const servico =
            await buscarServico(
                id
            );


        if (!servico) {

            return respostaErro(
                res,
                404,
                'Serviço não encontrado.'
            );
        }


        const empresaEmail =
            normalizarEmail(

                req.body
                    ?.empresa_email ||

                req.body
                    ?.empresaEmail ||

                req.sessaoRS
                    ?.usuario_email ||

                req.headers[
                    'x-user-email'
                ]
            );


        const permitido =
            await empresaEhResponsavel(
                servico,
                empresaEmail
            );


        if (!permitido) {

            return respostaErro(
                res,
                403,
                'Somente a empresa responsável pode cancelar.'
            );
        }


        const status =
            textoSeguro(
                servico.status
            )
            .toLowerCase();


        if (
            status ===
            'pago'
        ) {

            return respostaErro(
                res,
                400,
                'Um serviço já pago não pode ser cancelado.'
            );
        }


        const motivo =
            textoSeguro(
                req.body?.motivo ||
                'Cancelado pela empresa'
            );


        await pool.query(
            `
            UPDATE servicos

            SET
                status =
                    'cancelado',

                motivo_cancelamento =
                    $1,

                cancelado_em =
                    CURRENT_TIMESTAMP,

                atualizado_em =
                    CURRENT_TIMESTAMP

            WHERE id = $2
            `,
            [
                motivo,
                id
            ]
        );


        await registrarAuditoria(
            empresaEmail,

            'SERVICO_CANCELADO',

            `Serviço #${id}: ${motivo}.`
        );


        emitirAtualizacao(
            id,
            'servico_cancelado'
        );


        return respostaSucesso(
            res,
            {
                mensagem:
                    'Serviço cancelado e mantido no histórico.'
            }
        );

    } catch (
        erro
    ) {

        console.error(
            erro
        );


        return respostaErro(
            res,
            500,
            'Erro ao cancelar serviço.'
        );
    }
}


app.patch(
    '/api/servicos/:id/cancelar',
    cancelarServicoHandler
);


app.patch(
    '/servicos/:id/cancelar',
    cancelarServicoHandler
);


// ============================================================
// ACEITAR VAGA
//
// 1º trabalhador = TITULAR
// 2º = RESERVA 1
// 3º = RESERVA 2
// ============================================================

async function aceitarVagaHandler(
    req,
    res
) {

    const client =
        await pool.connect();


    try {

        await client.query(
            'BEGIN'
        );


        const id =
            Number(
                req.params.id
            );


        if (
            !idValido(id)
        ) {

            await client.query(
                'ROLLBACK'
            );


            return respostaErro(
                res,
                400,
                'Serviço inválido.'
            );
        }


        // FOR UPDATE impede duas pessoas
        // de pegarem a mesma vaga Titular
        // exatamente ao mesmo tempo.

        const resultado =
            await client.query(
                `
                SELECT *
                FROM servicos

                WHERE id = $1

                FOR UPDATE
                `,
                [
                    id
                ]
            );


        const servico =
            resultado.rows[0];


        if (!servico) {

            await client.query(
                'ROLLBACK'
            );


            return respostaErro(
                res,
                404,
                'Serviço não encontrado.'
            );
        }


        const status =
            textoSeguro(
                servico.status
            )
            .toLowerCase();


        if (
            status.includes(
                'cancel'
            )
            ||
            status ===
            'pago'
        ) {

            await client.query(
                'ROLLBACK'
            );


            return respostaErro(
                res,
                400,
                'Esta vaga não está mais disponível.'
            );
        }


        const email =
            normalizarEmail(

                req.body
                    ?.prestador_email ||

                req.body
                    ?.prestadorEmail ||

                req.body
                    ?.email ||

                req.sessaoRS
                    ?.usuario_email ||

                req.headers[
                    'x-user-email'
                ]
            );


        if (!email) {

            await client.query(
                'ROLLBACK'
            );


            return respostaErro(
                res,
                400,
                'Prestador não identificado.'
            );
        }


        const usuario =
            await buscarUsuarioPorEmail(
                email
            );


        if (!usuario) {

            await client.query(
                'ROLLBACK'
            );


            return respostaErro(
                res,
                404,
                'Cadastro do prestador não encontrado.'
            );
        }


        const tipo =
            textoSeguro(
                usuario.tipo
            )
            .toLowerCase();


        if (
            tipo !==
            'prestador'
        ) {

            await client.query(
                'ROLLBACK'
            );


            return respostaErro(
                res,
                403,
                'Somente prestadores podem entrar em vagas.'
            );
        }


        const reservas =
            obterReservasServico(
                servico
            );


        if (
            prestadorEhTitular(
                servico,
                email
            )
            ||
            reservaContemEmail(
                reservas,
                email
            )
        ) {

            await client.query(
                'ROLLBACK'
            );


            return respostaErro(
                res,
                409,
                'Você já está vinculado a esta vaga.'
            );
        }


        // ====================================================
        // VAGA TITULAR LIVRE
        // ====================================================

        if (
            !normalizarEmail(
                servico.prestador_email
            )
        ) {

            await client.query(
                `
                UPDATE servicos

                SET
                    prestador_email = $1,

                    prestador_id = $2,

                    prestador_nome = $3,

                    prestador_pix = $4,

                    prestador_whatsapp = $5,

                    contrato_aceito = $6,

                    contrato_aceito_em =
                        CASE
                            WHEN $6 = TRUE
                            THEN CURRENT_TIMESTAMP
                            ELSE NULL
                        END,

                    confirmacao_expirada =
                        FALSE,

                    presenca_confirmada =
                        FALSE,

                    status =
                        'aguardando_confirmacao',

                    atualizado_em =
                        CURRENT_TIMESTAMP

                WHERE id = $7
                `,
                [
                    email,

                    usuario.id,

                    textoSeguro(
                        req.body
                            ?.prestador_nome ||
                        req.body
                            ?.prestadorNome ||
                        req.body
                            ?.nome ||
                        usuario.nome ||
                        email
                    ),

                    textoSeguro(
                        req.body
                            ?.prestador_pix ||
                        req.body
                            ?.prestadorPix ||
                        usuario.pix
                    ),

                    textoSeguro(
                        req.body
                            ?.prestador_whatsapp ||
                        req.body
                            ?.prestadorWhatsapp ||
                        usuario.whatsapp
                    ),

                    Boolean(
                        req.body
                            ?.contrato_aceito ??
                        req.body
                            ?.contratoAceito ??
                        true
                    ),

                    id
                ]
            );


            await client.query(
                'COMMIT'
            );


            await registrarHistoricoEscala({
                servicoId:
                    id,

                trabalhadorEmail:
                    email,

                tipo:
                    'ENTROU_TITULAR',

                origem:
                    'RADAR',

                destino:
                    'TITULAR',

                motivo:
                    'PRIMEIRO_ACEITE'
            });


            await registrarAuditoria(
                email,

                'VAGA_ACEITA_TITULAR',

                `Serviço #${id}: prestador assumiu como Titular.`
            );


            emitirAtualizacao(
                id,
                'titular'
            );


            return respostaSucesso(
                res,
                {
                    mensagem:
                        'Você assumiu a vaga como Titular.',

                    posicao:
                        'Titular'
                }
            );
        }


        // ====================================================
        // TITULAR JÁ EXISTE
        // ENTRA COMO RESERVA
        // ====================================================

        if (
            reservas.length >=
            2
        ) {

            await client.query(
                'ROLLBACK'
            );


            return respostaErro(
                res,
                409,
                'Titular e as duas Reservas já estão preenchidos.'
            );
        }


        const novaReserva = {

            email,

            nome:
                textoSeguro(
                    req.body
                        ?.prestador_nome ||
                    req.body
                        ?.prestadorNome ||
                    req.body
                        ?.nome ||
                    usuario.nome ||
                    email
                ),

            whatsapp:
                textoSeguro(
                    req.body
                        ?.prestador_whatsapp ||
                    req.body
                        ?.prestadorWhatsapp ||
                    usuario.whatsapp
                ),

            pix:
                textoSeguro(
                    req.body
                        ?.prestador_pix ||
                    req.body
                        ?.prestadorPix ||
                    usuario.pix
                ),

            entrou_em:
                dataHoraAtualISO()
        };


        reservas.push(
            novaReserva
        );


        await client.query(
            `
            UPDATE servicos

            SET
                reservas =
                    $1::jsonb,

                atualizado_em =
                    CURRENT_TIMESTAMP

            WHERE id = $2
            `,
            [
                JSON.stringify(
                    reservas
                ),

                id
            ]
        );


        await client.query(
            'COMMIT'
        );


        const posicao =
            reservas.length === 1
                ?
                'Reserva 1'
                :
                'Reserva 2';


        await registrarHistoricoEscala({
            servicoId:
                id,

            trabalhadorEmail:
                email,

            tipo:
                'ENTROU_RESERVA',

            origem:
                'RADAR',

            destino:
                posicao,

            motivo:
                'VAGA_TITULAR_PREENCHIDA'
        });


        await registrarAuditoria(
            email,

            'ENTROU_RESERVA',

            `Serviço #${id}: entrou como ${posicao}.`
        );


        emitirAtualizacao(
            id,
            'reserva'
        );


        return respostaSucesso(
            res,
            {
                mensagem:
                    `Você entrou como ${posicao}.`,

                posicao
            }
        );

    } catch (
        erro
    ) {

        try {

            await client.query(
                'ROLLBACK'
            );

        } catch {}


        console.error(
            'Erro ao aceitar vaga:',
            erro
        );


        return respostaErro(
            res,
            500,
            'Erro ao entrar na vaga.'
        );

    } finally {

        client.release();
    }
}


// ============================================================
// ROTAS ACEITAR
// ============================================================

app.post(
    '/api/servicos/:id/aceitar',
    aceitarVagaHandler
);


app.post(
    '/servicos/:id/aceitar',
    aceitarVagaHandler
);


// ============================================================
// ROTA /fila
// INDEX/VERSÕES ANTIGAS PODEM CHAMAR ESSA ROTA
// ============================================================

app.post(
    '/api/servicos/:id/fila',
    aceitarVagaHandler
);


// ============================================================
// SAIR DA VAGA
// ============================================================

app.post(
    '/api/servicos/:id/sair-vaga',

    async (
        req,
        res
    ) => {

        try {

            const id =
                Number(
                    req.params.id
                );


            const servico =
                await buscarServico(
                    id
                );


            if (!servico) {

                return respostaErro(
                    res,
                    404,
                    'Serviço não encontrado.'
                );
            }


            const email =
                normalizarEmail(

                    req.body
                        ?.prestadorEmail ||

                    req.body
                        ?.prestador_email ||

                    req.body
                        ?.email ||

                    req.sessaoRS
                        ?.usuario_email ||

                    req.headers[
                        'x-user-email'
                    ]
                );


            if (!email) {

                return respostaErro(
                    res,
                    400,
                    'Prestador não identificado.'
                );
            }


            // =================================================
            // TITULAR
            // =================================================

            if (
                prestadorEhTitular(
                    servico,
                    email
                )
            ) {

                if (
                    servico.checkin_hora &&
                    !servico.checkout_hora
                ) {

                    return respostaErro(
                        res,
                        400,
                        'Não é possível desistir durante uma jornada já iniciada.'
                    );
                }


                await promoverPrimeiraReserva(
                    servico,
                    'DESISTENCIA_TITULAR'
                );


                return respostaSucesso(
                    res,
                    {
                        mensagem:
                            'Você saiu da vaga. A Reserva foi acionada quando disponível.'
                    }
                );
            }


            // =================================================
            // RESERVA
            // =================================================

            const reservas =
                obterReservasServico(
                    servico
                );


            const novasReservas =
                reservas.filter(
                    reserva =>
                        normalizarEmail(
                            reserva.email
                        )
                        !==
                        email
                );


            if (
                novasReservas.length ===
                reservas.length
            ) {

                return respostaErro(
                    res,
                    404,
                    'Você não está vinculado a esta vaga.'
                );
            }


            await pool.query(
                `
                UPDATE servicos

                SET
                    reservas =
                        $1::jsonb,

                    atualizado_em =
                        CURRENT_TIMESTAMP

                WHERE id = $2
                `,
                [
                    JSON.stringify(
                        novasReservas
                    ),

                    id
                ]
            );


            await registrarHistoricoEscala({
                servicoId:
                    id,

                trabalhadorEmail:
                    email,

                tipo:
                    'SAIU_RESERVA',

                origem:
                    'RESERVA',

                destino:
                    '',

                motivo:
                    'DESISTENCIA'
            });


            await registrarAuditoria(
                email,

                'SAIU_RESERVA',

                `Serviço #${id}: prestador saiu da Reserva.`
            );


            emitirAtualizacao(
                id,
                'reserva'
            );


            return respostaSucesso(
                res,
                {
                    mensagem:
                        'Você saiu da Reserva.'
                }
            );

        } catch (
            erro
        ) {

            console.error(
                erro
            );


            return respostaErro(
                res,
                500,
                'Erro ao sair da vaga.'
            );
        }
    }
);


// ============================================================
// CONFIRMAR ESCALA SEM SELFIE
//
// Essa rota existe para compatibilidade.
// A confirmação com foto + GPS virá na Parte 3.
//
// Quando o INDEX usar a câmera,
// será /confirmar-presenca.
// ============================================================

app.post(
    '/api/servicos/:id/confirmar-escala',

    async (
        req,
        res
    ) => {

        try {

            const id =
                Number(
                    req.params.id
                );


            const servico =
                await buscarServico(
                    id
                );


            if (!servico) {

                return respostaErro(
                    res,
                    404,
                    'Serviço não encontrado.'
                );
            }


            const email =
                normalizarEmail(

                    req.body
                        ?.prestadorEmail ||

                    req.body
                        ?.prestador_email ||

                    req.sessaoRS
                        ?.usuario_email ||

                    req.headers[
                        'x-user-email'
                    ]
                );


            if (
                !prestadorEhTitular(
                    servico,
                    email
                )
            ) {

                return respostaErro(
                    res,
                    403,
                    'Somente o Titular pode confirmar a escala.'
                );
            }


            const limite =
                obterLimiteConfirmacao(
                    servico
                );


            if (
                limite &&
                Date.now() >
                limite.getTime()
            ) {

                return respostaErro(
                    res,
                    409,
                    'O prazo de confirmação já encerrou.'
                );
            }


            await pool.query(
                `
                UPDATE servicos

                SET
                    presenca_confirmada =
                        TRUE,

                    presenca_hora =
                        COALESCE(
                            presenca_hora,
                            $1
                        ),

                    confirmado_em =
                        CURRENT_TIMESTAMP,

                    confirmacao_expirada =
                        FALSE,

                    status =
                        'escala_confirmada',

                    atualizado_em =
                        CURRENT_TIMESTAMP

                WHERE id = $2
                `,
                [
                    horaAtualRS(),
                    id
                ]
            );


            await registrarHistoricoEscala({
                servicoId:
                    id,

                trabalhadorEmail:
                    email,

                tipo:
                    'ESCALA_CONFIRMADA',

                origem:
                    'AGUARDANDO_CONFIRMACAO',

                destino:
                    'ESCALA_GARANTIDA',

                motivo:
                    'CONFIRMACAO_TITULAR'
            });


            emitirAtualizacao(
                id,
                'confirmacao'
            );


            return respostaSucesso(
                res,
                {
                    mensagem:
                        'Escala confirmada com sucesso.'
                }
            );

        } catch (
            erro
        ) {

            console.error(
                erro
            );


            return respostaErro(
                res,
                500,
                'Erro ao confirmar escala.'
            );
        }
    }
);


// ============================================================
// CONTRATO ASSINADO
// PDF ATÉ 10 MB
// ============================================================

app.post(
    '/api/servicos/:id/contrato-assinado',

    upload.single(
        'arquivo'
    ),

    async (
        req,
        res
    ) => {

        try {

            const id =
                Number(
                    req.params.id
                );


            const servico =
                await buscarServico(
                    id
                );


            if (!servico) {

                return respostaErro(
                    res,
                    404,
                    'Serviço não encontrado.'
                );
            }


            const email =
                normalizarEmail(

                    req.body
                        ?.prestadorEmail ||

                    req.body
                        ?.prestador_email ||

                    req.sessaoRS
                        ?.usuario_email ||

                    req.headers[
                        'x-user-email'
                    ]
                );


            if (
                !prestadorEhTitular(
                    servico,
                    email
                )
            ) {

                return respostaErro(
                    res,
                    403,
                    'Somente o Titular pode enviar o contrato.'
                );
            }


            if (
                !req.file
            ) {

                return respostaErro(
                    res,
                    400,
                    'Selecione um arquivo PDF.'
                );
            }


            const nomeOriginal =
                textoSeguro(
                    req.file.originalname
                );


            const mime =
                textoSeguro(
                    req.file.mimetype
                )
                .toLowerCase();


            const ehPdf =
                mime ===
                'application/pdf'
                ||
                nomeOriginal
                    .toLowerCase()
                    .endsWith(
                        '.pdf'
                    );


            if (!ehPdf) {

                return respostaErro(
                    res,
                    400,
                    'O contrato precisa estar em PDF.'
                );
            }


            const arquivoBase64 =
                `data:application/pdf;base64,${
                    req.file.buffer
                        .toString(
                            'base64'
                        )
                }`;


            const empresa =
                await resolverEmpresaDoServico(
                    servico
                );


            const client =
                await pool.connect();


            try {

                await client.query(
                    'BEGIN'
                );


                await client.query(
                    `
                    UPDATE servicos

                    SET
                        contrato_assinado =
                            $1,

                        contrato_assinado_em =
                            CURRENT_TIMESTAMP,

                        contrato_aceito =
                            TRUE,

                        contrato_aceito_em =
                            COALESCE(
                                contrato_aceito_em,
                                CURRENT_TIMESTAMP
                            ),

                        atualizado_em =
                            CURRENT_TIMESTAMP

                    WHERE id = $2
                    `,
                    [
                        arquivoBase64,
                        id
                    ]
                );


                await client.query(
                    `
                    INSERT INTO documentos_rs (

                        servico_id,
                        empresa_email,
                        prestador_email,
                        categoria,
                        nome,
                        arquivo

                    )

                    VALUES (
                        $1,$2,$3,
                        'CONTRATO',
                        $4,$5
                    )
                    `,
                    [
                        id,

                        empresa.email,

                        email,

                        nomeOriginal ||
                        `contrato-servico-${id}.pdf`,

                        arquivoBase64
                    ]
                );


                await client.query(
                    'COMMIT'
                );

            } catch (
                erroTransacao
            ) {

                await client.query(
                    'ROLLBACK'
                );


                throw erroTransacao;

            } finally {

                client.release();
            }


            await registrarAuditoria(
                email,

                'CONTRATO_ASSINADO',

                `Contrato do serviço #${id} enviado.`
            );


            emitirAtualizacao(
                id,
                'contrato'
            );


            return respostaSucesso(
                res,
                {
                    mensagem:
                        'Contrato assinado arquivado com sucesso.'
                }
            );

        } catch (
            erro
        ) {

            console.error(
                'Erro contrato:',
                erro
            );


            return respostaErro(
                res,
                500,
                'Erro ao arquivar contrato.'
            );
        }
    }
);


// ============================================================
// HISTÓRICO DE ESCALA DE UM SERVIÇO
// ============================================================

app.get(
    '/api/servicos/:id/historico-escala',

    async (
        req,
        res
    ) => {

        try {

            const id =
                Number(
                    req.params.id
                );


            const resultado =
                await pool.query(
                    `
                    SELECT *
                    FROM historico_escalas

                    WHERE
                        servico_id = $1

                    ORDER BY
                        criado_em ASC,
                        id ASC
                    `,
                    [
                        id
                    ]
                );


            return respostaSucesso(
                res,
                {
                    historico:
                        resultado.rows
                }
            );

        } catch (
            erro
        ) {

            return respostaErro(
                res,
                500,
                'Erro ao buscar histórico da escala.'
            );
        }
    }
);


// ============================================================
// FORÇAR SUBSTITUIÇÃO
// SOMENTE EMPRESA RESPONSÁVEL
// ============================================================

app.post(
    '/api/servicos/:id/substituir-titular',

    async (
        req,
        res
    ) => {

        try {

            const id =
                Number(
                    req.params.id
                );


            const servico =
                await buscarServico(
                    id
                );


            if (!servico) {

                return respostaErro(
                    res,
                    404,
                    'Serviço não encontrado.'
                );
            }


            const empresaEmail =
                normalizarEmail(

                    req.body
                        ?.empresaEmail ||

                    req.body
                        ?.empresa_email ||

                    req.sessaoRS
                        ?.usuario_email ||

                    req.headers[
                        'x-user-email'
                    ]
                );


            const permitido =
                await empresaEhResponsavel(
                    servico,
                    empresaEmail
                );


            if (!permitido) {

                return respostaErro(
                    res,
                    403,
                    'Empresa sem permissão.'
                );
            }


            if (
                servico.checkin_hora &&
                !servico.checkout_hora
            ) {

                return respostaErro(
                    res,
                    409,
                    'Não é possível substituir o Titular durante uma jornada ativa.'
                );
            }


            const motivo =
                textoSeguro(
                    req.body?.motivo ||
                    'SUBSTITUICAO_EMPRESA'
                );


            const resultado =
                await promoverPrimeiraReserva(
                    servico,
                    motivo
                );


            return respostaSucesso(
                res,
                {
                    mensagem:
                        resultado.promoveu
                            ?
                            'Reserva promovida para Titular.'
                            :
                            'Titular removido. A vaga ficou disponível.',

                    resultado
                }
            );

        } catch (
            erro
        ) {

            console.error(
                erro
            );


            return respostaErro(
                res,
                500,
                'Erro ao substituir Titular.'
            );
        }
    }
);


// ============================================================
// FIM DA PARTE 2
//
// PARTE 3 CONTINUA IMEDIATAMENTE ABAIXO COM:
//
// • confirmação com selfie + GPS
// • check-in
// • intervalo
// • voltar do intervalo
// • check-out
// • validação da empresa
// • pagamento
// • comprovante
// • Nota Fiscal
// • financeiro
// • Arquivo Digital
//
// NÃO COLE server.listen AQUI.
// ============================================================
// ============================================================
// RS CONNECT
// SERVER.JS — PARTE 3 DE 4
//
// PRESENÇA + GPS + SELFIE
// CHECK-IN
// INTERVALO
// VOLTAR DO INTERVALO
// CHECK-OUT
// VALIDAÇÃO
// PAGAMENTO
// COMPROVANTE
// NOTA FISCAL
// FINANCEIRO
// ARQUIVO DIGITAL
// ============================================================


// ============================================================
// VALIDAR LATITUDE / LONGITUDE
// ============================================================

function coordenadaValida(
    latitude,
    longitude
) {

    const lat =
        Number(
            latitude
        );


    const lng =
        Number(
            longitude
        );


    if (
        !Number.isFinite(lat) ||
        !Number.isFinite(lng)
    ) {

        return false;
    }


    if (
        lat < -90 ||
        lat > 90
    ) {

        return false;
    }


    if (
        lng < -180 ||
        lng > 180
    ) {

        return false;
    }


    return true;
}


// ============================================================
// VALIDAR FOTO BASE64
// ============================================================

function fotoBase64Valida(
    foto
) {

    if (
        typeof foto !==
        'string'
    ) {

        return false;
    }


    if (
        !foto.startsWith(
            'data:image/'
        )
    ) {

        return false;
    }


    if (
        !foto.includes(
            ';base64,'
        )
    ) {

        return false;
    }


    return true;
}


// ============================================================
// CONFIRMAR PRESENÇA COM SELFIE + GPS
// ============================================================

app.post(
    '/api/servicos/:id/confirmar-presenca',

    async (
        req,
        res
    ) => {

        try {

            const id =
                Number(
                    req.params.id
                );


            if (
                !idValido(id)
            ) {

                return respostaErro(
                    res,
                    400,
                    'Serviço inválido.'
                );
            }


            const servico =
                await buscarServico(
                    id
                );


            if (!servico) {

                return respostaErro(
                    res,
                    404,
                    'Serviço não encontrado.'
                );
            }


            const prestadorEmail =
                normalizarEmail(

                    req.body
                        ?.prestadorEmail ||

                    req.body
                        ?.prestador_email ||

                    req.sessaoRS
                        ?.usuario_email ||

                    req.headers[
                        'x-user-email'
                    ]
                );


            if (
                !prestadorEhTitular(
                    servico,
                    prestadorEmail
                )
            ) {

                return respostaErro(
                    res,
                    403,
                    'Somente o Titular pode confirmar presença.'
                );
            }


            if (
                servico.checkout_hora
            ) {

                return respostaErro(
                    res,
                    409,
                    'Este serviço já possui saída registrada.'
                );
            }


            if (
                servico.presenca_confirmada
            ) {

                return respostaSucesso(
                    res,
                    {
                        mensagem:
                            'A presença já estava confirmada.',

                        hora:
                            servico.presenca_hora
                    }
                );
            }


            const limite =
                obterLimiteConfirmacao(
                    servico
                );


            if (
                limite &&
                Date.now() >
                limite.getTime()
            ) {

                await verificarConfirmacaoServico(
                    servico
                );


                return respostaErro(
                    res,
                    409,
                    'O prazo de confirmação encerrou. A escala foi atualizada.'
                );
            }


            const foto =
                req.body?.foto ||
                req.body?.selfie ||
                '';


            if (
                !fotoBase64Valida(
                    foto
                )
            ) {

                return respostaErro(
                    res,
                    400,
                    'A selfie ao vivo é obrigatória.'
                );
            }


            const latitude =
                req.body?.latitude;


            const longitude =
                req.body?.longitude;


            if (
                !coordenadaValida(
                    latitude,
                    longitude
                )
            ) {

                return respostaErro(
                    res,
                    400,
                    'GPS inválido ou não informado.'
                );
            }


            const precisao =
                numeroRS(
                    req.body?.precisao
                );


            const hora =
                horaAtualRS();


            const atualizado =
                await pool.query(
                    `
                    UPDATE servicos

                    SET
                        presenca_confirmada =
                            TRUE,

                        presenca_hora =
                            $1,

                        presenca_latitude =
                            $2,

                        presenca_longitude =
                            $3,

                        presenca_precisao =
                            $4,

                        selfie_confirmacao =
                            $5,

                        confirmado_em =
                            CURRENT_TIMESTAMP,

                        confirmacao_expirada =
                            FALSE,

                        status =
                            'escala_confirmada',

                        atualizado_em =
                            CURRENT_TIMESTAMP

                    WHERE
                        id = $6

                    AND
                        presenca_confirmada =
                        FALSE

                    RETURNING id
                    `,
                    [
                        hora,

                        String(
                            latitude
                        ),

                        String(
                            longitude
                        ),

                        String(
                            precisao ||
                            ''
                        ),

                        foto,

                        id
                    ]
                );


            if (
                !atualizado.rows.length
            ) {

                return respostaSucesso(
                    res,
                    {
                        mensagem:
                            'A presença já foi confirmada.'
                    }
                );
            }


            await registrarHistoricoEscala({
                servicoId:
                    id,

                trabalhadorEmail:
                    prestadorEmail,

                tipo:
                    'PRESENCA_CONFIRMADA',

                origem:
                    'AGUARDANDO_CONFIRMACAO',

                destino:
                    'ESCALA_GARANTIDA',

                motivo:
                    'SELFIE_GPS'
            });


            await registrarAuditoria(
                prestadorEmail,

                'PRESENCA_CONFIRMADA',

                `Serviço #${id}: presença confirmada com selfie e GPS.`
            );


            emitirAtualizacao(
                id,
                'presenca'
            );


            io.emit(
                'jornada_atualizada',
                {
                    servicoId:
                        id,

                    etapa:
                        'presenca',

                    atualizadoEm:
                        dataHoraAtualISO()
                }
            );


            return respostaSucesso(
                res,
                {
                    mensagem:
                        'Presença confirmada. Escala garantida.',

                    hora
                }
            );

        } catch (
            erro
        ) {

            console.error(
                'Erro presença:',
                erro
            );


            return respostaErro(
                res,
                500,
                'Erro ao confirmar presença.'
            );
        }
    }
);


// ============================================================
// CHECK-IN
// ============================================================

app.post(
    '/api/servicos/:id/checkin',

    async (
        req,
        res
    ) => {

        try {

            const id =
                Number(
                    req.params.id
                );


            if (
                !idValido(id)
            ) {

                return respostaErro(
                    res,
                    400,
                    'Serviço inválido.'
                );
            }


            const servico =
                await buscarServico(
                    id
                );


            if (!servico) {

                return respostaErro(
                    res,
                    404,
                    'Serviço não encontrado.'
                );
            }


            const email =
                normalizarEmail(

                    req.body
                        ?.prestadorEmail ||

                    req.body
                        ?.prestador_email ||

                    req.sessaoRS
                        ?.usuario_email ||

                    req.headers[
                        'x-user-email'
                    ]
                );


            if (
                !prestadorEhTitular(
                    servico,
                    email
                )
            ) {

                return respostaErro(
                    res,
                    403,
                    'Somente o Titular pode registrar entrada.'
                );
            }


            if (
                !servico.presenca_confirmada
            ) {

                return respostaErro(
                    res,
                    409,
                    'Confirme sua presença antes do check-in.'
                );
            }


            if (
                servico.checkin_hora
            ) {

                return respostaSucesso(
                    res,
                    {
                        mensagem:
                            'A entrada já estava registrada.',

                        hora:
                            servico.checkin_hora
                    }
                );
            }


            if (
                servico.checkout_hora
            ) {

                return respostaErro(
                    res,
                    409,
                    'O serviço já foi finalizado.'
                );
            }


            const foto =
                req.body?.foto ||
                req.body?.selfie ||
                '';


            if (
                !fotoBase64Valida(
                    foto
                )
            ) {

                return respostaErro(
                    res,
                    400,
                    'A foto do check-in é obrigatória.'
                );
            }


            const latitude =
                req.body?.latitude;


            const longitude =
                req.body?.longitude;


            if (
                !coordenadaValida(
                    latitude,
                    longitude
                )
            ) {

                return respostaErro(
                    res,
                    400,
                    'GPS inválido ou não informado.'
                );
            }


            const hora =
                horaAtualRS();


            const resultado =
                await pool.query(
                    `
                    UPDATE servicos

                    SET
                        checkin_hora =
                            $1,

                        checkin_foto =
                            $2,

                        checkin_latitude =
                            $3,

                        checkin_longitude =
                            $4,

                        status_checkin =
                            'realizado',

                        status =
                            'em_servico',

                        atualizado_em =
                            CURRENT_TIMESTAMP

                    WHERE
                        id = $5

                    AND
                        checkin_hora
                        IS NULL

                    RETURNING id
                    `,
                    [
                        hora,

                        foto,

                        String(
                            latitude
                        ),

                        String(
                            longitude
                        ),

                        id
                    ]
                );


            if (
                !resultado.rows.length
            ) {

                const atual =
                    await buscarServico(
                        id
                    );


                return respostaSucesso(
                    res,
                    {
                        mensagem:
                            'A entrada já estava registrada.',

                        hora:
                            atual?.checkin_hora ||
                            ''
                    }
                );
            }


            await registrarAuditoria(
                email,

                'CHECKIN',

                `Serviço #${id}: entrada registrada com selfie e GPS.`
            );


            emitirAtualizacao(
                id,
                'checkin'
            );


            io.emit(
                'jornada_atualizada',
                {
                    servicoId:
                        id,

                    etapa:
                        'checkin',

                    hora
                }
            );


            return respostaSucesso(
                res,
                {
                    mensagem:
                        'Entrada registrada.',

                    hora
                }
            );

        } catch (
            erro
        ) {

            console.error(
                'Erro check-in:',
                erro
            );


            return respostaErro(
                res,
                500,
                'Erro ao registrar entrada.'
            );
        }
    }
);


// ============================================================
// INICIAR INTERVALO
// ============================================================

app.post(
    '/api/servicos/:id/intervalo/iniciar',

    async (
        req,
        res
    ) => {

        try {

            const id =
                Number(
                    req.params.id
                );


            const servico =
                await buscarServico(
                    id
                );


            if (!servico) {

                return respostaErro(
                    res,
                    404,
                    'Serviço não encontrado.'
                );
            }


            const email =
                normalizarEmail(

                    req.body
                        ?.prestadorEmail ||

                    req.body
                        ?.prestador_email ||

                    req.sessaoRS
                        ?.usuario_email ||

                    req.headers[
                        'x-user-email'
                    ]
                );


            if (
                !prestadorEhTitular(
                    servico,
                    email
                )
            ) {

                return respostaErro(
                    res,
                    403,
                    'Somente o Titular pode iniciar intervalo.'
                );
            }


            if (
                !servico.checkin_hora
            ) {

                return respostaErro(
                    res,
                    409,
                    'Faça o check-in antes de iniciar o intervalo.'
                );
            }


            if (
                servico.checkout_hora
            ) {

                return respostaErro(
                    res,
                    409,
                    'O serviço já foi finalizado.'
                );
            }


            if (
                servico.em_intervalo
            ) {

                return respostaErro(
                    res,
                    409,
                    'Já existe um intervalo em andamento.'
                );
            }


            // Nesta versão, um ciclo de intervalo por serviço.
            // Se quiser múltiplos intervalos depois,
            // o ideal será tabela própria de jornada_eventos.

            if (
                servico.intervalo_inicio &&
                servico.intervalo_fim
            ) {

                return respostaErro(
                    res,
                    409,
                    'O intervalo deste serviço já foi utilizado.'
                );
            }


            const hora =
                horaAtualRS();


            const resultado =
                await pool.query(
                    `
                    UPDATE servicos

                    SET
                        intervalo_inicio =
                            $1,

                        intervalo_fim =
                            NULL,

                        intervalo_retorno =
                            NULL,

                        em_intervalo =
                            TRUE,

                        status =
                            'em_intervalo',

                        atualizado_em =
                            CURRENT_TIMESTAMP

                    WHERE
                        id = $2

                    AND
                        em_intervalo =
                        FALSE

                    RETURNING id
                    `,
                    [
                        hora,
                        id
                    ]
                );


            if (
                !resultado.rows.length
            ) {

                return respostaErro(
                    res,
                    409,
                    'Não foi possível iniciar o intervalo.'
                );
            }


            await registrarAuditoria(
                email,

                'INTERVALO_INICIADO',

                `Serviço #${id}: intervalo iniciado às ${hora}.`
            );


            emitirAtualizacao(
                id,
                'intervalo'
            );


            io.emit(
                'jornada_atualizada',
                {
                    servicoId:
                        id,

                    etapa:
                        'intervalo_inicio',

                    hora
                }
            );


            return respostaSucesso(
                res,
                {
                    mensagem:
                        'Intervalo iniciado.',

                    hora
                }
            );

        } catch (
            erro
        ) {

            console.error(
                'Erro intervalo:',
                erro
            );


            return respostaErro(
                res,
                500,
                'Erro ao iniciar intervalo.'
            );
        }
    }
);


// ============================================================
// VOLTAR DO INTERVALO
// ============================================================

app.post(
    '/api/servicos/:id/intervalo/retornar',

    async (
        req,
        res
    ) => {

        try {

            const id =
                Number(
                    req.params.id
                );


            const servico =
                await buscarServico(
                    id
                );


            if (!servico) {

                return respostaErro(
                    res,
                    404,
                    'Serviço não encontrado.'
                );
            }


            const email =
                normalizarEmail(

                    req.body
                        ?.prestadorEmail ||

                    req.body
                        ?.prestador_email ||

                    req.sessaoRS
                        ?.usuario_email ||

                    req.headers[
                        'x-user-email'
                    ]
                );


            if (
                !prestadorEhTitular(
                    servico,
                    email
                )
            ) {

                return respostaErro(
                    res,
                    403,
                    'Somente o Titular pode retornar do intervalo.'
                );
            }


            if (
                !servico.checkin_hora
            ) {

                return respostaErro(
                    res,
                    409,
                    'A jornada ainda não foi iniciada.'
                );
            }


            if (
                servico.checkout_hora
            ) {

                return respostaErro(
                    res,
                    409,
                    'O serviço já foi finalizado.'
                );
            }


            if (
                !servico.em_intervalo
            ) {

                if (
                    servico.intervalo_fim ||
                    servico.intervalo_retorno
                ) {

                    return respostaSucesso(
                        res,
                        {
                            mensagem:
                                'O retorno do intervalo já estava registrado.',

                            hora:
                                servico.intervalo_fim ||
                                servico.intervalo_retorno
                        }
                    );
                }


                return respostaErro(
                    res,
                    409,
                    'Não existe intervalo em andamento.'
                );
            }


            const hora =
                horaAtualRS();


            const resultado =
                await pool.query(
                    `
                    UPDATE servicos

                    SET
                        intervalo_fim =
                            $1,

                        intervalo_retorno =
                            $1,

                        em_intervalo =
                            FALSE,

                        status =
                            'em_servico',

                        atualizado_em =
                            CURRENT_TIMESTAMP

                    WHERE
                        id = $2

                    AND
                        em_intervalo =
                        TRUE

                    RETURNING id
                    `,
                    [
                        hora,
                        id
                    ]
                );


            if (
                !resultado.rows.length
            ) {

                return respostaErro(
                    res,
                    409,
                    'O intervalo já foi encerrado em outro dispositivo.'
                );
            }


            await registrarAuditoria(
                email,

                'INTERVALO_FINALIZADO',

                `Serviço #${id}: retorno do intervalo às ${hora}.`
            );


            emitirAtualizacao(
                id,
                'retorno_intervalo'
            );


            io.emit(
                'jornada_atualizada',
                {
                    servicoId:
                        id,

                    etapa:
                        'intervalo_fim',

                    hora
                }
            );


            return respostaSucesso(
                res,
                {
                    mensagem:
                        'Retorno do intervalo registrado.',

                    hora
                }
            );

        } catch (
            erro
        ) {

            console.error(
                'Erro retorno intervalo:',
                erro
            );


            return respostaErro(
                res,
                500,
                'Erro ao retornar do intervalo.'
            );
        }
    }
);


// ============================================================
// CHECK-OUT
// ============================================================

app.post(
    '/api/servicos/:id/checkout',

    async (
        req,
        res
    ) => {

        try {

            const id =
                Number(
                    req.params.id
                );


            if (
                !idValido(id)
            ) {

                return respostaErro(
                    res,
                    400,
                    'Serviço inválido.'
                );
            }


            const servico =
                await buscarServico(
                    id
                );


            if (!servico) {

                return respostaErro(
                    res,
                    404,
                    'Serviço não encontrado.'
                );
            }


            const email =
                normalizarEmail(

                    req.body
                        ?.prestadorEmail ||

                    req.body
                        ?.prestador_email ||

                    req.sessaoRS
                        ?.usuario_email ||

                    req.headers[
                        'x-user-email'
                    ]
                );


            if (
                !prestadorEhTitular(
                    servico,
                    email
                )
            ) {

                return respostaErro(
                    res,
                    403,
                    'Somente o Titular pode registrar saída.'
                );
            }


            if (
                !servico.checkin_hora
            ) {

                return respostaErro(
                    res,
                    409,
                    'Faça o check-in antes da saída.'
                );
            }


            if (
                servico.em_intervalo
            ) {

                return respostaErro(
                    res,
                    409,
                    'Volte do intervalo antes de registrar a saída.'
                );
            }


            if (
                servico.checkout_hora
            ) {

                return respostaSucesso(
                    res,
                    {
                        mensagem:
                            'A saída já estava registrada.',

                        hora:
                            servico.checkout_hora
                    }
                );
            }


            const foto =
                req.body?.foto ||
                req.body?.selfie ||
                '';


            if (
                !fotoBase64Valida(
                    foto
                )
            ) {

                return respostaErro(
                    res,
                    400,
                    'A foto de saída é obrigatória.'
                );
            }


            const latitude =
                req.body?.latitude;


            const longitude =
                req.body?.longitude;


            if (
                !coordenadaValida(
                    latitude,
                    longitude
                )
            ) {

                return respostaErro(
                    res,
                    400,
                    'GPS inválido ou não informado.'
                );
            }


            const hora =
                horaAtualRS();


            const resultado =
                await pool.query(
                    `
                    UPDATE servicos

                    SET
                        checkout_hora =
                            $1,

                        checkout_foto =
                            $2,

                        checkout_latitude =
                            $3,

                        checkout_longitude =
                            $4,

                        status_checkin =
                            'concluido',

                        status =
                            'aguardando_validacao',

                        atualizado_em =
                            CURRENT_TIMESTAMP

                    WHERE
                        id = $5

                    AND
                        checkout_hora
                        IS NULL

                    RETURNING id
                    `,
                    [
                        hora,

                        foto,

                        String(
                            latitude
                        ),

                        String(
                            longitude
                        ),

                        id
                    ]
                );


            if (
                !resultado.rows.length
            ) {

                const atual =
                    await buscarServico(
                        id
                    );


                return respostaSucesso(
                    res,
                    {
                        mensagem:
                            'A saída já estava registrada.',

                        hora:
                            atual?.checkout_hora ||
                            ''
                    }
                );
            }


            await registrarAuditoria(
                email,

                'CHECKOUT',

                `Serviço #${id}: saída registrada com selfie e GPS.`
            );


            emitirAtualizacao(
                id,
                'checkout'
            );


            io.emit(
                'jornada_atualizada',
                {
                    servicoId:
                        id,

                    etapa:
                        'checkout',

                    hora
                }
            );


            return respostaSucesso(
                res,
                {
                    mensagem:
                        'Saída registrada. Aguardando validação da empresa.',

                    hora
                }
            );

        } catch (
            erro
        ) {

            console.error(
                'Erro check-out:',
                erro
            );


            return respostaErro(
                res,
                500,
                'Erro ao registrar saída.'
            );
        }
    }
);


// ============================================================
// VALIDAR SERVIÇO PELA EMPRESA
// ============================================================

app.post(
    '/api/servicos/:id/validar',

    async (
        req,
        res
    ) => {

        try {

            const id =
                Number(
                    req.params.id
                );


            const servico =
                await buscarServico(
                    id
                );


            if (!servico) {

                return respostaErro(
                    res,
                    404,
                    'Serviço não encontrado.'
                );
            }


            const empresaEmail =
                normalizarEmail(

                    req.body
                        ?.empresaEmail ||

                    req.body
                        ?.empresa_email ||

                    req.sessaoRS
                        ?.usuario_email ||

                    req.headers[
                        'x-user-email'
                    ]
                );


            const permitido =
                await empresaEhResponsavel(
                    servico,
                    empresaEmail
                );


            if (!permitido) {

                return respostaErro(
                    res,
                    403,
                    'Somente a empresa responsável pode validar este serviço.'
                );
            }


            if (
                !servico.checkout_hora
            ) {

                return respostaErro(
                    res,
                    409,
                    'O prestador ainda não registrou a saída.'
                );
            }


            if (
                servico.validado_empresa
            ) {

                return respostaSucesso(
                    res,
                    {
                        mensagem:
                            'O serviço já estava validado.'
                    }
                );
            }


            await pool.query(
                `
                UPDATE servicos

                SET
                    validado_empresa =
                        TRUE,

                    validado_em =
                        CURRENT_TIMESTAMP,

                    status =
                        'validado',

                    atualizado_em =
                        CURRENT_TIMESTAMP

                WHERE id = $1
                `,
                [
                    id
                ]
            );


            await registrarAuditoria(
                empresaEmail,

                'SERVICO_VALIDADO',

                `Serviço #${id}: execução validada pela empresa.`
            );


            emitirAtualizacao(
                id,
                'validacao'
            );


            return respostaSucesso(
                res,
                {
                    mensagem:
                        'Serviço validado com sucesso.'
                }
            );

        } catch (
            erro
        ) {

            console.error(
                erro
            );


            return respostaErro(
                res,
                500,
                'Erro ao validar serviço.'
            );
        }
    }
);


// ============================================================
// GARANTIR REGISTRO DE PAGAMENTO SEM DUPLICAR
// ============================================================

async function obterOuCriarPagamento(
    client,
    servico,
    empresaEmail
) {

    const prestadorEmail =
        normalizarEmail(
            servico.prestador_email
        );


    if (!prestadorEmail) {

        throw new Error(
            'Serviço sem Titular.'
        );
    }


    const existente =
        await client.query(
            `
            SELECT *
            FROM pagamentos

            WHERE
                servico_id = $1

            AND
                LOWER(
                    prestador_email
                )
                =
                LOWER($2)

            ORDER BY id DESC

            LIMIT 1

            FOR UPDATE
            `,
            [
                servico.id,
                prestadorEmail
            ]
        );


    const valor =
        valorServicoCompat(
            servico
        );


    if (
        existente.rows.length
    ) {

        const pagamento =
            existente.rows[0];


        await client.query(
            `
            UPDATE pagamentos

            SET
                empresa_email =
                    $1,

                valor =
                    $2,

                forma_pagamento =
                    $3,

                atualizado_em =
                    CURRENT_TIMESTAMP

            WHERE id = $4
            `,
            [
                empresaEmail,

                valor,

                textoSeguro(
                    servico.forma_pgto ||
                    'Pix'
                ),

                pagamento.id
            ]
        );


        return {
            ...pagamento,
            valor,
            empresa_email:
                empresaEmail
        };
    }


    const criado =
        await client.query(
            `
            INSERT INTO pagamentos (

                servico_id,
                empresa_email,
                prestador_email,
                valor,
                forma_pagamento,
                status,
                criado_em,
                atualizado_em

            )

            VALUES (
                $1,$2,$3,$4,$5,
                'PENDENTE',
                CURRENT_TIMESTAMP,
                CURRENT_TIMESTAMP
            )

            RETURNING *
            `,
            [
                servico.id,

                empresaEmail,

                prestadorEmail,

                valor,

                textoSeguro(
                    servico.forma_pgto ||
                    'Pix'
                )
            ]
        );


    return criado.rows[0];
}


// ============================================================
// AUTORIZAR PAGAMENTO
// ============================================================

app.post(
    '/api/servicos/:id/autorizar-pagamento',

    async (
        req,
        res
    ) => {

        const client =
            await pool.connect();


        try {

            await client.query(
                'BEGIN'
            );


            const id =
                Number(
                    req.params.id
                );


            const resultado =
                await client.query(
                    `
                    SELECT *
                    FROM servicos

                    WHERE id = $1

                    FOR UPDATE
                    `,
                    [
                        id
                    ]
                );


            const servico =
                resultado.rows[0];


            if (!servico) {

                await client.query(
                    'ROLLBACK'
                );


                return respostaErro(
                    res,
                    404,
                    'Serviço não encontrado.'
                );
            }


            const empresaEmail =
                normalizarEmail(

                    req.body
                        ?.empresaEmail ||

                    req.body
                        ?.empresa_email ||

                    req.sessaoRS
                        ?.usuario_email ||

                    req.headers[
                        'x-user-email'
                    ]
                );


            const empresa =
                await resolverEmpresaDoServico(
                    servico
                );


            if (
                empresa.email !==
                empresaEmail
            ) {

                await client.query(
                    'ROLLBACK'
                );


                return respostaErro(
                    res,
                    403,
                    'Empresa sem permissão.'
                );
            }


            if (
                !servico.validado_empresa
            ) {

                await client.query(
                    'ROLLBACK'
                );


                return respostaErro(
                    res,
                    409,
                    'Valide o serviço antes de autorizar o pagamento.'
                );
            }


            if (
                servico.pagamento_realizado
            ) {

                await client.query(
                    'ROLLBACK'
                );


                return respostaSucesso(
                    res,
                    {
                        mensagem:
                            'O pagamento já foi realizado.'
                    }
                );
            }


            const pagamento =
                await obterOuCriarPagamento(
                    client,
                    servico,
                    empresaEmail
                );


            if (
                textoSeguro(
                    pagamento.status
                )
                .toUpperCase() !==
                'PAGO'
            ) {

                await client.query(
                    `
                    UPDATE pagamentos

                    SET
                        status =
                            'AUTORIZADO',

                        autorizado_em =
                            COALESCE(
                                autorizado_em,
                                CURRENT_TIMESTAMP
                            ),

                        atualizado_em =
                            CURRENT_TIMESTAMP

                    WHERE id = $1
                    `,
                    [
                        pagamento.id
                    ]
                );
            }


            await client.query(
                `
                UPDATE servicos

                SET
                    pagamento_autorizado =
                        TRUE,

                    pagamento_autorizado_em =
                        COALESCE(
                            pagamento_autorizado_em,
                            CURRENT_TIMESTAMP
                        ),

                    status =
                        'pagamento_autorizado',

                    atualizado_em =
                        CURRENT_TIMESTAMP

                WHERE id = $1
                `,
                [
                    id
                ]
            );


            await client.query(
                'COMMIT'
            );


            await registrarAuditoria(
                empresaEmail,

                'PAGAMENTO_AUTORIZADO',

                `Serviço #${id}: pagamento autorizado.`
            );


            await registrarLedger(
                id,

                empresaEmail,

                'PAGAMENTO_AUTORIZADO',

                valorServicoCompat(
                    servico
                )
            );


            emitirAtualizacao(
                id,
                'pagamento'
            );


            io.emit(
                'pagamento_atualizado',
                {
                    servicoId:
                        id,

                    status:
                        'AUTORIZADO'
                }
            );


            return respostaSucesso(
                res,
                {
                    mensagem:
                        'Pagamento autorizado.'
                }
            );

        } catch (
            erro
        ) {

            try {

                await client.query(
                    'ROLLBACK'
                );

            } catch {}


            console.error(
                'Erro autorização pagamento:',
                erro
            );


            return respostaErro(
                res,
                500,
                'Erro ao autorizar pagamento.'
            );

        } finally {

            client.release();
        }
    }
);


// ============================================================
// COMPROVANTE DE PAGAMENTO
// PDF OU IMAGEM
// ============================================================

app.post(
    '/api/servicos/:id/comprovante-pagamento',

    upload.single(
        'arquivo'
    ),

    async (
        req,
        res
    ) => {

        const client =
            await pool.connect();


        try {

            await client.query(
                'BEGIN'
            );


            const id =
                Number(
                    req.params.id
                );


            const resultado =
                await client.query(
                    `
                    SELECT *
                    FROM servicos

                    WHERE id = $1

                    FOR UPDATE
                    `,
                    [
                        id
                    ]
                );


            const servico =
                resultado.rows[0];


            if (!servico) {

                await client.query(
                    'ROLLBACK'
                );


                return respostaErro(
                    res,
                    404,
                    'Serviço não encontrado.'
                );
            }


            const empresaEmail =
                normalizarEmail(

                    req.body
                        ?.empresaEmail ||

                    req.body
                        ?.empresa_email ||

                    req.sessaoRS
                        ?.usuario_email ||

                    req.headers[
                        'x-user-email'
                    ]
                );


            const empresa =
                await resolverEmpresaDoServico(
                    servico
                );


            if (
                empresa.email !==
                empresaEmail
            ) {

                await client.query(
                    'ROLLBACK'
                );


                return respostaErro(
                    res,
                    403,
                    'Empresa sem permissão.'
                );
            }


            if (
                !servico.pagamento_autorizado
            ) {

                await client.query(
                    'ROLLBACK'
                );


                return respostaErro(
                    res,
                    409,
                    'Autorize o pagamento antes de enviar o comprovante.'
                );
            }


            if (
                !req.file
            ) {

                await client.query(
                    'ROLLBACK'
                );


                return respostaErro(
                    res,
                    400,
                    'Selecione o comprovante.'
                );
            }


            const mime =
                textoSeguro(
                    req.file.mimetype
                )
                .toLowerCase();


            const nome =
                textoSeguro(
                    req.file.originalname
                );


            const permitidoArquivo =
                mime ===
                'application/pdf'
                ||
                mime.startsWith(
                    'image/'
                );


            if (
                !permitidoArquivo
            ) {

                await client.query(
                    'ROLLBACK'
                );


                return respostaErro(
                    res,
                    400,
                    'Envie o comprovante em PDF ou imagem.'
                );
            }


            const arquivo =
                `data:${mime};base64,${
                    req.file.buffer
                        .toString(
                            'base64'
                        )
                }`;


            const pagamento =
                await obterOuCriarPagamento(
                    client,
                    servico,
                    empresaEmail
                );


            await client.query(
                `
                UPDATE pagamentos

                SET
                    comprovante =
                        $1,

                    status =
                        'PAGO',

                    pago_em =
                        COALESCE(
                            pago_em,
                            CURRENT_TIMESTAMP
                        ),

                    atualizado_em =
                        CURRENT_TIMESTAMP

                WHERE id = $2
                `,
                [
                    arquivo,
                    pagamento.id
                ]
            );


            await client.query(
                `
                UPDATE servicos

                SET
                    comprovante_pagamento =
                        TRUE,

                    comprovante_pagamento_arquivo =
                        $1,

                    documento_comprovante =
                        $1,

                    pagamento_realizado =
                        TRUE,

                    pagamento_realizado_em =
                        COALESCE(
                            pagamento_realizado_em,
                            CURRENT_TIMESTAMP
                        ),

                    status =
                        'pago',

                    atualizado_em =
                        CURRENT_TIMESTAMP

                WHERE id = $2
                `,
                [
                    arquivo,
                    id
                ]
            );


            await client.query(
                `
                INSERT INTO documentos_rs (

                    servico_id,
                    empresa_email,
                    prestador_email,
                    categoria,
                    nome,
                    arquivo

                )

                VALUES (
                    $1,$2,$3,
                    'COMPROVANTE',
                    $4,$5
                )
                `,
                [
                    id,

                    empresaEmail,

                    normalizarEmail(
                        servico.prestador_email
                    ),

                    nome ||
                    `comprovante-${id}`,

                    arquivo
                ]
            );


            await client.query(
                'COMMIT'
            );


            await registrarAuditoria(
                empresaEmail,

                'PAGAMENTO_REALIZADO',

                `Serviço #${id}: comprovante enviado e pagamento marcado como realizado.`
            );


            await registrarLedger(
                id,

                empresaEmail,

                'PAGAMENTO_REALIZADO',

                valorServicoCompat(
                    servico
                )
            );


            emitirAtualizacao(
                id,
                'pagamento'
            );


            io.emit(
                'pagamento_atualizado',
                {
                    servicoId:
                        id,

                    status:
                        'PAGO'
                }
            );


            return respostaSucesso(
                res,
                {
                    mensagem:
                        'Comprovante arquivado e pagamento concluído.'
                }
            );

        } catch (
            erro
        ) {

            try {

                await client.query(
                    'ROLLBACK'
                );

            } catch {}


            console.error(
                'Erro comprovante:',
                erro
            );


            return respostaErro(
                res,
                500,
                'Erro ao arquivar comprovante.'
            );

        } finally {

            client.release();
        }
    }
);


// ============================================================
// NOTA FISCAL / DOCUMENTO OFICIAL
//
// O INDEX atual chama:
// /api/servicos/:id/nota-oficial
// campo multipart: notaFiscal
// ============================================================

app.post(
    '/api/servicos/:id/nota-oficial',

    upload.single(
        'notaFiscal'
    ),

    async (
        req,
        res
    ) => {

        try {

            const id =
                Number(
                    req.params.id
                );


            const servico =
                await buscarServico(
                    id
                );


            if (!servico) {

                return respostaErro(
                    res,
                    404,
                    'Serviço não encontrado.'
                );
            }


            if (
                !req.file
            ) {

                return respostaErro(
                    res,
                    400,
                    'Selecione a Nota Fiscal.'
                );
            }


            const solicitante =
                normalizarEmail(

                    req.sessaoRS
                        ?.usuario_email ||

                    req.headers[
                        'x-user-email'
                    ] ||

                    req.body
                        ?.email
                );


            // Nota pode ser enviada:
            // - pela empresa responsável
            // - pelo Titular
            //
            // Assim fica preparado para diferentes modelos
            // fiscais no futuro.

            const empresa =
                await resolverEmpresaDoServico(
                    servico
                );


            const ehEmpresaDoServico =
                empresa.email ===
                solicitante;


            const ehTitular =
                prestadorEhTitular(
                    servico,
                    solicitante
                );


            if (
                !ehEmpresaDoServico &&
                !ehTitular
            ) {

                return respostaErro(
                    res,
                    403,
                    'Você não possui permissão para enviar documento neste serviço.'
                );
            }


            const mime =
                textoSeguro(
                    req.file.mimetype
                )
                .toLowerCase();


            const nome =
                textoSeguro(
                    req.file.originalname
                );


            if (
                mime !==
                'application/pdf'
                &&
                !mime.startsWith(
                    'image/'
                )
            ) {

                return respostaErro(
                    res,
                    400,
                    'A Nota Fiscal deve estar em PDF ou imagem.'
                );
            }


            const arquivo =
                `data:${mime};base64,${
                    req.file.buffer
                        .toString(
                            'base64'
                        )
                }`;


            const client =
                await pool.connect();


            try {

                await client.query(
                    'BEGIN'
                );


                await client.query(
                    `
                    UPDATE servicos

                    SET
                        nota_oficial =
                            $1,

                        atualizado_em =
                            CURRENT_TIMESTAMP

                    WHERE id = $2
                    `,
                    [
                        arquivo,
                        id
                    ]
                );


                await client.query(
                    `
                    INSERT INTO documentos_rs (

                        servico_id,
                        empresa_email,
                        prestador_email,
                        categoria,
                        nome,
                        arquivo

                    )

                    VALUES (
                        $1,$2,$3,
                        'NOTA_FISCAL',
                        $4,$5
                    )
                    `,
                    [
                        id,

                        empresa.email,

                        normalizarEmail(
                            servico.prestador_email
                        ),

                        nome ||
                        `nota-fiscal-${id}`,

                        arquivo
                    ]
                );


                await client.query(
                    'COMMIT'
                );

            } catch (
                erroTransacao
            ) {

                await client.query(
                    'ROLLBACK'
                );


                throw erroTransacao;

            } finally {

                client.release();
            }


            await registrarAuditoria(
                solicitante,

                'NOTA_FISCAL_ENVIADA',

                `Serviço #${id}: Nota Fiscal/documento oficial arquivado.`
            );


            emitirAtualizacao(
                id,
                'documento'
            );


            return respostaSucesso(
                res,
                {
                    mensagem:
                        'Nota Fiscal arquivada.'
                }
            );

        } catch (
            erro
        ) {

            console.error(
                'Erro Nota Fiscal:',
                erro
            );


            return respostaErro(
                res,
                500,
                'Erro ao enviar Nota Fiscal.'
            );
        }
    }
);


// ============================================================
// FINANCEIRO DO PRESTADOR
// ============================================================

app.get(
    '/api/prestador/:email/historico-pagamentos',

    async (
        req,
        res
    ) => {

        try {

            const email =
                normalizarEmail(
                    req.params.email
                );


            const resultado =
                await pool.query(
                    `
                    SELECT

                        p.*,

                        s.titulo
                            AS servico_titulo,

                        s.empresa_nome,

                        s.categoria,

                        s.data

                    FROM pagamentos p

                    LEFT JOIN servicos s
                    ON
                        s.id =
                        p.servico_id

                    WHERE
                        LOWER(
                            p.prestador_email
                        )
                        =
                        LOWER($1)

                    ORDER BY
                        COALESCE(
                            p.pago_em,
                            p.autorizado_em,
                            p.criado_em
                        )
                        DESC,
                        p.id DESC
                    `,
                    [
                        email
                    ]
                );


            return respostaSucesso(
                res,
                {
                    pagamentos:
                        resultado.rows
                }
            );

        } catch (
            erro
        ) {

            console.error(
                erro
            );


            return respostaErro(
                res,
                500,
                'Erro ao carregar histórico financeiro.'
            );
        }
    }
);


// ============================================================
// PAINEL DA EMPRESA
// ============================================================

app.get(
    '/api/empresa/:email/painel',

    async (
        req,
        res
    ) => {

        try {

            const email =
                normalizarEmail(
                    req.params.email
                );


            const todos =
                await pool.query(
                    `
                    SELECT *
                    FROM servicos
                    ORDER BY id DESC
                    `
                );


            const servicos =
                [];


            for (
                const registro
                of todos.rows
            ) {

                const item =
                    await servicoParaIndex(
                        registro
                    );


                if (
                    normalizarEmail(
                        item.empresa_email
                    )
                    ===
                    email
                ) {

                    servicos.push(
                        item
                    );
                }
            }


            const pagamentos =
                await pool.query(
                    `
                    SELECT *
                    FROM pagamentos

                    WHERE
                        LOWER(
                            empresa_email
                        )
                        =
                        LOWER($1)

                    ORDER BY
                        criado_em DESC,
                        id DESC
                    `,
                    [
                        email
                    ]
                );


            const documentos =
                await pool.query(
                    `
                    SELECT

                        id,
                        servico_id,
                        empresa_email,
                        prestador_email,
                        categoria,
                        nome,
                        criado_em

                    FROM documentos_rs

                    WHERE
                        LOWER(
                            empresa_email
                        )
                        =
                        LOWER($1)

                    ORDER BY
                        criado_em DESC,
                        id DESC
                    `,
                    [
                        email
                    ]
                );


            const trabalhadores =
                new Map();


            for (
                const servico
                of servicos
            ) {

                const titular =
                    normalizarEmail(
                        servico.prestador_email
                    );


                if (titular) {

                    const usuario =
                        await buscarUsuarioPorEmail(
                            titular
                        );


                    trabalhadores.set(
                        titular,
                        {
                            email:
                                titular,

                            nome:
                                usuario?.nome ||
                                servico.prestador_nome ||
                                titular,

                            whatsapp:
                                usuario?.whatsapp ||
                                servico.prestador_whatsapp ||
                                '',

                            profissao:
                                usuario?.profissao ||
                                '',

                            experiencia:
                                usuario?.experiencia ||
                                '',

                            pix:
                                usuario?.pix ||
                                servico.prestador_pix ||
                                '',

                            rg_cnh:
                                usuario?.rg_cnh ||
                                ''
                        }
                    );
                }


                for (
                    const reserva
                    of obterReservasServico(
                        servico
                    )
                ) {

                    if (
                        trabalhadores.has(
                            reserva.email
                        )
                    ) {

                        continue;
                    }


                    const usuario =
                        await buscarUsuarioPorEmail(
                            reserva.email
                        );


                    trabalhadores.set(
                        reserva.email,
                        {
                            email:
                                reserva.email,

                            nome:
                                usuario?.nome ||
                                reserva.nome ||
                                reserva.email,

                            whatsapp:
                                usuario?.whatsapp ||
                                reserva.whatsapp ||
                                '',

                            profissao:
                                usuario?.profissao ||
                                '',

                            experiencia:
                                usuario?.experiencia ||
                                '',

                            pix:
                                usuario?.pix ||
                                reserva.pix ||
                                '',

                            rg_cnh:
                                usuario?.rg_cnh ||
                                ''
                        }
                    );
                }
            }


            const emAndamento =
                servicos.filter(
                    s =>
                        Boolean(
                            s.checkin_hora
                        )
                        &&
                        !s.checkout_hora
                );


            const aguardandoValidacao =
                servicos.filter(
                    s =>
                        Boolean(
                            s.checkout_hora
                        )
                        &&
                        !s.validado_empresa
                );


            const pendentesPagamento =
                servicos.filter(
                    s =>
                        s.validado_empresa
                        &&
                        !s.pagamento_realizado
                );


            return respostaSucesso(
                res,
                {
                    resumo: {

                        totalServicos:
                            servicos.length,

                        trabalhadores:
                            trabalhadores.size,

                        emAndamento:
                            emAndamento.length,

                        aguardandoValidacao:
                            aguardandoValidacao.length,

                        pendentesPagamento:
                            pendentesPagamento.length
                    },

                    trabalhadores:
                        Array.from(
                            trabalhadores.values()
                        ),

                    servicos,

                    pagamentos:
                        pagamentos.rows,

                    documentos:
                        documentos.rows
                }
            );

        } catch (
            erro
        ) {

            console.error(
                'Erro painel empresa:',
                erro
            );


            return respostaErro(
                res,
                500,
                'Erro ao carregar painel da empresa.'
            );
        }
    }
);


// ============================================================
// ARQUIVO DIGITAL DA EMPRESA
// ============================================================

app.get(
    '/api/empresa/:email/arquivo',

    async (
        req,
        res
    ) => {

        try {

            const email =
                normalizarEmail(
                    req.params.email
                );


            const todos =
                await pool.query(
                    `
                    SELECT *
                    FROM servicos
                    ORDER BY id DESC
                    `
                );


            const servicos =
                [];


            for (
                const registro
                of todos.rows
            ) {

                const item =
                    await servicoParaIndex(
                        registro
                    );


                if (
                    normalizarEmail(
                        item.empresa_email
                    )
                    ===
                    email
                ) {

                    servicos.push(
                        item
                    );
                }
            }


            const documentosResultado =
                await pool.query(
                    `
                    SELECT *
                    FROM documentos_rs

                    WHERE
                        LOWER(
                            empresa_email
                        )
                        =
                        LOWER($1)

                    ORDER BY
                        criado_em DESC,
                        id DESC
                    `,
                    [
                        email
                    ]
                );


            const pagamentosResultado =
                await pool.query(
                    `
                    SELECT *
                    FROM pagamentos

                    WHERE
                        LOWER(
                            empresa_email
                        )
                        =
                        LOWER($1)

                    ORDER BY
                        criado_em DESC,
                        id DESC
                    `,
                    [
                        email
                    ]
                );


            const historicoEscalasResultado =
                await pool.query(
                    `
                    SELECT h.*

                    FROM historico_escalas h

                    INNER JOIN servicos s
                    ON
                        s.id =
                        h.servico_id

                    WHERE
                        LOWER(
                            s.empresa_email
                        )
                        =
                        LOWER($1)

                    ORDER BY
                        h.criado_em DESC,
                        h.id DESC
                    `,
                    [
                        email
                    ]
                );


            const documentos =
                documentosResultado.rows;


            const pagamentos =
                pagamentosResultado.rows;


            const trabalhadoresMap =
                new Map();


            for (
                const servico
                of servicos
            ) {

                const emails =
                    [
                        normalizarEmail(
                            servico.prestador_email
                        ),

                        ...obterReservasServico(
                            servico
                        )
                        .map(
                            reserva =>
                                reserva.email
                        )
                    ]
                    .filter(Boolean);


                for (
                    const trabalhadorEmail
                    of emails
                ) {

                    if (
                        trabalhadoresMap.has(
                            trabalhadorEmail
                        )
                    ) {

                        continue;
                    }


                    const usuario =
                        await buscarUsuarioPorEmail(
                            trabalhadorEmail
                        );


                    trabalhadoresMap.set(
                        trabalhadorEmail,
                        {
                            email:
                                trabalhadorEmail,

                            nome:
                                usuario?.nome ||
                                trabalhadorEmail,

                            profissao:
                                usuario?.profissao ||
                                '',

                            whatsapp:
                                usuario?.whatsapp ||
                                '',

                            experiencia:
                                usuario?.experiencia ||
                                ''
                        }
                    );
                }
            }


            const contratos =
                documentos.filter(
                    documento =>
                        textoSeguro(
                            documento.categoria
                        )
                        .toUpperCase() ===
                        'CONTRATO'
                );


            const comprovantes =
                documentos.filter(
                    documento =>
                        textoSeguro(
                            documento.categoria
                        )
                        .toUpperCase() ===
                        'COMPROVANTE'
                );


            const notasFiscais =
                documentos.filter(
                    documento =>
                        textoSeguro(
                            documento.categoria
                        )
                        .toUpperCase() ===
                        'NOTA_FISCAL'
                );


            const servicosRealizados =
                servicos.filter(
                    servico =>
                        Boolean(
                            servico.checkout_hora
                        )
                );


            return respostaSucesso(
                res,
                {
                    pastas: {

                        trabalhadores:
                            Array.from(
                                trabalhadoresMap.values()
                            ),

                        contratos,

                        servicosRealizados,

                        escalas:
                            servicos,

                        pagamentos,

                        comprovantes,

                        historico:
                            [
                                ...historicoEscalasResultado.rows
                            ],

                        documentos,

                        notasFiscais
                    }
                }
            );

        } catch (
            erro
        ) {

            console.error(
                'Erro Arquivo Digital:',
                erro
            );


            return respostaErro(
                res,
                500,
                'Erro ao carregar Arquivo Digital.'
            );
        }
    }
);


// ============================================================
// HISTÓRICO DE TRABALHADOR DENTRO DA EMPRESA
// ============================================================

app.get(
    '/api/empresa/:empresaEmail/trabalhador/:prestadorEmail',

    async (
        req,
        res
    ) => {

        try {

            const empresaEmail =
                normalizarEmail(
                    req.params
                        .empresaEmail
                );


            const prestadorEmail =
                normalizarEmail(
                    req.params
                        .prestadorEmail
                );


            const todos =
                await pool.query(
                    `
                    SELECT *
                    FROM servicos
                    ORDER BY id DESC
                    `
                );


            const servicos =
                [];


            for (
                const registro
                of todos.rows
            ) {

                const item =
                    await servicoParaIndex(
                        registro
                    );


                const pertenceEmpresa =
                    normalizarEmail(
                        item.empresa_email
                    )
                    ===
                    empresaEmail;


                if (
                    !pertenceEmpresa
                ) {

                    continue;
                }


                const participante =
                    prestadorJaEstaNaVaga(
                        item,
                        prestadorEmail
                    )
                    ||
                    normalizarEmail(
                        item.prestador_email
                    )
                    ===
                    prestadorEmail;


                if (
                    participante
                ) {

                    servicos.push(
                        item
                    );
                }
            }


            const usuario =
                await buscarUsuarioPorEmail(
                    prestadorEmail
                );


            const pagamentos =
                await pool.query(
                    `
                    SELECT *
                    FROM pagamentos

                    WHERE
                        LOWER(
                            empresa_email
                        )
                        =
                        LOWER($1)

                    AND
                        LOWER(
                            prestador_email
                        )
                        =
                        LOWER($2)

                    ORDER BY
                        criado_em DESC,
                        id DESC
                    `,
                    [
                        empresaEmail,
                        prestadorEmail
                    ]
                );


            const documentos =
                await pool.query(
                    `
                    SELECT *
                    FROM documentos_rs

                    WHERE
                        LOWER(
                            empresa_email
                        )
                        =
                        LOWER($1)

                    AND
                        LOWER(
                            prestador_email
                        )
                        =
                        LOWER($2)

                    ORDER BY
                        criado_em DESC,
                        id DESC
                    `,
                    [
                        empresaEmail,
                        prestadorEmail
                    ]
                );


            return respostaSucesso(
                res,
                {
                    trabalhador: {

                        id:
                            usuario?.id ||
                            null,

                        nome:
                            usuario?.nome ||
                            prestadorEmail,

                        email:
                            prestadorEmail,

                        whatsapp:
                            usuario?.whatsapp ||
                            '',

                        profissao:
                            usuario?.profissao ||
                            '',

                        experiencia:
                            usuario?.experiencia ||
                            '',

                        rg_cnh:
                            usuario?.rg_cnh ||
                            '',

                        pix:
                            usuario?.pix ||
                            '',

                        banco:
                            usuario?.banco ||
                            '',

                        conta:
                            usuario?.conta ||
                            ''
                    },

                    totalServicos:
                        servicos.length,

                    servicos,

                    pagamentos:
                        pagamentos.rows,

                    documentos:
                        documentos.rows
                }
            );

        } catch (
            erro
        ) {

            console.error(
                erro
            );


            return respostaErro(
                res,
                500,
                'Erro ao carregar histórico do trabalhador.'
            );
        }
    }
);


// ============================================================
// DOCUMENTO INDIVIDUAL
//
// Útil depois para abrir PDF/comprovante no Arquivo Digital.
// Exige usuário relacionado ao documento.
// ============================================================

app.get(
    '/api/documentos/:id',

    async (
        req,
        res
    ) => {

        try {

            const id =
                Number(
                    req.params.id
                );


            if (
                !idValido(id)
            ) {

                return respostaErro(
                    res,
                    400,
                    'Documento inválido.'
                );
            }


            const resultado =
                await pool.query(
                    `
                    SELECT *
                    FROM documentos_rs

                    WHERE id = $1

                    LIMIT 1
                    `,
                    [
                        id
                    ]
                );


            const documento =
                resultado.rows[0];


            if (!documento) {

                return respostaErro(
                    res,
                    404,
                    'Documento não encontrado.'
                );
            }


            const solicitante =
                normalizarEmail(

                    req.sessaoRS
                        ?.usuario_email ||

                    req.headers[
                        'x-user-email'
                    ] ||

                    req.query
                        ?.email
                );


            if (
                !solicitante
            ) {

                return respostaErro(
                    res,
                    401,
                    'Usuário não identificado.'
                );
            }


            const autorizado =
                solicitante ===
                normalizarEmail(
                    documento.empresa_email
                )
                ||
                solicitante ===
                normalizarEmail(
                    documento.prestador_email
                );


            if (
                !autorizado
            ) {

                return respostaErro(
                    res,
                    403,
                    'Você não possui acesso a este documento.'
                );
            }


            return respostaSucesso(
                res,
                {
                    documento
                }
            );

        } catch (
            erro
        ) {

            return respostaErro(
                res,
                500,
                'Erro ao carregar documento.'
            );
        }
    }
);


// ============================================================
// HISTÓRICO DE AUDITORIA DE UM SERVIÇO
// ============================================================

app.get(
    '/api/servicos/:id/auditoria',

    async (
        req,
        res
    ) => {

        try {

            const id =
                Number(
                    req.params.id
                );


            const servico =
                await buscarServico(
                    id
                );


            if (!servico) {

                return respostaErro(
                    res,
                    404,
                    'Serviço não encontrado.'
                );
            }


            const solicitante =
                normalizarEmail(

                    req.sessaoRS
                        ?.usuario_email ||

                    req.headers[
                        'x-user-email'
                    ] ||

                    req.query
                        ?.email
                );


            const empresa =
                await resolverEmpresaDoServico(
                    servico
                );


            const autorizado =
                solicitante ===
                empresa.email
                ||
                solicitante ===
                normalizarEmail(
                    servico.prestador_email
                );


            if (
                !autorizado
            ) {

                return respostaErro(
                    res,
                    403,
                    'Sem acesso ao histórico deste serviço.'
                );
            }


            const auditoria =
                await pool.query(
                    `
                    SELECT *
                    FROM auditoria_sistema

                    WHERE
                        detalhes
                        LIKE $1

                    ORDER BY
                        criado_em ASC,
                        id ASC
                    `,
                    [
                        `%Serviço #${id}%`
                    ]
                );


            const escala =
                await pool.query(
                    `
                    SELECT *
                    FROM historico_escalas

                    WHERE
                        servico_id = $1

                    ORDER BY
                        criado_em ASC,
                        id ASC
                    `,
                    [
                        id
                    ]
                );


            return respostaSucesso(
                res,
                {
                    auditoria:
                        auditoria.rows,

                    escala:
                        escala.rows
                }
            );

        } catch (
            erro
        ) {

            return respostaErro(
                res,
                500,
                'Erro ao carregar auditoria.'
            );
        }
    }
);


// ============================================================
// FIM DA PARTE 3
//
// PARTE 4 CONTINUA COM:
//
// • chat completo
// • Socket.IO
// • mensagens lidas/não lidas
// • compatibilidade de serviços antigos no chat
// • status/health check
// • verificação automática de confirmação
// • limpeza automática de sessões
// • tratamento 404/API
// • tratamento Multer
// • index.html
// • inicialização segura do banco
// • UM ÚNICO server.listen()
// ============================================================
// ============================================================
// RS CONNECT
// SERVER.JS — PARTE 4 DE 4
//
// CHAT + SOCKET.IO
// HEALTH CHECK
// TAREFAS AUTOMÁTICAS
// TRATAMENTO DE ERROS
// INDEX
// INICIALIZAÇÃO FINAL
// ============================================================


// ============================================================
// CHAT — VERIFICAR ACESSO
// ============================================================

async function usuarioPodeAcessarChat(
    servicoId,
    usuarioEmail
) {

    const servico =
        await buscarServico(
            servicoId
        );


    if (!servico) {

        return {
            autorizado:
                false,

            motivo:
                'Serviço não encontrado.'
        };
    }


    const empresa =
        await resolverEmpresaDoServico(
            servico
        );


    const email =
        normalizarEmail(
            usuarioEmail
        );


    const prestadorEmail =
        normalizarEmail(
            servico.prestador_email
        );


    if (
        !empresa.email
    ) {

        return {
            autorizado:
                false,

            motivo:
                'Não foi possível identificar a empresa responsável por este serviço.'
        };
    }


    if (
        !prestadorEmail
    ) {

        return {
            autorizado:
                false,

            motivo:
                'O chat será liberado quando houver um Titular.'
        };
    }


    if (
        email ===
        empresa.email
    ) {

        return {
            autorizado:
                true,

            tipo:
                'empresa',

            servico,

            empresaEmail:
                empresa.email,

            empresaNome:
                empresa.nome,

            prestadorEmail
        };
    }


    if (
        email ===
        prestadorEmail
    ) {

        return {
            autorizado:
                true,

            tipo:
                'prestador',

            servico,

            empresaEmail:
                empresa.email,

            empresaNome:
                empresa.nome,

            prestadorEmail
        };
    }


    return {
        autorizado:
            false,

        motivo:
            'Você não possui acesso ao chat deste serviço.'
    };
}


// ============================================================
// OBTER / CRIAR CONVERSA
// ============================================================

async function obterOuCriarConversa(
    servicoId
) {

    const servico =
        await buscarServico(
            servicoId
        );


    if (!servico) {

        throw new Error(
            'Serviço não encontrado.'
        );
    }


    const empresa =
        await resolverEmpresaDoServico(
            servico
        );


    const prestadorEmail =
        normalizarEmail(
            servico.prestador_email
        );


    if (
        !empresa.email
    ) {

        throw new Error(
            'Empresa não identificada.'
        );
    }


    if (
        !prestadorEmail
    ) {

        throw new Error(
            'O serviço ainda não possui Titular.'
        );
    }


    const resultado =
        await pool.query(
            `
            INSERT INTO conversas (

                servico_id,
                empresa_email,
                prestador_email,
                criado_em,
                atualizado_em,
                ativo

            )

            VALUES (
                $1,$2,$3,
                CURRENT_TIMESTAMP,
                CURRENT_TIMESTAMP,
                TRUE
            )

            ON CONFLICT (
                servico_id,
                empresa_email,
                prestador_email
            )

            DO UPDATE SET
                ativo =
                    TRUE,

                atualizado_em =
                    CURRENT_TIMESTAMP

            RETURNING *
            `,
            [
                Number(
                    servicoId
                ),

                empresa.email,

                prestadorEmail
            ]
        );


    return resultado.rows[0];
}


// ============================================================
// NOME DA SALA DO SOCKET
// ============================================================

function nomeSalaChat(
    conversaId
) {

    return `chat_${Number(conversaId)}`;
}


// ============================================================
// LISTAR CONVERSAS
// ============================================================

app.get(
    '/api/chat/conversas',

    async (
        req,
        res
    ) => {

        try {

            const email =
                normalizarEmail(

                    req.query
                        ?.email ||

                    req.sessaoRS
                        ?.usuario_email ||

                    req.headers[
                        'x-user-email'
                    ]
                );


            if (!email) {

                return respostaErro(
                    res,
                    400,
                    'E-mail obrigatório.'
                );
            }


            // =================================================
            // GARANTIR CONVERSAS DOS SERVIÇOS EXISTENTES
            // =================================================

            const servicosResultado =
                await pool.query(
                    `
                    SELECT *
                    FROM servicos

                    WHERE
                        prestador_email
                        IS NOT NULL

                    ORDER BY id DESC
                    `
                );


            for (
                const servico
                of servicosResultado.rows
            ) {

                try {

                    const empresa =
                        await resolverEmpresaDoServico(
                            servico
                        );


                    const prestador =
                        normalizarEmail(
                            servico.prestador_email
                        );


                    if (
                        empresa.email ===
                        email
                        ||
                        prestador ===
                        email
                    ) {

                        await obterOuCriarConversa(
                            servico.id
                        );
                    }

                } catch (
                    erro
                ) {

                    console.warn(
                        `Chat serviço #${servico.id}:`,
                        erro.message
                    );
                }
            }


            // =================================================
            // LISTAR
            // =================================================

            const resultado =
                await pool.query(
                    `
                    SELECT

                        c.id,
                        c.servico_id,
                        c.empresa_email,
                        c.prestador_email,
                        c.criado_em,
                        c.atualizado_em,
                        c.ativo,

                        s.titulo
                            AS servico_titulo,

                        s.categoria
                            AS servico_categoria,

                        s.local
                            AS servico_local,

                        COALESCE(
                            NULLIF(
                                s.empresa_nome,
                                ''
                            ),
                            c.empresa_email
                        )
                        AS empresa_nome,

                        COALESCE(
                            NULLIF(
                                s.prestador_nome,
                                ''
                            ),
                            c.prestador_email
                        )
                        AS prestador_nome,

                        (
                            SELECT
                                m.mensagem

                            FROM
                                mensagens_chat m

                            WHERE
                                m.conversa_id =
                                c.id

                            ORDER BY
                                m.criado_em DESC,
                                m.id DESC

                            LIMIT 1
                        )
                        AS ultima_mensagem,

                        (
                            SELECT
                                m.criado_em

                            FROM
                                mensagens_chat m

                            WHERE
                                m.conversa_id =
                                c.id

                            ORDER BY
                                m.criado_em DESC,
                                m.id DESC

                            LIMIT 1
                        )
                        AS ultima_mensagem_em,

                        (
                            SELECT
                                COUNT(*)::INTEGER

                            FROM
                                mensagens_chat m

                            WHERE
                                m.conversa_id =
                                c.id

                            AND
                                LOWER(
                                    m.destinatario_email
                                )
                                =
                                LOWER($1)

                            AND
                                m.lida =
                                FALSE
                        )
                        AS nao_lidas

                    FROM
                        conversas c

                    LEFT JOIN
                        servicos s

                    ON
                        s.id =
                        c.servico_id

                    WHERE
                        (
                            LOWER(
                                c.empresa_email
                            )
                            =
                            LOWER($1)

                            OR

                            LOWER(
                                c.prestador_email
                            )
                            =
                            LOWER($1)
                        )

                    AND
                        c.ativo =
                        TRUE

                    ORDER BY
                        COALESCE(
                            (
                                SELECT
                                    MAX(m2.criado_em)

                                FROM
                                    mensagens_chat m2

                                WHERE
                                    m2.conversa_id =
                                    c.id
                            ),
                            c.atualizado_em,
                            c.criado_em
                        )
                        DESC
                    `,
                    [
                        email
                    ]
                );


            return respostaSucesso(
                res,
                {
                    conversas:
                        resultado.rows
                }
            );

        } catch (
            erro
        ) {

            console.error(
                'Erro conversas:',
                erro
            );


            return respostaErro(
                res,
                500,
                'Erro ao carregar conversas.'
            );
        }
    }
);


// ============================================================
// CARREGAR MENSAGENS DE UM SERVIÇO
// ============================================================

app.get(
    '/api/chat/:servicoId/mensagens',

    async (
        req,
        res
    ) => {

        try {

            const servicoId =
                Number(
                    req.params
                        .servicoId
                );


            if (
                !idValido(
                    servicoId
                )
            ) {

                return respostaErro(
                    res,
                    400,
                    'Serviço inválido.'
                );
            }


            const email =
                normalizarEmail(

                    req.query
                        ?.email ||

                    req.sessaoRS
                        ?.usuario_email ||

                    req.headers[
                        'x-user-email'
                    ]
                );


            if (!email) {

                return respostaErro(
                    res,
                    400,
                    'Usuário não identificado.'
                );
            }


            const permissao =
                await usuarioPodeAcessarChat(
                    servicoId,
                    email
                );


            if (
                !permissao.autorizado
            ) {

                return respostaErro(
                    res,
                    403,
                    permissao.motivo
                );
            }


            const conversa =
                await obterOuCriarConversa(
                    servicoId
                );


            // =================================================
            // MARCAR COMO LIDAS
            // =================================================

            await pool.query(
                `
                UPDATE mensagens_chat

                SET
                    lida =
                        TRUE

                WHERE
                    conversa_id =
                    $1

                AND
                    LOWER(
                        destinatario_email
                    )
                    =
                    LOWER($2)

                AND
                    lida =
                    FALSE
                `,
                [
                    conversa.id,
                    email
                ]
            );


            const mensagens =
                await pool.query(
                    `
                    SELECT
                        id,
                        conversa_id,
                        servico_id,
                        remetente_email,
                        destinatario_email,
                        mensagem,
                        tipo,
                        lida,
                        criado_em

                    FROM
                        mensagens_chat

                    WHERE
                        conversa_id =
                        $1

                    ORDER BY
                        criado_em ASC,
                        id ASC
                    `,
                    [
                        conversa.id
                    ]
                );


            const usuarioPrestador =
                await buscarUsuarioPorEmail(
                    permissao
                        .prestadorEmail
                );


            const usuarioEmpresa =
                await buscarUsuarioPorEmail(
                    permissao
                        .empresaEmail
                );


            io
                .to(
                    nomeSalaChat(
                        conversa.id
                    )
                )
                .emit(
                    'chat:leitura-atualizada',
                    {
                        conversaId:
                            conversa.id,

                        servicoId,

                        leitorEmail:
                            email
                    }
                );


            return respostaSucesso(
                res,
                {
                    conversa: {

                        id:
                            conversa.id,

                        servicoId,

                        empresaEmail:
                            permissao
                                .empresaEmail,

                        empresaNome:
                            permissao
                                .empresaNome
                            ||
                            usuarioEmpresa
                                ?.nome
                            ||
                            permissao
                                .empresaEmail,

                        prestadorEmail:
                            permissao
                                .prestadorEmail,

                        prestadorNome:
                            usuarioPrestador
                                ?.nome
                            ||
                            permissao
                                .servico
                                ?.prestador_nome
                            ||
                            permissao
                                .prestadorEmail,

                        servicoTitulo:
                            permissao
                                .servico
                                ?.titulo
                            ||
                            `Serviço #${servicoId}`
                    },

                    mensagens:
                        mensagens.rows
                }
            );

        } catch (
            erro
        ) {

            console.error(
                'Erro mensagens:',
                erro
            );


            return respostaErro(
                res,
                500,
                erro.message ||
                'Erro ao carregar mensagens.'
            );
        }
    }
);


// ============================================================
// ENVIAR MENSAGEM
// ============================================================

app.post(
    '/api/chat/:servicoId/mensagens',

    async (
        req,
        res
    ) => {

        try {

            const servicoId =
                Number(
                    req.params
                        .servicoId
                );


            if (
                !idValido(
                    servicoId
                )
            ) {

                return respostaErro(
                    res,
                    400,
                    'Serviço inválido.'
                );
            }


            const remetente =
                normalizarEmail(

                    req.body
                        ?.remetenteEmail ||

                    req.body
                        ?.remetente_email ||

                    req.body
                        ?.email ||

                    req.sessaoRS
                        ?.usuario_email ||

                    req.headers[
                        'x-user-email'
                    ]
                );


            const mensagem =
                textoSeguro(
                    req.body
                        ?.mensagem
                );


            if (!remetente) {

                return respostaErro(
                    res,
                    400,
                    'Remetente não identificado.'
                );
            }


            if (!mensagem) {

                return respostaErro(
                    res,
                    400,
                    'Digite uma mensagem.'
                );
            }


            if (
                mensagem.length >
                5000
            ) {

                return respostaErro(
                    res,
                    400,
                    'A mensagem ultrapassa 5.000 caracteres.'
                );
            }


            const permissao =
                await usuarioPodeAcessarChat(
                    servicoId,
                    remetente
                );


            if (
                !permissao.autorizado
            ) {

                return respostaErro(
                    res,
                    403,
                    permissao.motivo
                );
            }


            const conversa =
                await obterOuCriarConversa(
                    servicoId
                );


            const destinatario =
                remetente ===
                permissao.empresaEmail
                    ?
                    permissao.prestadorEmail
                    :
                    permissao.empresaEmail;


            if (!destinatario) {

                return respostaErro(
                    res,
                    409,
                    'Destinatário não identificado.'
                );
            }


            const resultado =
                await pool.query(
                    `
                    INSERT INTO mensagens_chat (

                        conversa_id,
                        servico_id,
                        remetente_email,
                        destinatario_email,
                        mensagem,
                        tipo,
                        lida,
                        criado_em

                    )

                    VALUES (
                        $1,$2,$3,$4,$5,
                        'texto',
                        FALSE,
                        CURRENT_TIMESTAMP
                    )

                    RETURNING *
                    `,
                    [
                        conversa.id,
                        servicoId,
                        remetente,
                        destinatario,
                        mensagem
                    ]
                );


            await pool.query(
                `
                UPDATE conversas

                SET
                    atualizado_em =
                        CURRENT_TIMESTAMP

                WHERE id = $1
                `,
                [
                    conversa.id
                ]
            );


            const novaMensagem =
                resultado.rows[0];


            // =================================================
            // TEMPO REAL
            // =================================================

            io
                .to(
                    nomeSalaChat(
                        conversa.id
                    )
                )
                .emit(
                    'chat:nova-mensagem',
                    {
                        conversaId:
                            conversa.id,

                        servicoId,

                        mensagem:
                            novaMensagem
                    }
                );


            io.emit(
                'nova_mensagem',
                {
                    conversaId:
                        conversa.id,

                    servicoId,

                    destinatarioEmail:
                        destinatario,

                    mensagem:
                        novaMensagem
                }
            );


            io.emit(
                'chat:conversas-atualizadas',
                {
                    conversaId:
                        conversa.id,

                    servicoId
                }
            );


            await registrarAuditoria(
                remetente,

                'CHAT_MENSAGEM',

                `Serviço #${servicoId}: mensagem enviada no chat.`
            );


            return respostaSucesso(
                res,
                {
                    mensagem:
                        novaMensagem
                }
            );

        } catch (
            erro
        ) {

            console.error(
                'Erro ao enviar mensagem:',
                erro
            );


            return respostaErro(
                res,
                500,
                erro.message ||
                'Erro ao enviar mensagem.'
            );
        }
    }
);


// ============================================================
// CONTADOR DE MENSAGENS NÃO LIDAS
// ============================================================

app.get(
    '/api/chat/nao-lidas',

    async (
        req,
        res
    ) => {

        try {

            const email =
                normalizarEmail(

                    req.query
                        ?.email ||

                    req.sessaoRS
                        ?.usuario_email ||

                    req.headers[
                        'x-user-email'
                    ]
                );


            if (!email) {

                return respostaErro(
                    res,
                    400,
                    'Usuário não identificado.'
                );
            }


            const resultado =
                await pool.query(
                    `
                    SELECT
                        COUNT(*)::INTEGER
                        AS total

                    FROM
                        mensagens_chat

                    WHERE
                        LOWER(
                            destinatario_email
                        )
                        =
                        LOWER($1)

                    AND
                        lida =
                        FALSE
                    `,
                    [
                        email
                    ]
                );


            return respostaSucesso(
                res,
                {
                    total:
                        resultado
                            .rows[0]
                            ?.total
                        ||
                        0
                }
            );

        } catch (
            erro
        ) {

            return respostaErro(
                res,
                500,
                'Erro ao contar mensagens.'
            );
        }
    }
);


// ============================================================
// SOCKET.IO
// APENAS UM io.on("connection")
// ============================================================

io.on(
    'connection',

    socket => {

        console.log(
            '🔌 WebSocket conectado:',
            socket.id
        );


        // ====================================================
        // IDENTIFICAR USUÁRIO
        // ====================================================

        socket.on(
            'registrar_usuario',

            dados => {

                const email =
                    normalizarEmail(
                        dados?.email
                    );


                if (!email) {

                    return;
                }


                socket.data.email =
                    email;


                socket.data.tipo =
                    textoSeguro(
                        dados?.tipo
                    );


                socket.join(
                    `usuario_${email}`
                );
            }
        );


        // ====================================================
        // ENTRAR NO CHAT
        // ====================================================

        socket.on(
            'chat:entrar',

            async dados => {

                try {

                    const servicoId =
                        Number(
                            dados
                                ?.servicoId
                        );


                    const email =
                        normalizarEmail(
                            dados
                                ?.email
                        );


                    if (
                        !idValido(
                            servicoId
                        )
                        ||
                        !email
                    ) {

                        return;
                    }


                    const permissao =
                        await usuarioPodeAcessarChat(
                            servicoId,
                            email
                        );


                    if (
                        !permissao.autorizado
                    ) {

                        socket.emit(
                            'chat:erro',
                            {
                                mensagem:
                                    permissao.motivo
                            }
                        );


                        return;
                    }


                    const conversa =
                        await obterOuCriarConversa(
                            servicoId
                        );


                    socket.join(
                        nomeSalaChat(
                            conversa.id
                        )
                    );


                    socket.emit(
                        'chat:entrou',
                        {
                            conversaId:
                                conversa.id,

                            servicoId
                        }
                    );

                } catch (
                    erro
                ) {

                    socket.emit(
                        'chat:erro',
                        {
                            mensagem:
                                erro.message
                        }
                    );
                }
            }
        );


        // ====================================================
        // SAIR DA SALA
        // ====================================================

        socket.on(
            'chat:sair',

            dados => {

                const conversaId =
                    Number(
                        dados
                            ?.conversaId
                    );


                if (
                    conversaId
                ) {

                    socket.leave(
                        nomeSalaChat(
                            conversaId
                        )
                    );
                }
            }
        );


        // ====================================================
        // MARCAR COMO LIDAS
        // ====================================================

        socket.on(
            'chat:marcar-lidas',

            async dados => {

                try {

                    const servicoId =
                        Number(
                            dados
                                ?.servicoId
                        );


                    const email =
                        normalizarEmail(
                            dados
                                ?.email
                        );


                    if (
                        !idValido(
                            servicoId
                        )
                        ||
                        !email
                    ) {

                        return;
                    }


                    const permissao =
                        await usuarioPodeAcessarChat(
                            servicoId,
                            email
                        );


                    if (
                        !permissao.autorizado
                    ) {

                        return;
                    }


                    const conversa =
                        await obterOuCriarConversa(
                            servicoId
                        );


                    await pool.query(
                        `
                        UPDATE mensagens_chat

                        SET
                            lida =
                                TRUE

                        WHERE
                            conversa_id =
                            $1

                        AND
                            LOWER(
                                destinatario_email
                            )
                            =
                            LOWER($2)

                        AND
                            lida =
                            FALSE
                        `,
                        [
                            conversa.id,
                            email
                        ]
                    );


                    io
                        .to(
                            nomeSalaChat(
                                conversa.id
                            )
                        )
                        .emit(
                            'chat:leitura-atualizada',
                            {
                                conversaId:
                                    conversa.id,

                                servicoId,

                                leitorEmail:
                                    email
                            }
                        );


                    io.emit(
                        'chat:conversas-atualizadas',
                        {
                            conversaId:
                                conversa.id,

                            servicoId
                        }
                    );

                } catch (
                    erro
                ) {

                    console.error(
                        'Erro leitura chat:',
                        erro
                    );
                }
            }
        );


        // ====================================================
        // SOLICITAR ATUALIZAÇÃO
        // ====================================================

        socket.on(
            'rs:solicitar-atualizacao',

            dados => {

                const payload = {

                    servicoId:
                        Number(
                            dados
                                ?.servicoId
                        ) ||
                        null,

                    atualizadoEm:
                        dataHoraAtualISO()
                };


                socket
                    .broadcast
                    .emit(
                        'atualizar_servicos',
                        payload
                    );
            }
        );


        // ====================================================
        // DESCONECTAR
        // ====================================================

        socket.on(
            'disconnect',

            motivo => {

                console.log(
                    '🔌 WebSocket desconectado:',
                    socket.id,
                    motivo
                );
            }
        );
    }
);


// ============================================================
// STATUS DO SISTEMA
// ============================================================

app.get(
    '/api/status',

    async (
        req,
        res
    ) => {

        try {

            const banco =
                await pool.query(
                    `
                    SELECT
                        NOW()
                        AS agora
                    `
                );


            return respostaSucesso(
                res,
                {
                    online:
                        true,

                    sistema:
                        'RS CONNECT',

                    versao:
                        '2.0',

                    ambiente:
                        NODE_ENV,

                    banco:
                        'PostgreSQL conectado',

                    bancoAgora:
                        banco
                            .rows[0]
                            ?.agora,

                    socket:
                        'ativo',

                    chat:
                        'ativo',

                    timezone:
                        process.env.TZ,

                    data:
                        dataHoraAtualISO()
                }
            );

        } catch (
            erro
        ) {

            return respostaErro(
                res,
                503,
                'Banco de dados indisponível.',
                {
                    online:
                        false,

                    banco:
                        'erro'
                }
            );
        }
    }
);


// ============================================================
// HEALTH CHECK SIMPLES PARA RENDER
// ============================================================

app.get(
    '/health',

    async (
        req,
        res
    ) => {

        try {

            await pool.query(
                'SELECT 1'
            );


            return res
                .status(200)
                .send(
                    'OK'
                );

        } catch {

            return res
                .status(503)
                .send(
                    'DB ERROR'
                );
        }
    }
);


// ============================================================
// INDEX.HTML
// ============================================================

app.get(
    '/',

    (
        req,
        res
    ) => {

        res.sendFile(
            path.join(
                __dirname,
                'index.html'
            )
        );
    }
);


// ============================================================
// PROTEGER ROTAS SPA / HTML
// NÃO INTERFERE COM /api
// ============================================================

app.get(
    [
        '/app',
        '/inicio'
    ],

    (
        req,
        res
    ) => {

        res.sendFile(
            path.join(
                __dirname,
                'index.html'
            )
        );
    }
);


// ============================================================
// 404 DAS ROTAS /api
// ============================================================

app.use(
    '/api',

    (
        req,
        res
    ) => {

        return respostaErro(
            res,
            404,
            `Rota não encontrada: ${req.method} ${req.originalUrl}`
        );
    }
);


// ============================================================
// ERROS
// ============================================================

app.use(
    (
        erro,
        req,
        res,
        next
    ) => {

        console.error(
            '❌ ERRO RS CONNECT:',
            erro
        );


        if (
            res.headersSent
        ) {

            return next(
                erro
            );
        }


        // ====================================================
        // MULTER
        // ====================================================

        if (
            erro instanceof
            multer.MulterError
        ) {

            if (
                erro.code ===
                'LIMIT_FILE_SIZE'
            ) {

                return respostaErro(
                    res,
                    413,
                    'O arquivo ultrapassa o limite de 10 MB.'
                );
            }


            return respostaErro(
                res,
                400,
                'Erro no envio do arquivo.'
            );
        }


        // ====================================================
        // JSON GRANDE DEMAIS
        // ====================================================

        if (
            erro?.type ===
            'entity.too.large'
        ) {

            return respostaErro(
                res,
                413,
                'A requisição ultrapassa o limite permitido.'
            );
        }


        // ====================================================
        // JSON INVÁLIDO
        // ====================================================

        if (
            erro instanceof
            SyntaxError
            &&
            erro.status ===
            400
            &&
            'body'
            in erro
        ) {

            return respostaErro(
                res,
                400,
                'JSON inválido.'
            );
        }


        return respostaErro(
            res,
            500,
            'Erro interno do RS Connect.'
        );
    }
);


// ============================================================
// TAREFAS AUTOMÁTICAS
// ============================================================

let intervaloConfirmacoes =
    null;


let intervaloSessoes =
    null;


// ============================================================
// INICIAR VERIFICAÇÃO DE CONFIRMAÇÃO
//
// A cada 60 segundos:
// - procura Titulares que não confirmaram
// - promove Reserva 1
// - depois Reserva 2
// - ou reabre a vaga
// ============================================================

function iniciarMonitorConfirmacoes() {

    if (
        intervaloConfirmacoes
    ) {

        clearInterval(
            intervaloConfirmacoes
        );
    }


    intervaloConfirmacoes =
        setInterval(
            async () => {

                try {

                    await verificarConfirmacoesExpiradas();

                } catch (
                    erro
                ) {

                    console.error(
                        'Erro monitor confirmação:',
                        erro.message
                    );
                }

            },
            60 * 1000
        );
}


// ============================================================
// LIMPEZA DE SESSÕES
// A CADA 30 MINUTOS
// ============================================================

function iniciarLimpezaSessoes() {

    if (
        intervaloSessoes
    ) {

        clearInterval(
            intervaloSessoes
        );
    }


    intervaloSessoes =
        setInterval(
            async () => {

                try {

                    await limparSessoesExpiradas();

                } catch (
                    erro
                ) {

                    console.warn(
                        'Erro limpeza sessões:',
                        erro.message
                    );
                }

            },
            30 * 60 * 1000
        );
}


// ============================================================
// SINAIS DE ENCERRAMENTO
// ============================================================

let encerrando =
    false;


async function encerrarAplicacao(
    sinal
) {

    if (
        encerrando
    ) {

        return;
    }


    encerrando =
        true;


    console.log(
        `🛑 Recebido ${sinal}. Encerrando RS Connect...`
    );


    if (
        intervaloConfirmacoes
    ) {

        clearInterval(
            intervaloConfirmacoes
        );
    }


    if (
        intervaloSessoes
    ) {

        clearInterval(
            intervaloSessoes
        );
    }


    server.close(
        async () => {

            try {

                await pool.end();

            } catch (
                erro
            ) {

                console.warn(
                    'Erro ao encerrar pool:',
                    erro.message
                );
            }


            console.log(
                '✅ RS Connect encerrado.'
            );


            process.exit(0);
        }
    );


    // Segurança caso alguma conexão
    // impeça o fechamento normal.

    setTimeout(
        () => {

            process.exit(1);

        },
        10000
    )
    .unref();
}


process.on(
    'SIGTERM',
    () =>
        encerrarAplicacao(
            'SIGTERM'
        )
);


process.on(
    'SIGINT',
    () =>
        encerrarAplicacao(
            'SIGINT'
        )
);


// ============================================================
// PROMISE NÃO TRATADA
// NÃO DERRUBA SILENCIOSAMENTE
// ============================================================

process.on(
    'unhandledRejection',

    motivo => {

        console.error(
            '❌ Promise não tratada:',
            motivo
        );
    }
);


process.on(
    'uncaughtException',

    erro => {

        console.error(
            '❌ Exceção não capturada:',
            erro
        );
    }
);


// ============================================================
// INICIALIZAÇÃO
//
// IMPORTANTE:
// • banco primeiro
// • depois tarefas
// • depois servidor
// • apenas UM server.listen()
// ============================================================

async function iniciarRSConnect() {

    try {

        console.log(
            '======================================'
        );

        console.log(
            '🚀 INICIANDO RS CONNECT'
        );

        console.log(
            `🌐 Ambiente: ${NODE_ENV}`
        );

        console.log(
            `🕒 Timezone: ${process.env.TZ}`
        );

        console.log(
            '======================================'
        );


        // ====================================================
        // BANCO
        // ====================================================

        await inicializarBancoRS();


        // ====================================================
        // PRIMEIRA VERIFICAÇÃO
        // ====================================================

        await verificarConfirmacoesExpiradas();


        // ====================================================
        // TAREFAS
        // ====================================================

        iniciarMonitorConfirmacoes();

        iniciarLimpezaSessoes();


        // ====================================================
        // SERVIDOR
        // ====================================================

        server.listen(
            PORT,
            '0.0.0.0',
            () => {

                console.log(
                    '======================================'
                );

                console.log(
                    '✅ RS CONNECT ONLINE'
                );

                console.log(
                    `🌐 Porta: ${PORT}`
                );

                console.log(
                    '💾 PostgreSQL: ativo'
                );

                console.log(
                    '🔐 Sessões: ativo'
                );

                console.log(
                    '⚡ Socket.IO: ativo'
                );

                console.log(
                    '💬 Chat: ativo'
                );

                console.log(
                    '📍 Jornada + GPS: ativo'
                );

                console.log(
                    '☕ Intervalo / retorno: ativo'
                );

                console.log(
                    '👥 Titular + 2 Reservas: ativo'
                );

                console.log(
                    '⏱ Confirmação automática: ativo'
                );

                console.log(
                    '💰 Financeiro: ativo'
                );

                console.log(
                    '📁 Arquivo Digital: ativo'
                );

                console.log(
                    '🧾 Nota Fiscal: ativo'
                );

                console.log(
                    '======================================'
                );
            }
        );

    } catch (
        erro
    ) {

        console.error(
            '❌ RS Connect não conseguiu iniciar:',
            erro
        );


        process.exit(1);
    }
}


// ============================================================
// START
// ============================================================

iniciarRSConnect();


// ============================================================
// FIM DO SERVER.JS
// ============================================================
