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

app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({
    limit: '50mb',
    extended: true
}));

app.use(express.static(path.join(__dirname)));

const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: {
        rejectUnauthorized: false
    }
});

pool.connect((err, client, release) => {
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
});


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
                reputacao NUMERIC(3,2) DEFAULT 5.0,
                advertencias INTEGER DEFAULT 0

            );


            CREATE TABLE IF NOT EXISTS servicos (

                id SERIAL PRIMARY KEY,

                titulo TEXT,
                categoria TEXT,
                local TEXT,
                endereco TEXT,

                valor TEXT,
                valor_diaria NUMERIC(10,2) DEFAULT 0,
                valor_liquido NUMERIC(10,2) DEFAULT 0,

                data_horario TEXT,
                forma_pgto TEXT,

                descricao TEXT,
                contrato_texto TEXT,

                empresa_email TEXT,
                empresa_whatsapp TEXT,
                empresa_nome TEXT,

                recorrencia TEXT DEFAULT 'unico',
                valor_total NUMERIC(10,2) DEFAULT 0,

                status TEXT DEFAULT 'ativo',
                motivo_cancelamento TEXT,

                prestador_email TEXT,
                prestador_id INTEGER,
                prestador_nome TEXT,
                prestador_pix TEXT,
                prestador_whatsapp TEXT,

                foto_ponto TEXT,
                foto_checkin TEXT,
                foto_checkout TEXT,

                checkin_gps TEXT,
                checkout_gps TEXT,

                reservas JSONB DEFAULT '[]'::jsonb,
                mensagens JSONB DEFAULT '[]'::jsonb,

                selfie_confirmacao TEXT,
                documento_comprovante TEXT,

                presenca_confirmada BOOLEAN DEFAULT FALSE,

                status_checkin TEXT DEFAULT 'pendente',

                checkin_hora TEXT,
                checkout_hora TEXT,

                intervalo_inicio TEXT,
                intervalo_retorno TEXT,

                total_horas TEXT,

                comprovante_pagamento BOOLEAN DEFAULT FALSE,

                nota_oficial TEXT,

                validado_empresa BOOLEAN DEFAULT FALSE,
                validado_em TIMESTAMP

            );


            CREATE TABLE IF NOT EXISTS ledger_transacoes (

                id SERIAL PRIMARY KEY,
                servico_id INTEGER,
                usuario_email TEXT,
                usuario_id INTEGER,

                tipo TEXT,
                tipo_movimento TEXT,

                valor NUMERIC(10,2) NOT NULL,

                status TEXT NOT NULL DEFAULT 'PROCESSADO',

                criado_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP

            );


            CREATE TABLE IF NOT EXISTS auditoria_sistema (

                id SERIAL PRIMARY KEY,
                usuario_email TEXT,

                acao TEXT NOT NULL,
                detalhes TEXT,

                criado_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP

            );

        `);


        const colunasGarantir = [

            "ALTER TABLE servicos ADD COLUMN IF NOT EXISTS categoria TEXT;",

            "ALTER TABLE servicos ADD COLUMN IF NOT EXISTS valor_diaria NUMERIC(10,2) DEFAULT 0;",

            "ALTER TABLE servicos ADD COLUMN IF NOT EXISTS valor_liquido NUMERIC(10,2) DEFAULT 0;",

            "ALTER TABLE servicos ADD COLUMN IF NOT EXISTS data_horario TEXT;",

            "ALTER TABLE servicos ADD COLUMN IF NOT EXISTS forma_pgto TEXT;",

            "ALTER TABLE servicos ADD COLUMN IF NOT EXISTS contrato_texto TEXT;",

            "ALTER TABLE servicos ADD COLUMN IF NOT EXISTS empresa_email TEXT;",

            "ALTER TABLE servicos ADD COLUMN IF NOT EXISTS empresa_whatsapp TEXT;",

            "ALTER TABLE servicos ADD COLUMN IF NOT EXISTS empresa_nome TEXT;",

            "ALTER TABLE servicos ADD COLUMN IF NOT EXISTS recorrencia TEXT DEFAULT 'unico';",

            "ALTER TABLE servicos ADD COLUMN IF NOT EXISTS valor_total NUMERIC(10,2) DEFAULT 0;",

            "ALTER TABLE servicos ADD COLUMN IF NOT EXISTS reservas JSONB DEFAULT '[]'::jsonb;",

            "ALTER TABLE servicos ADD COLUMN IF NOT EXISTS mensagens JSONB DEFAULT '[]'::jsonb;",

            "ALTER TABLE servicos ADD COLUMN IF NOT EXISTS selfie_confirmacao TEXT;",

            "ALTER TABLE servicos ADD COLUMN IF NOT EXISTS documento_comprovante TEXT;",

            "ALTER TABLE servicos ADD COLUMN IF NOT EXISTS presenca_confirmada BOOLEAN DEFAULT FALSE;",

            "ALTER TABLE servicos ADD COLUMN IF NOT EXISTS status_checkin TEXT DEFAULT 'pendente';",

            "ALTER TABLE servicos ADD COLUMN IF NOT EXISTS checkin_hora TEXT;",

            "ALTER TABLE servicos ADD COLUMN IF NOT EXISTS checkout_hora TEXT;",

            "ALTER TABLE servicos ADD COLUMN IF NOT EXISTS foto_checkin TEXT;",

            "ALTER TABLE servicos ADD COLUMN IF NOT EXISTS foto_checkout TEXT;",

            "ALTER TABLE servicos ADD COLUMN IF NOT EXISTS checkin_gps TEXT;",

            "ALTER TABLE servicos ADD COLUMN IF NOT EXISTS checkout_gps TEXT;",

            "ALTER TABLE servicos ADD COLUMN IF NOT EXISTS intervalo_inicio TEXT;",

            "ALTER TABLE servicos ADD COLUMN IF NOT EXISTS intervalo_retorno TEXT;",

            "ALTER TABLE servicos ADD COLUMN IF NOT EXISTS total_horas TEXT;",

            "ALTER TABLE servicos ADD COLUMN IF NOT EXISTS comprovante_pagamento BOOLEAN DEFAULT FALSE;",

            "ALTER TABLE servicos ADD COLUMN IF NOT EXISTS nota_oficial TEXT;",

            "ALTER TABLE servicos ADD COLUMN IF NOT EXISTS motivo_cancelamento TEXT;",

            "ALTER TABLE servicos ADD COLUMN IF NOT EXISTS validado_empresa BOOLEAN DEFAULT FALSE;",

            "ALTER TABLE servicos ADD COLUMN IF NOT EXISTS validado_em TIMESTAMP;"

        ];


        for (const sqlCol of colunasGarantir) {

            await pool
                .query(sqlCol)
                .catch(() => {});

        }


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


async function registrarLedger(
    servicoId,
    email,
    tipoMovimento,
    valor
) {

    try {

        await pool.query(

            `
            INSERT INTO ledger_transacoes
            (
                servico_id,
                usuario_email,
                tipo_movimento,
                valor
            )
            VALUES ($1, $2, $3, $4)
            `,

            [
                servicoId,
                email,
                tipoMovimento,
                valor
            ]

        );

    } catch (err) {

        console.error(
            'Erro ao registrar ledger:',
            err
        );

    }

}


async function registrarAuditoria(
    email,
    acao,
    detalhes
) {

    try {

        await pool.query(

            `
            INSERT INTO auditoria_sistema
            (
                usuario_email,
                acao,
                detalhes
            )
            VALUES ($1, $2, $3)
            `,

            [
                email || 'sistema',
                acao,
                detalhes
            ]

        );

    } catch (err) {

        console.error(
            'Erro ao registrar auditoria:',
            err
        );

    }

}


async function adicionarMensagemSistema(
    servicoId,
    texto
) {

    try {

        const result =
            await pool.query(

                `
                SELECT mensagens
                FROM servicos
                WHERE id = $1
                `,

                [servicoId]

            );


        if (!result.rows.length) {
            return;
        }


        const mensagens =
            result.rows[0].mensagens || [];


        mensagens.push({

            remetente:
                'SISTEMA',

            texto,

            data:
                new Date()
                    .toLocaleTimeString()

        });


        await pool.query(

            `
            UPDATE servicos
            SET mensagens = $1
            WHERE id = $2
            `,

            [
                JSON.stringify(mensagens),
                servicoId
            ]

        );

    } catch (err) {

        console.error(
            'Erro ao adicionar mensagem:',
            err
        );

    }

}


/* =========================================================
   AUTENTICAÇÃO
========================================================= */


app.post(
    '/api/auth/registrar',
    async (req, res) => {

        const d = req.body;

        try {

            const query = `

                INSERT INTO usuarios
                (
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

                VALUES
                (
                    $1,$2,$3,$4,$5,
                    $6,$7,$8,$9,$10,
                    $11,$12,$13,$14,$15
                )

                RETURNING id

            `;


            const params = [

                d.tipo,
                d.nome,
                d.doc,
                d.responsavel,
                d.email,
                d.senha,
                d.whatsapp,
                d.endereco,
                d.rgCnh,
                d.profissao,
                d.tipoChavePix,
                d.pix,
                d.banco,
                d.conta,
                d.experiencia

            ];


            const result =
                await pool.query(
                    query,
                    params
                );


            if (
                d.tipo ===
                'prestador'
            ) {

                await pool.query(

                    `
                    INSERT INTO prestadores
                    (email)

                    VALUES ($1)

                    ON CONFLICT (email)
                    DO NOTHING
                    `,

                    [d.email]

                );

            }


            await registrarAuditoria(

                d.email,

                'CADASTRO_USUARIO',

                `Novo usuário tipo ${d.tipo} cadastrado.`

            );


            res.json({

                sucesso: true,
                id: result.rows[0].id

            });

        } catch (err) {

            console.error(
                'Erro no cadastro:',
                err
            );


            res.json({

                sucesso: false,

                erro:
                    'E-mail já cadastrado ou erro nos dados.'

            });

        }

    }
);


app.post(
    '/api/auth/login',
    async (req, res) => {

        const {
            email,
            senha
        } = req.body;


        try {

            const result =
                await pool.query(

                    `
                    SELECT *
                    FROM usuarios
                    WHERE email = $1
                    AND senha = $2
                    `,

                    [
                        email,
                        senha
                    ]

                );


            if (
                result.rows.length === 0
            ) {

                return res.json({

                    sucesso: false,

                    erro:
                        'E-mail ou senha incorretos.'

                });

            }


            await registrarAuditoria(

                email,

                'LOGIN',

                'Login realizado com sucesso.'

            );


            res.json({

                sucesso: true,

                usuario:
                    result.rows[0]

            });

        } catch (err) {

            console.error(
                'Erro no login:',
                err
            );


            res.status(500)
                .json({

                    sucesso: false,

                    erro:
                        'Erro no servidor.'

                });

        }

    }
);


/* =========================================================
   SERVIÇOS
========================================================= */


app.get(
    '/api/servicos',
    async (req, res) => {

        try {

            const result =
                await pool.query(

                    `
                    SELECT *
                    FROM servicos
                    ORDER BY id DESC
                    `

                );


            const servicos =
                result.rows.map(
                    s => ({

                        ...s,

                        empresaEmail:
                            s.empresa_email,

                        empresaNome:
                            s.empresa_nome,

                        forma_pagamento:
                            s.forma_pgto,

                        formaPagamento:
                            s.forma_pgto,

                        foto_checkin:
                            s.foto_checkin ||
                            s.foto_ponto ||
                            null,

                        fotoCheckin:
                            s.foto_checkin ||
                            s.foto_ponto ||
                            null,

                        foto_checkout:
                            s.foto_checkout ||
                            s.documento_comprovante ||
                            null,

                        fotoCheckout:
                            s.foto_checkout ||
                            s.documento_comprovante ||
                            null,

                        intervaloInicio:
                            s.intervalo_inicio ||
                            null,

                        intervaloRetorno:
                            s.intervalo_retorno ||
                            null,

                        totalHoras:
                            s.total_horas ||
                            null,

                        validadoEmpresa:
                            !!s.validado_empresa

                    })
                );


            res.json(servicos);

        } catch (err) {

            console.error(
                'Erro ao buscar serviços:',
                err
            );


            res.status(500)
                .json({

                    erro:
                        'Erro ao buscar serviços.'

                });

        }

    }
);


app.post(
    '/api/servicos',
    async (req, res) => {

        const s = req.body;


        try {

            const valorUnitario =
                parseFloat(
                    String(
                        s.valor
                    )
                    .replace(
                        ',',
                        '.'
                    )
                ) || 0;


            const tipoRecorrencia =
                s.recorrencia ||
                'unico';


            let valorTotalGarantia =
                valorUnitario;


            if (
                tipoRecorrencia ===
                'semanal'
            ) {

                valorTotalGarantia =
                    valorUnitario * 4;

            }

            else if (
                tipoRecorrencia ===
                'quinzenal'
            ) {

                valorTotalGarantia =
                    valorUnitario * 2;

            }

            else if (
                tipoRecorrencia ===
                'mensal'
            ) {

                valorTotalGarantia =
                    valorUnitario;

            }


            const taxaPlataforma =
                valorTotalGarantia *
                0.10;


            const valorLiquido =
                valorTotalGarantia -
                taxaPlataforma;


            const query = `

                INSERT INTO servicos
                (
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
                    empresa_whatsapp,
                    recorrencia,
                    valor_total,
                    empresa_nome,
                    status
                )

                VALUES
                (
                    $1,$2,$3,$4,$5,
                    $6,$7,$8,$9,$10,
                    $11,$12,$13,$14,$15,
                    $16,
                    'ativo'
                )

                RETURNING id

            `;


            const params = [

                s.titulo,

                s.categoria ||
                    'Geral',

                s.local,

                s.endereco,

                String(
                    s.valor
                ),

                valorUnitario,

                valorLiquido,

                s.dataHorario ||
                    s.horario ||
                    'A combinar',

                s.formaPgto ||
                    s.forma_pagamento ||
                    s.pagamento ||
                    'Pix',

                s.descricao,

                s.contratoTexto ||
                    s.contrato ||
                    '',

                s.empresaEmail ||
                    s.empresa_email ||
                    '',

                s.empresaWhatsapp ||
                    s.empresa_whatsapp ||
                    '',

                tipoRecorrencia,

                valorTotalGarantia,

                s.empresaNome ||
                    s.empresa_nome ||
                    ''

            ];


            const result =
                await pool.query(
                    query,
                    params
                );


            const servicoId =
                result.rows[0].id;


            await registrarLedger(

                servicoId,

                s.empresaEmail ||
                s.empresa_email,

                'RETENCAO_GARANTIA',

                valorTotalGarantia

            );


            await registrarAuditoria(

                s.empresaEmail ||
                s.empresa_email,

                'PUBLICAR_SERVICO',

                `Serviço #${servicoId} publicado.`

            );


            io.emit(
                'atualizar_servicos'
            );


            res.json({

                sucesso: true,
                id: servicoId

            });

        } catch (err) {

            console.error(
                'Erro ao publicar serviço:',
                err
            );


            res.status(500)
                .json({

                    sucesso: false,

                    erro:
                        'Erro ao publicar serviço: ' +
                        err.message

                });

        }

    }
);


/* =========================================================
   ACEITAR VAGA
========================================================= */


app.post(
    '/api/servicos/:id/aceitar',
    async (req, res) => {

        const id =
            req.params.id;


        const {

            prestadorEmail,
            prestadorNome,
            prestadorWhatsapp,
            rgCnh

        } = req.body;


        const prestadorPix =

            req.body.prestadorPix ||

            req.body.prestador_pix ||

            '';


        try {

            const resultServico =
                await pool.query(

                    `
                    SELECT *
                    FROM servicos
                    WHERE id = $1
                    `,

                    [id]

                );


            if (
                resultServico.rows.length ===
                0
            ) {

                return res.json({

                    sucesso: false,

                    erro:
                        'Serviço não encontrado.'

                });

            }


            const servico =
                resultServico.rows[0];


            let reservas =
                servico.reservas ||
                [];


            const prestadorRes =
                await pool.query(

                    `
                    SELECT id
                    FROM usuarios
                    WHERE email = $1
                    `,

                    [prestadorEmail]

                );


            const prestadorId =
                prestadorRes
                    .rows[0]
                    ?.id ||
                null;


            if (
                !servico.prestador_email
            ) {

                await pool.query(

                    `
                    UPDATE servicos

                    SET
                        status = 'em_andamento',
                        prestador_email = $1,
                        prestador_id = $2,
                        prestador_nome = $3,
                        prestador_pix = $4,
                        prestador_whatsapp = $5

                    WHERE id = $6
                    `,

                    [
                        prestadorEmail,
                        prestadorId,
                        prestadorNome,
                        prestadorPix,
                        prestadorWhatsapp,
                        id
                    ]

                );


                await registrarAuditoria(

                    prestadorEmail,

                    'ACEITAR_SERVICO',

                    `Prestador assumiu vaga #${id}`

                );


                io.emit(
                    'atualizar_servicos'
                );


                return res.json({

                    sucesso: true,

                    mensagem:
                        'Você assumiu a Vaga Titular!'

                });

            }


            if (

                servico.prestador_email ===
                prestadorEmail

                ||

                reservas.some(
                    r =>
                        r.email ===
                        prestadorEmail
                )

            ) {

                return res.json({

                    sucesso: false,

                    erro:
                        'Você já está inscrito nesta vaga.'

                });

            }


            if (
                reservas.length >= 2
            ) {

                return res.json({

                    sucesso: false,

                    erro:
                        'A fila de reservas já está lotada.'

                });

            }


            reservas.push({

                email:
                    prestadorEmail,

                nome:
                    prestadorNome,

                whatsapp:
                    prestadorWhatsapp,

                rgCnh,

                pix:
                    prestadorPix

            });


            await pool.query(

                `
                UPDATE servicos
                SET reservas = $1
                WHERE id = $2
                `,

                [
                    JSON.stringify(
                        reservas
                    ),

                    id
                ]

            );


            io.emit(
                'atualizar_servicos'
            );


            res.json({

                sucesso: true,

                mensagem:
                    'Você entrou na fila de reserva!'

            });

        } catch (err) {

            console.error(
                'Erro ao aceitar vaga:',
                err
            );


            res.status(500)
                .json({

                    sucesso: false,

                    erro:
                        'Erro ao aceitar vaga.'

                });

        }

    }
);


/* =========================================================
   CONFIRMAÇÃO DE PRESENÇA
========================================================= */


app.post(
    '/api/servicos/:id/confirmar-presenca',
    async (req, res) => {

        const id =
            req.params.id;


        const {

            selfie,
            documentoComprovante

        } = req.body;


        try {

            await pool.query(

                `
                UPDATE servicos

                SET
                    selfie_confirmacao =
                        COALESCE(
                            $1,
                            selfie_confirmacao
                        ),

                    documento_comprovante =
                        COALESCE(
                            $2,
                            documento_comprovante
                        ),

                    presenca_confirmada =
                        TRUE

                WHERE id = $3
                `,

                [
                    selfie,
                    documentoComprovante,
                    id
                ]

            );


            await registrarAuditoria(

                'sistema',

                'CONFIRMAR_PRESENCA',

                `Presença confirmada no serviço #${id}`

            );


            io.emit(
                'atualizar_servicos'
            );


            res.json({

                sucesso: true,

                mensagem:
                    'Presença confirmada com sucesso!'

            });

        } catch (err) {

            console.error(
                'Erro ao confirmar presença:',
                err
            );


            res.status(500)
                .json({

                    sucesso: false,

                    erro:
                        'Erro ao confirmar presença.'

                });

        }

    }
);


/* =========================================================
   CHECK-IN
========================================================= */


app.post(
    '/api/servicos/:id/checkin',
    async (req, res) => {

        const id =
            req.params.id;


        const foto =

            req.body.foto ||

            req.body.foto_checkin ||

            req.body.fotoCheckin;


        const hora =

            req.body.hora ||

            req.body.checkin_hora ||

            new Date()
                .toLocaleTimeString();


        const gps =

            req.body.gps ||

            req.body.checkin_gps ||

            req.body.gps_checkin ||

            null;


        try {

            if (!foto) {

                return res
                    .status(400)
                    .json({

                        sucesso: false,

                        erro:
                            'A foto do check-in é obrigatória.'

                    });

            }


            const result =
                await pool.query(

                    `
                    UPDATE servicos

                    SET
                        foto_ponto = $1,
                        foto_checkin = $1,

                        checkin_hora = $2,
                        checkin_gps = $3,

                        status_checkin =
                            'realizado',

                        status =
                            'em_andamento'

                    WHERE id = $4

                    RETURNING id
                    `,

                    [
                        foto,
                        hora,
                        gps,
                        id
                    ]

                );


            if (
                !result.rows.length
            ) {

                return res
                    .status(404)
                    .json({

                        sucesso: false,

                        erro:
                            'Serviço não encontrado.'

                    });

            }


            await adicionarMensagemSistema(

                id,

                `Check-in realizado às ${hora}. Foto e localização registradas.`

            );


            await registrarAuditoria(

                req.body
                    .prestadorEmail ||
                'sistema',

                'CHECKIN',

                `Serviço #${id} - GPS: ${gps || 'não informado'}`

            );


            io.emit(
                'atualizar_servicos'
            );


            res.json({

                sucesso: true,

                mensagem:
                    'Check-in realizado com sucesso!',

                checkin_hora:
                    hora,

                checkin_gps:
                    gps

            });

        } catch (err) {

            console.error(
                'Erro no check-in:',
                err
            );


            res.status(500)
                .json({

                    sucesso: false,

                    erro:
                        'Erro ao registrar check-in: ' +
                        err.message

                });

        }

    }
);


/* =========================================================
   COMPATIBILIDADE COM /PONTO
========================================================= */


app.post(
    '/api/servicos/:id/ponto',
    async (req, res) => {

        const id =
            req.params.id;


        const {

            foto,
            hora,
            gps

        } = req.body;


        try {

            await pool.query(

                `
                UPDATE servicos

                SET
                    foto_ponto = $1,
                    foto_checkin = $1,

                    checkin_hora = $2,
                    checkin_gps = $3,

                    status_checkin =
                        'realizado',

                    status =
                        'em_andamento'

                WHERE id = $4
                `,

                [
                    foto,

                    hora ||
                    new Date()
                        .toLocaleTimeString(),

                    gps ||
                    null,

                    id
                ]

            );


            io.emit(
                'atualizar_servicos'
            );


            res.json({

                sucesso: true

            });

        } catch (err) {

            console.error(
                'Erro no ponto:',
                err
            );


            res.status(500)
                .json({

                    sucesso: false,

                    erro:
                        'Erro ao registrar ponto.'

                });

        }

    }
);


/* =========================================================
   INTERVALO
========================================================= */


app.post(
    '/api/servicos/:id/intervalo/iniciar',
    async (req, res) => {

        const id =
            req.params.id;


        const hora =
            req.body.hora ||
            new Date()
                .toLocaleTimeString();


        try {

            const result =
                await pool.query(

                    `
                    SELECT *
                    FROM servicos
                    WHERE id = $1
                    `,

                    [id]

                );


            if (
                !result.rows.length
            ) {

                return res
                    .status(404)
                    .json({

                        sucesso: false,

                        erro:
                            'Serviço não encontrado.'

                    });

            }


            const servico =
                result.rows[0];


            if (
                !servico.checkin_hora
            ) {

                return res
                    .status(400)
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
                    .status(400)
                    .json({

                        sucesso: false,

                        erro:
                            'O serviço já foi finalizado.'

                    });

            }


            await pool.query(

                `
                UPDATE servicos

                SET
                    intervalo_inicio = $1,
                    intervalo_retorno = NULL

                WHERE id = $2
                `,

                [
                    hora,
                    id
                ]

            );


            await adicionarMensagemSistema(

                id,

                `Intervalo iniciado às ${hora}.`

            );


            io.emit(
                'atualizar_servicos'
            );


            res.json({

                sucesso: true,

                intervalo_inicio:
                    hora

            });

        } catch (err) {

            console.error(
                'Erro ao iniciar intervalo:',
                err
            );


            res.status(500)
                .json({

                    sucesso: false,

                    erro:
                        'Erro ao iniciar intervalo.'

                });

        }

    }
);


app.post(
    '/api/servicos/:id/intervalo/retornar',
    async (req, res) => {

        const id =
            req.params.id;


        const hora =
            req.body.hora ||
            new Date()
                .toLocaleTimeString();


        try {

            const result =
                await pool.query(

                    `
                    SELECT *
                    FROM servicos
                    WHERE id = $1
                    `,

                    [id]

                );


            if (
                !result.rows.length
            ) {

                return res
                    .status(404)
                    .json({

                        sucesso: false,

                        erro:
                            'Serviço não encontrado.'

                    });

            }


            const servico =
                result.rows[0];


            if (
                !servico.intervalo_inicio
            ) {

                return res
                    .status(400)
                    .json({

                        sucesso: false,

                        erro:
                            'Nenhum intervalo foi iniciado.'

                    });

            }


            await pool.query(

                `
                UPDATE servicos

                SET
                    intervalo_retorno = $1

                WHERE id = $2
                `,

                [
                    hora,
                    id
                ]

            );


            await adicionarMensagemSistema(

                id,

                `Retorno do intervalo às ${hora}.`

            );


            io.emit(
                'atualizar_servicos'
            );


            res.json({

                sucesso: true,

                intervalo_retorno:
                    hora

            });

        } catch (err) {

            console.error(
                'Erro ao retornar do intervalo:',
                err
            );


            res.status(500)
                .json({

                    sucesso: false,

                    erro:
                        'Erro ao retornar do intervalo.'

                });

        }

    }
);


/* =========================================================
   CHECK-OUT
========================================================= */


app.post(
    '/api/servicos/:id/checkout',
    upload.single('fotoCheckout'),
    async (req, res) => {

        const id =
            req.params.id;


        try {

            const arquivo =
                req.file;


            const foto =

                req.body.fotoCheckout ||

                req.body.foto_checkout ||

                req.body.foto ||

                (
                    arquivo
                    ?

                    `data:${arquivo.mimetype};base64,${arquivo.buffer.toString('base64')}`

                    :

                    null
                );


            const hora =

                req.body.hora ||

                req.body.checkout_hora ||

                new Date()
                    .toLocaleTimeString();


            const gps =

                req.body.gps ||

                req.body.checkout_gps ||

                req.body.gps_checkout ||

                null;


            const total =

                req.body.total_horas ||

                req.body.totalHoras ||

                '';


            const pix =

                req.body.prestador_pix ||

                req.body.prestadorPix ||

                null;


            const formaPagamento =

                req.body.forma_pagamento ||

                req.body.formaPagamento ||

                null;


            if (!foto) {

                return res
                    .status(400)
                    .json({

                        sucesso: false,

                        erro:
                            'A foto do check-out é obrigatória.'

                    });

            }


            const result =
                await pool.query(

                    `
                    SELECT *
                    FROM servicos
                    WHERE id = $1
                    `,

                    [id]

                );


            if (
                !result.rows.length
            ) {

                return res
                    .status(404)
                    .json({

                        sucesso: false,

                        erro:
                            'Serviço não encontrado.'

                    });

            }


            const servico =
                result.rows[0];


            await pool.query(

                `
                UPDATE servicos

                SET
                    status =
                        'aguardando_validacao',

                    status_checkin =
                        'concluido',

                    checkout_hora = $1,

                    foto_checkout = $2,

                    documento_comprovante = $2,

                    checkout_gps = $3,

                    total_horas = $4,

                    prestador_pix =
                        COALESCE(
                            $5,
                            prestador_pix
                        ),

                    forma_pgto =
                        COALESCE(
                            $6,
                            forma_pgto
                        ),

                    comprovante_pagamento =
                        FALSE,

                    validado_empresa =
                        FALSE

                WHERE id = $7
                `,

                [
                    hora,
                    foto,
                    gps,
                    total,
                    pix,
                    formaPagamento,
                    id
                ]

            );


            await adicionarMensagemSistema(

                id,

                `Serviço finalizado às ${hora}. Foto, GPS e dados para pagamento enviados à empresa.`

            );


            await registrarAuditoria(

                servico.prestador_email ||
                'sistema',

                'CHECKOUT',

                `Serviço #${id} finalizado.`

            );


            io.emit(
                'atualizar_servicos'
            );


            res.json({

                sucesso: true,

                mensagem:
                    'Serviço finalizado e enviado para validação da empresa!',

                checkout_hora:
                    hora,

                checkout_gps:
                    gps,

                total_horas:
                    total,

                prestador_pix:
                    pix ||
                    servico.prestador_pix,

                forma_pagamento:
                    formaPagamento ||
                    servico.forma_pgto,

                valor:
                    servico.valor

            });

        } catch (err) {

            console.error(
                'Erro no checkout:',
                err
            );


            res.status(500)
                .json({

                    sucesso: false,

                    erro:
                        'Erro ao realizar check-out: ' +
                        err.message

                });

        }

    }
);


/* =========================================================
   VALIDAÇÃO DA EMPRESA
========================================================= */


app.post(
    '/api/servicos/:id/validar',
    async (req, res) => {

        const id =
            req.params.id;


        try {

            const result =
                await pool.query(

                    `
                    SELECT *
                    FROM servicos
                    WHERE id = $1
                    `,

                    [id]

                );


            if (
                !result.rows.length
            ) {

                return res
                    .status(404)
                    .json({

                        sucesso: false,

                        erro:
                            'Serviço não encontrado.'

                    });

            }


            const servico =
                result.rows[0];


            if (
                !servico.checkout_hora
            ) {

                return res
                    .status(400)
                    .json({

                        sucesso: false,

                        erro:
                            'O prestador ainda não realizou o check-out.'

                    });

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
                        'validado'

                WHERE id = $1
                `,

                [id]

            );


            await adicionarMensagemSistema(

                id,

                'A empresa validou o serviço. Pagamento liberado para processamento.'

            );


            await registrarAuditoria(

                req.body.usuarioEmail ||
                servico.empresa_email ||
                'empresa',

                'VALIDAR_SERVICO',

                `Serviço #${id} validado.`

            );


            io.emit(
                'atualizar_servicos'
            );


            res.json({

                sucesso: true,

                mensagem:
                    'Serviço validado pela empresa. Pronto para pagamento.'

            });

        } catch (err) {

            console.error(
                'Erro ao validar serviço:',
                err
            );


            res.status(500)
                .json({

                    sucesso: false,

                    erro:
                        'Erro ao validar serviço.'

                });

        }

    }
);


/* =========================================================
   PAGAMENTO
========================================================= */


app.post(
    '/api/servicos/:id/aprovar',
    async (req, res) => {

        const id =
            req.params.id;


        try {

            const result =
                await pool.query(

                    `
                    SELECT *
                    FROM servicos
                    WHERE id = $1
                    `,

                    [id]

                );


            if (
                !result.rows.length
            ) {

                return res
                    .status(404)
                    .json({

                        sucesso: false,

                        erro:
                            'Serviço não encontrado.'

                    });

            }


            const servico =
                result.rows[0];


            if (
                !servico.validado_empresa
            ) {

                return res
                    .status(400)
                    .json({

                        sucesso: false,

                        erro:
                            'A empresa precisa validar o serviço antes do pagamento.'

                    });

            }


            if (
                servico.comprovante_pagamento
            ) {

                return res
                    .status(400)
                    .json({

                        sucesso: false,

                        erro:
                            'Este serviço já consta como pago.'

                    });

            }


            await pool.query(

                `
                UPDATE servicos

                SET
                    status = 'pago',

                    comprovante_pagamento =
                        TRUE

                WHERE id = $1
                `,

                [id]

            );


            await registrarLedger(

                id,

                servico.prestador_email,

                'REPASSE_PRESTADOR',

                servico.valor_liquido ||
                servico.valor_diaria ||
                0

            );


            await adicionarMensagemSistema(

                id,

                `Pagamento aprovado. Forma: ${servico.forma_pgto || 'Pix'}. PIX: ${servico.prestador_pix || 'não informado'}.`

            );


            await registrarAuditoria(

                servico.empresa_email,

                'APROVAR_PAGAMENTO',

                `Pagamento do serviço #${id} aprovado.`

            );


            io.emit(
                'atualizar_servicos'
            );


            res.json({

                sucesso: true,

                mensagem:
                    'Pagamento aprovado com sucesso!',

                prestador_pix:
                    servico.prestador_pix,

                forma_pagamento:
                    servico.forma_pgto,

                valor_liquido:
                    servico.valor_liquido

            });

        } catch (err) {

            console.error(
                'Erro ao aprovar pagamento:',
                err
            );


            res.status(500)
                .json({

                    sucesso: false,

                    erro:
                        'Erro ao aprovar pagamento.'

                });

        }

    }
);


/* =========================================================
   NOTA FISCAL
========================================================= */


app.post(
    '/api/servicos/:id/nota-oficial',
    upload.single('notaFiscal'),
    async (req, res) => {

        const id =
            req.params.id;


        try {

            const arquivo =
                req.file;


            const dadosNota =

                req.body.notaFiscal ||

                (
                    arquivo
                    ?

                    `data:${arquivo.mimetype};base64,${arquivo.buffer.toString('base64')}`

                    :

                    null
                );


            if (!dadosNota) {

                return res.json({

                    sucesso: false,

                    erro:
                        'Nenhum arquivo de nota fiscal enviado.'

                });

            }


            await pool.query(

                `
                UPDATE servicos
                SET nota_oficial = $1
                WHERE id = $2
                `,

                [
                    dadosNota,
                    id
                ]

            );


            await adicionarMensagemSistema(

                id,

                'Nota Fiscal Oficial enviada com sucesso.'

            );


            io.emit(
                'atualizar_servicos'
            );


            res.json({

                sucesso: true,

                mensagem:
                    'Nota fiscal enviada com sucesso!'

            });

        } catch (err) {

            console.error(
                'Erro ao enviar nota fiscal:',
                err
            );


            res.status(500)
                .json({

                    sucesso: false,

                    erro:
                        'Erro ao enviar nota fiscal.'

                });

        }

    }
);


/* =========================================================
   CHAT
========================================================= */


app.post(
    '/api/servicos/:id/chat',
    async (req, res) => {

        const id =
            req.params.id;


        const {

            remetente,
            texto

        } = req.body;


        try {

            const result =
                await pool.query(

                    `
                    SELECT mensagens
                    FROM servicos
                    WHERE id = $1
                    `,

                    [id]

                );


            if (
                !result.rows.length
            ) {

                return res
                    .status(404)
                    .json({

                        sucesso: false

                    });

            }


            const mensagens =
                result.rows[0]
                    .mensagens ||
                [];


            mensagens.push({

                remetente,

                texto,

                data:
                    new Date()
                        .toLocaleTimeString()

            });


            await pool.query(

                `
                UPDATE servicos
                SET mensagens = $1
                WHERE id = $2
                `,

                [
                    JSON.stringify(
                        mensagens
                    ),

                    id
                ]

            );


            io.emit(
                'atualizar_servicos'
            );


            res.json({

                sucesso: true

            });

        } catch (err) {

            console.error(
                'Erro no chat:',
                err
            );


            res.status(500)
                .json({

                    sucesso: false

                });

        }

    }
);


/* =========================================================
   EXCLUIR SERVIÇO
========================================================= */


app.delete(
    '/api/servicos/:id',
    async (req, res) => {

        const id =
            req.params.id;


        try {

            await pool.query(

                `
                DELETE FROM servicos
                WHERE id = $1
                `,

                [id]

            );


            await registrarAuditoria(

                'sistema',

                'DELETAR_SERVICO',

                `Serviço #${id} removido.`

            );


            io.emit(
                'atualizar_servicos'
            );


            res.json({

                sucesso: true,

                mensagem:
                    'Serviço removido com sucesso!'

            });

        } catch (err) {

            console.error(
                'Erro ao excluir:',
                err
            );


            res.status(500)
                .json({

                    sucesso: false,

                    erro:
                        'Erro ao excluir serviço.'

                });

        }

    }
);


/* =========================================================
   SOCKET
========================================================= */


io.on(
    'connection',
    socket => {

        console.log(
            'Novo cliente conectado:',
            socket.id
        );

    }
);


/* =========================================================
   INDEX
========================================================= */


app.get(
    '/',
    (req, res) => {

        res.status(200)
            .sendFile(
                path.join(
                    __dirname,
                    'index.html'
                )
            );

    }
);


/* =========================================================
   SERVIDOR
========================================================= */


const PORT =
    process.env.PORT ||
    10000;


server.listen(
    PORT,
    () => {

        console.log(
            `Servidor rodando na porta ${PORT}`
        );

    }
);
