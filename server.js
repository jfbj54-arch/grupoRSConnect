// ============================================================
// RS CONNECT — SERVER.JS COMPLETO
// LOGIN + SENHAS + SERVIÇOS + JORNADA + CLIENTES FIXOS
// CHAT + DOCUMENTOS + PAGAMENTOS + WEBSOCKET + RENDER
// ============================================================

const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');
const { Pool } = require('pg');
const multer = require('multer');
const crypto = require('crypto');


// ============================================================
// APP / HTTP / SOCKET
// ============================================================

const app = express();

const server = http.createServer(app);

const io = new Server(server, {
    cors: {
        origin: '*',
        methods: [
            'GET',
            'POST',
            'PUT',
            'PATCH',
            'DELETE'
        ]
    }
});


// ============================================================
// UPLOAD
// ============================================================

const upload = multer({
    limits: {
        fileSize: 10 * 1024 * 1024
    }
});


// ============================================================
// MIDDLEWARES
// ============================================================

app.use(
    express.json({
        limit: '15mb'
    })
);

app.use(
    express.urlencoded({
        extended: true,
        limit: '15mb'
    })
);

app.use(
    express.static(
        path.join(__dirname)
    )
);


// ============================================================
// POSTGRESQL
// ============================================================

const pool = new Pool({
    connectionString:
        process.env.DATABASE_URL,

    ssl:
        process.env.DATABASE_URL
            ? {
                rejectUnauthorized: false
            }
            : false
});


// ============================================================
// FUNÇÕES AUXILIARES
// ============================================================

function normalizarEmail(email) {
    return String(
        email || ''
    )
        .trim()
        .toLowerCase();
}


function horaAtualRS() {
    return new Date()
        .toLocaleTimeString(
            'pt-BR',
            {
                hour: '2-digit',
                minute: '2-digit',
                second: '2-digit',
                timeZone:
                    'America/Sao_Paulo'
            }
        );
}


function dataAtualRS() {
    return new Intl.DateTimeFormat(
        'en-CA',
        {
            timeZone:
                'America/Sao_Paulo',

            year:
                'numeric',

            month:
                '2-digit',

            day:
                '2-digit'
        }
    )
        .format(
            new Date()
        );
}


function numeroRS(valor) {

    if (
        typeof valor ===
        'number'
    ) {

        return Number.isFinite(valor)
            ? valor
            : 0;
    }


    let texto =
        String(
            valor ?? ''
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


    return Number.isFinite(numero)
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

        const resultado =
            JSON.parse(
                valor || '[]'
            );


        return Array.isArray(
            resultado
        )
            ? resultado
            : [];

    } catch {

        return [];
    }
}


// ============================================================
// SENHAS
// ============================================================

function gerarHashSenha(senha) {

    const salt =
        crypto
            .randomBytes(16)
            .toString('hex');


    const hash =
        crypto
            .scryptSync(
                String(senha),
                salt,
                64
            )
            .toString('hex');


    return `scrypt$${salt}$${hash}`;
}


function senhaEstaProtegida(valor) {

    return String(
        valor || ''
    )
        .startsWith(
            'scrypt$'
        );
}


function verificarSenha(
    senhaDigitada,
    senhaBanco
) {

    const digitada =
        String(
            senhaDigitada || ''
        );


    const banco =
        String(
            senhaBanco || ''
        );


    // COMPATIBILIDADE COM SENHAS ANTIGAS EM TEXTO
    if (
        !senhaEstaProtegida(
            banco
        )
    ) {

        return (
            digitada ===
            banco
        );
    }


    try {

        const partes =
            banco.split('$');


        if (
            partes.length !==
            3
        ) {

            return false;
        }


        const salt =
            partes[1];


        const hashBanco =
            partes[2];


        const hashDigitado =
            crypto
                .scryptSync(
                    digitada,
                    salt,
                    64
                )
                .toString('hex');


        const bufferBanco =
            Buffer.from(
                hashBanco,
                'hex'
            );


        const bufferDigitado =
            Buffer.from(
                hashDigitado,
                'hex'
            );


        if (
            bufferBanco.length !==
            bufferDigitado.length
        ) {

            return false;
        }


        return crypto.timingSafeEqual(
            bufferBanco,
            bufferDigitado
        );

    } catch {

        return false;
    }
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
                email ||
                'sistema',

                acao,

                detalhes ||
                ''
            ]
        );

    } catch (err) {

        console.error(
            'Auditoria:',
            err.message
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
                $1,
                $2,
                $3,
                $4
            )
            `,
            [
                servicoId,

                email ||
                'sistema',

                tipoMovimento,

                numeroRS(
                    valor
                )
            ]
        );

    } catch (err) {

        console.error(
            'Ledger:',
            err.message
        );
    }
}


// ============================================================
// BUSCAR SERVIÇO
// ============================================================

async function buscarServico(
    servicoId
) {

    const resultado =
        await pool.query(
            `
            SELECT *
            FROM servicos

            WHERE
                id = $1

            LIMIT 1
            `,
            [
                servicoId
            ]
        );


    return (
        resultado.rows[0]
        ||
        null
    );
}


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


function empresaEhResponsavel(
    servico,
    email
) {

    return (
        normalizarEmail(
            servico?.empresa_email
        )
        ===
        normalizarEmail(
            email
        )
    );
}


// ============================================================
// SOCKET — ATUALIZAÇÃO GERAL
// ============================================================

function emitirAtualizacao(
    servicoId = null
) {

    const dados = {

        servicoId,

        atualizadoEm:
            new Date()
                .toISOString()
    };


    io.emit(
        'atualizar_servicos',
        dados
    );


    io.emit(
        'servicosAtualizados',
        dados
    );


    io.emit(
        'servicos_atualizados',
        dados
    );
}


// ============================================================
// BANCO PRINCIPAL
// ============================================================

async function criarTabelas() {

    try {

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
                    DEFAULT CURRENT_TIMESTAMP
            );


            CREATE TABLE IF NOT EXISTS prestadores (
                id SERIAL PRIMARY KEY,

                email TEXT UNIQUE,

                reputacao NUMERIC(3,2)
                    DEFAULT 5.0,

                advertencias INTEGER
                    DEFAULT 0
            );


            CREATE TABLE IF NOT EXISTS servicos (
                id SERIAL PRIMARY KEY,

                titulo TEXT,

                categoria TEXT,

                local TEXT,

                cidade TEXT,

                endereco TEXT,

                valor TEXT,

                valor_diaria NUMERIC(10,2)
                    DEFAULT 0,

                valor_liquido NUMERIC(10,2)
                    DEFAULT 0,

                valor_total NUMERIC(10,2)
                    DEFAULT 0,

                data_horario TEXT,

                horario_fim TEXT,

                forma_pgto TEXT,

                descricao TEXT,

                contrato_texto TEXT,

                empresa_email TEXT,

                empresa_nome TEXT,

                empresa_whatsapp TEXT,

                responsavel_servico TEXT,

                whatsapp_responsavel TEXT,

                recorrencia TEXT
                    DEFAULT 'unico',

                status TEXT
                    DEFAULT 'ativo',

                motivo_cancelamento TEXT,

                prestador_email TEXT,

                prestador_id INTEGER,

                prestador_nome TEXT,

                prestador_pix TEXT,

                prestador_whatsapp TEXT,

                reservas JSONB
                    DEFAULT '[]'::jsonb,

                mensagens JSONB
                    DEFAULT '[]'::jsonb,

                selfie_confirmacao TEXT,

                presenca_confirmada BOOLEAN
                    DEFAULT FALSE,

                presenca_hora TEXT,

                presenca_latitude TEXT,

                presenca_longitude TEXT,

                presenca_precisao TEXT,

                status_checkin TEXT
                    DEFAULT 'pendente',

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

                contrato_assinado TEXT,

                contrato_assinado_em TIMESTAMP,

                nota_oficial TEXT,

                criado_em TIMESTAMP
                    DEFAULT CURRENT_TIMESTAMP
            );


            CREATE TABLE IF NOT EXISTS auditoria_sistema (
                id SERIAL PRIMARY KEY,

                usuario_email TEXT,

                acao TEXT NOT NULL,

                detalhes TEXT,

                criado_em TIMESTAMP
                    DEFAULT CURRENT_TIMESTAMP
            );


            CREATE TABLE IF NOT EXISTS ledger_transacoes (
                id SERIAL PRIMARY KEY,

                servico_id INTEGER,

                usuario_email TEXT,

                tipo_movimento TEXT,

                valor NUMERIC(12,2)
                    DEFAULT 0,

                status TEXT
                    DEFAULT 'PROCESSADO',

                criado_em TIMESTAMP
                    DEFAULT CURRENT_TIMESTAMP
            );


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
                    DEFAULT CURRENT_TIMESTAMP
            );


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


            CREATE TABLE IF NOT EXISTS conversas (
                id SERIAL PRIMARY KEY,

                servico_id INTEGER
                    NOT NULL,

                empresa_email TEXT
                    NOT NULL,

                prestador_email TEXT
                    NOT NULL,

                ativo BOOLEAN
                    DEFAULT TRUE,

                criado_em TIMESTAMP
                    DEFAULT CURRENT_TIMESTAMP,

                atualizado_em TIMESTAMP
                    DEFAULT CURRENT_TIMESTAMP,

                UNIQUE (
                    servico_id,
                    empresa_email,
                    prestador_email
                )
            );


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


        const alteracoes = [

            "ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS descricao TEXT;",

            "ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS criado_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP;",

            "ALTER TABLE servicos ADD COLUMN IF NOT EXISTS cidade TEXT;",

            "ALTER TABLE servicos ADD COLUMN IF NOT EXISTS empresa_nome TEXT;",

            "ALTER TABLE servicos ADD COLUMN IF NOT EXISTS empresa_email TEXT;",

            "ALTER TABLE servicos ADD COLUMN IF NOT EXISTS empresa_whatsapp TEXT;",

            "ALTER TABLE servicos ADD COLUMN IF NOT EXISTS valor_diaria NUMERIC(10,2) DEFAULT 0;",

            "ALTER TABLE servicos ADD COLUMN IF NOT EXISTS valor_liquido NUMERIC(10,2) DEFAULT 0;",

            "ALTER TABLE servicos ADD COLUMN IF NOT EXISTS valor_total NUMERIC(10,2) DEFAULT 0;",

            "ALTER TABLE servicos ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'ativo';",

            "ALTER TABLE servicos ADD COLUMN IF NOT EXISTS prestador_email TEXT;",

            "ALTER TABLE servicos ADD COLUMN IF NOT EXISTS prestador_nome TEXT;",

            "ALTER TABLE servicos ADD COLUMN IF NOT EXISTS prestador_pix TEXT;",

            "ALTER TABLE servicos ADD COLUMN IF NOT EXISTS prestador_whatsapp TEXT;",

            "ALTER TABLE servicos ADD COLUMN IF NOT EXISTS reservas JSONB DEFAULT '[]'::jsonb;",

            "ALTER TABLE servicos ADD COLUMN IF NOT EXISTS presenca_confirmada BOOLEAN DEFAULT FALSE;",

            "ALTER TABLE servicos ADD COLUMN IF NOT EXISTS presenca_hora TEXT;",

            "ALTER TABLE servicos ADD COLUMN IF NOT EXISTS presenca_latitude TEXT;",

            "ALTER TABLE servicos ADD COLUMN IF NOT EXISTS presenca_longitude TEXT;",

            "ALTER TABLE servicos ADD COLUMN IF NOT EXISTS presenca_precisao TEXT;",

            "ALTER TABLE servicos ADD COLUMN IF NOT EXISTS selfie_confirmacao TEXT;",

            "ALTER TABLE servicos ADD COLUMN IF NOT EXISTS status_checkin TEXT DEFAULT 'pendente';",

            "ALTER TABLE servicos ADD COLUMN IF NOT EXISTS checkin_hora TEXT;",

            "ALTER TABLE servicos ADD COLUMN IF NOT EXISTS checkin_foto TEXT;",

            "ALTER TABLE servicos ADD COLUMN IF NOT EXISTS checkin_latitude TEXT;",

            "ALTER TABLE servicos ADD COLUMN IF NOT EXISTS checkin_longitude TEXT;",

            "ALTER TABLE servicos ADD COLUMN IF NOT EXISTS intervalo_inicio TEXT;",

            "ALTER TABLE servicos ADD COLUMN IF NOT EXISTS intervalo_fim TEXT;",

            "ALTER TABLE servicos ADD COLUMN IF NOT EXISTS intervalo_retorno TEXT;",

            "ALTER TABLE servicos ADD COLUMN IF NOT EXISTS em_intervalo BOOLEAN DEFAULT FALSE;",

            "ALTER TABLE servicos ADD COLUMN IF NOT EXISTS checkout_hora TEXT;",

            "ALTER TABLE servicos ADD COLUMN IF NOT EXISTS checkout_foto TEXT;",

            "ALTER TABLE servicos ADD COLUMN IF NOT EXISTS checkout_latitude TEXT;",

            "ALTER TABLE servicos ADD COLUMN IF NOT EXISTS checkout_longitude TEXT;",

            "ALTER TABLE servicos ADD COLUMN IF NOT EXISTS validado_empresa BOOLEAN DEFAULT FALSE;",

            "ALTER TABLE servicos ADD COLUMN IF NOT EXISTS validado_em TIMESTAMP;",

            "ALTER TABLE servicos ADD COLUMN IF NOT EXISTS pagamento_autorizado BOOLEAN DEFAULT FALSE;",

            "ALTER TABLE servicos ADD COLUMN IF NOT EXISTS pagamento_autorizado_em TIMESTAMP;",

            "ALTER TABLE servicos ADD COLUMN IF NOT EXISTS pagamento_realizado BOOLEAN DEFAULT FALSE;",

            "ALTER TABLE servicos ADD COLUMN IF NOT EXISTS pagamento_realizado_em TIMESTAMP;",

            "ALTER TABLE servicos ADD COLUMN IF NOT EXISTS comprovante_pagamento BOOLEAN DEFAULT FALSE;",

            "ALTER TABLE servicos ADD COLUMN IF NOT EXISTS comprovante_pagamento_arquivo TEXT;",

            "ALTER TABLE servicos ADD COLUMN IF NOT EXISTS contrato_assinado TEXT;",

            "ALTER TABLE servicos ADD COLUMN IF NOT EXISTS contrato_assinado_em TIMESTAMP;",

            "ALTER TABLE servicos ADD COLUMN IF NOT EXISTS nota_oficial TEXT;"
        ];


        for (
            const sql
            of alteracoes
        ) {

            await pool.query(
                sql
            );
        }


        console.log(
            '✅ Banco principal verificado.'
        );

    } catch (err) {

        console.error(
            '❌ Erro ao preparar banco:',
            err
        );


        throw err;
    }
}


// ============================================================
// TABELAS DOS CLIENTES FIXOS / JORNADA
// ============================================================

async function criarTabelasJornadaClientes() {

    try {

        await pool.query(`
            CREATE TABLE IF NOT EXISTS clientes_rs (
                id SERIAL PRIMARY KEY,

                nome TEXT NOT NULL,

                cnpj TEXT,

                responsavel_nome TEXT,

                responsavel_email TEXT,

                responsavel_whatsapp TEXT,

                endereco TEXT,

                cidade TEXT,

                uf TEXT,

                latitude TEXT,

                longitude TEXT,

                ativo BOOLEAN
                    DEFAULT TRUE,

                criado_por TEXT,

                criado_em TIMESTAMP
                    DEFAULT CURRENT_TIMESTAMP,

                atualizado_em TIMESTAMP
                    DEFAULT CURRENT_TIMESTAMP
            );


            CREATE TABLE IF NOT EXISTS clientes_rs_colaboradores (
                id SERIAL PRIMARY KEY,

                cliente_id INTEGER
                    NOT NULL
                    REFERENCES clientes_rs(id)
                    ON DELETE CASCADE,

                colaborador_email TEXT
                    NOT NULL,

                colaborador_nome TEXT
                    NOT NULL,

                funcao TEXT,

                valor_tipo TEXT
                    DEFAULT 'dia',

                valor_base NUMERIC(12,2)
                    DEFAULT 0,

                horario_previsto TEXT,

                ativo BOOLEAN
                    DEFAULT TRUE,

                criado_por TEXT,

                criado_em TIMESTAMP
                    DEFAULT CURRENT_TIMESTAMP,

                atualizado_em TIMESTAMP
                    DEFAULT CURRENT_TIMESTAMP,

                UNIQUE (
                    cliente_id,
                    colaborador_email
                )
            );


            CREATE TABLE IF NOT EXISTS jornadas_clientes (
                id SERIAL PRIMARY KEY,

                cliente_id INTEGER
                    NOT NULL
                    REFERENCES clientes_rs(id)
                    ON DELETE CASCADE,

                colaborador_vinculo_id INTEGER
                    REFERENCES clientes_rs_colaboradores(id)
                    ON DELETE SET NULL,

                colaborador_email TEXT
                    NOT NULL,

                colaborador_nome TEXT
                    NOT NULL,

                funcao TEXT,

                data DATE
                    NOT NULL,

                horario_previsto TEXT,

                status TEXT
                    DEFAULT 'AUSENTE',

                entrada_em TIMESTAMPTZ,

                entrada_foto TEXT,

                entrada_latitude TEXT,

                entrada_longitude TEXT,

                entrada_precisao TEXT,

                entrada_validada BOOLEAN
                    DEFAULT FALSE,

                entrada_validada_por TEXT,

                entrada_validada_em TIMESTAMPTZ,

                intervalo_inicio_em TIMESTAMPTZ,

                intervalo_retorno_em TIMESTAMPTZ,

                saida_em TIMESTAMPTZ,

                saida_foto TEXT,

                saida_latitude TEXT,

                saida_longitude TEXT,

                saida_precisao TEXT,

                saida_validada BOOLEAN
                    DEFAULT FALSE,

                saida_validada_por TEXT,

                saida_validada_em TIMESTAMPTZ,

                total_minutos INTEGER
                    DEFAULT 0,

                total_horas NUMERIC(10,2)
                    DEFAULT 0,

                valor_tipo TEXT
                    DEFAULT 'dia',

                valor_base NUMERIC(12,2)
                    DEFAULT 0,

                valor_gerado NUMERIC(12,2)
                    DEFAULT 0,

                fechada BOOLEAN
                    DEFAULT FALSE,

                fechada_por TEXT,

                fechada_em TIMESTAMPTZ,

                observacoes TEXT,

                criado_em TIMESTAMP
                    DEFAULT CURRENT_TIMESTAMP,

                atualizado_em TIMESTAMP
                    DEFAULT CURRENT_TIMESTAMP,

                UNIQUE (
                    cliente_id,
                    colaborador_email,
                    data
                )
            );


            CREATE TABLE IF NOT EXISTS jornadas_clientes_documentos (
                id SERIAL PRIMARY KEY,

                jornada_id INTEGER
                    NOT NULL
                    REFERENCES jornadas_clientes(id)
                    ON DELETE CASCADE,

                tipo TEXT
                    DEFAULT 'DOCUMENTO',

                nome TEXT
                    NOT NULL,

                mime TEXT
                    DEFAULT 'application/pdf',

                arquivo BYTEA
                    NOT NULL,

                assinatura_status TEXT
                    DEFAULT 'NAO_ASSINADO',

                assinado_por TEXT,

                assinado_em TIMESTAMPTZ,

                criado_por TEXT,

                criado_em TIMESTAMP
                    DEFAULT CURRENT_TIMESTAMP
            );


            CREATE TABLE IF NOT EXISTS fechamentos_clientes (
                id SERIAL PRIMARY KEY,

                cliente_id INTEGER
                    NOT NULL
                    REFERENCES clientes_rs(id)
                    ON DELETE CASCADE,

                data DATE
                    NOT NULL,

                confirmado BOOLEAN
                    DEFAULT TRUE,

                confirmado_por TEXT,

                confirmado_em TIMESTAMPTZ
                    DEFAULT CURRENT_TIMESTAMP,

                observacoes TEXT,

                UNIQUE (
                    cliente_id,
                    data
                )
            );
        `);


        await pool.query(`
            CREATE INDEX IF NOT EXISTS
                idx_clientes_rs_nome

            ON clientes_rs(nome);
        `);


        await pool.query(`
            CREATE INDEX IF NOT EXISTS
                idx_colaborador_email

            ON clientes_rs_colaboradores(
                LOWER(colaborador_email)
            );
        `);


        await pool.query(`
            CREATE INDEX IF NOT EXISTS
                idx_jornada_cliente_data

            ON jornadas_clientes(
                cliente_id,
                data
            );
        `);


        await pool.query(`
            CREATE INDEX IF NOT EXISTS
                idx_jornada_email_data

            ON jornadas_clientes(
                LOWER(colaborador_email),
                data
            );
        `);


        console.log(
            '✅ Clientes fixos e Jornada verificados.'
        );

    } catch (err) {

        console.error(
            '❌ Erro Jornada clientes:',
            err
        );


        throw err;
    }
}


// ============================================================
// GERAR JORNADA DO DIA
// ============================================================

async function garantirJornadasDiaCliente(
    clienteId,
    data = dataAtualRS()
) {

    await pool.query(
        `
        INSERT INTO jornadas_clientes (
            cliente_id,
            colaborador_vinculo_id,
            colaborador_email,
            colaborador_nome,
            funcao,
            data,
            horario_previsto,
            valor_tipo,
            valor_base
        )

        SELECT
            vinculo.cliente_id,

            vinculo.id,

            LOWER(
                vinculo.colaborador_email
            ),

            vinculo.colaborador_nome,

            vinculo.funcao,

            $2::date,

            vinculo.horario_previsto,

            vinculo.valor_tipo,

            vinculo.valor_base

        FROM
            clientes_rs_colaboradores
            AS vinculo

        WHERE
            vinculo.cliente_id =
            $1

        AND
            vinculo.ativo =
            TRUE

        ON CONFLICT (
            cliente_id,
            colaborador_email,
            data
        )

        DO UPDATE SET

            colaborador_nome =
                EXCLUDED.colaborador_nome,

            funcao =
                EXCLUDED.funcao,

            horario_previsto =
                EXCLUDED.horario_previsto,

            valor_tipo =
                EXCLUDED.valor_tipo,

            valor_base =
                EXCLUDED.valor_base,

            atualizado_em =
                CURRENT_TIMESTAMP
        `,
        [
            clienteId,
            data
        ]
    );
}


// ============================================================
// BUSCAR JORNADA
// ============================================================

async function buscarJornadaCliente(
    jornadaId
) {

    const resultado =
        await pool.query(
            `
            SELECT

                jornada.*,

                cliente.nome
                    AS cliente_nome,

                cliente.endereco
                    AS cliente_endereco,

                cliente.cidade
                    AS cliente_cidade,

                cliente.uf
                    AS cliente_uf,

                cliente.latitude
                    AS cliente_latitude,

                cliente.longitude
                    AS cliente_longitude,

                cliente.responsavel_nome,

                cliente.responsavel_email,

                cliente.responsavel_whatsapp

            FROM
                jornadas_clientes
                AS jornada

            JOIN
                clientes_rs
                AS cliente

            ON
                cliente.id =
                jornada.cliente_id

            WHERE
                jornada.id =
                $1

            LIMIT 1
            `,
            [
                jornadaId
            ]
        );


    return (
        resultado.rows[0]
        ||
        null
    );
}


// ============================================================
// RECALCULAR HORAS / VALOR
// ============================================================

async function recalcularJornadaCliente(
    jornadaId
) {

    const jornada =
        await buscarJornadaCliente(
            jornadaId
        );


    if (!jornada) {
        return null;
    }


    let totalMinutos =
        0;


    if (
        jornada.entrada_em &&
        jornada.saida_em
    ) {

        totalMinutos =
            Math.max(
                0,

                Math.round(
                    (
                        new Date(
                            jornada.saida_em
                        )
                        -
                        new Date(
                            jornada.entrada_em
                        )
                    )
                    /
                    60000
                )
            );


        if (
            jornada.intervalo_inicio_em &&
            jornada.intervalo_retorno_em
        ) {

            const intervalo =
                Math.max(
                    0,

                    Math.round(
                        (
                            new Date(
                                jornada.intervalo_retorno_em
                            )
                            -
                            new Date(
                                jornada.intervalo_inicio_em
                            )
                        )
                        /
                        60000
                    )
                );


            totalMinutos =
                Math.max(
                    0,

                    totalMinutos -
                    intervalo
                );
        }
    }


    const totalHoras =
        Number(
            (
                totalMinutos /
                60
            )
                .toFixed(2)
        );


    const valorBase =
        numeroRS(
            jornada.valor_base
        );


    let valorGerado =
        0;


    if (
        jornada.saida_em
    ) {

        if (
            String(
                jornada.valor_tipo ||
                ''
            )
                .toLowerCase()
            ===
            'hora'
        ) {

            valorGerado =
                Number(
                    (
                        totalHoras *
                        valorBase
                    )
                        .toFixed(2)
                );

        } else {

            valorGerado =
                valorBase;
        }
    }


    const resultado =
        await pool.query(
            `
            UPDATE jornadas_clientes

            SET
                total_minutos =
                    $1,

                total_horas =
                    $2,

                valor_gerado =
                    $3,

                atualizado_em =
                    CURRENT_TIMESTAMP

            WHERE
                id =
                $4

            RETURNING *
            `,
            [
                totalMinutos,
                totalHoras,
                valorGerado,
                jornadaId
            ]
        );


    return resultado.rows[0];
}


// ============================================================
// HEALTH
// ============================================================

app.get(
    '/api/health',

    async (req, res) => {

        try {

            await pool.query(
                'SELECT 1'
            );


            return res.json({
                sucesso: true,

                sistema:
                    'RS Connect',

                banco:
                    'online',

                horario:
                    horaAtualRS()
            });

        } catch (err) {

            return res
                .status(500)
                .json({
                    sucesso: false,

                    banco:
                        'offline'
                });
        }
    }
);


// ============================================================
// CADASTRO
// ============================================================

async function cadastrarUsuarioRS(
    req,
    res
) {

    const dados =
        req.body || {};


    const email =
        normalizarEmail(
            dados.email
        );


    const nome =
        String(
            dados.nome ||
            ''
        )
            .trim();


    const senha =
        String(
            dados.senha ||
            dados.password ||
            ''
        );


    if (
        !email ||
        !nome ||
        !senha
    ) {

        return res
            .status(400)
            .json({
                sucesso: false,

                erro:
                    'Nome, e-mail e senha são obrigatórios.'
            });
    }


    if (
        senha.length <
        6
    ) {

        return res
            .status(400)
            .json({
                sucesso: false,

                erro:
                    'A senha precisa ter no mínimo 6 caracteres.'
            });
    }


    try {

        const existente =
            await pool.query(
                `
                SELECT id
                FROM usuarios

                WHERE
                    LOWER(TRIM(email))
                    =
                    LOWER(TRIM($1))

                LIMIT 1
                `,
                [
                    email
                ]
            );


        if (
            existente.rows.length
        ) {

            return res
                .status(409)
                .json({
                    sucesso: false,

                    erro:
                        'Este e-mail já está cadastrado.'
                });
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
                    descricao
                )

                VALUES (
                    $1,$2,$3,$4,
                    $5,$6,$7,$8,
                    $9,$10,$11,$12,
                    $13,$14,$15,$16
                )

                RETURNING *
                `,
                [
                    dados.tipo ||
                    'prestador',

                    nome,

                    dados.doc ||
                    '',

                    dados.responsavel ||
                    '',

                    email,

                    senhaProtegida,

                    dados.whatsapp ||
                    '',

                    dados.endereco ||
                    '',

                    dados.rgCnh ||
                    dados.rg_cnh ||
                    '',

                    dados.profissao ||
                    '',

                    dados.tipoChavePix ||
                    dados.tipo_chave_pix ||
                    '',

                    dados.pix ||
                    '',

                    dados.banco ||
                    '',

                    dados.conta ||
                    '',

                    dados.experiencia ||
                    '',

                    dados.descricao ||
                    ''
                ]
            );


        if (
            String(
                dados.tipo ||
                ''
            )
                .toLowerCase()
            ===
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


        const usuario = {
            ...resultado.rows[0]
        };


        delete usuario.senha;


        return res.json({
            sucesso: true,
            usuario
        });

    } catch (err) {

        console.error(
            '❌ Cadastro:',
            err
        );


        return res
            .status(500)
            .json({
                sucesso: false,

                erro:
                    'Erro ao cadastrar usuário.'
            });
    }
}


app.post(
    '/api/cadastro',
    cadastrarUsuarioRS
);


app.post(
    '/api/auth/cadastro',
    cadastrarUsuarioRS
);


app.post(
    '/api/auth/registrar',
    cadastrarUsuarioRS
);


// ============================================================
// LOGIN
// ============================================================

async function loginUsuarioRS(
    req,
    res
) {

    const email =
        normalizarEmail(
            req.body?.email
        );


    const senha =
        String(
            req.body?.senha ??
            req.body?.password ??
            ''
        );


    if (
        !email ||
        !senha
    ) {

        return res
            .status(400)
            .json({
                sucesso: false,

                erro:
                    'Informe e-mail e senha.'
            });
    }


    try {

        const resultado =
            await pool.query(
                `
                SELECT *
                FROM usuarios

                WHERE
                    LOWER(TRIM(email))
                    =
                    LOWER(TRIM($1))

                LIMIT 1
                `,
                [
                    email
                ]
            );


        if (
            !resultado.rows.length
        ) {

            console.log(
                `⚠️ LOGIN — usuário não encontrado: ${email}`
            );


            return res
                .status(401)
                .json({
                    sucesso: false,

                    erro:
                        'E-mail ou senha incorretos.'
                });
        }


        const usuarioBanco =
            resultado.rows[0];


        const senhaCorreta =
            verificarSenha(
                senha,
                usuarioBanco.senha
            );


        if (
            !senhaCorreta
        ) {

            console.log(
                `⚠️ LOGIN — senha incorreta: ${email}`
            );


            return res
                .status(401)
                .json({
                    sucesso: false,

                    erro:
                        'E-mail ou senha incorretos.'
                });
        }


        // MIGRA SENHAS ANTIGAS
        if (
            !senhaEstaProtegida(
                usuarioBanco.senha
            )
        ) {

            const hash =
                gerarHashSenha(
                    senha
                );


            await pool.query(
                `
                UPDATE usuarios

                SET
                    senha =
                        $1

                WHERE
                    id =
                        $2
                `,
                [
                    hash,
                    usuarioBanco.id
                ]
            );


            console.log(
                `🔐 Senha antiga migrada: ${email}`
            );
        }


        const usuario = {
            ...usuarioBanco
        };


        delete usuario.senha;


        await registrarAuditoria(
            email,
            'LOGIN',
            'Login realizado com sucesso.'
        );


        console.log(
            `✅ LOGIN OK: ${email}`
        );


        return res.json({
            sucesso: true,
            usuario
        });

    } catch (err) {

        console.error(
            '❌ Erro login:',
            err
        );


        return res
            .status(500)
            .json({
                sucesso: false,

                erro:
                    'Erro interno no login.'
            });
    }
}


app.post(
    '/api/login',
    loginUsuarioRS
);


app.post(
    '/api/auth/login',
    loginUsuarioRS
);


// ============================================================
// ALTERAR A PRÓPRIA SENHA
// ============================================================

async function alterarSenhaRS(
    req,
    res
) {

    const email =
        normalizarEmail(
            req.body?.email
        );


    const senhaAtual =
        String(
            req.body?.senhaAtual ||
            req.body?.senha_atual ||
            ''
        );


    const novaSenha =
        String(
            req.body?.novaSenha ||
            req.body?.nova_senha ||
            ''
        );


    if (
        !email ||
        !senhaAtual ||
        !novaSenha
    ) {

        return res
            .status(400)
            .json({
                sucesso: false,

                erro:
                    'Informe e-mail, senha atual e nova senha.'
            });
    }


    if (
        novaSenha.length <
        6
    ) {

        return res
            .status(400)
            .json({
                sucesso: false,

                erro:
                    'A nova senha precisa ter no mínimo 6 caracteres.'
            });
    }


    try {

        const resultado =
            await pool.query(
                `
                SELECT *
                FROM usuarios

                WHERE
                    LOWER(TRIM(email))
                    =
                    LOWER(TRIM($1))

                LIMIT 1
                `,
                [
                    email
                ]
            );


        if (
            !resultado.rows.length
        ) {

            return res
                .status(404)
                .json({
                    sucesso: false,

                    erro:
                        'Usuário não encontrado.'
                });
        }


        const usuario =
            resultado.rows[0];


        if (
            !verificarSenha(
                senhaAtual,
                usuario.senha
            )
        ) {

            return res
                .status(401)
                .json({
                    sucesso: false,

                    erro:
                        'Senha atual incorreta.'
                });
        }


        const hash =
            gerarHashSenha(
                novaSenha
            );


        await pool.query(
            `
            UPDATE usuarios

            SET
                senha =
                    $1

            WHERE
                id =
                    $2
            `,
            [
                hash,
                usuario.id
            ]
        );


        await registrarAuditoria(
            email,
            'ALTERAR_SENHA',
            'Senha alterada pelo usuário.'
        );


        return res.json({
            sucesso: true,

            mensagem:
                'Senha alterada com sucesso.'
        });

    } catch (err) {

        console.error(
            '❌ Alterar senha:',
            err
        );


        return res
            .status(500)
            .json({
                sucesso: false,

                erro:
                    'Erro ao alterar senha.'
            });
    }
}


app.post(
    '/api/alterar-senha',
    alterarSenhaRS
);


app.post(
    '/api/auth/alterar-senha',
    alterarSenhaRS
);


// ============================================================
// RECUPERAÇÃO SEGURA PELO ADMINISTRADOR
//
// NO RENDER:
// ADMIN_EMAIL = email da conta administradora
//
// O ADMIN CONFIRMA A PRÓPRIA SENHA.
// NÃO EXISTE ADMIN_RESET_KEY NA TELA.
// ============================================================

app.post(
    '/api/admin/redefinir-senha-segura',

    async (req, res) => {

        try {

            const adminEmail =
                normalizarEmail(
                    req.body?.adminEmail
                );


            const adminSenha =
                String(
                    req.body?.adminSenha ||
                    ''
                );


            const alvoEmail =
                normalizarEmail(
                    req.body?.email
                );


            const novaSenha =
                String(
                    req.body?.novaSenha ||
                    ''
                );


            const adminPermitido =
                normalizarEmail(
                    process.env.ADMIN_EMAIL
                );


            if (
                !adminPermitido
            ) {

                return res
                    .status(503)
                    .json({
                        sucesso: false,

                        erro:
                            'ADMIN_EMAIL não configurado no Render.'
                    });
            }


            if (
                !adminEmail ||
                !adminSenha ||
                !alvoEmail ||
                novaSenha.length <
                6
            ) {

                return res
                    .status(400)
                    .json({
                        sucesso: false,

                        erro:
                            'Preencha os dados e use uma nova senha com no mínimo 6 caracteres.'
                    });
            }


            if (
                adminEmail !==
                adminPermitido
            ) {

                return res
                    .status(403)
                    .json({
                        sucesso: false,

                        erro:
                            'Administrador não autorizado.'
                    });
            }


            const adminRes =
                await pool.query(
                    `
                    SELECT
                        id,
                        nome,
                        email,
                        tipo,
                        senha

                    FROM usuarios

                    WHERE
                        LOWER(TRIM(email))
                        =
                        LOWER(TRIM($1))

                    LIMIT 1
                    `,
                    [
                        adminEmail
                    ]
                );


            const admin =
                adminRes.rows[0];


            if (
                !admin ||
                !verificarSenha(
                    adminSenha,
                    admin.senha
                )
            ) {

                return res
                    .status(401)
                    .json({
                        sucesso: false,

                        erro:
                            'Senha atual do administrador incorreta.'
                    });
            }


            const alvoRes =
                await pool.query(
                    `
                    SELECT
                        id,
                        nome,
                        email

                    FROM usuarios

                    WHERE
                        LOWER(TRIM(email))
                        =
                        LOWER(TRIM($1))

                    LIMIT 1
                    `,
                    [
                        alvoEmail
                    ]
                );


            const alvo =
                alvoRes.rows[0];


            if (!alvo) {

                return res
                    .status(404)
                    .json({
                        sucesso: false,

                        erro:
                            'Conta não encontrada.'
                    });
            }


            const hash =
                gerarHashSenha(
                    novaSenha
                );


            await pool.query(
                `
                UPDATE usuarios

                SET
                    senha =
                        $1

                WHERE
                    id =
                        $2
                `,
                [
                    hash,
                    alvo.id
                ]
            );


            await registrarAuditoria(
                adminEmail,

                'RESET_SENHA_SUPORTE',

                `Acesso redefinido para ${alvoEmail}.`
            );


            console.log(
                `🔐 Suporte redefiniu a senha de ${alvoEmail}`
            );


            return res.json({
                sucesso: true,

                mensagem:
                    'Senha redefinida com sucesso.',

                usuario: {
                    id:
                        alvo.id,

                    nome:
                        alvo.nome,

                    email:
                        alvo.email
                }
            });

        } catch (err) {

            console.error(
                '❌ Recuperação segura:',
                err
            );


            return res
                .status(500)
                .json({
                    sucesso: false,

                    erro:
                        'Erro ao redefinir o acesso.'
                });
        }
    }
);


// ============================================================
// CONSULTAR SE CONTA EXISTE
// ============================================================

app.post(
    '/api/conta/existe',

    async (req, res) => {

        try {

            const email =
                normalizarEmail(
                    req.body?.email
                );


            if (!email) {

                return res
                    .status(400)
                    .json({
                        sucesso: false,

                        erro:
                            'Informe o e-mail.'
                    });
            }


            const resultado =
                await pool.query(
                    `
                    SELECT
                        id,
                        nome,
                        email,
                        tipo

                    FROM usuarios

                    WHERE
                        LOWER(TRIM(email))
                        =
                        LOWER(TRIM($1))

                    LIMIT 1
                    `,
                    [
                        email
                    ]
                );


            return res.json({
                sucesso: true,

                existe:
                    resultado.rows.length >
                    0
            });

        } catch (err) {

            return res
                .status(500)
                .json({
                    sucesso: false,

                    erro:
                        'Erro ao consultar conta.'
                });
        }
    }
);


// ============================================================
// LISTAR SERVIÇOS
// ============================================================

app.get(
    '/api/servicos',

    async (req, res) => {

        try {

            const resultado =
                await pool.query(
                    `
                    SELECT *
                    FROM servicos

                    ORDER BY
                        id DESC
                    `
                );


            return res.json(
                resultado.rows
            );

        } catch (err) {

            console.error(
                '❌ Erro ao buscar serviços:',
                err
            );


            return res
                .status(500)
                .json({
                    sucesso: false,

                    erro:
                        'Erro ao buscar serviços.'
                });
        }
    }
);


// ============================================================
// SERVIÇO INDIVIDUAL
// ============================================================

app.get(
    '/api/servicos/:id',

    async (req, res) => {

        try {

            const servico =
                await buscarServico(
                    Number(
                        req.params.id
                    )
                );


            if (!servico) {

                return res
                    .status(404)
                    .json({
                        sucesso: false,

                        erro:
                            'Serviço não encontrado.'
                    });
            }


            return res.json({
                sucesso: true,
                servico
            });

        } catch (err) {

            return res
                .status(500)
                .json({
                    sucesso: false,

                    erro:
                        'Erro ao buscar serviço.'
                });
        }
    }
);


// ============================================================
// PUBLICAR SERVIÇO
// ============================================================

app.post(
    '/api/servicos',

    async (req, res) => {

        const dados =
            req.body || {};


        try {

            const empresaEmail =
                normalizarEmail(
                    dados.empresaEmail ||
                    dados.empresa_email ||
                    dados.email
                );


            const valorUnitario =
                numeroRS(
                    dados.valor ??
                    dados.valor_diaria
                );


            const recorrencia =
                String(
                    dados.recorrencia ||
                    'unico'
                )
                    .toLowerCase();


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


            const taxa =
                valorTotal *
                0.10;


            const valorLiquido =
                valorTotal -
                taxa;


            let empresaNome =
                String(
                    dados.empresaNome ||
                    dados.empresa_nome ||
                    ''
                )
                    .trim();


            if (
                !empresaNome &&
                empresaEmail
            ) {

                const empresaRes =
                    await pool.query(
                        `
                        SELECT nome
                        FROM usuarios

                        WHERE
                            LOWER(TRIM(email))
                            =
                            LOWER(TRIM($1))

                        LIMIT 1
                        `,
                        [
                            empresaEmail
                        ]
                    );


                empresaNome =
                    empresaRes.rows[0]?.nome ||
                    '';
            }


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
                        data_horario,
                        horario_fim,
                        forma_pgto,
                        descricao,
                        contrato_texto,
                        empresa_email,
                        empresa_nome,
                        empresa_whatsapp,
                        responsavel_servico,
                        whatsapp_responsavel,
                        recorrencia,
                        status
                    )

                    VALUES (
                        $1,$2,$3,$4,$5,
                        $6,$7,$8,$9,$10,
                        $11,$12,$13,$14,$15,
                        $16,$17,$18,$19,$20,
                        'ativo'
                    )

                    RETURNING *
                    `,
                    [
                        dados.titulo ||
                        'Serviço',

                        dados.categoria ||
                        'Geral',

                        dados.local ||
                        dados.cidade ||
                        '',

                        dados.cidade ||
                        dados.local ||
                        '',

                        dados.endereco ||
                        '',

                        String(
                            valorUnitario
                        ),

                        valorUnitario,

                        valorLiquido,

                        valorTotal,

                        dados.dataHorario ||
                        dados.data_horario ||
                        (
                            dados.data &&
                            (
                                dados.horario ||
                                dados.horario_inicio
                            )

                                ?

                                `${dados.data}T${
                                    dados.horario ||
                                    dados.horario_inicio
                                }`

                                :

                                dados.data ||
                                'A combinar'
                        ),

                        dados.horarioFim ||
                        dados.horario_fim ||
                        '',

                        dados.formaPgto ||
                        dados.formaPagamento ||
                        dados.forma_pgto ||
                        dados.pagamento ||
                        'Pix',

                        dados.descricao ||
                        '',

                        dados.contratoTexto ||
                        dados.contrato_texto ||
                        dados.contrato ||
                        '',

                        empresaEmail,

                        empresaNome,

                        dados.empresaWhatsapp ||
                        dados.empresa_whatsapp ||
                        '',

                        dados.responsavelServico ||
                        dados.responsavel_servico ||
                        '',

                        dados.whatsappResponsavel ||
                        dados.whatsapp_responsavel ||
                        '',

                        recorrencia
                    ]
                );


            const servico =
                resultado.rows[0];


            await registrarLedger(
                servico.id,
                empresaEmail,
                'RETENCAO_GARANTIA',
                valorTotal
            );


            await registrarAuditoria(
                empresaEmail,
                'PUBLICAR_SERVICO',
                `Serviço #${servico.id} publicado.`
            );


            emitirAtualizacao(
                servico.id
            );


            return res.json({
                sucesso: true,
                servico
            });

        } catch (err) {

            console.error(
                '❌ Publicar serviço:',
                err
            );


            return res
                .status(500)
                .json({
                    sucesso: false,

                    erro:
                        'Erro ao publicar serviço: ' +
                        err.message
                });
        }
    }
);


// ============================================================
// ACEITAR VAGA
// ============================================================

app.post(
    '/api/servicos/:id/aceitar',

    async (req, res) => {

        const servicoId =
            Number(
                req.params.id
            );


        try {

            const servico =
                await buscarServico(
                    servicoId
                );


            if (!servico) {

                return res
                    .status(404)
                    .json({
                        sucesso: false,

                        erro:
                            'Serviço não encontrado.'
                    });
            }


            const prestadorEmail =
                normalizarEmail(
                    req.body?.prestadorEmail ||
                    req.body?.prestador_email ||
                    req.body?.email
                );


            const prestadorNome =
                String(
                    req.body?.prestadorNome ||
                    req.body?.prestador_nome ||
                    prestadorEmail
                );


            const prestadorPix =
                String(
                    req.body?.prestadorPix ||
                    req.body?.prestador_pix ||
                    ''
                );


            const prestadorWhatsapp =
                String(
                    req.body?.prestadorWhatsapp ||
                    req.body?.prestador_whatsapp ||
                    ''
                );


            if (!prestadorEmail) {

                return res
                    .status(400)
                    .json({
                        sucesso: false,

                        erro:
                            'Prestador não informado.'
                    });
            }


            const statusServico =
                String(
                    servico.status ||
                    ''
                )
                    .toLowerCase();


            if (
                statusServico ===
                'cancelado'

                ||

                statusServico ===
                'finalizado'

                ||

                statusServico ===
                'pago'
            ) {

                return res
                    .status(409)
                    .json({
                        sucesso: false,

                        erro:
                            'Esta vaga não está mais disponível.'
                    });
            }


            let reservas =
                parseReservas(
                    servico.reservas
                );


            if (
                normalizarEmail(
                    servico.prestador_email
                )
                ===
                prestadorEmail
            ) {

                return res
                    .status(400)
                    .json({
                        sucesso: false,

                        erro:
                            'Você já é o Titular desta vaga.'
                    });
            }


            const jaReserva =
                reservas.some(
                    reserva =>
                        normalizarEmail(
                            typeof reserva ===
                            'string'

                                ?

                                reserva

                                :

                                reserva.email ||
                                reserva.prestadorEmail ||
                                reserva.prestador_email
                        )
                        ===
                        prestadorEmail
                );


            if (jaReserva) {

                return res
                    .status(400)
                    .json({
                        sucesso: false,

                        erro:
                            'Você já está na reserva desta vaga.'
                    });
            }


            // TITULAR
            if (
                !servico.prestador_email
            ) {

                const resultado =
                    await pool.query(
                        `
                        UPDATE servicos

                        SET
                            prestador_email =
                                $1,

                            prestador_nome =
                                $2,

                            prestador_pix =
                                $3,

                            prestador_whatsapp =
                                $4,

                            prestador_id = (
                                SELECT id
                                FROM usuarios

                                WHERE
                                    LOWER(TRIM(email))
                                    =
                                    LOWER(TRIM($1))

                                LIMIT 1
                            ),

                            status =
                                'aguardando_confirmacao'

                        WHERE
                            id =
                            $5

                        RETURNING *
                        `,
                        [
                            prestadorEmail,
                            prestadorNome,
                            prestadorPix,
                            prestadorWhatsapp,
                            servicoId
                        ]
                    );


                await registrarAuditoria(
                    prestadorEmail,
                    'ACEITAR_VAGA_TITULAR',
                    `Prestador assumiu como Titular do serviço #${servicoId}.`
                );


                emitirAtualizacao(
                    servicoId
                );


                return res.json({
                    sucesso: true,

                    mensagem:
                        'Você assumiu a vaga como Titular.',

                    posicao:
                        'titular',

                    servico:
                        resultado.rows[0]
                });
            }


            // RESERVAS
            if (
                reservas.length >=
                2
            ) {

                return res
                    .status(409)
                    .json({
                        sucesso: false,

                        erro:
                            'Esta vaga já possui Titular e duas Reservas.'
                    });
            }


            reservas.push({

                email:
                    prestadorEmail,

                nome:
                    prestadorNome,

                pix:
                    prestadorPix,

                whatsapp:
                    prestadorWhatsapp,

                criadoEm:
                    new Date()
                        .toISOString()
            });


            const resultado =
                await pool.query(
                    `
                    UPDATE servicos

                    SET
                        reservas =
                            $1::jsonb

                    WHERE
                        id =
                        $2

                    RETURNING *
                    `,
                    [
                        JSON.stringify(
                            reservas
                        ),

                        servicoId
                    ]
                );


            await registrarAuditoria(
                prestadorEmail,
                'ENTRAR_RESERVA',
                `Prestador entrou na reserva do serviço #${servicoId}.`
            );


            emitirAtualizacao(
                servicoId
            );


            return res.json({
                sucesso: true,

                mensagem:
                    `Você entrou como Reserva ${reservas.length}.`,

                posicao:
                    `reserva_${reservas.length}`,

                servico:
                    resultado.rows[0]
            });

        } catch (err) {

            console.error(
                '❌ Aceitar vaga:',
                err
            );


            return res
                .status(500)
                .json({
                    sucesso: false,

                    erro:
                        'Erro ao aceitar vaga.'
                });
        }
    }
);


// ============================================================
// SAIR DA VAGA
// ============================================================

app.post(
    '/api/servicos/:id/sair-vaga',

    async (req, res) => {

        const servicoId =
            Number(
                req.params.id
            );


        const email =
            normalizarEmail(
                req.body?.email ||
                req.body?.prestadorEmail ||
                req.body?.prestador_email
            );


        try {

            const servico =
                await buscarServico(
                    servicoId
                );


            if (!servico) {

                return res
                    .status(404)
                    .json({
                        sucesso: false,

                        erro:
                            'Serviço não encontrado.'
                    });
            }


            let reservas =
                parseReservas(
                    servico.reservas
                );


            const ehTitular =
                prestadorEhTitular(
                    servico,
                    email
                );


            const indiceReserva =
                reservas.findIndex(
                    reserva =>
                        normalizarEmail(
                            typeof reserva ===
                            'string'

                                ?

                                reserva

                                :

                                reserva.email ||
                                reserva.prestadorEmail ||
                                reserva.prestador_email
                        )
                        ===
                        email
                );


            if (
                !ehTitular &&
                indiceReserva === -1
            ) {

                return res
                    .status(400)
                    .json({
                        sucesso: false,

                        erro:
                            'Você não está vinculado a esta vaga.'
                    });
            }


            if (ehTitular) {

                if (
                    servico.presenca_confirmada ||
                    servico.checkin_hora ||
                    servico.intervalo_inicio ||
                    servico.checkout_hora
                ) {

                    return res
                        .status(409)
                        .json({
                            sucesso: false,

                            erro:
                                'A jornada já foi iniciada. Não é possível sair da vaga.'
                        });
                }


                const novoTitular =
                    reservas.length
                        ?
                        reservas.shift()
                        :
                        null;


                if (novoTitular) {

                    const novoEmail =
                        normalizarEmail(
                            typeof novoTitular ===
                            'string'

                                ?

                                novoTitular

                                :

                                novoTitular.email
                        );


                    const novoNome =
                        typeof novoTitular ===
                        'string'

                            ?

                            novoTitular

                            :

                            novoTitular.nome ||
                            novoEmail;


                    const novoPix =
                        typeof novoTitular ===
                        'string'

                            ?

                            ''

                            :

                            novoTitular.pix ||
                            '';


                    const novoWhatsapp =
                        typeof novoTitular ===
                        'string'

                            ?

                            ''

                            :

                            novoTitular.whatsapp ||
                            '';


                    await pool.query(
                        `
                        UPDATE servicos

                        SET
                            prestador_email =
                                $1,

                            prestador_nome =
                                $2,

                            prestador_pix =
                                $3,

                            prestador_whatsapp =
                                $4,

                            reservas =
                                $5::jsonb,

                            status =
                                'aguardando_confirmacao',

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

                            status_checkin =
                                'pendente',

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
                                NULL

                        WHERE
                            id =
                            $6
                        `,
                        [
                            novoEmail,
                            novoNome,
                            novoPix,
                            novoWhatsapp,
                            JSON.stringify(
                                reservas
                            ),
                            servicoId
                        ]
                    );


                    await registrarAuditoria(
                        novoEmail,
                        'PROMOVIDO_TITULAR',
                        `Reserva promovida para Titular do serviço #${servicoId}.`
                    );

                } else {

                    await pool.query(
                        `
                        UPDATE servicos

                        SET
                            prestador_email =
                                NULL,

                            prestador_nome =
                                NULL,

                            prestador_pix =
                                NULL,

                            prestador_whatsapp =
                                NULL,

                            prestador_id =
                                NULL,

                            reservas =
                                '[]'::jsonb,

                            status =
                                'ativo',

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

                            status_checkin =
                                'pendente',

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
                                NULL

                        WHERE
                            id =
                            $1
                        `,
                        [
                            servicoId
                        ]
                    );
                }


                await registrarAuditoria(
                    email,
                    'SAIR_VAGA_TITULAR',
                    `Titular saiu do serviço #${servicoId}.`
                );


                emitirAtualizacao(
                    servicoId
                );


                return res.json({
                    sucesso: true,

                    mensagem:
                        novoTitular

                            ?

                            'Você saiu da vaga. A primeira reserva virou Titular.'

                            :

                            'Você saiu da vaga. Ela voltou para o Radar.'
                });
            }


            reservas.splice(
                indiceReserva,
                1
            );


            await pool.query(
                `
                UPDATE servicos

                SET
                    reservas =
                        $1::jsonb

                WHERE
                    id =
                    $2
                `,
                [
                    JSON.stringify(
                        reservas
                    ),

                    servicoId
                ]
            );


            await registrarAuditoria(
                email,
                'SAIR_RESERVA',
                `Prestador saiu da reserva do serviço #${servicoId}.`
            );


            emitirAtualizacao(
                servicoId
            );


            return res.json({
                sucesso: true,

                mensagem:
                    'Você saiu da reserva.'
            });

        } catch (err) {

            console.error(
                '❌ Sair da vaga:',
                err
            );


            return res
                .status(500)
                .json({
                    sucesso: false,

                    erro:
                        'Erro ao sair da vaga.'
                });
        }
    }
);


// ============================================================
// CONFIRMAR PRESENÇA
// ============================================================

async function confirmarPresencaRS(
    req,
    res
) {

    const servicoId =
        Number(
            req.params.id
        );


    const email =
        normalizarEmail(
            req.body?.email ||
            req.body?.prestadorEmail ||
            req.body?.prestador_email
        );


    try {

        const servico =
            await buscarServico(
                servicoId
            );


        if (!servico) {

            return res
                .status(404)
                .json({
                    sucesso: false,

                    erro:
                        'Serviço não encontrado.'
                });
        }


        if (
            !prestadorEhTitular(
                servico,
                email
            )
        ) {

            return res
                .status(403)
                .json({
                    sucesso: false,

                    erro:
                        'Somente o Titular pode confirmar presença.'
                });
        }


        if (
            servico.checkout_hora
        ) {

            return res
                .status(409)
                .json({
                    sucesso: false,

                    erro:
                        'Este serviço já foi finalizado.'
                });
        }


        if (
            servico.presenca_confirmada
        ) {

            return res.json({
                sucesso: true,

                mensagem:
                    'A presença já está confirmada.',

                servico
            });
        }


        const foto =
            req.body?.foto ||
            req.body?.selfie ||
            req.body?.imagem ||
            '';


        const latitude =
            req.body?.latitude ??
            req.body?.lat;


        const longitude =
            req.body?.longitude ??
            req.body?.lng;


        const precisao =
            req.body?.precisao ??
            req.body?.accuracy ??
            '';


        if (!foto) {

            return res
                .status(400)
                .json({
                    sucesso: false,

                    erro:
                        'Tire uma foto para confirmar presença.'
                });
        }


        if (
            latitude ===
            undefined
            ||
            longitude ===
            undefined
        ) {

            return res
                .status(400)
                .json({
                    sucesso: false,

                    erro:
                        'A localização GPS é obrigatória.'
                });
        }


        const hora =
            horaAtualRS();


        const resultado =
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

                    presenca_latitude =
                        $2,

                    presenca_longitude =
                        $3,

                    presenca_precisao =
                        $4,

                    selfie_confirmacao =
                        $5,

                    status =
                        'confirmado'

                WHERE
                    id =
                    $6

                RETURNING *
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
                        precisao
                    ),

                    foto,

                    servicoId
                ]
            );


        await registrarAuditoria(
            email,
            'CONFIRMAR_PRESENCA',
            `Presença confirmada no serviço #${servicoId}.`
        );


        emitirAtualizacao(
            servicoId
        );


        return res.json({
            sucesso: true,

            mensagem:
                'Presença confirmada.',

            servico:
                resultado.rows[0]
        });

    } catch (err) {

        console.error(
            '❌ Presença:',
            err
        );


        return res
            .status(500)
            .json({
                sucesso: false,

                erro:
                    'Erro ao confirmar presença.'
            });
    }
}


app.post(
    '/api/servicos/:id/confirmar-presenca',
    confirmarPresencaRS
);


app.post(
    '/api/servicos/:id/presenca',
    confirmarPresencaRS
);


// ============================================================
// CHECK-IN AVULSO
// ============================================================

app.post(
    '/api/servicos/:id/checkin',

    async (req, res) => {

        const servicoId =
            Number(
                req.params.id
            );


        const email =
            normalizarEmail(
                req.body?.email ||
                req.body?.prestadorEmail ||
                req.body?.prestador_email
            );


        try {

            const servico =
                await buscarServico(
                    servicoId
                );


            if (!servico) {

                return res
                    .status(404)
                    .json({
                        sucesso: false,

                        erro:
                            'Serviço não encontrado.'
                    });
            }


            if (
                !prestadorEhTitular(
                    servico,
                    email
                )
            ) {

                return res
                    .status(403)
                    .json({
                        sucesso: false,

                        erro:
                            'Somente o Titular pode fazer check-in.'
                    });
            }


            if (
                servico.checkout_hora
            ) {

                return res
                    .status(409)
                    .json({
                        sucesso: false,

                        erro:
                            'Esta jornada já foi finalizada.'
                    });
            }


            if (
                !servico.presenca_confirmada
            ) {

                return res
                    .status(409)
                    .json({
                        sucesso: false,

                        erro:
                            'Confirme sua presença antes do check-in.'
                    });
            }


            if (
                servico.checkin_hora
            ) {

                return res
                    .status(409)
                    .json({
                        sucesso: false,

                        erro:
                            `CHECK-IN FINALIZADO às ${servico.checkin_hora}.`
                    });
            }


            const foto =
                req.body?.foto ||
                req.body?.selfie ||
                req.body?.imagem ||
                '';


            const latitude =
                req.body?.latitude ??
                req.body?.lat;


            const longitude =
                req.body?.longitude ??
                req.body?.lng;


            if (!foto) {

                return res
                    .status(400)
                    .json({
                        sucesso: false,

                        erro:
                            'A foto de entrada é obrigatória.'
                    });
            }


            if (
                latitude ===
                undefined
                ||
                longitude ===
                undefined
            ) {

                return res
                    .status(400)
                    .json({
                        sucesso: false,

                        erro:
                            'A localização GPS é obrigatória.'
                    });
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
                            'em_andamento',

                        em_intervalo =
                            FALSE

                    WHERE
                        id =
                        $5

                    RETURNING *
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

                        servicoId
                    ]
                );


            await registrarAuditoria(
                email,
                'CHECKIN',
                `Entrada registrada no serviço #${servicoId}.`
            );


            emitirAtualizacao(
                servicoId
            );


            return res.json({
                sucesso: true,

                mensagem:
                    'Check-in realizado.',

                hora,

                servico:
                    resultado.rows[0]
            });

        } catch (err) {

            console.error(
                '❌ Check-in:',
                err
            );


            return res
                .status(500)
                .json({
                    sucesso: false,

                    erro:
                        'Erro ao realizar check-in.'
                });
        }
    }
);


// ============================================================
// INICIAR INTERVALO AVULSO
// ============================================================

async function iniciarIntervaloRS(
    req,
    res
) {

    const servicoId =
        Number(
            req.params.id
        );


    const email =
        normalizarEmail(
            req.body?.email ||
            req.body?.prestadorEmail ||
            req.body?.prestador_email
        );


    try {

        const servico =
            await buscarServico(
                servicoId
            );


        if (!servico) {

            return res
                .status(404)
                .json({
                    sucesso: false,

                    erro:
                        'Serviço não encontrado.'
                });
        }


        if (
            !prestadorEhTitular(
                servico,
                email
            )
        ) {

            return res
                .status(403)
                .json({
                    sucesso: false,

                    erro:
                        'Somente o Titular pode iniciar o intervalo.'
                });
        }


        if (
            !servico.checkin_hora
        ) {

            return res
                .status(409)
                .json({
                    sucesso: false,

                    erro:
                        'Faça o check-in primeiro.'
                });
        }


        if (
            servico.checkout_hora
        ) {

            return res
                .status(409)
                .json({
                    sucesso: false,

                    erro:
                        'Esta jornada já foi finalizada.'
                });
        }


        if (
            servico.em_intervalo
        ) {

            return res
                .status(409)
                .json({
                    sucesso: false,

                    erro:
                        'O intervalo já está em andamento.'
                });
        }


        if (
            servico.intervalo_inicio
        ) {

            return res
                .status(409)
                .json({
                    sucesso: false,

                    erro:
                        'O intervalo desta jornada já foi utilizado.'
                });
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

                status =
                    'em_intervalo'

            WHERE
                id =
                $2
            `,
            [
                hora,
                servicoId
            ]
        );


        await registrarAuditoria(
            email,
            'INICIAR_INTERVALO',
            `Intervalo iniciado no serviço #${servicoId}.`
        );


        emitirAtualizacao(
            servicoId
        );


        return res.json({
            sucesso: true,

            mensagem:
                'Intervalo iniciado.',

            hora
        });

    } catch (err) {

        console.error(
            '❌ Intervalo:',
            err
        );


        return res
            .status(500)
            .json({
                sucesso: false,

                erro:
                    'Erro ao iniciar intervalo.'
            });
    }
}


app.post(
    '/api/servicos/:id/intervalo/iniciar',
    iniciarIntervaloRS
);


app.post(
    '/api/servicos/:id/iniciar-intervalo',
    iniciarIntervaloRS
);


// ============================================================
// RETORNAR INTERVALO AVULSO
// ============================================================

async function retornarIntervaloRS(
    req,
    res
) {

    const servicoId =
        Number(
            req.params.id
        );


    const email =
        normalizarEmail(
            req.body?.email ||
            req.body?.prestadorEmail ||
            req.body?.prestador_email
        );


    try {

        const servico =
            await buscarServico(
                servicoId
            );


        if (!servico) {

            return res
                .status(404)
                .json({
                    sucesso: false,

                    erro:
                        'Serviço não encontrado.'
                });
        }


        if (
            !prestadorEhTitular(
                servico,
                email
            )
        ) {

            return res
                .status(403)
                .json({
                    sucesso: false,

                    erro:
                        'Somente o Titular pode retornar do intervalo.'
                });
        }


        if (
            !servico.intervalo_inicio
        ) {

            return res
                .status(409)
                .json({
                    sucesso: false,

                    erro:
                        'O intervalo ainda não foi iniciado.'
                });
        }


        if (
            !servico.em_intervalo
        ) {

            return res
                .status(409)
                .json({
                    sucesso: false,

                    erro:
                        'O retorno do intervalo já foi registrado.'
                });
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

                status =
                    'em_andamento'

            WHERE
                id =
                $2
            `,
            [
                hora,
                servicoId
            ]
        );


        await registrarAuditoria(
            email,
            'RETORNO_INTERVALO',
            `Retorno registrado no serviço #${servicoId}.`
        );


        emitirAtualizacao(
            servicoId
        );


        return res.json({
            sucesso: true,

            mensagem:
                'Retorno do intervalo registrado.',

            hora
        });

    } catch (err) {

        console.error(
            '❌ Retorno intervalo:',
            err
        );


        return res
            .status(500)
            .json({
                sucesso: false,

                erro:
                    'Erro ao registrar retorno.'
            });
    }
}


app.post(
    '/api/servicos/:id/intervalo/voltar',
    retornarIntervaloRS
);


app.post(
    '/api/servicos/:id/intervalo/retornar',
    retornarIntervaloRS
);


app.post(
    '/api/servicos/:id/voltar-intervalo',
    retornarIntervaloRS
);


// ============================================================
// HORÁRIOS AVULSOS
// ============================================================

function horarioParaSegundos(
    horario
) {

    if (!horario) {
        return null;
    }


    const partes =
        String(
            horario
        )
            .split(':')
            .map(Number);


    if (
        partes.length <
        2
    ) {

        return null;
    }


    return (
        (partes[0] || 0) *
        3600

        +

        (partes[1] || 0) *
        60

        +

        (partes[2] || 0)
    );
}


function calcularTempoTrabalhado(
    servico,
    saidaHora
) {

    const entrada =
        horarioParaSegundos(
            servico.checkin_hora
        );


    const saida =
        horarioParaSegundos(
            saidaHora
        );


    if (
        entrada === null ||
        saida === null
    ) {

        return {
            minutos: 0,

            horasDecimal: 0,

            texto:
                '0h 00min'
        };
    }


    let total =
        saida -
        entrada;


    if (
        total <
        0
    ) {

        total +=
            24 *
            3600;
    }


    const inicioIntervalo =
        horarioParaSegundos(
            servico.intervalo_inicio
        );


    const fimIntervalo =
        horarioParaSegundos(
            servico.intervalo_fim ||
            servico.intervalo_retorno
        );


    if (
        inicioIntervalo !== null &&
        fimIntervalo !== null
    ) {

        let intervalo =
            fimIntervalo -
            inicioIntervalo;


        if (
            intervalo <
            0
        ) {

            intervalo +=
                24 *
                3600;
        }


        total -=
            intervalo;
    }


    total =
        Math.max(
            0,
            total
        );


    const horas =
        Math.floor(
            total /
            3600
        );


    const minutos =
        Math.floor(
            (
                total %
                3600
            )
            /
            60
        );


    return {

        minutos:
            Math.floor(
                total /
                60
            ),

        horasDecimal:
            Number(
                (
                    total /
                    3600
                )
                    .toFixed(2)
            ),

        texto:
            `${horas}h ${
                String(
                    minutos
                )
                    .padStart(
                        2,
                        '0'
                    )
            }min`
    };
}


// ============================================================
// CHECK-OUT AVULSO
// ============================================================

app.post(
    '/api/servicos/:id/checkout',

    async (req, res) => {

        const servicoId =
            Number(
                req.params.id
            );


        const email =
            normalizarEmail(
                req.body?.email ||
                req.body?.prestadorEmail ||
                req.body?.prestador_email
            );


        try {

            const servico =
                await buscarServico(
                    servicoId
                );


            if (!servico) {

                return res
                    .status(404)
                    .json({
                        sucesso: false,

                        erro:
                            'Serviço não encontrado.'
                    });
            }


            if (
                !prestadorEhTitular(
                    servico,
                    email
                )
            ) {

                return res
                    .status(403)
                    .json({
                        sucesso: false,

                        erro:
                            'Somente o Titular pode registrar a saída.'
                    });
            }


            if (
                !servico.checkin_hora
            ) {

                return res
                    .status(409)
                    .json({
                        sucesso: false,

                        erro:
                            'Faça o check-in primeiro.'
                    });
            }


            if (
                servico.checkout_hora
            ) {

                return res
                    .status(409)
                    .json({
                        sucesso: false,

                        erro:
                            `CHECK-OUT FINALIZADO às ${servico.checkout_hora}.`
                    });
            }


            if (
                servico.em_intervalo
            ) {

                return res
                    .status(409)
                    .json({
                        sucesso: false,

                        erro:
                            'Registre o retorno do intervalo antes do check-out.'
                    });
            }


            const foto =
                req.body?.foto ||
                req.body?.selfie ||
                req.body?.imagem ||
                '';


            const latitude =
                req.body?.latitude ??
                req.body?.lat;


            const longitude =
                req.body?.longitude ??
                req.body?.lng;


            if (!foto) {

                return res
                    .status(400)
                    .json({
                        sucesso: false,

                        erro:
                            'A foto de saída é obrigatória.'
                    });
            }


            if (
                latitude ===
                undefined
                ||
                longitude ===
                undefined
            ) {

                return res
                    .status(400)
                    .json({
                        sucesso: false,

                        erro:
                            'A localização GPS é obrigatória.'
                    });
            }


            const hora =
                horaAtualRS();


            const tempo =
                calcularTempoTrabalhado(
                    servico,
                    hora
                );


            const valor =
                numeroRS(
                    servico.valor_liquido ||
                    servico.valor_diaria ||
                    servico.valor
                );


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
                            'finalizado',

                        status =
                            'finalizado',

                        em_intervalo =
                            FALSE

                    WHERE
                        id =
                        $5

                    RETURNING *
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

                        servicoId
                    ]
                );


            await registrarLedger(
                servicoId,
                email,
                'SERVICO_FINALIZADO',
                valor
            );


            await registrarAuditoria(
                email,
                'CHECKOUT',
                `Serviço #${servicoId} finalizado. Total ${tempo.texto}.`
            );


            emitirAtualizacao(
                servicoId
            );


            io.emit(
                'servico_finalizado',
                {
                    servicoId,

                    prestadorEmail:
                        email,

                    checkoutHora:
                        hora,

                    totalTrabalhado:
                        tempo.texto,

                    valor
                }
            );


            return res.json({
                sucesso: true,

                mensagem:
                    'Serviço finalizado com sucesso.',

                hora,

                totalTrabalhado:
                    tempo.texto,

                minutosTrabalhados:
                    tempo.minutos,

                horasTrabalhadas:
                    tempo.horasDecimal,

                valor,

                servico:
                    resultado.rows[0]
            });

        } catch (err) {

            console.error(
                '❌ Check-out:',
                err
            );


            return res
                .status(500)
                .json({
                    sucesso: false,

                    erro:
                        'Erro ao finalizar serviço.'
                });
        }
    }
);


// ============================================================
// VALIDAR SERVIÇO PELA EMPRESA
// ============================================================

app.post(
    '/api/servicos/:id/validar',

    async (req, res) => {

        const servicoId =
            Number(
                req.params.id
            );


        const email =
            normalizarEmail(
                req.body?.email ||
                req.body?.empresaEmail ||
                req.body?.empresa_email
            );


        try {

            const servico =
                await buscarServico(
                    servicoId
                );


            if (!servico) {

                return res
                    .status(404)
                    .json({
                        sucesso: false,

                        erro:
                            'Serviço não encontrado.'
                    });
            }


            if (
                servico.empresa_email &&
                !empresaEhResponsavel(
                    servico,
                    email
                )
            ) {

                return res
                    .status(403)
                    .json({
                        sucesso: false,

                        erro:
                            'Somente a empresa responsável pode validar este serviço.'
                    });
            }


            if (
                !servico.checkout_hora
            ) {

                return res
                    .status(409)
                    .json({
                        sucesso: false,

                        erro:
                            'O prestador ainda não realizou o check-out.'
                    });
            }


            const resultado =
                await pool.query(
                    `
                    UPDATE servicos

                    SET
                        validado_empresa =
                            TRUE,

                        validado_em =
                            CURRENT_TIMESTAMP,

                        status =
                            'validado'

                    WHERE
                        id =
                        $1

                    RETURNING *
                    `,
                    [
                        servicoId
                    ]
                );


            await registrarAuditoria(
                email,
                'VALIDAR_SERVICO',
                `Empresa validou o serviço #${servicoId}.`
            );


            emitirAtualizacao(
                servicoId
            );


            return res.json({
                sucesso: true,

                mensagem:
                    'Serviço validado pela empresa.',

                servico:
                    resultado.rows[0]
            });

        } catch (err) {

            console.error(
                '❌ Validar serviço:',
                err
            );


            return res
                .status(500)
                .json({
                    sucesso: false,

                    erro:
                        'Erro ao validar serviço.'
                });
        }
    }
);


// ============================================================
// CANCELAR SERVIÇO
// ============================================================

app.patch(
    '/api/servicos/:id/cancelar',

    async (req, res) => {

        const servicoId =
            Number(
                req.params.id
            );


        try {

            const servico =
                await buscarServico(
                    servicoId
                );


            if (!servico) {

                return res
                    .status(404)
                    .json({
                        sucesso: false,

                        erro:
                            'Serviço não encontrado.'
                    });
            }


            const empresaEmail =
                normalizarEmail(
                    req.body?.empresa_email ||
                    req.body?.empresaEmail ||
                    req.body?.email
                );


            if (
                servico.empresa_email &&
                !empresaEhResponsavel(
                    servico,
                    empresaEmail
                )
            ) {

                return res
                    .status(403)
                    .json({
                        sucesso: false,

                        erro:
                            'Somente a empresa responsável pode cancelar este serviço.'
                    });
            }


            if (
                servico.checkout_hora
            ) {

                return res
                    .status(409)
                    .json({
                        sucesso: false,

                        erro:
                            'Não é possível cancelar um serviço finalizado.'
                    });
            }


            const motivo =
                String(
                    req.body?.motivo ||
                    'Cancelado pela empresa'
                );


            const resultado =
                await pool.query(
                    `
                    UPDATE servicos

                    SET
                        status =
                            'cancelado',

                        motivo_cancelamento =
                            $1

                    WHERE
                        id =
                        $2

                    RETURNING *
                    `,
                    [
                        motivo,
                        servicoId
                    ]
                );


            await registrarAuditoria(
                empresaEmail,
                'CANCELAR_SERVICO',
                `Serviço #${servicoId} cancelado.`
            );


            emitirAtualizacao(
                servicoId
            );


            return res.json({
                sucesso: true,

                mensagem:
                    'Serviço cancelado.',

                servico:
                    resultado.rows[0]
            });

        } catch (err) {

            console.error(
                '❌ Cancelar serviço:',
                err
            );


            return res
                .status(500)
                .json({
                    sucesso: false,

                    erro:
                        'Erro ao cancelar serviço.'
                });
        }
    }
);


// ============================================================
// HISTÓRICO PRESTADOR
// ============================================================

app.get(
    '/api/prestador/:email/historico',

    async (req, res) => {

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
                            prestador_email
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


            return res.json({
                sucesso: true,

                servicos:
                    resultado.rows
            });

        } catch (err) {

            return res
                .status(500)
                .json({
                    sucesso: false,

                    erro:
                        'Erro ao carregar histórico.'
                });
        }
    }
);


// ============================================================
// AUTORIZAR PAGAMENTO
// ============================================================

app.post(
    '/api/servicos/:id/autorizar-pagamento',

    async (req, res) => {

        const servicoId =
            Number(
                req.params.id
            );


        const empresaEmail =
            normalizarEmail(
                req.body?.email ||
                req.body?.empresaEmail ||
                req.body?.empresa_email
            );


        try {

            const servico =
                await buscarServico(
                    servicoId
                );


            if (!servico) {

                return res
                    .status(404)
                    .json({
                        sucesso: false,

                        erro:
                            'Serviço não encontrado.'
                    });
            }


            if (
                servico.empresa_email &&
                !empresaEhResponsavel(
                    servico,
                    empresaEmail
                )
            ) {

                return res
                    .status(403)
                    .json({
                        sucesso: false,

                        erro:
                            'Somente a empresa responsável pode autorizar o pagamento.'
                    });
            }


            if (
                !servico.checkout_hora
            ) {

                return res
                    .status(409)
                    .json({
                        sucesso: false,

                        erro:
                            'O serviço precisa estar finalizado antes do pagamento.'
                    });
            }


            const valor =
                numeroRS(
                    servico.valor_liquido ||
                    servico.valor_diaria ||
                    servico.valor
                );


            const resultado =
                await pool.query(
                    `
                    UPDATE servicos

                    SET
                        pagamento_autorizado =
                            TRUE,

                        pagamento_autorizado_em =
                            CURRENT_TIMESTAMP

                    WHERE
                        id =
                        $1

                    RETURNING *
                    `,
                    [
                        servicoId
                    ]
                );


            await pool.query(
                `
                INSERT INTO pagamentos (
                    servico_id,
                    empresa_email,
                    prestador_email,
                    valor,
                    forma_pagamento,
                    status,
                    autorizado_em
                )

                VALUES (
                    $1,
                    $2,
                    $3,
                    $4,
                    $5,
                    'AUTORIZADO',
                    CURRENT_TIMESTAMP
                )
                `,
                [
                    servicoId,

                    servico.empresa_email ||
                    empresaEmail,

                    servico.prestador_email,

                    valor,

                    servico.forma_pgto ||
                    'Pix'
                ]
            );


            await registrarLedger(
                servicoId,
                empresaEmail,
                'PAGAMENTO_AUTORIZADO',
                valor
            );


            emitirAtualizacao(
                servicoId
            );


            return res.json({
                sucesso: true,

                mensagem:
                    'Pagamento autorizado.',

                valor,

                servico:
                    resultado.rows[0]
            });

        } catch (err) {

            console.error(
                '❌ Autorizar pagamento:',
                err
            );


            return res
                .status(500)
                .json({
                    sucesso: false,

                    erro:
                        'Erro ao autorizar pagamento.'
                });
        }
    }
);


// ============================================================
// REGISTRAR PAGAMENTO
// ============================================================

app.post(
    '/api/servicos/:id/pagamento',

    async (req, res) => {

        const servicoId =
            Number(
                req.params.id
            );


        const empresaEmail =
            normalizarEmail(
                req.body?.email ||
                req.body?.empresaEmail ||
                req.body?.empresa_email
            );


        try {

            const servico =
                await buscarServico(
                    servicoId
                );


            if (!servico) {

                return res
                    .status(404)
                    .json({
                        sucesso: false,

                        erro:
                            'Serviço não encontrado.'
                    });
            }


            const valor =
                numeroRS(
                    req.body?.valor ||
                    servico.valor_liquido ||
                    servico.valor_diaria ||
                    servico.valor
                );


            const formaPagamento =
                String(
                    req.body?.formaPagamento ||
                    req.body?.forma_pagamento ||
                    servico.forma_pgto ||
                    'Pix'
                );


            const comprovante =
                String(
                    req.body?.comprovante ||
                    req.body?.arquivo ||
                    ''
                );


            const resultado =
                await pool.query(
                    `
                    UPDATE servicos

                    SET
                        pagamento_realizado =
                            TRUE,

                        pagamento_realizado_em =
                            CURRENT_TIMESTAMP,

                        comprovante_pagamento =
                            CASE

                                WHEN $1 <> ''
                                THEN TRUE

                                ELSE
                                    comprovante_pagamento

                            END,

                        comprovante_pagamento_arquivo =
                            CASE

                                WHEN $1 <> ''
                                THEN $1

                                ELSE
                                    comprovante_pagamento_arquivo

                            END,

                        status =
                            'pago'

                    WHERE
                        id =
                        $2

                    RETURNING *
                    `,
                    [
                        comprovante,
                        servicoId
                    ]
                );


            await pool.query(
                `
                INSERT INTO pagamentos (
                    servico_id,
                    empresa_email,
                    prestador_email,
                    valor,
                    forma_pagamento,
                    status,
                    comprovante,
                    pago_em
                )

                VALUES (
                    $1,
                    $2,
                    $3,
                    $4,
                    $5,
                    'PAGO',
                    $6,
                    CURRENT_TIMESTAMP
                )
                `,
                [
                    servicoId,

                    servico.empresa_email ||
                    empresaEmail,

                    servico.prestador_email,

                    valor,

                    formaPagamento,

                    comprovante
                ]
            );


            emitirAtualizacao(
                servicoId
            );


            return res.json({
                sucesso: true,

                mensagem:
                    'Pagamento registrado.',

                valor,

                servico:
                    resultado.rows[0]
            });

        } catch (err) {

            console.error(
                '❌ Registrar pagamento:',
                err
            );


            return res
                .status(500)
                .json({
                    sucesso: false,

                    erro:
                        'Erro ao registrar pagamento.'
                });
        }
    }
);


// ============================================================
// COMPROVANTE PAGAMENTO
// ============================================================

app.post(
    '/api/servicos/:id/comprovante-pagamento',

    upload.single('arquivo'),

    async (req, res) => {

        const servicoId =
            Number(
                req.params.id
            );


        try {

            const servico =
                await buscarServico(
                    servicoId
                );


            if (!servico) {

                return res
                    .status(404)
                    .json({
                        sucesso: false,

                        erro:
                            'Serviço não encontrado.'
                    });
            }


            const empresaEmail =
                normalizarEmail(
                    req.body?.empresaEmail ||
                    req.body?.empresa_email ||
                    req.body?.email
                );


            let arquivo =
                '';


            let nomeArquivo =
                'comprovante';


            if (
                req.file
            ) {

                arquivo =
                    `data:${req.file.mimetype};base64,${
                        req.file.buffer
                            .toString(
                                'base64'
                            )
                    }`;


                nomeArquivo =
                    req.file.originalname ||
                    nomeArquivo;

            } else {

                arquivo =
                    String(
                        req.body?.arquivo ||
                        req.body?.comprovante ||
                        ''
                    );


                nomeArquivo =
                    String(
                        req.body?.nomeArquivo ||
                        req.body?.nome_arquivo ||
                        nomeArquivo
                    );
            }


            if (!arquivo) {

                return res
                    .status(400)
                    .json({
                        sucesso: false,

                        erro:
                            'Selecione o comprovante.'
                    });
            }


            await pool.query(
                `
                UPDATE servicos

                SET
                    comprovante_pagamento =
                        TRUE,

                    comprovante_pagamento_arquivo =
                        $1,

                    pagamento_realizado =
                        TRUE,

                    pagamento_realizado_em =
                        CURRENT_TIMESTAMP,

                    status =
                        'pago'

                WHERE
                    id =
                    $2
                `,
                [
                    arquivo,
                    servicoId
                ]
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
                    $1,
                    $2,
                    $3,
                    'COMPROVANTE',
                    $4,
                    $5
                )
                `,
                [
                    servicoId,

                    servico.empresa_email ||
                    empresaEmail,

                    servico.prestador_email,

                    nomeArquivo,

                    arquivo
                ]
            );


            emitirAtualizacao(
                servicoId
            );


            return res.json({
                sucesso: true,

                mensagem:
                    'Comprovante registrado.'
            });

        } catch (err) {

            console.error(
                '❌ Comprovante:',
                err
            );


            return res
                .status(500)
                .json({
                    sucesso: false,

                    erro:
                        'Erro ao registrar comprovante.'
                });
        }
    }
);


// ============================================================
// PAGAMENTOS PRESTADOR
// ============================================================

app.get(
    '/api/prestador/:email/pagamentos',

    async (req, res) => {

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
                            prestador_email
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


            return res.json({
                sucesso: true,

                pagamentos:
                    resultado.rows
            });

        } catch (err) {

            return res
                .status(500)
                .json({
                    sucesso: false,

                    erro:
                        'Erro ao carregar pagamentos.'
                });
        }
    }
);


app.get(
    '/api/prestador/:email/historico-pagamentos',

    async (req, res) => {

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
                            prestador_email
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


            return res.json({
                sucesso: true,

                pagamentos:
                    resultado.rows
            });

        } catch (err) {

            return res
                .status(500)
                .json({
                    sucesso: false,

                    erro:
                        'Erro ao carregar histórico de pagamentos.'
                });
        }
    }
);


// ============================================================
// DOCUMENTOS DOS SERVIÇOS
// ============================================================

app.post(
    '/api/servicos/:id/documentos',

    upload.single('arquivo'),

    async (req, res) => {

        const servicoId =
            Number(
                req.params.id
            );


        try {

            const servico =
                await buscarServico(
                    servicoId
                );


            if (!servico) {

                return res
                    .status(404)
                    .json({
                        sucesso: false,

                        erro:
                            'Serviço não encontrado.'
                    });
            }


            let arquivo =
                '';


            let nome =
                'documento';


            const categoria =
                String(
                    req.body?.categoria ||
                    'DOCUMENTO'
                )
                    .toUpperCase();


            if (
                req.file
            ) {

                arquivo =
                    `data:${req.file.mimetype};base64,${
                        req.file.buffer
                            .toString(
                                'base64'
                            )
                    }`;


                nome =
                    req.file.originalname ||
                    nome;

            } else {

                arquivo =
                    String(
                        req.body?.arquivo ||
                        ''
                    );


                nome =
                    String(
                        req.body?.nome ||
                        nome
                    );
            }


            if (!arquivo) {

                return res
                    .status(400)
                    .json({
                        sucesso: false,

                        erro:
                            'Selecione um documento.'
                    });
            }


            const resultado =
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

                    RETURNING *
                    `,
                    [
                        servicoId,

                        servico.empresa_email,

                        servico.prestador_email,

                        categoria,

                        nome,

                        arquivo
                    ]
                );


            return res.json({
                sucesso: true,

                mensagem:
                    'Documento arquivado.',

                documento:
                    resultado.rows[0]
            });

        } catch (err) {

            console.error(
                '❌ Documento:',
                err
            );


            return res
                .status(500)
                .json({
                    sucesso: false,

                    erro:
                        'Erro ao arquivar documento.'
                });
        }
    }
);


app.get(
    '/api/servicos/:id/documentos',

    async (req, res) => {

        try {

            const servicoId =
                Number(
                    req.params.id
                );


            const resultado =
                await pool.query(
                    `
                    SELECT *
                    FROM documentos_rs

                    WHERE
                        servico_id =
                        $1

                    ORDER BY
                        criado_em DESC,
                        id DESC
                    `,
                    [
                        servicoId
                    ]
                );


            return res.json({
                sucesso: true,

                documentos:
                    resultado.rows
            });

        } catch (err) {

            return res
                .status(500)
                .json({
                    sucesso: false,

                    erro:
                        'Erro ao carregar documentos.'
                });
        }
    }
);


// ============================================================
// CONTRATO ASSINADO
// ============================================================

app.post(
    '/api/servicos/:id/contrato-assinado',

    upload.single('arquivo'),

    async (req, res) => {

        const servicoId =
            Number(
                req.params.id
            );


        try {

            const servico =
                await buscarServico(
                    servicoId
                );


            if (!servico) {

                return res
                    .status(404)
                    .json({
                        sucesso: false,

                        erro:
                            'Serviço não encontrado.'
                    });
            }


            let arquivo =
                '';


            if (
                req.file
            ) {

                arquivo =
                    `data:${req.file.mimetype};base64,${
                        req.file.buffer
                            .toString(
                                'base64'
                            )
                    }`;

            } else {

                arquivo =
                    String(
                        req.body?.arquivo ||
                        ''
                    );
            }


            if (!arquivo) {

                return res
                    .status(400)
                    .json({
                        sucesso: false,

                        erro:
                            'Envie o contrato assinado.'
                    });
            }


            await pool.query(
                `
                UPDATE servicos

                SET
                    contrato_assinado =
                        $1,

                    contrato_assinado_em =
                        CURRENT_TIMESTAMP

                WHERE
                    id =
                        $2
                `,
                [
                    arquivo,
                    servicoId
                ]
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
                    $1,
                    $2,
                    $3,
                    'CONTRATO_ASSINADO',
                    'Contrato assinado',
                    $4
                )
                `,
                [
                    servicoId,

                    servico.empresa_email,

                    servico.prestador_email,

                    arquivo
                ]
            );


            emitirAtualizacao(
                servicoId
            );


            return res.json({
                sucesso: true,

                mensagem:
                    'Contrato assinado arquivado.'
            });

        } catch (err) {

            console.error(
                '❌ Contrato assinado:',
                err
            );


            return res
                .status(500)
                .json({
                    sucesso: false,

                    erro:
                        'Erro ao arquivar contrato.'
                });
        }
    }
);


// ============================================================
// NOTA FISCAL
// ============================================================

app.post(
    '/api/servicos/:id/nota-oficial',

    upload.single('notaFiscal'),

    async (req, res) => {

        const servicoId =
            Number(
                req.params.id
            );


        try {

            let arquivo =
                '';


            if (
                req.file
            ) {

                arquivo =
                    `data:${req.file.mimetype};base64,${
                        req.file.buffer
                            .toString(
                                'base64'
                            )
                    }`;

            } else {

                arquivo =
                    String(
                        req.body?.notaFiscal ||
                        req.body?.arquivo ||
                        ''
                    );
            }


            if (!arquivo) {

                return res
                    .status(400)
                    .json({
                        sucesso: false,

                        erro:
                            'Nenhuma nota fiscal enviada.'
                    });
            }


            await pool.query(
                `
                UPDATE servicos

                SET
                    nota_oficial =
                        $1

                WHERE
                    id =
                        $2
                `,
                [
                    arquivo,
                    servicoId
                ]
            );


            emitirAtualizacao(
                servicoId
            );


            return res.json({
                sucesso: true,

                mensagem:
                    'Nota fiscal enviada.'
            });

        } catch (err) {

            console.error(
                '❌ Nota fiscal:',
                err
            );


            return res
                .status(500)
                .json({
                    sucesso: false,

                    erro:
                        'Erro ao enviar nota fiscal.'
                });
        }
    }
);


// ============================================================
// CHAT — GARANTIR CONVERSA
// ============================================================

async function garantirConversaServico(
    servico
) {

    if (
        !servico ||
        !servico.id ||
        !servico.empresa_email ||
        !servico.prestador_email
    ) {

        return null;
    }


    const empresaEmail =
        normalizarEmail(
            servico.empresa_email
        );


    const prestadorEmail =
        normalizarEmail(
            servico.prestador_email
        );


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
                    empresa_email
                )
                =
                LOWER($2)

            AND
                LOWER(
                    prestador_email
                )
                =
                LOWER($3)

            LIMIT 1
            `,
            [
                servico.id,
                empresaEmail,
                prestadorEmail
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
                ativo
            )

            VALUES (
                $1,$2,$3,TRUE
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
                servico.id,
                empresaEmail,
                prestadorEmail
            ]
        );


    return criada.rows[0];
}


// ============================================================
// CONVERSA DO SERVIÇO
// ============================================================

app.get(
    '/api/servicos/:id/conversa',

    async (req, res) => {

        try {

            const servico =
                await buscarServico(
                    Number(
                        req.params.id
                    )
                );


            if (!servico) {

                return res
                    .status(404)
                    .json({
                        sucesso: false,

                        erro:
                            'Serviço não encontrado.'
                    });
            }


            if (
                !servico.prestador_email
            ) {

                return res
                    .status(400)
                    .json({
                        sucesso: false,

                        erro:
                            'Este serviço ainda não possui Titular.'
                    });
            }


            const conversa =
                await garantirConversaServico(
                    servico
                );


            return res.json({
                sucesso: true,

                conversa: {
                    ...conversa,

                    empresa_nome:
                        servico.empresa_nome,

                    prestador_nome:
                        servico.prestador_nome,

                    servico_titulo:
                        servico.titulo ||
                        servico.categoria
                }
            });

        } catch (err) {

            console.error(
                '❌ Abrir conversa:',
                err
            );


            return res
                .status(500)
                .json({
                    sucesso: false,

                    erro:
                        'Erro ao abrir conversa.'
                });
        }
    }
);


// ============================================================
// LISTAR CONVERSAS
// ============================================================

app.get(
    '/api/chat/conversas/:email',

    async (req, res) => {

        try {

            const email =
                normalizarEmail(
                    req.params.email
                );


            const resultado =
                await pool.query(
                    `
                    SELECT

                        conversa.*,

                        servico.titulo
                            AS servico_titulo,

                        servico.empresa_nome,

                        servico.prestador_nome,

                        (
                            SELECT
                                mensagem.mensagem

                            FROM
                                mensagens_chat
                                AS mensagem

                            WHERE
                                mensagem.conversa_id =
                                conversa.id

                            ORDER BY
                                mensagem.criado_em DESC,
                                mensagem.id DESC

                            LIMIT 1
                        )
                        AS ultima_mensagem,

                        (
                            SELECT
                                COUNT(*)::int

                            FROM
                                mensagens_chat
                                AS mensagem

                            WHERE
                                mensagem.conversa_id =
                                conversa.id

                            AND
                                LOWER(
                                    mensagem.destinatario_email
                                )
                                =
                                LOWER($1)

                            AND
                                mensagem.lida =
                                FALSE
                        )
                        AS nao_lidas

                    FROM
                        conversas
                        AS conversa

                    LEFT JOIN
                        servicos
                        AS servico

                    ON
                        servico.id =
                        conversa.servico_id

                    WHERE
                        LOWER(
                            conversa.empresa_email
                        )
                        =
                        LOWER($1)

                    OR
                        LOWER(
                            conversa.prestador_email
                        )
                        =
                        LOWER($1)

                    ORDER BY
                        conversa.atualizado_em DESC,
                        conversa.id DESC
                    `,
                    [
                        email
                    ]
                );


            return res.json({
                sucesso: true,

                conversas:
                    resultado.rows
            });

        } catch (err) {

            console.error(
                '❌ Listar conversas:',
                err
            );


            return res
                .status(500)
                .json({
                    sucesso: false,

                    erro:
                        'Erro ao carregar conversas.'
                });
        }
    }
);


// ============================================================
// MENSAGENS
// ============================================================

app.get(
    '/api/chat/conversas/:id/mensagens',

    async (req, res) => {

        try {

            const conversaId =
                Number(
                    req.params.id
                );


            const resultado =
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


            return res.json({
                sucesso: true,

                mensagens:
                    resultado.rows
            });

        } catch (err) {

            return res
                .status(500)
                .json({
                    sucesso: false,

                    erro:
                        'Erro ao carregar mensagens.'
                });
        }
    }
);


// ============================================================
// ENVIAR MENSAGEM
// ============================================================

app.post(
    '/api/chat/conversas/:id/mensagens',

    async (req, res) => {

        try {

            const conversaId =
                Number(
                    req.params.id
                );


            const remetente =
                normalizarEmail(
                    req.body?.remetente_email ||
                    req.body?.email
                );


            const mensagem =
                String(
                    req.body?.mensagem ||
                    ''
                )
                    .trim();


            if (
                !remetente ||
                !mensagem
            ) {

                return res
                    .status(400)
                    .json({
                        sucesso: false,

                        erro:
                            'Remetente e mensagem são obrigatórios.'
                    });
            }


            const conversaRes =
                await pool.query(
                    `
                    SELECT *
                    FROM conversas

                    WHERE
                        id =
                        $1

                    LIMIT 1
                    `,
                    [
                        conversaId
                    ]
                );


            const conversa =
                conversaRes.rows[0];


            if (!conversa) {

                return res
                    .status(404)
                    .json({
                        sucesso: false,

                        erro:
                            'Conversa não encontrada.'
                    });
            }


            const empresaEmail =
                normalizarEmail(
                    conversa.empresa_email
                );


            const prestadorEmail =
                normalizarEmail(
                    conversa.prestador_email
                );


            if (
                remetente !==
                empresaEmail

                &&

                remetente !==
                prestadorEmail
            ) {

                return res
                    .status(403)
                    .json({
                        sucesso: false,

                        erro:
                            'Você não participa desta conversa.'
                    });
            }


            const destinatario =
                remetente ===
                empresaEmail

                    ?

                    prestadorEmail

                    :

                    empresaEmail;


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
                        lida
                    )

                    VALUES (
                        $1,
                        $2,
                        $3,
                        $4,
                        $5,
                        'texto',
                        FALSE
                    )

                    RETURNING *
                    `,
                    [
                        conversaId,

                        conversa.servico_id,

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

                WHERE
                    id =
                        $1
                `,
                [
                    conversaId
                ]
            );


            const novaMensagem =
                resultado.rows[0];


            io.to(
                `conversa_${conversaId}`
            )
                .emit(
                    'nova_mensagem',
                    novaMensagem
                );


            io.to(
                `usuario_${destinatario}`
            )
                .emit(
                    'mensagem_recebida',
                    {
                        conversaId,

                        servicoId:
                            conversa.servico_id
                    }
                );


            return res.json({
                sucesso: true,

                mensagem:
                    novaMensagem
            });

        } catch (err) {

            console.error(
                '❌ Enviar mensagem:',
                err
            );


            return res
                .status(500)
                .json({
                    sucesso: false,

                    erro:
                        'Erro ao enviar mensagem.'
                });
        }
    }
);


// ============================================================
// MARCAR LIDAS
// ============================================================

app.post(
    '/api/chat/conversas/:id/lida',

    async (req, res) => {

        try {

            const conversaId =
                Number(
                    req.params.id
                );


            const email =
                normalizarEmail(
                    req.body?.email
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
                `,
                [
                    conversaId,
                    email
                ]
            );


            return res.json({
                sucesso: true
            });

        } catch (err) {

            return res
                .status(500)
                .json({
                    sucesso: false,

                    erro:
                        'Erro ao marcar mensagens.'
                });
        }
    }
);


// ============================================================
// NÃO LIDAS
// ============================================================

app.get(
    '/api/chat/nao-lidas/:email',

    async (req, res) => {

        try {

            const email =
                normalizarEmail(
                    req.params.email
                );


            const resultado =
                await pool.query(
                    `
                    SELECT
                        COUNT(*)::int
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


            return res.json({
                sucesso: true,

                total:
                    Number(
                        resultado.rows[0]?.total ||
                        0
                    )
            });

        } catch (err) {

            return res
                .status(500)
                .json({
                    sucesso: false,

                    erro:
                        'Erro ao consultar mensagens.'
                });
        }
    }
);


// ============================================================
// LISTAR CLIENTES FIXOS
// ============================================================

app.get(
    '/api/jornada-clientes',

    async (req, res) => {

        try {

            const resultado =
                await pool.query(
                    `
                    SELECT

                        cliente.*,

                        COUNT(
                            vinculo.id
                        )
                        FILTER (
                            WHERE
                                vinculo.ativo =
                                TRUE
                        )::int
                        AS colaboradores_ativos

                    FROM
                        clientes_rs
                        AS cliente

                    LEFT JOIN
                        clientes_rs_colaboradores
                        AS vinculo

                    ON
                        vinculo.cliente_id =
                        cliente.id

                    WHERE
                        cliente.ativo =
                        TRUE

                    GROUP BY
                        cliente.id

                    ORDER BY
                        cliente.nome
                    `
                );


            return res.json({
                sucesso: true,

                clientes:
                    resultado.rows
            });

        } catch (err) {

            console.error(
                '❌ Clientes fixos:',
                err
            );


            return res
                .status(500)
                .json({
                    sucesso: false,

                    erro:
                        'Erro ao carregar clientes.'
                });
        }
    }
);


// ============================================================
// CADASTRAR CLIENTE FIXO
// ============================================================

app.post(
    '/api/jornada-clientes',

    async (req, res) => {

        try {

            const dados =
                req.body || {};


            const nome =
                String(
                    dados.nome ||
                    ''
                )
                    .trim();


            if (!nome) {

                return res
                    .status(400)
                    .json({
                        sucesso: false,

                        erro:
                            'Informe o nome da empresa cliente.'
                    });
            }


            const resultado =
                await pool.query(
                    `
                    INSERT INTO clientes_rs (
                        nome,
                        cnpj,
                        responsavel_nome,
                        responsavel_email,
                        responsavel_whatsapp,
                        endereco,
                        cidade,
                        uf,
                        latitude,
                        longitude,
                        criado_por
                    )

                    VALUES (
                        $1,$2,$3,$4,$5,
                        $6,$7,$8,$9,$10,
                        $11
                    )

                    RETURNING *
                    `,
                    [
                        nome,

                        dados.cnpj ||
                        null,

                        dados.responsavel_nome ||
                        dados.responsavel ||
                        null,

                        normalizarEmail(
                            dados.responsavel_email
                        )
                        ||
                        null,

                        dados.responsavel_whatsapp ||
                        null,

                        dados.endereco ||
                        null,

                        dados.cidade ||
                        null,

                        dados.uf ||
                        null,

                        dados.latitude ||
                        null,

                        dados.longitude ||
                        null,

                        normalizarEmail(
                            dados.criado_por ||
                            dados.email
                        )
                        ||
                        'sistema'
                    ]
                );


            const cliente =
                resultado.rows[0];


            io.emit(
                'jornada_clientes_atualizada',
                {
                    clienteId:
                        cliente.id
                }
            );


            return res.json({
                sucesso: true,

                mensagem:
                    'Cliente cadastrado.',

                cliente
            });

        } catch (err) {

            console.error(
                '❌ Cadastrar cliente:',
                err
            );


            return res
                .status(500)
                .json({
                    sucesso: false,

                    erro:
                        'Erro ao cadastrar cliente.'
                });
        }
    }
);


// ============================================================
// ATUALIZAR CLIENTE
// ============================================================

app.patch(
    '/api/jornada-clientes/:id',

    async (req, res) => {

        try {

            const clienteId =
                Number(
                    req.params.id
                );


            const dados =
                req.body || {};


            const resultado =
                await pool.query(
                    `
                    UPDATE clientes_rs

                    SET
                        nome =
                            COALESCE(
                                NULLIF($1,''),
                                nome
                            ),

                        cnpj =
                            COALESCE(
                                $2,
                                cnpj
                            ),

                        responsavel_nome =
                            COALESCE(
                                $3,
                                responsavel_nome
                            ),

                        responsavel_email =
                            COALESCE(
                                $4,
                                responsavel_email
                            ),

                        responsavel_whatsapp =
                            COALESCE(
                                $5,
                                responsavel_whatsapp
                            ),

                        endereco =
                            COALESCE(
                                $6,
                                endereco
                            ),

                        cidade =
                            COALESCE(
                                $7,
                                cidade
                            ),

                        uf =
                            COALESCE(
                                $8,
                                uf
                            ),

                        latitude =
                            COALESCE(
                                $9,
                                latitude
                            ),

                        longitude =
                            COALESCE(
                                $10,
                                longitude
                            ),

                        atualizado_em =
                            CURRENT_TIMESTAMP

                    WHERE
                        id =
                        $11

                    RETURNING *
                    `,
                    [
                        dados.nome ||
                        '',

                        dados.cnpj ??
                        null,

                        dados.responsavel_nome ??
                        null,

                        dados.responsavel_email

                            ?

                            normalizarEmail(
                                dados.responsavel_email
                            )

                            :

                            null,

                        dados.responsavel_whatsapp ??
                        null,

                        dados.endereco ??
                        null,

                        dados.cidade ??
                        null,

                        dados.uf ??
                        null,

                        dados.latitude ??
                        null,

                        dados.longitude ??
                        null,

                        clienteId
                    ]
                );


            if (
                !resultado.rows.length
            ) {

                return res
                    .status(404)
                    .json({
                        sucesso: false,

                        erro:
                            'Cliente não encontrado.'
                    });
            }


            io.emit(
                'jornada_clientes_atualizada',
                {
                    clienteId
                }
            );


            return res.json({
                sucesso: true,

                cliente:
                    resultado.rows[0]
            });

        } catch (err) {

            return res
                .status(500)
                .json({
                    sucesso: false,

                    erro:
                        'Erro ao atualizar cliente.'
                });
        }
    }
);


// ============================================================
// COLABORADORES DO CLIENTE
// ============================================================

app.get(
    '/api/jornada-clientes/:id/colaboradores',

    async (req, res) => {

        try {

            const clienteId =
                Number(
                    req.params.id
                );


            const resultado =
                await pool.query(
                    `
                    SELECT *
                    FROM
                        clientes_rs_colaboradores

                    WHERE
                        cliente_id =
                        $1

                    AND
                        ativo =
                        TRUE

                    ORDER BY
                        colaborador_nome
                    `,
                    [
                        clienteId
                    ]
                );


            return res.json({
                sucesso: true,

                colaboradores:
                    resultado.rows
            });

        } catch (err) {

            return res
                .status(500)
                .json({
                    sucesso: false,

                    erro:
                        'Erro ao carregar colaboradores.'
                });
        }
    }
);


// ============================================================
// VINCULAR COLABORADOR
// ============================================================

app.post(
    '/api/jornada-clientes/:id/colaboradores',

    async (req, res) => {

        try {

            const clienteId =
                Number(
                    req.params.id
                );


            const dados =
                req.body || {};


            const email =
                normalizarEmail(
                    dados.colaborador_email ||
                    dados.email
                );


            let nome =
                String(
                    dados.colaborador_nome ||
                    dados.nome ||
                    ''
                )
                    .trim();


            if (!email) {

                return res
                    .status(400)
                    .json({
                        sucesso: false,

                        erro:
                            'Informe o e-mail do colaborador.'
                    });
            }


            if (!nome) {

                const usuarioRes =
                    await pool.query(
                        `
                        SELECT nome
                        FROM usuarios

                        WHERE
                            LOWER(TRIM(email))
                            =
                            LOWER(TRIM($1))

                        LIMIT 1
                        `,
                        [
                            email
                        ]
                    );


                nome =
                    usuarioRes.rows[0]?.nome ||
                    '';
            }


            if (!nome) {

                return res
                    .status(400)
                    .json({
                        sucesso: false,

                        erro:
                            'Informe o nome do colaborador.'
                    });
            }


            const resultado =
                await pool.query(
                    `
                    INSERT INTO clientes_rs_colaboradores (
                        cliente_id,
                        colaborador_email,
                        colaborador_nome,
                        funcao,
                        valor_tipo,
                        valor_base,
                        horario_previsto,
                        ativo,
                        criado_por
                    )

                    VALUES (
                        $1,$2,$3,$4,
                        $5,$6,$7,
                        TRUE,
                        $8
                    )

                    ON CONFLICT (
                        cliente_id,
                        colaborador_email
                    )

                    DO UPDATE SET

                        colaborador_nome =
                            EXCLUDED.colaborador_nome,

                        funcao =
                            EXCLUDED.funcao,

                        valor_tipo =
                            EXCLUDED.valor_tipo,

                        valor_base =
                            EXCLUDED.valor_base,

                        horario_previsto =
                            EXCLUDED.horario_previsto,

                        ativo =
                            TRUE,

                        atualizado_em =
                            CURRENT_TIMESTAMP

                    RETURNING *
                    `,
                    [
                        clienteId,

                        email,

                        nome,

                        dados.funcao ||
                        '',

                        String(
                            dados.valor_tipo ||
                            'dia'
                        )
                            .toLowerCase(),

                        numeroRS(
                            dados.valor_base
                        ),

                        dados.horario_previsto ||
                        '',

                        normalizarEmail(
                            dados.criado_por
                        )
                        ||
                        'sistema'
                    ]
                );


            await garantirJornadasDiaCliente(
                clienteId
            );


            io.emit(
                'jornada_clientes_atualizada',
                {
                    clienteId
                }
            );


            return res.json({
                sucesso: true,

                mensagem:
                    'Colaborador vinculado.',

                colaborador:
                    resultado.rows[0]
            });

        } catch (err) {

            console.error(
                '❌ Vincular colaborador:',
                err
            );


            return res
                .status(500)
                .json({
                    sucesso: false,

                    erro:
                        'Erro ao vincular colaborador.'
                });
        }
    }
);


// ============================================================
// REMOVER COLABORADOR SEM APAGAR HISTÓRICO
// ============================================================

app.delete(
    '/api/jornada-clientes/:clienteId/colaboradores/:id',

    async (req, res) => {

        try {

            const clienteId =
                Number(
                    req.params.clienteId
                );


            const vinculoId =
                Number(
                    req.params.id
                );


            await pool.query(
                `
                UPDATE
                    clientes_rs_colaboradores

                SET
                    ativo =
                        FALSE,

                    atualizado_em =
                        CURRENT_TIMESTAMP

                WHERE
                    id =
                    $1

                AND
                    cliente_id =
                    $2
                `,
                [
                    vinculoId,
                    clienteId
                ]
            );


            io.emit(
                'jornada_clientes_atualizada',
                {
                    clienteId
                }
            );


            return res.json({
                sucesso: true,

                mensagem:
                    'Colaborador removido. O histórico foi mantido.'
            });

        } catch (err) {

            return res
                .status(500)
                .json({
                    sucesso: false,

                    erro:
                        'Erro ao remover colaborador.'
                });
        }
    }
);


// ============================================================
// JORNADAS DO CLIENTE
// ============================================================

app.get(
    '/api/jornada-clientes/:id/jornadas',

    async (req, res) => {

        try {

            const clienteId =
                Number(
                    req.params.id
                );


            const data =
                String(
                    req.query?.data ||
                    dataAtualRS()
                )
                    .slice(
                        0,
                        10
                    );


            await garantirJornadasDiaCliente(
                clienteId,
                data
            );


            const jornadas =
                await pool.query(
                    `
                    SELECT *
                    FROM
                        jornadas_clientes

                    WHERE
                        cliente_id =
                        $1

                    AND
                        data =
                        $2::date

                    ORDER BY
                        colaborador_nome
                    `,
                    [
                        clienteId,
                        data
                    ]
                );


            const fechamento =
                await pool.query(
                    `
                    SELECT *
                    FROM
                        fechamentos_clientes

                    WHERE
                        cliente_id =
                        $1

                    AND
                        data =
                        $2::date

                    LIMIT 1
                    `,
                    [
                        clienteId,
                        data
                    ]
                );


            return res.json({
                sucesso: true,

                data,

                jornadas:
                    jornadas.rows,

                fechamento:
                    fechamento.rows[0]
                    ||
                    null
            });

        } catch (err) {

            console.error(
                '❌ Jornadas cliente:',
                err
            );


            return res
                .status(500)
                .json({
                    sucesso: false,

                    erro:
                        'Erro ao carregar jornadas.'
                });
        }
    }
);


// ============================================================
// HISTÓRICO CLIENTE
// ============================================================

app.get(
    '/api/jornada-clientes/:id/historico',

    async (req, res) => {

        try {

            const clienteId =
                Number(
                    req.params.id
                );


            const email =
                normalizarEmail(
                    req.query?.colaborador_email
                );


            const limite =
                Math.min(
                    Math.max(
                        Number(
                            req.query?.limite ||
                            180
                        ),
                        1
                    ),
                    500
                );


            let resultado;


            if (email) {

                resultado =
                    await pool.query(
                        `
                        SELECT *
                        FROM
                            jornadas_clientes

                        WHERE
                            cliente_id =
                            $1

                        AND
                            LOWER(
                                colaborador_email
                            )
                            =
                            LOWER($2)

                        ORDER BY
                            data DESC,
                            id DESC

                        LIMIT
                            $3
                        `,
                        [
                            clienteId,
                            email,
                            limite
                        ]
                    );

            } else {

                resultado =
                    await pool.query(
                        `
                        SELECT *
                        FROM
                            jornadas_clientes

                        WHERE
                            cliente_id =
                            $1

                        ORDER BY
                            data DESC,
                            colaborador_nome

                        LIMIT
                            $2
                        `,
                        [
                            clienteId,
                            limite
                        ]
                    );
            }


            return res.json({
                sucesso: true,

                jornadas:
                    resultado.rows
            });

        } catch (err) {

            return res
                .status(500)
                .json({
                    sucesso: false,

                    erro:
                        'Erro ao carregar histórico.'
                });
        }
    }
);


// ============================================================
// JORNADA DO COLABORADOR HOJE
// ============================================================

app.get(
    '/api/jornada-colaborador/:email/hoje',

    async (req, res) => {

        try {

            const email =
                normalizarEmail(
                    req.params.email
                );


            const data =
                dataAtualRS();


            const vinculos =
                await pool.query(
                    `
                    SELECT
                        cliente_id

                    FROM
                        clientes_rs_colaboradores

                    WHERE
                        LOWER(
                            colaborador_email
                        )
                        =
                        LOWER($1)

                    AND
                        ativo =
                        TRUE
                    `,
                    [
                        email
                    ]
                );


            for (
                const vinculo
                of vinculos.rows
            ) {

                await garantirJornadasDiaCliente(
                    vinculo.cliente_id,
                    data
                );
            }


            const resultado =
                await pool.query(
                    `
                    SELECT

                        jornada.*,

                        cliente.nome
                            AS cliente_nome,

                        cliente.endereco
                            AS cliente_endereco,

                        cliente.cidade
                            AS cliente_cidade,

                        cliente.uf
                            AS cliente_uf,

                        cliente.latitude
                            AS cliente_latitude,

                        cliente.longitude
                            AS cliente_longitude,

                        cliente.responsavel_nome,

                        cliente.responsavel_email,

                        cliente.responsavel_whatsapp

                    FROM
                        jornadas_clientes
                        AS jornada

                    JOIN
                        clientes_rs
                        AS cliente

                    ON
                        cliente.id =
                        jornada.cliente_id

                    WHERE
                        LOWER(
                            jornada.colaborador_email
                        )
                        =
                        LOWER($1)

                    AND
                        jornada.data =
                        $2::date

                    ORDER BY
                        jornada.id
                    `,
                    [
                        email,
                        data
                    ]
                );


            return res.json({
                sucesso: true,

                data,

                jornadas:
                    resultado.rows
            });

        } catch (err) {

            console.error(
                '❌ Jornada colaborador:',
                err
            );


            return res
                .status(500)
                .json({
                    sucesso: false,

                    erro:
                        'Erro ao carregar jornada.'
                });
        }
    }
);


// ============================================================
// CHECK-IN CLIENTE FIXO
// ============================================================

app.post(
    '/api/jornada-fixa/:id/checkin',

    async (req, res) => {

        try {

            const jornadaId =
                Number(
                    req.params.id
                );


            const email =
                normalizarEmail(
                    req.body?.colaborador_email ||
                    req.body?.email
                );


            const jornada =
                await buscarJornadaCliente(
                    jornadaId
                );


            if (!jornada) {

                return res
                    .status(404)
                    .json({
                        sucesso: false,

                        erro:
                            'Jornada não encontrada.'
                    });
            }


            if (
                normalizarEmail(
                    jornada.colaborador_email
                )
                !==
                email
            ) {

                return res
                    .status(403)
                    .json({
                        sucesso: false,

                        erro:
                            'Esta jornada pertence a outro colaborador.'
                    });
            }


            if (
                jornada.fechada
            ) {

                return res
                    .status(409)
                    .json({
                        sucesso: false,

                        erro:
                            'Esta jornada já foi fechada.'
                    });
            }


            if (
                jornada.entrada_em
            ) {

                return res
                    .status(409)
                    .json({
                        sucesso: false,

                        erro:
                            'A entrada já foi registrada.'
                    });
            }


            const foto =
                req.body?.foto ||
                req.body?.selfie ||
                '';


            const latitude =
                req.body?.latitude;


            const longitude =
                req.body?.longitude;


            const precisao =
                req.body?.precisao ??
                '';


            if (!foto) {

                return res
                    .status(400)
                    .json({
                        sucesso: false,

                        erro:
                            'A foto de entrada é obrigatória.'
                    });
            }


            if (
                latitude ===
                undefined
                ||
                longitude ===
                undefined
            ) {

                return res
                    .status(400)
                    .json({
                        sucesso: false,

                        erro:
                            'A localização GPS é obrigatória.'
                    });
            }


            const resultado =
                await pool.query(
                    `
                    UPDATE
                        jornadas_clientes

                    SET
                        status =
                            'PRESENTE',

                        entrada_em =
                            CURRENT_TIMESTAMP,

                        entrada_foto =
                            $1,

                        entrada_latitude =
                            $2,

                        entrada_longitude =
                            $3,

                        entrada_precisao =
                            $4,

                        atualizado_em =
                            CURRENT_TIMESTAMP

                    WHERE
                        id =
                        $5

                    RETURNING *
                    `,
                    [
                        foto,

                        String(
                            latitude
                        ),

                        String(
                            longitude
                        ),

                        String(
                            precisao
                        ),

                        jornadaId
                    ]
                );


            io.emit(
                'jornada_clientes_atualizada',
                {
                    clienteId:
                        jornada.cliente_id,

                    jornadaId
                }
            );


            return res.json({
                sucesso: true,

                mensagem:
                    'Entrada registrada com foto e GPS.',

                jornada:
                    resultado.rows[0]
            });

        } catch (err) {

            console.error(
                '❌ Check-in cliente fixo:',
                err
            );


            return res
                .status(500)
                .json({
                    sucesso: false,

                    erro:
                        'Erro ao registrar entrada.'
                });
        }
    }
);


// ============================================================
// INTERVALO FIXO
// ============================================================

app.post(
    '/api/jornada-fixa/:id/intervalo/iniciar',

    async (req, res) => {

        try {

            const jornadaId =
                Number(
                    req.params.id
                );


            const jornada =
                await buscarJornadaCliente(
                    jornadaId
                );


            if (!jornada) {

                return res
                    .status(404)
                    .json({
                        sucesso: false,

                        erro:
                            'Jornada não encontrada.'
                    });
            }


            if (
                !jornada.entrada_em
            ) {

                return res
                    .status(409)
                    .json({
                        sucesso: false,

                        erro:
                            'Registre a entrada primeiro.'
                    });
            }


            if (
                jornada.saida_em
            ) {

                return res
                    .status(409)
                    .json({
                        sucesso: false,

                        erro:
                            'A jornada já terminou.'
                    });
            }


            if (
                jornada.intervalo_inicio_em
            ) {

                return res
                    .status(409)
                    .json({
                        sucesso: false,

                        erro:
                            'O intervalo já foi iniciado.'
                    });
            }


            await pool.query(
                `
                UPDATE
                    jornadas_clientes

                SET
                    status =
                        'EM_INTERVALO',

                    intervalo_inicio_em =
                        CURRENT_TIMESTAMP,

                    intervalo_retorno_em =
                        NULL,

                    atualizado_em =
                        CURRENT_TIMESTAMP

                WHERE
                    id =
                        $1
                `,
                [
                    jornadaId
                ]
            );


            io.emit(
                'jornada_clientes_atualizada',
                {
                    clienteId:
                        jornada.cliente_id,

                    jornadaId
                }
            );


            return res.json({
                sucesso: true,

                mensagem:
                    'Intervalo iniciado.'
            });

        } catch (err) {

            return res
                .status(500)
                .json({
                    sucesso: false,

                    erro:
                        'Erro ao iniciar intervalo.'
                });
        }
    }
);


// ============================================================
// RETORNO INTERVALO FIXO
// ============================================================

app.post(
    '/api/jornada-fixa/:id/intervalo/retornar',

    async (req, res) => {

        try {

            const jornadaId =
                Number(
                    req.params.id
                );


            const jornada =
                await buscarJornadaCliente(
                    jornadaId
                );


            if (!jornada) {

                return res
                    .status(404)
                    .json({
                        sucesso: false,

                        erro:
                            'Jornada não encontrada.'
                    });
            }


            if (
                !jornada.intervalo_inicio_em
            ) {

                return res
                    .status(409)
                    .json({
                        sucesso: false,

                        erro:
                            'O intervalo ainda não foi iniciado.'
                    });
            }


            if (
                jornada.intervalo_retorno_em
            ) {

                return res
                    .status(409)
                    .json({
                        sucesso: false,

                        erro:
                            'O retorno já foi registrado.'
                    });
            }


            await pool.query(
                `
                UPDATE
                    jornadas_clientes

                SET
                    status =
                        'PRESENTE',

                    intervalo_retorno_em =
                        CURRENT_TIMESTAMP,

                    atualizado_em =
                        CURRENT_TIMESTAMP

                WHERE
                    id =
                        $1
                `,
                [
                    jornadaId
                ]
            );


            io.emit(
                'jornada_clientes_atualizada',
                {
                    clienteId:
                        jornada.cliente_id,

                    jornadaId
                }
            );


            return res.json({
                sucesso: true,

                mensagem:
                    'Retorno do intervalo registrado.'
            });

        } catch (err) {

            return res
                .status(500)
                .json({
                    sucesso: false,

                    erro:
                        'Erro ao registrar retorno.'
                });
        }
    }
);


// ============================================================
// CHECK-OUT CLIENTE FIXO
// ============================================================

app.post(
    '/api/jornada-fixa/:id/checkout',

    async (req, res) => {

        try {

            const jornadaId =
                Number(
                    req.params.id
                );


            const email =
                normalizarEmail(
                    req.body?.colaborador_email ||
                    req.body?.email
                );


            const jornada =
                await buscarJornadaCliente(
                    jornadaId
                );


            if (!jornada) {

                return res
                    .status(404)
                    .json({
                        sucesso: false,

                        erro:
                            'Jornada não encontrada.'
                    });
            }


            if (
                normalizarEmail(
                    jornada.colaborador_email
                )
                !==
                email
            ) {

                return res
                    .status(403)
                    .json({
                        sucesso: false,

                        erro:
                            'Esta jornada pertence a outro colaborador.'
                    });
            }


            if (
                !jornada.entrada_em
            ) {

                return res
                    .status(409)
                    .json({
                        sucesso: false,

                        erro:
                            'Registre a entrada primeiro.'
                    });
            }


            if (
                jornada.saida_em
            ) {

                return res
                    .status(409)
                    .json({
                        sucesso: false,

                        erro:
                            'A saída já foi registrada.'
                    });
            }


            if (
                jornada.intervalo_inicio_em
                &&
                !jornada.intervalo_retorno_em
            ) {

                return res
                    .status(409)
                    .json({
                        sucesso: false,

                        erro:
                            'Registre o retorno do intervalo antes da saída.'
                    });
            }


            const foto =
                req.body?.foto ||
                req.body?.selfie ||
                '';


            const latitude =
                req.body?.latitude;


            const longitude =
                req.body?.longitude;


            if (!foto) {

                return res
                    .status(400)
                    .json({
                        sucesso: false,

                        erro:
                            'A foto de saída é obrigatória.'
                    });
            }


            if (
                latitude ===
                undefined
                ||
                longitude ===
                undefined
            ) {

                return res
                    .status(400)
                    .json({
                        sucesso: false,

                        erro:
                            'A localização GPS é obrigatória.'
                    });
            }


            await pool.query(
                `
                UPDATE
                    jornadas_clientes

                SET
                    status =
                        'ENCERRADO',

                    saida_em =
                        CURRENT_TIMESTAMP,

                    saida_foto =
                        $1,

                    saida_latitude =
                        $2,

                    saida_longitude =
                        $3,

                    saida_precisao =
                        $4,

                    atualizado_em =
                        CURRENT_TIMESTAMP

                WHERE
                    id =
                        $5
                `,
                [
                    foto,

                    String(
                        latitude
                    ),

                    String(
                        longitude
                    ),

                    String(
                        req.body?.precisao ??
                        ''
                    ),

                    jornadaId
                ]
            );


            const atualizada =
                await recalcularJornadaCliente(
                    jornadaId
                );


            io.emit(
                'jornada_clientes_atualizada',
                {
                    clienteId:
                        jornada.cliente_id,

                    jornadaId
                }
            );


            return res.json({
                sucesso: true,

                mensagem:
                    'Saída registrada. Horas e valor calculados.',

                jornada:
                    atualizada
            });

        } catch (err) {

            console.error(
                '❌ Checkout fixo:',
                err
            );


            return res
                .status(500)
                .json({
                    sucesso: false,

                    erro:
                        'Erro ao registrar saída.'
                });
        }
    }
);


// ============================================================
// VALIDAR ENTRADA / SAÍDA DO CLIENTE
// ============================================================

app.post(
    '/api/jornada-fixa/:id/validar',

    async (req, res) => {

        try {

            const jornadaId =
                Number(
                    req.params.id
                );


            const tipo =
                String(
                    req.body?.tipo ||
                    ''
                )
                    .toLowerCase();


            const validador =
                normalizarEmail(
                    req.body?.validador_email ||
                    req.body?.email
                );


            const jornada =
                await buscarJornadaCliente(
                    jornadaId
                );


            if (!jornada) {

                return res
                    .status(404)
                    .json({
                        sucesso: false,

                        erro:
                            'Jornada não encontrada.'
                    });
            }


            if (
                jornada.responsavel_email

                &&

                normalizarEmail(
                    jornada.responsavel_email
                )
                !==
                validador
            ) {

                return res
                    .status(403)
                    .json({
                        sucesso: false,

                        erro:
                            'Somente o responsável do cliente pode validar.'
                    });
            }


            if (
                tipo !==
                'entrada'

                &&

                tipo !==
                'saida'
            ) {

                return res
                    .status(400)
                    .json({
                        sucesso: false,

                        erro:
                            'Tipo inválido.'
                    });
            }


            if (
                tipo ===
                'entrada'
            ) {

                if (
                    !jornada.entrada_em
                ) {

                    return res
                        .status(409)
                        .json({
                            sucesso: false,

                            erro:
                                'Não existe entrada para validar.'
                        });
                }


                await pool.query(
                    `
                    UPDATE
                        jornadas_clientes

                    SET
                        entrada_validada =
                            TRUE,

                        entrada_validada_por =
                            $1,

                        entrada_validada_em =
                            CURRENT_TIMESTAMP,

                        atualizado_em =
                            CURRENT_TIMESTAMP

                    WHERE
                        id =
                        $2
                    `,
                    [
                        validador,
                        jornadaId
                    ]
                );

            } else {

                if (
                    !jornada.saida_em
                ) {

                    return res
                        .status(409)
                        .json({
                            sucesso: false,

                            erro:
                                'Não existe saída para validar.'
                        });
                }


                await pool.query(
                    `
                    UPDATE
                        jornadas_clientes

                    SET
                        saida_validada =
                            TRUE,

                        saida_validada_por =
                            $1,

                        saida_validada_em =
                            CURRENT_TIMESTAMP,

                        atualizado_em =
                            CURRENT_TIMESTAMP

                    WHERE
                        id =
                        $2
                    `,
                    [
                        validador,
                        jornadaId
                    ]
                );
            }


            io.emit(
                'jornada_clientes_atualizada',
                {
                    clienteId:
                        jornada.cliente_id,

                    jornadaId
                }
            );


            return res.json({
                sucesso: true,

                mensagem:
                    tipo ===
                    'entrada'

                        ?

                        'Entrada validada.'

                        :

                        'Saída validada.'
            });

        } catch (err) {

            console.error(
                '❌ Validação Jornada:',
                err
            );


            return res
                .status(500)
                .json({
                    sucesso: false,

                    erro:
                        'Erro ao validar jornada.'
                });
        }
    }
);


// ============================================================
// FECHAR DIA
// ============================================================

app.post(
    '/api/jornada-clientes/:id/fechar-dia',

    async (req, res) => {

        try {

            const clienteId =
                Number(
                    req.params.id
                );


            const data =
                String(
                    req.body?.data ||
                    dataAtualRS()
                )
                    .slice(
                        0,
                        10
                    );


            const usuario =
                normalizarEmail(
                    req.body?.confirmado_por ||
                    req.body?.email
                )
                ||
                'sistema';


            const abertas =
                await pool.query(
                    `
                    SELECT
                        COUNT(*)::int
                        AS total

                    FROM
                        jornadas_clientes

                    WHERE
                        cliente_id =
                        $1

                    AND
                        data =
                        $2::date

                    AND
                        entrada_em
                        IS NOT NULL

                    AND
                        saida_em
                        IS NULL
                    `,
                    [
                        clienteId,
                        data
                    ]
                );


            if (
                Number(
                    abertas.rows[0]?.total ||
                    0
                )
                >
                0
            ) {

                return res
                    .status(409)
                    .json({
                        sucesso: false,

                        erro:
                            'Existem colaboradores com jornada aberta.'
                    });
            }


            const fechamento =
                await pool.query(
                    `
                    INSERT INTO fechamentos_clientes (
                        cliente_id,
                        data,
                        confirmado,
                        confirmado_por,
                        confirmado_em,
                        observacoes
                    )

                    VALUES (
                        $1,
                        $2::date,
                        TRUE,
                        $3,
                        CURRENT_TIMESTAMP,
                        $4
                    )

                    ON CONFLICT (
                        cliente_id,
                        data
                    )

                    DO UPDATE SET

                        confirmado =
                            TRUE,

                        confirmado_por =
                            EXCLUDED.confirmado_por,

                        confirmado_em =
                            CURRENT_TIMESTAMP,

                        observacoes =
                            EXCLUDED.observacoes

                    RETURNING *
                    `,
                    [
                        clienteId,

                        data,

                        usuario,

                        String(
                            req.body?.observacoes ||
                            ''
                        )
                    ]
                );


            await pool.query(
                `
                UPDATE
                    jornadas_clientes

                SET
                    fechada =
                        TRUE,

                    fechada_por =
                        $1,

                    fechada_em =
                        CURRENT_TIMESTAMP,

                    atualizado_em =
                        CURRENT_TIMESTAMP

                WHERE
                    cliente_id =
                        $2

                AND
                    data =
                        $3::date
                `,
                [
                    usuario,
                    clienteId,
                    data
                ]
            );


            io.emit(
                'jornada_clientes_atualizada',
                {
                    clienteId,
                    data
                }
            );


            return res.json({
                sucesso: true,

                mensagem:
                    'Jornada do dia fechada e arquivada.',

                fechamento:
                    fechamento.rows[0]
            });

        } catch (err) {

            console.error(
                '❌ Fechar dia:',
                err
            );


            return res
                .status(500)
                .json({
                    sucesso: false,

                    erro:
                        'Erro ao fechar o dia.'
                });
        }
    }
);


// ============================================================
// DOCUMENTOS DA JORNADA
// ============================================================

app.get(
    '/api/jornada-fixa/:id/documentos',

    async (req, res) => {

        try {

            const jornadaId =
                Number(
                    req.params.id
                );


            const resultado =
                await pool.query(
                    `
                    SELECT
                        id,
                        jornada_id,
                        tipo,
                        nome,
                        mime,
                        assinatura_status,
                        assinado_por,
                        assinado_em,
                        criado_por,
                        criado_em

                    FROM
                        jornadas_clientes_documentos

                    WHERE
                        jornada_id =
                        $1

                    ORDER BY
                        id DESC
                    `,
                    [
                        jornadaId
                    ]
                );


            return res.json({
                sucesso: true,

                documentos:
                    resultado.rows
            });

        } catch (err) {

            return res
                .status(500)
                .json({
                    sucesso: false,

                    erro:
                        'Erro ao carregar documentos.'
                });
        }
    }
);


// ============================================================
// ENVIAR PDF JORNADA
// ============================================================

app.post(
    '/api/jornada-fixa/:id/documentos',

    upload.single('arquivo'),

    async (req, res) => {

        try {

            const jornadaId =
                Number(
                    req.params.id
                );


            if (
                !req.file?.buffer
            ) {

                return res
                    .status(400)
                    .json({
                        sucesso: false,

                        erro:
                            'Selecione o arquivo PDF.'
                    });
            }


            const nome =
                req.file.originalname ||
                `documento-${jornadaId}.pdf`;


            const mime =
                req.file.mimetype ||
                'application/pdf';


            if (
                mime !==
                'application/pdf'

                &&

                !String(
                    nome
                )
                    .toLowerCase()
                    .endsWith(
                        '.pdf'
                    )
            ) {

                return res
                    .status(400)
                    .json({
                        sucesso: false,

                        erro:
                            'Somente PDF é permitido.'
                    });
            }


            const resultado =
                await pool.query(
                    `
                    INSERT INTO jornadas_clientes_documentos (
                        jornada_id,
                        tipo,
                        nome,
                        mime,
                        arquivo,
                        assinatura_status,
                        criado_por
                    )

                    VALUES (
                        $1,
                        $2,
                        $3,
                        $4,
                        $5,
                        'NAO_ASSINADO',
                        $6
                    )

                    RETURNING
                        id,
                        jornada_id,
                        tipo,
                        nome,
                        assinatura_status,
                        criado_em
                    `,
                    [
                        jornadaId,

                        req.body?.tipo ||
                        'CONTRATO',

                        nome,

                        mime,

                        req.file.buffer,

                        normalizarEmail(
                            req.body?.criado_por ||
                            req.body?.email
                        )
                        ||
                        'sistema'
                    ]
                );


            return res.json({
                sucesso: true,

                mensagem:
                    'Documento vinculado à jornada.',

                documento:
                    resultado.rows[0]
            });

        } catch (err) {

            console.error(
                '❌ Documento Jornada:',
                err
            );


            return res
                .status(500)
                .json({
                    sucesso: false,

                    erro:
                        'Erro ao salvar documento.'
                });
        }
    }
);


// ============================================================
// PDF ASSINADO
// ============================================================

app.post(
    '/api/jornada-documentos/:id/assinado',

    upload.single('arquivo'),

    async (req, res) => {

        try {

            const documentoId =
                Number(
                    req.params.id
                );


            if (
                !req.file?.buffer
            ) {

                return res
                    .status(400)
                    .json({
                        sucesso: false,

                        erro:
                            'Selecione o PDF assinado.'
                    });
            }


            const originalRes =
                await pool.query(
                    `
                    SELECT *
                    FROM
                        jornadas_clientes_documentos

                    WHERE
                        id =
                        $1

                    LIMIT 1
                    `,
                    [
                        documentoId
                    ]
                );


            const original =
                originalRes.rows[0];


            if (!original) {

                return res
                    .status(404)
                    .json({
                        sucesso: false,

                        erro:
                            'Documento não encontrado.'
                    });
            }


            const usuario =
                normalizarEmail(
                    req.body?.assinado_por ||
                    req.body?.email
                )
                ||
                'sistema';


            const resultado =
                await pool.query(
                    `
                    INSERT INTO jornadas_clientes_documentos (
                        jornada_id,
                        tipo,
                        nome,
                        mime,
                        arquivo,
                        assinatura_status,
                        assinado_por,
                        assinado_em,
                        criado_por
                    )

                    VALUES (
                        $1,
                        $2,
                        $3,
                        $4,
                        $5,
                        'ASSINADO',
                        $6,
                        CURRENT_TIMESTAMP,
                        $6
                    )

                    RETURNING
                        id,
                        jornada_id,
                        tipo,
                        nome,
                        assinatura_status,
                        assinado_em
                    `,
                    [
                        original.jornada_id,

                        `${
                            original.tipo ||
                            'DOCUMENTO'
                        }_ASSINADO`,

                        req.file.originalname ||
                        `assinado-${original.nome}`,

                        req.file.mimetype ||
                        'application/pdf',

                        req.file.buffer,

                        usuario
                    ]
                );


            return res.json({
                sucesso: true,

                mensagem:
                    'Documento assinado arquivado.',

                documento:
                    resultado.rows[0]
            });

        } catch (err) {

            return res
                .status(500)
                .json({
                    sucesso: false,

                    erro:
                        'Erro ao arquivar PDF assinado.'
                });
        }
    }
);


// ============================================================
// ABRIR PDF
// ============================================================

app.get(
    '/api/jornada-documentos/:id/arquivo',

    async (req, res) => {

        try {

            const documentoId =
                Number(
                    req.params.id
                );


            const resultado =
                await pool.query(
                    `
                    SELECT
                        nome,
                        mime,
                        arquivo

                    FROM
                        jornadas_clientes_documentos

                    WHERE
                        id =
                        $1

                    LIMIT 1
                    `,
                    [
                        documentoId
                    ]
                );


            const documento =
                resultado.rows[0];


            if (
                !documento?.arquivo
            ) {

                return res
                    .status(404)
                    .json({
                        sucesso: false,

                        erro:
                            'Documento não encontrado.'
                    });
            }


            res.setHeader(
                'Content-Type',

                documento.mime ||
                'application/pdf'
            );


            res.setHeader(
                'Content-Disposition',

                `inline; filename*=UTF-8''${
                    encodeURIComponent(
                        documento.nome ||
                        'documento.pdf'
                    )
                }`
            );


            return res.send(
                documento.arquivo
            );

        } catch (err) {

            return res
                .status(500)
                .json({
                    sucesso: false,

                    erro:
                        'Erro ao abrir documento.'
                });
        }
    }
);


// ============================================================
// STATUS
// ============================================================

app.get(
    '/api/status',

    async (req, res) => {

        try {

            await pool.query(
                'SELECT 1'
            );


            return res.json({
                sucesso: true,

                sistema:
                    'RS Connect',

                status:
                    'online',

                banco:
                    'online',

                websocket:
                    'online',

                horario:
                    horaAtualRS()
            });

        } catch (err) {

            return res
                .status(500)
                .json({
                    sucesso: false,

                    status:
                        'erro',

                    erro:
                        err.message
                });
        }
    }
);


// ============================================================
// WEBSOCKET
// ============================================================

io.on(
    'connection',

    socket => {

        console.log(
            'Novo cliente conectado via WebSocket:',
            socket.id
        );


        socket.on(
            'identificar_usuario',

            dados => {

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
                    `usuario_${email}`
                );


                console.log(
                    `Socket ${socket.id} identificado como ${email}`
                );
            }
        );


        socket.on(
            'entrar_conversa',

            dados => {

                const conversaId =
                    Number(
                        dados?.conversaId ||
                        dados?.conversa_id
                    );


                if (!conversaId) {
                    return;
                }


                socket.join(
                    `conversa_${conversaId}`
                );
            }
        );


        socket.on(
            'sair_conversa',

            dados => {

                const conversaId =
                    Number(
                        dados?.conversaId ||
                        dados?.conversa_id
                    );


                if (!conversaId) {
                    return;
                }


                socket.leave(
                    `conversa_${conversaId}`
                );
            }
        );


        socket.on(
            'disconnect',

            () => {

                console.log(
                    'Cliente desconectado:',
                    socket.id
                );
            }
        );
    }
);


// ============================================================
// ERRO DE UPLOAD
// ============================================================

app.use(
    (
        err,
        req,
        res,
        next
    ) => {

        if (
            err instanceof
            multer.MulterError
        ) {

            if (
                err.code ===
                'LIMIT_FILE_SIZE'
            ) {

                return res
                    .status(413)
                    .json({
                        sucesso: false,

                        erro:
                            'Arquivo muito grande. Limite de 10 MB.'
                    });
            }


            return res
                .status(400)
                .json({
                    sucesso: false,

                    erro:
                        err.message
                });
        }


        return next(
            err
        );
    }
);


// ============================================================
// 404 DA API
// ============================================================

app.use(
    '/api',

    (req, res) => {

        return res
            .status(404)
            .json({
                sucesso: false,

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
// FRONT-END
// ============================================================

app.use(
    (
        req,
        res,
        next
    ) => {

        if (
            req.method !==
            'GET'
        ) {

            return next();
        }


        return res.sendFile(
            path.join(
                __dirname,
                'index.html'
            )
        );
    }
);


// ============================================================
// ERRO FINAL
// ============================================================

app.use(
    (
        err,
        req,
        res,
        next
    ) => {

        console.error(
            '❌ Erro interno:',
            err
        );


        if (
            res.headersSent
        ) {

            return next(
                err
            );
        }


        return res
            .status(500)
            .json({
                sucesso: false,

                erro:
                    'Erro interno do RS Connect.'
            });
    }
);


// ============================================================
// INICIAR RS CONNECT
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
            `🌐 Ambiente: ${
                process.env.NODE_ENV ||
                'development'
            }`
        );


        console.log(
            '🕒 Timezone: America/Sao_Paulo'
        );


        console.log(
            '======================================'
        );


        if (
            !process.env.DATABASE_URL
        ) {

            throw new Error(
                'DATABASE_URL não configurada.'
            );
        }


        await pool.query(
            'SELECT NOW()'
        );


        console.log(
            '✅ PostgreSQL conectado.'
        );


        await criarTabelas();


        await criarTabelasJornadaClientes();


        console.log(
            '✅ Banco RS Connect preparado.'
        );


        const PORT =
            Number(
                process.env.PORT ||
                10000
            );


        server.listen(
            PORT,
            '0.0.0.0',

            () => {

                console.log(
                    '======================================'
                );


                console.log(
                    `✅ RS CONNECT ONLINE NA PORTA ${PORT}`
                );


                console.log(
                    '✅ API ONLINE'
                );


                console.log(
                    '✅ LOGIN ONLINE'
                );


                console.log(
                    '✅ RECUPERAÇÃO SEGURA ONLINE'
                );


                console.log(
                    '✅ WEBSOCKET ONLINE'
                );


                console.log(
                    '✅ SERVIÇOS ONLINE'
                );


                console.log(
                    '✅ JORNADA ONLINE'
                );


                console.log(
                    '✅ CLIENTES FIXOS ONLINE'
                );


                console.log(
                    '✅ CHAT ONLINE'
                );


                console.log(
                    '✅ DOCUMENTOS ONLINE'
                );


                console.log(
                    '======================================'
                );
            }
        );

    } catch (err) {

        console.error(
            '❌ RS Connect não conseguiu iniciar:',
            err
        );


        process.exit(
            1
        );
    }
}


// ============================================================
// ERROS GLOBAIS
// ============================================================

process.on(
    'unhandledRejection',

    err => {

        console.error(
            '❌ Promise não tratada:',
            err
        );
    }
);


process.on(
    'uncaughtException',

    err => {

        console.error(
            '❌ Erro não tratado:',
            err
        );
    }
);


// ============================================================
// ENCERRAMENTO
// ============================================================

let encerrandoRS =
    false;


async function encerrarRSConnect(
    sinal
) {

    if (
        encerrandoRS
    ) {
        return;
    }


    encerrandoRS =
        true;


    console.log(
        `🛑 Encerrando RS Connect: ${sinal}`
    );


    server.close(
        async () => {

            try {

                await pool.end();

            } catch (err) {

                console.error(
                    'Erro PostgreSQL:',
                    err.message
                );
            }


            console.log(
                '✅ RS Connect encerrado corretamente.'
            );


            process.exit(
                0
            );
        }
    );


    setTimeout(
        () => {

            console.error(
                '⚠️ Encerramento forçado.'
            );


            process.exit(
                1
            );

        },
        10000
    )
        .unref();
}


process.on(
    'SIGTERM',

    () => {

        encerrarRSConnect(
            'SIGTERM'
        );
    }
);


process.on(
    'SIGINT',

    () => {

        encerrarRSConnect(
            'SIGINT'
        );
    }
);


// ============================================================
// EXECUTAR
// ============================================================

iniciarRSConnect();


// ============================================================
// FIM DO SERVER.JS
// ============================================================
