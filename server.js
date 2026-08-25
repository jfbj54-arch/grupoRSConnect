// ============================================================
// RS CONNECT
// SERVER.JS — PARTE 1 DE 4
//
// BASE DO SERVIDOR
// POSTGRESQL
// COMPATIBILIDADE COM BANCO ANTIGO
// SEGURANÇA
// LOGIN / CADASTRO
//
// NÃO APAGA DADOS EXISTENTES
// ============================================================

'use strict';

const express = require('express');
const http = require('http');
const path = require('path');
const crypto = require('crypto');

const { Server } = require('socket.io');
const { Pool } = require('pg');
const multer = require('multer');


// ============================================================
// CONFIGURAÇÕES
// ============================================================

process.env.TZ =
    process.env.TZ ||
    'America/Sao_Paulo';


const PORT =
    Number(
        process.env.PORT
    ) ||
    10000;


const NODE_ENV =
    process.env.NODE_ENV ||
    'production';


const MAX_UPLOAD_SIZE =
    10 * 1024 * 1024;


const SESSION_HOURS =
    12;


// ============================================================
// EXPRESS + HTTP
// ============================================================

const app =
    express();


const server =
    http.createServer(
        app
    );


// ============================================================
// SOCKET.IO
//
// APENAS UMA INICIALIZAÇÃO.
// NÃO CRIE OUTRO "io" NAS OUTRAS PARTES.
// ============================================================

const io =
    new Server(
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

                credentials:
                    true
            },

            transports: [
                'websocket',
                'polling'
            ],

            pingTimeout:
                20000,

            pingInterval:
                25000
        }
    );


// ============================================================
// UPLOAD
// ============================================================

const upload =
    multer({
        storage:
            multer.memoryStorage(),

        limits: {
            fileSize:
                MAX_UPLOAD_SIZE
        }
    });


// ============================================================
// EXPRESS
// ============================================================

app.disable(
    'x-powered-by'
);


app.use(
    express.json({
        limit:
            '15mb'
    })
);


app.use(
    express.urlencoded({
        limit:
            '15mb',

        extended:
            true
    })
);


// ============================================================
// HEADERS BÁSICOS DE SEGURANÇA
// ============================================================

app.use(
    (
        req,
        res,
        next
    ) => {

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
// LOG HTTP
// ============================================================

app.use(
    (
        req,
        res,
        next
    ) => {

        const inicio =
            Date.now();


        res.on(
            'finish',
            () => {

                console.log(
                    `[HTTP] ${req.method} ${req.originalUrl} ${res.statusCode} ${Date.now() - inicio}ms`
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
            index:
                false,

            etag:
                true,

            maxAge:
                NODE_ENV ===
                'production'
                    ?
                    '5m'
                    :
                    0
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
                ?
                {
                    rejectUnauthorized:
                        false
                }
                :
                false,

        max:
            10,

        idleTimeoutMillis:
            30000,

        connectionTimeoutMillis:
            15000
    });


pool.on(
    'error',
    erro => {

        console.error(
            '❌ Erro PostgreSQL:',
            erro
        );
    }
);


// ============================================================
// UTILITÁRIOS
// ============================================================

function normalizarEmail(
    email
) {

    return String(
        email ||
        ''
    )
        .trim()
        .toLowerCase();
}


function textoSeguro(
    valor
) {

    return String(
        valor ??
        ''
    ).trim();
}


function emailValido(
    email
) {

    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/
        .test(
            normalizarEmail(
                email
            )
        );
}


function idValido(
    valor
) {

    const id =
        Number(
            valor
        );


    return (
        Number.isInteger(
            id
        )
        &&
        id > 0
    );
}


function numeroRS(
    valor
) {

    if (
        typeof valor ===
        'number'
    ) {

        return Number.isFinite(
            valor
        )
            ?
            valor
            :
            0;
    }


    let valorTexto =
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
        valorTexto.includes(
            ','
        )
    ) {

        valorTexto =
            valorTexto
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
        Number(
            valorTexto
        );


    return Number.isFinite(
        numero
    )
        ?
        numero
        :
        0;
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


function parseReservas(
    valor
) {

    if (
        Array.isArray(
            valor
        )
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
            ?
            parsed
            :
            [];

    } catch {

        return [];
    }
}


// ============================================================
// RESPOSTAS
// ============================================================

function respostaErro(
    res,
    status,
    mensagem,
    extra = {}
) {

    return res
        .status(
            status
        )
        .json({
            sucesso:
                false,

            erro:
                mensagem,

            ...extra
        });
}


function respostaSucesso(
    res,
    dados = {}
) {

    return res.json({
        sucesso:
            true,

        ...dados
    });
}


// ============================================================
// SENHAS
//
// USUÁRIOS ANTIGOS:
// senha simples continua funcionando.
//
// DEPOIS DO PRIMEIRO LOGIN:
// senha é convertida automaticamente para PBKDF2.
// ============================================================

const PASSWORD_PREFIX =
    'pbkdf2';


const PASSWORD_ITERATIONS =
    120000;


const PASSWORD_KEY_LENGTH =
    64;


const PASSWORD_DIGEST =
    'sha512';


function senhaJaProtegida(
    senha
) {

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
            .randomBytes(
                16
            )
            .toString(
                'hex'
            );


    const hash =
        crypto
            .pbkdf2Sync(
                String(
                    senha
                ),
                salt,
                PASSWORD_ITERATIONS,
                PASSWORD_KEY_LENGTH,
                PASSWORD_DIGEST
            )
            .toString(
                'hex'
            );


    return [
        PASSWORD_PREFIX,
        PASSWORD_ITERATIONS,
        salt,
        hash
    ].join(
        '$'
    );
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


    // BANCO ANTIGO

    if (
        !senhaJaProtegida(
            salva
        )
    ) {

        return (
            String(
                senhaDigitada
            )
            ===
            salva
        );
    }


    try {

        const partes =
            salva.split(
                '$'
            );


        if (
            partes.length !==
            4
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
                .toString(
                    'hex'
                );


        const esperado =
            Buffer.from(
                hashEsperado,
                'hex'
            );


        const digitado =
            Buffer.from(
                hashDigitado,
                'hex'
            );


        if (
            esperado.length !==
            digitado.length
        ) {

            return false;
        }


        return crypto
            .timingSafeEqual(
                esperado,
                digitado
            );

    } catch {

        return false;
    }
}


// ============================================================
// TOKEN
// ============================================================

function gerarTokenSessao() {

    return crypto
        .randomBytes(
            48
        )
        .toString(
            'hex'
        );
}


function gerarHashToken(
    token
) {

    return crypto
        .createHash(
            'sha256'
        )
        .update(
            String(
                token
            )
        )
        .digest(
            'hex'
        );
}


function calcularExpiracaoSessao() {

    return new Date(
        Date.now()
        +
        SESSION_HOURS
        *
        60
        *
        60
        *
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

            WHERE
                LOWER(email) =
                LOWER($1)

            LIMIT 1
            `,
            [
                normalizarEmail(
                    email
                )
            ]
        );


    return resultado
        .rows[0]
        ||
        null;
}


// ============================================================
// USUÁRIO SEM SENHA
// ============================================================

function usuarioPublico(
    usuario
) {

    if (!usuario) {

        return null;
    }


    const {
        senha,
        ...dados
    } =
        usuario;


    return dados;
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
        .rows[0]
        ||
        null;
}


// ============================================================
// COMPATIBILIDADE EMPRESA ANTIGA
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
            email:
                '',

            nome:
                ''
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


    if (
        email &&
        !nome
    ) {

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


    // --------------------------------------------------------
    // TENTAR IDS ANTIGOS
    // --------------------------------------------------------

    if (!email) {

        const ids =
            [
                servico.empresa_id,
                servico.empresaId,
                servico.cliente_id,
                servico.clienteId,
                servico.usuario_empresa_id,
                servico.usuarioEmpresaId
            ]
                .map(
                    Number
                )
                .filter(
                    id =>
                        Number.isInteger(
                            id
                        )
                        &&
                        id > 0
                );


        for (
            const empresaId
            of ids
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
                            .nome
                        ||
                        nome;


                    break;
                }

            } catch {}
        }
    }


    // --------------------------------------------------------
    // TENTAR NOME
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
                        .nome
                    ||
                    nome;
            }

        } catch {}
    }


    // --------------------------------------------------------
    // SALVAR COMPATIBILIDADE NO SERVIÇO
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
                `⚠️ Compatibilidade empresa serviço #${servico.id}:`,
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

        servico?.valor_liquido ??

        0
    );
}


// ============================================================
// NORMALIZAR SERVIÇO
// ============================================================

async function normalizarServicoSaida(
    servico
) {

    const empresa =
        await resolverEmpresaDoServico(
            servico
        );


    const valor =
        valorServicoCompat(
            servico
        );


    let data =
        textoSeguro(
            servico.data
        );


    let horarioInicio =
        textoSeguro(
            servico.horario_inicio
        );


    const dataHorario =
        textoSeguro(
            servico.data_horario
        );


    if (
        dataHorario.includes(
            'T'
        )
    ) {

        const partes =
            dataHorario.split(
                'T'
            );


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
                ?
                numeroRS(
                    servico.valor
                )
                :
                valor,

        valor_diaria:
            numeroRS(
                servico.valor_diaria
            ) > 0
                ?
                numeroRS(
                    servico.valor_diaria
                )
                :
                valor
    };
}


// ============================================================
// PERMISSÕES
// ============================================================

function prestadorEhTitular(
    servico,
    email
) {

    return (
        normalizarEmail(
            servico?.prestador_email
        )
        ===
        normalizarEmail(
            email
        )
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
        empresa.email
        ===
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
                )
                ||
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

        console.warn(
            'Auditoria:',
            erro.message
        );
    }
}


// ============================================================
// LEDGER
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
                $1,$2,$3,$4
            )
            `,
            [
                Number(
                    servicoId
                ),

                normalizarEmail(
                    email
                )
                ||
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

        console.warn(
            'Ledger:',
            erro.message
        );
    }
}


// ============================================================
// ATUALIZAÇÃO TEMPO REAL
// ============================================================

function emitirAtualizacao(
    servicoId = null,
    tipo = 'servico'
) {

    const payload = {
        servicoId,
        tipo,

        atualizadoEm:
            dataHoraAtualISO()
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
// BANCO
//
// MUITO IMPORTANTE:
//
// 1. CRIA TABELAS SE NÃO EXISTIREM
// 2. GARANTE COLUNAS ANTIGAS
// 3. SÓ DEPOIS CRIA ÍNDICES
//
// ISSO CORRIGE O ERRO:
// column "conversa_id" does not exist
// ============================================================

async function criarTabelas() {

    console.log(
        '🔧 Verificando estrutura do banco...'
    );


    // ========================================================
    // USUÁRIOS
    // ========================================================

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


    // ========================================================
    // PRESTADORES
    // ========================================================

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


    // ========================================================
    // SERVIÇOS
    // ========================================================

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


    // ========================================================
    // AUDITORIA
    // ========================================================

    await pool.query(`
        CREATE TABLE IF NOT EXISTS auditoria_sistema (

            id SERIAL PRIMARY KEY,

            usuario_email TEXT,

            acao TEXT,

            detalhes TEXT,

            criado_em TIMESTAMP
                DEFAULT CURRENT_TIMESTAMP
        );
    `);


    // ========================================================
    // LEDGER
    // ========================================================

    await pool.query(`
        CREATE TABLE IF NOT EXISTS ledger_transacoes (

            id SERIAL PRIMARY KEY,

            servico_id INTEGER,

            usuario_email TEXT,

            usuario_id INTEGER,

            tipo TEXT,

            tipo_movimento TEXT,

            valor NUMERIC(12,2)
                DEFAULT 0,

            status TEXT
                DEFAULT 'PROCESSADO',

            criado_em TIMESTAMP
                DEFAULT CURRENT_TIMESTAMP
        );
    `);


    // ========================================================
    // PAGAMENTOS
    // ========================================================

    await pool.query(`
        CREATE TABLE IF NOT EXISTS pagamentos (

            id SERIAL PRIMARY KEY,

            servico_id INTEGER,

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


    // ========================================================
    // DOCUMENTOS
    // ========================================================

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


    // ========================================================
    // CONVERSAS
    // ========================================================

    await pool.query(`
        CREATE TABLE IF NOT EXISTS conversas (

            id SERIAL PRIMARY KEY,

            servico_id INTEGER,

            empresa_email TEXT,

            prestador_email TEXT,

            criado_em TIMESTAMP
                DEFAULT CURRENT_TIMESTAMP,

            atualizado_em TIMESTAMP
                DEFAULT CURRENT_TIMESTAMP,

            ativo BOOLEAN
                DEFAULT TRUE
        );
    `);


    // ========================================================
    // MENSAGENS
    //
    // NÃO COLOCAMOS FOREIGN KEY AGORA,
    // PARA NÃO QUEBRAR TABELA ANTIGA.
    // ========================================================

    await pool.query(`
        CREATE TABLE IF NOT EXISTS mensagens_chat (

            id SERIAL PRIMARY KEY,

            conversa_id INTEGER,

            servico_id INTEGER,

            remetente_email TEXT,

            destinatario_email TEXT,

            mensagem TEXT,

            tipo TEXT
                DEFAULT 'texto',

            lida BOOLEAN
                DEFAULT FALSE,

            criado_em TIMESTAMP
                DEFAULT CURRENT_TIMESTAMP
        );
    `);


    // ========================================================
    // SESSÕES
    // ========================================================

    await pool.query(`
        CREATE TABLE IF NOT EXISTS sessoes_rs (

            id SERIAL PRIMARY KEY,

            usuario_id INTEGER,

            usuario_email TEXT,

            token_hash TEXT,

            criado_em TIMESTAMP
                DEFAULT CURRENT_TIMESTAMP,

            expira_em TIMESTAMP,

            ultimo_acesso TIMESTAMP
                DEFAULT CURRENT_TIMESTAMP,

            revogada BOOLEAN
                DEFAULT FALSE
        );
    `);


    // ========================================================
    // HISTÓRICO DE ESCALA
    // ========================================================

    await pool.query(`
        CREATE TABLE IF NOT EXISTS historico_escalas (

            id SERIAL PRIMARY KEY,

            servico_id INTEGER,

            trabalhador_email TEXT,

            tipo TEXT,

            origem TEXT,

            destino TEXT,

            motivo TEXT,

            criado_em TIMESTAMP
                DEFAULT CURRENT_TIMESTAMP
        );
    `);


    // ========================================================
    // COMPATIBILIDADE DAS COLUNAS
    //
    // ISSO É EXECUTADO ANTES DOS ÍNDICES.
    // ========================================================

    const alteracoes = [

        // ====================================================
        // USUÁRIOS
        // ====================================================

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


        // ====================================================
        // SERVIÇOS
        // ====================================================

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

        `
        ALTER TABLE servicos
        ADD COLUMN IF NOT EXISTS recorrencia TEXT
        DEFAULT 'unico'
        `,

        `
        ALTER TABLE servicos
        ADD COLUMN IF NOT EXISTS motivo_cancelamento TEXT
        `,

        `
        ALTER TABLE servicos
        ADD COLUMN IF NOT EXISTS cancelado_em TIMESTAMP
        `,

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

        `
        ALTER TABLE servicos
        ADD COLUMN IF NOT EXISTS validado_empresa BOOLEAN
        DEFAULT FALSE
        `,

        `
        ALTER TABLE servicos
        ADD COLUMN IF NOT EXISTS validado_em TIMESTAMP
        `,

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

        `
        ALTER TABLE servicos
        ADD COLUMN IF NOT EXISTS criado_em TIMESTAMP
        DEFAULT CURRENT_TIMESTAMP
        `,

        `
        ALTER TABLE servicos
        ADD COLUMN IF NOT EXISTS atualizado_em TIMESTAMP
        DEFAULT CURRENT_TIMESTAMP
        `,


        // ====================================================
        // CONVERSAS — BANCO ANTIGO
        // ====================================================

        `
        ALTER TABLE conversas
        ADD COLUMN IF NOT EXISTS servico_id INTEGER
        `,

        `
        ALTER TABLE conversas
        ADD COLUMN IF NOT EXISTS empresa_email TEXT
        `,

        `
        ALTER TABLE conversas
        ADD COLUMN IF NOT EXISTS prestador_email TEXT
        `,

        `
        ALTER TABLE conversas
        ADD COLUMN IF NOT EXISTS criado_em TIMESTAMP
        DEFAULT CURRENT_TIMESTAMP
        `,

        `
        ALTER TABLE conversas
        ADD COLUMN IF NOT EXISTS atualizado_em TIMESTAMP
        DEFAULT CURRENT_TIMESTAMP
        `,

        `
        ALTER TABLE conversas
        ADD COLUMN IF NOT EXISTS ativo BOOLEAN
        DEFAULT TRUE
        `,


        // ====================================================
        // MENSAGENS — CORREÇÃO DO ERRO conversa_id
        // ====================================================

        `
        ALTER TABLE mensagens_chat
        ADD COLUMN IF NOT EXISTS conversa_id INTEGER
        `,

        `
        ALTER TABLE mensagens_chat
        ADD COLUMN IF NOT EXISTS servico_id INTEGER
        `,

        `
        ALTER TABLE mensagens_chat
        ADD COLUMN IF NOT EXISTS remetente_email TEXT
        `,

        `
        ALTER TABLE mensagens_chat
        ADD COLUMN IF NOT EXISTS destinatario_email TEXT
        `,

        `
        ALTER TABLE mensagens_chat
        ADD COLUMN IF NOT EXISTS mensagem TEXT
        `,

        `
        ALTER TABLE mensagens_chat
        ADD COLUMN IF NOT EXISTS tipo TEXT
        DEFAULT 'texto'
        `,

        `
        ALTER TABLE mensagens_chat
        ADD COLUMN IF NOT EXISTS lida BOOLEAN
        DEFAULT FALSE
        `,

        `
        ALTER TABLE mensagens_chat
        ADD COLUMN IF NOT EXISTS criado_em TIMESTAMP
        DEFAULT CURRENT_TIMESTAMP
        `,


        // ====================================================
        // PAGAMENTOS ANTIGOS
        // ====================================================

        `
        ALTER TABLE pagamentos
        ADD COLUMN IF NOT EXISTS servico_id INTEGER
        `,

        `
        ALTER TABLE pagamentos
        ADD COLUMN IF NOT EXISTS empresa_email TEXT
        `,

        `
        ALTER TABLE pagamentos
        ADD COLUMN IF NOT EXISTS prestador_email TEXT
        `,

        `
        ALTER TABLE pagamentos
        ADD COLUMN IF NOT EXISTS valor NUMERIC(12,2)
        DEFAULT 0
        `,

        `
        ALTER TABLE pagamentos
        ADD COLUMN IF NOT EXISTS forma_pagamento TEXT
        `,

        `
        ALTER TABLE pagamentos
        ADD COLUMN IF NOT EXISTS status TEXT
        DEFAULT 'PENDENTE'
        `,

        `
        ALTER TABLE pagamentos
        ADD COLUMN IF NOT EXISTS comprovante TEXT
        `,

        `
        ALTER TABLE pagamentos
        ADD COLUMN IF NOT EXISTS autorizado_em TIMESTAMP
        `,

        `
        ALTER TABLE pagamentos
        ADD COLUMN IF NOT EXISTS pago_em TIMESTAMP
        `,

        `
        ALTER TABLE pagamentos
        ADD COLUMN IF NOT EXISTS criado_em TIMESTAMP
        DEFAULT CURRENT_TIMESTAMP
        `,

        `
        ALTER TABLE pagamentos
        ADD COLUMN IF NOT EXISTS atualizado_em TIMESTAMP
        DEFAULT CURRENT_TIMESTAMP
        `,


        // ====================================================
        // DOCUMENTOS ANTIGOS
        // ====================================================

        `
        ALTER TABLE documentos_rs
        ADD COLUMN IF NOT EXISTS servico_id INTEGER
        `,

        `
        ALTER TABLE documentos_rs
        ADD COLUMN IF NOT EXISTS empresa_email TEXT
        `,

        `
        ALTER TABLE documentos_rs
        ADD COLUMN IF NOT EXISTS prestador_email TEXT
        `,

        `
        ALTER TABLE documentos_rs
        ADD COLUMN IF NOT EXISTS categoria TEXT
        `,

        `
        ALTER TABLE documentos_rs
        ADD COLUMN IF NOT EXISTS nome TEXT
        `,

        `
        ALTER TABLE documentos_rs
        ADD COLUMN IF NOT EXISTS arquivo TEXT
        `,

        `
        ALTER TABLE documentos_rs
        ADD COLUMN IF NOT EXISTS criado_em TIMESTAMP
        DEFAULT CURRENT_TIMESTAMP
        `,


        // ====================================================
        // AUDITORIA ANTIGA
        // ====================================================

        `
        ALTER TABLE auditoria_sistema
        ADD COLUMN IF NOT EXISTS usuario_email TEXT
        `,

        `
        ALTER TABLE auditoria_sistema
        ADD COLUMN IF NOT EXISTS acao TEXT
        `,

        `
        ALTER TABLE auditoria_sistema
        ADD COLUMN IF NOT EXISTS detalhes TEXT
        `,

        `
        ALTER TABLE auditoria_sistema
        ADD COLUMN IF NOT EXISTS criado_em TIMESTAMP
        DEFAULT CURRENT_TIMESTAMP
        `,


        // ====================================================
        // LEDGER ANTIGO
        // ====================================================

        `
        ALTER TABLE ledger_transacoes
        ADD COLUMN IF NOT EXISTS servico_id INTEGER
        `,

        `
        ALTER TABLE ledger_transacoes
        ADD COLUMN IF NOT EXISTS usuario_email TEXT
        `,

        `
        ALTER TABLE ledger_transacoes
        ADD COLUMN IF NOT EXISTS usuario_id INTEGER
        `,

        `
        ALTER TABLE ledger_transacoes
        ADD COLUMN IF NOT EXISTS tipo TEXT
        `,

        `
        ALTER TABLE ledger_transacoes
        ADD COLUMN IF NOT EXISTS tipo_movimento TEXT
        `,

        `
        ALTER TABLE ledger_transacoes
        ADD COLUMN IF NOT EXISTS valor NUMERIC(12,2)
        DEFAULT 0
        `,

        `
        ALTER TABLE ledger_transacoes
        ADD COLUMN IF NOT EXISTS status TEXT
        DEFAULT 'PROCESSADO'
        `,

        `
        ALTER TABLE ledger_transacoes
        ADD COLUMN IF NOT EXISTS criado_em TIMESTAMP
        DEFAULT CURRENT_TIMESTAMP
        `,


        // ====================================================
        // SESSÕES
        // ====================================================

        `
        ALTER TABLE sessoes_rs
        ADD COLUMN IF NOT EXISTS usuario_id INTEGER
        `,

        `
        ALTER TABLE sessoes_rs
        ADD COLUMN IF NOT EXISTS usuario_email TEXT
        `,

        `
        ALTER TABLE sessoes_rs
        ADD COLUMN IF NOT EXISTS token_hash TEXT
        `,

        `
        ALTER TABLE sessoes_rs
        ADD COLUMN IF NOT EXISTS criado_em TIMESTAMP
        DEFAULT CURRENT_TIMESTAMP
        `,

        `
        ALTER TABLE sessoes_rs
        ADD COLUMN IF NOT EXISTS expira_em TIMESTAMP
        `,

        `
        ALTER TABLE sessoes_rs
        ADD COLUMN IF NOT EXISTS ultimo_acesso TIMESTAMP
        DEFAULT CURRENT_TIMESTAMP
        `,

        `
        ALTER TABLE sessoes_rs
        ADD COLUMN IF NOT EXISTS revogada BOOLEAN
        DEFAULT FALSE
        `
    ];


    // ========================================================
    // EXECUTAR ALTERAÇÕES
    // ========================================================

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
                '⚠️ Compatibilidade de coluna:',
                erro.message
            );
        }
    }


    // ========================================================
    // ÍNDICES
    //
    // AGORA SÃO CRIADOS DEPOIS DAS COLUNAS.
    //
    // E SE UM ÍNDICE DER PROBLEMA,
    // O SERVIDOR CONTINUA SUBINDO.
    // ========================================================

    const indices = [

        `
        CREATE INDEX IF NOT EXISTS
            idx_usuarios_email_lower
        ON usuarios (
            LOWER(email)
        )
        `,

        `
        CREATE INDEX IF NOT EXISTS
            idx_servicos_empresa
        ON servicos (
            empresa_email
        )
        `,

        `
        CREATE INDEX IF NOT EXISTS
            idx_servicos_prestador
        ON servicos (
            prestador_email
        )
        `,

        `
        CREATE INDEX IF NOT EXISTS
            idx_servicos_status
        ON servicos (
            status
        )
        `,

        `
        CREATE INDEX IF NOT EXISTS
            idx_servicos_data
        ON servicos (
            data
        )
        `,

        `
        CREATE INDEX IF NOT EXISTS
            idx_documentos_empresa
        ON documentos_rs (
            empresa_email
        )
        `,

        `
        CREATE INDEX IF NOT EXISTS
            idx_documentos_prestador
        ON documentos_rs (
            prestador_email
        )
        `,

        `
        CREATE INDEX IF NOT EXISTS
            idx_documentos_servico
        ON documentos_rs (
            servico_id
        )
        `,

        `
        CREATE INDEX IF NOT EXISTS
            idx_conversas_servico
        ON conversas (
            servico_id
        )
        `,

        `
        CREATE INDEX IF NOT EXISTS
            idx_conversas_empresa
        ON conversas (
            empresa_email
        )
        `,

        `
        CREATE INDEX IF NOT EXISTS
            idx_conversas_prestador
        ON conversas (
            prestador_email
        )
        `,

        `
        CREATE INDEX IF NOT EXISTS
            idx_chat_conversa
        ON mensagens_chat (
            conversa_id
        )
        `,

        `
        CREATE INDEX IF NOT EXISTS
            idx_chat_servico
        ON mensagens_chat (
            servico_id
        )
        `,

        `
        CREATE INDEX IF NOT EXISTS
            idx_chat_destinatario_lida
        ON mensagens_chat (
            destinatario_email,
            lida
        )
        `,

        `
        CREATE INDEX IF NOT EXISTS
            idx_pagamentos_servico
        ON pagamentos (
            servico_id
        )
        `,

        `
        CREATE INDEX IF NOT EXISTS
            idx_pagamentos_prestador
        ON pagamentos (
            prestador_email
        )
        `,

        `
        CREATE INDEX IF NOT EXISTS
            idx_pagamentos_empresa
        ON pagamentos (
            empresa_email
        )
        `,

        `
        CREATE INDEX IF NOT EXISTS
            idx_auditoria_email
        ON auditoria_sistema (
            usuario_email
        )
        `,

        `
        CREATE INDEX IF NOT EXISTS
            idx_auditoria_data
        ON auditoria_sistema (
            criado_em
        )
        `,

        `
        CREATE INDEX IF NOT EXISTS
            idx_sessoes_email
        ON sessoes_rs (
            usuario_email
        )
        `,

        `
        CREATE INDEX IF NOT EXISTS
            idx_sessoes_token
        ON sessoes_rs (
            token_hash
        )
        `,

        `
        CREATE INDEX IF NOT EXISTS
            idx_historico_escalas_servico
        ON historico_escalas (
            servico_id
        )
        `
    ];


    for (
        const sql
        of indices
    ) {

        try {

            await pool.query(
                sql
            );

        } catch (
            erro
        ) {

            console.warn(
                '⚠️ Índice não criado:',
                erro.message
            );
        }
    }


    console.log(
        '✅ Estrutura do banco verificada.'
    );


    console.log(
        '✅ Compatibilidade com banco antigo aplicada.'
    );


    console.log(
        '✅ Cadastros existentes preservados.'
    );
}


// ============================================================
// BANCO ONLINE
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
// SESSÕES
// ============================================================

async function limparSessoesExpiradas() {

    try {

        await pool.query(
            `
            DELETE FROM sessoes_rs

            WHERE
                (
                    expira_em
                    IS NOT NULL

                    AND

                    expira_em <
                    CURRENT_TIMESTAMP
                )

            OR
                revogada =
                TRUE
            `
        );

    } catch (
        erro
    ) {

        console.warn(
            'Sessões:',
            erro.message
        );
    }
}


async function criarSessaoUsuario(
    usuario
) {

    const token =
        gerarTokenSessao();


    const tokenHash =
        gerarHashToken(
            token
        );


    const expiraEm =
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
            $1,$2,$3,$4
        )
        `,
        [
            usuario.id ||
            null,

            normalizarEmail(
                usuario.email
            ),

            tokenHash,

            expiraEm
        ]
    );


    return {
        token,

        expiraEm:
            expiraEm.toISOString()
    };
}


function extrairBearerToken(
    req
) {

    const authorization =
        String(
            req.headers.authorization ||
            ''
        );


    if (
        !authorization
            .toLowerCase()
            .startsWith(
                'bearer '
            )
    ) {

        return '';
    }


    return authorization
        .slice(
            7
        )
        .trim();
}


async function buscarSessaoPorToken(
    token
) {

    if (!token) {

        return null;
    }


    const hash =
        gerarHashToken(
            token
        );


    const resultado =
        await pool.query(
            `
            SELECT *
            FROM sessoes_rs

            WHERE
                token_hash =
                $1

            AND
                COALESCE(
                    revogada,
                    FALSE
                )
                =
                FALSE

            AND
                (
                    expira_em
                    IS NULL

                    OR

                    expira_em >
                    CURRENT_TIMESTAMP
                )

            LIMIT 1
            `,
            [
                hash
            ]
        );


    return resultado
        .rows[0]
        ||
        null;
}


// ============================================================
// AUTENTICAÇÃO OPCIONAL
//
// MANTÉM COMPATIBILIDADE COM O INDEX ANTIGO,
// MAS JÁ ACEITA TOKEN.
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


        req.sessaoRS =
            sessao;


        if (
            sessao?.id
        ) {

            try {

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

            } catch {}
        }


        next();

    } catch (
        erro
    ) {

        console.warn(
            'Autenticação:',
            erro.message
        );


        req.sessaoRS =
            null;


        next();
    }
}


app.use(
    autenticarOpcional
);


// ============================================================
// RATE LIMIT SIMPLES LOGIN
// ============================================================

const tentativasLogin =
    new Map();


function chaveTentativaLogin(
    req,
    email
) {

    return `${req.ip}|${normalizarEmail(email)}`;
}


function podeTentarLogin(
    req,
    email
) {

    const chave =
        chaveTentativaLogin(
            req,
            email
        );


    const agora =
        Date.now();


    const janela =
        15 *
        60 *
        1000;


    const max =
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


        tentativasLogin.set(
            chave,
            registro
        );
    }


    return (
        registro.tentativas <
        max
    );
}


function registrarFalhaLogin(
    req,
    email
) {

    const chave =
        chaveTentativaLogin(
            req,
            email
        );


    const atual =
        tentativasLogin.get(
            chave
        )
        ||
        {
            inicio:
                Date.now(),

            tentativas:
                0
        };


    atual.tentativas++;


    tentativasLogin.set(
        chave,
        atual
    );
}


function limparFalhasLogin(
    req,
    email
) {

    tentativasLogin.delete(
        chaveTentativaLogin(
            req,
            email
        )
    );
}


// ============================================================
// CADASTRO
// ============================================================

async function cadastrarUsuarioHandler(
    req,
    res
) {

    try {

        const d =
            req.body ||
            {};


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
            senha.length <
            6
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

                VALUES (
                    $1
                )

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
            `Novo usuário ${tipo} cadastrado.`
        );


        return respostaSucesso(
            res,
            {
                mensagem:
                    'Cadastro realizado com sucesso.',

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
            'Cadastro:',
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
            !podeTentarLogin(
                req,
                email
            )
        ) {

            return respostaErro(
                res,
                429,
                'Muitas tentativas. Aguarde alguns minutos.'
            );
        }


        const usuario =
            await buscarUsuarioPorEmail(
                email
            );


        if (
            !usuario ||
            !compararSenha(
                senha,
                usuario.senha
            )
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


        limparFalhasLogin(
            req,
            email
        );


        // ----------------------------------------------------
        // MIGRAR SENHA ANTIGA
        // ----------------------------------------------------

        if (
            !senhaJaProtegida(
                usuario.senha
            )
        ) {

            try {

                await pool.query(
                    `
                    UPDATE usuarios

                    SET
                        senha =
                            $1,

                        atualizado_em =
                            CURRENT_TIMESTAMP

                    WHERE id =
                        $2
                    `,
                    [
                        gerarHashSenha(
                            senha
                        ),

                        usuario.id
                    ]
                );


                console.log(
                    `🔐 Senha antiga protegida: ${email}`
                );

            } catch (
                erro
            ) {

                console.warn(
                    'Migração de senha:',
                    erro.message
                );
            }
        }


        await limparSessoesExpiradas();


        const sessao =
            await criarSessaoUsuario(
                usuario
            );


        await registrarAuditoria(
            email,
            'LOGIN',
            'Login realizado.'
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
            'Login:',
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
// TODAS AS ROTAS DE LOGIN
//
// CORRIGE:
// Cannot POST /login
// ============================================================

app.post(
    '/login',
    loginHandler
);


app.post(
    '/api/login',
    loginHandler
);


app.post(
    '/api/auth/login',
    loginHandler
);


// ============================================================
// TODAS AS ROTAS DE CADASTRO
// ============================================================

app.post(
    '/cadastro',
    cadastrarUsuarioHandler
);


app.post(
    '/api/cadastro',
    cadastrarUsuarioHandler
);


app.post(
    '/api/auth/registrar',
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
                    'Usuário não encontrado.'
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

                await pool.query(
                    `
                    UPDATE sessoes_rs

                    SET
                        revogada =
                            TRUE

                    WHERE
                        token_hash =
                        $1
                    `,
                    [
                        gerarHashToken(
                            token
                        )
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
                'Erro ao sair.'
            );
        }
    }
);


// ============================================================
// PERFIL
// ============================================================

app.get(
    '/api/usuarios/:email',

    async (
        req,
        res
    ) => {

        try {

            const usuario =
                await buscarUsuarioPorEmail(
                    req.params.email
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

            return respostaErro(
                res,
                500,
                'Erro ao carregar usuário.'
            );
        }
    }
);


// ============================================================
// INICIALIZAÇÃO DO BANCO
//
// server.listen SOMENTE NA PARTE 4.
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
//
// COLE A PARTE 2 LOGO ABAIXO.
// NÃO COLOQUE server.listen AQUI.
// ============================================================
// ============================================================
// RS CONNECT
// SERVER.JS — PARTE 2 DE 4
//
// SERVIÇOS
// TITULAR + 2 RESERVAS
// EDIÇÃO
// CANCELAMENTO
// CONTRATO
// CONFIRMAÇÃO
// SUBSTITUIÇÃO AUTOMÁTICA
// ============================================================


// ============================================================
// RESERVAS
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
// SERVIÇO COMPATÍVEL COM INDEX
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
// DADOS DO PRESTADOR
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
// HISTÓRICO DE ESCALA
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
            'Histórico de escala:',
            erro.message
        );
    }
}


// ============================================================
// PRESTADOR JÁ ESTÁ NA VAGA?
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


    return reservaContemEmail(
        obterReservasServico(
            servico
        ),
        procurado
    );
}


// ============================================================
// PROMOVER RESERVA 1
//
// TITULAR SAI / NÃO CONFIRMA
// → Reserva 1 vira Titular
// → Reserva 2 vira Reserva 1
// → Reserva 2 fica disponível
// ============================================================

async function promoverPrimeiraReserva(
    servico,
    motivo = 'SUBSTITUICAO'
) {

    if (!servico) {

        return {
            promoveu:
                false
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
    // SEM RESERVA
    // ========================================================

    if (!novoTitular) {

        await pool.query(
            `
            UPDATE servicos

            SET
                prestador_email =
                    NULL,

                prestador_id =
                    NULL,

                prestador_nome =
                    NULL,

                prestador_pix =
                    NULL,

                prestador_whatsapp =
                    NULL,

                reservas =
                    '[]'::jsonb,

                contrato_assinado =
                    NULL,

                contrato_assinado_em =
                    NULL,

                contrato_aceito =
                    FALSE,

                contrato_aceito_em =
                    NULL,

                presenca_confirmada =
                    FALSE,

                presenca_hora =
                    NULL,

                presenca_latitude =
                    NULL,

                presenca_longitude =
                    NULL,

                presenca_precisao =
                    NULL,

                selfie_confirmacao =
                    NULL,

                confirmacao_expirada =
                    TRUE,

                confirmado_em =
                    NULL,

                substituido_em =
                    CURRENT_TIMESTAMP,

                motivo_substituicao =
                    $1,

                checkin_hora =
                    NULL,

                checkin_foto =
                    NULL,

                checkin_latitude =
                    NULL,

                checkin_longitude =
                    NULL,

                intervalo_inicio =
                    NULL,

                intervalo_fim =
                    NULL,

                intervalo_retorno =
                    NULL,

                em_intervalo =
                    FALSE,

                checkout_hora =
                    NULL,

                checkout_foto =
                    NULL,

                checkout_latitude =
                    NULL,

                checkout_longitude =
                    NULL,

                validado_empresa =
                    FALSE,

                validado_em =
                    NULL,

                pagamento_autorizado =
                    FALSE,

                pagamento_autorizado_em =
                    NULL,

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
                'TITULAR',

            destino:
                'VAGA_ABERTA',

            motivo
        });


        await registrarAuditoria(
            antigoTitular ||
            'sistema',

            'VAGA_REABERTA',

            `Serviço #${servico.id}: Titular removido. Nenhuma Reserva disponível. Motivo: ${motivo}.`
        );


        emitirAtualizacao(
            servico.id,
            'substituicao'
        );


        return {
            promoveu:
                false,

            vagaAberta:
                true
        };
    }


    const usuarioNovo =
        await buscarUsuarioPorEmail(
            novoTitular.email
        );


    // ========================================================
    // PROMOVER RESERVA 1
    // ========================================================

    await pool.query(
        `
        UPDATE servicos

        SET
            prestador_email =
                $1,

            prestador_id =
                $2,

            prestador_nome =
                $3,

            prestador_whatsapp =
                $4,

            prestador_pix =
                $5,

            reservas =
                $6::jsonb,

            contrato_assinado =
                NULL,

            contrato_assinado_em =
                NULL,

            contrato_aceito =
                FALSE,

            contrato_aceito_em =
                NULL,

            presenca_confirmada =
                FALSE,

            presenca_hora =
                NULL,

            presenca_latitude =
                NULL,

            presenca_longitude =
                NULL,

            presenca_precisao =
                NULL,

            selfie_confirmacao =
                NULL,

            confirmacao_expirada =
                FALSE,

            confirmado_em =
                NULL,

            substituido_em =
                CURRENT_TIMESTAMP,

            motivo_substituicao =
                $7,

            checkin_hora =
                NULL,

            checkin_foto =
                NULL,

            checkin_latitude =
                NULL,

            checkin_longitude =
                NULL,

            intervalo_inicio =
                NULL,

            intervalo_fim =
                NULL,

            intervalo_retorno =
                NULL,

            em_intervalo =
                FALSE,

            checkout_hora =
                NULL,

            checkout_foto =
                NULL,

            checkout_latitude =
                NULL,

            checkout_longitude =
                NULL,

            validado_empresa =
                FALSE,

            validado_em =
                NULL,

            pagamento_autorizado =
                FALSE,

            pagamento_autorizado_em =
                NULL,

            pagamento_realizado =
                FALSE,

            pagamento_realizado_em =
                NULL,

            comprovante_pagamento =
                FALSE,

            comprovante_pagamento_arquivo =
                NULL,

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

        `Serviço #${servico.id}: Reserva promovida para Titular.`
    );


    emitirAtualizacao(
        servico.id,
        'substituicao'
    );


    return {
        promoveu:
            true,

        antigoTitular,

        novoTitular:
            novoTitular.email
    };
}


// ============================================================
// LIMITE DE CONFIRMAÇÃO
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
// VERIFICAR CONFIRMAÇÃO DE UM SERVIÇO
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


    if (!limite) {

        return false;
    }


    if (
        Date.now() <
        limite.getTime()
    ) {

        return false;
    }


    if (
        servico.confirmacao_expirada
    ) {

        return false;
    }


    const marcado =
        await pool.query(
            `
            UPDATE servicos

            SET
                confirmacao_expirada =
                    TRUE,

                atualizado_em =
                    CURRENT_TIMESTAMP

            WHERE
                id = $1

            AND
                presenca_confirmada =
                    FALSE

            AND
                COALESCE(
                    confirmacao_expirada,
                    FALSE
                )
                =
                FALSE

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
                    presenca_confirmada =
                    FALSE

                AND
                    COALESCE(
                        confirmacao_expirada,
                        FALSE
                    )
                    =
                    FALSE

                AND
                    prazo_confirmacao
                    IS NOT NULL

                AND
                    prazo_confirmacao
                    <> ''

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

                console.warn(
                    `Confirmação serviço #${servico.id}:`,
                    erro.message
                );
            }
        }

    } catch (
        erro
    ) {

        console.warn(
            'Monitor de confirmação:',
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

        await verificarConfirmacoesExpiradas();


        const resultado =
            await pool.query(
                `
                SELECT *
                FROM servicos

                ORDER BY
                    id DESC
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
            'Listagem de serviços:',
            erro
        );


        return respostaErro(
            res,
            500,
            'Erro ao buscar serviços.'
        );
    }
}


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
// CRIAR SERVIÇO
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
                'Empresa não encontrada.'
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
            valorUnitario <
            0
        ) {

            return respostaErro(
                res,
                400,
                'Valor inválido.'
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
        }


        if (
            recorrencia ===
            'quinzenal'
        ) {

            valorTotal =
                valorUnitario *
                2;
        }


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

                    $14,$15,$16,$17,

                    $18,$19,$20,$21,

                    $22,$23,$24,$25,

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

                    valorUnitario,

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

                    textoSeguro(

                        s.empresa_nome ||

                        s.empresaNome ||

                        empresaUsuario.nome ||

                        empresaEmail
                    ),

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
            'Publicar serviço:',
            erro
        );


        return respostaErro(
            res,
            500,
            'Erro ao publicar serviço.'
        );
    }
}


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


        if (
            !await empresaEhResponsavel(
                servico,
                empresaEmail
            )
        ) {

            return respostaErro(
                res,
                403,
                'Somente a empresa responsável pode editar.'
            );
        }


        const novoValor =
            req.body?.valor !==
                undefined
                ||
                req.body?.valor_diaria !==
                undefined

                ?
                numeroRS(

                    req.body
                        .valor_diaria ??

                    req.body
                        .valor
                )

                :
                valorServicoCompat(
                    servico
                );


        const resultado =
            await pool.query(
                `
                UPDATE servicos

                SET
                    titulo =
                        $1,

                    categoria =
                        $2,

                    descricao =
                        $3,

                    local =
                        $4,

                    endereco =
                        $5,

                    valor =
                        $6,

                    valor_diaria =
                        $7,

                    atualizado_em =
                        CURRENT_TIMESTAMP

                WHERE id =
                    $8

                RETURNING *
                `,
                [
                    textoSeguro(

                        req.body?.titulo ||

                        servico.titulo
                    ),

                    textoSeguro(

                        req.body?.categoria ||

                        servico.categoria
                    ),

                    req.body?.descricao !==
                    undefined
                        ?
                        textoSeguro(
                            req.body.descricao
                        )
                        :
                        servico.descricao,

                    req.body?.local !==
                    undefined
                        ?
                        textoSeguro(
                            req.body.local
                        )
                        :
                        servico.local,

                    req.body?.endereco !==
                    undefined
                        ?
                        textoSeguro(
                            req.body.endereco
                        )
                        :
                        servico.endereco,

                    String(
                        novoValor
                    ),

                    novoValor,

                    id
                ]
            );


        await registrarAuditoria(
            empresaEmail,

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
            'Editar serviço:',
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
// CANCELAR SEM APAGAR
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


        if (
            !await empresaEhResponsavel(
                servico,
                empresaEmail
            )
        ) {

            return respostaErro(
                res,
                403,
                'Somente a empresa responsável pode cancelar.'
            );
        }


        if (
            textoSeguro(
                servico.status
            )
                .toLowerCase()
                ===
                'pago'
        ) {

            return respostaErro(
                res,
                409,
                'Serviço já pago não pode ser cancelado.'
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

            WHERE id =
                $2
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
// 1º = TITULAR
// 2º = RESERVA 1
// 3º = RESERVA 2
//
// FOR UPDATE EVITA DOIS TITULARES AO MESMO TEMPO.
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
                409,
                'Esta vaga não está disponível.'
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


        if (
            textoSeguro(
                usuario.tipo
            )
                .toLowerCase()
            !==
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
        // TITULAR
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
                    prestador_email =
                        $1,

                    prestador_id =
                        $2,

                    prestador_nome =
                        $3,

                    prestador_pix =
                        $4,

                    prestador_whatsapp =
                        $5,

                    contrato_aceito =
                        $6,

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

                WHERE id =
                    $7
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

                `Serviço #${id}: assumiu como Titular.`
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
        // RESERVAS
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


        reservas.push({

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
        });


        await client.query(
            `
            UPDATE servicos

            SET
                reservas =
                    $1::jsonb,

                atualizado_em =
                    CURRENT_TIMESTAMP

            WHERE id =
                $2
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
            reservas.length ===
            1
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
            'Aceitar vaga:',
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


app.post(
    '/api/servicos/:id/aceitar',
    aceitarVagaHandler
);


app.post(
    '/servicos/:id/aceitar',
    aceitarVagaHandler
);


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
                        409,
                        'Não é possível sair durante uma jornada ativa.'
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

                WHERE id =
                    $2
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

            return respostaErro(
                res,
                500,
                'Erro ao sair da vaga.'
            );
        }
    }
);


// ============================================================
// CONFIRMAR ESCALA
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
                    'Somente o Titular pode confirmar.'
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

                WHERE id =
                    $2
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
                        'Escala confirmada.'
                }
            );

        } catch (
            erro
        ) {

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
                !nome
                    .toLowerCase()
                    .endsWith(
                        '.pdf'
                    )
            ) {

                return respostaErro(
                    res,
                    400,
                    'O contrato precisa estar em PDF.'
                );
            }


            const arquivo =
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

                    WHERE id =
                        $2
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
                        'CONTRATO',
                        $4,$5
                    )
                    `,
                    [
                        id,

                        empresa.email,

                        email,

                        nome ||
                        `contrato-${id}.pdf`,

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
                email,

                'CONTRATO_ASSINADO',

                `Serviço #${id}: contrato enviado.`
            );


            emitirAtualizacao(
                id,
                'contrato'
            );


            return respostaSucesso(
                res,
                {
                    mensagem:
                        'Contrato arquivado com sucesso.'
                }
            );

        } catch (
            erro
        ) {

            console.error(
                'Contrato:',
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
// HISTÓRICO DE ESCALA
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
                        servico_id =
                        $1

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
// SUBSTITUIÇÃO MANUAL PELA EMPRESA
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


            if (
                !await empresaEhResponsavel(
                    servico,
                    empresaEmail
                )
            ) {

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
                            'Titular removido e vaga reaberta.',

                    resultado
                }
            );

        } catch (
            erro
        ) {

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
// PARTE 3 CONTINUA LOGO ABAIXO:
//
// PRESENÇA + SELFIE + GPS
// CHECK-IN
// INTERVALO
// VOLTAR DO INTERVALO
// CHECK-OUT
// VALIDAÇÃO
// PAGAMENTO
// COMPROVANTE
// NOTA FISCAL
// ARQUIVO DIGITAL
//
// NÃO COLOQUE server.listen AQUI.
// ============================================================
// ============================================================
// RS CONNECT
// SERVER.JS — PARTE 3 DE 4
//
// PRESENÇA
// GPS + SELFIE
// CHECK-IN
// INTERVALO
// VOLTAR DO INTERVALO
// CHECK-OUT
// VALIDAÇÃO DA EMPRESA
// PAGAMENTO
// COMPROVANTE
// DOCUMENTOS
// ARQUIVO DIGITAL
// ============================================================


// ============================================================
// UTILITÁRIOS DE JORNADA
// ============================================================

function obterEmailPrestadorRequest(req) {

    return normalizarEmail(

        req.body?.prestadorEmail ||

        req.body?.prestador_email ||

        req.body?.email ||

        req.sessaoRS?.usuario_email ||

        req.headers['x-user-email']
    );
}


function obterEmailEmpresaRequest(req) {

    return normalizarEmail(

        req.body?.empresaEmail ||

        req.body?.empresa_email ||

        req.body?.email ||

        req.sessaoRS?.usuario_email ||

        req.headers['x-user-email']
    );
}


function obterLatitude(body = {}) {

    return textoSeguro(

        body.latitude ??

        body.lat ??

        body.checkin_latitude ??

        body.checkout_latitude ??
        ''
    );
}


function obterLongitude(body = {}) {

    return textoSeguro(

        body.longitude ??

        body.lng ??

        body.lon ??

        body.checkin_longitude ??

        body.checkout_longitude ??
        ''
    );
}


function obterPrecisao(body = {}) {

    return textoSeguro(

        body.precisao ??

        body.accuracy ??
        ''
    );
}


// ============================================================
// FOTO RECEBIDA EM JSON OU MULTIPART
// ============================================================

function obterFotoRequest(req) {

    if (req.file?.buffer) {

        const mime =
            req.file.mimetype ||
            'image/jpeg';


        return `data:${mime};base64,${
            req.file.buffer.toString('base64')
        }`;
    }


    return textoSeguro(

        req.body?.foto ||

        req.body?.selfie ||

        req.body?.imagem ||

        req.body?.fotoBase64 ||

        req.body?.foto_base64 ||
        ''
    );
}


// ============================================================
// VALIDAR TITULAR
// ============================================================

async function validarTitularServico(
    req,
    res
) {

    const id =
        Number(
            req.params.id
        );


    if (
        !Number.isInteger(id) ||
        id <= 0
    ) {

        respostaErro(
            res,
            400,
            'Serviço inválido.'
        );


        return null;
    }


    const servico =
        await buscarServico(
            id
        );


    if (!servico) {

        respostaErro(
            res,
            404,
            'Serviço não encontrado.'
        );


        return null;
    }


    const email =
        obterEmailPrestadorRequest(
            req
        );


    if (!email) {

        respostaErro(
            res,
            400,
            'Prestador não identificado.'
        );


        return null;
    }


    if (
        !prestadorEhTitular(
            servico,
            email
        )
    ) {

        respostaErro(
            res,
            403,
            'Somente o Titular desta escala pode realizar esta operação.'
        );


        return null;
    }


    return {
        id,
        email,
        servico
    };
}


// ============================================================
// CONFIRMAR PRESENÇA COM GPS + SELFIE
// ============================================================

async function confirmarPresencaHandler(
    req,
    res
) {

    try {

        const dados =
            await validarTitularServico(
                req,
                res
            );


        if (!dados) {

            return;
        }


        const {
            id,
            email,
            servico
        } =
            dados;


        if (
            textoSeguro(
                servico.status
            )
                .toLowerCase()
                .includes('cancel')
        ) {

            return respostaErro(
                res,
                409,
                'Este serviço foi cancelado.'
            );
        }


        if (
            servico.presenca_confirmada
        ) {

            return respostaSucesso(
                res,
                {
                    mensagem:
                        'Sua presença já está confirmada.'
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
                'O prazo para confirmação já encerrou.'
            );
        }


        const latitude =
            obterLatitude(
                req.body
            );


        const longitude =
            obterLongitude(
                req.body
            );


        const precisao =
            obterPrecisao(
                req.body
            );


        const selfie =
            obterFotoRequest(
                req
            );


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

            WHERE id =
                $6
            `,
            [
                horaAtualRS(),
                latitude,
                longitude,
                precisao,
                selfie,
                id
            ]
        );


        await registrarHistoricoEscala({
            servicoId:
                id,

            trabalhadorEmail:
                email,

            tipo:
                'PRESENCA_CONFIRMADA',

            origem:
                'AGUARDANDO_CONFIRMACAO',

            destino:
                'ESCALA_GARANTIDA',

            motivo:
                'CONFIRMACAO_PRESTADOR'
        });


        await registrarAuditoria(
            email,
            'PRESENCA_CONFIRMADA',
            `Serviço #${id}: presença confirmada.`
        );


        emitirAtualizacao(
            id,
            'presenca'
        );


        return respostaSucesso(
            res,
            {
                mensagem:
                    'Presença confirmada. Sua escala está garantida.'
            }
        );

    } catch (erro) {

        console.error(
            'Confirmar presença:',
            erro
        );


        return respostaErro(
            res,
            500,
            'Erro ao confirmar presença.'
        );
    }
}


app.post(
    '/api/servicos/:id/confirmar-presenca',
    upload.single('foto'),
    confirmarPresencaHandler
);


app.post(
    '/api/servicos/:id/presenca',
    upload.single('foto'),
    confirmarPresencaHandler
);


// ============================================================
// CHECK-IN
// ============================================================

async function checkinHandler(
    req,
    res
) {

    try {

        const dados =
            await validarTitularServico(
                req,
                res
            );


        if (!dados) {

            return;
        }


        const {
            id,
            email,
            servico
        } =
            dados;


        if (
            textoSeguro(
                servico.status
            )
                .toLowerCase()
                .includes('cancel')
        ) {

            return respostaErro(
                res,
                409,
                'Serviço cancelado.'
            );
        }


        if (
            !servico.presenca_confirmada
        ) {

            return respostaErro(
                res,
                409,
                'Confirme sua presença antes de fazer o check-in.'
            );
        }


        if (
            servico.checkout_hora
        ) {

            return respostaErro(
                res,
                409,
                'Este serviço já possui check-out.'
            );
        }


        if (
            servico.checkin_hora
        ) {

            return respostaSucesso(
                res,
                {
                    mensagem:
                        'Check-in já realizado.',

                    hora:
                        servico.checkin_hora
                }
            );
        }


        const latitude =
            obterLatitude(
                req.body
            );


        const longitude =
            obterLongitude(
                req.body
            );


        const foto =
            obterFotoRequest(
                req
            );


        const hora =
            horaAtualRS();


        await pool.query(
            `
            UPDATE servicos

            SET
                checkin_hora =
                    $1,

                checkin_foto =
                    $2,

                foto_ponto =
                    COALESCE(
                        NULLIF(
                            foto_ponto,
                            ''
                        ),
                        $2
                    ),

                checkin_latitude =
                    $3,

                checkin_longitude =
                    $4,

                status_checkin =
                    'checkin_realizado',

                status =
                    'em_andamento',

                em_intervalo =
                    FALSE,

                atualizado_em =
                    CURRENT_TIMESTAMP

            WHERE id =
                $5
            `,
            [
                hora,
                foto,
                latitude,
                longitude,
                id
            ]
        );


        await registrarAuditoria(
            email,

            'CHECKIN',

            `Serviço #${id}: check-in realizado às ${hora}.`
        );


        emitirAtualizacao(
            id,
            'checkin'
        );


        return respostaSucesso(
            res,
            {
                mensagem:
                    'Check-in realizado com sucesso.',

                hora
            }
        );

    } catch (erro) {

        console.error(
            'Check-in:',
            erro
        );


        return respostaErro(
            res,
            500,
            'Erro ao realizar check-in.'
        );
    }
}


app.post(
    '/api/servicos/:id/checkin',
    upload.single('foto'),
    checkinHandler
);


app.post(
    '/api/servicos/:id/check-in',
    upload.single('foto'),
    checkinHandler
);


// ============================================================
// INICIAR INTERVALO
// ============================================================

async function iniciarIntervaloHandler(
    req,
    res
) {

    try {

        const dados =
            await validarTitularServico(
                req,
                res
            );


        if (!dados) {

            return;
        }


        const {
            id,
            email,
            servico
        } =
            dados;


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
                'A jornada já foi encerrada.'
            );
        }


        if (
            servico.em_intervalo
        ) {

            return respostaSucesso(
                res,
                {
                    mensagem:
                        'Você já está em intervalo.',

                    hora:
                        servico.intervalo_inicio
                }
            );
        }


        const hora =
            horaAtualRS();


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

                status_checkin =
                    'em_intervalo',

                atualizado_em =
                    CURRENT_TIMESTAMP

            WHERE id =
                $2
            `,
            [
                hora,
                id
            ]
        );


        await registrarAuditoria(
            email,

            'INTERVALO_INICIO',

            `Serviço #${id}: intervalo iniciado às ${hora}.`
        );


        emitirAtualizacao(
            id,
            'intervalo'
        );


        return respostaSucesso(
            res,
            {
                mensagem:
                    'Intervalo iniciado.',

                hora
            }
        );

    } catch (erro) {

        console.error(
            'Iniciar intervalo:',
            erro
        );


        return respostaErro(
            res,
            500,
            'Erro ao iniciar intervalo.'
        );
    }
}


app.post(
    '/api/servicos/:id/intervalo/iniciar',
    iniciarIntervaloHandler
);


app.post(
    '/api/servicos/:id/iniciar-intervalo',
    iniciarIntervaloHandler
);


// ============================================================
// VOLTAR DO INTERVALO
//
// ESTA É A FUNÇÃO DO BOTÃO:
// "VOLTAR DO INTERVALO"
// ============================================================

async function voltarIntervaloHandler(
    req,
    res
) {

    try {

        const dados =
            await validarTitularServico(
                req,
                res
            );


        if (!dados) {

            return;
        }


        const {
            id,
            email,
            servico
        } =
            dados;


        if (
            !servico.checkin_hora
        ) {

            return respostaErro(
                res,
                409,
                'Nenhum check-in foi realizado.'
            );
        }


        if (
            servico.checkout_hora
        ) {

            return respostaErro(
                res,
                409,
                'A jornada já foi encerrada.'
            );
        }


        if (
            !servico.intervalo_inicio
        ) {

            return respostaErro(
                res,
                409,
                'O intervalo ainda não foi iniciado.'
            );
        }


        if (
            !servico.em_intervalo
        ) {

            return respostaSucesso(
                res,
                {
                    mensagem:
                        'Você já voltou do intervalo.',

                    hora:
                        servico.intervalo_retorno ||
                        servico.intervalo_fim
                }
            );
        }


        const hora =
            horaAtualRS();


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

                status_checkin =
                    'trabalhando',

                status =
                    'em_andamento',

                atualizado_em =
                    CURRENT_TIMESTAMP

            WHERE id =
                $2
            `,
            [
                hora,
                id
            ]
        );


        await registrarAuditoria(
            email,

            'INTERVALO_RETORNO',

            `Serviço #${id}: retorno do intervalo às ${hora}.`
        );


        emitirAtualizacao(
            id,
            'retorno_intervalo'
        );


        return respostaSucesso(
            res,
            {
                mensagem:
                    'Retorno do intervalo registrado.',

                hora
            }
        );

    } catch (erro) {

        console.error(
            'Voltar do intervalo:',
            erro
        );


        return respostaErro(
            res,
            500,
            'Erro ao registrar retorno do intervalo.'
        );
    }
}


app.post(
    '/api/servicos/:id/intervalo/voltar',
    voltarIntervaloHandler
);


app.post(
    '/api/servicos/:id/voltar-intervalo',
    voltarIntervaloHandler
);


app.post(
    '/api/servicos/:id/fim-intervalo',
    voltarIntervaloHandler
);


// ============================================================
// CHECK-OUT
// ============================================================

async function checkoutHandler(
    req,
    res
) {

    try {

        const dados =
            await validarTitularServico(
                req,
                res
            );


        if (!dados) {

            return;
        }


        const {
            id,
            email,
            servico
        } =
            dados;


        if (
            !servico.checkin_hora
        ) {

            return respostaErro(
                res,
                409,
                'Não existe check-in para este serviço.'
            );
        }


        if (
            servico.checkout_hora
        ) {

            return respostaSucesso(
                res,
                {
                    mensagem:
                        'Check-out já realizado.',

                    hora:
                        servico.checkout_hora
                }
            );
        }


        if (
            servico.em_intervalo
        ) {

            return respostaErro(
                res,
                409,
                'Registre a volta do intervalo antes do check-out.'
            );
        }


        const latitude =
            obterLatitude(
                req.body
            );


        const longitude =
            obterLongitude(
                req.body
            );


        const foto =
            obterFotoRequest(
                req
            );


        const hora =
            horaAtualRS();


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
                    'checkout_realizado',

                status =
                    'aguardando_validacao',

                em_intervalo =
                    FALSE,

                atualizado_em =
                    CURRENT_TIMESTAMP

            WHERE id =
                $5
            `,
            [
                hora,
                foto,
                latitude,
                longitude,
                id
            ]
        );


        await registrarAuditoria(
            email,

            'CHECKOUT',

            `Serviço #${id}: check-out realizado às ${hora}.`
        );


        emitirAtualizacao(
            id,
            'checkout'
        );


        return respostaSucesso(
            res,
            {
                mensagem:
                    'Check-out realizado. Aguardando validação da empresa.',

                hora
            }
        );

    } catch (erro) {

        console.error(
            'Check-out:',
            erro
        );


        return respostaErro(
            res,
            500,
            'Erro ao realizar check-out.'
        );
    }
}


app.post(
    '/api/servicos/:id/checkout',
    upload.single('foto'),
    checkoutHandler
);


app.post(
    '/api/servicos/:id/check-out',
    upload.single('foto'),
    checkoutHandler
);


// ============================================================
// EMPRESA VALIDA SERVIÇO
// ============================================================

async function validarServicoEmpresaHandler(
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
            obterEmailEmpresaRequest(
                req
            );


        if (
            !await empresaEhResponsavel(
                servico,
                empresaEmail
            )
        ) {

            return respostaErro(
                res,
                403,
                'Somente a empresa responsável pode validar o serviço.'
            );
        }


        if (
            !servico.checkout_hora
        ) {

            return respostaErro(
                res,
                409,
                'O prestador ainda não realizou o check-out.'
            );
        }


        if (
            servico.validado_empresa
        ) {

            return respostaSucesso(
                res,
                {
                    mensagem:
                        'Este serviço já foi validado.'
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

            WHERE id =
                $1
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
                    'Serviço validado. Pagamento pode ser autorizado.'
            }
        );

    } catch (erro) {

        console.error(
            'Validação empresa:',
            erro
        );


        return respostaErro(
            res,
            500,
            'Erro ao validar serviço.'
        );
    }
}


app.post(
    '/api/servicos/:id/validar',
    validarServicoEmpresaHandler
);


app.post(
    '/api/servicos/:id/validar-servico',
    validarServicoEmpresaHandler
);


// ============================================================
// AUTORIZAR PAGAMENTO
// ============================================================

async function autorizarPagamentoHandler(
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
            obterEmailEmpresaRequest(
                req
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
                'Empresa sem permissão para autorizar este pagamento.'
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
            !servico.prestador_email
        ) {

            await client.query(
                'ROLLBACK'
            );


            return respostaErro(
                res,
                409,
                'Serviço sem prestador vinculado.'
            );
        }


        const valor =
            numeroRS(

                req.body?.valor ??

                valorServicoCompat(
                    servico
                )
            );


        if (
            valor <= 0
        ) {

            await client.query(
                'ROLLBACK'
            );


            return respostaErro(
                res,
                400,
                'Valor do pagamento inválido.'
            );
        }


        const formaPagamento =
            textoSeguro(

                req.body?.formaPagamento ||

                req.body?.forma_pagamento ||

                servico.forma_pgto ||

                'Pix'
            );


        // ====================================================
        // EVITAR DUPLICIDADE
        // ====================================================

        const pagamentoExistente =
            await client.query(
                `
                SELECT *
                FROM pagamentos

                WHERE
                    servico_id =
                    $1

                AND
                    LOWER(
                        COALESCE(
                            prestador_email,
                            ''
                        )
                    )
                    =
                    LOWER($2)

                ORDER BY id DESC

                LIMIT 1
                `,
                [
                    id,
                    servico.prestador_email
                ]
            );


        let pagamento;


        if (
            pagamentoExistente.rows.length
        ) {

            const atual =
                pagamentoExistente.rows[0];


            const atualizado =
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

                        status =
                            CASE
                                WHEN
                                    UPPER(
                                        COALESCE(
                                            status,
                                            ''
                                        )
                                    )
                                    =
                                    'PAGO'
                                THEN status

                                ELSE
                                    'AUTORIZADO'
                            END,

                        autorizado_em =
                            COALESCE(
                                autorizado_em,
                                CURRENT_TIMESTAMP
                            ),

                        atualizado_em =
                            CURRENT_TIMESTAMP

                    WHERE id =
                        $4

                    RETURNING *
                    `,
                    [
                        empresaEmail,
                        valor,
                        formaPagamento,
                        atual.id
                    ]
                );


            pagamento =
                atualizado.rows[0];

        } else {

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

                        autorizado_em,

                        criado_em,

                        atualizado_em

                    )

                    VALUES (

                        $1,$2,$3,$4,$5,

                        'AUTORIZADO',

                        CURRENT_TIMESTAMP,

                        CURRENT_TIMESTAMP,

                        CURRENT_TIMESTAMP
                    )

                    RETURNING *
                    `,
                    [
                        id,
                        empresaEmail,
                        servico.prestador_email,
                        valor,
                        formaPagamento
                    ]
                );


            pagamento =
                criado.rows[0];
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

                valor_liquido =
                    $1,

                status =
                    CASE
                        WHEN pagamento_realizado = TRUE
                        THEN status
                        ELSE 'pagamento_autorizado'
                    END,

                atualizado_em =
                    CURRENT_TIMESTAMP

            WHERE id =
                $2
            `,
            [
                valor,
                id
            ]
        );


        await client.query(
            'COMMIT'
        );


        await registrarLedger(
            id,
            servico.prestador_email,
            'PAGAMENTO_AUTORIZADO',
            valor
        );


        await registrarAuditoria(
            empresaEmail,

            'PAGAMENTO_AUTORIZADO',

            `Serviço #${id}: pagamento de R$ ${valor.toFixed(2)} autorizado.`
        );


        emitirAtualizacao(
            id,
            'pagamento'
        );


        return respostaSucesso(
            res,
            {
                mensagem:
                    'Pagamento autorizado.',

                pagamento
            }
        );

    } catch (erro) {

        try {

            await client.query(
                'ROLLBACK'
            );

        } catch {}


        console.error(
            'Autorizar pagamento:',
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


app.post(
    '/api/servicos/:id/autorizar-pagamento',
    autorizarPagamentoHandler
);


app.post(
    '/api/servicos/:id/pagamento/autorizar',
    autorizarPagamentoHandler
);


// ============================================================
// MARCAR PAGAMENTO COMO REALIZADO
// ============================================================

async function marcarPagamentoRealizadoHandler(
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
            obterEmailEmpresaRequest(
                req
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
                'O pagamento ainda não foi autorizado.'
            );
        }


        const valor =
            numeroRS(
                servico.valor_liquido
            ) > 0
                ?
                numeroRS(
                    servico.valor_liquido
                )
                :
                valorServicoCompat(
                    servico
                );


        await client.query(
            `
            UPDATE pagamentos

            SET
                status =
                    'PAGO',

                pago_em =
                    COALESCE(
                        pago_em,
                        CURRENT_TIMESTAMP
                    ),

                atualizado_em =
                    CURRENT_TIMESTAMP

            WHERE
                servico_id =
                $1

            AND
                LOWER(
                    COALESCE(
                        prestador_email,
                        ''
                    )
                )
                =
                LOWER($2)
            `,
            [
                id,
                servico.prestador_email
            ]
        );


        await client.query(
            `
            UPDATE servicos

            SET
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

            WHERE id =
                $1
            `,
            [
                id
            ]
        );


        await client.query(
            'COMMIT'
        );


        await registrarLedger(
            id,
            servico.prestador_email,
            'PAGAMENTO_REALIZADO',
            valor
        );


        await registrarAuditoria(
            empresaEmail,

            'PAGAMENTO_REALIZADO',

            `Serviço #${id}: pagamento registrado como realizado.`
        );


        emitirAtualizacao(
            id,
            'pagamento_realizado'
        );


        return respostaSucesso(
            res,
            {
                mensagem:
                    'Pagamento registrado como realizado.'
            }
        );

    } catch (erro) {

        try {

            await client.query(
                'ROLLBACK'
            );

        } catch {}


        console.error(
            'Pagamento realizado:',
            erro
        );


        return respostaErro(
            res,
            500,
            'Erro ao registrar pagamento.'
        );

    } finally {

        client.release();
    }
}


app.post(
    '/api/servicos/:id/pagamento-realizado',
    marcarPagamentoRealizadoHandler
);


app.post(
    '/api/servicos/:id/pagamento/pago',
    marcarPagamentoRealizadoHandler
);


// ============================================================
// COMPROVANTE DE PAGAMENTO
// ============================================================

async function comprovantePagamentoHandler(
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
            obterEmailEmpresaRequest(
                req
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
                'Somente a empresa responsável pode enviar o comprovante.'
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
            req.file.mimetype ||
            'application/octet-stream';


        const nome =
            textoSeguro(
                req.file.originalname
            )
            ||
            `comprovante-${id}`;


        const arquivo =
            `data:${mime};base64,${
                req.file.buffer.toString(
                    'base64'
                )
            }`;


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

                atualizado_em =
                    CURRENT_TIMESTAMP

            WHERE id =
                $2
            `,
            [
                arquivo,
                id
            ]
        );


        await client.query(
            `
            UPDATE pagamentos

            SET
                comprovante =
                    $1,

                atualizado_em =
                    CURRENT_TIMESTAMP

            WHERE
                servico_id =
                $2

            AND
                LOWER(
                    COALESCE(
                        prestador_email,
                        ''
                    )
                )
                =
                LOWER($3)
            `,
            [
                arquivo,
                id,
                servico.prestador_email
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
                'COMPROVANTE_PAGAMENTO',
                $4,$5
            )
            `,
            [
                id,
                empresaEmail,
                servico.prestador_email,
                nome,
                arquivo
            ]
        );


        await client.query(
            'COMMIT'
        );


        await registrarAuditoria(
            empresaEmail,

            'COMPROVANTE_PAGAMENTO',

            `Serviço #${id}: comprovante arquivado.`
        );


        emitirAtualizacao(
            id,
            'comprovante'
        );


        return respostaSucesso(
            res,
            {
                mensagem:
                    'Comprovante arquivado com sucesso.'
            }
        );

    } catch (erro) {

        try {

            await client.query(
                'ROLLBACK'
            );

        } catch {}


        console.error(
            'Comprovante:',
            erro
        );


        return respostaErro(
            res,
            500,
            'Erro ao salvar comprovante.'
        );

    } finally {

        client.release();
    }
}


app.post(
    '/api/servicos/:id/comprovante-pagamento',

    upload.single(
        'arquivo'
    ),

    comprovantePagamentoHandler
);


app.post(
    '/api/servicos/:id/pagamento/comprovante',

    upload.single(
        'arquivo'
    ),

    comprovantePagamentoHandler
);


// ============================================================
// NOTA / DOCUMENTO DO PRESTADOR
// ============================================================

async function documentoPrestadorHandler(
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


        const email =
            obterEmailPrestadorRequest(
                req
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
                'Somente o prestador vinculado pode enviar este documento.'
            );
        }


        if (!req.file) {

            return respostaErro(
                res,
                400,
                'Selecione um documento.'
            );
        }


        const nome =
            textoSeguro(
                req.file.originalname
            )
            ||
            `documento-${id}`;


        const mime =
            req.file.mimetype ||
            'application/octet-stream';


        const arquivo =
            `data:${mime};base64,${
                req.file.buffer.toString(
                    'base64'
                )
            }`;


        const categoria =
            textoSeguro(
                req.body?.categoria ||
                'DOCUMENTO_PRESTADOR'
            )
                .toUpperCase();


        const empresa =
            await resolverEmpresaDoServico(
                servico
            );


        await pool.query(
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
                $1,$2,$3,$4,$5,$6
            )
            `,
            [
                id,
                empresa.email,
                email,
                categoria,
                nome,
                arquivo
            ]
        );


        if (
            categoria ===
            'NOTA_FISCAL'
            ||
            categoria ===
            'NOTA'
        ) {

            await pool.query(
                `
                UPDATE servicos

                SET
                    nota_oficial =
                        $1,

                    atualizado_em =
                        CURRENT_TIMESTAMP

                WHERE id =
                    $2
                `,
                [
                    arquivo,
                    id
                ]
            );
        }


        await registrarAuditoria(
            email,

            'DOCUMENTO_ENVIADO',

            `Serviço #${id}: ${categoria} arquivado.`
        );


        emitirAtualizacao(
            id,
            'documento'
        );


        return respostaSucesso(
            res,
            {
                mensagem:
                    'Documento arquivado.'
            }
        );

    } catch (erro) {

        console.error(
            'Documento prestador:',
            erro
        );


        return respostaErro(
            res,
            500,
            'Erro ao arquivar documento.'
        );
    }
}


app.post(
    '/api/servicos/:id/documentos',

    upload.single(
        'arquivo'
    ),

    documentoPrestadorHandler
);


app.post(
    '/api/servicos/:id/nota-fiscal',

    upload.single(
        'arquivo'
    ),

    documentoPrestadorHandler
);


// ============================================================
// DOCUMENTOS DE UM SERVIÇO
// ============================================================

app.get(
    '/api/servicos/:id/documentos',

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
                        servico_id =
                        $1

                    ORDER BY
                        criado_em DESC,
                        id DESC
                    `,
                    [
                        id
                    ]
                );


            return respostaSucesso(
                res,
                {
                    documentos:
                        resultado.rows
                }
            );

        } catch (erro) {

            return respostaErro(
                res,
                500,
                'Erro ao buscar documentos.'
            );
        }
    }
);


// ============================================================
// BAIXAR / VISUALIZAR DOCUMENTO
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


            const resultado =
                await pool.query(
                    `
                    SELECT *
                    FROM documentos_rs

                    WHERE id =
                        $1

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


            return respostaSucesso(
                res,
                {
                    documento
                }
            );

        } catch (erro) {

            return respostaErro(
                res,
                500,
                'Erro ao carregar documento.'
            );
        }
    }
);


// ============================================================
// ARQUIVO DIGITAL DA EMPRESA
//
// TRABALHADORES
// CONTRATOS
// SERVIÇOS
// ESCALAS
// PAGAMENTOS
// COMPROVANTES
// HISTÓRICO
// DOCUMENTOS
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


            const empresa =
                await buscarUsuarioPorEmail(
                    email
                );


            if (!empresa) {

                return respostaErro(
                    res,
                    404,
                    'Empresa não encontrada.'
                );
            }


            const servicosResultado =
                await pool.query(
                    `
                    SELECT *
                    FROM servicos

                    WHERE
                        LOWER(
                            COALESCE(
                                empresa_email,
                                ''
                            )
                        )
                        =
                        LOWER($1)

                    ORDER BY
                        id DESC
                    `,
                    [
                        email
                    ]
                );


            const documentosResultado =
                await pool.query(
                    `
                    SELECT *
                    FROM documentos_rs

                    WHERE
                        LOWER(
                            COALESCE(
                                empresa_email,
                                ''
                            )
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
                            COALESCE(
                                empresa_email,
                                ''
                            )
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


            const idsServicos =
                servicosResultado.rows
                    .map(
                        s => Number(s.id)
                    )
                    .filter(
                        id =>
                            Number.isInteger(id)
                    );


            let escalas =
                [];


            if (
                idsServicos.length
            ) {

                const escalasResultado =
                    await pool.query(
                        `
                        SELECT *
                        FROM historico_escalas

                        WHERE
                            servico_id =
                            ANY($1::int[])

                        ORDER BY
                            criado_em DESC,
                            id DESC
                        `,
                        [
                            idsServicos
                        ]
                    );


                escalas =
                    escalasResultado.rows;
            }


            // =================================================
            // TRABALHADORES ÚNICOS
            // =================================================

            const emailsPrestadores =
                new Set();


            for (
                const servico
                of servicosResultado.rows
            ) {

                if (
                    servico.prestador_email
                ) {

                    emailsPrestadores.add(
                        normalizarEmail(
                            servico.prestador_email
                        )
                    );
                }


                for (
                    const reserva
                    of obterReservasServico(
                        servico
                    )
                ) {

                    if (
                        reserva.email
                    ) {

                        emailsPrestadores.add(
                            normalizarEmail(
                                reserva.email
                            )
                        );
                    }
                }
            }


            const trabalhadores =
                [];


            for (
                const prestadorEmail
                of emailsPrestadores
            ) {

                const usuario =
                    await buscarUsuarioPorEmail(
                        prestadorEmail
                    );


                if (usuario) {

                    trabalhadores.push(
                        usuarioPublico(
                            usuario
                        )
                    );
                }
            }


            const contratos =
                documentosResultado.rows
                    .filter(
                        doc =>

                            textoSeguro(
                                doc.categoria
                            )
                                .toUpperCase()
                                .includes(
                                    'CONTRATO'
                                )
                    );


            const comprovantes =
                documentosResultado.rows
                    .filter(
                        doc =>

                            textoSeguro(
                                doc.categoria
                            )
                                .toUpperCase()
                                .includes(
                                    'COMPROVANTE'
                                )
                    );


            const servicos =
                [];


            for (
                const item
                of servicosResultado.rows
            ) {

                servicos.push(
                    await servicoParaIndex(
                        item
                    )
                );
            }


            return respostaSucesso(
                res,
                {
                    empresa:
                        usuarioPublico(
                            empresa
                        ),

                    pastas: {

                        trabalhadores,

                        contratos,

                        servicos,

                        escalas,

                        pagamentos:
                            pagamentosResultado.rows,

                        comprovantes,

                        historico:
                            escalas,

                        documentos:
                            documentosResultado.rows
                    },

                    totais: {

                        trabalhadores:
                            trabalhadores.length,

                        contratos:
                            contratos.length,

                        servicos:
                            servicos.length,

                        escalas:
                            escalas.length,

                        pagamentos:
                            pagamentosResultado.rows.length,

                        comprovantes:
                            comprovantes.length,

                        documentos:
                            documentosResultado.rows.length
                    }
                }
            );

        } catch (erro) {

            console.error(
                'Arquivo digital empresa:',
                erro
            );


            return respostaErro(
                res,
                500,
                'Erro ao carregar arquivo digital da empresa.'
            );
        }
    }
);


// ============================================================
// HISTÓRICO DE UM TRABALHADOR NA EMPRESA
//
// EMPRESA PESQUISA PELO E-MAIL DO PRESTADOR
// E VÊ TODA A RELAÇÃO ENTRE ELES.
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
                    req.params.empresaEmail
                );


            const prestadorEmail =
                normalizarEmail(
                    req.params.prestadorEmail
                );


            const trabalhador =
                await buscarUsuarioPorEmail(
                    prestadorEmail
                );


            if (!trabalhador) {

                return respostaErro(
                    res,
                    404,
                    'Trabalhador não encontrado.'
                );
            }


            const servicosResultado =
                await pool.query(
                    `
                    SELECT *
                    FROM servicos

                    WHERE
                        LOWER(
                            COALESCE(
                                empresa_email,
                                ''
                            )
                        )
                        =
                        LOWER($1)

                    AND
                        LOWER(
                            COALESCE(
                                prestador_email,
                                ''
                            )
                        )
                        =
                        LOWER($2)

                    ORDER BY
                        id DESC
                    `,
                    [
                        empresaEmail,
                        prestadorEmail
                    ]
                );


            const pagamentosResultado =
                await pool.query(
                    `
                    SELECT *
                    FROM pagamentos

                    WHERE
                        LOWER(
                            COALESCE(
                                empresa_email,
                                ''
                            )
                        )
                        =
                        LOWER($1)

                    AND
                        LOWER(
                            COALESCE(
                                prestador_email,
                                ''
                            )
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


            const documentosResultado =
                await pool.query(
                    `
                    SELECT *

                    FROM documentos_rs

                    WHERE
                        LOWER(
                            COALESCE(
                                empresa_email,
                                ''
                            )
                        )
                        =
                        LOWER($1)

                    AND
                        LOWER(
                            COALESCE(
                                prestador_email,
                                ''
                            )
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


            const servicos =
                [];


            for (
                const item
                of servicosResultado.rows
            ) {

                servicos.push(
                    await servicoParaIndex(
                        item
                    )
                );
            }


            const totalPago =
                pagamentosResultado.rows
                    .filter(
                        p =>

                            textoSeguro(
                                p.status
                            )
                                .toUpperCase()
                                ===
                                'PAGO'
                    )
                    .reduce(
                        (
                            total,
                            pagamento
                        ) =>

                            total +
                            numeroRS(
                                pagamento.valor
                            ),

                        0
                    );


            return respostaSucesso(
                res,
                {
                    trabalhador:
                        usuarioPublico(
                            trabalhador
                        ),

                    empresaEmail,

                    servicos,

                    pagamentos:
                        pagamentosResultado.rows,

                    documentos:
                        documentosResultado.rows,

                    resumo: {

                        totalServicos:
                            servicos.length,

                        totalPagamentos:
                            pagamentosResultado.rows.length,

                        totalPago
                    }
                }
            );

        } catch (erro) {

            console.error(
                'Histórico trabalhador:',
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
// FINANCEIRO DO PRESTADOR
// ============================================================

app.get(
    '/api/prestador/:email/pagamentos',

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
                    SELECT *
                    FROM pagamentos

                    WHERE
                        LOWER(
                            COALESCE(
                                prestador_email,
                                ''
                            )
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


            const totalPago =
                resultado.rows
                    .filter(
                        p =>

                            textoSeguro(
                                p.status
                            )
                                .toUpperCase()
                                ===
                                'PAGO'
                    )
                    .reduce(
                        (
                            total,
                            pagamento
                        ) =>

                            total +
                            numeroRS(
                                pagamento.valor
                            ),

                        0
                    );


            const totalPendente =
                resultado.rows
                    .filter(
                        p =>

                            textoSeguro(
                                p.status
                            )
                                .toUpperCase()
                                !==
                                'PAGO'
                    )
                    .reduce(
                        (
                            total,
                            pagamento
                        ) =>

                            total +
                            numeroRS(
                                pagamento.valor
                            ),

                        0
                    );


            return respostaSucesso(
                res,
                {
                    pagamentos:
                        resultado.rows,

                    resumo: {

                        totalPago,

                        totalPendente,

                        quantidade:
                            resultado.rows.length
                    }
                }
            );

        } catch (erro) {

            return respostaErro(
                res,
                500,
                'Erro ao carregar pagamentos.'
            );
        }
    }
);


// ============================================================
// SERVIÇOS DO PRESTADOR
//
// INCLUI:
// TITULAR
// RESERVA 1
// RESERVA 2
// ============================================================

app.get(
    '/api/prestador/:email/servicos',

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
                    SELECT *
                    FROM servicos

                    ORDER BY
                        id DESC
                    `
                );


            const meusServicos =
                [];


            for (
                const servico
                of resultado.rows
            ) {

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

                    meusServicos.push(
                        await servicoParaIndex(
                            servico
                        )
                    );
                }
            }


            return respostaSucesso(
                res,
                {
                    servicos:
                        meusServicos
                }
            );

        } catch (erro) {

            return respostaErro(
                res,
                500,
                'Erro ao carregar serviços do prestador.'
            );
        }
    }
);


// ============================================================
// PAINEL RESUMIDO DA EMPRESA
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


            const resultado =
                await pool.query(
                    `
                    SELECT *
                    FROM servicos

                    WHERE
                        LOWER(
                            COALESCE(
                                empresa_email,
                                ''
                            )
                        )
                        =
                        LOWER($1)

                    ORDER BY
                        id DESC
                    `,
                    [
                        email
                    ]
                );


            const servicos =
                resultado.rows;


            const trabalhadoresAtivos =
                new Set();


            let confirmados =
                0;


            let aguardandoConfirmacao =
                0;


            let emAndamento =
                0;


            let aguardandoValidacao =
                0;


            let pagos =
                0;


            let cancelados =
                0;


            for (
                const servico
                of servicos
            ) {

                if (
                    servico.prestador_email
                ) {

                    trabalhadoresAtivos.add(
                        normalizarEmail(
                            servico.prestador_email
                        )
                    );
                }


                if (
                    servico.presenca_confirmada
                ) {

                    confirmados++;
                }


                const status =
                    textoSeguro(
                        servico.status
                    )
                        .toLowerCase();


                if (
                    status ===
                    'aguardando_confirmacao'
                ) {

                    aguardandoConfirmacao++;
                }


                if (
                    status ===
                    'em_andamento'
                ) {

                    emAndamento++;
                }


                if (
                    status ===
                    'aguardando_validacao'
                ) {

                    aguardandoValidacao++;
                }


                if (
                    status ===
                    'pago'
                ) {

                    pagos++;
                }


                if (
                    status.includes(
                        'cancel'
                    )
                ) {

                    cancelados++;
                }
            }


            return respostaSucesso(
                res,
                {
                    resumo: {

                        totalServicos:
                            servicos.length,

                        trabalhadoresAtivos:
                            trabalhadoresAtivos.size,

                        confirmados,

                        aguardandoConfirmacao,

                        emAndamento,

                        aguardandoValidacao,

                        pagos,

                        cancelados
                    },

                    servicos:
                        await Promise.all(
                            servicos.map(
                                servicoParaIndex
                            )
                        )
                }
            );

        } catch (erro) {

            return respostaErro(
                res,
                500,
                'Erro ao carregar painel da empresa.'
            );
        }
    }
);


// ============================================================
// FIM DA PARTE 3
//
// A PARTE 4 VAI ABAIXO.
//
// PARTE 4:
// - CHAT / MENSAGENS
// - WEBSOCKET
// - CONVERSAS
// - MENSAGENS NÃO LIDAS
// - HEALTH CHECK
// - TRATAMENTO DE ERROS
// - MONITOR AUTOMÁTICO DE CONFIRMAÇÃO
// - INDEX.HTML
// - INICIALIZAÇÃO
// - server.listen
//
// IMPORTANTE:
// server.listen SOMENTE NA PARTE 4.
// ============================================================
// ============================================================
// RS CONNECT
// SERVER.JS — PARTE 4 DE 4
//
// CHAT
// CONVERSAS
// MENSAGENS
// WEBSOCKET
// HEALTH CHECK
// MONITOR DE CONFIRMAÇÃO
// INDEX.HTML
// TRATAMENTO DE ERROS
// INICIALIZAÇÃO
// SERVER.LISTEN
// ============================================================


// ============================================================
// UTILITÁRIOS DO CHAT
// ============================================================

function obterEmailChatRequest(req) {

    return normalizarEmail(

        req.body?.email ||

        req.body?.usuarioEmail ||

        req.body?.usuario_email ||

        req.query?.email ||

        req.sessaoRS?.usuario_email ||

        req.headers['x-user-email']
    );
}


function usuarioParticipaConversa(
    conversa,
    email
) {

    const usuarioEmail =
        normalizarEmail(
            email
        );


    if (!usuarioEmail) {

        return false;
    }


    return (

        normalizarEmail(
            conversa?.empresa_email
        )
        ===
        usuarioEmail

        ||

        normalizarEmail(
            conversa?.prestador_email
        )
        ===
        usuarioEmail
    );
}


// ============================================================
// CRIAR / BUSCAR CONVERSA DO SERVIÇO
// ============================================================

async function obterOuCriarConversa(
    servicoId,
    empresaEmail,
    prestadorEmail
) {

    const id =
        Number(
            servicoId
        );


    const empresa =
        normalizarEmail(
            empresaEmail
        );


    const prestador =
        normalizarEmail(
            prestadorEmail
        );


    if (
        !idValido(id) ||
        !empresa ||
        !prestador
    ) {

        return null;
    }


    const existente =
        await pool.query(
            `
            SELECT *
            FROM conversas

            WHERE
                servico_id =
                $1

            AND
                LOWER(
                    COALESCE(
                        empresa_email,
                        ''
                    )
                )
                =
                LOWER($2)

            AND
                LOWER(
                    COALESCE(
                        prestador_email,
                        ''
                    )
                )
                =
                LOWER($3)

            ORDER BY id DESC

            LIMIT 1
            `,
            [
                id,
                empresa,
                prestador
            ]
        );


    if (
        existente.rows.length
    ) {

        return existente.rows[0];
    }


    const criada =
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

            RETURNING *
            `,
            [
                id,
                empresa,
                prestador
            ]
        );


    return criada.rows[0];
}


// ============================================================
// GARANTIR CONVERSA PELO SERVIÇO
// ============================================================

async function obterConversaDoServico(
    servico,
    usuarioEmail = ''
) {

    if (!servico) {

        return null;
    }


    const empresa =
        await resolverEmpresaDoServico(
            servico
        );


    let prestadorEmail =
        normalizarEmail(
            servico.prestador_email
        );


    const usuario =
        normalizarEmail(
            usuarioEmail
        );


    // Se ainda não existir titular e quem abriu for prestador,
    // não cria conversa solta.
    if (
        !prestadorEmail
    ) {

        return null;
    }


    if (
        usuario &&
        usuario !== empresa.email &&
        usuario !== prestadorEmail
    ) {

        return null;
    }


    return obterOuCriarConversa(
        servico.id,
        empresa.email,
        prestadorEmail
    );
}


// ============================================================
// LISTAR CONVERSAS DO USUÁRIO
// ============================================================

app.get(
    '/api/chat/conversas/:email',

    async (
        req,
        res
    ) => {

        try {

            const email =
                normalizarEmail(
                    req.params.email
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

                        c.*,

                        s.titulo
                            AS servico_titulo,

                        s.status
                            AS servico_status,

                        s.empresa_nome,

                        s.prestador_nome,

                        (
                            SELECT
                                m.mensagem

                            FROM mensagens_chat m

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

                            FROM mensagens_chat m

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
                                COUNT(*)

                            FROM mensagens_chat m

                            WHERE
                                m.conversa_id =
                                c.id

                            AND
                                LOWER(
                                    COALESCE(
                                        m.destinatario_email,
                                        ''
                                    )
                                )
                                =
                                LOWER($1)

                            AND
                                COALESCE(
                                    m.lida,
                                    FALSE
                                )
                                =
                                FALSE
                        )::INTEGER
                        AS nao_lidas

                    FROM conversas c

                    LEFT JOIN servicos s
                        ON
                            s.id =
                            c.servico_id

                    WHERE

                        LOWER(
                            COALESCE(
                                c.empresa_email,
                                ''
                            )
                        )
                        =
                        LOWER($1)

                    OR

                        LOWER(
                            COALESCE(
                                c.prestador_email,
                                ''
                            )
                        )
                        =
                        LOWER($1)

                    ORDER BY

                        COALESCE(

                            (
                                SELECT
                                    MAX(
                                        m2.criado_em
                                    )

                                FROM mensagens_chat m2

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
                'Listar conversas:',
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
// ABRIR CHAT PELO SERVIÇO
// ============================================================

app.get(
    '/api/servicos/:id/conversa',

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

                    req.query?.email ||

                    req.sessaoRS?.usuario_email ||

                    req.headers['x-user-email']
                );


            const conversa =
                await obterConversaDoServico(
                    servico,
                    email
                );


            if (!conversa) {

                return respostaErro(
                    res,
                    403,
                    'Conversa ainda não disponível para este usuário.'
                );
            }


            return respostaSucesso(
                res,
                {
                    conversa
                }
            );

        } catch (
            erro
        ) {

            console.error(
                'Abrir conversa:',
                erro
            );


            return respostaErro(
                res,
                500,
                'Erro ao abrir conversa.'
            );
        }
    }
);


// ============================================================
// LISTAR MENSAGENS DA CONVERSA
// ============================================================

app.get(
    '/api/chat/conversas/:id/mensagens',

    async (
        req,
        res
    ) => {

        try {

            const conversaId =
                Number(
                    req.params.id
                );


            const email =
                normalizarEmail(

                    req.query?.email ||

                    req.sessaoRS?.usuario_email ||

                    req.headers['x-user-email']
                );


            if (
                !idValido(
                    conversaId
                )
            ) {

                return respostaErro(
                    res,
                    400,
                    'Conversa inválida.'
                );
            }


            const conversaResultado =
                await pool.query(
                    `
                    SELECT *
                    FROM conversas

                    WHERE id =
                        $1

                    LIMIT 1
                    `,
                    [
                        conversaId
                    ]
                );


            const conversa =
                conversaResultado.rows[0];


            if (!conversa) {

                return respostaErro(
                    res,
                    404,
                    'Conversa não encontrada.'
                );
            }


            if (
                !usuarioParticipaConversa(
                    conversa,
                    email
                )
            ) {

                return respostaErro(
                    res,
                    403,
                    'Você não participa desta conversa.'
                );
            }


            const mensagens =
                await pool.query(
                    `
                    SELECT *
                    FROM mensagens_chat

                    WHERE
                        conversa_id =
                        $1

                    ORDER BY
                        criado_em ASC,
                        id ASC
                    `,
                    [
                        conversaId
                    ]
                );


            // =================================================
            // MARCAR RECEBIDAS COMO LIDAS
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
                        COALESCE(
                            destinatario_email,
                            ''
                        )
                    )
                    =
                    LOWER($2)

                AND
                    COALESCE(
                        lida,
                        FALSE
                    )
                    =
                    FALSE
                `,
                [
                    conversaId,
                    email
                ]
            );


            return respostaSucesso(
                res,
                {
                    conversa,

                    mensagens:
                        mensagens.rows
                }
            );

        } catch (
            erro
        ) {

            console.error(
                'Mensagens:',
                erro
            );


            return respostaErro(
                res,
                500,
                'Erro ao carregar mensagens.'
            );
        }
    }
);


// ============================================================
// ENVIAR MENSAGEM
// ============================================================

async function enviarMensagemChat(
    {
        conversaId,
        remetenteEmail,
        mensagem,
        tipo = 'texto'
    }
) {

    const id =
        Number(
            conversaId
        );


    const remetente =
        normalizarEmail(
            remetenteEmail
        );


    const texto =
        textoSeguro(
            mensagem
        );


    if (
        !idValido(id) ||
        !remetente ||
        !texto
    ) {

        throw new Error(
            'Dados da mensagem inválidos.'
        );
    }


    const conversaResultado =
        await pool.query(
            `
            SELECT *
            FROM conversas

            WHERE id =
                $1

            LIMIT 1
            `,
            [
                id
            ]
        );


    const conversa =
        conversaResultado.rows[0];


    if (!conversa) {

        throw new Error(
            'Conversa não encontrada.'
        );
    }


    if (
        !usuarioParticipaConversa(
            conversa,
            remetente
        )
    ) {

        throw new Error(
            'Usuário não participa desta conversa.'
        );
    }


    const empresaEmail =
        normalizarEmail(
            conversa.empresa_email
        );


    const prestadorEmail =
        normalizarEmail(
            conversa.prestador_email
        );


    const destinatario =
        remetente === empresaEmail
            ?
            prestadorEmail
            :
            empresaEmail;


    if (!destinatario) {

        throw new Error(
            'Destinatário não encontrado.'
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

                $1,$2,$3,$4,$5,$6,

                FALSE,

                CURRENT_TIMESTAMP
            )

            RETURNING *
            `,
            [
                id,

                conversa.servico_id,

                remetente,

                destinatario,

                texto,

                textoSeguro(
                    tipo ||
                    'texto'
                )
            ]
        );


    await pool.query(
        `
        UPDATE conversas

        SET
            atualizado_em =
                CURRENT_TIMESTAMP

        WHERE id =
            $1
        `,
        [
            id
        ]
    );


    const mensagemCriada =
        resultado.rows[0];


    await registrarAuditoria(
        remetente,

        'MENSAGEM_ENVIADA',

        `Mensagem enviada na conversa #${id}.`
    );


    return {
        conversa,
        mensagem:
            mensagemCriada
    };
}


// ============================================================
// ROTA ENVIAR MENSAGEM
// ============================================================

app.post(
    '/api/chat/conversas/:id/mensagens',

    async (
        req,
        res
    ) => {

        try {

            const conversaId =
                Number(
                    req.params.id
                );


            const remetenteEmail =
                normalizarEmail(

                    req.body?.remetenteEmail ||

                    req.body?.remetente_email ||

                    req.body?.email ||

                    req.sessaoRS?.usuario_email ||

                    req.headers['x-user-email']
                );


            const mensagem =
                textoSeguro(

                    req.body?.mensagem ||

                    req.body?.texto
                );


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
                    'Mensagem muito grande.'
                );
            }


            const resultado =
                await enviarMensagemChat({
                    conversaId,
                    remetenteEmail,
                    mensagem,
                    tipo:
                        req.body?.tipo ||
                        'texto'
                });


            // =================================================
            // TEMPO REAL
            // =================================================

            io
                .to(
                    `conversa:${conversaId}`
                )
                .emit(
                    'nova_mensagem',
                    resultado.mensagem
                );


            io
                .to(
                    `usuario:${normalizarEmail(
                        resultado.mensagem.destinatario_email
                    )}`
                )
                .emit(
                    'mensagem_recebida',
                    resultado.mensagem
                );


            io
                .to(
                    `usuario:${normalizarEmail(
                        resultado.mensagem.remetente_email
                    )}`
                )
                .emit(
                    'mensagem_enviada',
                    resultado.mensagem
                );


            return respostaSucesso(
                res,
                {
                    mensagem:
                        resultado.mensagem
                }
            );

        } catch (
            erro
        ) {

            console.error(
                'Enviar mensagem:',
                erro
            );


            const mensagemErro =
                textoSeguro(
                    erro.message
                );


            if (
                mensagemErro.includes(
                    'não participa'
                )
            ) {

                return respostaErro(
                    res,
                    403,
                    mensagemErro
                );
            }


            return respostaErro(
                res,
                500,
                mensagemErro ||
                'Erro ao enviar mensagem.'
            );
        }
    }
);


// ============================================================
// COMPATIBILIDADE COM ROTA ANTIGA DE MENSAGENS
// ============================================================

app.post(
    '/api/mensagens',

    async (
        req,
        res
    ) => {

        try {

            const servicoId =
                Number(
                    req.body?.servicoId ||

                    req.body?.servico_id
                );


            const servico =
                await buscarServico(
                    servicoId
                );


            if (!servico) {

                return respostaErro(
                    res,
                    404,
                    'Serviço não encontrado.'
                );
            }


            const remetenteEmail =
                normalizarEmail(

                    req.body?.remetenteEmail ||

                    req.body?.remetente_email ||

                    req.body?.email ||

                    req.sessaoRS?.usuario_email ||

                    req.headers['x-user-email']
                );


            const conversa =
                await obterConversaDoServico(
                    servico,
                    remetenteEmail
                );


            if (!conversa) {

                return respostaErro(
                    res,
                    403,
                    'Chat indisponível.'
                );
            }


            const resultado =
                await enviarMensagemChat({

                    conversaId:
                        conversa.id,

                    remetenteEmail,

                    mensagem:

                        req.body?.mensagem ||

                        req.body?.texto,

                    tipo:
                        req.body?.tipo ||
                        'texto'
                });


            io
                .to(
                    `conversa:${conversa.id}`
                )
                .emit(
                    'nova_mensagem',
                    resultado.mensagem
                );


            io
                .to(
                    `usuario:${normalizarEmail(
                        resultado.mensagem.destinatario_email
                    )}`
                )
                .emit(
                    'mensagem_recebida',
                    resultado.mensagem
                );


            return respostaSucesso(
                res,
                {
                    conversa,

                    mensagem:
                        resultado.mensagem
                }
            );

        } catch (
            erro
        ) {

            console.error(
                'Mensagem compatibilidade:',
                erro
            );


            return respostaErro(
                res,
                500,
                'Erro ao enviar mensagem.'
            );
        }
    }
);


// ============================================================
// QUANTIDADE DE MENSAGENS NÃO LIDAS
// ============================================================

app.get(
    '/api/chat/nao-lidas/:email',

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
                        COUNT(*)::INTEGER
                        AS total

                    FROM mensagens_chat

                    WHERE
                        LOWER(
                            COALESCE(
                                destinatario_email,
                                ''
                            )
                        )
                        =
                        LOWER($1)

                    AND
                        COALESCE(
                            lida,
                            FALSE
                        )
                        =
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
                        Number(
                            resultado.rows[0]?.total ||
                            0
                        )
                }
            );

        } catch (
            erro
        ) {

            return respostaErro(
                res,
                500,
                'Erro ao verificar mensagens.'
            );
        }
    }
);


// ============================================================
// MARCAR CONVERSA COMO LIDA
// ============================================================

app.post(
    '/api/chat/conversas/:id/lida',

    async (
        req,
        res
    ) => {

        try {

            const conversaId =
                Number(
                    req.params.id
                );


            const email =
                obterEmailChatRequest(
                    req
                );


            const conversaResultado =
                await pool.query(
                    `
                    SELECT *
                    FROM conversas

                    WHERE id =
                        $1

                    LIMIT 1
                    `,
                    [
                        conversaId
                    ]
                );


            const conversa =
                conversaResultado.rows[0];


            if (!conversa) {

                return respostaErro(
                    res,
                    404,
                    'Conversa não encontrada.'
                );
            }


            if (
                !usuarioParticipaConversa(
                    conversa,
                    email
                )
            ) {

                return respostaErro(
                    res,
                    403,
                    'Você não participa desta conversa.'
                );
            }


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
                        COALESCE(
                            destinatario_email,
                            ''
                        )
                    )
                    =
                    LOWER($2)
                `,
                [
                    conversaId,
                    email
                ]
            );


            io
                .to(
                    `usuario:${email}`
                )
                .emit(
                    'mensagens_lidas',
                    {
                        conversaId
                    }
                );


            return respostaSucesso(
                res,
                {
                    mensagem:
                        'Mensagens marcadas como lidas.'
                }
            );

        } catch (
            erro
        ) {

            return respostaErro(
                res,
                500,
                'Erro ao atualizar mensagens.'
            );
        }
    }
);


// ============================================================
// SOCKET.IO
//
// IMPORTANTE:
// "io" JÁ FOI CRIADO NA PARTE 1.
// NÃO CRIAR NOVAMENTE.
// ============================================================

io.on(
    'connection',

    socket => {

        console.log(
            `🟢 Novo cliente conectado via WebSocket: ${socket.id}`
        );


        // ====================================================
        // IDENTIFICAR USUÁRIO
        // ====================================================

        socket.on(
            'identificar_usuario',

            dados => {

                try {

                    const email =
                        normalizarEmail(

                            typeof dados ===
                            'string'
                                ?
                                dados
                                :
                                dados?.email
                        );


                    if (!email) {

                        return;
                    }


                    socket.data.email =
                        email;


                    socket.join(
                        `usuario:${email}`
                    );


                    socket.emit(
                        'usuario_identificado',
                        {
                            email
                        }
                    );


                    console.log(
                        `👤 Socket ${socket.id} identificado: ${email}`
                    );

                } catch (
                    erro
                ) {

                    console.warn(
                        'Identificar socket:',
                        erro.message
                    );
                }
            }
        );


        // ====================================================
        // ENTRAR NA CONVERSA
        // ====================================================

        socket.on(
            'entrar_conversa',

            async dados => {

                try {

                    const conversaId =
                        Number(

                            typeof dados ===
                            'number'

                                ?

                                dados

                                :

                                dados?.conversaId ||

                                dados?.conversa_id ||

                                dados?.id
                        );


                    const email =
                        normalizarEmail(

                            dados?.email ||

                            socket.data.email
                        );


                    if (
                        !idValido(
                            conversaId
                        )
                        ||
                        !email
                    ) {

                        return;
                    }


                    const resultado =
                        await pool.query(
                            `
                            SELECT *
                            FROM conversas

                            WHERE id =
                                $1

                            LIMIT 1
                            `,
                            [
                                conversaId
                            ]
                        );


                    const conversa =
                        resultado.rows[0];


                    if (
                        !conversa ||
                        !usuarioParticipaConversa(
                            conversa,
                            email
                        )
                    ) {

                        socket.emit(
                            'erro_chat',
                            {
                                erro:
                                    'Sem permissão para entrar nesta conversa.'
                            }
                        );


                        return;
                    }


                    socket.join(
                        `conversa:${conversaId}`
                    );


                    socket.emit(
                        'entrou_conversa',
                        {
                            conversaId
                        }
                    );

                } catch (
                    erro
                ) {

                    console.warn(
                        'Entrar conversa:',
                        erro.message
                    );
                }
            }
        );


        // ====================================================
        // SAIR DA CONVERSA
        // ====================================================

        socket.on(
            'sair_conversa',

            dados => {

                const conversaId =
                    Number(

                        typeof dados ===
                        'number'

                            ?

                            dados

                            :

                            dados?.conversaId ||

                            dados?.conversa_id ||

                            dados?.id
                    );


                if (
                    idValido(
                        conversaId
                    )
                ) {

                    socket.leave(
                        `conversa:${conversaId}`
                    );
                }
            }
        );


        // ====================================================
        // DIGITANDO
        // ====================================================

        socket.on(
            'digitando',

            dados => {

                const conversaId =
                    Number(
                        dados?.conversaId ||
                        dados?.conversa_id
                    );


                if (
                    !idValido(
                        conversaId
                    )
                ) {

                    return;
                }


                socket
                    .to(
                        `conversa:${conversaId}`
                    )
                    .emit(
                        'usuario_digitando',
                        {
                            conversaId,

                            email:
                                normalizarEmail(
                                    dados?.email ||
                                    socket.data.email
                                ),

                            digitando:
                                Boolean(
                                    dados?.digitando
                                )
                        }
                    );
            }
        );


        // ====================================================
        // MENSAGEM DIRETA PELO SOCKET
        // ====================================================

        socket.on(
            'enviar_mensagem',

            async (
                dados,
                callback
            ) => {

                try {

                    const conversaId =
                        Number(

                            dados?.conversaId ||

                            dados?.conversa_id
                        );


                    const remetenteEmail =
                        normalizarEmail(

                            dados?.remetenteEmail ||

                            dados?.remetente_email ||

                            dados?.email ||

                            socket.data.email
                        );


                    const mensagem =
                        textoSeguro(

                            dados?.mensagem ||

                            dados?.texto
                        );


                    if (
                        !mensagem ||
                        mensagem.length >
                        5000
                    ) {

                        if (
                            typeof callback ===
                            'function'
                        ) {

                            callback({
                                sucesso:
                                    false,

                                erro:
                                    'Mensagem inválida.'
                            });
                        }


                        return;
                    }


                    const resultado =
                        await enviarMensagemChat({

                            conversaId,

                            remetenteEmail,

                            mensagem,

                            tipo:
                                dados?.tipo ||
                                'texto'
                        });


                    io
                        .to(
                            `conversa:${conversaId}`
                        )
                        .emit(
                            'nova_mensagem',
                            resultado.mensagem
                        );


                    io
                        .to(
                            `usuario:${normalizarEmail(
                                resultado.mensagem.destinatario_email
                            )}`
                        )
                        .emit(
                            'mensagem_recebida',
                            resultado.mensagem
                        );


                    if (
                        typeof callback ===
                        'function'
                    ) {

                        callback({
                            sucesso:
                                true,

                            mensagem:
                                resultado.mensagem
                        });
                    }

                } catch (
                    erro
                ) {

                    console.error(
                        'Socket mensagem:',
                        erro
                    );


                    if (
                        typeof callback ===
                        'function'
                    ) {

                        callback({
                            sucesso:
                                false,

                            erro:
                                erro.message ||
                                'Erro ao enviar mensagem.'
                        });
                    }
                }
            }
        );


        // ====================================================
        // DESCONECTOU
        // ====================================================

        socket.on(
            'disconnect',

            motivo => {

                console.log(
                    `🔴 Cliente desconectado: ${socket.id} (${motivo})`
                );
            }
        );
    }
);


// ============================================================
// HEALTH CHECK
//
// ÚTIL PARA RENDER
// ============================================================

app.get(
    '/health',

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


            return res
                .status(200)
                .json({
                    sucesso:
                        true,

                    sistema:
                        'RS Connect',

                    status:
                        'online',

                    banco:
                        'online',

                    ambiente:
                        NODE_ENV,

                    agora:
                        banco.rows[0]?.agora,

                    uptime:
                        Math.floor(
                            process.uptime()
                        )
                });

        } catch (
            erro
        ) {

            return res
                .status(503)
                .json({
                    sucesso:
                        false,

                    sistema:
                        'RS Connect',

                    status:
                        'degradado',

                    banco:
                        'offline'
                });
        }
    }
);


app.get(
    '/api/health',

    (
        req,
        res
    ) => {

        return res.json({
            sucesso:
                true,

            sistema:
                'RS Connect',

            status:
                'online',

            uptime:
                Math.floor(
                    process.uptime()
                )
        });
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

            const [
                usuarios,
                servicos,
                conversas,
                mensagens
            ] =
                await Promise.all([

                    pool.query(
                        `
                        SELECT
                            COUNT(*)::INTEGER
                            AS total

                        FROM usuarios
                        `
                    ),

                    pool.query(
                        `
                        SELECT
                            COUNT(*)::INTEGER
                            AS total

                        FROM servicos
                        `
                    ),

                    pool.query(
                        `
                        SELECT
                            COUNT(*)::INTEGER
                            AS total

                        FROM conversas
                        `
                    ),

                    pool.query(
                        `
                        SELECT
                            COUNT(*)::INTEGER
                            AS total

                        FROM mensagens_chat
                        `
                    )
                ]);


            return respostaSucesso(
                res,
                {
                    sistema:
                        'RS Connect',

                    usuarios:
                        Number(
                            usuarios.rows[0]?.total ||
                            0
                        ),

                    servicos:
                        Number(
                            servicos.rows[0]?.total ||
                            0
                        ),

                    conversas:
                        Number(
                            conversas.rows[0]?.total ||
                            0
                        ),

                    mensagens:
                        Number(
                            mensagens.rows[0]?.total ||
                            0
                        )
                }
            );

        } catch (
            erro
        ) {

            return respostaErro(
                res,
                500,
                'Erro ao consultar status.'
            );
        }
    }
);


// ============================================================
// MONITOR AUTOMÁTICO
//
// ACEITOU
// → AGUARDA CONFIRMAÇÃO
// → PRAZO EXPIROU?
// → REMOVE TITULAR
// → RESERVA 1 VIRA TITULAR
//
// INTERVALO DE 60 SEGUNDOS
// ============================================================

let monitorConfirmacaoExecutando =
    false;


async function executarMonitorConfirmacao() {

    if (
        monitorConfirmacaoExecutando
    ) {

        return;
    }


    monitorConfirmacaoExecutando =
        true;


    try {

        await verificarConfirmacoesExpiradas();

    } catch (
        erro
    ) {

        console.warn(
            '⚠️ Monitor automático:',
            erro.message
        );

    } finally {

        monitorConfirmacaoExecutando =
            false;
    }
}


let intervaloMonitorConfirmacao =
    null;


function iniciarMonitorConfirmacao() {

    if (
        intervaloMonitorConfirmacao
    ) {

        return;
    }


    intervaloMonitorConfirmacao =
        setInterval(
            executarMonitorConfirmacao,
            60 * 1000
        );


    if (
        typeof intervaloMonitorConfirmacao.unref ===
        'function'
    ) {

        intervaloMonitorConfirmacao
            .unref();
    }


    console.log(
        '⏱️ Monitor de confirmação iniciado.'
    );
}


// ============================================================
// LIMPEZA DE SESSÕES
// ============================================================

let intervaloLimpezaSessoes =
    null;


function iniciarLimpezaSessoes() {

    if (
        intervaloLimpezaSessoes
    ) {

        return;
    }


    intervaloLimpezaSessoes =
        setInterval(

            async () => {

                try {

                    await limparSessoesExpiradas();

                } catch (
                    erro
                ) {

                    console.warn(
                        'Limpeza sessões:',
                        erro.message
                    );
                }
            },

            60 * 60 * 1000
        );


    if (
        typeof intervaloLimpezaSessoes.unref ===
        'function'
    ) {

        intervaloLimpezaSessoes
            .unref();
    }
}


// ============================================================
// INDEX.HTML
//
// DEIXAR DEPOIS DAS ROTAS /API
// ============================================================

app.get(
    '/',

    (
        req,
        res
    ) => {

        const arquivo =
            path.join(
                __dirname,
                'index.html'
            );


        return res.sendFile(
            arquivo,

            erro => {

                if (erro) {

                    console.error(
                        'Index:',
                        erro.message
                    );


                    if (
                        !res.headersSent
                    ) {

                        return res
                            .status(500)
                            .send(
                                'RS Connect: index.html não encontrado.'
                            );
                    }
                }
            }
        );
    }
);


// ============================================================
// ROTAS DE FRONT-END
//
// PERMITE RECARREGAR A PÁGINA SEM DAR 404.
// NÃO INTERCEPTA /api.
// ============================================================

app.get(
    [
        '/login',
        '/cadastro',
        '/empresa',
        '/prestador',
        '/painel',
        '/radar',
        '/mensagens',
        '/financeiro',
        '/arquivo'
    ],

    (
        req,
        res
    ) => {

        return res.sendFile(
            path.join(
                __dirname,
                'index.html'
            )
        );
    }
);


// ============================================================
// 404 DA API
// ============================================================

app.use(
    '/api',

    (
        req,
        res
    ) => {

        return res
            .status(404)
            .json({
                sucesso:
                    false,

                erro:
                    'Rota da API não encontrada.',

                metodo:
                    req.method,

                rota:
                    req.originalUrl
            });
    }
);


// ============================================================
// ERRO DO MULTER
// ============================================================

app.use(
    (
        erro,
        req,
        res,
        next
    ) => {

        if (
            erro instanceof
            multer.MulterError
        ) {

            console.error(
                'Upload:',
                erro
            );


            if (
                erro.code ===
                'LIMIT_FILE_SIZE'
            ) {

                return respostaErro(
                    res,
                    413,
                    'Arquivo muito grande. Limite de 10 MB.'
                );
            }


            return respostaErro(
                res,
                400,
                'Erro no envio do arquivo.'
            );
        }


        return next(
            erro
        );
    }
);


// ============================================================
// TRATAMENTO GLOBAL DE ERROS EXPRESS
// ============================================================

app.use(
    (
        erro,
        req,
        res,
        next
    ) => {

        console.error(
            '❌ ERRO NÃO TRATADO:',
            erro
        );


        if (
            res.headersSent
        ) {

            return next(
                erro
            );
        }


        return res
            .status(500)
            .json({
                sucesso:
                    false,

                erro:
                    'Erro interno do RS Connect.'
            });
    }
);


// ============================================================
// ERROS DO PROCESSO
//
// NÃO USAMOS process.exit AQUI PARA ERROS NÃO FATAIS.
// ============================================================

process.on(
    'unhandledRejection',

    erro => {

        console.error(
            '❌ Promise rejeitada:',
            erro
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
// ENCERRAMENTO SEGURO
// ============================================================

let encerrando =
    false;


async function encerrarServidor(
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
        `🛑 Encerrando RS Connect: ${sinal}`
    );


    if (
        intervaloMonitorConfirmacao
    ) {

        clearInterval(
            intervaloMonitorConfirmacao
        );
    }


    if (
        intervaloLimpezaSessoes
    ) {

        clearInterval(
            intervaloLimpezaSessoes
        );
    }


    const timeout =
        setTimeout(
            () => {

                console.error(
                    '⚠️ Encerramento forçado.'
                );


                process.exit(1);
            },

            10000
        );


    if (
        typeof timeout.unref ===
        'function'
    ) {

        timeout.unref();
    }


    server.close(
        async () => {

            try {

                await pool.end();

            } catch (
                erro
            ) {

                console.warn(
                    'Fechar PostgreSQL:',
                    erro.message
                );
            }


            clearTimeout(
                timeout
            );


            console.log(
                '✅ RS Connect encerrado corretamente.'
            );


            process.exit(0);
        }
    );
}


process.on(
    'SIGTERM',

    () =>
        encerrarServidor(
            'SIGTERM'
        )
);


process.on(
    'SIGINT',

    () =>
        encerrarServidor(
            'SIGINT'
        )
);


// ============================================================
// INICIAR RS CONNECT
// ============================================================

async function iniciarRSConnect() {

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


    try {

        // ====================================================
        // 1. BANCO
        // ====================================================

        await inicializarBancoRS();


        // ====================================================
        // 2. MONITORES
        // ====================================================

        iniciarMonitorConfirmacao();


        iniciarLimpezaSessoes();


        // Executa uma vez imediatamente.
        await executarMonitorConfirmacao();


        // ====================================================
        // 3. SERVIDOR
        //
        // ESTE É O ÚNICO server.listen DO ARQUIVO.
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
                    `🚀 Porta: ${PORT}`
                );


                console.log(
                    '🔌 WebSocket: ONLINE'
                );


                console.log(
                    '🐘 PostgreSQL: ONLINE'
                );


                console.log(
                    '💬 Chat: ONLINE'
                );


                console.log(
                    '⏱️ Confirmação automática: ONLINE'
                );


                console.log(
                    '📁 Arquivo digital: ONLINE'
                );


                console.log(
                    '💰 Financeiro: ONLINE'
                );


                console.log(
                    '======================================'
                );
            }
        );


        server.on(
            'error',

            erro => {

                console.error(
                    '❌ Erro HTTP:',
                    erro
                );


                if (
                    erro.code ===
                    'EADDRINUSE'
                ) {

                    console.error(
                        `❌ A porta ${PORT} já está sendo utilizada.`
                    );
                }
            }
        );

    } catch (
        erro
    ) {

        console.error(
            '❌ RS Connect não conseguiu iniciar:',
            erro
        );


        process.exitCode =
            1;


        // ====================================================
        // AQUI O SERVIDOR NÃO DEVE FICAR "FINGINDO" ESTAR ONLINE
        // SE O BANCO NÃO CONSEGUIU SER PREPARADO.
        // ====================================================

        setTimeout(
            () => {

                process.exit(1);

            },
            1000
        );
    }
}


// ============================================================
// EXECUTAR
// ============================================================

iniciarRSConnect();


// ============================================================
// FIM DO SERVER.JS
// ============================================================
