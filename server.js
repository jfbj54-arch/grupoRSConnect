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
        methods: ["GET", "POST", "PUT", "PATCH", "DELETE"]
    }
});

const upload = multer({
    limits: {
        fileSize: 10 * 1024 * 1024
    }
});

app.use(express.json({ limit: '15mb' }));
app.use(express.urlencoded({ limit: '15mb', extended: true }));
app.use(express.static(path.join(__dirname)));

const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.DATABASE_URL
        ? { rejectUnauthorized: false }
        : false
});

function normalizarEmail(email) {
    return String(email || '').trim().toLowerCase();
}

function horaAtualRS() {
    return new Date().toLocaleTimeString('pt-BR', {
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        timeZone: 'America/Sao_Paulo'
    });
}

function numeroRS(valor) {
    if (typeof valor === 'number') {
        return Number.isFinite(valor) ? valor : 0;
    }

    let texto = String(valor ?? '')
        .replace(/R\$/gi, '')
        .replace(/\s/g, '');

    if (texto.includes(',')) {
        texto = texto.replace(/\./g, '').replace(',', '.');
    }

    const numero = Number(texto);
    return Number.isFinite(numero) ? numero : 0;
}

function parseReservas(valor) {
    if (Array.isArray(valor)) return valor;

    try {
        const parsed = JSON.parse(valor || '[]');
        return Array.isArray(parsed) ? parsed : [];
    } catch {
        return [];
    }
}

async function buscarServico(servicoId) {
    const resultado = await pool.query(
        'SELECT * FROM servicos WHERE id = $1 LIMIT 1',
        [servicoId]
    );

    return resultado.rows[0] || null;
}

function prestadorEhTitular(servico, email) {
    return normalizarEmail(servico?.prestador_email) === normalizarEmail(email);
}

function empresaEhResponsavel(servico, email) {
    return normalizarEmail(servico?.empresa_email) === normalizarEmail(email);
}

async function registrarLedger(servicoId, email, tipoMovimento, valor) {
    try {
        await pool.query(
            `INSERT INTO ledger_transacoes
             (servico_id, usuario_email, tipo_movimento, valor)
             VALUES ($1, $2, $3, $4)`,
            [
                servicoId,
                email || 'sistema',
                tipoMovimento,
                numeroRS(valor)
            ]
        );
    } catch (err) {
        console.error('Erro ao registrar ledger:', err.message);
    }
}

async function registrarAuditoria(email, acao, detalhes) {
    try {
        await pool.query(
            `INSERT INTO auditoria_sistema
             (usuario_email, acao, detalhes)
             VALUES ($1, $2, $3)`,
            [
                email || 'sistema',
                acao,
                detalhes || ''
            ]
        );
    } catch (err) {
        console.error('Erro ao registrar auditoria:', err.message);
    }
}

function emitirAtualizacao(servicoId = null) {
    const payload = {
        servicoId,
        atualizadoEm: new Date().toISOString()
    };

    io.emit('atualizar_servicos', payload);
    io.emit('servicosAtualizados', payload);
    io.emit('servicos_atualizados', payload);
}


// ============================================================
// BANCO DE DADOS
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
                descricao TEXT
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
                cidade TEXT,
                endereco TEXT,
                valor TEXT,
                valor_diaria NUMERIC(10,2) DEFAULT 0,
                valor_liquido NUMERIC(10,2) DEFAULT 0,
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
                reservas JSONB DEFAULT '[]'::jsonb,
                mensagens JSONB DEFAULT '[]'::jsonb,
                selfie_confirmacao TEXT,
                documento_comprovante TEXT,
                presenca_confirmada BOOLEAN DEFAULT FALSE,
                presenca_hora TEXT,
                presenca_latitude TEXT,
                presenca_longitude TEXT,
                presenca_precisao TEXT,
                status_checkin TEXT DEFAULT 'pendente',
                checkin_hora TEXT,
                checkin_foto TEXT,
                checkin_latitude TEXT,
                checkin_longitude TEXT,
                intervalo_inicio TEXT,
                intervalo_fim TEXT,
                intervalo_retorno TEXT,
                em_intervalo BOOLEAN DEFAULT FALSE,
                checkout_hora TEXT,
                checkout_foto TEXT,
                checkout_latitude TEXT,
                checkout_longitude TEXT,
                validado_empresa BOOLEAN DEFAULT FALSE,
                validado_em TIMESTAMP,
                pagamento_autorizado BOOLEAN DEFAULT FALSE,
                pagamento_autorizado_em TIMESTAMP,
                pagamento_realizado BOOLEAN DEFAULT FALSE,
                pagamento_realizado_em TIMESTAMP,
                comprovante_pagamento BOOLEAN DEFAULT FALSE,
                comprovante_pagamento_arquivo TEXT,
                contrato_assinado TEXT,
                contrato_assinado_em TIMESTAMP,
                nota_oficial TEXT
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

            CREATE TABLE IF NOT EXISTS pagamentos (
                id SERIAL PRIMARY KEY,
                servico_id INTEGER NOT NULL,
                empresa_email TEXT,
                prestador_email TEXT,
                valor NUMERIC(12,2) DEFAULT 0,
                forma_pagamento TEXT,
                status TEXT DEFAULT 'PENDENTE',
                comprovante TEXT,
                autorizado_em TIMESTAMP,
                pago_em TIMESTAMP,
                criado_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );

            CREATE TABLE IF NOT EXISTS documentos_rs (
                id SERIAL PRIMARY KEY,
                servico_id INTEGER,
                empresa_email TEXT,
                prestador_email TEXT,
                categoria TEXT,
                nome TEXT,
                arquivo TEXT,
                criado_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );

            CREATE TABLE IF NOT EXISTS conversas (
                id SERIAL PRIMARY KEY,
                servico_id INTEGER NOT NULL,
                empresa_email TEXT NOT NULL,
                prestador_email TEXT NOT NULL,
                criado_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                atualizado_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                ativo BOOLEAN DEFAULT TRUE,
                UNIQUE (servico_id, empresa_email, prestador_email)
            );

            CREATE TABLE IF NOT EXISTS mensagens_chat (
                id SERIAL PRIMARY KEY,
                conversa_id INTEGER NOT NULL
                    REFERENCES conversas(id)
                    ON DELETE CASCADE,
                servico_id INTEGER NOT NULL,
                remetente_email TEXT NOT NULL,
                destinatario_email TEXT NOT NULL,
                mensagem TEXT NOT NULL,
                tipo TEXT DEFAULT 'texto',
                lida BOOLEAN DEFAULT FALSE,
                criado_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );
        `);

        // =====================================================
        // GARANTIA DE COLUNAS PARA BANCOS ANTIGOS
        // =====================================================

        const colunasGarantir = [
            "ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS descricao TEXT;",

            "ALTER TABLE servicos ADD COLUMN IF NOT EXISTS empresa_email TEXT;",
            "ALTER TABLE servicos ADD COLUMN IF NOT EXISTS empresa_nome TEXT;",
            "ALTER TABLE servicos ADD COLUMN IF NOT EXISTS empresa_whatsapp TEXT;",
            "ALTER TABLE servicos ADD COLUMN IF NOT EXISTS valor_diaria NUMERIC(10,2) DEFAULT 0;",
            "ALTER TABLE servicos ADD COLUMN IF NOT EXISTS valor_liquido NUMERIC(10,2) DEFAULT 0;",
            "ALTER TABLE servicos ADD COLUMN IF NOT EXISTS valor_total NUMERIC(10,2) DEFAULT 0;",
            "ALTER TABLE servicos ADD COLUMN IF NOT EXISTS recorrencia TEXT DEFAULT 'unico';",
            "ALTER TABLE servicos ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'ativo';",
            "ALTER TABLE servicos ADD COLUMN IF NOT EXISTS motivo_cancelamento TEXT;",
            "ALTER TABLE servicos ADD COLUMN IF NOT EXISTS prestador_email TEXT;",
            "ALTER TABLE servicos ADD COLUMN IF NOT EXISTS prestador_id INTEGER;",
            "ALTER TABLE servicos ADD COLUMN IF NOT EXISTS prestador_nome TEXT;",
            "ALTER TABLE servicos ADD COLUMN IF NOT EXISTS prestador_pix TEXT;",
            "ALTER TABLE servicos ADD COLUMN IF NOT EXISTS prestador_whatsapp TEXT;",
            "ALTER TABLE servicos ADD COLUMN IF NOT EXISTS reservas JSONB DEFAULT '[]'::jsonb;",
            "ALTER TABLE servicos ADD COLUMN IF NOT EXISTS mensagens JSONB DEFAULT '[]'::jsonb;",
            "ALTER TABLE servicos ADD COLUMN IF NOT EXISTS selfie_confirmacao TEXT;",
            "ALTER TABLE servicos ADD COLUMN IF NOT EXISTS documento_comprovante TEXT;",
            "ALTER TABLE servicos ADD COLUMN IF NOT EXISTS presenca_confirmada BOOLEAN DEFAULT FALSE;",
            "ALTER TABLE servicos ADD COLUMN IF NOT EXISTS presenca_hora TEXT;",
            "ALTER TABLE servicos ADD COLUMN IF NOT EXISTS presenca_latitude TEXT;",
            "ALTER TABLE servicos ADD COLUMN IF NOT EXISTS presenca_longitude TEXT;",
            "ALTER TABLE servicos ADD COLUMN IF NOT EXISTS presenca_precisao TEXT;",
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
            "ALTER TABLE servicos ADD COLUMN IF NOT EXISTS nota_oficial TEXT;",

            "ALTER TABLE ledger_transacoes ADD COLUMN IF NOT EXISTS usuario_email TEXT;",
            "ALTER TABLE ledger_transacoes ADD COLUMN IF NOT EXISTS tipo_movimento TEXT;",
            "ALTER TABLE ledger_transacoes ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'PROCESSADO';"
        ];

        for (const sql of colunasGarantir) {
            await pool.query(sql);
        }

        // =====================================================
        // CORREÇÃO SEGURA DO CHAT
        // Evita o erro antigo:
        // column "conversa_id" does not exist
        // =====================================================

        await pool.query(`
            ALTER TABLE mensagens_chat
            ADD COLUMN IF NOT EXISTS conversa_id INTEGER;
        `);

        await pool.query(`
            ALTER TABLE mensagens_chat
            ADD COLUMN IF NOT EXISTS servico_id INTEGER;
        `);

        await pool.query(`
            ALTER TABLE mensagens_chat
            ADD COLUMN IF NOT EXISTS remetente_email TEXT;
        `);

        await pool.query(`
            ALTER TABLE mensagens_chat
            ADD COLUMN IF NOT EXISTS destinatario_email TEXT;
        `);

        await pool.query(`
            ALTER TABLE mensagens_chat
            ADD COLUMN IF NOT EXISTS mensagem TEXT;
        `);

        await pool.query(`
            ALTER TABLE mensagens_chat
            ADD COLUMN IF NOT EXISTS tipo TEXT DEFAULT 'texto';
        `);

        await pool.query(`
            ALTER TABLE mensagens_chat
            ADD COLUMN IF NOT EXISTS lida BOOLEAN DEFAULT FALSE;
        `);

        await pool.query(`
            ALTER TABLE mensagens_chat
            ADD COLUMN IF NOT EXISTS criado_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP;
        `);

        await pool.query(`
            CREATE INDEX IF NOT EXISTS idx_mensagens_chat_conversa
            ON mensagens_chat(conversa_id);
        `);

        await pool.query(`
            CREATE INDEX IF NOT EXISTS idx_mensagens_chat_servico
            ON mensagens_chat(servico_id);
        `);

        await pool.query(`
            CREATE INDEX IF NOT EXISTS idx_servicos_empresa_email
            ON servicos(empresa_email);
        `);

        await pool.query(`
            CREATE INDEX IF NOT EXISTS idx_servicos_prestador_email
            ON servicos(prestador_email);
        `);

        console.log('✅ Tabelas e colunas verificadas/criadas com sucesso.');

    } catch (err) {
        console.error('❌ Erro ao preparar banco RS Connect:', err);
        throw err;
    }
}


// ============================================================
// HEALTH CHECK
// ============================================================

app.get('/api/health', async (req, res) => {
    try {
        await pool.query('SELECT 1');

        return res.json({
            sucesso: true,
            sistema: 'RS Connect',
            banco: 'online',
            websocket: 'online',
            horario: horaAtualRS()
        });

    } catch (err) {
        return res.status(500).json({
            sucesso: false,
            banco: 'offline',
            erro: err.message
        });
    }
});


// ============================================================
// LOGIN E CADASTRO
// ============================================================

app.post('/api/auth/cadastro', async (req, res) => {
    const d = req.body;

    const email = normalizarEmail(d.email);

    if (!email || !d.senha || !d.nome) {
        return res.status(400).json({
            sucesso: false,
            erro: 'Nome, e-mail e senha são obrigatórios.'
        });
    }

    try {
        const result = await pool.query(
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
                $1,$2,$3,$4,$5,$6,$7,$8,
                $9,$10,$11,$12,$13,$14,$15,$16
            )
            RETURNING *
            `,
            [
                d.tipo || 'prestador',
                d.nome,
                d.doc || '',
                d.responsavel || '',
                email,
                d.senha,
                d.whatsapp || '',
                d.endereco || '',
                d.rgCnh || d.rg_cnh || '',
                d.profissao || '',
                d.tipoChavePix || d.tipo_chave_pix || '',
                d.pix || '',
                d.banco || '',
                d.conta || '',
                d.experiencia || '',
                d.descricao || ''
            ]
        );

        if ((d.tipo || '').toLowerCase() === 'prestador') {
            await pool.query(
                `
                INSERT INTO prestadores (email)
                VALUES ($1)
                ON CONFLICT (email)
                DO NOTHING
                `,
                [email]
            );
        }

        await registrarAuditoria(
            email,
            'CADASTRO_USUARIO',
            `Novo usuário tipo ${d.tipo} cadastrado.`
        );

        return res.json({
            sucesso: true,
            id: result.rows[0].id,
            usuario: result.rows[0]
        });

    } catch (err) {
        console.error('Erro no cadastro:', err.message);

        return res.status(400).json({
            sucesso: false,
            erro:
                err.code === '23505'
                    ? 'Este e-mail já está cadastrado.'
                    : 'Erro ao criar cadastro.'
        });
    }
});


app.post('/api/auth/login', async (req, res) => {
    const email = normalizarEmail(req.body?.email);
    const senha = String(req.body?.senha || '');

    try {
        const result = await pool.query(
            `
            SELECT *
            FROM usuarios
            WHERE LOWER(email) = LOWER($1)
              AND senha = $2
            LIMIT 1
            `,
            [email, senha]
        );

        if (!result.rows.length) {
            return res.status(401).json({
                sucesso: false,
                erro: 'E-mail ou senha incorretos.'
            });
        }

        await registrarAuditoria(
            email,
            'LOGIN',
            'Login realizado com sucesso.'
        );

        return res.json({
            sucesso: true,
            usuario: result.rows[0]
        });

    } catch (err) {
        console.error('Erro no login:', err);

        return res.status(500).json({
            sucesso: false,
            erro: 'Erro no servidor.'
        });
    }
});


// ============================================================
// SERVIÇOS
// ============================================================

app.get('/api/servicos', async (req, res) => {
    try {
        const result = await pool.query(
            `
            SELECT *
            FROM servicos
            ORDER BY id DESC
            `
        );

        return res.json(result.rows);

    } catch (err) {
        console.error('Erro ao buscar serviços:', err);

        return res.status(500).json({
            erro: 'Erro ao buscar serviços.'
        });
    }
});


app.post('/api/servicos', async (req, res) => {
    const s = req.body;

    try {
        const valorUnitario = numeroRS(s.valor);
        const tipoRecorrencia = s.recorrencia || 'unico';

        let valorTotalGarantia = valorUnitario;

        if (tipoRecorrencia === 'semanal') {
            valorTotalGarantia = valorUnitario * 4;
        } else if (tipoRecorrencia === 'quinzenal') {
            valorTotalGarantia = valorUnitario * 2;
        }

        const taxaPlataforma = valorTotalGarantia * 0.10;
        const valorLiquido = valorTotalGarantia - taxaPlataforma;

        const empresaEmail = normalizarEmail(
            s.empresaEmail ||
            s.empresa_email
        );

        let empresaNome =
            s.empresaNome ||
            s.empresa_nome ||
            '';

        if (!empresaNome && empresaEmail) {
            const usuarioEmpresa = await pool.query(
                `
                SELECT nome
                FROM usuarios
                WHERE LOWER(email) = LOWER($1)
                LIMIT 1
                `,
                [empresaEmail]
            );

            empresaNome =
                usuarioEmpresa.rows[0]?.nome ||
                '';
        }

        const result = await pool.query(
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
                valor_total,
                status
            )
            VALUES (
                $1,$2,$3,$4,$5,
                $6,$7,$8,
                $9,$10,$11,
                $12,$13,
                $14,$15,$16,
                $17,$18,
                $19,$20,
                'ativo'
            )
            RETURNING *
            `,
            [
                s.titulo,
                s.categoria || 'Geral',
                s.local || s.cidade || '',
                s.cidade || '',
                s.endereco || '',
                String(valorUnitario),
                valorUnitario,
                valorLiquido,
                s.dataHorario ||
                s.data_horario ||
                (
                    s.data && s.horario
                        ? `${s.data}T${s.horario}`
                        : 'A combinar'
                ),
                s.horarioFim ||
                s.horario_fim ||
                '',
                s.formaPgto ||
                s.formaPagamento ||
                s.forma_pgto ||
                s.pagamento ||
                'Pix',
                s.descricao || '',
                s.contratoTexto ||
                s.contrato_texto ||
                s.contrato ||
                '',
                empresaEmail,
                empresaNome,
                s.empresaWhatsapp ||
                s.empresa_whatsapp ||
                '',
                s.responsavelServico ||
                s.responsavel_servico ||
                '',
                s.whatsappResponsavel ||
                s.whatsapp_responsavel ||
                '',
                tipoRecorrencia,
                valorTotalGarantia
            ]
        );

        const servico = result.rows[0];

        await registrarLedger(
            servico.id,
            empresaEmail,
            'RETENCAO_GARANTIA',
            valorTotalGarantia
        );

        await registrarAuditoria(
            empresaEmail,
            'PUBLICAR_SERVICO',
            `Serviço #${servico.id} publicado.`
        );

        emitirAtualizacao(servico.id);

        return res.json({
            sucesso: true,
            id: servico.id,
            servico
        });

    } catch (err) {
        console.error('Erro ao publicar serviço:', err);

        return res.status(500).json({
            sucesso: false,
            erro:
                'Erro ao publicar serviço: ' +
                err.message
        });
    }
});


// ============================================================
// ACEITAR VAGA — TITULAR / RESERVA
// ============================================================

app.post('/api/servicos/:id/aceitar', async (req, res) => {
    const servicoId = Number(req.params.id);

    try {
        const servico = await buscarServico(servicoId);

        if (!servico) {
            return res.status(404).json({
                sucesso: false,
                erro: 'Serviço não encontrado.'
            });
        }

        const prestadorEmail = normalizarEmail(
            req.body?.prestadorEmail
        );

        const prestadorNome =
            req.body?.prestadorNome ||
            prestadorEmail;

        const prestadorPix =
            req.body?.prestadorPix ||
            '';

        const prestadorWhatsapp =
            req.body?.prestadorWhatsapp ||
            '';

        const rgCnh =
            req.body?.rgCnh ||
            '';

        if (!prestadorEmail) {
            return res.status(400).json({
                sucesso: false,
                erro: 'Prestador não informado.'
            });
        }

        let reservas = parseReservas(servico.reservas);

        if (
            normalizarEmail(servico.prestador_email)
            === prestadorEmail
        ) {
            return res.status(400).json({
                sucesso: false,
                erro: 'Você já é o Titular desta vaga.'
            });
        }

        if (
            reservas.some(
                r =>
                    normalizarEmail(
                        typeof r === 'string'
                            ? r
                            : r.email ||
                              r.prestadorEmail
                    ) === prestadorEmail
            )
        ) {
            return res.status(400).json({
                sucesso: false,
                erro: 'Você já está na reserva desta vaga.'
            });
        }

        // Se ainda não existe titular, o primeiro candidato assume.
        if (!servico.prestador_email) {
            const result = await pool.query(
                `
                UPDATE servicos
                SET
                    prestador_email = $1,
                    prestador_nome = $2,
                    prestador_pix = $3,
                    prestador_whatsapp = $4,
                    prestador_id = (
                        SELECT id
                        FROM usuarios
                        WHERE LOWER(email) = LOWER($1)
                        LIMIT 1
                    ),
                    status = 'aguardando_confirmacao'
                WHERE id = $5
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
                `Prestador tornou-se titular do serviço #${servicoId}. RG/CNH: ${rgCnh}`
            );

            emitirAtualizacao(servicoId);

            return res.json({
                sucesso: true,
                posicao: 'titular',
                servico: result.rows[0]
            });
        }

        // Titular já existe: permite até duas reservas.
        if (reservas.length >= 2) {
            return res.status(409).json({
                sucesso: false,
                erro:
                    'Esta vaga já possui Titular e duas Reservas de Emergência.'
            });
        }

        reservas.push({
            email: prestadorEmail,
            nome: prestadorNome,
            pix: prestadorPix,
            whatsapp: prestadorWhatsapp,
            rgCnh,
            criadoEm: new Date().toISOString()
        });

        const result = await pool.query(
            `
            UPDATE servicos
            SET reservas = $1::jsonb
            WHERE id = $2
            RETURNING *
            `,
            [
                JSON.stringify(reservas),
                servicoId
            ]
        );

        await registrarAuditoria(
            prestadorEmail,
            'ENTRAR_RESERVA',
            `Prestador entrou na Reserva ${reservas.length} do serviço #${servicoId}.`
        );

        emitirAtualizacao(servicoId);

        return res.json({
            sucesso: true,
            posicao: `reserva_${reservas.length}`,
            servico: result.rows[0]
        });

    } catch (err) {
        console.error('Erro ao aceitar vaga:', err);

        return res.status(500).json({
            sucesso: false,
            erro: 'Erro ao aceitar vaga: ' + err.message
        });
    }
});
// ============================================================
// SAIR DA VAGA
// ============================================================

app.post('/api/servicos/:id/sair-vaga', async (req, res) => {
    const servicoId = Number(req.params.id);
    const email = normalizarEmail(
        req.body?.email ||
        req.body?.prestadorEmail
    );

    if (!servicoId || !email) {
        return res.status(400).json({
            sucesso: false,
            erro: 'Serviço ou prestador não informado.'
        });
    }

    try {
        const servico = await buscarServico(servicoId);

        if (!servico) {
            return res.status(404).json({
                sucesso: false,
                erro: 'Serviço não encontrado.'
            });
        }

        let reservas = parseReservas(servico.reservas);

        const ehTitular =
            normalizarEmail(servico.prestador_email) === email;

        const indiceReserva = reservas.findIndex(r => {
            const reservaEmail = normalizarEmail(
                typeof r === 'string'
                    ? r
                    : r.email || r.prestadorEmail
            );

            return reservaEmail === email;
        });

        if (!ehTitular && indiceReserva === -1) {
            return res.status(400).json({
                sucesso: false,
                erro: 'Você não está vinculado a esta vaga.'
            });
        }

        // ----------------------------------------------------
        // TITULAR SAINDO
        // ----------------------------------------------------

        if (ehTitular) {
            // Não permite sair depois que a jornada começou.
            if (
                servico.presenca_confirmada ||
                servico.checkin_hora ||
                servico.intervalo_inicio ||
                servico.checkout_hora
            ) {
                return res.status(409).json({
                    sucesso: false,
                    erro:
                        'Não é possível sair da vaga porque a jornada já foi iniciada.'
                });
            }

            let novoTitular = null;

            if (reservas.length > 0) {
                novoTitular = reservas.shift();
            }

            if (novoTitular) {
                const novoEmail = normalizarEmail(
                    typeof novoTitular === 'string'
                        ? novoTitular
                        : novoTitular.email ||
                          novoTitular.prestadorEmail
                );

                const novoNome =
                    typeof novoTitular === 'string'
                        ? novoTitular
                        : novoTitular.nome ||
                          novoTitular.prestadorNome ||
                          novoEmail;

                const novoPix =
                    typeof novoTitular === 'string'
                        ? ''
                        : novoTitular.pix ||
                          novoTitular.prestadorPix ||
                          '';

                const novoWhatsapp =
                    typeof novoTitular === 'string'
                        ? ''
                        : novoTitular.whatsapp ||
                          novoTitular.prestadorWhatsapp ||
                          '';

                await pool.query(
                    `
                    UPDATE servicos
                    SET
                        prestador_email = $1,
                        prestador_nome = $2,
                        prestador_pix = $3,
                        prestador_whatsapp = $4,
                        prestador_id = (
                            SELECT id
                            FROM usuarios
                            WHERE LOWER(email) = LOWER($1)
                            LIMIT 1
                        ),
                        reservas = $5::jsonb,
                        status = 'aguardando_confirmacao',
                        presenca_confirmada = FALSE,
                        presenca_hora = NULL,
                        presenca_latitude = NULL,
                        presenca_longitude = NULL,
                        presenca_precisao = NULL
                    WHERE id = $6
                    `,
                    [
                        novoEmail,
                        novoNome,
                        novoPix,
                        novoWhatsapp,
                        JSON.stringify(reservas),
                        servicoId
                    ]
                );

                await registrarAuditoria(
                    email,
                    'SAIR_VAGA_TITULAR',
                    `Titular saiu do serviço #${servicoId}. Reserva promovida automaticamente para Titular.`
                );

                await registrarAuditoria(
                    novoEmail,
                    'PROMOVIDO_TITULAR',
                    `Reserva promovida automaticamente para Titular do serviço #${servicoId}.`
                );

            } else {
                await pool.query(
                    `
                    UPDATE servicos
                    SET
                        prestador_email = NULL,
                        prestador_nome = NULL,
                        prestador_pix = NULL,
                        prestador_whatsapp = NULL,
                        prestador_id = NULL,
                        reservas = '[]'::jsonb,
                        status = 'ativo',
                        presenca_confirmada = FALSE,
                        presenca_hora = NULL,
                        presenca_latitude = NULL,
                        presenca_longitude = NULL,
                        presenca_precisao = NULL
                    WHERE id = $1
                    `,
                    [servicoId]
                );

                await registrarAuditoria(
                    email,
                    'SAIR_VAGA_TITULAR',
                    `Titular saiu do serviço #${servicoId}. A vaga voltou ao Radar.`
                );
            }

            emitirAtualizacao(servicoId);

            return res.json({
                sucesso: true,
                mensagem: novoTitular
                    ? 'Você saiu da vaga. A primeira reserva tornou-se Titular.'
                    : 'Você saiu da vaga. A vaga voltou a ficar disponível.'
            });
        }

        // ----------------------------------------------------
        // RESERVA SAINDO
        // ----------------------------------------------------

        reservas.splice(indiceReserva, 1);

        await pool.query(
            `
            UPDATE servicos
            SET reservas = $1::jsonb
            WHERE id = $2
            `,
            [
                JSON.stringify(reservas),
                servicoId
            ]
        );

        await registrarAuditoria(
            email,
            'SAIR_RESERVA',
            `Prestador saiu da reserva do serviço #${servicoId}.`
        );

        emitirAtualizacao(servicoId);

        return res.json({
            sucesso: true,
            mensagem: 'Você saiu da reserva.'
        });

    } catch (err) {
        console.error('Erro ao sair da vaga:', err);

        return res.status(500).json({
            sucesso: false,
            erro: 'Erro ao sair da vaga: ' + err.message
        });
    }
});


// ============================================================
// CONFIRMAR PRESENÇA / ESCALA
// ============================================================

app.post('/api/servicos/:id/confirmar-presenca', async (req, res) => {
    const servicoId = Number(req.params.id);

    const email = normalizarEmail(
        req.body?.email ||
        req.body?.prestadorEmail
    );

    try {
        const servico = await buscarServico(servicoId);

        if (!servico) {
            return res.status(404).json({
                sucesso: false,
                erro: 'Serviço não encontrado.'
            });
        }

        if (!prestadorEhTitular(servico, email)) {
            return res.status(403).json({
                sucesso: false,
                erro:
                    'Somente o Titular pode confirmar presença neste serviço.'
            });
        }

        if (servico.checkout_hora) {
            return res.status(409).json({
                sucesso: false,
                erro: 'Este serviço já foi finalizado.'
            });
        }

        const latitude =
            req.body?.latitude ??
            req.body?.lat ??
            '';

        const longitude =
            req.body?.longitude ??
            req.body?.lng ??
            '';

        const precisao =
            req.body?.precisao ??
            req.body?.accuracy ??
            '';

        const selfie =
            req.body?.selfie ||
            req.body?.foto ||
            req.body?.imagem ||
            null;

        const hora = horaAtualRS();

        const result = await pool.query(
            `
            UPDATE servicos
            SET
                presenca_confirmada = TRUE,
                presenca_hora = COALESCE(presenca_hora, $1),
                presenca_latitude = $2,
                presenca_longitude = $3,
                presenca_precisao = $4,
                selfie_confirmacao =
                    COALESCE(NULLIF($5, ''), selfie_confirmacao),
                status = CASE
                    WHEN status IN (
                        'ativo',
                        'aguardando_confirmacao'
                    )
                    THEN 'confirmado'
                    ELSE status
                END
            WHERE id = $6
            RETURNING *
            `,
            [
                hora,
                String(latitude || ''),
                String(longitude || ''),
                String(precisao || ''),
                selfie || '',
                servicoId
            ]
        );

        await registrarAuditoria(
            email,
            'CONFIRMAR_PRESENCA',
            `Presença confirmada no serviço #${servicoId} às ${hora}.`
        );

        emitirAtualizacao(servicoId);

        return res.json({
            sucesso: true,
            mensagem: 'Presença confirmada.',
            servico: result.rows[0]
        });

    } catch (err) {
        console.error('Erro ao confirmar presença:', err);

        return res.status(500).json({
            sucesso: false,
            erro:
                'Não foi possível confirmar presença: ' +
                err.message
        });
    }
});


// Compatibilidade com versões antigas do INDEX
app.post('/api/servicos/:id/presenca', async (req, res) => {
    const servicoId = Number(req.params.id);

    const email = normalizarEmail(
        req.body?.email ||
        req.body?.prestadorEmail
    );

    try {
        const servico = await buscarServico(servicoId);

        if (!servico) {
            return res.status(404).json({
                sucesso: false,
                erro: 'Serviço não encontrado.'
            });
        }

        if (!prestadorEhTitular(servico, email)) {
            return res.status(403).json({
                sucesso: false,
                erro: 'Somente o Titular pode confirmar presença.'
            });
        }

        const hora = horaAtualRS();

        const result = await pool.query(
            `
            UPDATE servicos
            SET
                presenca_confirmada = TRUE,
                presenca_hora = COALESCE(presenca_hora, $1),
                presenca_latitude = $2,
                presenca_longitude = $3,
                presenca_precisao = $4,
                selfie_confirmacao =
                    COALESCE(NULLIF($5, ''), selfie_confirmacao),
                status = 'confirmado'
            WHERE id = $6
            RETURNING *
            `,
            [
                hora,
                String(req.body?.latitude || ''),
                String(req.body?.longitude || ''),
                String(req.body?.precisao || ''),
                req.body?.selfie ||
                req.body?.foto ||
                '',
                servicoId
            ]
        );

        emitirAtualizacao(servicoId);

        return res.json({
            sucesso: true,
            servico: result.rows[0]
        });

    } catch (err) {
        console.error('Erro presença compatibilidade:', err);

        return res.status(500).json({
            sucesso: false,
            erro: err.message
        });
    }
});


// ============================================================
// CHECK-IN
// ============================================================

app.post('/api/servicos/:id/checkin', async (req, res) => {
    const servicoId = Number(req.params.id);

    const email = normalizarEmail(
        req.body?.email ||
        req.body?.prestadorEmail
    );

    try {
        const servico = await buscarServico(servicoId);

        if (!servico) {
            return res.status(404).json({
                sucesso: false,
                erro: 'Serviço não encontrado.'
            });
        }

        if (!prestadorEhTitular(servico, email)) {
            return res.status(403).json({
                sucesso: false,
                erro:
                    'Somente o Titular pode registrar a entrada.'
            });
        }

        if (servico.checkout_hora) {
            return res.status(409).json({
                sucesso: false,
                erro:
                    'CHECK-OUT FINALIZADO. Esta jornada já foi encerrada.'
            });
        }

        if (!servico.presenca_confirmada) {
            return res.status(409).json({
                sucesso: false,
                erro:
                    'Confirme sua presença antes de registrar a entrada.'
            });
        }

        if (servico.checkin_hora) {
            return res.status(409).json({
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
            req.body?.lat ??
            '';

        const longitude =
            req.body?.longitude ??
            req.body?.lng ??
            '';

        if (!foto) {
            return res.status(400).json({
                sucesso: false,
                erro:
                    'É obrigatório tirar a foto de entrada.'
            });
        }

        if (
            latitude === '' ||
            longitude === ''
        ) {
            return res.status(400).json({
                sucesso: false,
                erro:
                    'A localização é obrigatória para registrar a entrada.'
            });
        }

        const hora = horaAtualRS();

        const result = await pool.query(
            `
            UPDATE servicos
            SET
                checkin_hora = $1,
                checkin_foto = $2,
                checkin_latitude = $3,
                checkin_longitude = $4,
                status_checkin = 'realizado',
                status = 'em_andamento',
                em_intervalo = FALSE
            WHERE id = $5
            RETURNING *
            `,
            [
                hora,
                foto,
                String(latitude),
                String(longitude),
                servicoId
            ]
        );

        await registrarAuditoria(
            email,
            'CHECKIN',
            `Entrada registrada no serviço #${servicoId} às ${hora}.`
        );

        emitirAtualizacao(servicoId);

        return res.json({
            sucesso: true,
            mensagem: 'Entrada registrada com sucesso.',
            hora,
            servico: result.rows[0]
        });

    } catch (err) {
        console.error('Erro no check-in:', err);

        return res.status(500).json({
            sucesso: false,
            erro:
                'Não foi possível fazer o check-in: ' +
                err.message
        });
    }
});


// ============================================================
// INICIAR INTERVALO
// ============================================================

app.post('/api/servicos/:id/intervalo/iniciar', async (req, res) => {
    const servicoId = Number(req.params.id);

    const email = normalizarEmail(
        req.body?.email ||
        req.body?.prestadorEmail
    );

    try {
        const servico = await buscarServico(servicoId);

        if (!servico) {
            return res.status(404).json({
                sucesso: false,
                erro: 'Serviço não encontrado.'
            });
        }

        if (!prestadorEhTitular(servico, email)) {
            return res.status(403).json({
                sucesso: false,
                erro:
                    'Somente o Titular pode iniciar o intervalo.'
            });
        }

        if (!servico.checkin_hora) {
            return res.status(409).json({
                sucesso: false,
                erro:
                    'Registre a entrada antes de iniciar o intervalo.'
            });
        }

        if (servico.checkout_hora) {
            return res.status(409).json({
                sucesso: false,
                erro:
                    'Esta jornada já foi finalizada.'
            });
        }

        if (servico.em_intervalo) {
            return res.status(409).json({
                sucesso: false,
                erro:
                    'O intervalo já está em andamento.'
            });
        }

        if (servico.intervalo_inicio) {
            return res.status(409).json({
                sucesso: false,
                erro:
                    'O intervalo desta jornada já foi utilizado.'
            });
        }

        const hora = horaAtualRS();

        const result = await pool.query(
            `
            UPDATE servicos
            SET
                intervalo_inicio = $1,
                intervalo_fim = NULL,
                intervalo_retorno = NULL,
                em_intervalo = TRUE,
                status = 'em_intervalo'
            WHERE id = $2
            RETURNING *
            `,
            [
                hora,
                servicoId
            ]
        );

        await registrarAuditoria(
            email,
            'INICIAR_INTERVALO',
            `Intervalo iniciado no serviço #${servicoId} às ${hora}.`
        );

        emitirAtualizacao(servicoId);

        return res.json({
            sucesso: true,
            mensagem: 'Intervalo iniciado.',
            hora,
            servico: result.rows[0]
        });

    } catch (err) {
        console.error('Erro ao iniciar intervalo:', err);

        return res.status(500).json({
            sucesso: false,
            erro:
                'Não foi possível iniciar o intervalo: ' +
                err.message
        });
    }
});


// Compatibilidade com INDEX antigo
app.post('/api/servicos/:id/iniciar-intervalo', async (req, res) => {
    const servicoId = Number(req.params.id);

    const email = normalizarEmail(
        req.body?.email ||
        req.body?.prestadorEmail
    );

    try {
        const servico = await buscarServico(servicoId);

        if (!servico) {
            return res.status(404).json({
                sucesso: false,
                erro: 'Serviço não encontrado.'
            });
        }

        if (!prestadorEhTitular(servico, email)) {
            return res.status(403).json({
                sucesso: false,
                erro: 'Somente o Titular pode iniciar o intervalo.'
            });
        }

        if (!servico.checkin_hora) {
            return res.status(409).json({
                sucesso: false,
                erro: 'Faça o check-in primeiro.'
            });
        }

        if (servico.em_intervalo) {
            return res.status(409).json({
                sucesso: false,
                erro: 'Intervalo já iniciado.'
            });
        }

        const hora = horaAtualRS();

        const result = await pool.query(
            `
            UPDATE servicos
            SET
                intervalo_inicio =
                    COALESCE(intervalo_inicio, $1),
                em_intervalo = TRUE,
                status = 'em_intervalo'
            WHERE id = $2
            RETURNING *
            `,
            [
                hora,
                servicoId
            ]
        );

        emitirAtualizacao(servicoId);

        return res.json({
            sucesso: true,
            hora,
            servico: result.rows[0]
        });

    } catch (err) {
        return res.status(500).json({
            sucesso: false,
            erro: err.message
        });
    }
});


// ============================================================
// VOLTAR DO INTERVALO
// ============================================================

app.post('/api/servicos/:id/intervalo/voltar', async (req, res) => {
    const servicoId = Number(req.params.id);

    const email = normalizarEmail(
        req.body?.email ||
        req.body?.prestadorEmail
    );

    try {
        const servico = await buscarServico(servicoId);

        if (!servico) {
            return res.status(404).json({
                sucesso: false,
                erro: 'Serviço não encontrado.'
            });
        }

        if (!prestadorEhTitular(servico, email)) {
            return res.status(403).json({
                sucesso: false,
                erro:
                    'Somente o Titular pode retornar do intervalo.'
            });
        }

        if (!servico.intervalo_inicio) {
            return res.status(409).json({
                sucesso: false,
                erro:
                    'O intervalo ainda não foi iniciado.'
            });
        }

        if (!servico.em_intervalo) {
            return res.status(409).json({
                sucesso: false,
                erro:
                    'O retorno do intervalo já foi registrado.'
            });
        }

        if (servico.checkout_hora) {
            return res.status(409).json({
                sucesso: false,
                erro:
                    'Esta jornada já foi finalizada.'
            });
        }

        const hora = horaAtualRS();

        const result = await pool.query(
            `
            UPDATE servicos
            SET
                intervalo_fim = $1,
                intervalo_retorno = $1,
                em_intervalo = FALSE,
                status = 'em_andamento'
            WHERE id = $2
            RETURNING *
            `,
            [
                hora,
                servicoId
            ]
        );

        await registrarAuditoria(
            email,
            'VOLTAR_INTERVALO',
            `Retorno do intervalo registrado no serviço #${servicoId} às ${hora}.`
        );

        emitirAtualizacao(servicoId);

        return res.json({
            sucesso: true,
            mensagem: 'Retorno do intervalo registrado.',
            hora,
            servico: result.rows[0]
        });

    } catch (err) {
        console.error('Erro ao voltar do intervalo:', err);

        return res.status(500).json({
            sucesso: false,
            erro:
                'Não foi possível registrar o retorno: ' +
                err.message
        });
    }
});


// Compatibilidade com INDEX antigo
app.post('/api/servicos/:id/voltar-intervalo', async (req, res) => {
    const servicoId = Number(req.params.id);

    const email = normalizarEmail(
        req.body?.email ||
        req.body?.prestadorEmail
    );

    try {
        const servico = await buscarServico(servicoId);

        if (!servico) {
            return res.status(404).json({
                sucesso: false,
                erro: 'Serviço não encontrado.'
            });
        }

        if (!prestadorEhTitular(servico, email)) {
            return res.status(403).json({
                sucesso: false,
                erro: 'Somente o Titular pode retornar do intervalo.'
            });
        }

        if (!servico.em_intervalo) {
            return res.status(409).json({
                sucesso: false,
                erro: 'Nenhum intervalo ativo.'
            });
        }

        const hora = horaAtualRS();

        const result = await pool.query(
            `
            UPDATE servicos
            SET
                intervalo_fim = $1,
                intervalo_retorno = $1,
                em_intervalo = FALSE,
                status = 'em_andamento'
            WHERE id = $2
            RETURNING *
            `,
            [
                hora,
                servicoId
            ]
        );

        emitirAtualizacao(servicoId);

        return res.json({
            sucesso: true,
            hora,
            servico: result.rows[0]
        });

    } catch (err) {
        return res.status(500).json({
            sucesso: false,
            erro: err.message
        });
    }
});


// ============================================================
// CÁLCULO DE TEMPO TRABALHADO
// ============================================================

function horarioParaSegundos(horario) {
    if (!horario) return null;

    const partes = String(horario)
        .split(':')
        .map(Number);

    if (partes.length < 2) return null;

    const horas = partes[0] || 0;
    const minutos = partes[1] || 0;
    const segundos = partes[2] || 0;

    return (
        horas * 3600 +
        minutos * 60 +
        segundos
    );
}

function calcularTempoTrabalhado(servico, checkoutHora) {
    const entrada =
        horarioParaSegundos(servico.checkin_hora);

    const saida =
        horarioParaSegundos(
            checkoutHora ||
            servico.checkout_hora
        );

    if (
        entrada === null ||
        saida === null
    ) {
        return {
            segundos: 0,
            minutos: 0,
            horasDecimal: 0,
            texto: '0h 00min'
        };
    }

    let total = saida - entrada;

    // Caso atravesse meia-noite.
    if (total < 0) {
        total += 24 * 3600;
    }

    const inicioIntervalo =
        horarioParaSegundos(servico.intervalo_inicio);

    const fimIntervalo =
        horarioParaSegundos(
            servico.intervalo_fim ||
            servico.intervalo_retorno
        );

    if (
        inicioIntervalo !== null &&
        fimIntervalo !== null
    ) {
        let duracaoIntervalo =
            fimIntervalo - inicioIntervalo;

        if (duracaoIntervalo < 0) {
            duracaoIntervalo += 24 * 3600;
        }

        total -= duracaoIntervalo;
    }

    total = Math.max(0, total);

    const horas = Math.floor(total / 3600);
    const minutos = Math.floor(
        (total % 3600) / 60
    );

    return {
        segundos: total,
        minutos: Math.floor(total / 60),
        horasDecimal:
            Number((total / 3600).toFixed(2)),
        texto:
            `${horas}h ${String(minutos).padStart(2, '0')}min`
    };
}


// ============================================================
// CHECK-OUT
// ============================================================

app.post('/api/servicos/:id/checkout', async (req, res) => {
    const servicoId = Number(req.params.id);

    const email = normalizarEmail(
        req.body?.email ||
        req.body?.prestadorEmail
    );

    try {
        const servico = await buscarServico(servicoId);

        if (!servico) {
            return res.status(404).json({
                sucesso: false,
                erro: 'Serviço não encontrado.'
            });
        }

        if (!prestadorEhTitular(servico, email)) {
            return res.status(403).json({
                sucesso: false,
                erro:
                    'Somente o Titular pode registrar a saída.'
            });
        }

        if (!servico.checkin_hora) {
            return res.status(409).json({
                sucesso: false,
                erro:
                    'Não é possível registrar saída sem check-in.'
            });
        }

        if (servico.checkout_hora) {
            return res.status(409).json({
                sucesso: false,
                erro:
                    `CHECK-OUT FINALIZADO às ${servico.checkout_hora}.`
            });
        }

        if (servico.em_intervalo) {
            return res.status(409).json({
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
            req.body?.lat ??
            '';

        const longitude =
            req.body?.longitude ??
            req.body?.lng ??
            '';

        if (!foto) {
            return res.status(400).json({
                sucesso: false,
                erro:
                    'É obrigatório tirar a foto de saída.'
            });
        }

        if (
            latitude === '' ||
            longitude === ''
        ) {
            return res.status(400).json({
                sucesso: false,
                erro:
                    'A localização é obrigatória para registrar a saída.'
            });
        }

        const hora = horaAtualRS();

        const tempo =
            calcularTempoTrabalhado(
                servico,
                hora
            );

        const valorServico =
            numeroRS(
                servico.valor_liquido ||
                servico.valor_diaria ||
                servico.valor
            );

        const result = await pool.query(
            `
            UPDATE servicos
            SET
                checkout_hora = $1,
                checkout_foto = $2,
                checkout_latitude = $3,
                checkout_longitude = $4,
                status_checkin = 'finalizado',
                status = 'finalizado',
                em_intervalo = FALSE
            WHERE id = $5
            RETURNING *
            `,
            [
                hora,
                foto,
                String(latitude),
                String(longitude),
                servicoId
            ]
        );

        await registrarLedger(
            servicoId,
            email,
            'SERVICO_FINALIZADO',
            valorServico
        );

        await registrarAuditoria(
            email,
            'CHECKOUT',
            `Saída registrada no serviço #${servicoId} às ${hora}. Total trabalhado: ${tempo.texto}.`
        );

        emitirAtualizacao(servicoId);

        io.emit('servico_finalizado', {
            servicoId,
            prestadorEmail: email,
            checkoutHora: hora,
            totalTrabalhado: tempo.texto,
            valor: valorServico
        });

        return res.json({
            sucesso: true,
            mensagem:
                'Serviço finalizado com sucesso.',
            hora,
            totalTrabalhado: tempo.texto,
            minutosTrabalhados: tempo.minutos,
            horasTrabalhadas: tempo.horasDecimal,
            valor: valorServico,
            servico: result.rows[0]
        });

    } catch (err) {
        console.error('Erro no check-out:', err);

        return res.status(500).json({
            sucesso: false,
            erro:
                'Não foi possível fazer o check-out: ' +
                err.message
        });
    }
});


// ============================================================
// VALIDAR SERVIÇO PELA EMPRESA
// ============================================================

app.post('/api/servicos/:id/validar', async (req, res) => {
    const servicoId = Number(req.params.id);

    const email = normalizarEmail(
        req.body?.email ||
        req.body?.empresaEmail
    );

    try {
        const servico = await buscarServico(servicoId);

        if (!servico) {
            return res.status(404).json({
                sucesso: false,
                erro: 'Serviço não encontrado.'
            });
        }

        if (
            servico.empresa_email &&
            !empresaEhResponsavel(servico, email)
        ) {
            return res.status(403).json({
                sucesso: false,
                erro:
                    'Somente a empresa responsável pode validar este serviço.'
            });
        }

        if (!servico.checkout_hora) {
            return res.status(409).json({
                sucesso: false,
                erro:
                    'O prestador ainda não realizou o check-out.'
            });
        }

        const result = await pool.query(
            `
            UPDATE servicos
            SET
                validado_empresa = TRUE,
                validado_em = CURRENT_TIMESTAMP,
                status = 'validado'
            WHERE id = $1
            RETURNING *
            `,
            [servicoId]
        );

        await registrarAuditoria(
            email,
            'VALIDAR_SERVICO',
            `Empresa validou o serviço #${servicoId}.`
        );

        emitirAtualizacao(servicoId);

        return res.json({
            sucesso: true,
            mensagem:
                'Serviço validado pela empresa.',
            servico: result.rows[0]
        });

    } catch (err) {
        console.error('Erro ao validar serviço:', err);

        return res.status(500).json({
            sucesso: false,
            erro:
                'Erro ao validar serviço: ' +
                err.message
        });
    }
});


// ============================================================
// AUTORIZAR PAGAMENTO
// ============================================================

app.post('/api/servicos/:id/autorizar-pagamento', async (req, res) => {
    const servicoId = Number(req.params.id);

    const email = normalizarEmail(
        req.body?.email ||
        req.body?.empresaEmail
    );

    try {
        const servico = await buscarServico(servicoId);

        if (!servico) {
            return res.status(404).json({
                sucesso: false,
                erro: 'Serviço não encontrado.'
            });
        }

        if (
            servico.empresa_email &&
            !empresaEhResponsavel(servico, email)
        ) {
            return res.status(403).json({
                sucesso: false,
                erro:
                    'Somente a empresa responsável pode autorizar o pagamento.'
            });
        }

        if (!servico.checkout_hora) {
            return res.status(409).json({
                sucesso: false,
                erro:
                    'O serviço precisa estar finalizado antes da autorização de pagamento.'
            });
        }

        const valor =
            numeroRS(
                servico.valor_liquido ||
                servico.valor_diaria ||
                servico.valor
            );

        const result = await pool.query(
            `
            UPDATE servicos
            SET
                pagamento_autorizado = TRUE,
                pagamento_autorizado_em =
                    CURRENT_TIMESTAMP
            WHERE id = $1
            RETURNING *
            `,
            [servicoId]
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
                $1,$2,$3,$4,$5,
                'AUTORIZADO',
                CURRENT_TIMESTAMP
            )
            `,
            [
                servicoId,
                servico.empresa_email || email,
                servico.prestador_email,
                valor,
                servico.forma_pgto || 'Pix'
            ]
        );

        await registrarLedger(
            servicoId,
            email,
            'PAGAMENTO_AUTORIZADO',
            valor
        );

        await registrarAuditoria(
            email,
            'AUTORIZAR_PAGAMENTO',
            `Pagamento do serviço #${servicoId} autorizado.`
        );

        emitirAtualizacao(servicoId);

        return res.json({
            sucesso: true,
            mensagem:
                'Pagamento autorizado.',
            valor,
            servico: result.rows[0]
        });

    } catch (err) {
        console.error(
            'Erro ao autorizar pagamento:',
            err
        );

        return res.status(500).json({
            sucesso: false,
            erro:
                'Erro ao autorizar pagamento: ' +
                err.message
        });
    }
});


// ============================================================
// REGISTRAR PAGAMENTO
// ============================================================

app.post('/api/servicos/:id/pagamento', async (req, res) => {
    const servicoId = Number(req.params.id);

    const email = normalizarEmail(
        req.body?.email ||
        req.body?.empresaEmail
    );

    try {
        const servico = await buscarServico(servicoId);

        if (!servico) {
            return res.status(404).json({
                sucesso: false,
                erro: 'Serviço não encontrado.'
            });
        }

        const valor =
            numeroRS(
                req.body?.valor ||
                servico.valor_liquido ||
                servico.valor_diaria ||
                servico.valor
            );

        const comprovante =
            req.body?.comprovante ||
            req.body?.arquivo ||
            '';

        const formaPagamento =
            req.body?.formaPagamento ||
            req.body?.forma_pagamento ||
            servico.forma_pgto ||
            'Pix';

        const result = await pool.query(
            `
            UPDATE servicos
            SET
                pagamento_realizado = TRUE,
                pagamento_realizado_em =
                    CURRENT_TIMESTAMP,
                comprovante_pagamento =
                    CASE
                        WHEN $1 <> ''
                        THEN TRUE
                        ELSE comprovante_pagamento
                    END,
                comprovante_pagamento_arquivo =
                    CASE
                        WHEN $1 <> ''
                        THEN $1
                        ELSE comprovante_pagamento_arquivo
                    END,
                status = 'pago'
            WHERE id = $2
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
                $1,$2,$3,$4,$5,
                'PAGO',
                $6,
                CURRENT_TIMESTAMP
            )
            `,
            [
                servicoId,
                servico.empresa_email || email,
                servico.prestador_email,
                valor,
                formaPagamento,
                comprovante
            ]
        );

        await registrarLedger(
            servicoId,
            email,
            'PAGAMENTO_REALIZADO',
            valor
        );

        await registrarAuditoria(
            email,
            'REGISTRAR_PAGAMENTO',
            `Pagamento do serviço #${servicoId} registrado.`
        );

        emitirAtualizacao(servicoId);

        return res.json({
            sucesso: true,
            mensagem:
                'Pagamento registrado com sucesso.',
            valor,
            servico: result.rows[0]
        });

    } catch (err) {
        console.error(
            'Erro ao registrar pagamento:',
            err
        );

        return res.status(500).json({
            sucesso: false,
            erro:
                'Erro ao registrar pagamento: ' +
                err.message
        });
    }
});
// ============================================================
// COMPROVANTE DE PAGAMENTO
// ============================================================

app.post(
    '/api/servicos/:id/comprovante-pagamento',

    upload.single('arquivo'),

    async (req, res) => {

        const servicoId =
            Number(req.params.id);

        try {

            const servico =
                await buscarServico(servicoId);

            if (!servico) {

                return res.status(404).json({
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

            if (
                servico.empresa_email &&
                !empresaEhResponsavel(
                    servico,
                    empresaEmail
                )
            ) {

                return res.status(403).json({
                    erro:
                        'Somente a empresa pode enviar o comprovante.'
                });
            }

            if (
                !servico.pagamento_autorizado
            ) {

                return res.status(400).json({
                    erro:
                        'O pagamento ainda não foi autorizado.'
                });
            }

            let arquivo = '';
            let nomeArquivo = 'comprovante';

            if (req.file) {

                arquivo =
                    `data:${req.file.mimetype};base64,${
                        req.file.buffer.toString('base64')
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

                return res.status(400).json({
                    erro:
                        'Selecione o comprovante.'
                });
            }

            await pool.query(
                `
                UPDATE servicos
                SET
                    comprovante_pagamento = TRUE,
                    comprovante_pagamento_arquivo = $1,
                    pagamento_realizado = TRUE,
                    pagamento_realizado_em = CURRENT_TIMESTAMP,
                    status = 'pago'
                WHERE id = $2
                `,
                [
                    arquivo,
                    servicoId
                ]
            );

            await pool.query(
                `
                UPDATE pagamentos
                SET
                    comprovante = $1,
                    status = 'PAGO',
                    pago_em = CURRENT_TIMESTAMP
                WHERE
                    servico_id = $2
                AND
                    LOWER(prestador_email)
                    =
                    LOWER($3)
                `,
                [
                    arquivo,
                    servicoId,
                    servico.prestador_email
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
                    servico.empresa_email,
                    servico.prestador_email,
                    nomeArquivo,
                    arquivo
                ]
            );

            await registrarLedger(
                servicoId,
                servico.prestador_email,
                'REPASSE_PRESTADOR',
                servico.valor_liquido
            );

            await registrarAuditoria(
                empresaEmail,
                'COMPROVANTE_PAGAMENTO',
                `Comprovante do serviço #${servicoId} arquivado.`
            );

            emitirAtualizacao(servicoId);

            io.emit(
                'pagamento_atualizado',
                {
                    servicoId
                }
            );

            return res.json({
                sucesso: true,
                mensagem:
                    'Pagamento registrado e comprovante arquivado.'
            });

        } catch (err) {

            console.error(
                'Erro no comprovante de pagamento:',
                err
            );

            return res.status(500).json({
                erro:
                    'Erro ao registrar comprovante.'
            });
        }
    }
);


// ============================================================
// HISTÓRICO FINANCEIRO DO PRESTADOR
// ============================================================

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
                        LOWER(prestador_email)
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

            console.error(
                'Erro no histórico de pagamentos:',
                err
            );

            return res.status(500).json({
                erro:
                    'Erro ao carregar pagamentos.'
            });
        }
    }
);


// Compatibilidade com INDEX mais novo
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
                        LOWER(prestador_email)
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

            const pagamentos =
                resultado.rows;

            const totalPago =
                pagamentos
                    .filter(
                        p =>
                            String(
                                p.status ||
                                ''
                            )
                                .toUpperCase()
                            ===
                            'PAGO'
                    )
                    .reduce(
                        (total, p) =>
                            total +
                            numeroRS(p.valor),
                        0
                    );

            const totalPendente =
                pagamentos
                    .filter(
                        p =>
                            String(
                                p.status ||
                                ''
                            )
                                .toUpperCase()
                            !==
                            'PAGO'
                    )
                    .reduce(
                        (total, p) =>
                            total +
                            numeroRS(p.valor),
                        0
                    );

            return res.json({
                sucesso: true,

                pagamentos,

                resumo: {
                    totalPago,
                    totalPendente
                }
            });

        } catch (err) {

            console.error(
                'Erro pagamentos prestador:',
                err
            );

            return res.status(500).json({
                erro:
                    'Erro ao carregar pagamentos.'
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
            Number(req.params.id);

        try {

            const arquivo =
                req.file;

            const dadosNota =
                req.body?.notaFiscal ||
                (
                    arquivo
                        ?
                        `data:${arquivo.mimetype};base64,${
                            arquivo.buffer.toString('base64')
                        }`
                        :
                        ''
                );

            if (!dadosNota) {

                return res.status(400).json({
                    erro:
                        'Nenhum arquivo de nota fiscal enviado.'
                });
            }

            await pool.query(
                `
                UPDATE servicos
                SET
                    nota_oficial = $1
                WHERE id = $2
                `,
                [
                    dadosNota,
                    servicoId
                ]
            );

            await registrarAuditoria(
                'sistema',
                'ENVIO_NOTA_FISCAL',
                `Nota fiscal enviada para o serviço #${servicoId}.`
            );

            emitirAtualizacao(servicoId);

            return res.json({
                sucesso: true,
                mensagem:
                    'Nota fiscal enviada com sucesso!'
            });

        } catch (err) {

            console.error(
                'Erro ao enviar nota fiscal:',
                err
            );

            return res.status(500).json({
                erro:
                    'Erro ao processar a nota fiscal.'
            });
        }
    }
);


// ============================================================
// DOCUMENTOS DO SERVIÇO
// ============================================================

app.post(
    '/api/servicos/:id/documentos',

    upload.single('arquivo'),

    async (req, res) => {

        const servicoId =
            Number(req.params.id);

        try {

            const servico =
                await buscarServico(
                    servicoId
                );

            if (!servico) {

                return res.status(404).json({
                    sucesso: false,
                    erro:
                        'Serviço não encontrado.'
                });
            }

            let arquivo = '';
            let nome = '';
            let categoria =
                String(
                    req.body?.categoria ||
                    'DOCUMENTO'
                )
                    .toUpperCase();

            if (req.file) {

                arquivo =
                    `data:${req.file.mimetype};base64,${
                        req.file.buffer.toString(
                            'base64'
                        )
                    }`;

                nome =
                    req.file.originalname ||
                    'documento';

            } else {

                arquivo =
                    String(
                        req.body?.arquivo ||
                        ''
                    );

                nome =
                    String(
                        req.body?.nome ||
                        'documento'
                    );
            }

            if (!arquivo) {

                return res.status(400).json({
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

            await registrarAuditoria(
                normalizarEmail(
                    req.body?.email
                ) ||
                servico.empresa_email ||
                'sistema',

                'DOCUMENTO_SERVICO',

                `Documento ${nome} vinculado ao serviço #${servicoId}.`
            );

            emitirAtualizacao(
                servicoId
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
                'Erro ao arquivar documento:',
                err
            );

            return res.status(500).json({
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
                Number(req.params.id);

            const resultado =
                await pool.query(
                    `
                    SELECT *
                    FROM documentos_rs
                    WHERE servico_id = $1
                    ORDER BY criado_em DESC
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

            console.error(
                'Erro documentos serviço:',
                err
            );

            return res.status(500).json({
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
            Number(req.params.id);

        try {

            const servico =
                await buscarServico(
                    servicoId
                );

            if (!servico) {

                return res.status(404).json({
                    sucesso: false,
                    erro:
                        'Serviço não encontrado.'
                });
            }

            let arquivo = '';

            if (req.file) {

                arquivo =
                    `data:${req.file.mimetype};base64,${
                        req.file.buffer.toString(
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

                return res.status(400).json({
                    sucesso: false,
                    erro:
                        'Envie o contrato assinado.'
                });
            }

            await pool.query(
                `
                UPDATE servicos
                SET
                    contrato_assinado = $1,
                    contrato_assinado_em =
                        CURRENT_TIMESTAMP
                WHERE id = $2
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
                    $1,$2,$3,
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

            await registrarAuditoria(
                servico.prestador_email ||
                'sistema',

                'CONTRATO_ASSINADO',

                `Contrato assinado do serviço #${servicoId} arquivado.`
            );

            emitirAtualizacao(
                servicoId
            );

            return res.json({
                sucesso: true,
                mensagem:
                    'Contrato assinado arquivado com sucesso.'
            });

        } catch (err) {

            console.error(
                'Erro contrato assinado:',
                err
            );

            return res.status(500).json({
                sucesso: false,
                erro:
                    'Erro ao arquivar contrato assinado.'
            });
        }
    }
);


// ============================================================
// PAINEL DA EMPRESA
// ============================================================

app.get(
    '/api/empresa/:email/painel',

    async (req, res) => {

        try {

            const empresaEmail =
                normalizarEmail(
                    req.params.email
                );

            const servicosRes =
                await pool.query(
                    `
                    SELECT *
                    FROM servicos
                    WHERE
                        LOWER(empresa_email)
                        =
                        LOWER($1)
                    ORDER BY
                        id DESC
                    `,
                    [
                        empresaEmail
                    ]
                );

            const pagamentosRes =
                await pool.query(
                    `
                    SELECT *
                    FROM pagamentos
                    WHERE
                        LOWER(empresa_email)
                        =
                        LOWER($1)
                    ORDER BY
                        criado_em DESC
                    `,
                    [
                        empresaEmail
                    ]
                );

            const documentosRes =
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
                        LOWER(empresa_email)
                        =
                        LOWER($1)
                    ORDER BY
                        criado_em DESC
                    `,
                    [
                        empresaEmail
                    ]
                );

            const servicos =
                servicosRes.rows;

            const trabalhadores =
                new Map();

            for (
                const servico
                of servicos
            ) {

                if (
                    !servico.prestador_email
                ) {

                    continue;
                }

                const chave =
                    normalizarEmail(
                        servico.prestador_email
                    );

                if (
                    !trabalhadores.has(
                        chave
                    )
                ) {

                    trabalhadores.set(
                        chave,
                        {
                            email:
                                servico.prestador_email,

                            nome:
                                servico.prestador_nome ||
                                servico.prestador_email,

                            servicos:
                                0,

                            concluidos:
                                0,

                            valorTotal:
                                0
                        }
                    );
                }

                const trabalhador =
                    trabalhadores.get(
                        chave
                    );

                trabalhador.servicos++;

                if (
                    servico.checkout_hora
                ) {

                    trabalhador.concluidos++;
                }

                trabalhador.valorTotal +=
                    numeroRS(
                        servico.valor_liquido ||
                        servico.valor_total ||
                        servico.valor
                    );
            }

            return res.json({
                sucesso: true,

                empresaEmail,

                resumo: {

                    totalServicos:
                        servicos.length,

                    trabalhadores:
                        trabalhadores.size,

                    emAndamento:
                        servicos.filter(
                            s =>
                                s.checkin_hora &&
                                !s.checkout_hora
                        ).length,

                    aguardandoValidacao:
                        servicos.filter(
                            s =>
                                s.checkout_hora &&
                                !s.validado_empresa
                        ).length,

                    pagamentosPendentes:
                        servicos.filter(
                            s =>
                                s.validado_empresa &&
                                !s.pagamento_realizado
                        ).length
                },

                trabalhadores:
                    Array.from(
                        trabalhadores.values()
                    ),

                servicos,

                pagamentos:
                    pagamentosRes.rows,

                documentos:
                    documentosRes.rows
            });

        } catch (err) {

            console.error(
                'Erro no painel da empresa:',
                err
            );

            return res.status(500).json({
                erro:
                    'Erro ao carregar painel da empresa.'
            });
        }
    }
);


// ============================================================
// ARQUIVO DIGITAL
// ============================================================

app.get(
    '/api/empresa/:email/arquivo',

    async (req, res) => {

        try {

            const empresaEmail =
                normalizarEmail(
                    req.params.email
                );

            const [
                servicosRes,
                documentosRes,
                pagamentosRes
            ] =
                await Promise.all([

                    pool.query(
                        `
                        SELECT *
                        FROM servicos
                        WHERE
                            LOWER(empresa_email)
                            =
                            LOWER($1)
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
                        FROM documentos_rs
                        WHERE
                            LOWER(empresa_email)
                            =
                            LOWER($1)
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
                        FROM pagamentos
                        WHERE
                            LOWER(empresa_email)
                            =
                            LOWER($1)
                        ORDER BY
                            criado_em DESC
                        `,
                        [
                            empresaEmail
                        ]
                    )
                ]);

            const servicos =
                servicosRes.rows;

            const documentos =
                documentosRes.rows;

            const pagamentos =
                pagamentosRes.rows;

            const trabalhadoresMap =
                new Map();

            servicos.forEach(
                servico => {

                    if (
                        !servico.prestador_email
                    ) {

                        return;
                    }

                    const chave =
                        normalizarEmail(
                            servico.prestador_email
                        );

                    if (
                        trabalhadoresMap.has(
                            chave
                        )
                    ) {

                        return;
                    }

                    trabalhadoresMap.set(
                        chave,
                        {
                            nome:
                                servico.prestador_nome ||
                                servico.prestador_email,

                            email:
                                servico.prestador_email,

                            whatsapp:
                                servico.prestador_whatsapp ||
                                '',

                            pix:
                                servico.prestador_pix ||
                                ''
                        }
                    );
                }
            );

            const contratos =
                documentos.filter(
                    documento =>
                        String(
                            documento.categoria ||
                            ''
                        )
                            .toUpperCase()
                            .includes(
                                'CONTRATO'
                            )
                );

            const comprovantes =
                documentos.filter(
                    documento =>
                        String(
                            documento.categoria ||
                            ''
                        )
                            .toUpperCase()
                            .includes(
                                'COMPROVANTE'
                            )
                );

            const escalas =
                servicos.filter(
                    servico =>
                        Boolean(
                            servico.prestador_email
                        )
                );

            const servicosRealizados =
                servicos.filter(
                    servico =>
                        Boolean(
                            servico.checkout_hora
                        )
                );

            return res.json({
                sucesso: true,

                empresaEmail,

                pastas: {

                    trabalhadores:
                        Array.from(
                            trabalhadoresMap.values()
                        ),

                    contratos,

                    servicos:
                        servicosRealizados,

                    escalas,

                    pagamentos,

                    comprovantes,

                    historico:
                        servicos,

                    documentos
                }
            });

        } catch (err) {

            console.error(
                'Erro no Arquivo Digital:',
                err
            );

            return res.status(500).json({
                sucesso: false,
                erro:
                    'Erro ao carregar Arquivo Digital.'
            });
        }
    }
);


// ============================================================
// HISTÓRICO DO PRESTADOR
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
                        LOWER(prestador_email)
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

            console.error(
                'Erro histórico prestador:',
                err
            );

            return res.status(500).json({
                sucesso: false,
                erro:
                    'Erro ao carregar histórico.'
            });
        }
    }
);


// ============================================================
// BUSCAR SERVIÇO INDIVIDUAL
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

                return res.status(404).json({
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

            return res.status(500).json({
                sucesso: false,
                erro:
                    'Erro ao buscar serviço.'
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

                return res.status(404).json({
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

                return res.status(403).json({
                    sucesso: false,
                    erro:
                        'Somente a empresa responsável pode cancelar o serviço.'
                });
            }

            if (
                servico.checkout_hora
            ) {

                return res.status(409).json({
                    sucesso: false,
                    erro:
                        'Não é possível cancelar um serviço já finalizado.'
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
                    WHERE id = $2
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
                `Serviço #${servicoId} cancelado. Motivo: ${motivo}`
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
                'Erro ao cancelar serviço:',
                err
            );

            return res.status(500).json({
                sucesso: false,
                erro:
                    'Erro ao cancelar serviço.'
            });
        }
    }
);
// ============================================================
// PARTE 4 — FINAL
// CHAT + CLIENTES FIXOS + JORNADA + DOCUMENTOS + SOCKET + RENDER
// ============================================================


// ============================================================
// CHAT — CRIAR / LOCALIZAR CONVERSA DO SERVIÇO
// ============================================================

async function garantirConversaServico(servico) {
    if (
        !servico ||
        !servico.id ||
        !servico.empresa_email ||
        !servico.prestador_email
    ) {
        return null;
    }

    const empresaEmail =
        normalizarEmail(servico.empresa_email);

    const prestadorEmail =
        normalizarEmail(servico.prestador_email);

    const existente = await pool.query(
        `
        SELECT *
        FROM conversas
        WHERE servico_id = $1
          AND LOWER(empresa_email) = LOWER($2)
          AND LOWER(prestador_email) = LOWER($3)
        LIMIT 1
        `,
        [
            servico.id,
            empresaEmail,
            prestadorEmail
        ]
    );

    if (existente.rows.length) {
        return existente.rows[0];
    }

    const criada = await pool.query(
        `
        INSERT INTO conversas (
            servico_id,
            empresa_email,
            prestador_email,
            ativo
        )
        VALUES ($1,$2,$3,TRUE)
        ON CONFLICT (
            servico_id,
            empresa_email,
            prestador_email
        )
        DO UPDATE SET
            ativo = TRUE,
            atualizado_em = CURRENT_TIMESTAMP
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
// ABRIR CONVERSA PELO SERVIÇO
// ============================================================

app.get(
    '/api/servicos/:id/conversa',

    async (req, res) => {
        try {
            const servicoId =
                Number(req.params.id);

            const email =
                normalizarEmail(
                    req.query?.email
                );

            const servico =
                await buscarServico(servicoId);

            if (!servico) {
                return res.status(404).json({
                    sucesso: false,
                    erro:
                        'Serviço não encontrado.'
                });
            }

            if (!servico.prestador_email) {
                return res.status(400).json({
                    sucesso: false,
                    erro:
                        'Este serviço ainda não possui Titular.'
                });
            }

            const autorizado =
                normalizarEmail(
                    servico.empresa_email
                ) === email
                ||
                normalizarEmail(
                    servico.prestador_email
                ) === email;

            if (
                email &&
                !autorizado
            ) {
                return res.status(403).json({
                    sucesso: false,
                    erro:
                        'Você não participa desta conversa.'
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
                'Erro ao abrir conversa:',
                err
            );

            return res.status(500).json({
                sucesso: false,
                erro:
                    'Erro ao abrir conversa.'
            });
        }
    }
);


// ============================================================
// LISTAR CONVERSAS DE UM USUÁRIO
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
                        c.*,

                        s.titulo
                            AS servico_titulo,

                        s.empresa_nome,

                        s.prestador_nome,

                        (
                            SELECT m.mensagem
                            FROM mensagens_chat m
                            WHERE m.conversa_id = c.id
                            ORDER BY
                                m.criado_em DESC,
                                m.id DESC
                            LIMIT 1
                        ) AS ultima_mensagem,

                        (
                            SELECT m.criado_em
                            FROM mensagens_chat m
                            WHERE m.conversa_id = c.id
                            ORDER BY
                                m.criado_em DESC,
                                m.id DESC
                            LIMIT 1
                        ) AS ultima_mensagem_em,

                        (
                            SELECT COUNT(*)::int
                            FROM mensagens_chat m
                            WHERE
                                m.conversa_id = c.id
                            AND
                                LOWER(
                                    m.destinatario_email
                                )
                                =
                                LOWER($1)
                            AND
                                m.lida = FALSE
                        ) AS nao_lidas

                    FROM conversas c

                    LEFT JOIN servicos s
                      ON s.id = c.servico_id

                    WHERE
                        LOWER(c.empresa_email)
                        =
                        LOWER($1)

                    OR
                        LOWER(c.prestador_email)
                        =
                        LOWER($1)

                    ORDER BY
                        COALESCE(
                            (
                                SELECT MAX(
                                    m.criado_em
                                )
                                FROM mensagens_chat m
                                WHERE
                                    m.conversa_id
                                    =
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

            return res.json({
                sucesso: true,
                conversas:
                    resultado.rows
            });

        } catch (err) {
            console.error(
                'Erro ao listar conversas:',
                err
            );

            return res.status(500).json({
                sucesso: false,
                erro:
                    'Erro ao carregar conversas.'
            });
        }
    }
);


// ============================================================
// MENSAGENS DA CONVERSA
// ============================================================

app.get(
    '/api/chat/conversas/:id/mensagens',

    async (req, res) => {
        try {
            const conversaId =
                Number(req.params.id);

            const email =
                normalizarEmail(
                    req.query?.email
                );

            const conversaRes =
                await pool.query(
                    `
                    SELECT *
                    FROM conversas
                    WHERE id = $1
                    LIMIT 1
                    `,
                    [
                        conversaId
                    ]
                );

            const conversa =
                conversaRes.rows[0];

            if (!conversa) {
                return res.status(404).json({
                    sucesso: false,
                    erro:
                        'Conversa não encontrada.'
                });
            }

            if (email) {
                const participa =
                    normalizarEmail(
                        conversa.empresa_email
                    ) === email
                    ||
                    normalizarEmail(
                        conversa.prestador_email
                    ) === email;

                if (!participa) {
                    return res.status(403).json({
                        sucesso: false,
                        erro:
                            'Acesso não autorizado.'
                    });
                }
            }

            const mensagens =
                await pool.query(
                    `
                    SELECT *
                    FROM mensagens_chat
                    WHERE conversa_id = $1
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
                    mensagens.rows
            });

        } catch (err) {
            console.error(
                'Erro mensagens conversa:',
                err
            );

            return res.status(500).json({
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
                Number(req.params.id);

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
                return res.status(400).json({
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
                    WHERE id = $1
                    LIMIT 1
                    `,
                    [
                        conversaId
                    ]
                );

            const conversa =
                conversaRes.rows[0];

            if (!conversa) {
                return res.status(404).json({
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
                remetente !== empresaEmail &&
                remetente !== prestadorEmail
            ) {
                return res.status(403).json({
                    sucesso: false,
                    erro:
                        'Você não participa desta conversa.'
                });
            }

            const destinatario =
                remetente === empresaEmail
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
                        $1,$2,$3,$4,$5,
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
                WHERE id = $1
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
                'Erro ao enviar mensagem:',
                err
            );

            return res.status(500).json({
                sucesso: false,
                erro:
                    'Erro ao enviar mensagem.'
            });
        }
    }
);


// ============================================================
// MARCAR CONVERSA COMO LIDA
// ============================================================

app.post(
    '/api/chat/conversas/:id/lida',

    async (req, res) => {
        try {
            const conversaId =
                Number(req.params.id);

            const email =
                normalizarEmail(
                    req.body?.email
                );

            await pool.query(
                `
                UPDATE mensagens_chat
                SET lida = TRUE
                WHERE conversa_id = $1
                  AND LOWER(destinatario_email)
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
            return res.status(500).json({
                sucesso: false,
                erro:
                    'Erro ao atualizar leitura.'
            });
        }
    }
);


// ============================================================
// QUANTIDADE DE MENSAGENS NÃO LIDAS
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
                    FROM mensagens_chat
                    WHERE
                        LOWER(destinatario_email)
                        =
                        LOWER($1)
                    AND
                        lida = FALSE
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
            return res.status(500).json({
                sucesso: false,
                erro:
                    'Erro ao consultar mensagens.'
            });
        }
    }
);


// ============================================================
// GESTÃO DE JORNADA — CLIENTES FIXOS DO GRUPO RS
// ============================================================

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


async function criarTabelasJornadaClientes() {
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

            ativo BOOLEAN DEFAULT TRUE,

            criado_por TEXT,

            criado_em TIMESTAMP
                DEFAULT CURRENT_TIMESTAMP,

            atualizado_em TIMESTAMP
                DEFAULT CURRENT_TIMESTAMP
        );


        CREATE TABLE IF NOT EXISTS clientes_rs_colaboradores (
            id SERIAL PRIMARY KEY,

            cliente_id INTEGER NOT NULL
                REFERENCES clientes_rs(id)
                ON DELETE CASCADE,

            colaborador_email TEXT NOT NULL,

            colaborador_nome TEXT NOT NULL,

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

            UNIQUE(
                cliente_id,
                colaborador_email
            )
        );


        CREATE TABLE IF NOT EXISTS jornadas_clientes (
            id SERIAL PRIMARY KEY,

            cliente_id INTEGER NOT NULL
                REFERENCES clientes_rs(id)
                ON DELETE CASCADE,

            colaborador_vinculo_id INTEGER
                REFERENCES clientes_rs_colaboradores(id)
                ON DELETE SET NULL,

            colaborador_email TEXT NOT NULL,

            colaborador_nome TEXT NOT NULL,

            funcao TEXT,

            data DATE NOT NULL,

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

            UNIQUE(
                cliente_id,
                colaborador_email,
                data
            )
        );


        CREATE TABLE IF NOT EXISTS jornadas_clientes_documentos (
            id SERIAL PRIMARY KEY,

            jornada_id INTEGER NOT NULL
                REFERENCES jornadas_clientes(id)
                ON DELETE CASCADE,

            tipo TEXT
                DEFAULT 'DOCUMENTO',

            nome TEXT NOT NULL,

            mime TEXT
                DEFAULT 'application/pdf',

            arquivo BYTEA NOT NULL,

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

            cliente_id INTEGER NOT NULL
                REFERENCES clientes_rs(id)
                ON DELETE CASCADE,

            data DATE NOT NULL,

            confirmado BOOLEAN
                DEFAULT TRUE,

            confirmado_por TEXT,

            confirmado_em TIMESTAMPTZ
                DEFAULT CURRENT_TIMESTAMP,

            observacoes TEXT,

            UNIQUE(
                cliente_id,
                data
            )
        );


        CREATE INDEX IF NOT EXISTS
            idx_clientes_rs_nome
        ON clientes_rs(nome);


        CREATE INDEX IF NOT EXISTS
            idx_clientes_colaborador_email
        ON clientes_rs_colaboradores(
            LOWER(colaborador_email)
        );


        CREATE INDEX IF NOT EXISTS
            idx_jornadas_clientes_data
        ON jornadas_clientes(
            cliente_id,
            data
        );


        CREATE INDEX IF NOT EXISTS
            idx_jornadas_clientes_email
        ON jornadas_clientes(
            LOWER(colaborador_email),
            data
        );
    `);

    console.log(
        '✅ Gestão de Jornada dos Clientes verificada.'
    );
}


// ============================================================
// GARANTIR JORNADA DO DIA
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
            v.cliente_id,
            v.id,
            LOWER(v.colaborador_email),
            v.colaborador_nome,
            v.funcao,
            $2::date,
            v.horario_previsto,
            v.valor_tipo,
            v.valor_base

        FROM clientes_rs_colaboradores v

        WHERE
            v.cliente_id = $1

        AND
            v.ativo = TRUE

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
// RECALCULAR HORAS / VALOR
// ============================================================

async function recalcularJornadaCliente(
    jornadaId
) {
    const resultado =
        await pool.query(
            `
            SELECT *
            FROM jornadas_clientes
            WHERE id = $1
            LIMIT 1
            `,
            [
                jornadaId
            ]
        );

    const jornada =
        resultado.rows[0];

    if (!jornada) {
        return null;
    }

    let totalMinutos = 0;

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

    const valorGerado =
        String(
            jornada.valor_tipo ||
            ''
        )
            .toLowerCase()
        ===
        'hora'

            ?
            Number(
                (
                    totalHoras *
                    valorBase
                )
                    .toFixed(2)
            )

            :
            (
                jornada.saida_em
                    ?
                    valorBase
                    :
                    0
            );

    const atualizado =
        await pool.query(
            `
            UPDATE jornadas_clientes
            SET
                total_minutos = $1,

                total_horas = $2,

                valor_gerado = $3,

                atualizado_em =
                    CURRENT_TIMESTAMP

            WHERE id = $4

            RETURNING *
            `,
            [
                totalMinutos,
                totalHoras,
                valorGerado,
                jornadaId
            ]
        );

    return atualizado.rows[0];
}


// ============================================================
// BUSCAR JORNADA INDIVIDUAL
// ============================================================

async function buscarJornadaCliente(
    jornadaId
) {
    const resultado =
        await pool.query(
            `
            SELECT
                j.*,

                c.nome
                    AS cliente_nome,

                c.endereco
                    AS cliente_endereco,

                c.cidade
                    AS cliente_cidade,

                c.uf
                    AS cliente_uf,

                c.latitude
                    AS cliente_latitude,

                c.longitude
                    AS cliente_longitude,

                c.responsavel_nome,

                c.responsavel_email

            FROM jornadas_clientes j

            JOIN clientes_rs c
              ON c.id =
                 j.cliente_id

            WHERE j.id = $1

            LIMIT 1
            `,
            [
                jornadaId
            ]
        );

    return (
        resultado.rows[0] ||
        null
    );
}


// ============================================================
// CLIENTES
// ============================================================

app.get(
    '/api/jornada-clientes',

    async (req, res) => {
        try {
            const resultado =
                await pool.query(`
                    SELECT
                        c.*,

                        COUNT(v.id)
                        FILTER (
                            WHERE
                                v.ativo = TRUE
                        )::int
                        AS colaboradores_ativos

                    FROM clientes_rs c

                    LEFT JOIN
                        clientes_rs_colaboradores v

                      ON
                        v.cliente_id =
                        c.id

                    WHERE
                        c.ativo = TRUE

                    GROUP BY
                        c.id

                    ORDER BY
                        c.nome
                `);

            return res.json({
                sucesso: true,
                clientes:
                    resultado.rows
            });

        } catch (err) {
            console.error(
                'Erro clientes Jornada:',
                err
            );

            return res.status(500).json({
                sucesso: false,
                erro:
                    'Erro ao carregar clientes.'
            });
        }
    }
);


app.post(
    '/api/jornada-clientes',

    async (req, res) => {
        try {
            const d =
                req.body || {};

            const nome =
                String(
                    d.nome ||
                    ''
                )
                    .trim();

            if (!nome) {
                return res.status(400).json({
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

                        d.cnpj ||
                        null,

                        d.responsavel_nome ||
                        null,

                        normalizarEmail(
                            d.responsavel_email
                        ) ||
                        null,

                        d.responsavel_whatsapp ||
                        null,

                        d.endereco ||
                        null,

                        d.cidade ||
                        null,

                        d.uf ||
                        null,

                        d.latitude ||
                        null,

                        d.longitude ||
                        null,

                        normalizarEmail(
                            d.criado_por
                        ) ||
                        'sistema'
                    ]
                );

            const cliente =
                resultado.rows[0];

            await registrarAuditoria(
                normalizarEmail(
                    d.criado_por
                ) ||
                'sistema',

                'CLIENTE_JORNADA_CADASTRADO',

                `Cliente ${nome} cadastrado na Jornada.`
            );

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
                    'Cliente cadastrado com sucesso.',

                cliente
            });

        } catch (err) {
            console.error(
                'Cadastrar cliente Jornada:',
                err
            );

            return res.status(500).json({
                sucesso: false,
                erro:
                    'Erro ao cadastrar cliente.'
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
                    FROM clientes_rs_colaboradores

                    WHERE
                        cliente_id = $1

                    AND
                        ativo = TRUE

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
            return res.status(500).json({
                sucesso: false,
                erro:
                    'Erro ao carregar colaboradores.'
            });
        }
    }
);


app.post(
    '/api/jornada-clientes/:id/colaboradores',

    async (req, res) => {
        try {
            const clienteId =
                Number(
                    req.params.id
                );

            const d =
                req.body || {};

            const colaboradorEmail =
                normalizarEmail(
                    d.colaborador_email
                );

            const colaboradorNome =
                String(
                    d.colaborador_nome ||
                    ''
                )
                    .trim();

            if (
                !colaboradorEmail ||
                !colaboradorNome
            ) {
                return res.status(400).json({
                    sucesso: false,
                    erro:
                        'Nome e e-mail do colaborador são obrigatórios.'
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
                            TRUE

                    RETURNING *
                    `,
                    [
                        clienteId,

                        colaboradorEmail,

                        colaboradorNome,

                        d.funcao ||
                        null,

                        String(
                            d.valor_tipo ||
                            'dia'
                        )
                            .toLowerCase(),

                        numeroRS(
                            d.valor_base
                        ),

                        d.horario_previsto ||
                        null,

                        normalizarEmail(
                            d.criado_por
                        ) ||
                        'sistema'
                    ]
                );

            await garantirJornadasDiaCliente(
                clienteId
            );

            await registrarAuditoria(
                normalizarEmail(
                    d.criado_por
                ) ||
                'sistema',

                'COLABORADOR_CLIENTE_VINCULADO',

                `${colaboradorNome} vinculado ao cliente #${clienteId}.`
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
                    'Colaborador vinculado ao cliente.',

                colaborador:
                    resultado.rows[0]
            });

        } catch (err) {
            console.error(
                'Vincular colaborador:',
                err
            );

            return res.status(500).json({
                sucesso: false,
                erro:
                    'Erro ao vincular colaborador.'
            });
        }
    }
);


app.delete(
    '/api/jornada-clientes/:clienteId/colaboradores/:id',

    async (req, res) => {
        try {
            const clienteId =
                Number(
                    req.params.clienteId
                );

            const id =
                Number(
                    req.params.id
                );

            await pool.query(
                `
                UPDATE clientes_rs_colaboradores
                SET ativo = FALSE
                WHERE
                    id = $1
                AND
                    cliente_id = $2
                `,
                [
                    id,
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
            return res.status(500).json({
                sucesso: false,
                erro:
                    'Erro ao remover colaborador.'
            });
        }
    }
);


// ============================================================
// ACOMPANHAMENTO DO DIA
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
                    FROM jornadas_clientes

                    WHERE
                        cliente_id = $1

                    AND
                        data = $2::date

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
                    FROM fechamentos_clientes

                    WHERE
                        cliente_id = $1

                    AND
                        data = $2::date

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
                    fechamento.rows[0] ||
                    null
            });

        } catch (err) {
            console.error(
                'Acompanhamento Jornada:',
                err
            );

            return res.status(500).json({
                sucesso: false,
                erro:
                    'Erro ao carregar acompanhamento.'
            });
        }
    }
);


// ============================================================
// HISTÓRICO DO CLIENTE
// ============================================================

app.get(
    '/api/jornada-clientes/:id/historico',

    async (req, res) => {
        try {
            const clienteId =
                Number(
                    req.params.id
                );

            const colaboradorEmail =
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

            if (colaboradorEmail) {
                resultado =
                    await pool.query(
                        `
                        SELECT *
                        FROM jornadas_clientes

                        WHERE
                            cliente_id = $1

                        AND
                            LOWER(
                                colaborador_email
                            )
                            =
                            LOWER($2)

                        ORDER BY
                            data DESC,
                            id DESC

                        LIMIT $3
                        `,
                        [
                            clienteId,
                            colaboradorEmail,
                            limite
                        ]
                    );

            } else {
                resultado =
                    await pool.query(
                        `
                        SELECT *
                        FROM jornadas_clientes

                        WHERE
                            cliente_id = $1

                        ORDER BY
                            data DESC,
                            colaborador_nome

                        LIMIT $2
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
            return res.status(500).json({
                sucesso: false,
                erro:
                    'Erro ao carregar histórico.'
            });
        }
    }
);


// ============================================================
// JORNADA FIXA DO COLABORADOR — HOJE
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

                    FROM clientes_rs_colaboradores

                    WHERE
                        LOWER(
                            colaborador_email
                        )
                        =
                        LOWER($1)

                    AND
                        ativo = TRUE
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
                        j.*,

                        c.nome
                            AS cliente_nome,

                        c.endereco
                            AS cliente_endereco,

                        c.cidade
                            AS cliente_cidade,

                        c.uf
                            AS cliente_uf,

                        c.latitude
                            AS cliente_latitude,

                        c.longitude
                            AS cliente_longitude,

                        c.responsavel_nome,

                        c.responsavel_email

                    FROM jornadas_clientes j

                    JOIN clientes_rs c
                      ON c.id =
                         j.cliente_id

                    WHERE
                        LOWER(
                            j.colaborador_email
                        )
                        =
                        LOWER($1)

                    AND
                        j.data =
                        $2::date

                    ORDER BY
                        j.id
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
                'Jornada fixa colaborador:',
                err
            );

            return res.status(500).json({
                sucesso: false,
                erro:
                    'Erro ao carregar a jornada.'
            });
        }
    }
);


// ============================================================
// CHECK-IN CLIENTE FIXO — FOTO + GPS
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
                    req.body?.prestador_email ||
                    req.body?.prestadorEmail
                );

            const jornada =
                await buscarJornadaCliente(
                    jornadaId
                );

            if (!jornada) {
                return res.status(404).json({
                    sucesso: false,
                    erro:
                        'Jornada não encontrada.'
                });
            }

            if (
                email &&
                normalizarEmail(
                    jornada.colaborador_email
                ) !== email
            ) {
                return res.status(403).json({
                    sucesso: false,
                    erro:
                        'Esta jornada pertence a outro colaborador.'
                });
            }

            if (jornada.fechada) {
                return res.status(409).json({
                    sucesso: false,
                    erro:
                        'Esta jornada já foi fechada.'
                });
            }

            if (jornada.entrada_em) {
                return res.status(409).json({
                    sucesso: false,
                    erro:
                        'A entrada já foi registrada.'
                });
            }

            if (!req.body?.foto) {
                return res.status(400).json({
                    sucesso: false,
                    erro:
                        'A foto de entrada é obrigatória.'
                });
            }

            if (
                req.body?.latitude === undefined ||
                req.body?.longitude === undefined
            ) {
                return res.status(400).json({
                    sucesso: false,
                    erro:
                        'A localização GPS é obrigatória.'
                });
            }

            const resultado =
                await pool.query(
                    `
                    UPDATE jornadas_clientes

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

                    WHERE id = $5

                    RETURNING *
                    `,
                    [
                        req.body.foto,

                        String(
                            req.body.latitude
                        ),

                        String(
                            req.body.longitude
                        ),

                        String(
                            req.body.precisao ??
                            ''
                        ),

                        jornadaId
                    ]
                );

            await registrarAuditoria(
                email ||
                jornada.colaborador_email,

                'CHECKIN_CLIENTE_FIXO',

                `Entrada da jornada #${jornadaId}.`
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
                'Check-in cliente fixo:',
                err
            );

            return res.status(500).json({
                sucesso: false,
                erro:
                    'Erro ao registrar entrada.'
            });
        }
    }
);


// ============================================================
// INTERVALO CLIENTE FIXO
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
                return res.status(404).json({
                    sucesso: false,
                    erro:
                        'Jornada não encontrada.'
                });
            }

            if (!jornada.entrada_em) {
                return res.status(409).json({
                    sucesso: false,
                    erro:
                        'Registre a entrada primeiro.'
                });
            }

            if (jornada.saida_em) {
                return res.status(409).json({
                    sucesso: false,
                    erro:
                        'Esta jornada já foi encerrada.'
                });
            }

            if (
                jornada.intervalo_inicio_em &&
                !jornada.intervalo_retorno_em
            ) {
                return res.status(409).json({
                    sucesso: false,
                    erro:
                        'O intervalo já está em andamento.'
                });
            }

            if (
                jornada.intervalo_inicio_em &&
                jornada.intervalo_retorno_em
            ) {
                return res.status(409).json({
                    sucesso: false,
                    erro:
                        'O intervalo desta jornada já foi utilizado.'
                });
            }

            await pool.query(
                `
                UPDATE jornadas_clientes

                SET
                    status =
                        'EM_INTERVALO',

                    intervalo_inicio_em =
                        CURRENT_TIMESTAMP,

                    intervalo_retorno_em =
                        NULL,

                    atualizado_em =
                        CURRENT_TIMESTAMP

                WHERE id = $1
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
            return res.status(500).json({
                sucesso: false,
                erro:
                    'Erro ao iniciar intervalo.'
            });
        }
    }
);


// ============================================================
// RETORNO DO INTERVALO CLIENTE FIXO
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
                return res.status(404).json({
                    sucesso: false,
                    erro:
                        'Jornada não encontrada.'
                });
            }

            if (
                !jornada.intervalo_inicio_em
            ) {
                return res.status(409).json({
                    sucesso: false,
                    erro:
                        'O intervalo ainda não foi iniciado.'
                });
            }

            if (
                jornada.intervalo_retorno_em
            ) {
                return res.status(409).json({
                    sucesso: false,
                    erro:
                        'O retorno já foi registrado.'
                });
            }

            await pool.query(
                `
                UPDATE jornadas_clientes

                SET
                    status =
                        'PRESENTE',

                    intervalo_retorno_em =
                        CURRENT_TIMESTAMP,

                    atualizado_em =
                        CURRENT_TIMESTAMP

                WHERE id = $1
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
            return res.status(500).json({
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
                    req.body?.prestador_email ||
                    req.body?.prestadorEmail
                );

            const jornada =
                await buscarJornadaCliente(
                    jornadaId
                );

            if (!jornada) {
                return res.status(404).json({
                    sucesso: false,
                    erro:
                        'Jornada não encontrada.'
                });
            }

            if (
                email &&
                normalizarEmail(
                    jornada.colaborador_email
                ) !== email
            ) {
                return res.status(403).json({
                    sucesso: false,
                    erro:
                        'Esta jornada pertence a outro colaborador.'
                });
            }

            if (!jornada.entrada_em) {
                return res.status(409).json({
                    sucesso: false,
                    erro:
                        'Registre a entrada primeiro.'
                });
            }

            if (jornada.saida_em) {
                return res.status(409).json({
                    sucesso: false,
                    erro:
                        'A saída já foi registrada.'
                });
            }

            if (
                jornada.intervalo_inicio_em &&
                !jornada.intervalo_retorno_em
            ) {
                return res.status(409).json({
                    sucesso: false,
                    erro:
                        'Registre o retorno do intervalo antes da saída.'
                });
            }

            if (!req.body?.foto) {
                return res.status(400).json({
                    sucesso: false,
                    erro:
                        'A foto de saída é obrigatória.'
                });
            }

            if (
                req.body?.latitude === undefined ||
                req.body?.longitude === undefined
            ) {
                return res.status(400).json({
                    sucesso: false,
                    erro:
                        'A localização GPS é obrigatória.'
                });
            }

            await pool.query(
                `
                UPDATE jornadas_clientes

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

                WHERE id = $5
                `,
                [
                    req.body.foto,

                    String(
                        req.body.latitude
                    ),

                    String(
                        req.body.longitude
                    ),

                    String(
                        req.body.precisao ??
                        ''
                    ),

                    jornadaId
                ]
            );

            const atualizada =
                await recalcularJornadaCliente(
                    jornadaId
                );

            await registrarAuditoria(
                email ||
                jornada.colaborador_email,

                'CHECKOUT_CLIENTE_FIXO',

                `Saída da jornada #${jornadaId}.`
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
                'Checkout cliente fixo:',
                err
            );

            return res.status(500).json({
                sucesso: false,
                erro:
                    'Erro ao registrar saída.'
            });
        }
    }
);


// ============================================================
// VALIDAR ENTRADA / SAÍDA PELO CLIENTE OU GRUPO RS
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
                    req.body?.validador_email
                )
                ||
                'sistema';

            if (
                tipo !== 'entrada' &&
                tipo !== 'saida'
            ) {
                return res.status(400).json({
                    sucesso: false,
                    erro:
                        'Tipo de validação inválido.'
                });
            }

            const jornada =
                await buscarJornadaCliente(
                    jornadaId
                );

            if (!jornada) {
                return res.status(404).json({
                    sucesso: false,
                    erro:
                        'Jornada não encontrada.'
                });
            }

            if (
                tipo === 'entrada' &&
                !jornada.entrada_em
            ) {
                return res.status(409).json({
                    sucesso: false,
                    erro:
                        'Ainda não existe entrada.'
                });
            }

            if (
                tipo === 'saida' &&
                !jornada.saida_em
            ) {
                return res.status(409).json({
                    sucesso: false,
                    erro:
                        'Ainda não existe saída.'
                });
            }

            if (tipo === 'entrada') {
                await pool.query(
                    `
                    UPDATE jornadas_clientes

                    SET
                        entrada_validada =
                            TRUE,

                        entrada_validada_por =
                            $1,

                        entrada_validada_em =
                            CURRENT_TIMESTAMP,

                        atualizado_em =
                            CURRENT_TIMESTAMP

                    WHERE id = $2
                    `,
                    [
                        validador,
                        jornadaId
                    ]
                );

            } else {
                await pool.query(
                    `
                    UPDATE jornadas_clientes

                    SET
                        saida_validada =
                            TRUE,

                        saida_validada_por =
                            $1,

                        saida_validada_em =
                            CURRENT_TIMESTAMP,

                        atualizado_em =
                            CURRENT_TIMESTAMP

                    WHERE id = $2
                    `,
                    [
                        validador,
                        jornadaId
                    ]
                );
            }

            await registrarAuditoria(
                validador,

                'VALIDAR_JORNADA_CLIENTE',

                `${tipo} da jornada #${jornadaId} validada.`
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
                    tipo === 'entrada'
                        ?
                        'Entrada validada.'
                        :
                        'Saída validada.'
            });

        } catch (err) {
            return res.status(500).json({
                sucesso: false,
                erro:
                    'Erro ao validar jornada.'
            });
        }
    }
);


// ============================================================
// FECHAMENTO DIÁRIO
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
                    req.body?.confirmado_por
                )
                ||
                'sistema';

            const observacoes =
                String(
                    req.body?.observacoes ||
                    ''
                );

            const abertas =
                await pool.query(
                    `
                    SELECT
                        COUNT(*)::int
                        AS total

                    FROM jornadas_clientes

                    WHERE
                        cliente_id = $1

                    AND
                        data = $2::date

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
                ) > 0
            ) {
                return res.status(409).json({
                    sucesso: false,
                    erro:
                        'Existem colaboradores com jornada aberta. Registre as saídas primeiro.'
                });
            }

            const resultado =
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
                        observacoes
                    ]
                );

            await pool.query(
                `
                UPDATE jornadas_clientes

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
                    cliente_id = $2

                AND
                    data = $3::date
                `,
                [
                    usuario,
                    clienteId,
                    data
                ]
            );

            await registrarAuditoria(
                usuario,

                'FECHAMENTO_DIARIO_CLIENTE',

                `Cliente #${clienteId} fechado em ${data}.`
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
                    'Dia confirmado e arquivado.',

                fechamento:
                    resultado.rows[0]
            });

        } catch (err) {
            console.error(
                'Fechamento diário:',
                err
            );

            return res.status(500).json({
                sucesso: false,
                erro:
                    'Erro ao confirmar o dia.'
            });
        }
    }
);


// ============================================================
// DOCUMENTOS PDF DA JORNADA
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

                    FROM jornadas_clientes_documentos

                    WHERE
                        jornada_id = $1

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
            return res.status(500).json({
                sucesso: false,
                erro:
                    'Erro ao carregar documentos.'
            });
        }
    }
);


app.post(
    '/api/jornada-fixa/:id/documentos',

    upload.single('arquivo'),

    async (req, res) => {
        try {
            const jornadaId =
                Number(
                    req.params.id
                );

            if (!req.file?.buffer) {
                return res.status(400).json({
                    sucesso: false,
                    erro:
                        'Selecione o PDF.'
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
                !String(nome)
                    .toLowerCase()
                    .endsWith('.pdf')
            ) {
                return res.status(400).json({
                    sucesso: false,
                    erro:
                        'Somente arquivos PDF são permitidos.'
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
                        $1,$2,$3,$4,$5,
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
                            req.body?.criado_por
                        )
                        ||
                        'sistema'
                    ]
                );

            return res.json({
                sucesso: true,

                mensagem:
                    'Documento PDF vinculado à jornada.',

                documento:
                    resultado.rows[0]
            });

        } catch (err) {
            console.error(
                'Documento Jornada:',
                err
            );

            return res.status(500).json({
                sucesso: false,
                erro:
                    'Erro ao salvar documento.'
            });
        }
    }
);


// ============================================================
// ENVIAR PDF ASSINADO
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

            if (!req.file?.buffer) {
                return res.status(400).json({
                    sucesso: false,
                    erro:
                        'Selecione o PDF assinado.'
                });
            }

            const originalRes =
                await pool.query(
                    `
                    SELECT *
                    FROM jornadas_clientes_documentos
                    WHERE id = $1
                    LIMIT 1
                    `,
                    [
                        documentoId
                    ]
                );

            const original =
                originalRes.rows[0];

            if (!original) {
                return res.status(404).json({
                    sucesso: false,
                    erro:
                        'Documento não encontrado.'
                });
            }

            const usuario =
                normalizarEmail(
                    req.body?.assinado_por
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
                        $1,$2,$3,$4,$5,
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

                        `${original.tipo || 'DOCUMENTO'}_ASSINADO`,

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
            return res.status(500).json({
                sucesso: false,
                erro:
                    'Erro ao arquivar documento assinado.'
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

                    FROM jornadas_clientes_documentos

                    WHERE id = $1

                    LIMIT 1
                    `,
                    [
                        documentoId
                    ]
                );

            const documento =
                resultado.rows[0];

            if (!documento?.arquivo) {
                return res.status(404).json({
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
            return res.status(500).json({
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
            return res.status(500).json({
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
// TRATAMENTO DE ERRO DO MULTER
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
                return res.status(413).json({
                    sucesso: false,
                    erro:
                        'Arquivo muito grande. Limite: 10 MB.'
                });
            }

            return res.status(400).json({
                sucesso: false,
                erro:
                    err.message
            });
        }

        return next(err);
    }
);


// ============================================================
// 404 DAS ROTAS /API
// IMPORTANTE:
// DEVE FICAR DEPOIS DE TODAS AS ROTAS.
// ============================================================

app.use(
    '/api',

    (req, res) => {

        return res.status(404).json({
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

app.get(
    '*',

    (req, res) => {

        return res.sendFile(
            path.join(
                __dirname,
                'index.html'
            )
        );
    }
);


// ============================================================
// INICIALIZAÇÃO
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


        // ----------------------------------------------------
        // TESTAR POSTGRESQL
        // ----------------------------------------------------

        await pool.query(
            'SELECT NOW()'
        );

        console.log(
            '✅ PostgreSQL conectado.'
        );


        // ----------------------------------------------------
        // PREPARAR BANCO
        // ----------------------------------------------------

        await criarTabelas();

        await criarTabelasJornadaClientes();


        console.log(
            '✅ Banco RS Connect preparado.'
        );


        // ----------------------------------------------------
        // PORTA DO RENDER
        // ----------------------------------------------------

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


        process.exit(1);
    }
}


// ============================================================
// ERROS NÃO TRATADOS
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
// ENCERRAMENTO SEGURO
// ============================================================

async function encerrarRSConnect(
    sinal
) {

    console.log(
        `⚠️ Recebido ${sinal}. Encerrando RS Connect...`
    );


    try {

        await pool.end();

    } catch (err) {

        console.error(
            'Erro ao fechar PostgreSQL:',
            err.message
        );
    }


    server.close(
        () => {

            console.log(
                '✅ RS Connect encerrado.'
            );


            process.exit(0);
        }
    );
}


process.on(
    'SIGTERM',

    () =>
        encerrarRSConnect(
            'SIGTERM'
        )
);


process.on(
    'SIGINT',

    () =>
        encerrarRSConnect(
            'SIGINT'
        )
);


// ============================================================
// INICIAR
// ============================================================

iniciarRSConnect();


// ============================================================
// FIM DO SERVER.JS
// ============================================================
