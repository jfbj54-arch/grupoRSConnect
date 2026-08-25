const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');
const { Pool } = require('pg');
const multer = require('multer');

const app = express();
const server = http.createServer(app);

const io = new Server(server, {
    cors: {
        origin: "*",
        methods: ["GET", "POST"]
    }
});

const upload = multer({
    limits: {
        fileSize: 50 * 1024 * 1024
    }
});

app.use(
    express.json({
        limit: '50mb'
    })
);

app.use(
    express.urlencoded({
        limit: '50mb',
        extended: true
    })
);

app.use(
    express.static(
        path.join(__dirname)
    )
);


/* =====================================================
   POSTGRESQL
   ===================================================== */

const pool = new Pool({
    connectionString:
        process.env.DATABASE_URL,

    ssl: {
        rejectUnauthorized: false
    }
});


pool.connect(
    (
        err,
        client,
        release
    ) => {

        if (err) {

            console.error(
                'Erro ao conectar ao PostgreSQL:',
                err.stack
            );

        } else {

            console.log(
                'Conectado com sucesso ao banco PostgreSQL.'
            );

            release();

            criarTabelas();
        }
    }
);


/* =====================================================
   BANCO PRINCIPAL
   IMPORTANTE:
   NÃO APAGA NENHUM CADASTRO EXISTENTE
   ===================================================== */

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

                experiencia TEXT
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

                endereco TEXT,

                valor TEXT,

                valor_diaria NUMERIC(10,2)
                    DEFAULT 0,

                valor_liquido NUMERIC(10,2)
                    DEFAULT 0,

                data_horario TEXT,

                forma_pgto TEXT,

                descricao TEXT,

                contrato_texto TEXT,

                empresa_email TEXT,

                empresa_whatsapp TEXT,

                recorrencia TEXT
                    DEFAULT 'unico',

                valor_total NUMERIC(10,2)
                    DEFAULT 0,

                status TEXT
                    DEFAULT 'ativo',

                motivo_cancelamento TEXT,

                prestador_email TEXT,

                prestador_id INTEGER,

                prestador_nome TEXT,

                prestador_pix TEXT,

                prestador_whatsapp TEXT,

                foto_ponto TEXT,

                reservas JSONB
                    DEFAULT '[]'::jsonb,

                mensagens JSONB
                    DEFAULT '[]'::jsonb,

                selfie_confirmacao TEXT,

                documento_comprovante TEXT,

                presenca_confirmada BOOLEAN
                    DEFAULT FALSE,

                status_checkin TEXT
                    DEFAULT 'pendente',

                checkin_hora TEXT,

                checkout_hora TEXT,

                comprovante_pagamento BOOLEAN
                    DEFAULT FALSE,

                nota_oficial TEXT,

                empresa_nome TEXT,

                foto_checkin TEXT,

                foto_checkout TEXT,

                checkin_gps TEXT,

                checkout_gps TEXT,

                intervalo_inicio TEXT,

                intervalo_retorno TEXT,

                total_horas TEXT,

                validado_empresa BOOLEAN
                    DEFAULT FALSE,

                validado_em TIMESTAMP
            );


            CREATE TABLE IF NOT EXISTS ledger_transacoes (

                id SERIAL PRIMARY KEY,

                servico_id INTEGER,

                usuario_email TEXT,

                usuario_id INTEGER,

                tipo TEXT,

                tipo_movimento TEXT,

                valor NUMERIC(10,2)
                    NOT NULL,

                status TEXT
                    NOT NULL
                    DEFAULT 'PROCESSADO',

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

        `);


        /* =================================================
           GARANTIR COLUNAS DO SERVIÇO

           Isso permite atualizar bancos antigos sem apagar
           os serviços ou usuários existentes.
           ================================================= */

        const colunasGarantir = [

            `
            ALTER TABLE servicos
            ADD COLUMN IF NOT EXISTS
            categoria TEXT;
            `,

            `
            ALTER TABLE servicos
            ADD COLUMN IF NOT EXISTS
            valor_diaria NUMERIC(10,2)
            DEFAULT 0;
            `,

            `
            ALTER TABLE servicos
            ADD COLUMN IF NOT EXISTS
            valor_liquido NUMERIC(10,2)
            DEFAULT 0;
            `,

            `
            ALTER TABLE servicos
            ADD COLUMN IF NOT EXISTS
            data_horario TEXT;
            `,

            `
            ALTER TABLE servicos
            ADD COLUMN IF NOT EXISTS
            forma_pgto TEXT;
            `,

            `
            ALTER TABLE servicos
            ADD COLUMN IF NOT EXISTS
            contrato_texto TEXT;
            `,

            `
            ALTER TABLE servicos
            ADD COLUMN IF NOT EXISTS
            empresa_email TEXT;
            `,

            `
            ALTER TABLE servicos
            ADD COLUMN IF NOT EXISTS
            empresa_whatsapp TEXT;
            `,

            `
            ALTER TABLE servicos
            ADD COLUMN IF NOT EXISTS
            recorrencia TEXT
            DEFAULT 'unico';
            `,

            `
            ALTER TABLE servicos
            ADD COLUMN IF NOT EXISTS
            valor_total NUMERIC(10,2)
            DEFAULT 0;
            `,

            `
            ALTER TABLE servicos
            ADD COLUMN IF NOT EXISTS
            reservas JSONB
            DEFAULT '[]'::jsonb;
            `,

            `
            ALTER TABLE servicos
            ADD COLUMN IF NOT EXISTS
            mensagens JSONB
            DEFAULT '[]'::jsonb;
            `,

            `
            ALTER TABLE servicos
            ADD COLUMN IF NOT EXISTS
            selfie_confirmacao TEXT;
            `,

            `
            ALTER TABLE servicos
            ADD COLUMN IF NOT EXISTS
            documento_comprovante TEXT;
            `,

            `
            ALTER TABLE servicos
            ADD COLUMN IF NOT EXISTS
            presenca_confirmada BOOLEAN
            DEFAULT FALSE;
            `,

            `
            ALTER TABLE servicos
            ADD COLUMN IF NOT EXISTS
            status_checkin TEXT
            DEFAULT 'pendente';
            `,

            `
            ALTER TABLE servicos
            ADD COLUMN IF NOT EXISTS
            checkin_hora TEXT;
            `,

            `
            ALTER TABLE servicos
            ADD COLUMN IF NOT EXISTS
            checkout_hora TEXT;
            `,

            `
            ALTER TABLE servicos
            ADD COLUMN IF NOT EXISTS
            comprovante_pagamento BOOLEAN
            DEFAULT FALSE;
            `,

            `
            ALTER TABLE servicos
            ADD COLUMN IF NOT EXISTS
            nota_oficial TEXT;
            `,

            `
            ALTER TABLE servicos
            ADD COLUMN IF NOT EXISTS
            motivo_cancelamento TEXT;
            `,

            `
            ALTER TABLE servicos
            ADD COLUMN IF NOT EXISTS
            empresa_nome TEXT;
            `,

            `
            ALTER TABLE servicos
            ADD COLUMN IF NOT EXISTS
            foto_checkin TEXT;
            `,

            `
            ALTER TABLE servicos
            ADD COLUMN IF NOT EXISTS
            foto_checkout TEXT;
            `,

            `
            ALTER TABLE servicos
            ADD COLUMN IF NOT EXISTS
            checkin_gps TEXT;
            `,

            `
            ALTER TABLE servicos
            ADD COLUMN IF NOT EXISTS
            checkout_gps TEXT;
            `,

            `
            ALTER TABLE servicos
            ADD COLUMN IF NOT EXISTS
            intervalo_inicio TEXT;
            `,

            `
            ALTER TABLE servicos
            ADD COLUMN IF NOT EXISTS
            intervalo_retorno TEXT;
            `,

            `
            ALTER TABLE servicos
            ADD COLUMN IF NOT EXISTS
            total_horas TEXT;
            `,

            `
            ALTER TABLE servicos
            ADD COLUMN IF NOT EXISTS
            validado_empresa BOOLEAN
            DEFAULT FALSE;
            `,

            `
            ALTER TABLE servicos
            ADD COLUMN IF NOT EXISTS
            validado_em TIMESTAMP;
            `
        ];


        for (
            const sqlCol
            of colunasGarantir
        ) {

            await pool
                .query(sqlCol)
                .catch(
                    erro => {

                        console.error(
                            'Aviso ao verificar coluna:',
                            erro.message
                        );
                    }
                );
        }


        /* =================================================
           PREPARA A NOVA GESTÃO COMPLETA
           ================================================= */

        await prepararGestaoCompletaRSConnect();


        console.log(
            'Tabelas e colunas verificadas/criadas com sucesso no PostgreSQL.'
        );


    } catch (err) {

        console.error(
            'Erro ao criar tabelas:',
            err
        );
    }
}


/* =====================================================
   RS CONNECT
   GESTÃO COMPLETA + ARQUIVO DIGITAL

   MIGRAÇÃO ADITIVA
   NÃO USA:
   - DROP TABLE
   - TRUNCATE
   - DELETE DOS CADASTROS
   ===================================================== */

async function prepararGestaoCompletaRSConnect() {

    await pool.query(`

        /* =============================================
           PERFIL DA EMPRESA
           ============================================= */

        CREATE TABLE IF NOT EXISTS empresa_perfis (

            empresa_email TEXT
                PRIMARY KEY,

            nome TEXT,

            documento TEXT,

            responsavel TEXT,

            whatsapp TEXT,

            endereco TEXT,

            descricao TEXT,

            criado_em TIMESTAMP
                DEFAULT CURRENT_TIMESTAMP,

            atualizado_em TIMESTAMP
                DEFAULT CURRENT_TIMESTAMP
        );


        /* =============================================
           PERFIL COMPLEMENTAR DO TRABALHADOR
           ============================================= */

        CREATE TABLE IF NOT EXISTS trabalhador_perfis (

            prestador_email TEXT
                PRIMARY KEY,

            nome TEXT,

            whatsapp TEXT,

            rg_cnh TEXT,

            profissao TEXT,

            pix TEXT,

            experiencia TEXT,

            criado_em TIMESTAMP
                DEFAULT CURRENT_TIMESTAMP,

            atualizado_em TIMESTAMP
                DEFAULT CURRENT_TIMESTAMP
        );


        /* =============================================
           VÍNCULOS

           Guarda:
           TITULAR
           RESERVA 1
           RESERVA 2
           SUBSTITUÍDO
           ============================================= */

        CREATE TABLE IF NOT EXISTS servico_vinculos (

            id SERIAL PRIMARY KEY,

            servico_id INTEGER
                NOT NULL,

            empresa_email TEXT,

            prestador_email TEXT
                NOT NULL,

            papel TEXT
                NOT NULL,

            posicao INTEGER,

            status TEXT
                NOT NULL
                DEFAULT 'ATIVO',

            entrou_em TIMESTAMP
                DEFAULT CURRENT_TIMESTAMP,

            saiu_em TIMESTAMP,

            motivo_saida TEXT,

            criado_em TIMESTAMP
                DEFAULT CURRENT_TIMESTAMP,

            UNIQUE(
                servico_id,
                prestador_email,
                papel
            )
        );


        /* =============================================
           ESCALAS
           ============================================= */

        CREATE TABLE IF NOT EXISTS escalas_servico (

            id SERIAL PRIMARY KEY,

            servico_id INTEGER
                NOT NULL,

            empresa_email TEXT,

            prestador_email TEXT,

            funcao TEXT,

            data_horario TEXT,

            local TEXT,

            status TEXT
                DEFAULT 'ESCALADO',

            criado_em TIMESTAMP
                DEFAULT CURRENT_TIMESTAMP,

            atualizado_em TIMESTAMP
                DEFAULT CURRENT_TIMESTAMP,

            UNIQUE(
                servico_id,
                prestador_email
            )
        );


        /* =============================================
           CONTRATOS

           Arquivo digital do contrato.
           ============================================= */

        CREATE TABLE IF NOT EXISTS contratos_arquivo (

            id SERIAL PRIMARY KEY,

            servico_id INTEGER,

            empresa_email TEXT,

            prestador_email TEXT,

            tipo TEXT
                DEFAULT 'CONTRATO',

            nome_arquivo TEXT,

            mime_type TEXT,

            arquivo_text TEXT,

            hash_sha256 TEXT,

            assinado_em TIMESTAMP,

            criado_em TIMESTAMP
                DEFAULT CURRENT_TIMESTAMP
        );


        /* =============================================
           DOCUMENTOS

           Pode guardar:
           comprovante
           documento
           termo
           relatório
           arquivo relacionado ao serviço
           ============================================= */

        CREATE TABLE IF NOT EXISTS documentos_arquivo (

            id SERIAL PRIMARY KEY,

            servico_id INTEGER,

            empresa_email TEXT,

            prestador_email TEXT,

            categoria TEXT,

            titulo TEXT,

            nome_arquivo TEXT,

            mime_type TEXT,

            arquivo_text TEXT,

            observacao TEXT,

            criado_em TIMESTAMP
                DEFAULT CURRENT_TIMESTAMP
        );


        /* =============================================
           HISTÓRICO COMPLETO

           É a linha do tempo oficial do serviço.
           ============================================= */

        CREATE TABLE IF NOT EXISTS historico_eventos (

            id SERIAL PRIMARY KEY,

            servico_id INTEGER,

            empresa_email TEXT,

            prestador_email TEXT,

            tipo_evento TEXT
                NOT NULL,

            descricao TEXT,

            dados JSONB
                DEFAULT '{}'::jsonb,

            criado_em TIMESTAMP
                DEFAULT CURRENT_TIMESTAMP
        );


        /* =============================================
           PAGAMENTOS

           Histórico financeiro permanente.
           ============================================= */

        CREATE TABLE IF NOT EXISTS pagamentos_historico (

            id SERIAL PRIMARY KEY,

            servico_id INTEGER
                NOT NULL,

            empresa_email TEXT,

            prestador_email TEXT,

            valor NUMERIC(10,2)
                DEFAULT 0,

            forma_pagamento TEXT,

            status TEXT
                DEFAULT 'PENDENTE',

            autorizado_em TIMESTAMP,

            pago_em TIMESTAMP,

            comprovante_documento_id INTEGER,

            criado_em TIMESTAMP
                DEFAULT CURRENT_TIMESTAMP,

            atualizado_em TIMESTAMP
                DEFAULT CURRENT_TIMESTAMP,

            UNIQUE(
                servico_id,
                prestador_email
            )
        );


        /* =============================================
           JORNADA DETALHADA

           Além das colunas atuais do serviço,
           mantém histórico dos eventos.
           ============================================= */

        CREATE TABLE IF NOT EXISTS registros_jornada (

            id SERIAL PRIMARY KEY,

            servico_id INTEGER
                NOT NULL,

            empresa_email TEXT,

            prestador_email TEXT,

            tipo_registro TEXT
                NOT NULL,

            data_hora TIMESTAMP
                DEFAULT CURRENT_TIMESTAMP,

            hora_informada TEXT,

            gps TEXT,

            latitude NUMERIC,

            longitude NUMERIC,

            precisao_gps NUMERIC,

            foto TEXT,

            criado_em TIMESTAMP
                DEFAULT CURRENT_TIMESTAMP
        );


        /* =============================================
           AUDITORIA EMPRESARIAL

           Guarda ações importantes dentro do sistema.
           ============================================= */

        CREATE TABLE IF NOT EXISTS auditoria_empresa (

            id SERIAL PRIMARY KEY,

            empresa_email TEXT,

            usuario_email TEXT,

            servico_id INTEGER,

            acao TEXT
                NOT NULL,

            detalhes JSONB
                DEFAULT '{}'::jsonb,

            criado_em TIMESTAMP
                DEFAULT CURRENT_TIMESTAMP
        );

    `);


    /* =================================================
       ÍNDICES PARA PESQUISA RÁPIDA
       ================================================= */

    await pool.query(`

        CREATE INDEX IF NOT EXISTS
        idx_vinculos_empresa
        ON servico_vinculos(
            LOWER(empresa_email)
        );


        CREATE INDEX IF NOT EXISTS
        idx_vinculos_prestador
        ON servico_vinculos(
            LOWER(prestador_email)
        );


        CREATE INDEX IF NOT EXISTS
        idx_escalas_empresa
        ON escalas_servico(
            LOWER(empresa_email)
        );


        CREATE INDEX IF NOT EXISTS
        idx_escalas_prestador
        ON escalas_servico(
            LOWER(prestador_email)
        );


        CREATE INDEX IF NOT EXISTS
        idx_historico_empresa
        ON historico_eventos(
            LOWER(empresa_email)
        );


        CREATE INDEX IF NOT EXISTS
        idx_historico_prestador
        ON historico_eventos(
            LOWER(prestador_email)
        );


        CREATE INDEX IF NOT EXISTS
        idx_historico_servico
        ON historico_eventos(
            servico_id
        );


        CREATE INDEX IF NOT EXISTS
        idx_pagamentos_empresa
        ON pagamentos_historico(
            LOWER(empresa_email)
        );


        CREATE INDEX IF NOT EXISTS
        idx_pagamentos_prestador
        ON pagamentos_historico(
            LOWER(prestador_email)
        );


        CREATE INDEX IF NOT EXISTS
        idx_documentos_empresa
        ON documentos_arquivo(
            LOWER(empresa_email)
        );


        CREATE INDEX IF NOT EXISTS
        idx_contratos_empresa
        ON contratos_arquivo(
            LOWER(empresa_email)
        );

    `);


    /* =================================================
       IMPORTAR EMPRESAS JÁ CADASTRADAS

       NÃO ALTERA/EXCLUI usuários.
       Apenas cria o perfil complementar.
       ================================================= */

    await pool.query(`

        INSERT INTO empresa_perfis (

            empresa_email,
            nome,
            documento,
            responsavel,
            whatsapp,
            endereco
        )

        SELECT

            LOWER(email),
            nome,
            doc,
            responsavel,
            whatsapp,
            endereco

        FROM usuarios

        WHERE
            LOWER(COALESCE(tipo,'')) =
            'empresa'

            AND
            COALESCE(email,'') <> ''

        ON CONFLICT (empresa_email)
        DO UPDATE SET

            nome =
                COALESCE(
                    EXCLUDED.nome,
                    empresa_perfis.nome
                ),

            documento =
                COALESCE(
                    EXCLUDED.documento,
                    empresa_perfis.documento
                ),

            responsavel =
                COALESCE(
                    EXCLUDED.responsavel,
                    empresa_perfis.responsavel
                ),

            whatsapp =
                COALESCE(
                    EXCLUDED.whatsapp,
                    empresa_perfis.whatsapp
                ),

            endereco =
                COALESCE(
                    EXCLUDED.endereco,
                    empresa_perfis.endereco
                ),

            atualizado_em =
                CURRENT_TIMESTAMP;

    `);


    /* =================================================
       IMPORTAR PRESTADORES JÁ CADASTRADOS
       ================================================= */

    await pool.query(`

        INSERT INTO trabalhador_perfis (

            prestador_email,
            nome,
            whatsapp,
            rg_cnh,
            profissao,
            pix,
            experiencia
        )

        SELECT

            LOWER(email),
            nome,
            whatsapp,
            rg_cnh,
            profissao,
            pix,
            experiencia

        FROM usuarios

        WHERE
            LOWER(COALESCE(tipo,'')) =
            'prestador'

            AND
            COALESCE(email,'') <> ''

        ON CONFLICT (prestador_email)
        DO UPDATE SET

            nome =
                COALESCE(
                    EXCLUDED.nome,
                    trabalhador_perfis.nome
                ),

            whatsapp =
                COALESCE(
                    EXCLUDED.whatsapp,
                    trabalhador_perfis.whatsapp
                ),

            rg_cnh =
                COALESCE(
                    EXCLUDED.rg_cnh,
                    trabalhador_perfis.rg_cnh
                ),

            profissao =
                COALESCE(
                    EXCLUDED.profissao,
                    trabalhador_perfis.profissao
                ),

            pix =
                COALESCE(
                    EXCLUDED.pix,
                    trabalhador_perfis.pix
                ),

            experiencia =
                COALESCE(
                    EXCLUDED.experiencia,
                    trabalhador_perfis.experiencia
                ),

            atualizado_em =
                CURRENT_TIMESTAMP;

    `);


    /* =================================================
       IMPORTAR TITULARES DOS SERVIÇOS ANTIGOS
       ================================================= */

    await pool.query(`

        INSERT INTO servico_vinculos (

            servico_id,
            empresa_email,
            prestador_email,
            papel,
            posicao,
            status
        )

        SELECT

            id,

            LOWER(
                COALESCE(
                    empresa_email,
                    ''
                )
            ),

            LOWER(
                prestador_email
            ),

            'TITULAR',

            0,

            CASE

                WHEN
                    LOWER(
                        COALESCE(
                            status,
                            ''
                        )
                    )
                    IN (
                        'cancelado',
                        'cancelado_ausencia_prestador'
                    )

                THEN 'ENCERRADO'

                ELSE 'ATIVO'

            END

        FROM servicos

        WHERE
            COALESCE(
                prestador_email,
                ''
            ) <> ''

        ON CONFLICT (
            servico_id,
            prestador_email,
            papel
        )
        DO NOTHING;

    `);


    /* =================================================
       CRIAR ESCALAS PARA TITULARES ANTIGOS
       ================================================= */

    await pool.query(`

        INSERT INTO escalas_servico (

            servico_id,
            empresa_email,
            prestador_email,
            funcao,
            data_horario,
            local,
            status
        )

        SELECT

            id,

            LOWER(
                COALESCE(
                    empresa_email,
                    ''
                )
            ),

            LOWER(
                prestador_email
            ),

            COALESCE(
                categoria,
                titulo,
                'Prestador de Serviço'
            ),

            data_horario,

            COALESCE(
                endereco,
                local
            ),

            CASE

                WHEN
                    checkout_hora IS NOT NULL

                THEN 'CONCLUIDO'

                WHEN
                    LOWER(
                        COALESCE(
                            status,
                            ''
                        )
                    )
                    LIKE 'cancel%'

                THEN 'CANCELADO'

                ELSE 'ESCALADO'

            END

        FROM servicos

        WHERE
            COALESCE(
                prestador_email,
                ''
            ) <> ''

        ON CONFLICT (
            servico_id,
            prestador_email
        )
        DO NOTHING;

    `);


    console.log(
        'Gestão completa / Arquivo Digital RS Connect preparado sem apagar dados existentes.'
    );
}


/* =====================================================
   UTILITÁRIOS
   ===================================================== */

function normalizarEmailRS(
    email
) {

    return String(
        email
        ||
        ''
    )
    .trim()
    .toLowerCase();
}


function numeroRSBackend(
    valor
) {

    if (
        typeof valor ===
        'number'
    ) {

        return Number.isFinite(valor)
            ?
            valor
            :
            0;
    }


    let texto =
        String(
            valor
            ??
            '0'
        )
        .replace(
            /R\$/gi,
            ''
        )
        .trim();


    if (
        texto.includes('.')
        &&
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


    } else if (
        texto.includes(',')
    ) {

        texto =
            texto.replace(
                ',',
                '.'
            );
    }


    const numero =
        Number(
            texto.replace(
                /[^0-9.-]/g,
                ''
            )
        );


    return Number.isFinite(
        numero
    )
        ?
        numero
        :
        0;
}


/* =====================================================
   CONTINUA NA PARTE 2
   ===================================================== */
/* =====================================================
   SERVER.JS — PARTE 2
   RS CONNECT — GESTÃO COMPLETA
   ===================================================== */


/* =====================================================
   HISTÓRICO / AUDITORIA
   ===================================================== */

async function registrarHistoricoRS({
    servicoId = null,
    empresaEmail = '',
    prestadorEmail = '',
    tipoEvento,
    descricao = '',
    dados = {}
}) {

    try {

        await pool.query(
            `
            INSERT INTO historico_eventos (
                servico_id,
                empresa_email,
                prestador_email,
                tipo_evento,
                descricao,
                dados
            )
            VALUES (
                $1,
                $2,
                $3,
                $4,
                $5,
                $6::jsonb
            )
            `,
            [
                servicoId,
                normalizarEmailRS(
                    empresaEmail
                ),
                normalizarEmailRS(
                    prestadorEmail
                ),
                tipoEvento,
                descricao,
                JSON.stringify(
                    dados || {}
                )
            ]
        );

    } catch (erro) {

        console.error(
            'Erro ao registrar histórico:',
            erro.message
        );
    }
}


async function registrarAuditoriaEmpresaRS({
    empresaEmail = '',
    usuarioEmail = '',
    servicoId = null,
    acao,
    detalhes = {}
}) {

    try {

        await pool.query(
            `
            INSERT INTO auditoria_empresa (
                empresa_email,
                usuario_email,
                servico_id,
                acao,
                detalhes
            )
            VALUES (
                $1,
                $2,
                $3,
                $4,
                $5::jsonb
            )
            `,
            [
                normalizarEmailRS(
                    empresaEmail
                ),
                normalizarEmailRS(
                    usuarioEmail
                ),
                servicoId,
                acao,
                JSON.stringify(
                    detalhes || {}
                )
            ]
        );

    } catch (erro) {

        console.error(
            'Erro na auditoria empresarial:',
            erro.message
        );
    }
}


async function registrarAuditoriaSistemaRS(
    usuarioEmail,
    acao,
    detalhes = ''
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
                normalizarEmailRS(
                    usuarioEmail
                ),
                acao,
                String(
                    detalhes || ''
                )
            ]
        );

    } catch (erro) {

        console.error(
            'Erro na auditoria do sistema:',
            erro.message
        );
    }
}


/* =====================================================
   BUSCAR SERVIÇO
   ===================================================== */

async function buscarServicoPorIdRS(
    servicoId
) {

    const resultado =
        await pool.query(
            `
            SELECT *
            FROM servicos
            WHERE id = $1
            LIMIT 1
            `,
            [
                servicoId
            ]
        );


    return resultado.rows[0]
        ||
        null;
}


/* =====================================================
   NORMALIZAR RESERVAS
   ===================================================== */

function normalizarReservasRS(
    reservas
) {

    if (
        Array.isArray(
            reservas
        )
    ) {

        return reservas;
    }


    if (!reservas) {

        return [];
    }


    try {

        const convertido =
            typeof reservas ===
            'string'
                ?
                JSON.parse(
                    reservas
                )
                :
                reservas;


        return Array.isArray(
            convertido
        )
            ?
            convertido
            :
            [];

    } catch {

        return [];
    }
}


/* =====================================================
   SOCKET.IO
   ===================================================== */

io.on(
    'connection',
    socket => {

        console.log(
            'Novo cliente conectado via WebSocket:',
            socket.id
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


function emitirAtualizacaoServicosRS() {

    io.emit(
        'atualizar_servicos',
        {
            atualizadoEm:
                new Date()
                    .toISOString()
        }
    );
}


/* =====================================================
   ROTA DE TESTE
   ===================================================== */

app.get(
    '/api/status',
    async (
        req,
        res
    ) => {

        try {

            await pool.query(
                'SELECT NOW()'
            );


            res.json({
                sucesso: true,
                sistema:
                    'RS Connect',
                banco:
                    'PostgreSQL conectado',
                servidor:
                    'online',
                data:
                    new Date()
                        .toISOString()
            });

        } catch (erro) {

            res.status(500)
                .json({
                    sucesso: false,
                    erro:
                        'Falha na conexão com o banco.'
                });
        }
    }
);


/* =====================================================
   LOGIN
   ===================================================== */

app.post(
    '/api/auth/login',
    async (
        req,
        res
    ) => {

        try {

            const email =
                normalizarEmailRS(
                    req.body.email
                );


            const senha =
                String(
                    req.body.senha
                    ||
                    ''
                );


            if (
                !email
                ||
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


            const resultado =
                await pool.query(
                    `
                    SELECT *
                    FROM usuarios
                    WHERE LOWER(email) = $1
                    LIMIT 1
                    `,
                    [
                        email
                    ]
                );


            if (
                resultado.rows.length ===
                0
            ) {

                return res
                    .status(401)
                    .json({
                        sucesso: false,
                        erro:
                            'E-mail ou senha incorretos.'
                    });
            }


            const usuario =
                resultado.rows[0];


            if (
                String(
                    usuario.senha
                    ||
                    ''
                ) !== senha
            ) {

                return res
                    .status(401)
                    .json({
                        sucesso: false,
                        erro:
                            'E-mail ou senha incorretos.'
                    });
            }


            const usuarioSeguro = {

                id:
                    usuario.id,

                tipo:
                    usuario.tipo,

                nome:
                    usuario.nome,

                doc:
                    usuario.doc,

                responsavel:
                    usuario.responsavel,

                email:
                    usuario.email,

                whatsapp:
                    usuario.whatsapp,

                endereco:
                    usuario.endereco,

                rg_cnh:
                    usuario.rg_cnh,

                rgCnh:
                    usuario.rg_cnh,

                profissao:
                    usuario.profissao,

                tipo_chave_pix:
                    usuario.tipo_chave_pix,

                tipoChavePix:
                    usuario.tipo_chave_pix,

                pix:
                    usuario.pix,

                banco:
                    usuario.banco,

                conta:
                    usuario.conta,

                experiencia:
                    usuario.experiencia
            };


            await registrarAuditoriaSistemaRS(
                email,
                'LOGIN',
                'Usuário entrou no RS Connect.'
            );


            res.json({
                sucesso: true,
                usuario:
                    usuarioSeguro
            });

        } catch (erro) {

            console.error(
                'Erro no login:',
                erro
            );


            res.status(500)
                .json({
                    sucesso: false,
                    erro:
                        'Erro interno ao realizar login.'
                });
        }
    }
);


/* =====================================================
   CADASTRO
   ===================================================== */

app.post(
    '/api/auth/registrar',
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


            const {
                nome,
                email,
                senha,
                tipo,
                whatsapp,
                doc,
                responsavel,
                rgCnh,
                profissao,
                tipoChavePix,
                pix,
                banco,
                conta,
                experiencia,
                endereco
            } = req.body;


            const emailNormalizado =
                normalizarEmailRS(
                    email
                );


            const tipoNormalizado =
                String(
                    tipo
                    ||
                    ''
                )
                .trim()
                .toLowerCase();


            if (
                !nome
                ||
                !emailNormalizado
                ||
                !senha
                ||
                !tipoNormalizado
            ) {

                await client.query(
                    'ROLLBACK'
                );


                return res
                    .status(400)
                    .json({
                        sucesso: false,
                        erro:
                            'Preencha nome, e-mail, senha e tipo de cadastro.'
                    });
            }


            if (
                ![
                    'empresa',
                    'prestador'
                ]
                .includes(
                    tipoNormalizado
                )
            ) {

                await client.query(
                    'ROLLBACK'
                );


                return res
                    .status(400)
                    .json({
                        sucesso: false,
                        erro:
                            'Tipo de cadastro inválido.'
                    });
            }


            if (
                String(
                    senha
                )
                .length < 6
            ) {

                await client.query(
                    'ROLLBACK'
                );


                return res
                    .status(400)
                    .json({
                        sucesso: false,
                        erro:
                            'A senha precisa ter pelo menos 6 caracteres.'
                    });
            }


            const existente =
                await client.query(
                    `
                    SELECT id
                    FROM usuarios
                    WHERE LOWER(email) = $1
                    LIMIT 1
                    `,
                    [
                        emailNormalizado
                    ]
                );


            if (
                existente.rows.length >
                0
            ) {

                await client.query(
                    'ROLLBACK'
                );


                return res
                    .status(409)
                    .json({
                        sucesso: false,
                        erro:
                            'Já existe uma conta cadastrada com este e-mail.'
                    });
            }


            const novoUsuario =
                await client.query(
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
                        experiencia

                    )
                    VALUES (

                        $1,
                        $2,
                        $3,
                        $4,
                        $5,
                        $6,
                        $7,
                        $8,
                        $9,
                        $10,
                        $11,
                        $12,
                        $13,
                        $14,
                        $15

                    )

                    RETURNING id
                    `,
                    [
                        tipoNormalizado,
                        String(
                            nome
                            ||
                            ''
                        ).trim(),
                        String(
                            doc
                            ||
                            ''
                        ).trim(),
                        String(
                            responsavel
                            ||
                            ''
                        ).trim(),
                        emailNormalizado,
                        String(
                            senha
                        ),
                        String(
                            whatsapp
                            ||
                            ''
                        ).trim(),
                        String(
                            endereco
                            ||
                            ''
                        ).trim(),
                        String(
                            rgCnh
                            ||
                            ''
                        ).trim(),
                        String(
                            profissao
                            ||
                            ''
                        ).trim(),
                        String(
                            tipoChavePix
                            ||
                            ''
                        ).trim(),
                        String(
                            pix
                            ||
                            ''
                        ).trim(),
                        String(
                            banco
                            ||
                            ''
                        ).trim(),
                        String(
                            conta
                            ||
                            ''
                        ).trim(),
                        String(
                            experiencia
                            ||
                            ''
                        ).trim()
                    ]
                );


            if (
                tipoNormalizado ===
                'prestador'
            ) {

                await client.query(
                    `
                    INSERT INTO prestadores (
                        email
                    )
                    VALUES (
                        $1
                    )
                    ON CONFLICT (email)
                    DO NOTHING
                    `,
                    [
                        emailNormalizado
                    ]
                );


                await client.query(
                    `
                    INSERT INTO trabalhador_perfis (

                        prestador_email,
                        nome,
                        whatsapp,
                        rg_cnh,
                        profissao,
                        pix,
                        experiencia

                    )
                    VALUES (

                        $1,
                        $2,
                        $3,
                        $4,
                        $5,
                        $6,
                        $7

                    )

                    ON CONFLICT (
                        prestador_email
                    )
                    DO UPDATE SET

                        nome =
                            EXCLUDED.nome,

                        whatsapp =
                            EXCLUDED.whatsapp,

                        rg_cnh =
                            EXCLUDED.rg_cnh,

                        profissao =
                            EXCLUDED.profissao,

                        pix =
                            EXCLUDED.pix,

                        experiencia =
                            EXCLUDED.experiencia,

                        atualizado_em =
                            CURRENT_TIMESTAMP
                    `,
                    [
                        emailNormalizado,
                        String(
                            nome
                            ||
                            ''
                        ).trim(),
                        String(
                            whatsapp
                            ||
                            ''
                        ).trim(),
                        String(
                            rgCnh
                            ||
                            ''
                        ).trim(),
                        String(
                            profissao
                            ||
                            ''
                        ).trim(),
                        String(
                            pix
                            ||
                            ''
                        ).trim(),
                        String(
                            experiencia
                            ||
                            ''
                        ).trim()
                    ]
                );


            } else {

                await client.query(
                    `
                    INSERT INTO empresa_perfis (

                        empresa_email,
                        nome,
                        documento,
                        responsavel,
                        whatsapp,
                        endereco

                    )
                    VALUES (

                        $1,
                        $2,
                        $3,
                        $4,
                        $5,
                        $6

                    )

                    ON CONFLICT (
                        empresa_email
                    )
                    DO UPDATE SET

                        nome =
                            EXCLUDED.nome,

                        documento =
                            EXCLUDED.documento,

                        responsavel =
                            EXCLUDED.responsavel,

                        whatsapp =
                            EXCLUDED.whatsapp,

                        endereco =
                            EXCLUDED.endereco,

                        atualizado_em =
                            CURRENT_TIMESTAMP
                    `,
                    [
                        emailNormalizado,
                        String(
                            nome
                            ||
                            ''
                        ).trim(),
                        String(
                            doc
                            ||
                            ''
                        ).trim(),
                        String(
                            responsavel
                            ||
                            ''
                        ).trim(),
                        String(
                            whatsapp
                            ||
                            ''
                        ).trim(),
                        String(
                            endereco
                            ||
                            ''
                        ).trim()
                    ]
                );
            }


            await client.query(
                'COMMIT'
            );


            await registrarAuditoriaSistemaRS(
                emailNormalizado,
                'CADASTRO',
                `Nova conta ${tipoNormalizado} cadastrada.`
            );


            res.status(201)
                .json({
                    sucesso: true,

                    mensagem:
                        'Cadastro realizado com sucesso.',

                    usuarioId:
                        novoUsuario.rows[0].id
                });


        } catch (erro) {

            await client.query(
                'ROLLBACK'
            );


            console.error(
                'Erro no cadastro:',
                erro
            );


            res.status(500)
                .json({
                    sucesso: false,
                    erro:
                        'Erro interno ao realizar cadastro.'
                });


        } finally {

            client.release();
        }
    }
);


/* =====================================================
   LISTAR SERVIÇOS
   ===================================================== */

app.get(
    '/api/servicos',
    async (
        req,
        res
    ) => {

        try {

            const resultado =
                await pool.query(
                    `
                    SELECT *
                    FROM servicos
                    ORDER BY id DESC
                    `
                );


            const servicos =
                resultado.rows.map(
                    servico => ({

                        ...servico,

                        reservas:
                            normalizarReservasRS(
                                servico.reservas
                            ),

                        mensagens:
                            normalizarReservasRS(
                                servico.mensagens
                            )
                    })
                );


            res.set(
                'Cache-Control',
                'no-store, no-cache, must-revalidate, proxy-revalidate'
            );


            res.set(
                'Pragma',
                'no-cache'
            );


            res.set(
                'Expires',
                '0'
            );


            res.json(
                servicos
            );

        } catch (erro) {

            console.error(
                'Erro ao listar serviços:',
                erro
            );


            res.status(500)
                .json({
                    sucesso: false,
                    erro:
                        'Erro ao carregar serviços.'
                });
        }
    }
);


/* =====================================================
   BUSCAR UM SERVIÇO
   ===================================================== */

app.get(
    '/api/servicos/:id',
    async (
        req,
        res
    ) => {

        try {

            const servico =
                await buscarServicoPorIdRS(
                    req.params.id
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


            servico.reservas =
                normalizarReservasRS(
                    servico.reservas
                );


            servico.mensagens =
                normalizarReservasRS(
                    servico.mensagens
                );


            res.json(
                servico
            );

        } catch (erro) {

            console.error(
                'Erro ao buscar serviço:',
                erro
            );


            res.status(500)
                .json({
                    sucesso: false,
                    erro:
                        'Erro ao buscar serviço.'
                });
        }
    }
);


/* =====================================================
   PUBLICAR NOVO SERVIÇO
   ===================================================== */

app.post(
    '/api/servicos',
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


            const {

                titulo,
                categoria,
                local,
                endereco,
                valor,
                horario,
                dataHorario,
                recorrencia,
                pagamento,
                descricao,
                contrato,
                empresaEmail,
                empresaNome,
                empresaWhatsapp

            } = req.body;


            const empresaEmailNormalizado =
                normalizarEmailRS(
                    empresaEmail
                );


            if (
                !titulo
                ||
                !empresaEmailNormalizado
            ) {

                await client.query(
                    'ROLLBACK'
                );


                return res
                    .status(400)
                    .json({
                        sucesso: false,
                        erro:
                            'Título e empresa são obrigatórios.'
                    });
            }


            const valorNumero =
                numeroRSBackend(
                    valor
                );


            const dataHorarioFinal =
                dataHorario
                ||
                horario
                ||
                'A combinar';


            const resultado =
                await client.query(
                    `
                    INSERT INTO servicos (

                        titulo,
                        categoria,
                        local,
                        endereco,
                        valor,
                        valor_diaria,
                        valor_liquido,
                        data_horario,
                        forma_pgto,
                        descricao,
                        contrato_texto,
                        empresa_email,
                        empresa_nome,
                        empresa_whatsapp,
                        recorrencia,
                        valor_total,
                        status,
                        reservas,
                        mensagens,
                        presenca_confirmada,
                        status_checkin,
                        comprovante_pagamento,
                        validado_empresa

                    )
                    VALUES (

                        $1,
                        $2,
                        $3,
                        $4,
                        $5,
                        $6,
                        $7,
                        $8,
                        $9,
                        $10,
                        $11,
                        $12,
                        $13,
                        $14,
                        $15,
                        $16,
                        'ativo',
                        '[]'::jsonb,
                        '[]'::jsonb,
                        FALSE,
                        'pendente',
                        FALSE,
                        FALSE

                    )

                    RETURNING *
                    `,
                    [
                        String(
                            titulo
                        ).trim(),

                        String(
                            categoria
                            ||
                            'Geral'
                        ).trim(),

                        String(
                            local
                            ||
                            ''
                        ).trim(),

                        String(
                            endereco
                            ||
                            ''
                        ).trim(),

                        String(
                            valor
                            ||
                            valorNumero
                        ),

                        valorNumero,

                        valorNumero,

                        String(
                            dataHorarioFinal
                            ||
                            ''
                        ),

                        String(
                            pagamento
                            ||
                            'Pix'
                        ),

                        String(
                            descricao
                            ||
                            ''
                        ),

                        String(
                            contrato
                            ||
                            ''
                        ),

                        empresaEmailNormalizado,

                        String(
                            empresaNome
                            ||
                            ''
                        ).trim(),

                        String(
                            empresaWhatsapp
                            ||
                            ''
                        ).trim(),

                        String(
                            recorrencia
                            ||
                            'unico'
                        ),

                        valorNumero
                    ]
                );


            const servico =
                resultado.rows[0];


            await client.query(
                `
                INSERT INTO historico_eventos (

                    servico_id,
                    empresa_email,
                    prestador_email,
                    tipo_evento,
                    descricao,
                    dados

                )
                VALUES (

                    $1,
                    $2,
                    '',
                    'SERVICO_PUBLICADO',
                    $3,
                    $4::jsonb

                )
                `,
                [
                    servico.id,

                    empresaEmailNormalizado,

                    `Serviço "${servico.titulo}" publicado pela empresa.`,

                    JSON.stringify({

                        titulo:
                            servico.titulo,

                        categoria:
                            servico.categoria,

                        local:
                            servico.local,

                        valor:
                            valorNumero,

                        dataHorario:
                            servico.data_horario
                    })
                ]
            );


            await client.query(
                `
                INSERT INTO auditoria_empresa (

                    empresa_email,
                    usuario_email,
                    servico_id,
                    acao,
                    detalhes

                )
                VALUES (

                    $1,
                    $1,
                    $2,
                    'PUBLICOU_SERVICO',
                    $3::jsonb

                )
                `,
                [
                    empresaEmailNormalizado,

                    servico.id,

                    JSON.stringify({
                        titulo:
                            servico.titulo
                    })
                ]
            );


            await client.query(
                'COMMIT'
            );


            emitirAtualizacaoServicosRS();


            res.status(201)
                .json({
                    sucesso: true,

                    mensagem:
                        'Serviço publicado com sucesso.',

                    servico
                });


        } catch (erro) {

            await client.query(
                'ROLLBACK'
            );


            console.error(
                'Erro ao publicar serviço:',
                erro
            );


            res.status(500)
                .json({
                    sucesso: false,
                    erro:
                        'Erro interno ao publicar serviço.'
                });


        } finally {

            client.release();
        }
    }
);


/* =====================================================
   ACEITAR VAGA COMO TITULAR

   FLUXO:
   disponível
   → trabalhador aceita
   → vira titular
   → contrato/aceite
   → aguardando confirmação
   ===================================================== */

app.post(
    '/api/servicos/:id/aceitar',
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


            const servicoId =
                Number(
                    req.params.id
                );


            const prestadorEmail =
                normalizarEmailRS(
                    req.body.prestadorEmail
                );


            const prestadorNome =
                String(
                    req.body.prestadorNome
                    ||
                    ''
                )
                .trim();


            const prestadorWhatsapp =
                String(
                    req.body.prestadorWhatsapp
                    ||
                    ''
                )
                .trim();


            const prestadorPix =
                String(
                    req.body.prestadorPix
                    ||
                    ''
                )
                .trim();


            if (
                !servicoId
                ||
                !prestadorEmail
            ) {

                await client.query(
                    'ROLLBACK'
                );


                return res
                    .status(400)
                    .json({
                        sucesso: false,
                        erro:
                            'Serviço ou prestador inválido.'
                    });
            }


            /*
             * FOR UPDATE impede dois trabalhadores
             * de assumirem a mesma vaga ao mesmo tempo.
             */

            const resultadoServico =
                await client.query(
                    `
                    SELECT *
                    FROM servicos
                    WHERE id = $1
                    FOR UPDATE
                    `,
                    [
                        servicoId
                    ]
                );


            if (
                resultadoServico.rows.length ===
                0
            ) {

                await client.query(
                    'ROLLBACK'
                );


                return res
                    .status(404)
                    .json({
                        sucesso: false,
                        erro:
                            'Serviço não encontrado.'
                    });
            }


            const servico =
                resultadoServico.rows[0];


            if (
                servico.prestador_email
            ) {

                await client.query(
                    'ROLLBACK'
                );


                return res
                    .status(409)
                    .json({
                        sucesso: false,
                        erro:
                            'Esta vaga já possui um Titular. Você pode entrar na fila de reserva.'
                    });
            }


            const reservas =
                normalizarReservasRS(
                    servico.reservas
                );


            const jaReserva =
                reservas.some(
                    reserva =>
                        normalizarEmailRS(
                            reserva.email
                        )
                        ===
                        prestadorEmail
                );


            if (jaReserva) {

                await client.query(
                    'ROLLBACK'
                );


                return res
                    .status(409)
                    .json({
                        sucesso: false,
                        erro:
                            'Você já está vinculado a esta vaga como reserva.'
                    });
            }


            await client.query(
                `
                UPDATE servicos

                SET
                    prestador_email = $1,
                    prestador_nome = $2,
                    prestador_whatsapp = $3,
                    prestador_pix = $4,
                    presenca_confirmada = FALSE,
                    selfie_confirmacao = NULL,
                    status_checkin = 'pendente',
                    status = 'aguardando_confirmacao'

                WHERE id = $5
                `,
                [
                    prestadorEmail,
                    prestadorNome,
                    prestadorWhatsapp,
                    prestadorPix,
                    servicoId
                ]
            );


            /* =========================================
               VÍNCULO DO TITULAR
               ========================================= */

            await client.query(
                `
                INSERT INTO servico_vinculos (

                    servico_id,
                    empresa_email,
                    prestador_email,
                    papel,
                    posicao,
                    status

                )
                VALUES (

                    $1,
                    $2,
                    $3,
                    'TITULAR',
                    0,
                    'ATIVO'

                )

                ON CONFLICT (
                    servico_id,
                    prestador_email,
                    papel
                )
                DO UPDATE SET

                    status =
                        'ATIVO',

                    saiu_em =
                        NULL,

                    motivo_saida =
                        NULL
                `,
                [
                    servicoId,
                    normalizarEmailRS(
                        servico.empresa_email
                    ),
                    prestadorEmail
                ]
            );


            /* =========================================
               ESCALA
               ========================================= */

            await client.query(
                `
                INSERT INTO escalas_servico (

                    servico_id,
                    empresa_email,
                    prestador_email,
                    funcao,
                    data_horario,
                    local,
                    status

                )
                VALUES (

                    $1,
                    $2,
                    $3,
                    $4,
                    $5,
                    $6,
                    'AGUARDANDO_CONFIRMACAO'

                )

                ON CONFLICT (
                    servico_id,
                    prestador_email
                )
                DO UPDATE SET

                    funcao =
                        EXCLUDED.funcao,

                    data_horario =
                        EXCLUDED.data_horario,

                    local =
                        EXCLUDED.local,

                    status =
                        'AGUARDANDO_CONFIRMACAO',

                    atualizado_em =
                        CURRENT_TIMESTAMP
                `,
                [
                    servicoId,

                    normalizarEmailRS(
                        servico.empresa_email
                    ),

                    prestadorEmail,

                    servico.categoria
                    ||
                    servico.titulo
                    ||
                    'Prestador de Serviço',

                    servico.data_horario,

                    servico.endereco
                    ||
                    servico.local
                ]
            );


            /* =========================================
               HISTÓRICO
               ========================================= */

            await client.query(
                `
                INSERT INTO historico_eventos (

                    servico_id,
                    empresa_email,
                    prestador_email,
                    tipo_evento,
                    descricao,
                    dados

                )
                VALUES (

                    $1,
                    $2,
                    $3,
                    'VAGA_ACEITA_TITULAR',
                    $4,
                    $5::jsonb

                )
                `,
                [
                    servicoId,

                    normalizarEmailRS(
                        servico.empresa_email
                    ),

                    prestadorEmail,

                    `${prestadorNome || prestadorEmail} assumiu a vaga como Titular.`,

                    JSON.stringify({
                        papel:
                            'TITULAR',

                        status:
                            'AGUARDANDO_CONFIRMACAO'
                    })
                ]
            );


            await client.query(
                'COMMIT'
            );


            emitirAtualizacaoServicosRS();


            res.json({
                sucesso: true,

                mensagem:
                    'Vaga assumida com sucesso! Agora confirme sua presença dentro do prazo.',

                papel:
                    'TITULAR',

                aguardandoConfirmacao:
                    true
            });


        } catch (erro) {

            await client.query(
                'ROLLBACK'
            );


            console.error(
                'Erro ao aceitar vaga:',
                erro
            );


            res.status(500)
                .json({
                    sucesso: false,
                    erro:
                        'Erro interno ao assumir a vaga.'
                });


        } finally {

            client.release();
        }
    }
);


/* =====================================================
   ENTRAR NA FILA DE RESERVA

   MÁXIMO:
   1 Titular
   2 Reservas
   ===================================================== */

app.post(
    '/api/servicos/:id/fila',
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


            const servicoId =
                Number(
                    req.params.id
                );


            const prestadorEmail =
                normalizarEmailRS(
                    req.body.prestadorEmail
                );


            const prestadorNome =
                String(
                    req.body.prestadorNome
                    ||
                    ''
                )
                .trim();


            const prestadorWhatsapp =
                String(
                    req.body.prestadorWhatsapp
                    ||
                    ''
                )
                .trim();


            const prestadorPix =
                String(
                    req.body.prestadorPix
                    ||
                    ''
                )
                .trim();


            if (
                !servicoId
                ||
                !prestadorEmail
            ) {

                await client.query(
                    'ROLLBACK'
                );


                return res
                    .status(400)
                    .json({
                        sucesso: false,
                        erro:
                            'Serviço ou prestador inválido.'
                    });
            }


            const resultadoServico =
                await client.query(
                    `
                    SELECT *
                    FROM servicos
                    WHERE id = $1
                    FOR UPDATE
                    `,
                    [
                        servicoId
                    ]
                );


            if (
                resultadoServico.rows.length ===
                0
            ) {

                await client.query(
                    'ROLLBACK'
                );


                return res
                    .status(404)
                    .json({
                        sucesso: false,
                        erro:
                            'Serviço não encontrado.'
                    });
            }


            const servico =
                resultadoServico.rows[0];


            if (
                normalizarEmailRS(
                    servico.prestador_email
                )
                ===
                prestadorEmail
            ) {

                await client.query(
                    'ROLLBACK'
                );


                return res
                    .status(409)
                    .json({
                        sucesso: false,
                        erro:
                            'Você já é o Titular desta vaga.'
                    });
            }


            const reservas =
                normalizarReservasRS(
                    servico.reservas
                );


            const jaExiste =
                reservas.some(
                    reserva =>
                        normalizarEmailRS(
                            reserva.email
                        )
                        ===
                        prestadorEmail
                );


            if (jaExiste) {

                await client.query(
                    'ROLLBACK'
                );


                return res
                    .status(409)
                    .json({
                        sucesso: false,
                        erro:
                            'Você já está na fila de reserva desta vaga.'
                    });
            }


            if (
                reservas.length >= 2
            ) {

                await client.query(
                    'ROLLBACK'
                );


                return res
                    .status(409)
                    .json({
                        sucesso: false,
                        erro:
                            'As duas vagas de reserva já foram preenchidas.'
                    });
            }


            const posicao =
                reservas.length + 1;


            const novaReserva = {

                email:
                    prestadorEmail,

                nome:
                    prestadorNome,

                whatsapp:
                    prestadorWhatsapp,

                pix:
                    prestadorPix,

                posicao,

                entrouEm:
                    new Date()
                        .toISOString()
            };


            reservas.push(
                novaReserva
            );


            await client.query(
                `
                UPDATE servicos

                SET reservas =
                    $1::jsonb

                WHERE id = $2
                `,
                [
                    JSON.stringify(
                        reservas
                    ),
                    servicoId
                ]
            );


            /* =========================================
               VÍNCULO DA RESERVA
               ========================================= */

            await client.query(
                `
                INSERT INTO servico_vinculos (

                    servico_id,
                    empresa_email,
                    prestador_email,
                    papel,
                    posicao,
                    status

                )
                VALUES (

                    $1,
                    $2,
                    $3,
                    'RESERVA',
                    $4,
                    'ATIVO'

                )

                ON CONFLICT (
                    servico_id,
                    prestador_email,
                    papel
                )
                DO UPDATE SET

                    posicao =
                        EXCLUDED.posicao,

                    status =
                        'ATIVO',

                    saiu_em =
                        NULL,

                    motivo_saida =
                        NULL
                `,
                [
                    servicoId,

                    normalizarEmailRS(
                        servico.empresa_email
                    ),

                    prestadorEmail,

                    posicao
                ]
            );


            /* =========================================
               ESCALA DA RESERVA
               ========================================= */

            await client.query(
                `
                INSERT INTO escalas_servico (

                    servico_id,
                    empresa_email,
                    prestador_email,
                    funcao,
                    data_horario,
                    local,
                    status

                )
                VALUES (

                    $1,
                    $2,
                    $3,
                    $4,
                    $5,
                    $6,
                    'RESERVA'

                )

                ON CONFLICT (
                    servico_id,
                    prestador_email
                )
                DO UPDATE SET

                    status =
                        'RESERVA',

                    atualizado_em =
                        CURRENT_TIMESTAMP
                `,
                [
                    servicoId,

                    normalizarEmailRS(
                        servico.empresa_email
                    ),

                    prestadorEmail,

                    servico.categoria
                    ||
                    servico.titulo
                    ||
                    'Prestador de Serviço',

                    servico.data_horario,

                    servico.endereco
                    ||
                    servico.local
                ]
            );


            /* =========================================
               HISTÓRICO
               ========================================= */

            await client.query(
                `
                INSERT INTO historico_eventos (

                    servico_id,
                    empresa_email,
                    prestador_email,
                    tipo_evento,
                    descricao,
                    dados

                )
                VALUES (

                    $1,
                    $2,
                    $3,
                    'ENTROU_RESERVA',
                    $4,
                    $5::jsonb

                )
                `,
                [
                    servicoId,

                    normalizarEmailRS(
                        servico.empresa_email
                    ),

                    prestadorEmail,

                    `${prestadorNome || prestadorEmail} entrou como Reserva ${posicao}.`,

                    JSON.stringify({
                        papel:
                            'RESERVA',

                        posicao
                    })
                ]
            );


            await client.query(
                'COMMIT'
            );


            emitirAtualizacaoServicosRS();


            res.json({
                sucesso: true,

                mensagem:
                    `Você entrou como Reserva ${posicao}.`,

                papel:
                    'RESERVA',

                posicao
            });


        } catch (erro) {

            await client.query(
                'ROLLBACK'
            );


            console.error(
                'Erro ao entrar na reserva:',
                erro
            );


            res.status(500)
                .json({
                    sucesso: false,
                    erro:
                        'Erro interno ao entrar na fila de reserva.'
                });


        } finally {

            client.release();
        }
    }
);


/* =====================================================
   CONTINUA NA PARTE 3

   A PARTE 3 TERÁ:
   - confirmação de presença
   - câmera/foto registrada
   - GPS
   - check-in
   - intervalo
   - retorno do intervalo
   - check-out
   - desistência da vaga
   - promoção automática da Reserva 1 para Titular
   - reorganização da fila de reservas
   ===================================================== */
/* =====================================================
   SERVER.JS — PARTE 3
   RS CONNECT — PRESENÇA / JORNADA / SUBSTITUIÇÃO
   ===================================================== */


/* =====================================================
   CONFIRMAR PRESENÇA

   RECEBE:
   - selfie
   - selfie_confirmacao
   - gps
   - latitude
   - longitude
   - precisaoGps
   - prestadorEmail
   ===================================================== */

app.post(
    '/api/servicos/:id/confirmar-presenca',
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


            const servicoId =
                Number(
                    req.params.id
                );


            const prestadorEmail =
                normalizarEmailRS(
                    req.body.prestadorEmail
                    ||
                    req.body.prestador_email
                );


            const selfie =
                req.body.selfie
                ||
                req.body.selfie_confirmacao
                ||
                null;


            const gps =
                String(
                    req.body.gps
                    ||
                    ''
                )
                .trim();


            const latitude =
                req.body.latitude
                ??
                null;


            const longitude =
                req.body.longitude
                ??
                null;


            const precisaoGps =
                req.body.precisaoGps
                ??
                req.body.precisao_gps
                ??
                null;


            if (
                !servicoId
                ||
                !prestadorEmail
            ) {

                await client.query(
                    'ROLLBACK'
                );


                return res
                    .status(400)
                    .json({
                        sucesso: false,
                        erro:
                            'Serviço ou prestador inválido.'
                    });
            }


            if (!selfie) {

                await client.query(
                    'ROLLBACK'
                );


                return res
                    .status(400)
                    .json({
                        sucesso: false,
                        erro:
                            'A selfie de confirmação é obrigatória.'
                    });
            }


            const resultadoServico =
                await client.query(
                    `
                    SELECT *
                    FROM servicos
                    WHERE id = $1
                    FOR UPDATE
                    `,
                    [
                        servicoId
                    ]
                );


            if (
                resultadoServico.rows.length ===
                0
            ) {

                await client.query(
                    'ROLLBACK'
                );


                return res
                    .status(404)
                    .json({
                        sucesso: false,
                        erro:
                            'Serviço não encontrado.'
                    });
            }


            const servico =
                resultadoServico.rows[0];


            if (
                normalizarEmailRS(
                    servico.prestador_email
                )
                !==
                prestadorEmail
            ) {

                await client.query(
                    'ROLLBACK'
                );


                return res
                    .status(403)
                    .json({
                        sucesso: false,
                        erro:
                            'Somente o Titular atual pode confirmar presença.'
                    });
            }


            if (
                servico.presenca_confirmada
            ) {

                await client.query(
                    'ROLLBACK'
                );


                return res.json({
                    sucesso: true,
                    mensagem:
                        'Sua presença já foi confirmada anteriormente.'
                });
            }


            await client.query(
                `
                UPDATE servicos

                SET
                    selfie_confirmacao = $1,
                    presenca_confirmada = TRUE,
                    status_checkin = 'confirmado',
                    status = 'presenca_confirmada'

                WHERE id = $2
                `,
                [
                    selfie,
                    servicoId
                ]
            );


            await client.query(
                `
                UPDATE escalas_servico

                SET
                    status = 'CONFIRMADO',
                    atualizado_em = CURRENT_TIMESTAMP

                WHERE
                    servico_id = $1
                    AND
                    LOWER(prestador_email) = $2
                `,
                [
                    servicoId,
                    prestadorEmail
                ]
            );


            await client.query(
                `
                INSERT INTO registros_jornada (

                    servico_id,
                    empresa_email,
                    prestador_email,
                    tipo_registro,
                    hora_informada,
                    gps,
                    latitude,
                    longitude,
                    precisao_gps,
                    foto

                )
                VALUES (

                    $1,
                    $2,
                    $3,
                    'CONFIRMACAO_PRESENCA',
                    $4,
                    $5,
                    $6,
                    $7,
                    $8,
                    $9

                )
                `,
                [
                    servicoId,

                    normalizarEmailRS(
                        servico.empresa_email
                    ),

                    prestadorEmail,

                    new Date()
                        .toLocaleTimeString(
                            'pt-BR'
                        ),

                    gps,

                    latitude,

                    longitude,

                    precisaoGps,

                    selfie
                ]
            );


            await client.query(
                `
                INSERT INTO historico_eventos (

                    servico_id,
                    empresa_email,
                    prestador_email,
                    tipo_evento,
                    descricao,
                    dados

                )
                VALUES (

                    $1,
                    $2,
                    $3,
                    'PRESENCA_CONFIRMADA',
                    $4,
                    $5::jsonb

                )
                `,
                [
                    servicoId,

                    normalizarEmailRS(
                        servico.empresa_email
                    ),

                    prestadorEmail,

                    `${
                        servico.prestador_nome
                        ||
                        prestadorEmail
                    } confirmou presença.`,

                    JSON.stringify({
                        gps,
                        latitude,
                        longitude,
                        precisaoGps
                    })
                ]
            );


            await client.query(
                'COMMIT'
            );


            emitirAtualizacaoServicosRS();


            res.json({
                sucesso: true,
                mensagem:
                    'Presença confirmada com sucesso!'
            });


        } catch (erro) {

            await client.query(
                'ROLLBACK'
            );


            console.error(
                'Erro ao confirmar presença:',
                erro
            );


            res.status(500)
                .json({
                    sucesso: false,
                    erro:
                        'Erro interno ao confirmar presença.'
                });


        } finally {

            client.release();
        }
    }
);


/* =====================================================
   CHECK-IN
   ===================================================== */

app.post(
    '/api/servicos/:id/checkin',
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


            const servicoId =
                Number(
                    req.params.id
                );


            const prestadorEmail =
                normalizarEmailRS(
                    req.body.prestadorEmail
                    ||
                    req.body.prestador_email
                );


            const foto =
                req.body.foto
                ||
                req.body.fotoCheckin
                ||
                req.body.foto_checkin
                ||
                null;


            const gps =
                String(
                    req.body.gps
                    ||
                    ''
                )
                .trim();


            const latitude =
                req.body.latitude
                ??
                null;


            const longitude =
                req.body.longitude
                ??
                null;


            const precisaoGps =
                req.body.precisaoGps
                ??
                req.body.precisao_gps
                ??
                null;


            const hora =
                String(
                    req.body.hora
                    ||
                    new Date()
                        .toLocaleTimeString(
                            'pt-BR'
                        )
                );


            if (
                !servicoId
                ||
                !prestadorEmail
            ) {

                await client.query(
                    'ROLLBACK'
                );


                return res
                    .status(400)
                    .json({
                        sucesso: false,
                        erro:
                            'Serviço ou prestador inválido.'
                    });
            }


            if (!foto) {

                await client.query(
                    'ROLLBACK'
                );


                return res
                    .status(400)
                    .json({
                        sucesso: false,
                        erro:
                            'A foto de entrada é obrigatória.'
                    });
            }


            const resultadoServico =
                await client.query(
                    `
                    SELECT *
                    FROM servicos
                    WHERE id = $1
                    FOR UPDATE
                    `,
                    [
                        servicoId
                    ]
                );


            if (
                resultadoServico.rows.length ===
                0
            ) {

                await client.query(
                    'ROLLBACK'
                );


                return res
                    .status(404)
                    .json({
                        sucesso: false,
                        erro:
                            'Serviço não encontrado.'
                    });
            }


            const servico =
                resultadoServico.rows[0];


            if (
                normalizarEmailRS(
                    servico.prestador_email
                )
                !==
                prestadorEmail
            ) {

                await client.query(
                    'ROLLBACK'
                );


                return res
                    .status(403)
                    .json({
                        sucesso: false,
                        erro:
                            'Somente o Titular pode realizar o check-in.'
                    });
            }


            if (
                !servico.presenca_confirmada
            ) {

                await client.query(
                    'ROLLBACK'
                );


                return res
                    .status(400)
                    .json({
                        sucesso: false,
                        erro:
                            'Confirme sua presença antes de realizar o check-in.'
                    });
            }


            if (
                servico.checkin_hora
            ) {

                await client.query(
                    'ROLLBACK'
                );


                return res.json({
                    sucesso: true,
                    mensagem:
                        'O check-in já foi realizado.'
                });
            }


            await client.query(
                `
                UPDATE servicos

                SET
                    foto_ponto = $1,
                    foto_checkin = $1,
                    checkin_hora = $2,
                    checkin_gps = $3,
                    status_checkin = 'checkin_realizado',
                    status = 'em_andamento'

                WHERE id = $4
                `,
                [
                    foto,
                    hora,
                    gps,
                    servicoId
                ]
            );


            await client.query(
                `
                UPDATE escalas_servico

                SET
                    status = 'EM_SERVICO',
                    atualizado_em = CURRENT_TIMESTAMP

                WHERE
                    servico_id = $1
                    AND
                    LOWER(prestador_email) = $2
                `,
                [
                    servicoId,
                    prestadorEmail
                ]
            );


            await client.query(
                `
                INSERT INTO registros_jornada (

                    servico_id,
                    empresa_email,
                    prestador_email,
                    tipo_registro,
                    hora_informada,
                    gps,
                    latitude,
                    longitude,
                    precisao_gps,
                    foto

                )
                VALUES (

                    $1,
                    $2,
                    $3,
                    'CHECKIN',
                    $4,
                    $5,
                    $6,
                    $7,
                    $8,
                    $9

                )
                `,
                [
                    servicoId,

                    normalizarEmailRS(
                        servico.empresa_email
                    ),

                    prestadorEmail,

                    hora,

                    gps,

                    latitude,

                    longitude,

                    precisaoGps,

                    foto
                ]
            );


            await client.query(
                `
                INSERT INTO historico_eventos (

                    servico_id,
                    empresa_email,
                    prestador_email,
                    tipo_evento,
                    descricao,
                    dados

                )
                VALUES (

                    $1,
                    $2,
                    $3,
                    'CHECKIN_REALIZADO',
                    $4,
                    $5::jsonb

                )
                `,
                [
                    servicoId,

                    normalizarEmailRS(
                        servico.empresa_email
                    ),

                    prestadorEmail,

                    `${
                        servico.prestador_nome
                        ||
                        prestadorEmail
                    } realizou check-in.`,

                    JSON.stringify({
                        hora,
                        gps,
                        latitude,
                        longitude,
                        precisaoGps
                    })
                ]
            );


            await client.query(
                'COMMIT'
            );


            emitirAtualizacaoServicosRS();


            res.json({
                sucesso: true,
                mensagem:
                    'Check-in realizado com sucesso!',
                hora,
                gps
            });


        } catch (erro) {

            await client.query(
                'ROLLBACK'
            );


            console.error(
                'Erro no check-in:',
                erro
            );


            res.status(500)
                .json({
                    sucesso: false,
                    erro:
                        'Erro interno ao realizar check-in.'
                });


        } finally {

            client.release();
        }
    }
);


/* =====================================================
   INICIAR INTERVALO
   ===================================================== */

app.post(
    '/api/servicos/:id/intervalo/iniciar',
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


            const servicoId =
                Number(
                    req.params.id
                );


            const prestadorEmail =
                normalizarEmailRS(
                    req.body.prestadorEmail
                    ||
                    req.body.prestador_email
                );


            const hora =
                String(
                    req.body.hora
                    ||
                    new Date()
                        .toLocaleTimeString(
                            'pt-BR'
                        )
                );


            const resultadoServico =
                await client.query(
                    `
                    SELECT *
                    FROM servicos
                    WHERE id = $1
                    FOR UPDATE
                    `,
                    [
                        servicoId
                    ]
                );


            if (
                resultadoServico.rows.length ===
                0
            ) {

                await client.query(
                    'ROLLBACK'
                );


                return res
                    .status(404)
                    .json({
                        sucesso: false,
                        erro:
                            'Serviço não encontrado.'
                    });
            }


            const servico =
                resultadoServico.rows[0];


            if (
                normalizarEmailRS(
                    servico.prestador_email
                )
                !==
                prestadorEmail
            ) {

                await client.query(
                    'ROLLBACK'
                );


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

                await client.query(
                    'ROLLBACK'
                );


                return res
                    .status(400)
                    .json({
                        sucesso: false,
                        erro:
                            'Faça o check-in antes de iniciar o intervalo.'
                    });
            }


            if (
                servico.checkout_hora
            ) {

                await client.query(
                    'ROLLBACK'
                );


                return res
                    .status(409)
                    .json({
                        sucesso: false,
                        erro:
                            'Este serviço já foi finalizado.'
                    });
            }


            if (
                servico.intervalo_inicio
                &&
                !servico.intervalo_retorno
            ) {

                await client.query(
                    'ROLLBACK'
                );


                return res.json({
                    sucesso: true,
                    mensagem:
                        'O intervalo já está em andamento.'
                });
            }


            await client.query(
                `
                UPDATE servicos

                SET
                    intervalo_inicio = $1,
                    intervalo_retorno = NULL,
                    status = 'em_intervalo'

                WHERE id = $2
                `,
                [
                    hora,
                    servicoId
                ]
            );


            await client.query(
                `
                UPDATE escalas_servico

                SET
                    status = 'INTERVALO',
                    atualizado_em = CURRENT_TIMESTAMP

                WHERE
                    servico_id = $1
                    AND
                    LOWER(prestador_email) = $2
                `,
                [
                    servicoId,
                    prestadorEmail
                ]
            );


            await client.query(
                `
                INSERT INTO registros_jornada (

                    servico_id,
                    empresa_email,
                    prestador_email,
                    tipo_registro,
                    hora_informada

                )
                VALUES (

                    $1,
                    $2,
                    $3,
                    'INTERVALO_INICIO',
                    $4

                )
                `,
                [
                    servicoId,

                    normalizarEmailRS(
                        servico.empresa_email
                    ),

                    prestadorEmail,

                    hora
                ]
            );


            await client.query(
                `
                INSERT INTO historico_eventos (

                    servico_id,
                    empresa_email,
                    prestador_email,
                    tipo_evento,
                    descricao,
                    dados

                )
                VALUES (

                    $1,
                    $2,
                    $3,
                    'INTERVALO_INICIADO',
                    $4,
                    $5::jsonb

                )
                `,
                [
                    servicoId,

                    normalizarEmailRS(
                        servico.empresa_email
                    ),

                    prestadorEmail,

                    `${
                        servico.prestador_nome
                        ||
                        prestadorEmail
                    } iniciou o intervalo.`,

                    JSON.stringify({
                        hora
                    })
                ]
            );


            await client.query(
                'COMMIT'
            );


            emitirAtualizacaoServicosRS();


            res.json({
                sucesso: true,
                mensagem:
                    'Intervalo iniciado com sucesso.',
                hora
            });


        } catch (erro) {

            await client.query(
                'ROLLBACK'
            );


            console.error(
                'Erro ao iniciar intervalo:',
                erro
            );


            res.status(500)
                .json({
                    sucesso: false,
                    erro:
                        'Erro interno ao iniciar intervalo.'
                });


        } finally {

            client.release();
        }
    }
);


/* =====================================================
   RETORNAR DO INTERVALO
   ===================================================== */

app.post(
    '/api/servicos/:id/intervalo/retornar',
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


            const servicoId =
                Number(
                    req.params.id
                );


            const prestadorEmail =
                normalizarEmailRS(
                    req.body.prestadorEmail
                    ||
                    req.body.prestador_email
                );


            const hora =
                String(
                    req.body.hora
                    ||
                    new Date()
                        .toLocaleTimeString(
                            'pt-BR'
                        )
                );


            const resultadoServico =
                await client.query(
                    `
                    SELECT *
                    FROM servicos
                    WHERE id = $1
                    FOR UPDATE
                    `,
                    [
                        servicoId
                    ]
                );


            if (
                resultadoServico.rows.length ===
                0
            ) {

                await client.query(
                    'ROLLBACK'
                );


                return res
                    .status(404)
                    .json({
                        sucesso: false,
                        erro:
                            'Serviço não encontrado.'
                    });
            }


            const servico =
                resultadoServico.rows[0];


            if (
                normalizarEmailRS(
                    servico.prestador_email
                )
                !==
                prestadorEmail
            ) {

                await client.query(
                    'ROLLBACK'
                );


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

                await client.query(
                    'ROLLBACK'
                );


                return res
                    .status(400)
                    .json({
                        sucesso: false,
                        erro:
                            'Nenhum intervalo foi iniciado.'
                    });
            }


            if (
                servico.intervalo_retorno
            ) {

                await client.query(
                    'ROLLBACK'
                );


                return res.json({
                    sucesso: true,
                    mensagem:
                        'O retorno do intervalo já foi registrado.'
                });
            }


            await client.query(
                `
                UPDATE servicos

                SET
                    intervalo_retorno = $1,
                    status = 'em_andamento'

                WHERE id = $2
                `,
                [
                    hora,
                    servicoId
                ]
            );


            await client.query(
                `
                UPDATE escalas_servico

                SET
                    status = 'EM_SERVICO',
                    atualizado_em = CURRENT_TIMESTAMP

                WHERE
                    servico_id = $1
                    AND
                    LOWER(prestador_email) = $2
                `,
                [
                    servicoId,
                    prestadorEmail
                ]
            );


            await client.query(
                `
                INSERT INTO registros_jornada (

                    servico_id,
                    empresa_email,
                    prestador_email,
                    tipo_registro,
                    hora_informada

                )
                VALUES (

                    $1,
                    $2,
                    $3,
                    'INTERVALO_RETORNO',
                    $4

                )
                `,
                [
                    servicoId,

                    normalizarEmailRS(
                        servico.empresa_email
                    ),

                    prestadorEmail,

                    hora
                ]
            );


            await client.query(
                `
                INSERT INTO historico_eventos (

                    servico_id,
                    empresa_email,
                    prestador_email,
                    tipo_evento,
                    descricao,
                    dados

                )
                VALUES (

                    $1,
                    $2,
                    $3,
                    'INTERVALO_RETORNO',
                    $4,
                    $5::jsonb

                )
                `,
                [
                    servicoId,

                    normalizarEmailRS(
                        servico.empresa_email
                    ),

                    prestadorEmail,

                    `${
                        servico.prestador_nome
                        ||
                        prestadorEmail
                    } retornou do intervalo.`,

                    JSON.stringify({
                        hora
                    })
                ]
            );


            await client.query(
                'COMMIT'
            );


            emitirAtualizacaoServicosRS();


            res.json({
                sucesso: true,
                mensagem:
                    'Retorno do intervalo registrado com sucesso.',
                hora
            });


        } catch (erro) {

            await client.query(
                'ROLLBACK'
            );


            console.error(
                'Erro ao retornar do intervalo:',
                erro
            );


            res.status(500)
                .json({
                    sucesso: false,
                    erro:
                        'Erro interno ao retornar do intervalo.'
                });


        } finally {

            client.release();
        }
    }
);


/* =====================================================
   CHECK-OUT
   ===================================================== */

app.post(
    '/api/servicos/:id/checkout',
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


            const servicoId =
                Number(
                    req.params.id
                );


            const prestadorEmail =
                normalizarEmailRS(
                    req.body.prestadorEmail
                    ||
                    req.body.prestador_email
                );


            const foto =
                req.body.foto
                ||
                req.body.fotoCheckout
                ||
                req.body.foto_checkout
                ||
                null;


            const gps =
                String(
                    req.body.gps
                    ||
                    ''
                )
                .trim();


            const latitude =
                req.body.latitude
                ??
                null;


            const longitude =
                req.body.longitude
                ??
                null;


            const precisaoGps =
                req.body.precisaoGps
                ??
                req.body.precisao_gps
                ??
                null;


            const hora =
                String(
                    req.body.hora
                    ||
                    new Date()
                        .toLocaleTimeString(
                            'pt-BR'
                        )
                );


            if (!foto) {

                await client.query(
                    'ROLLBACK'
                );


                return res
                    .status(400)
                    .json({
                        sucesso: false,
                        erro:
                            'A foto de saída é obrigatória.'
                    });
            }


            const resultadoServico =
                await client.query(
                    `
                    SELECT *
                    FROM servicos
                    WHERE id = $1
                    FOR UPDATE
                    `,
                    [
                        servicoId
                    ]
                );


            if (
                resultadoServico.rows.length ===
                0
            ) {

                await client.query(
                    'ROLLBACK'
                );


                return res
                    .status(404)
                    .json({
                        sucesso: false,
                        erro:
                            'Serviço não encontrado.'
                    });
            }


            const servico =
                resultadoServico.rows[0];


            if (
                normalizarEmailRS(
                    servico.prestador_email
                )
                !==
                prestadorEmail
            ) {

                await client.query(
                    'ROLLBACK'
                );


                return res
                    .status(403)
                    .json({
                        sucesso: false,
                        erro:
                            'Somente o Titular pode realizar o check-out.'
                    });
            }


            if (
                !servico.checkin_hora
            ) {

                await client.query(
                    'ROLLBACK'
                );


                return res
                    .status(400)
                    .json({
                        sucesso: false,
                        erro:
                            'Faça o check-in antes de realizar o check-out.'
                    });
            }


            if (
                servico.checkout_hora
            ) {

                await client.query(
                    'ROLLBACK'
                );


                return res.json({
                    sucesso: true,
                    mensagem:
                        'O check-out já foi realizado.'
                });
            }


            await client.query(
                `
                UPDATE servicos

                SET
                    foto_checkout = $1,
                    checkout_hora = $2,
                    checkout_gps = $3,
                    status_checkin = 'checkout_realizado',
                    status = 'aguardando_validacao'

                WHERE id = $4
                `,
                [
                    foto,
                    hora,
                    gps,
                    servicoId
                ]
            );


            await client.query(
                `
                UPDATE escalas_servico

                SET
                    status = 'AGUARDANDO_VALIDACAO',
                    atualizado_em = CURRENT_TIMESTAMP

                WHERE
                    servico_id = $1
                    AND
                    LOWER(prestador_email) = $2
                `,
                [
                    servicoId,
                    prestadorEmail
                ]
            );


            await client.query(
                `
                INSERT INTO registros_jornada (

                    servico_id,
                    empresa_email,
                    prestador_email,
                    tipo_registro,
                    hora_informada,
                    gps,
                    latitude,
                    longitude,
                    precisao_gps,
                    foto

                )
                VALUES (

                    $1,
                    $2,
                    $3,
                    'CHECKOUT',
                    $4,
                    $5,
                    $6,
                    $7,
                    $8,
                    $9

                )
                `,
                [
                    servicoId,

                    normalizarEmailRS(
                        servico.empresa_email
                    ),

                    prestadorEmail,

                    hora,

                    gps,

                    latitude,

                    longitude,

                    precisaoGps,

                    foto
                ]
            );


            await client.query(
                `
                INSERT INTO historico_eventos (

                    servico_id,
                    empresa_email,
                    prestador_email,
                    tipo_evento,
                    descricao,
                    dados

                )
                VALUES (

                    $1,
                    $2,
                    $3,
                    'CHECKOUT_REALIZADO',
                    $4,
                    $5::jsonb

                )
                `,
                [
                    servicoId,

                    normalizarEmailRS(
                        servico.empresa_email
                    ),

                    prestadorEmail,

                    `${
                        servico.prestador_nome
                        ||
                        prestadorEmail
                    } realizou o check-out.`,

                    JSON.stringify({
                        hora,
                        gps,
                        latitude,
                        longitude,
                        precisaoGps
                    })
                ]
            );


            await client.query(
                'COMMIT'
            );


            emitirAtualizacaoServicosRS();


            res.json({
                sucesso: true,
                mensagem:
                    'Check-out realizado com sucesso. Aguardando validação da empresa.'
            });


        } catch (erro) {

            await client.query(
                'ROLLBACK'
            );


            console.error(
                'Erro no check-out:',
                erro
            );


            res.status(500)
                .json({
                    sucesso: false,
                    erro:
                        'Erro interno ao realizar check-out.'
                });


        } finally {

            client.release();
        }
    }
);


/* =====================================================
   REORGANIZAR RESERVAS
   ===================================================== */

function reorganizarReservasRS(
    reservas
) {

    return normalizarReservasRS(
        reservas
    )
    .map(
        (
            reserva,
            indice
        ) => ({

            ...reserva,

            posicao:
                indice + 1
        })
    );
}


/* =====================================================
   SAIR DA VAGA OU RESERVA

   REGRA:

   Reserva sai
   → apenas remove da fila

   Titular sai
   → promove Reserva 1

   Titular sai e não há reserva
   → vaga volta a ficar disponível
   ===================================================== */

app.post(
    '/api/servicos/:id/sair-vaga',
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


            const servicoId =
                Number(
                    req.params.id
                );


            const prestadorEmail =
                normalizarEmailRS(
                    req.body.prestadorEmail
                    ||
                    req.body.prestador_email
                );


            const resultadoServico =
                await client.query(
                    `
                    SELECT *
                    FROM servicos
                    WHERE id = $1
                    FOR UPDATE
                    `,
                    [
                        servicoId
                    ]
                );


            if (
                resultadoServico.rows.length ===
                0
            ) {

                await client.query(
                    'ROLLBACK'
                );


                return res
                    .status(404)
                    .json({
                        sucesso: false,
                        erro:
                            'Serviço não encontrado.'
                    });
            }


            const servico =
                resultadoServico.rows[0];


            if (
                servico.checkout_hora
                ||
                servico.pagamento_autorizado
            ) {

                await client.query(
                    'ROLLBACK'
                );


                return res
                    .status(409)
                    .json({
                        sucesso: false,
                        erro:
                            'Não é possível sair porque este serviço já foi finalizado ou entrou em pagamento.'
                    });
            }


            let reservas =
                normalizarReservasRS(
                    servico.reservas
                );


            const indiceReserva =
                reservas.findIndex(
                    reserva =>
                        normalizarEmailRS(
                            reserva.email
                        )
                        ===
                        prestadorEmail
                );


            /* =========================================
               PRESTADOR É RESERVA
               ========================================= */

            if (
                indiceReserva !==
                -1
            ) {

                const removido =
                    reservas[
                        indiceReserva
                    ];


                reservas.splice(
                    indiceReserva,
                    1
                );


                reservas =
                    reorganizarReservasRS(
                        reservas
                    );


                await client.query(
                    `
                    UPDATE servicos
                    SET reservas = $1::jsonb
                    WHERE id = $2
                    `,
                    [
                        JSON.stringify(
                            reservas
                        ),
                        servicoId
                    ]
                );


                await client.query(
                    `
                    UPDATE servico_vinculos

                    SET
                        status = 'SAIU',
                        saiu_em = CURRENT_TIMESTAMP,
                        motivo_saida = 'DESISTENCIA_RESERVA'

                    WHERE
                        servico_id = $1
                        AND
                        LOWER(prestador_email) = $2
                        AND
                        papel = 'RESERVA'
                    `,
                    [
                        servicoId,
                        prestadorEmail
                    ]
                );


                await client.query(
                    `
                    UPDATE escalas_servico

                    SET
                        status = 'SAIU_DA_RESERVA',
                        atualizado_em = CURRENT_TIMESTAMP

                    WHERE
                        servico_id = $1
                        AND
                        LOWER(prestador_email) = $2
                    `,
                    [
                        servicoId,
                        prestadorEmail
                    ]
                );


                await client.query(
                    `
                    INSERT INTO historico_eventos (

                        servico_id,
                        empresa_email,
                        prestador_email,
                        tipo_evento,
                        descricao,
                        dados

                    )
                    VALUES (

                        $1,
                        $2,
                        $3,
                        'RESERVA_DESISTIU',
                        $4,
                        '{}'::jsonb

                    )
                    `,
                    [
                        servicoId,

                        normalizarEmailRS(
                            servico.empresa_email
                        ),

                        prestadorEmail,

                        `${
                            removido.nome
                            ||
                            removido.email
                        } saiu da fila de reserva.`
                    ]
                );


                await client.query(
                    'COMMIT'
                );


                emitirAtualizacaoServicosRS();


                return res.json({
                    sucesso: true,
                    tipo:
                        'reserva',
                    mensagem:
                        'Você saiu da fila de reserva.'
                });
            }


            /* =========================================
               PRESTADOR É TITULAR
               ========================================= */

            if (
                normalizarEmailRS(
                    servico.prestador_email
                )
                ===
                prestadorEmail
            ) {

                const titularAnteriorNome =
                    servico.prestador_nome
                    ||
                    prestadorEmail;


                /* =====================================
                   EXISTE RESERVA
                   ===================================== */

                if (
                    reservas.length >
                    0
                ) {

                    const novoTitular =
                        reservas.shift();


                    reservas =
                        reorganizarReservasRS(
                            reservas
                        );


                    await client.query(
                        `
                        UPDATE servicos

                        SET
                            prestador_email = $1,
                            prestador_nome = $2,
                            prestador_whatsapp = $3,
                            prestador_pix = $4,
                            reservas = $5::jsonb,

                            presenca_confirmada = FALSE,
                            selfie_confirmacao = NULL,

                            status_checkin = 'pendente',
                            checkin_hora = NULL,
                            checkout_hora = NULL,
                            foto_ponto = NULL,
                            foto_checkin = NULL,
                            foto_checkout = NULL,
                            checkin_gps = NULL,
                            checkout_gps = NULL,
                            intervalo_inicio = NULL,
                            intervalo_retorno = NULL,

                            validado_empresa = FALSE,
                            validado_em = NULL,

                            status = 'aguardando_confirmacao'

                        WHERE id = $6
                        `,
                        [
                            normalizarEmailRS(
                                novoTitular.email
                            ),

                            String(
                                novoTitular.nome
                                ||
                                ''
                            ),

                            String(
                                novoTitular.whatsapp
                                ||
                                ''
                            ),

                            String(
                                novoTitular.pix
                                ||
                                ''
                            ),

                            JSON.stringify(
                                reservas
                            ),

                            servicoId
                        ]
                    );


                    await client.query(
                        `
                        UPDATE servico_vinculos

                        SET
                            status = 'SUBSTITUIDO',
                            saiu_em = CURRENT_TIMESTAMP,
                            motivo_saida = 'DESISTENCIA_TITULAR'

                        WHERE
                            servico_id = $1
                            AND
                            LOWER(prestador_email) = $2
                            AND
                            papel = 'TITULAR'
                        `,
                        [
                            servicoId,
                            prestadorEmail
                        ]
                    );


                    await client.query(
                        `
                        UPDATE servico_vinculos

                        SET
                            status = 'PROMOVIDO'
                        WHERE
                            servico_id = $1
                            AND
                            LOWER(prestador_email) = $2
                            AND
                            papel = 'RESERVA'
                        `,
                        [
                            servicoId,
                            normalizarEmailRS(
                                novoTitular.email
                            )
                        ]
                    );


                    await client.query(
                        `
                        INSERT INTO servico_vinculos (

                            servico_id,
                            empresa_email,
                            prestador_email,
                            papel,
                            posicao,
                            status

                        )
                        VALUES (

                            $1,
                            $2,
                            $3,
                            'TITULAR',
                            0,
                            'ATIVO'

                        )

                        ON CONFLICT (
                            servico_id,
                            prestador_email,
                            papel
                        )
                        DO UPDATE SET

                            status =
                                'ATIVO',

                            saiu_em =
                                NULL,

                            motivo_saida =
                                NULL
                        `,
                        [
                            servicoId,

                            normalizarEmailRS(
                                servico.empresa_email
                            ),

                            normalizarEmailRS(
                                novoTitular.email
                            )
                        ]
                    );


                    await client.query(
                        `
                        UPDATE escalas_servico

                        SET
                            status = 'SUBSTITUIDO',
                            atualizado_em = CURRENT_TIMESTAMP

                        WHERE
                            servico_id = $1
                            AND
                            LOWER(prestador_email) = $2
                        `,
                        [
                            servicoId,
                            prestadorEmail
                        ]
                    );


                    await client.query(
                        `
                        INSERT INTO escalas_servico (

                            servico_id,
                            empresa_email,
                            prestador_email,
                            funcao,
                            data_horario,
                            local,
                            status

                        )
                        VALUES (

                            $1,
                            $2,
                            $3,
                            $4,
                            $5,
                            $6,
                            'AGUARDANDO_CONFIRMACAO'

                        )

                        ON CONFLICT (
                            servico_id,
                            prestador_email
                        )
                        DO UPDATE SET

                            status =
                                'AGUARDANDO_CONFIRMACAO',

                            atualizado_em =
                                CURRENT_TIMESTAMP
                        `,
                        [
                            servicoId,

                            normalizarEmailRS(
                                servico.empresa_email
                            ),

                            normalizarEmailRS(
                                novoTitular.email
                            ),

                            servico.categoria
                            ||
                            servico.titulo
                            ||
                            'Prestador de Serviço',

                            servico.data_horario,

                            servico.endereco
                            ||
                            servico.local
                        ]
                    );


                    await client.query(
                        `
                        INSERT INTO historico_eventos (

                            servico_id,
                            empresa_email,
                            prestador_email,
                            tipo_evento,
                            descricao,
                            dados

                        )
                        VALUES

                        (
                            $1,
                            $2,
                            $3,
                            'TITULAR_DESISTIU',
                            $4,
                            '{}'::jsonb
                        ),

                        (
                            $1,
                            $2,
                            $5,
                            'RESERVA_PROMOVIDA',
                            $6,
                            $7::jsonb
                        )
                        `,
                        [
                            servicoId,

                            normalizarEmailRS(
                                servico.empresa_email
                            ),

                            prestadorEmail,

                            `${titularAnteriorNome} desistiu da vaga.`,

                            normalizarEmailRS(
                                novoTitular.email
                            ),

                            `${
                                novoTitular.nome
                                ||
                                novoTitular.email
                            } foi promovido para Titular.`,

                            JSON.stringify({
                                motivo:
                                    'DESISTENCIA_TITULAR'
                            })
                        ]
                    );


                    await client.query(
                        'COMMIT'
                    );


                    emitirAtualizacaoServicosRS();


                    return res.json({
                        sucesso: true,

                        promovido:
                            true,

                        novoTitular,

                        mensagem:
                            `${
                                novoTitular.nome
                                ||
                                novoTitular.email
                            } foi promovido automaticamente para Titular.`
                    });
                }


                /* =====================================
                   NÃO EXISTE RESERVA
                   VAGA VOLTA PARA O RADAR
                   ===================================== */

                await client.query(
                    `
                    UPDATE servicos

                    SET
                        prestador_email = NULL,
                        prestador_id = NULL,
                        prestador_nome = NULL,
                        prestador_pix = NULL,
                        prestador_whatsapp = NULL,

                        presenca_confirmada = FALSE,
                        selfie_confirmacao = NULL,

                        status_checkin = 'pendente',

                        checkin_hora = NULL,
                        checkout_hora = NULL,

                        foto_ponto = NULL,
                        foto_checkin = NULL,
                        foto_checkout = NULL,

                        checkin_gps = NULL,
                        checkout_gps = NULL,

                        intervalo_inicio = NULL,
                        intervalo_retorno = NULL,

                        validado_empresa = FALSE,
                        validado_em = NULL,

                        status = 'ativo'

                    WHERE id = $1
                    `,
                    [
                        servicoId
                    ]
                );


                await client.query(
                    `
                    UPDATE servico_vinculos

                    SET
                        status = 'SAIU',
                        saiu_em = CURRENT_TIMESTAMP,
                        motivo_saida = 'DESISTENCIA_TITULAR_SEM_RESERVA'

                    WHERE
                        servico_id = $1
                        AND
                        LOWER(prestador_email) = $2
                        AND
                        papel = 'TITULAR'
                    `,
                    [
                        servicoId,
                        prestadorEmail
                    ]
                );


                await client.query(
                    `
                    UPDATE escalas_servico

                    SET
                        status = 'DESISTIU',
                        atualizado_em = CURRENT_TIMESTAMP

                    WHERE
                        servico_id = $1
                        AND
                        LOWER(prestador_email) = $2
                    `,
                    [
                        servicoId,
                        prestadorEmail
                    ]
                );


                await client.query(
                    `
                    INSERT INTO historico_eventos (

                        servico_id,
                        empresa_email,
                        prestador_email,
                        tipo_evento,
                        descricao,
                        dados

                    )
                    VALUES (

                        $1,
                        $2,
                        $3,
                        'TITULAR_DESISTIU',
                        $4,
                        $5::jsonb

                    )
                    `,
                    [
                        servicoId,

                        normalizarEmailRS(
                            servico.empresa_email
                        ),

                        prestadorEmail,

                        `${titularAnteriorNome} desistiu. A vaga voltou ao Radar.`,

                        JSON.stringify({
                            reservaDisponivel:
                                false
                        })
                    ]
                );


                await client.query(
                    'COMMIT'
                );


                emitirAtualizacaoServicosRS();


                return res.json({
                    sucesso: true,

                    promovido:
                        false,

                    mensagem:
                        'Você saiu da vaga. Como não havia reserva, a vaga voltou a ficar disponível.'
                });
            }


            await client.query(
                'ROLLBACK'
            );


            return res
                .status(403)
                .json({
                    sucesso: false,
                    erro:
                        'Você não está vinculado a esta vaga.'
                });


        } catch (erro) {

            await client.query(
                'ROLLBACK'
            );


            console.error(
                'Erro ao sair da vaga:',
                erro
            );


            res.status(500)
                .json({
                    sucesso: false,
                    erro:
                        'Erro interno ao sair da vaga.'
                });


        } finally {

            client.release();
        }
    }
);


/* =====================================================
   SUBSTITUIÇÃO AUTOMÁTICA

   UTILIZADA QUANDO:
   - prazo de confirmação terminou
   - Titular NÃO confirmou
   - existe Reserva
   ===================================================== */

app.post(
    '/api/substituir-prestador',
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


            const titularAtualEmail =
                normalizarEmailRS(
                    req.body.titularAtualId
                    ||
                    req.body.titularEmail
                    ||
                    req.body.prestadorEmail
                );


            if (!titularAtualEmail) {

                await client.query(
                    'ROLLBACK'
                );


                return res
                    .status(400)
                    .json({
                        sucesso: false,
                        erro:
                            'Titular atual não informado.'
                    });
            }


            const resultadoServico =
                await client.query(
                    `
                    SELECT *
                    FROM servicos

                    WHERE
                        LOWER(prestador_email) = $1

                    ORDER BY id DESC

                    LIMIT 1

                    FOR UPDATE
                    `,
                    [
                        titularAtualEmail
                    ]
                );


            if (
                resultadoServico.rows.length ===
                0
            ) {

                await client.query(
                    'ROLLBACK'
                );


                return res
                    .status(404)
                    .json({
                        sucesso: false,
                        erro:
                            'Serviço ativo do Titular não encontrado.'
                    });
            }


            const servico =
                resultadoServico.rows[0];


            if (
                servico.presenca_confirmada
            ) {

                await client.query(
                    'ROLLBACK'
                );


                return res
                    .status(409)
                    .json({
                        sucesso: false,
                        erro:
                            'O Titular já confirmou presença e não pode ser substituído automaticamente.'
                    });
            }


            let reservas =
                normalizarReservasRS(
                    servico.reservas
                );


            if (
                reservas.length ===
                0
            ) {

                await client.query(
                    'ROLLBACK'
                );


                return res
                    .status(409)
                    .json({
                        sucesso: false,
                        erro:
                            'Não existe reserva disponível para promoção.'
                    });
            }


            const antigoTitular = {

                email:
                    servico.prestador_email,

                nome:
                    servico.prestador_nome
            };


            const novoTitular =
                reservas.shift();


            reservas =
                reorganizarReservasRS(
                    reservas
                );


            await client.query(
                `
                UPDATE servicos

                SET
                    prestador_email = $1,
                    prestador_nome = $2,
                    prestador_whatsapp = $3,
                    prestador_pix = $4,

                    reservas = $5::jsonb,

                    presenca_confirmada = FALSE,
                    selfie_confirmacao = NULL,

                    status_checkin = 'pendente',

                    checkin_hora = NULL,
                    checkout_hora = NULL,

                    foto_ponto = NULL,
                    foto_checkin = NULL,
                    foto_checkout = NULL,

                    checkin_gps = NULL,
                    checkout_gps = NULL,

                    intervalo_inicio = NULL,
                    intervalo_retorno = NULL,

                    validado_empresa = FALSE,
                    validado_em = NULL,

                    status = 'aguardando_confirmacao'

                WHERE id = $6
                `,
                [
                    normalizarEmailRS(
                        novoTitular.email
                    ),

                    String(
                        novoTitular.nome
                        ||
                        ''
                    ),

                    String(
                        novoTitular.whatsapp
                        ||
                        ''
                    ),

                    String(
                        novoTitular.pix
                        ||
                        ''
                    ),

                    JSON.stringify(
                        reservas
                    ),

                    servico.id
                ]
            );


            await client.query(
                `
                UPDATE servico_vinculos

                SET
                    status = 'CANCELADO_NAO_CONFIRMOU',
                    saiu_em = CURRENT_TIMESTAMP,
                    motivo_saida = 'NAO_CONFIRMOU_NO_PRAZO'

                WHERE
                    servico_id = $1
                    AND
                    LOWER(prestador_email) = $2
                    AND
                    papel = 'TITULAR'
                `,
                [
                    servico.id,
                    titularAtualEmail
                ]
            );


            await client.query(
                `
                UPDATE servico_vinculos

                SET
                    status = 'PROMOVIDO',
                    saiu_em = CURRENT_TIMESTAMP,
                    motivo_saida = 'PROMOVIDO_PARA_TITULAR'

                WHERE
                    servico_id = $1
                    AND
                    LOWER(prestador_email) = $2
                    AND
                    papel = 'RESERVA'
                `,
                [
                    servico.id,

                    normalizarEmailRS(
                        novoTitular.email
                    )
                ]
            );


            await client.query(
                `
                INSERT INTO servico_vinculos (

                    servico_id,
                    empresa_email,
                    prestador_email,
                    papel,
                    posicao,
                    status

                )
                VALUES (

                    $1,
                    $2,
                    $3,
                    'TITULAR',
                    0,
                    'ATIVO'

                )

                ON CONFLICT (
                    servico_id,
                    prestador_email,
                    papel
                )
                DO UPDATE SET

                    status =
                        'ATIVO',

                    saiu_em =
                        NULL,

                    motivo_saida =
                        NULL
                `,
                [
                    servico.id,

                    normalizarEmailRS(
                        servico.empresa_email
                    ),

                    normalizarEmailRS(
                        novoTitular.email
                    )
                ]
            );


            await client.query(
                `
                UPDATE escalas_servico

                SET
                    status = 'CANCELADO_NAO_CONFIRMOU',
                    atualizado_em = CURRENT_TIMESTAMP

                WHERE
                    servico_id = $1
                    AND
                    LOWER(prestador_email) = $2
                `,
                [
                    servico.id,
                    titularAtualEmail
                ]
            );


            await client.query(
                `
                INSERT INTO escalas_servico (

                    servico_id,
                    empresa_email,
                    prestador_email,
                    funcao,
                    data_horario,
                    local,
                    status

                )
                VALUES (

                    $1,
                    $2,
                    $3,
                    $4,
                    $5,
                    $6,
                    'AGUARDANDO_CONFIRMACAO'

                )

                ON CONFLICT (
                    servico_id,
                    prestador_email
                )
                DO UPDATE SET

                    status =
                        'AGUARDANDO_CONFIRMACAO',

                    atualizado_em =
                        CURRENT_TIMESTAMP
                `,
                [
                    servico.id,

                    normalizarEmailRS(
                        servico.empresa_email
                    ),

                    normalizarEmailRS(
                        novoTitular.email
                    ),

                    servico.categoria
                    ||
                    servico.titulo
                    ||
                    'Prestador de Serviço',

                    servico.data_horario,

                    servico.endereco
                    ||
                    servico.local
                ]
            );


            await client.query(
                `
                INSERT INTO historico_eventos (

                    servico_id,
                    empresa_email,
                    prestador_email,
                    tipo_evento,
                    descricao,
                    dados

                )
                VALUES

                (
                    $1,
                    $2,
                    $3,
                    'TITULAR_NAO_CONFIRMOU',
                    $4,
                    $5::jsonb
                ),

                (
                    $1,
                    $2,
                    $6,
                    'RESERVA_PROMOVIDA_AUTOMATICAMENTE',
                    $7,
                    $8::jsonb
                )
                `,
                [
                    servico.id,

                    normalizarEmailRS(
                        servico.empresa_email
                    ),

                    titularAtualEmail,

                    `${
                        antigoTitular.nome
                        ||
                        antigoTitular.email
                    } não confirmou presença no prazo.`,

                    JSON.stringify({
                        motivo:
                            'NAO_CONFIRMOU_NO_PRAZO'
                    }),

                    normalizarEmailRS(
                        novoTitular.email
                    ),

                    `${
                        novoTitular.nome
                        ||
                        novoTitular.email
                    } foi promovido automaticamente para Titular.`,

                    JSON.stringify({
                        motivo:
                            'SUBSTITUICAO_AUTOMATICA'
                    })
                ]
            );


            await client.query(
                'COMMIT'
            );


            emitirAtualizacaoServicosRS();


            res.json({
                sucesso: true,

                mensagem:
                    `${
                        novoTitular.nome
                        ||
                        novoTitular.email
                    } foi promovido para Titular.`,

                novoTitular,

                reservasRestantes:
                    reservas
            });


        } catch (erro) {

            await client.query(
                'ROLLBACK'
            );


            console.error(
                'Erro na substituição automática:',
                erro
            );


            res.status(500)
                .json({
                    sucesso: false,
                    erro:
                        'Erro interno na substituição automática.'
                });


        } finally {

            client.release();
        }
    }
);


/* =====================================================
   CONTINUA NA PARTE 4

   PARTE FINAL:
   - validação da empresa
   - pagamento
   - comprovantes
   - contratos
   - documentos
   - painel exclusivo da empresa
   - arquivo digital
   - histórico de trabalhador
   - visão do trabalhador sobre empresas
   - excluir serviço
   - rota /
   - 404
   - inicialização do servidor
   ===================================================== */
/* =====================================================
   SERVER.JS — PARTE 4
   RS CONNECT — PAINEL DA EMPRESA / ARQUIVO DIGITAL
   ===================================================== */


/* =====================================================
   COLUNAS FINAIS DA GESTÃO

   ADICIONA SOMENTE O QUE NÃO EXISTIR.
   NÃO APAGA DADOS.
   ===================================================== */

async function garantirColunasGestaoFinalRS() {

    try {

        await pool.query(`

            ALTER TABLE servicos
            ADD COLUMN IF NOT EXISTS
            pagamento_autorizado BOOLEAN
            DEFAULT FALSE;


            ALTER TABLE servicos
            ADD COLUMN IF NOT EXISTS
            pagamento_autorizado_em TIMESTAMP;


            ALTER TABLE servicos
            ADD COLUMN IF NOT EXISTS
            comprovante_pagamento_text TEXT;


            ALTER TABLE servicos
            ADD COLUMN IF NOT EXISTS
            contrato_assinado_text TEXT;


            ALTER TABLE servicos
            ADD COLUMN IF NOT EXISTS
            contrato_assinado_em TIMESTAMP;


            ALTER TABLE servicos
            ADD COLUMN IF NOT EXISTS
            responsavel_servico TEXT;

        `);


        console.log(
            'Colunas finais da Gestão RS Connect verificadas.'
        );


    } catch (erro) {

        console.error(
            'Erro ao verificar colunas finais:',
            erro
        );
    }
}


/* =====================================================
   VALIDAR SERVIÇO PELA EMPRESA

   FLUXO:
   CHECK-OUT
   → EMPRESA VALIDA
   → PAGAMENTO PODE SER AUTORIZADO
   ===================================================== */

app.post(
    '/api/servicos/:id/validar',
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


            const servicoId =
                Number(
                    req.params.id
                );


            const empresaEmail =
                normalizarEmailRS(
                    req.body.empresaEmail
                    ||
                    req.body.usuarioEmail
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
                        servicoId
                    ]
                );


            if (
                resultado.rows.length ===
                0
            ) {

                await client.query(
                    'ROLLBACK'
                );


                return res
                    .status(404)
                    .json({
                        sucesso: false,
                        erro:
                            'Serviço não encontrado.'
                    });
            }


            const servico =
                resultado.rows[0];


            if (
                normalizarEmailRS(
                    servico.empresa_email
                )
                !==
                empresaEmail
            ) {

                await client.query(
                    'ROLLBACK'
                );


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

                await client.query(
                    'ROLLBACK'
                );


                return res
                    .status(400)
                    .json({
                        sucesso: false,
                        erro:
                            'O trabalhador ainda não realizou o check-out.'
                    });
            }


            if (
                servico.validado_empresa
            ) {

                await client.query(
                    'ROLLBACK'
                );


                return res.json({
                    sucesso: true,
                    mensagem:
                        'Este serviço já foi validado anteriormente.'
                });
            }


            await client.query(
                `
                UPDATE servicos

                SET
                    validado_empresa = TRUE,
                    validado_em = CURRENT_TIMESTAMP,
                    status = 'validado'

                WHERE id = $1
                `,
                [
                    servicoId
                ]
            );


            await client.query(
                `
                UPDATE escalas_servico

                SET
                    status = 'VALIDADO',
                    atualizado_em = CURRENT_TIMESTAMP

                WHERE
                    servico_id = $1
                    AND
                    LOWER(prestador_email) = $2
                `,
                [
                    servicoId,

                    normalizarEmailRS(
                        servico.prestador_email
                    )
                ]
            );


            await client.query(
                `
                INSERT INTO historico_eventos (

                    servico_id,
                    empresa_email,
                    prestador_email,
                    tipo_evento,
                    descricao,
                    dados

                )
                VALUES (

                    $1,
                    $2,
                    $3,
                    'SERVICO_VALIDADO_EMPRESA',
                    $4,
                    $5::jsonb

                )
                `,
                [
                    servicoId,

                    empresaEmail,

                    normalizarEmailRS(
                        servico.prestador_email
                    ),

                    `A empresa validou a conclusão do serviço "${servico.titulo}".`,

                    JSON.stringify({
                        validadoEm:
                            new Date()
                                .toISOString()
                    })
                ]
            );


            await client.query(
                `
                INSERT INTO auditoria_empresa (

                    empresa_email,
                    usuario_email,
                    servico_id,
                    acao,
                    detalhes

                )
                VALUES (

                    $1,
                    $1,
                    $2,
                    'VALIDOU_SERVICO',
                    $3::jsonb

                )
                `,
                [
                    empresaEmail,

                    servicoId,

                    JSON.stringify({
                        titulo:
                            servico.titulo
                    })
                ]
            );


            await client.query(
                'COMMIT'
            );


            emitirAtualizacaoServicosRS();


            res.json({
                sucesso: true,
                mensagem:
                    'Serviço validado com sucesso.'
            });


        } catch (erro) {

            await client.query(
                'ROLLBACK'
            );


            console.error(
                'Erro ao validar serviço:',
                erro
            );


            res.status(500)
                .json({
                    sucesso: false,
                    erro:
                        'Erro interno ao validar serviço.'
                });


        } finally {

            client.release();
        }
    }
);


/* =====================================================
   AUTORIZAR PAGAMENTO
   ===================================================== */

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


            const servicoId =
                Number(
                    req.params.id
                );


            const empresaEmail =
                normalizarEmailRS(
                    req.body.empresaEmail
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
                        servicoId
                    ]
                );


            if (
                resultado.rows.length ===
                0
            ) {

                await client.query(
                    'ROLLBACK'
                );


                return res
                    .status(404)
                    .json({
                        sucesso: false,
                        erro:
                            'Serviço não encontrado.'
                    });
            }


            const servico =
                resultado.rows[0];


            if (
                normalizarEmailRS(
                    servico.empresa_email
                )
                !==
                empresaEmail
            ) {

                await client.query(
                    'ROLLBACK'
                );


                return res
                    .status(403)
                    .json({
                        sucesso: false,
                        erro:
                            'Somente a empresa responsável pode autorizar o pagamento.'
                    });
            }


            if (
                !servico.validado_empresa
            ) {

                await client.query(
                    'ROLLBACK'
                );


                return res
                    .status(400)
                    .json({
                        sucesso: false,
                        erro:
                            'Valide o serviço antes de autorizar o pagamento.'
                    });
            }


            if (
                servico.pagamento_autorizado
            ) {

                await client.query(
                    'ROLLBACK'
                );


                return res.json({
                    sucesso: true,
                    mensagem:
                        'O pagamento deste serviço já foi autorizado.'
                });
            }


            const valor =
                numeroRSBackend(
                    servico.valor_liquido
                    ||
                    servico.valor_total
                    ||
                    servico.valor
                    ||
                    0
                );


            const prestadorEmail =
                normalizarEmailRS(
                    servico.prestador_email
                );


            await client.query(
                `
                UPDATE servicos

                SET
                    pagamento_autorizado = TRUE,
                    pagamento_autorizado_em = CURRENT_TIMESTAMP,
                    status = 'pagamento_autorizado'

                WHERE id = $1
                `,
                [
                    servicoId
                ]
            );


            await client.query(
                `
                INSERT INTO pagamentos_historico (

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

                ON CONFLICT (
                    servico_id,
                    prestador_email
                )
                DO UPDATE SET

                    valor =
                        EXCLUDED.valor,

                    forma_pagamento =
                        EXCLUDED.forma_pagamento,

                    status =
                        'AUTORIZADO',

                    autorizado_em =
                        CURRENT_TIMESTAMP,

                    atualizado_em =
                        CURRENT_TIMESTAMP
                `,
                [
                    servicoId,

                    empresaEmail,

                    prestadorEmail,

                    valor,

                    servico.forma_pgto
                    ||
                    'Pix'
                ]
            );


            await client.query(
                `
                INSERT INTO ledger_transacoes (

                    servico_id,
                    usuario_email,
                    tipo,
                    tipo_movimento,
                    valor,
                    status

                )
                VALUES (

                    $1,
                    $2,
                    'SERVICO',
                    'CREDITO_PRESTADOR',
                    $3,
                    'AUTORIZADO'

                )
                `,
                [
                    servicoId,
                    prestadorEmail,
                    valor
                ]
            );


            await client.query(
                `
                INSERT INTO historico_eventos (

                    servico_id,
                    empresa_email,
                    prestador_email,
                    tipo_evento,
                    descricao,
                    dados

                )
                VALUES (

                    $1,
                    $2,
                    $3,
                    'PAGAMENTO_AUTORIZADO',
                    $4,
                    $5::jsonb

                )
                `,
                [
                    servicoId,

                    empresaEmail,

                    prestadorEmail,

                    `Pagamento de R$ ${valor.toFixed(2)} autorizado pela empresa.`,

                    JSON.stringify({
                        valor,
                        formaPagamento:
                            servico.forma_pgto
                            ||
                            'Pix'
                    })
                ]
            );


            await client.query(
                'COMMIT'
            );


            emitirAtualizacaoServicosRS();


            res.json({
                sucesso: true,

                mensagem:
                    'Pagamento autorizado com sucesso.',

                valor
            });


        } catch (erro) {

            await client.query(
                'ROLLBACK'
            );


            console.error(
                'Erro ao autorizar pagamento:',
                erro
            );


            res.status(500)
                .json({
                    sucesso: false,
                    erro:
                        'Erro interno ao autorizar pagamento.'
                });


        } finally {

            client.release();
        }
    }
);


/* =====================================================
   SALVAR COMPROVANTE DE PAGAMENTO

   PODE RECEBER:
   - arquivo
   - base64
   - PDF
   - imagem
   ===================================================== */

app.post(
    '/api/servicos/:id/comprovante-pagamento',
    upload.single('arquivo'),
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


            const servicoId =
                Number(
                    req.params.id
                );


            const empresaEmail =
                normalizarEmailRS(
                    req.body.empresaEmail
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
                        servicoId
                    ]
                );


            if (
                resultado.rows.length ===
                0
            ) {

                await client.query(
                    'ROLLBACK'
                );


                return res
                    .status(404)
                    .json({
                        sucesso: false,
                        erro:
                            'Serviço não encontrado.'
                    });
            }


            const servico =
                resultado.rows[0];


            if (
                normalizarEmailRS(
                    servico.empresa_email
                )
                !==
                empresaEmail
            ) {

                await client.query(
                    'ROLLBACK'
                );


                return res
                    .status(403)
                    .json({
                        sucesso: false,
                        erro:
                            'Empresa não autorizada.'
                    });
            }


            let arquivoText =
                req.body.arquivo
                ||
                req.body.comprovante
                ||
                '';


            let nomeArquivo =
                req.body.nomeArquivo
                ||
                'comprovante-pagamento';


            let mimeType =
                req.body.mimeType
                ||
                'application/octet-stream';


            if (
                req.file
            ) {

                arquivoText =
                    `data:${
                        req.file.mimetype
                    };base64,${
                        req.file.buffer
                            .toString(
                                'base64'
                            )
                    }`;


                nomeArquivo =
                    req.file.originalname;


                mimeType =
                    req.file.mimetype;
            }


            if (!arquivoText) {

                await client.query(
                    'ROLLBACK'
                );


                return res
                    .status(400)
                    .json({
                        sucesso: false,
                        erro:
                            'Envie o comprovante de pagamento.'
                    });
            }


            const prestadorEmail =
                normalizarEmailRS(
                    servico.prestador_email
                );


            const documento =
                await client.query(
                    `
                    INSERT INTO documentos_arquivo (

                        servico_id,
                        empresa_email,
                        prestador_email,
                        categoria,
                        titulo,
                        nome_arquivo,
                        mime_type,
                        arquivo_text,
                        observacao

                    )
                    VALUES (

                        $1,
                        $2,
                        $3,
                        'COMPROVANTE_PAGAMENTO',
                        'Comprovante de Pagamento',
                        $4,
                        $5,
                        $6,
                        'Comprovante vinculado ao pagamento do serviço.'

                    )

                    RETURNING id
                    `,
                    [
                        servicoId,

                        empresaEmail,

                        prestadorEmail,

                        nomeArquivo,

                        mimeType,

                        arquivoText
                    ]
                );


            await client.query(
                `
                UPDATE servicos

                SET
                    comprovante_pagamento = TRUE,
                    comprovante_pagamento_text = $1,
                    status = 'concluido_com_sucesso'

                WHERE id = $2
                `,
                [
                    arquivoText,
                    servicoId
                ]
            );


            await client.query(
                `
                UPDATE pagamentos_historico

                SET
                    status = 'PAGO',
                    pago_em = CURRENT_TIMESTAMP,
                    comprovante_documento_id = $1,
                    atualizado_em = CURRENT_TIMESTAMP

                WHERE
                    servico_id = $2
                    AND
                    LOWER(prestador_email) = $3
                `,
                [
                    documento.rows[0].id,

                    servicoId,

                    prestadorEmail
                ]
            );


            await client.query(
                `
                UPDATE escalas_servico

                SET
                    status = 'CONCLUIDO',
                    atualizado_em = CURRENT_TIMESTAMP

                WHERE
                    servico_id = $1
                    AND
                    LOWER(prestador_email) = $2
                `,
                [
                    servicoId,
                    prestadorEmail
                ]
            );


            await client.query(
                `
                INSERT INTO historico_eventos (

                    servico_id,
                    empresa_email,
                    prestador_email,
                    tipo_evento,
                    descricao,
                    dados

                )
                VALUES (

                    $1,
                    $2,
                    $3,
                    'COMPROVANTE_PAGAMENTO_ARQUIVADO',
                    'Comprovante de pagamento arquivado.',
                    $4::jsonb

                )
                `,
                [
                    servicoId,

                    empresaEmail,

                    prestadorEmail,

                    JSON.stringify({
                        documentoId:
                            documento.rows[0].id,

                        nomeArquivo
                    })
                ]
            );


            await client.query(
                'COMMIT'
            );


            emitirAtualizacaoServicosRS();


            res.json({
                sucesso: true,

                mensagem:
                    'Comprovante arquivado com sucesso.',

                documentoId:
                    documento.rows[0].id
            });


        } catch (erro) {

            await client.query(
                'ROLLBACK'
            );


            console.error(
                'Erro ao salvar comprovante:',
                erro
            );


            res.status(500)
                .json({
                    sucesso: false,
                    erro:
                        'Erro interno ao salvar comprovante.'
                });


        } finally {

            client.release();
        }
    }
);


/* =====================================================
   CONTRATO ASSINADO
   ===================================================== */

app.post(
    '/api/servicos/:id/contrato-assinado',
    upload.single('arquivo'),
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


            const servicoId =
                Number(
                    req.params.id
                );


            const prestadorEmail =
                normalizarEmailRS(
                    req.body.prestadorEmail
                );


            const servico =
                await buscarServicoPorIdRS(
                    servicoId
                );


            if (!servico) {

                await client.query(
                    'ROLLBACK'
                );


                return res
                    .status(404)
                    .json({
                        sucesso: false,
                        erro:
                            'Serviço não encontrado.'
                    });
            }


            let arquivoText =
                req.body.arquivo
                ||
                req.body.contrato
                ||
                '';


            let nomeArquivo =
                req.body.nomeArquivo
                ||
                'contrato-assinado.pdf';


            let mimeType =
                req.body.mimeType
                ||
                'application/pdf';


            if (
                req.file
            ) {

                arquivoText =
                    `data:${
                        req.file.mimetype
                    };base64,${
                        req.file.buffer
                            .toString(
                                'base64'
                            )
                    }`;


                nomeArquivo =
                    req.file.originalname;


                mimeType =
                    req.file.mimetype;
            }


            if (!arquivoText) {

                await client.query(
                    'ROLLBACK'
                );


                return res
                    .status(400)
                    .json({
                        sucesso: false,
                        erro:
                            'Envie o contrato assinado.'
                    });
            }


            const resultado =
                await client.query(
                    `
                    INSERT INTO contratos_arquivo (

                        servico_id,
                        empresa_email,
                        prestador_email,
                        tipo,
                        nome_arquivo,
                        mime_type,
                        arquivo_text,
                        assinado_em

                    )
                    VALUES (

                        $1,
                        $2,
                        $3,
                        'CONTRATO_ASSINADO',
                        $4,
                        $5,
                        $6,
                        CURRENT_TIMESTAMP

                    )

                    RETURNING id
                    `,
                    [
                        servicoId,

                        normalizarEmailRS(
                            servico.empresa_email
                        ),

                        prestadorEmail,

                        nomeArquivo,

                        mimeType,

                        arquivoText
                    ]
                );


            await client.query(
                `
                UPDATE servicos

                SET
                    contrato_assinado_text = $1,
                    contrato_assinado_em = CURRENT_TIMESTAMP

                WHERE id = $2
                `,
                [
                    arquivoText,
                    servicoId
                ]
            );


            await client.query(
                `
                INSERT INTO historico_eventos (

                    servico_id,
                    empresa_email,
                    prestador_email,
                    tipo_evento,
                    descricao,
                    dados

                )
                VALUES (

                    $1,
                    $2,
                    $3,
                    'CONTRATO_ASSINADO',
                    'Contrato assinado arquivado.',
                    $4::jsonb

                )
                `,
                [
                    servicoId,

                    normalizarEmailRS(
                        servico.empresa_email
                    ),

                    prestadorEmail,

                    JSON.stringify({
                        contratoId:
                            resultado.rows[0].id,

                        nomeArquivo
                    })
                ]
            );


            await client.query(
                'COMMIT'
            );


            emitirAtualizacaoServicosRS();


            res.json({
                sucesso: true,

                mensagem:
                    'Contrato assinado arquivado com sucesso.',

                contratoId:
                    resultado.rows[0].id
            });


        } catch (erro) {

            await client.query(
                'ROLLBACK'
            );


            console.error(
                'Erro ao salvar contrato:',
                erro
            );


            res.status(500)
                .json({
                    sucesso: false,
                    erro:
                        'Erro interno ao salvar contrato.'
                });


        } finally {

            client.release();
        }
    }
);


/* =====================================================
   DOCUMENTOS DO SERVIÇO
   ===================================================== */

app.post(
    '/api/servicos/:id/documentos',
    upload.single('arquivo'),
    async (
        req,
        res
    ) => {

        try {

            const servicoId =
                Number(
                    req.params.id
                );


            const servico =
                await buscarServicoPorIdRS(
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


            let arquivoText =
                req.body.arquivo
                ||
                '';


            let nomeArquivo =
                req.body.nomeArquivo
                ||
                'documento';


            let mimeType =
                req.body.mimeType
                ||
                'application/octet-stream';


            if (
                req.file
            ) {

                arquivoText =
                    `data:${
                        req.file.mimetype
                    };base64,${
                        req.file.buffer
                            .toString(
                                'base64'
                            )
                    }`;


                nomeArquivo =
                    req.file.originalname;


                mimeType =
                    req.file.mimetype;
            }


            if (!arquivoText) {

                return res
                    .status(400)
                    .json({
                        sucesso: false,
                        erro:
                            'Nenhum arquivo enviado.'
                    });
            }


            const resultado =
                await pool.query(
                    `
                    INSERT INTO documentos_arquivo (

                        servico_id,
                        empresa_email,
                        prestador_email,
                        categoria,
                        titulo,
                        nome_arquivo,
                        mime_type,
                        arquivo_text,
                        observacao

                    )
                    VALUES (

                        $1,
                        $2,
                        $3,
                        $4,
                        $5,
                        $6,
                        $7,
                        $8,
                        $9

                    )

                    RETURNING id
                    `,
                    [
                        servicoId,

                        normalizarEmailRS(
                            servico.empresa_email
                        ),

                        normalizarEmailRS(
                            req.body.prestadorEmail
                            ||
                            servico.prestador_email
                        ),

                        String(
                            req.body.categoria
                            ||
                            'DOCUMENTO'
                        ),

                        String(
                            req.body.titulo
                            ||
                            nomeArquivo
                        ),

                        nomeArquivo,

                        mimeType,

                        arquivoText,

                        String(
                            req.body.observacao
                            ||
                            ''
                        )
                    ]
                );


            res.json({
                sucesso: true,

                mensagem:
                    'Documento arquivado.',

                documentoId:
                    resultado.rows[0].id
            });


        } catch (erro) {

            console.error(
                'Erro ao salvar documento:',
                erro
            );


            res.status(500)
                .json({
                    sucesso: false,
                    erro:
                        'Erro interno ao salvar documento.'
                });
        }
    }
);


app.get(
    '/api/servicos/:id/documentos',
    async (
        req,
        res
    ) => {

        try {

            const resultado =
                await pool.query(
                    `
                    SELECT *
                    FROM documentos_arquivo

                    WHERE
                        servico_id = $1

                    ORDER BY
                        criado_em DESC
                    `,
                    [
                        req.params.id
                    ]
                );


            res.json(
                resultado.rows
            );


        } catch (erro) {

            res.status(500)
                .json({
                    sucesso: false,
                    erro:
                        'Erro ao listar documentos.'
                });
        }
    }
);


/* =====================================================
   PAINEL EXCLUSIVO DA EMPRESA
   ===================================================== */

app.get(
    '/api/empresa/:email/painel',
    async (
        req,
        res
    ) => {

        try {

            const empresaEmail =
                normalizarEmailRS(
                    req.params.email
                );


            const [
                perfil,
                servicos,
                vinculos,
                escalas,
                pagamentos
            ] =
                await Promise.all([

                    pool.query(
                        `
                        SELECT *
                        FROM empresa_perfis
                        WHERE LOWER(empresa_email) = $1
                        LIMIT 1
                        `,
                        [
                            empresaEmail
                        ]
                    ),

                    pool.query(
                        `
                        SELECT *
                        FROM servicos

                        WHERE
                            LOWER(empresa_email) = $1

                        ORDER BY
                            id DESC
                        `,
                        [
                            empresaEmail
                        ]
                    ),

                    pool.query(
                        `
                        SELECT
                            sv.*,
                            tp.nome,
                            tp.whatsapp,
                            tp.profissao,
                            tp.experiencia

                        FROM servico_vinculos sv

                        LEFT JOIN trabalhador_perfis tp
                            ON LOWER(tp.prestador_email)
                            =
                            LOWER(sv.prestador_email)

                        WHERE
                            LOWER(sv.empresa_email) = $1

                        ORDER BY
                            sv.criado_em DESC
                        `,
                        [
                            empresaEmail
                        ]
                    ),

                    pool.query(
                        `
                        SELECT *
                        FROM escalas_servico

                        WHERE
                            LOWER(empresa_email) = $1

                        ORDER BY
                            criado_em DESC
                        `,
                        [
                            empresaEmail
                        ]
                    ),

                    pool.query(
                        `
                        SELECT *
                        FROM pagamentos_historico

                        WHERE
                            LOWER(empresa_email) = $1

                        ORDER BY
                            criado_em DESC
                        `,
                        [
                            empresaEmail
                        ]
                    )

                ]);


            const listaServicos =
                servicos.rows;


            const ativos =
                listaServicos.filter(
                    servico =>
                        ![
                            'concluido',
                            'concluido_com_sucesso',
                            'cancelado'
                        ]
                        .includes(
                            String(
                                servico.status
                                ||
                                ''
                            )
                            .toLowerCase()
                        )
                );


            const totalPago =
                pagamentos.rows
                    .filter(
                        pagamento =>
                            pagamento.status ===
                            'PAGO'
                    )
                    .reduce(
                        (
                            soma,
                            pagamento
                        ) =>
                            soma
                            +
                            Number(
                                pagamento.valor
                                ||
                                0
                            ),

                        0
                    );


            res.json({

                sucesso:
                    true,

                empresa:
                    perfil.rows[0]
                    ||
                    {
                        empresa_email:
                            empresaEmail
                    },

                resumo: {

                    servicosTotal:
                        listaServicos.length,

                    servicosAtivos:
                        ativos.length,

                    trabalhadoresVinculados:
                        new Set(
                            vinculos.rows
                                .filter(
                                    item =>
                                        item.status ===
                                        'ATIVO'
                                )
                                .map(
                                    item =>
                                        normalizarEmailRS(
                                            item.prestador_email
                                        )
                                )
                        )
                        .size,

                    totalPago
                },

                servicos:
                    listaServicos,

                trabalhadores:
                    vinculos.rows,

                escalas:
                    escalas.rows,

                pagamentos:
                    pagamentos.rows
            });


        } catch (erro) {

            console.error(
                'Erro no painel da empresa:',
                erro
            );


            res.status(500)
                .json({
                    sucesso: false,
                    erro:
                        'Erro ao carregar painel da empresa.'
                });
        }
    }
);


/* =====================================================
   ARQUIVO DIGITAL DA EMPRESA

   RETORNA:

   📁 Trabalhadores
   📁 Contratos
   📁 Serviços realizados
   📁 Escalas
   📁 Pagamentos
   📁 Comprovantes
   📁 Histórico
   📁 Documentos
   ===================================================== */

app.get(
    '/api/empresa/:email/arquivo',
    async (
        req,
        res
    ) => {

        try {

            const empresaEmail =
                normalizarEmailRS(
                    req.params.email
                );


            const [
                trabalhadores,
                contratos,
                servicos,
                escalas,
                pagamentos,
                comprovantes,
                historico,
                documentos
            ] =
                await Promise.all([

                    pool.query(
                        `
                        SELECT
                            sv.*,
                            tp.nome,
                            tp.whatsapp,
                            tp.profissao,
                            tp.experiencia

                        FROM servico_vinculos sv

                        LEFT JOIN trabalhador_perfis tp
                            ON LOWER(tp.prestador_email)
                            =
                            LOWER(sv.prestador_email)

                        WHERE
                            LOWER(sv.empresa_email) = $1

                        ORDER BY
                            sv.criado_em DESC
                        `,
                        [
                            empresaEmail
                        ]
                    ),

                    pool.query(
                        `
                        SELECT *
                        FROM contratos_arquivo

                        WHERE
                            LOWER(empresa_email) = $1

                        ORDER BY
                            criado_em DESC
                        `,
                        [
                            empresaEmail
                        ]
                    ),

                    pool.query(
                        `
                        SELECT *
                        FROM servicos

                        WHERE
                            LOWER(empresa_email) = $1

                        ORDER BY
                            id DESC
                        `,
                        [
                            empresaEmail
                        ]
                    ),

                    pool.query(
                        `
                        SELECT *
                        FROM escalas_servico

                        WHERE
                            LOWER(empresa_email) = $1

                        ORDER BY
                            criado_em DESC
                        `,
                        [
                            empresaEmail
                        ]
                    ),

                    pool.query(
                        `
                        SELECT *
                        FROM pagamentos_historico

                        WHERE
                            LOWER(empresa_email) = $1

                        ORDER BY
                            criado_em DESC
                        `,
                        [
                            empresaEmail
                        ]
                    ),

                    pool.query(
                        `
                        SELECT *
                        FROM documentos_arquivo

                        WHERE
                            LOWER(empresa_email) = $1

                            AND
                            categoria =
                            'COMPROVANTE_PAGAMENTO'

                        ORDER BY
                            criado_em DESC
                        `,
                        [
                            empresaEmail
                        ]
                    ),

                    pool.query(
                        `
                        SELECT *
                        FROM historico_eventos

                        WHERE
                            LOWER(empresa_email) = $1

                        ORDER BY
                            criado_em DESC
                        `,
                        [
                            empresaEmail
                        ]
                    ),

                    pool.query(
                        `
                        SELECT *
                        FROM documentos_arquivo

                        WHERE
                            LOWER(empresa_email) = $1

                        ORDER BY
                            criado_em DESC
                        `,
                        [
                            empresaEmail
                        ]
                    )

                ]);


            res.json({

                sucesso:
                    true,

                empresaEmail,

                pastas: {

                    trabalhadores:
                        trabalhadores.rows,

                    contratos:
                        contratos.rows,

                    servicosRealizados:
                        servicos.rows,

                    escalas:
                        escalas.rows,

                    pagamentos:
                        pagamentos.rows,

                    comprovantes:
                        comprovantes.rows,

                    historico:
                        historico.rows,

                    documentos:
                        documentos.rows
                }
            });


        } catch (erro) {

            console.error(
                'Erro no arquivo digital:',
                erro
            );


            res.status(500)
                .json({
                    sucesso: false,
                    erro:
                        'Erro ao carregar Arquivo Digital.'
                });
        }
    }
);


/* =====================================================
   HISTÓRICO DO TRABALHADOR DENTRO DA EMPRESA
   ===================================================== */

app.get(
    '/api/empresa/:email/trabalhadores/:prestadorEmail/historico',
    async (
        req,
        res
    ) => {

        try {

            const empresaEmail =
                normalizarEmailRS(
                    req.params.email
                );


            const prestadorEmail =
                normalizarEmailRS(
                    req.params.prestadorEmail
                );


            const [
                perfil,
                vinculos,
                historico,
                jornada,
                pagamentos,
                contratos
            ] =
                await Promise.all([

                    pool.query(
                        `
                        SELECT *
                        FROM trabalhador_perfis
                        WHERE LOWER(prestador_email) = $1
                        LIMIT 1
                        `,
                        [
                            prestadorEmail
                        ]
                    ),

                    pool.query(
                        `
                        SELECT
                            sv.*,
                            s.titulo,
                            s.categoria,
                            s.local,
                            s.valor,
                            s.status AS servico_status

                        FROM servico_vinculos sv

                        LEFT JOIN servicos s
                            ON s.id =
                            sv.servico_id

                        WHERE
                            LOWER(sv.empresa_email) = $1

                            AND
                            LOWER(sv.prestador_email) = $2

                        ORDER BY
                            sv.criado_em DESC
                        `,
                        [
                            empresaEmail,
                            prestadorEmail
                        ]
                    ),

                    pool.query(
                        `
                        SELECT *
                        FROM historico_eventos

                        WHERE
                            LOWER(empresa_email) = $1

                            AND
                            LOWER(prestador_email) = $2

                        ORDER BY
                            criado_em DESC
                        `,
                        [
                            empresaEmail,
                            prestadorEmail
                        ]
                    ),

                    pool.query(
                        `
                        SELECT *
                        FROM registros_jornada

                        WHERE
                            LOWER(empresa_email) = $1

                            AND
                            LOWER(prestador_email) = $2

                        ORDER BY
                            criado_em DESC
                        `,
                        [
                            empresaEmail,
                            prestadorEmail
                        ]
                    ),

                    pool.query(
                        `
                        SELECT *
                        FROM pagamentos_historico

                        WHERE
                            LOWER(empresa_email) = $1

                            AND
                            LOWER(prestador_email) = $2

                        ORDER BY
                            criado_em DESC
                        `,
                        [
                            empresaEmail,
                            prestadorEmail
                        ]
                    ),

                    pool.query(
                        `
                        SELECT *
                        FROM contratos_arquivo

                        WHERE
                            LOWER(empresa_email) = $1

                            AND
                            LOWER(prestador_email) = $2

                        ORDER BY
                            criado_em DESC
                        `,
                        [
                            empresaEmail,
                            prestadorEmail
                        ]
                    )

                ]);


            res.json({

                sucesso:
                    true,

                trabalhador:
                    perfil.rows[0]
                    ||
                    {
                        prestador_email:
                            prestadorEmail
                    },

                empresaEmail,

                vinculos:
                    vinculos.rows,

                historico:
                    historico.rows,

                jornada:
                    jornada.rows,

                pagamentos:
                    pagamentos.rows,

                contratos:
                    contratos.rows
            });


        } catch (erro) {

            res.status(500)
                .json({
                    sucesso: false,
                    erro:
                        'Erro ao carregar histórico do trabalhador.'
                });
        }
    }
);


/* =====================================================
   VISÃO DO TRABALHADOR SOBRE AS EMPRESAS
   ===================================================== */

app.get(
    '/api/prestador/:email/empresas',
    async (
        req,
        res
    ) => {

        try {

            const prestadorEmail =
                normalizarEmailRS(
                    req.params.email
                );


            const resultado =
                await pool.query(
                    `
                    SELECT DISTINCT ON (
                        LOWER(s.empresa_email)
                    )

                        s.empresa_email,
                        s.empresa_nome,
                        s.empresa_whatsapp,

                        ep.documento,
                        ep.responsavel,
                        ep.endereco,
                        ep.descricao,

                        s.id AS ultimo_servico_id,
                        s.titulo AS ultimo_servico,
                        s.categoria,
                        s.local,
                        s.data_horario,
                        s.valor,
                        s.status

                    FROM servicos s

                    LEFT JOIN empresa_perfis ep
                        ON LOWER(ep.empresa_email)
                        =
                        LOWER(s.empresa_email)

                    WHERE
                        LOWER(s.prestador_email) = $1

                        OR EXISTS (

                            SELECT 1
                            FROM servico_vinculos sv

                            WHERE
                                sv.servico_id =
                                s.id

                                AND
                                LOWER(sv.prestador_email) = $1
                        )

                    ORDER BY
                        LOWER(s.empresa_email),
                        s.id DESC
                    `,
                    [
                        prestadorEmail
                    ]
                );


            res.json({

                sucesso:
                    true,

                empresas:
                    resultado.rows
            });


        } catch (erro) {

            res.status(500)
                .json({
                    sucesso: false,
                    erro:
                        'Erro ao carregar empresas do trabalhador.'
                });
        }
    }
);


/* =====================================================
   HISTÓRICO FINANCEIRO DO TRABALHADOR
   ===================================================== */

app.get(
    '/api/prestador/:email/historico-pagamentos',
    async (
        req,
        res
    ) => {

        try {

            const prestadorEmail =
                normalizarEmailRS(
                    req.params.email
                );


            const resultado =
                await pool.query(
                    `
                    SELECT

                        ph.*,

                        s.titulo,
                        s.categoria,
                        s.local,
                        s.empresa_nome

                    FROM pagamentos_historico ph

                    LEFT JOIN servicos s
                        ON s.id =
                        ph.servico_id

                    WHERE
                        LOWER(ph.prestador_email) = $1

                    ORDER BY
                        ph.criado_em DESC
                    `,
                    [
                        prestadorEmail
                    ]
                );


            const totalPago =
                resultado.rows
                    .filter(
                        item =>
                            item.status ===
                            'PAGO'
                    )
                    .reduce(
                        (
                            soma,
                            item
                        ) =>
                            soma
                            +
                            Number(
                                item.valor
                                ||
                                0
                            ),

                        0
                    );


            const totalPendente =
                resultado.rows
                    .filter(
                        item =>
                            item.status !==
                            'PAGO'
                    )
                    .reduce(
                        (
                            soma,
                            item
                        ) =>
                            soma
                            +
                            Number(
                                item.valor
                                ||
                                0
                            ),

                        0
                    );


            res.json({

                sucesso:
                    true,

                resumo: {

                    totalPago,

                    totalPendente,

                    quantidade:
                        resultado.rows.length
                },

                pagamentos:
                    resultado.rows
            });


        } catch (erro) {

            res.status(500)
                .json({
                    sucesso: false,
                    erro:
                        'Erro ao carregar histórico financeiro.'
                });
        }
    }
);


/* =====================================================
   EXCLUIR SERVIÇO

   NÃO APAGA O HISTÓRICO.
   APENAS MARCA COMO CANCELADO.
   ===================================================== */

app.delete(
    '/api/servicos/:id',
    async (
        req,
        res
    ) => {

        try {

            const servicoId =
                Number(
                    req.params.id
                );


            const servico =
                await buscarServicoPorIdRS(
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


            await pool.query(
                `
                UPDATE servicos

                SET
                    status = 'cancelado',
                    motivo_cancelamento =
                        'CANCELADO_PELA_EMPRESA'

                WHERE id = $1
                `,
                [
                    servicoId
                ]
            );


            await registrarHistoricoRS({

                servicoId,

                empresaEmail:
                    servico.empresa_email,

                prestadorEmail:
                    servico.prestador_email,

                tipoEvento:
                    'SERVICO_CANCELADO',

                descricao:
                    'Serviço cancelado pela empresa.',

                dados: {
                    titulo:
                        servico.titulo
                }
            });


            emitirAtualizacaoServicosRS();


            res.json({
                sucesso: true,
                mensagem:
                    'Serviço cancelado e mantido no histórico.'
            });


        } catch (erro) {

            res.status(500)
                .json({
                    sucesso: false,
                    erro:
                        'Erro ao cancelar serviço.'
                });
        }
    }
);


/* =====================================================
   HOME / INDEX.HTML SEM CACHE
   ===================================================== */

app.get(
    '/',
    (
        req,
        res
    ) => {

        res.set({

            'Cache-Control':
                'no-store, no-cache, must-revalidate, proxy-revalidate',

            'Pragma':
                'no-cache',

            'Expires':
                '0',

            'Surrogate-Control':
                'no-store'
        });


        res.sendFile(
            path.join(
                __dirname,
                'index.html'
            )
        );
    }
);


/* =====================================================
   404 DA API
   ===================================================== */

app.use(
    '/api',
    (
        req,
        res
    ) => {

        res.status(404)
            .json({
                sucesso: false,

                erro:
                    'Rota da API não encontrada.',

                rota:
                    req.originalUrl
            });
    }
);


/* =====================================================
   ERRO GLOBAL
   ===================================================== */

app.use(
    (
        erro,
        req,
        res,
        next
    ) => {

        console.error(
            'Erro não tratado no RS Connect:',
            erro
        );


        if (
            res.headersSent
        ) {

            return next(
                erro
            );
        }


        res.status(500)
            .json({
                sucesso: false,

                erro:
                    'Erro interno do servidor.'
            });
    }
);


/* =====================================================
   INICIALIZAÇÃO SEGURA
   ===================================================== */

const PORT =
    Number(
        process.env.PORT
        ||
        10000
    );


async function iniciarServidorRSConnect() {

    try {

        /*
         * Aguarda o PostgreSQL responder.
         */

        await pool.query(
            'SELECT NOW()'
        );


        console.log(
            'Conectado com sucesso ao PostgreSQL.'
        );


        /*
         * Garante estrutura antiga + nova.
         *
         * CREATE TABLE IF NOT EXISTS
         * ALTER TABLE ADD COLUMN IF NOT EXISTS
         *
         * NÃO APAGA CADASTROS.
         */

        await criarTabelas();


        await garantirColunasGestaoFinalRS();


        server.listen(
            PORT,
            '0.0.0.0',
            () => {

                console.log(
                    ''
                );

                console.log(
                    '=========================================='
                );

                console.log(
                    'RS CONNECT - SERVIDOR ONLINE'
                );

                console.log(
                    `Porta: ${PORT}`
                );

                console.log(
                    `Ambiente: ${
                        process.env.NODE_ENV
                        ||
                        'development'
                    }`
                );

                console.log(
                    'Gestão Completa: ATIVA'
                );

                console.log(
                    'Arquivo Digital: ATIVO'
                );

                console.log(
                    '=========================================='
                );

                console.log(
                    ''
                );
            }
        );


    } catch (erro) {

        console.error(
            'Falha ao iniciar o RS Connect:',
            erro
        );


        process.exit(
            1
        );
    }
}


/* =====================================================
   TRATAMENTO DE ERROS DO NODE
   ===================================================== */

process.on(
    'unhandledRejection',
    motivo => {

        console.error(
            'Promise rejeitada sem tratamento:',
            motivo
        );
    }
);


process.on(
    'uncaughtException',
    erro => {

        console.error(
            'Exceção não capturada:',
            erro
        );
    }
);


/* =====================================================
   INICIAR
   ===================================================== */

iniciarServidorRSConnect();
