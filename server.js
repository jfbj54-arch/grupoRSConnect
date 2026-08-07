const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const sqlite3 = require('sqlite3').verbose();
const cors = require('cors');
const bcrypt = require('bcrypt');

const app = express();
const server = http.createServer(app);

const io = new Server(server, {
    cors: {
        origin: "*",
        methods: ["GET", "POST", "PUT", "DELETE"]
    }
});

app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.static(__dirname)); // Serve o index.html e arquivos estáticos automaticamente na raiz

// Configuração do Banco de Dados SQLite
const db = new sqlite3.Database('./rsconnect.db', (err) => {
    if (err) {
        console.error('Erro ao abrir o banco de dados', err.message);
    } else {
        console.log('Conectado ao banco de dados SQLite.');
    }
});

// Criação das tabelas se não existirem
db.serialize(() => {
    db.run(`CREATE TABLE IF NOT EXISTS usuarios (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        nome TEXT,
        email TEXT UNIQUE,
        senha TEXT,
        tipo TEXT,
        rg TEXT,
        cpf TEXT,
        endereco TEXT,
        cidade TEXT
    )`);

    db.run(`CREATE TABLE IF NOT EXISTS servicos (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        titulo TEXT,
        local TEXT,
        valor TEXT,
        forma_pgto TEXT,
        descricao TEXT,
        status TEXT DEFAULT 'Pendente',
        colaborador TEXT,
        foto_entrada TEXT,
        foto_saida TEXT,
        dados_pagamento TEXT
    )`);
});

// ================= ROTAS DE AUTENTICAÇÃO =================

app.post('/api/auth/registrar', async (req, res) => {
    const { nome, email, senha, tipo, rg, cpf, endereco, cidade } = req.body;
    
    try {
        const hashSenha = await bcrypt.hash(senha, 10);
        const query = `INSERT INTO usuarios (nome, email, senha, tipo, rg, cpf, endereco, cidade) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`;
        
        db.run(query, [nome, email, hashSenha, tipo, rg || '', cpf || '', endereco || '', cidade || ''], function(err) {
            if (err) {
                return res.json({ sucesso: false, erro: 'E-mail já cadastrado ou erro nos dados.' });
            }
            res.json({
                sucesso: true,
                usuario: { id: this.lastID, nome, email, tipo }
            });
        });
    } catch (e) {
        res.status(500).json({ sucesso: false, erro: 'Erro ao processar senha.' });
    }
});

app.post('/api/auth/login', (req, res) => {
    const { email, senha, tipo } = req.body;
    db.get(`SELECT * FROM usuarios WHERE email = ? AND tipo = ?`, [email, tipo], async (err, row) => {
        if (err || !row) {
            return res.json({ sucesso: false, erro: 'Credenciais inválidas ou tipo incorreto.' });
        }

        const senhaValida = await bcrypt.compare(senha, row.senha);
        if (!senhaValida) {
            return res.json({ sucesso: false, erro: 'Credenciais inválidas ou tipo incorreto.' });
        }

        res.json({
            sucesso: true,
            usuario: { id: row.id, nome: row.nome, email: row.email, tipo: row.tipo }
        });
    });
});

// ================= ROTAS DE SERVIÇOS =================

app.get('/api/servicos', (req, res) => {
    db.all(`SELECT * FROM servicos ORDER BY id DESC`, [], (err, rows) => {
        if (err) {
            return res.status(500).json({ erro: err.message });
        }
        res.json(rows);
    });
});

app.post('/api/servicos', (req, res) => {
    const { titulo, local, valor, formaPgto, descricao } = req.body;
    const query = `INSERT INTO servicos (titulo, local, valor, forma_pgto, descricao, status) VALUES (?, ?, ?, ?, ?, 'Pendente')`;
    
    db.run(query, [titulo, local, valor, formaPgto, descricao], function(err) {
        if (err) {
            return res.status(500).json({ sucesso: false, erro: err.message });
        }
        
        const novoServico = {
            id: this.lastID,
            titulo,
            local,
            valor,
            forma_pgto: formaPgto,
            descricao,
            status: 'Pendente',
            colaborador: null,
            foto_entrada: null,
            foto_saida: null
        };

        io.emit('novo_servico', novoServico);
        res.json({ sucesso: true, id: this.lastID });
    });
});

app.put('/api/servicos/:id', (req, res) => {
    const { id } = req.params;
    const { status, colaborador, fotoEntrada, fotoSaida, dadosPagamentoPrestador } = req.body;

    let campos = [];
    let valores = [];

    if (status) { campos.push("status = ?"); valores.push(status); }
    if (colaborador) { campos.push("colaborador = ?"); valores.push(colaborador); }
    if (fotoEntrada) { campos.push("foto_entrada = ?"); valores.push(fotoEntrada); }
    if (fotoSaida) { campos.push("foto_saida = ?"); valores.push(fotoSaida); }
    if (dadosPagamentoPrestador) { campos.push("dados_pagamento = ?"); valores.push(JSON.stringify(dadosPagamentoPrestador)); }

    valores.push(id);

    const query = `UPDATE servicos SET ${campos.join(', ')} WHERE id = ?`;

    db.run(query, valores, function(err) {
        if (err) {
            return res.status(500).json({ sucesso: false, erro: err.message });
        }

        db.get(`SELECT * FROM servicos WHERE id = ?`, [id], (err, row) => {
            if (row) {
                io.emit('atualizacao_servico', row);
            }
            res.json({ sucesso: true });
        });
    });
});

app.delete('/api/servicos/:id', (req, res) => {
    const { id } = req.params;
    db.run(`DELETE FROM servicos WHERE id = ?`, [id], function(err) {
        if (err) {
            return res.status(500).json({ sucesso: false, erro: err.message });
        }
        io.emit('servico_excluido', { id: Number(id) });
        res.json({ sucesso: true });
    });
});

// ================= CONEXÃO SOCKET.IO =================
io.on('connection', (socket) => {
    console.log(`Novo cliente conectado via WebSocket: ${socket.id}`);

    socket.on('disconnect', () => {
        console.log(`Cliente desconectado: ${socket.id}`);
    });
});

// Inicialização do Servidor
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`Servidor rodando na porta ${PORT}`);
});