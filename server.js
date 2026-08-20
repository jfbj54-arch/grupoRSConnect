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

const upload = multer({ limits: { fileSize: 50 * 1024 * 1024 } });

app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));
app.use(express.static(path.join(__dirname)));

const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false }
});

pool.connect((err, client, release) => {
    if (err) {
        console.error('Erro ao conectar ao PostgreSQL:', err.stack);
    } else {
        console.log('Conectado com sucesso ao banco PostgreSQL.');
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
                status_checkin TEXT DEFAULT 'pendente',
                checkin_hora TEXT,
                checkout_hora TEXT,
                comprovante_pagamento BOOLEAN DEFAULT FALSE,
                nota_oficial TEXT
            );

            CREATE TABLE IF NOT EXISTS ledger_transacoes (
                id SERIAL PRIMARY KEY,
                servico_id INTEGER,
                usuario_email TEXT,
                usuario_id INTEGER,
                tipo TEXT,
                tipo_movimento TEXT, 
                valor NUMERIC(10, 2) NOT NULL,
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

        // Garante todas as colunas caso a tabela já exista sem elas
        const colunasGarantir = [
            "ALTER TABLE servicos ADD COLUMN IF NOT EXISTS categoria TEXT;",
            "ALTER TABLE servicos ADD COLUMN IF NOT EXISTS valor_diaria NUMERIC(10,2) DEFAULT 0;",
            "ALTER TABLE servicos ADD COLUMN IF NOT EXISTS valor_liquido NUMERIC(10,2) DEFAULT 0;",
            "ALTER TABLE servicos ADD COLUMN IF NOT EXISTS data_horario TEXT;",
            "ALTER TABLE servicos ADD COLUMN IF NOT EXISTS forma_pgto TEXT;",
            "ALTER TABLE servicos ADD COLUMN IF NOT EXISTS contrato_texto TEXT;",
            "ALTER TABLE servicos ADD COLUMN IF NOT EXISTS empresa_email TEXT;",
            "ALTER TABLE servicos ADD COLUMN IF NOT EXISTS empresa_whatsapp TEXT;",
            "ALTER TABLE servicos ADD COLUMN IF NOT EXISTS reservas JSONB DEFAULT '[]'::jsonb;",
            "ALTER TABLE servicos ADD COLUMN IF NOT EXISTS mensagens JSONB DEFAULT '[]'::jsonb;",
            "ALTER TABLE servicos ADD COLUMN IF NOT EXISTS selfie_confirmacao TEXT;",
            "ALTER TABLE servicos ADD COLUMN IF NOT EXISTS documento_comprovante TEXT;",
            "ALTER TABLE servicos ADD COLUMN IF NOT EXISTS presenca_confirmada BOOLEAN DEFAULT FALSE;",
            "ALTER TABLE servicos ADD COLUMN IF NOT EXISTS status_checkin TEXT DEFAULT 'pendente';",
            "ALTER TABLE servicos ADD COLUMN IF NOT EXISTS checkin_hora TEXT;",
            "ALTER TABLE servicos ADD COLUMN IF NOT EXISTS checkout_hora TEXT;",
            "ALTER TABLE servicos ADD COLUMN IF NOT EXISTS comprovante_pagamento BOOLEAN DEFAULT FALSE;",
            "ALTER TABLE servicos ADD COLUMN IF NOT EXISTS nota_oficial TEXT;",
            "ALTER TABLE servicos ADD COLUMN IF NOT EXISTS motivo_cancelamento TEXT;"
        ];

        for (let sqlCol of colunasGarantir) {
            await pool.query(sqlCol).catch(() => {});
        }

        console.log('Tabelas e colunas verificadas/criadas com sucesso no PostgreSQL.');
    } catch (err) {
        console.error('Erro ao criar tabelas:', err);
    }
}

async function registrarLedger(servicoId, email, tipoMovimento, valor) {
    try {
        await pool.query(
            `INSERT INTO ledger_transacoes (servico_id, usuario_email, tipo_movimento, valor) VALUES ($1, $2, $3, $4)`,
            [servicoId, email, tipoMovimento, valor]
        );
    } catch (err) {
        console.error('Erro ao registrar ledger:', err);
    }
}

async function registrarAuditoria(email, acao, detalhes) {
    try {
        await pool.query(
            `INSERT INTO auditoria_sistema (usuario_email, acao, detalhes) VALUES ($1, $2, $3)`,
            [email || 'sistema', acao, detalhes]
        );
    } catch (err) {
        console.error('Erro ao registrar auditoria:', err);
    }
}

app.post('/api/auth/registrar', async (req, res) => {
    const d = req.body;
    try {
        const query = `INSERT INTO usuarios (tipo, nome, doc, responsavel, email, senha, whatsapp, endereco, rg_cnh, profissao, tipo_chave_pix, pix, banco, conta, experiencia) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15) RETURNING id`;
        const params = [d.tipo, d.nome, d.doc, d.responsavel, d.email, d.senha, d.whatsapp, d.endereco, d.rgCnh, d.profissao, d.tipoChavePix, d.pix, d.banco, d.conta, d.experiencia];
        
        const result = await pool.query(query, params);
        
        if (d.tipo === 'prestador') {
            await pool.query(`INSERT INTO prestadores (email) VALUES ($1) ON CONFLICT (email) DO NOTHING`, [d.email]);
        }

        await registrarAuditoria(d.email, 'CADASTRO_USUARIO', `Novo usuário tipo ${d.tipo} cadastrado.`);
        res.json({ sucesso: true, id: result.rows[0].id });
    } catch (err) {
        res.json({ sucesso: false, erro: 'E-mail já cadastrado ou erro nos dados.' });
    }
});

app.post('/api/auth/login', async (req, res) => {
    const { email, senha } = req.body;
    try {
        const result = await pool.query(`SELECT * FROM usuarios WHERE email = $1 AND senha = $2`, [email, senha]);
        if (result.rows.length === 0) {
            return res.json({ sucesso: false, erro: 'E-mail ou senha incorretos.' });
        }
        await registrarAuditoria(email, 'LOGIN', 'Login realizado com sucesso.');
        res.json({ sucesso: true, usuario: result.rows[0] });
    } catch (err) {
        res.status(500).json({ sucesso: false, erro: 'Erro no servidor.' });
    }
});

app.get('/api/servicos', async (req, res) => {
    try {
        const result = await pool.query(`SELECT * FROM servicos ORDER BY id DESC`);
        res.json(result.rows);
    } catch (err) {
        res.status(500).json({ erro: 'Erro ao buscar serviços.' });
    }
});

app.post('/api/servicos', async (req, res) => {
    const s = req.body;
    try {
        const valorNumerico = parseFloat(String(s.valor).replace(',', '.')) || 0;
        const taxaPlataforma = valorNumerico * 0.10;
        const valorLiquido = valorNumerico - taxaPlataforma;

        const query = `
            INSERT INTO servicos (
                titulo, categoria, local, endereco, valor, valor_diaria, valor_liquido, 
                data_horario, forma_pgto, descricao, contrato_texto, empresa_email, empresa_whatsapp, status
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, 'ativo') RETURNING id
        `;
        
        const params = [
            s.titulo, 
            s.categoria || 'Geral', 
            s.local, 
            s.endereco, 
            String(s.valor), 
            valorNumerico, 
            valorLiquido, 
            s.dataHorario || 'A combinar', 
            s.formaPgto || 'Pix', 
            s.descricao, 
            s.contratoTexto || '', 
            s.empresaEmail || '', 
            s.empresaWhatsapp || ''
        ];

        const result = await pool.query(query, params);
        const servicoId = result.rows[0].id;
        
        await registrarLedger(servicoId, s.empresaEmail, 'RETENCAO_GARANTIA', valorNumerico);
        await registrarAuditoria(s.empresaEmail, 'PUBLICAR_SERVICO', `Serviço #${servicoId} publicado com garantia financeira retida de R$ ${s.valor}`);

        io.emit('atualizar_servicos');
        res.json({ sucesso: true, id: servicoId });
    } catch (err) {
        console.error('Erro detalhado ao publicar serviço:', err);
        res.json({ sucesso: false, erro: 'Erro ao publicar serviço: ' + err.message });
    }
});

app.post('/api/servicos/:id/aceitar', async (req, res) => {
    const id = req.params.id;
    const { prestadorEmail, prestadorNome, prestadorPix, prestadorWhatsapp, rgCnh } = req.body;

    try {
        const resultServico = await pool.query(`SELECT * FROM servicos WHERE id = $1`, [id]);
        if (resultServico.rows.length === 0) {
            return res.json({ sucesso: false, erro: 'Serviço não encontrado.' });
        }
        const servico = resultServico.rows[0];
        let reservas = servico.reservas || [];

        const prestadorRes = await pool.query(`SELECT id FROM usuarios WHERE email = $1`, [prestadorEmail]);
        const prestadorId = prestadorRes.rows[0]?.id || null;

        if (!servico.prestador_email) {
            const query = `UPDATE servicos SET status = 'em_andamento', prestador_email = $1, prestador_id = $2, prestador_nome = $3, prestador_pix = $4, prestador_whatsapp = $5 WHERE id = $6`;
            await pool.query(query, [prestadorEmail, prestadorId, prestadorNome, prestadorPix, prestadorWhatsapp, id]);
            
            await registrarAuditoria(prestadorEmail, 'ACEITAR_SERVICO', `Prestador assumiu Vaga Titular #${id}`);
            io.emit('atualizar_servicos');
            return res.json({ sucesso: true, mensagem: 'Você assumiu a Vaga Titular!' });
        } else {
            if (servico.prestador_email === prestadorEmail || reservas.some(r => r.email === prestadorEmail)) {
                return res.json({ sucesso: false, erro: 'Você já está inscrito nesta vaga.' });
            }
            if (reservas.length >= 2) {
                return res.json({ sucesso: false, erro: 'A fila de reservas (máximo 2) já está lotada.' });
            }

            reservas.push({ email: prestadorEmail, nome: prestadorNome, whatsapp: prestadorWhatsapp, rgCnh, pix: prestadorPix });
            await pool.query(`UPDATE servicos SET reservas = $1 WHERE id = $2`, [JSON.stringify(reservas), id]);

            await registrarAuditoria(prestadorEmail, 'ENTRAR_RESERVA', `Prestador entrou na Fila de Reserva do serviço #${id}`);
            io.emit('atualizar_servicos');
            return res.json({ sucesso: true, mensagem: 'Você entrou na Fila de Reserva (Emergência)!' });
        }
    } catch (err) {
        console.error('Erro ao aceitar contrato:', err);
        res.json({ sucesso: false, erro: 'Erro ao aceitar contrato.' });
    }
});

app.post('/api/servicos/:id/processar-status', async (req, res) => {
    const servicoId = req.params.id;
    const { acao, motivo } = req.body;

    try {
        const servicoQuery = await pool.query('SELECT * FROM servicos WHERE id = $1', [servicoId]);
        if (servicoQuery.rows.length === 0) {
            return res.status(404).json({ sucesso: false, erro: 'Serviço não encontrado.' });
        }
        const servico = servicoQuery.rows[0];

        if (acao === 'verificar_ausencia') {
            if (servico.status_checkin === 'pendente') {
                await pool.query(
                    'UPDATE servicos SET status = $1, motivo_cancelamento = $2 WHERE id = $3',
                    ['cancelado_ausencia_prestador', motivo || 'Prestador não compareceu no horário.', servicoId]
                );

                await registrarLedger(servicoId, servico.empresa_email, 'REEMBOLSO_AUTOMATICO', servico.valor_diaria);

                if (servico.prestador_email) {
                    await pool.query(
                        `UPDATE prestadores SET reputacao = GREATEST(reputacao - 0.5, 0), advertencias = advertencias + 1 WHERE email = $1`,
                        [servico.prestador_email]
                    );
                }

                await registrarAuditoria('sistema', 'REEMBOLSO_AUTOMATICO_EXECUTADO', `Serviço #${servicoId} cancelado por ausência.`);
                io.emit('atualizar_servicos');
                return res.json({ sucesso: true, mensagem: 'Ausência registrada. Reembolso automático processado.' });
            } else {
                return res.status(400).json({ sucesso: false, erro: 'O prestador realizou o check-in.' });
            }
        }

        if (acao === 'concluir') {
            if (servico.status_checkin !== 'concluido' && servico.status !== 'concluido') {
                return res.status(400).json({ sucesso: false, erro: 'O serviço precisa estar com check-in e check-out válidos.' });
            }

            await registrarLedger(servicoId, servico.prestador_email, 'REPASSE_PRESTADOR', servico.valor_liquido);
            await pool.query('UPDATE servicos SET status = $1 WHERE id = $2', ['concluido_com_sucesso', servicoId]);

            await registrarAuditoria('sistema', 'REPASSE_PRESTADOR_LIBERADO', `Serviço #${servicoId} concluído.`);
            io.emit('atualizar_servicos');
            return res.json({ sucesso: true, mensagem: 'Serviço concluído e repasse liberado.' });
        }

        res.status(400).json({ sucesso: false, erro: 'Ação inválida.' });
    } catch (err) {
        console.error('Erro no fluxo:', err);
        res.status(500).json({ sucesso: false, erro: 'Erro interno ao processar fluxo.' });
    }
});

app.post('/api/servicos/:id/nota-oficial', upload.single('notaFiscal'), async (req, res) => {
    const id = req.params.id;
    try {
        const arquivo = req.file;
        let dadosNota = req.body.notaFiscal || (arquivo ? `data:${arquivo.mimetype};base64,${arquivo.buffer.toString('base64')}` : null);

        if (!dadosNota) {
            return res.json({ sucesso: false, erro: 'Nenhum arquivo de nota fiscal enviado.' });
        }

        await pool.query(`UPDATE servicos SET nota_oficial = $1 WHERE id = $2`, [dadosNota, id]);
        
        const resultMsg = await pool.query(`SELECT mensagens FROM servicos WHERE id = $1`, [id]);
        let mensagens = resultMsg.rows[0]?.mensagens || [];
        mensagens.push({ 
            remetente: 'SISTEMA', 
            texto: `Nota Fiscal Oficial enviada e anexada com sucesso.`, 
            data: new Date().toLocaleTimeString() 
        });
        await pool.query(`UPDATE servicos SET mensagens = $1 WHERE id = $2`, [JSON.stringify(mensagens), id]);

        await registrarAuditoria('sistema', 'ENVIO_NOTA_FISCAL', `Nota fiscal oficial enviada para o serviço #${id}`);
        io.emit('atualizar_servicos');
        res.json({ sucesso: true, mensagem: 'Nota fiscal enviada com sucesso!' });
    } catch (err) {
        console.error('Erro ao enviar nota fiscal:', err);
        res.json({ sucesso: false, erro: 'Erro interno ao processar a nota fiscal.' });
    }
});

app.post('/api/servicos/:id/confirmar-presenca', async (req, res) => {
    const id = req.params.id;
    const { selfie, documentoComprovante } = req.body;
    try {
        await pool.query(
            `UPDATE servicos SET selfie_confirmacao = COALESCE($1, selfie_confirmacao), documento_comprovante = COALESCE($2, documento_comprovante), presenca_confirmada = TRUE WHERE id = $3`,
            [selfie, documentoComprovante, id]
        );
        await registrarAuditoria('sistema', 'CONFIRMAR_PRESENCA', `Presença confirmada para o serviço #${id}`);
        io.emit('atualizar_servicos');
        res.json({ sucesso: true, mensagem: 'Presença confirmada com sucesso!' });
    } catch (err) {
        console.error("Erro ao confirmar presença:", err);
        res.json({ sucesso: false, erro: 'Erro ao confirmar presença.' });
    }
});

app.post('/api/servicos/:id/ponto', async (req, res) => {
    const id = req.params.id;
    const { foto, hora } = req.body;
    try {
        await pool.query(`UPDATE servicos SET foto_ponto = $1, checkin_hora = $2, status_checkin = 'realizado' WHERE id = $3`, [foto, hora || new Date().toLocaleTimeString(), id]);
        await registrarAuditoria('sistema', 'CHECKIN_PONTO', `Check-in realizado para o serviço #${id}`);
        io.emit('atualizar_servicos');
        res.json({ sucesso: true });
    } catch (err) {
        res.json({ sucesso: false, erro: 'Erro ao registrar ponto.' });
    }
});

app.post('/api/servicos/:id/checkout', upload.single('fotoCheckout'), async (req, res) => {
    const id = req.params.id;
    try {
        const arquivo = req.file;
        let fotoCheckout = req.body.fotoCheckout || (arquivo ? `data:${arquivo.mimetype};base64,${arquivo.buffer.toString('base64')}` : null);
        const horaFinal = req.body.hora || new Date().toLocaleTimeString();

        await pool.query(
            `UPDATE servicos SET status = 'concluido', status_checkin = 'concluido', checkout_hora = $1, documento_comprovante = COALESCE($2, documento_comprovante), comprovante_pagamento = true WHERE id = $3`,
            [horaFinal, fotoCheckout, id]
        );

        const resultMsg = await pool.query(`SELECT mensagens FROM servicos WHERE id = $1`, [id]);
        let mensagens = resultMsg.rows[0]?.mensagens || [];
        mensagens.push({ 
            remetente: 'SISTEMA', 
            texto: `Serviço finalizado pelo prestador às ${horaFinal}. Foto de conclusão enviada.`, 
            data: new Date().toLocaleTimeString() 
        });
        await pool.query(`UPDATE servicos SET mensagens = $1 WHERE id = $2`, [JSON.stringify(mensagens), id]);

        await registrarAuditoria('sistema', 'CHECKOUT', `Serviço #${id} marcado como concluído pelo prestador.`);
        io.emit('atualizar_servicos');
        res.json({ sucesso: true, mensagem: 'Serviço finalizado com sucesso!' });
    } catch (err) {
        console.error('Erro no checkout:', err);
        res.json({ sucesso: false, erro: 'Erro ao realizar check-out.' });
    }
});

app.post('/api/servicos/:id/chat', async (req, res) => {
    const id = req.params.id;
    const { remetente, texto } = req.body;
    try {
        const result = await pool.query(`SELECT mensagens FROM servicos WHERE id = $1`, [id]);
        if (result.rows.length === 0) return res.status(404).json({ sucesso: false });

        let mensagens = result.rows[0].mensagens || [];
        mensagens.push({ remetente, texto, data: new Date().toLocaleTimeString() });

        await pool.query(`UPDATE servicos SET mensagens = $1 WHERE id = $2`, [JSON.stringify(mensagens), id]);
        io.emit('atualizar_servicos');
        res.json({ sucesso: true });
    } catch (err) {
        res.status(500).json({ sucesso: false });
    }
});

app.post('/api/servicos/:id/aprovar', async (req, res) => {
    const id = req.params.id;
    try {
        const servicoRes = await pool.query(`SELECT * FROM servicos WHERE id = $1`, [id]);
        if (servicoRes.rows.length === 0) {
            return res.json({ sucesso: false, erro: 'Serviço não encontrado.' });
        }
        const servico = servicoRes.rows[0];

        await pool.query(`UPDATE servicos SET status = 'aprovado' WHERE id = $1`, [id]);

        await registrarLedger(id, servico.prestador_email, 'REPASSE_PRESTADOR', servico.valor_liquido);
        await registrarLedger(id, 'admin@grupors.com', 'TAXA_PLATAFORMA', (servico.valor_diaria - servico.valor_liquido));
        await registrarAuditoria(servico.empresa_email, 'APROVAR_PAGAMENTO', `Pagamento do serviço #${id} aprovado.`);

        io.emit('atualizar_servicos');
        res.json({ sucesso: true });
    } catch (err) {
        res.json({ sucesso: false, erro: 'Erro ao aprovar serviço.' });
    }
});

app.delete('/api/servicos/:id', async (req, res) => {
    const id = req.params.id;
    try {
        await pool.query(`DELETE FROM servicos WHERE id = $1`, [id]);
        await registrarAuditoria('sistema', 'DELETAR_SERVICO', `Serviço #${id} foi removido.`);
        io.emit('atualizar_servicos');
        res.json({ sucesso: true, mensagem: 'Serviço removido com sucesso!' });
    } catch (err) {
        res.json({ sucesso: false, erro: 'Erro ao excluir serviço.' });
    }
});

io.on('connection', (socket) => {
    console.log('Novo cliente conectado via WebSocket:', socket.id);
});

app.get('/', (req, res) => {
    res.status(200).sendFile(path.join(__dirname, 'index.html'));
});

const PORT = process.env.PORT || 10000;
server.listen(PORT, () => {
    console.log(`Servidor rodando na porta ${PORT}`);
});
