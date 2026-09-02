// ============================================================
// RS CONNECT — SERVER.JS
// VERSÃO COM PRIVACIDADE POR EMPRESA
//
// PARTE 1
//
// LOGIN + TOKEN + PRIVACIDADE + FUNÇÕES BASE
//
// IMPORTANTE:
// TODAS AS PARTES DEVEM SER COLADAS NO MESMO server.js
// ============================================================


// ============================================================
// IMPORTAÇÕES
// ============================================================

const express =
    require('express');


const http =
    require('http');


const {
    Server
} =
    require('socket.io');


const path =
    require('path');


const {
    Pool
} =
    require('pg');


const multer =
    require('multer');


const crypto =
    require('crypto');


// ============================================================
// APP / HTTP / SOCKET.IO
// ============================================================

const app =
    express();


const server =
    http.createServer(
        app
    );


const io =
    new Server(
        server,
        {
            cors: {
                origin:
                    '*',

                methods: [
                    'GET',
                    'POST',
                    'PUT',
                    'PATCH',
                    'DELETE'
                ]
            }
        }
    );


// ============================================================
// UPLOAD
// ============================================================

const upload =
    multer({
        limits: {
            fileSize:
                10 *
                1024 *
                1024
        }
    });


// ============================================================
// MIDDLEWARES
// ============================================================

app.use(
    express.json({
        limit:
            '15mb'
    })
);


app.use(
    express.urlencoded({
        extended:
            true,

        limit:
            '15mb'
    })
);


app.use(
    express.static(
        path.join(
            __dirname
        )
    )
);


// ============================================================
// POSTGRESQL
// ============================================================

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

                false
    });


// ============================================================
// CONFIGURAÇÕES DE SEGURANÇA
// ============================================================

// O token é assinado no próprio servidor.
//
// Se AUTH_TOKEN_SECRET estiver configurado no Render,
// será usado.
//
// Caso contrário, utilizamos RESET_TOKEN_SECRET.
//
// Como última compatibilidade, DATABASE_URL,
// que também é secreta no servidor.
//
// Mais tarde configure:
// AUTH_TOKEN_SECRET
//
// com uma sequência grande e aleatória.

const AUTH_TOKEN_SECRET =
    String(
        process.env.AUTH_TOKEN_SECRET
        ||
        process.env.RESET_TOKEN_SECRET
        ||
        process.env.DATABASE_URL
        ||
        'rs-connect-altere-esta-chave'
    );


// Token válido por 7 dias.

const AUTH_TOKEN_DURACAO =
    7 *
    24 *
    60 *
    60 *
    1000;


// ============================================================
// FUNÇÕES AUXILIARES
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
        texto.includes(
            ','
        )
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
        Number(
            texto
        );


    return Number.isFinite(
        numero
    )
        ?
        numero
        :
        0;
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

        const resultado =
            JSON.parse(
                valor ||
                '[]'
            );


        return Array.isArray(
            resultado
        )
            ?
            resultado
            :
            [];


    } catch {

        return [];
    }
}


// ============================================================
// SENHAS
// ============================================================

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
            .scryptSync(
                String(
                    senha
                ),
                salt,
                64
            )
            .toString(
                'hex'
            );


    return (
        `scrypt$${salt}$${hash}`
    );
}


function senhaEstaProtegida(
    valor
) {

    return String(
        valor ||
        ''
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
            senhaDigitada ||
            ''
        );


    const banco =
        String(
            senhaBanco ||
            ''
        );


    // ========================================================
    // SENHA ANTIGA EM TEXTO
    //
    // Continua funcionando.
    //
    // No primeiro login correto,
    // será convertida automaticamente.
    // ========================================================

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
            banco.split(
                '$'
            );


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
                .toString(
                    'hex'
                );


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


        return crypto
            .timingSafeEqual(
                bufferBanco,
                bufferDigitado
            );


    } catch {

        return false;
    }
}


// ============================================================
// TOKEN DE LOGIN
//
// O SERVER NÃO VAI MAIS CONFIAR SOMENTE
// NO E-MAIL ENVIADO PELO INDEX.
//
// O TOKEN DIZ QUEM REALMENTE ESTÁ LOGADO.
// ============================================================

function base64UrlEncode(
    valor
) {

    return Buffer
        .from(
            String(
                valor
            )
        )
        .toString(
            'base64url'
        );
}


function base64UrlDecode(
    valor
) {

    return Buffer
        .from(
            String(
                valor
            ),
            'base64url'
        )
        .toString(
            'utf8'
        );
}


function assinarToken(
    conteudo
) {

    return crypto
        .createHmac(
            'sha256',
            AUTH_TOKEN_SECRET
        )
        .update(
            conteudo
        )
        .digest(
            'base64url'
        );
}


// ============================================================
// CRIAR TOKEN DO USUÁRIO
// ============================================================

function gerarTokenUsuario(
    usuario
) {

    const agora =
        Date.now();


    const payload = {

        id:
            Number(
                usuario.id
            ),

        email:
            normalizarEmail(
                usuario.email
            ),

        tipo:
            String(
                usuario.tipo ||
                ''
            )
                .trim()
                .toLowerCase(),

        criadoEm:
            agora,

        expiraEm:
            agora +
            AUTH_TOKEN_DURACAO
    };


    const payloadCodificado =
        base64UrlEncode(
            JSON.stringify(
                payload
            )
        );


    const assinatura =
        assinarToken(
            payloadCodificado
        );


    return (
        `${payloadCodificado}.${assinatura}`
    );
}


// ============================================================
// VALIDAR TOKEN
// ============================================================

function validarTokenUsuario(
    token
) {

    try {

        const texto =
            String(
                token ||
                ''
            )
                .trim();


        if (!texto) {

            return null;
        }


        const partes =
            texto.split(
                '.'
            );


        if (
            partes.length !==
            2
        ) {

            return null;
        }


        const payloadCodificado =
            partes[0];


        const assinaturaRecebida =
            partes[1];


        const assinaturaEsperada =
            assinarToken(
                payloadCodificado
            );


        const bufferRecebido =
            Buffer.from(
                assinaturaRecebida
            );


        const bufferEsperado =
            Buffer.from(
                assinaturaEsperada
            );


        if (
            bufferRecebido.length !==
            bufferEsperado.length
        ) {

            return null;
        }


        if (
            !crypto.timingSafeEqual(
                bufferRecebido,
                bufferEsperado
            )
        ) {

            return null;
        }


        const payload =
            JSON.parse(
                base64UrlDecode(
                    payloadCodificado
                )
            );


        if (
            !payload?.email ||
            !payload?.id
        ) {

            return null;
        }


        if (
            Number(
                payload.expiraEm ||
                0
            )
            <
            Date.now()
        ) {

            return null;
        }


        return payload;


    } catch {

        return null;
    }
}


// ============================================================
// LER TOKEN DA REQUISIÇÃO
//
// Authorization:
// Bearer TOKEN
// ============================================================

function obterTokenRequisicao(
    req
) {

    const authorization =
        String(
            req.headers?.authorization ||
            ''
        )
            .trim();


    if (
        authorization
            .toLowerCase()
            .startsWith(
                'bearer '
            )
    ) {

        return authorization
            .slice(
                7
            )
            .trim();
    }


    // Compatibilidade temporária.
    //
    // O INDEX novo usará Authorization,
    // mas deixamos essas opções para testes.

    return String(
        req.headers?.['x-rs-token']
        ||
        req.body?.token
        ||
        req.query?.token
        ||
        ''
    )
        .trim();
}


// ============================================================
// BUSCAR USUÁRIO NO BANCO
// ============================================================

async function buscarUsuarioPorEmail(
    email
) {

    const emailNormalizado =
        normalizarEmail(
            email
        );


    if (!emailNormalizado) {

        return null;
    }


    const resultado =
        await pool.query(
            `
            SELECT
                id,
                tipo,
                nome,
                email,
                whatsapp

            FROM usuarios

            WHERE
                LOWER(
                    TRIM(email)
                )
                =
                LOWER(
                    TRIM($1)
                )

            LIMIT 1
            `,
            [
                emailNormalizado
            ]
        );


    return (
        resultado.rows[0]
        ||
        null
    );
}


// ============================================================
// TIPOS DE GESTÃO DO GRUPO RS
// ============================================================

function usuarioEhGestorRS(
    usuario
) {

    if (!usuario) {

        return false;
    }


    const email =
        normalizarEmail(
            usuario.email
        );


    const adminEmail =
        normalizarEmail(
            process.env.ADMIN_EMAIL
        );


    // ADMIN_EMAIL configurado no Render.
    if (
        adminEmail &&
        email ===
        adminEmail
    ) {

        return true;
    }


    const tipo =
        String(
            usuario.tipo ||
            ''
        )
            .trim()
            .toLowerCase();


    return [
        'admin',
        'administrador',
        'gestor',
        'grupo_rs',
        'grupo rs'
    ]
        .includes(
            tipo
        );
}


// ============================================================
// IDENTIFICAR SE É PRESTADOR / COLABORADOR
// ============================================================

function usuarioEhPrestador(
    usuario
) {

    const tipo =
        String(
            usuario?.tipo ||
            ''
        )
            .trim()
            .toLowerCase();


    return [
        'prestador',
        'colaborador'
    ]
        .includes(
            tipo
        );
}


// ============================================================
// BUSCAR CLIENTE SOB DEMANDA DO RESPONSÁVEL
//
// Cada empresa cliente fica ligada ao:
// responsavel_email
//
// Exemplo:
// Gratidão → rosilene@gmail.com
//
// Então Rosilene só acessa Gratidão.
// ============================================================

async function buscarClienteDoResponsavel(
    email
) {

    const emailNormalizado =
        normalizarEmail(
            email
        );


    if (!emailNormalizado) {

        return null;
    }


    const resultado =
        await pool.query(
            `
            SELECT *
            FROM clientes_rs

            WHERE
                ativo = TRUE

            AND
                LOWER(
                    TRIM(
                        COALESCE(
                            responsavel_email,
                            ''
                        )
                    )
                )
                =
                LOWER(
                    TRIM($1)
                )

            LIMIT 1
            `,
            [
                emailNormalizado
            ]
        );


    return (
        resultado.rows[0]
        ||
        null
    );
}


// ============================================================
// MIDDLEWARE DE AUTENTICAÇÃO
//
// TODA ROTA PRIVADA PASSARÁ POR AQUI.
// ============================================================

async function autenticarUsuario(
    req,
    res,
    next
) {

    try {

        const token =
            obterTokenRequisicao(
                req
            );


        const payload =
            validarTokenUsuario(
                token
            );


        if (!payload) {

            return res
                .status(
                    401
                )
                .json({
                    sucesso:
                        false,

                    erro:
                        'Sessão inválida ou expirada. Entre novamente no RS Connect.'
                });
        }


        // ====================================================
        // CONFIRMAR QUE O USUÁRIO AINDA EXISTE
        // ====================================================

        const usuario =
            await buscarUsuarioPorEmail(
                payload.email
            );


        if (!usuario) {

            return res
                .status(
                    401
                )
                .json({
                    sucesso:
                        false,

                    erro:
                        'Usuário não encontrado.'
                });
        }


        // Não confiamos no tipo que estava no token.
        // Pegamos sempre o tipo atual do banco.

        req.usuario = {

            id:
                Number(
                    usuario.id
                ),

            nome:
                usuario.nome,

            email:
                normalizarEmail(
                    usuario.email
                ),

            tipo:
                String(
                    usuario.tipo ||
                    ''
                )
                    .trim()
                    .toLowerCase(),

            gestorRS:
                usuarioEhGestorRS(
                    usuario
                ),

            prestador:
                usuarioEhPrestador(
                    usuario
                )
        };


        return next();


    } catch (err) {

        console.error(
            '❌ Autenticação:',
            err
        );


        return res
            .status(
                401
            )
            .json({
                sucesso:
                    false,

                erro:
                    'Não foi possível validar sua sessão.'
            });
    }
}


// ============================================================
// AUTENTICAÇÃO OPCIONAL
//
// Útil em algumas rotas públicas,
// mas que podem personalizar o resultado
// quando existe usuário logado.
// ============================================================

async function autenticarOpcional(
    req,
    res,
    next
) {

    const token =
        obterTokenRequisicao(
            req
        );


    if (!token) {

        req.usuario =
            null;


        return next();
    }


    try {

        const payload =
            validarTokenUsuario(
                token
            );


        if (!payload) {

            req.usuario =
                null;


            return next();
        }


        const usuario =
            await buscarUsuarioPorEmail(
                payload.email
            );


        if (!usuario) {

            req.usuario =
                null;


            return next();
        }


        req.usuario = {

            id:
                Number(
                    usuario.id
                ),

            nome:
                usuario.nome,

            email:
                normalizarEmail(
                    usuario.email
                ),

            tipo:
                String(
                    usuario.tipo ||
                    ''
                )
                    .trim()
                    .toLowerCase(),

            gestorRS:
                usuarioEhGestorRS(
                    usuario
                ),

            prestador:
                usuarioEhPrestador(
                    usuario
                )
        };


        return next();


    } catch {

        req.usuario =
            null;


        return next();
    }
}


// ============================================================
// PRIVACIDADE — CONTEXTO DO USUÁRIO
// ============================================================

async function obterContextoPrivacidade(
    usuario
) {

    if (!usuario) {

        return {
            autenticado:
                false,

            gestorRS:
                false,

            empresaCliente:
                false,

            prestador:
                false,

            clienteId:
                null,

            cliente:
                null
        };
    }


    // ========================================================
    // GRUPO RS / ADMIN
    //
    // PODE VER TUDO.
    // ========================================================

    if (
        usuario.gestorRS
    ) {

        return {
            autenticado:
                true,

            gestorRS:
                true,

            empresaCliente:
                false,

            prestador:
                false,

            clienteId:
                null,

            cliente:
                null
        };
    }


    // ========================================================
    // VERIFICAR SE O E-MAIL É RESPONSÁVEL DE ALGUM CLIENTE
    // ========================================================

    const cliente =
        await buscarClienteDoResponsavel(
            usuario.email
        );


    if (cliente) {

        return {
            autenticado:
                true,

            gestorRS:
                false,

            empresaCliente:
                true,

            prestador:
                false,

            clienteId:
                Number(
                    cliente.id
                ),

            cliente
        };
    }


    // ========================================================
    // PRESTADOR / COLABORADOR
    // ========================================================

    return {
        autenticado:
            true,

        gestorRS:
            false,

        empresaCliente:
            false,

        prestador:
            true,

        clienteId:
            null,

        cliente:
            null
    };
}


// ============================================================
// VERIFICAR ACESSO AO CLIENTE
// ============================================================

async function usuarioPodeAcessarCliente(
    usuario,
    clienteId
) {

    if (!usuario) {

        return false;
    }


    if (
        usuario.gestorRS
    ) {

        return true;
    }


    const contexto =
        await obterContextoPrivacidade(
            usuario
        );


    if (
        !contexto.empresaCliente
    ) {

        return false;
    }


    return (
        Number(
            contexto.clienteId
        )
        ===
        Number(
            clienteId
        )
    );
}


// ============================================================
// GARANTIR ACESSO AO CLIENTE
//
// Pode ser usado diretamente nas rotas:
//
// if (!(await exigirAcessoCliente(...))) return;
// ============================================================

async function exigirAcessoCliente(
    req,
    res,
    clienteId
) {

    const permitido =
        await usuarioPodeAcessarCliente(
            req.usuario,
            clienteId
        );


    if (!permitido) {

        res
            .status(
                403
            )
            .json({
                sucesso:
                    false,

                erro:
                    'Você não tem permissão para acessar dados desta empresa.'
            });


        return false;
    }


    return true;
}


// ============================================================
// VERIFICAR SE COLABORADOR PERTENCE AO CLIENTE
// ============================================================

async function colaboradorPertenceAoCliente(
    clienteId,
    emailColaborador
) {

    const resultado =
        await pool.query(
            `
            SELECT
                id

            FROM
                clientes_rs_colaboradores

            WHERE
                cliente_id =
                $1

            AND
                LOWER(
                    colaborador_email
                )
                =
                LOWER($2)

            AND
                ativo =
                TRUE

            LIMIT 1
            `,
            [
                Number(
                    clienteId
                ),

                normalizarEmail(
                    emailColaborador
                )
            ]
        );


    return (
        resultado.rows.length >
        0
    );
}


// ============================================================
// ACESSO À JORNADA
//
// PODE:
// - ADMIN/GRUPO RS
// - EMPRESA DONA DO CLIENTE
// - PRÓPRIO COLABORADOR
//
// NÃO PODE:
// - OUTRA EMPRESA
// - OUTRO COLABORADOR
// ============================================================

async function usuarioPodeAcessarJornada(
    usuario,
    jornadaId
) {

    if (!usuario) {

        return false;
    }


    const resultado =
        await pool.query(
            `
            SELECT
                id,
                cliente_id,
                colaborador_email

            FROM
                jornadas_clientes

            WHERE
                id =
                $1

            LIMIT 1
            `,
            [
                Number(
                    jornadaId
                )
            ]
        );


    const jornada =
        resultado.rows[0];


    if (!jornada) {

        return false;
    }


    if (
        usuario.gestorRS
    ) {

        return true;
    }


    // Próprio colaborador.
    if (
        normalizarEmail(
            jornada.colaborador_email
        )
        ===
        normalizarEmail(
            usuario.email
        )
    ) {

        return true;
    }


    // Responsável da empresa.
    return usuarioPodeAcessarCliente(
        usuario,
        jornada.cliente_id
    );
}


// ============================================================
// ACESSO AO SERVIÇO / VAGA
//
// ADMIN:
// → qualquer serviço
//
// EMPRESA:
// → somente serviço criado por ela
//
// PRESTADOR:
// → serviço público no Radar,
//   ou serviço em que está envolvido.
// ============================================================

async function usuarioPodeGerenciarServico(
    usuario,
    servico
) {

    if (
        !usuario ||
        !servico
    ) {

        return false;
    }


    if (
        usuario.gestorRS
    ) {

        return true;
    }


    return (
        normalizarEmail(
            servico.empresa_email
        )
        ===
        normalizarEmail(
            usuario.email
        )
    );
}


// ============================================================
// RESPOSTA PADRÃO — ACESSO NEGADO
// ============================================================

function responderAcessoNegado(
    res,
    mensagem =
        'Você não tem permissão para acessar estas informações.'
) {

    return res
        .status(
            403
        )
        .json({
            sucesso:
                false,

            erro:
                mensagem
        });
}


// ============================================================
// RECUPERAÇÃO DE SENHA
// ============================================================

function hashCodigoRecuperacao(
    email,
    codigo
) {

    const segredo =
        process.env.RESET_TOKEN_SECRET
        ||
        process.env.DATABASE_URL
        ||
        AUTH_TOKEN_SECRET;


    return crypto
        .createHmac(
            'sha256',
            segredo
        )
        .update(
            `${
                normalizarEmail(
                    email
                )
            }:${
                String(
                    codigo
                )
                    .trim()
            }`
        )
        .digest(
            'hex'
        );
}


// ============================================================
// ENVIAR E-MAIL DE RECUPERAÇÃO
// ============================================================

async function enviarEmailRecuperacao(
    email,
    codigo
) {

    const apiKey =
        String(
            process.env.RESEND_API_KEY
            ||
            ''
        )
            .trim();


    const remetente =
        String(
            process.env.EMAIL_FROM
            ||
            'RS Connect <noreply@seudominio.com.br>'
        )
            .trim();


    if (!apiKey) {

        throw new Error(
            'RESEND_API_KEY não configurada no Render.'
        );
    }


    const resposta =
        await fetch(
            'https://api.resend.com/emails',

            {
                method:
                    'POST',

                headers: {

                    'Authorization':
                        `Bearer ${apiKey}`,

                    'Content-Type':
                        'application/json'
                },


                body:
                    JSON.stringify({

                        from:
                            remetente,


                        to: [
                            normalizarEmail(
                                email
                            )
                        ],


                        subject:
                            'Código de recuperação — RS Connect',


                        html:
                            `
                            <div style="
                                font-family:Arial,sans-serif;
                                max-width:520px;
                                margin:auto;
                                padding:24px;
                            ">

                                <h2>
                                    RS Connect
                                </h2>

                                <p>
                                    Recebemos uma solicitação para redefinir a senha da sua conta.
                                </p>

                                <div style="
                                    font-size:32px;
                                    font-weight:800;
                                    letter-spacing:8px;
                                    padding:18px;
                                    margin:20px 0;
                                    text-align:center;
                                    border-radius:12px;
                                    background:#f2f6fb;
                                ">
                                    ${codigo}
                                </div>

                                <p>
                                    Este código expira em
                                    <strong>
                                        15 minutos
                                    </strong>.
                                </p>

                                <p>
                                    Se você não solicitou a recuperação,
                                    ignore esta mensagem.
                                </p>

                                <p style="
                                    color:#6b7280;
                                    font-size:12px;
                                ">
                                    Grupo RS Connect
                                </p>

                            </div>
                            `
                    })
            }
        );


    const respostaTexto =
        await resposta.text();


    if (
        !resposta.ok
    ) {

        throw new Error(
            `Falha ao enviar e-mail de recuperação: ${respostaTexto}`
        );
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
            INSERT INTO
                auditoria_sistema (
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
            INSERT INTO
                ledger_transacoes (
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
                id =
                $1

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


// ============================================================
// PRESTADOR É TITULAR?
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


// ============================================================
// EMPRESA É DONA DO SERVIÇO?
// ============================================================

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
// FIM DA PARTE 1
//
// PARTE 2 COMEÇA COM:
// SOCKET + CRIAÇÃO/ATUALIZAÇÃO DAS TABELAS
// + ESTRUTURA DA JORNADA E PRIVACIDADE NO BANCO
// ============================================================
// ============================================================
// RS CONNECT — SERVER.JS
// VERSÃO COM PRIVACIDADE POR EMPRESA
//
// PARTE 2
//
// SOCKET + BANCO PRINCIPAL
// CLIENTES SOB DEMANDA + JORNADA
// ============================================================


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
// SOCKET — ATUALIZAÇÃO PRIVADA DA EMPRESA
//
// Em vez de mandar informações detalhadas
// para todo mundo, podemos avisar apenas
// a sala daquela empresa.
// ============================================================

function emitirAtualizacaoEmpresa(
    email,
    evento,
    dados = {}
) {

    const empresaEmail =
        normalizarEmail(
            email
        );


    if (!empresaEmail) {
        return;
    }


    registrarNotificacaoUsuario(
        empresaEmail,
        evento,
        dados
    ).catch(
        erro => console.warn('Notificação empresa:', erro.message)
    );


    io.to(
        `usuario_${empresaEmail}`
    )
        .emit(
            evento,
            dados
        );


    io.to(
        `user:${empresaEmail}`
    )
        .emit(
            evento,
            dados
        );
}


// ============================================================
// SOCKET — ATUALIZAÇÃO PRIVADA DO PRESTADOR
// ============================================================

function emitirAtualizacaoPrestador(
    email,
    evento,
    dados = {}
) {

    const prestadorEmail =
        normalizarEmail(
            email
        );


    if (!prestadorEmail) {
        return;
    }


    registrarNotificacaoUsuario(
        prestadorEmail,
        evento,
        dados
    ).catch(
        erro => console.warn('Notificação prestador:', erro.message)
    );


    io.to(
        `usuario_${prestadorEmail}`
    )
        .emit(
            evento,
            dados
        );


    io.to(
        `user:${prestadorEmail}`
    )
        .emit(
            evento,
            dados
        );
}


// ============================================================
// NOTIFICAÇÕES PERSISTENTES
// ============================================================

function dadosNotificacaoEvento(
    evento,
    dados = {}
) {

    const nomes = {
        novo_servico: ['Nova oportunidade', 'Um novo serviço foi publicado.', 'radar'],
        servico_aceito: ['Serviço aceito', 'Um profissional aceitou o serviço.', 'servicos'],
        presenca_confirmada: ['Presença confirmada', 'A presença foi registrada com foto e localização.', 'jornada'],
        checkin_realizado: ['Entrada registrada', 'O check-in do serviço foi realizado.', 'jornada'],
        intervalo_iniciado: ['Intervalo iniciado', 'O intervalo da jornada foi registrado.', 'jornada'],
        intervalo_finalizado: ['Retorno registrado', 'O profissional retornou do intervalo.', 'jornada'],
        servico_finalizado: ['Jornada finalizada', 'O check-out está disponível para conferência.', 'jornada'],
        servico_validado: ['Jornada aprovada', 'A empresa aprovou a jornada de trabalho.', 'jornada'],
        correcao_jornada_solicitada: ['Correção solicitada', 'A empresa solicitou a conferência da jornada.', 'jornada'],
        pagamento_autorizado: ['Pagamento autorizado', 'O pagamento do serviço foi autorizado.', 'financeiro'],
        pagamento_realizado: ['Pagamento realizado', 'O pagamento do serviço foi registrado.', 'financeiro'],
        comprovante_pagamento: ['Comprovante disponível', 'Um comprovante de pagamento foi anexado.', 'financeiro'],
        nova_mensagem: ['Nova mensagem', 'Você recebeu uma nova mensagem.', 'mensagens']
        ,cadastro_aprovado: ['Cadastro aprovado', 'Seu acesso ao RS CONNECT foi liberado.', 'inicio']
        ,nova_avaliacao: ['Nova avaliação', 'Você recebeu uma nova avaliação.', 'perfil']
        ,novo_cadastro_pendente: ['Novo cadastro', 'Há um novo cadastro aguardando aprovação.', 'admin']
    };


    const padrao =
        nomes[evento] ||
        ['Atualização no RS Connect', 'Há uma nova atualização na sua conta.', 'inicio'];


    return {
        titulo: padrao[0],
        mensagem: String(dados?.mensagem || padrao[1]),
        pagina: padrao[2]
    };
}


async function registrarNotificacaoUsuario(
    email,
    evento,
    dados = {}
) {

    const usuarioEmail =
        normalizarEmail(email);


    if (!usuarioEmail) return;


    const info =
        dadosNotificacaoEvento(evento, dados);


    await pool.query(
        `
        INSERT INTO notificacoes (
            usuario_email,
            titulo,
            mensagem,
            tipo,
            pagina,
            servico_id
        )
        VALUES ($1, $2, $3, $4, $5, $6)
        `,
        [
            usuarioEmail,
            info.titulo,
            info.mensagem,
            String(evento || 'atualizacao'),
            info.pagina,
            Number(dados?.servicoId) || null
        ]
    );


    io.to(`usuario_${usuarioEmail}`)
        .emit('nova_notificacao', {titulo: info.titulo});


    io.to(`user:${usuarioEmail}`)
        .emit('nova_notificacao', {titulo: info.titulo});
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
                    DEFAULT CURRENT_TIMESTAMP,

                atualizado_em TIMESTAMP
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
                    DEFAULT CURRENT_TIMESTAMP,

                atualizado_em TIMESTAMP
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


            CREATE TABLE IF NOT EXISTS recuperacao_senha (
                id BIGSERIAL PRIMARY KEY,

                email TEXT NOT NULL,

                codigo_hash TEXT NOT NULL,

                usado BOOLEAN
                    DEFAULT FALSE,

                tentativas INTEGER
                    DEFAULT 0,

                expira_em TIMESTAMPTZ
                    NOT NULL,

                criado_em TIMESTAMPTZ
                    DEFAULT CURRENT_TIMESTAMP
            );


            CREATE INDEX IF NOT EXISTS
                idx_recuperacao_senha_email

            ON recuperacao_senha (
                LOWER(email),
                criado_em DESC
            );
        `);


        // ====================================================
        // COMPATIBILIDADE COM BANCO ANTIGO
        //
        // Se uma coluna não existir,
        // ela será criada automaticamente.
        // ====================================================

        const alteracoes = [

            "ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS descricao TEXT;",

            "ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS criado_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP;",

            "ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS atualizado_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP;",

            "ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS cadastro_status TEXT DEFAULT 'aprovado';",

            "ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS aprovado_em TIMESTAMP;",

            "ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS aprovado_por TEXT;",

            "ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS foto_perfil TEXT;",

            "ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS funcoes TEXT;",

            "ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS perfil_verificado BOOLEAN DEFAULT FALSE;",

            "ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS documentos_verificados BOOLEAN DEFAULT FALSE;",

            "ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS documento_perfil TEXT;",

            "ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS documento_perfil_nome TEXT;",

            "ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS aceite_termos BOOLEAN DEFAULT FALSE;",

            "ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS aceite_termos_em TIMESTAMP;",

            "ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS termos_versao TEXT;",

            "ALTER TABLE servicos ADD COLUMN IF NOT EXISTS cidade TEXT;",

            "ALTER TABLE servicos ADD COLUMN IF NOT EXISTS empresa_nome TEXT;",

            "ALTER TABLE servicos ADD COLUMN IF NOT EXISTS empresa_email TEXT;",

            "ALTER TABLE servicos ADD COLUMN IF NOT EXISTS empresa_whatsapp TEXT;",

            "ALTER TABLE servicos ADD COLUMN IF NOT EXISTS valor_diaria NUMERIC(10,2) DEFAULT 0;",

            "ALTER TABLE servicos ADD COLUMN IF NOT EXISTS valor_liquido NUMERIC(10,2) DEFAULT 0;",

            "ALTER TABLE servicos ADD COLUMN IF NOT EXISTS valor_total NUMERIC(10,2) DEFAULT 0;",

            "ALTER TABLE servicos ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'ativo';",

            "ALTER TABLE servicos ADD COLUMN IF NOT EXISTS prestador_email TEXT;",

            "ALTER TABLE servicos ADD COLUMN IF NOT EXISTS prestador_id INTEGER;",

            "ALTER TABLE servicos ADD COLUMN IF NOT EXISTS prestador_nome TEXT;",

            "ALTER TABLE servicos ADD COLUMN IF NOT EXISTS prestador_pix TEXT;",

            "ALTER TABLE servicos ADD COLUMN IF NOT EXISTS prestador_whatsapp TEXT;",

            "ALTER TABLE servicos ADD COLUMN IF NOT EXISTS reservas JSONB DEFAULT '[]'::jsonb;",

            "ALTER TABLE servicos ADD COLUMN IF NOT EXISTS mensagens JSONB DEFAULT '[]'::jsonb;",

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

            "ALTER TABLE servicos ADD COLUMN IF NOT EXISTS jornada_aprovacao_status TEXT DEFAULT 'aguardando_aprovacao';",

            "ALTER TABLE servicos ADD COLUMN IF NOT EXISTS jornada_correcao_motivo TEXT;",

            "ALTER TABLE servicos ADD COLUMN IF NOT EXISTS jornada_correcao_solicitada_em TIMESTAMP;",

            "ALTER TABLE servicos ADD COLUMN IF NOT EXISTS pagamento_autorizado BOOLEAN DEFAULT FALSE;",

            "ALTER TABLE servicos ADD COLUMN IF NOT EXISTS pagamento_autorizado_em TIMESTAMP;",

            "ALTER TABLE servicos ADD COLUMN IF NOT EXISTS pagamento_realizado BOOLEAN DEFAULT FALSE;",

            "ALTER TABLE servicos ADD COLUMN IF NOT EXISTS pagamento_realizado_em TIMESTAMP;",

            "ALTER TABLE servicos ADD COLUMN IF NOT EXISTS comprovante_pagamento BOOLEAN DEFAULT FALSE;",

            "ALTER TABLE servicos ADD COLUMN IF NOT EXISTS comprovante_pagamento_arquivo TEXT;",

            "ALTER TABLE servicos ADD COLUMN IF NOT EXISTS contrato_assinado TEXT;",

            "ALTER TABLE servicos ADD COLUMN IF NOT EXISTS contrato_assinado_em TIMESTAMP;",

            "ALTER TABLE servicos ADD COLUMN IF NOT EXISTS nota_oficial TEXT;",

            "ALTER TABLE servicos ADD COLUMN IF NOT EXISTS atualizado_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP;"
        ];


        for (
            const sql
            of alteracoes
        ) {

            await pool.query(
                sql
            );
        }


        await pool.query(`
            CREATE TABLE IF NOT EXISTS notificacoes (
                id SERIAL PRIMARY KEY,
                usuario_email TEXT NOT NULL,
                titulo TEXT NOT NULL,
                mensagem TEXT NOT NULL,
                tipo TEXT DEFAULT 'atualizacao',
                pagina TEXT DEFAULT 'inicio',
                servico_id INTEGER,
                lida BOOLEAN DEFAULT FALSE,
                criado_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );

            CREATE INDEX IF NOT EXISTS idx_notificacoes_usuario_data
            ON notificacoes (usuario_email, criado_em DESC);

            CREATE INDEX IF NOT EXISTS idx_notificacoes_usuario_lida
            ON notificacoes (usuario_email, lida);

            CREATE TABLE IF NOT EXISTS avaliacoes (
                id SERIAL PRIMARY KEY,
                servico_id INTEGER NOT NULL,
                avaliador_email TEXT NOT NULL,
                avaliado_email TEXT NOT NULL,
                avaliador_tipo TEXT NOT NULL,
                nota INTEGER NOT NULL CHECK (nota BETWEEN 1 AND 5),
                comentario TEXT,
                criado_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                UNIQUE (servico_id, avaliador_email)
            );

            CREATE INDEX IF NOT EXISTS idx_avaliacoes_avaliado
            ON avaliacoes (avaliado_email, criado_em DESC);
        `);


        // ====================================================
        // ÍNDICES IMPORTANTES PARA PRIVACIDADE
        // ====================================================

        await pool.query(`
            CREATE INDEX IF NOT EXISTS
                idx_servicos_empresa_email

            ON servicos (
                LOWER(empresa_email)
            );
        `);


        await pool.query(`
            CREATE INDEX IF NOT EXISTS
                idx_servicos_prestador_email

            ON servicos (
                LOWER(prestador_email)
            );
        `);


        await pool.query(`
            CREATE INDEX IF NOT EXISTS
                idx_documentos_empresa

            ON documentos_rs (
                LOWER(empresa_email)
            );
        `);


        await pool.query(`
            CREATE INDEX IF NOT EXISTS
                idx_documentos_prestador

            ON documentos_rs (
                LOWER(prestador_email)
            );
        `);


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
// CLIENTES SOB DEMANDA / JORNADA
//
// IMPORTANTE:
//
// Cada registro possui cliente_id.
//
// É esse campo que garante a separação:
// empresa X ≠ empresa Y.
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


        // ====================================================
        // COMPATIBILIDADE COM TABELAS QUE JÁ EXISTEM
        // ====================================================

        const alteracoesJornada = [

            "ALTER TABLE clientes_rs ADD COLUMN IF NOT EXISTS atualizado_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP;",

            "ALTER TABLE clientes_rs_colaboradores ADD COLUMN IF NOT EXISTS atualizado_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP;",

            "ALTER TABLE jornadas_clientes ADD COLUMN IF NOT EXISTS atualizado_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP;",

            "ALTER TABLE jornadas_clientes ADD COLUMN IF NOT EXISTS entrada_validada BOOLEAN DEFAULT FALSE;",

            "ALTER TABLE jornadas_clientes ADD COLUMN IF NOT EXISTS entrada_validada_por TEXT;",

            "ALTER TABLE jornadas_clientes ADD COLUMN IF NOT EXISTS entrada_validada_em TIMESTAMPTZ;",

            "ALTER TABLE jornadas_clientes ADD COLUMN IF NOT EXISTS saida_validada BOOLEAN DEFAULT FALSE;",

            "ALTER TABLE jornadas_clientes ADD COLUMN IF NOT EXISTS saida_validada_por TEXT;",

            "ALTER TABLE jornadas_clientes ADD COLUMN IF NOT EXISTS saida_validada_em TIMESTAMPTZ;",

            "ALTER TABLE jornadas_clientes ADD COLUMN IF NOT EXISTS fechada BOOLEAN DEFAULT FALSE;",

            "ALTER TABLE jornadas_clientes ADD COLUMN IF NOT EXISTS fechada_por TEXT;",

            "ALTER TABLE jornadas_clientes ADD COLUMN IF NOT EXISTS fechada_em TIMESTAMPTZ;",

            "ALTER TABLE jornadas_clientes ADD COLUMN IF NOT EXISTS valor_tipo TEXT DEFAULT 'dia';",

            "ALTER TABLE jornadas_clientes ADD COLUMN IF NOT EXISTS valor_base NUMERIC(12,2) DEFAULT 0;",

            "ALTER TABLE jornadas_clientes ADD COLUMN IF NOT EXISTS valor_gerado NUMERIC(12,2) DEFAULT 0;"
        ];


        for (
            const sql
            of alteracoesJornada
        ) {

            await pool.query(
                sql
            );
        }


        // ====================================================
        // ÍNDICES PARA PRIVACIDADE E PERFORMANCE
        // ====================================================

        await pool.query(`
            CREATE INDEX IF NOT EXISTS
                idx_clientes_rs_nome

            ON clientes_rs(
                nome
            );
        `);


        await pool.query(`
            CREATE INDEX IF NOT EXISTS
                idx_clientes_rs_responsavel

            ON clientes_rs(
                LOWER(responsavel_email)
            );
        `);


        await pool.query(`
            CREATE INDEX IF NOT EXISTS
                idx_colaborador_cliente

            ON clientes_rs_colaboradores(
                cliente_id
            );
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


        await pool.query(`
            CREATE INDEX IF NOT EXISTS
                idx_documentos_jornada

            ON jornadas_clientes_documentos(
                jornada_id
            );
        `);


        console.log(
            '✅ Clientes sob demanda e Jornada verificados.'
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
//
// Só gera jornadas dos colaboradores
// vinculados AO CLIENTE INFORMADO.
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
            Number(
                clienteId
            ),

            data
        ]
    );
}


// ============================================================
// BUSCAR JORNADA COMPLETA
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
                Number(
                    jornadaId
                )
            ]
        );


    return (
        resultado.rows[0]
        ||
        null
    );
}


// ============================================================
// BUSCAR CLIENTE
// ============================================================

async function buscarClienteRS(
    clienteId
) {

    const resultado =
        await pool.query(
            `
            SELECT *
            FROM clientes_rs

            WHERE
                id =
                $1

            LIMIT 1
            `,
            [
                Number(
                    clienteId
                )
            ]
        );


    return (
        resultado.rows[0]
        ||
        null
    );
}


// ============================================================
// RECALCULAR HORAS / VALOR DA JORNADA
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


        // ====================================================
        // DESCONTAR INTERVALO
        // ====================================================

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
                .toFixed(
                    2
                )
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
                        .toFixed(
                            2
                        )
                );


        } else {

            valorGerado =
                valorBase;
        }
    }


    const resultado =
        await pool.query(
            `
            UPDATE
                jornadas_clientes

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

                Number(
                    jornadaId
                )
            ]
        );


    return (
        resultado.rows[0]
        ||
        null
    );
}


// ============================================================
// PRIVACIDADE — DOCUMENTO DA JORNADA
//
// Descobre de qual cliente o documento pertence.
// ============================================================

async function buscarDocumentoJornada(
    documentoId
) {

    const resultado =
        await pool.query(
            `
            SELECT
                documento.*,

                jornada.cliente_id,

                jornada.colaborador_email

            FROM
                jornadas_clientes_documentos
                AS documento

            JOIN
                jornadas_clientes
                AS jornada

            ON
                jornada.id =
                documento.jornada_id

            WHERE
                documento.id =
                $1

            LIMIT 1
            `,
            [
                Number(
                    documentoId
                )
            ]
        );


    return (
        resultado.rows[0]
        ||
        null
    );
}


// ============================================================
// PRIVACIDADE — ACESSO AO DOCUMENTO
//
// ADMIN:
// → SIM
//
// EMPRESA DONA:
// → SIM
//
// COLABORADOR DONO DA JORNADA:
// → SIM
//
// OUTRAS EMPRESAS/PRESTADORES:
// → NÃO
// ============================================================

async function usuarioPodeAcessarDocumentoJornada(
    usuario,
    documentoId
) {

    const documento =
        await buscarDocumentoJornada(
            documentoId
        );


    if (
        !usuario ||
        !documento
    ) {

        return false;
    }


    if (
        usuario.gestorRS
    ) {

        return true;
    }


    if (
        normalizarEmail(
            documento.colaborador_email
        )
        ===
        normalizarEmail(
            usuario.email
        )
    ) {

        return true;
    }


    return usuarioPodeAcessarCliente(
        usuario,
        documento.cliente_id
    );
}


// ============================================================
// PRIVACIDADE — SERVIÇO AVULSO
//
// Prestador pode acessar se:
// - for titular
// - estiver na reserva
//
// Empresa pode acessar se:
// - for dona do serviço
//
// Gestor:
// - tudo
// ============================================================

function prestadorEstaNaReserva(
    servico,
    email
) {

    const emailNormalizado =
        normalizarEmail(
            email
        );


    const reservas =
        parseReservas(
            servico?.reservas
        );


    return reservas.some(
        reserva => {

            const emailReserva =
                normalizarEmail(
                    typeof reserva ===
                    'string'

                        ?

                        reserva

                        :

                        reserva?.email
                        ||
                        reserva?.prestadorEmail
                        ||
                        reserva?.prestador_email
                );


            return (
                emailReserva ===
                emailNormalizado
            );
        }
    );
}


// ============================================================
// USUÁRIO PODE ACESSAR SERVIÇO PRIVADO?
// ============================================================

function usuarioPodeAcessarServicoPrivado(
    usuario,
    servico
) {

    if (
        !usuario ||
        !servico
    ) {

        return false;
    }


    if (
        usuario.gestorRS
    ) {

        return true;
    }


    const email =
        normalizarEmail(
            usuario.email
        );


    if (
        normalizarEmail(
            servico.empresa_email
        )
        ===
        email
    ) {

        return true;
    }


    if (
        normalizarEmail(
            servico.prestador_email
        )
        ===
        email
    ) {

        return true;
    }


    if (
        prestadorEstaNaReserva(
            servico,
            email
        )
    ) {

        return true;
    }


    return false;
}


// ============================================================
// RESUMO SEGURO PARA O RADAR
//
// O prestador pode ver as informações da vaga,
// mas NÃO precisa receber dados administrativos
// privados da empresa.
// ============================================================

function servicoPublicoRadar(
    servico
) {

    if (!servico) {

        return null;
    }


    return {

        id:
            servico.id,

        titulo:
            servico.titulo,

        categoria:
            servico.categoria,

        local:
            servico.local,

        cidade:
            servico.cidade,

        endereco:
            servico.endereco,

        valor:
            servico.valor,

        valor_diaria:
            servico.valor_diaria,

        valor_liquido:
            servico.valor_liquido,

        data_horario:
            servico.data_horario,

        horario_fim:
            servico.horario_fim,

        forma_pgto:
            servico.forma_pgto,

        descricao:
            servico.descricao,

        empresa_nome:
            servico.empresa_nome,

        recorrencia:
            servico.recorrencia,

        status:
            servico.status,

        prestador_nome:
            servico.prestador_nome,

        reservas:
            parseReservas(
                servico.reservas
            )
                .map(
                    reserva => {

                        if (
                            typeof reserva ===
                            'string'
                        ) {

                            return {
                                ocupado:
                                    true
                            };
                        }


                        return {
                            ocupado:
                                true,

                            nome:
                                reserva?.nome
                                ||
                                'Reserva'
                        };
                    }
                )
    };
}


// ============================================================
// HEALTH
// ============================================================

app.get(
    '/api/health',

    async (
        req,
        res
    ) => {

        try {

            await pool.query(
                'SELECT 1'
            );


            return res.json({

                sucesso:
                    true,

                sistema:
                    'RS Connect',

                banco:
                    'online',

                privacidade:
                    'ativa',

                horario:
                    horaAtualRS()
            });


        } catch (err) {

            return res
                .status(
                    500
                )
                .json({

                    sucesso:
                        false,

                    erro:
                        err.message
                });
        }
    }
);


// ============================================================
// FIM DA PARTE 2
//
// PARTE 3:
// LOGIN + CADASTRO + RECUPERAÇÃO DE SENHA
// + TOKEN DE SESSÃO
// ============================================================
// ============================================================
// RS CONNECT — SERVER.JS
// VERSÃO COM PRIVACIDADE POR EMPRESA
//
// PARTE 3
//
// CADASTRO + LOGIN + TOKEN
// SESSÃO + ALTERAÇÃO DE SENHA
// RECUPERAÇÃO POR E-MAIL
// ============================================================


// ============================================================
// NORMALIZAR TIPO DO CADASTRO PÚBLICO
//
// IMPORTANTE:
//
// NINGUÉM PODE SE CADASTRAR COMO ADMIN
// PELO INDEX OU CHAMANDO A API MANUALMENTE.
// ============================================================

function tipoCadastroPermitido(
    tipo
) {

    const valor =
        String(
            tipo ||
            ''
        )
            .trim()
            .toLowerCase();


    if (
        [
            'empresa',
            'prestador',
            'colaborador'
        ].includes(
            valor
        )
    ) {

        return valor;
    }


    return 'prestador';
}


// ============================================================
// CADASTRO
// ============================================================

async function cadastrarUsuarioRS(
    req,
    res
) {

    const dados =
        req.body ||
        {};


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


    const tipo =
        tipoCadastroPermitido(
            dados.tipo
        );


    const aceiteTermos =
        dados.aceite_termos === true ||
        dados.aceiteTermos === true;


    if (
        !email ||
        !nome ||
        !senha
    ) {

        return res
            .status(
                400
            )
            .json({

                sucesso:
                    false,

                erro:
                    'Nome, e-mail e senha são obrigatórios.'
            });
    }


    if (
        senha.length <
        6
    ) {

        return res
            .status(
                400
            )
            .json({

                sucesso:
                    false,

                erro:
                    'A senha precisa ter no mínimo 6 caracteres.'
            });
    }


    if (!aceiteTermos) {
        return res.status(400).json({
            sucesso: false,
            erro: 'É necessário aceitar os Termos de Uso e a Política de Privacidade.'
        });
    }


    if (tipo === 'empresa' && (!String(dados.doc||'').trim() || !String(dados.responsavel||'').trim() || !String(dados.endereco||'').trim())) {
        return res.status(400).json({sucesso:false, erro:'Informe CNPJ, responsável e endereço da empresa.'});
    }


    if ((tipo === 'prestador' || tipo === 'colaborador') && (!String(dados.doc||'').trim() || !String(dados.profissao||'').trim())) {
        return res.status(400).json({sucesso:false, erro:'Informe CPF e profissão principal.'});
    }


    try {

        const existente =
            await pool.query(
                `
                SELECT
                    id

                FROM
                    usuarios

                WHERE
                    LOWER(
                        TRIM(email)
                    )
                    =
                    LOWER(
                        TRIM($1)
                    )

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
                .status(
                    409
                )
                .json({

                    sucesso:
                        false,

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
                    descricao,
                    cadastro_status,
                    aceite_termos,
                    aceite_termos_em,
                    termos_versao,
                    atualizado_em
                )

                VALUES (
                    $1,$2,$3,$4,
                    $5,$6,$7,$8,
                    $9,$10,$11,$12,
                    $13,$14,$15,$16,$17,
                    TRUE,CURRENT_TIMESTAMP,'2026-09',
                    CURRENT_TIMESTAMP
                )

                RETURNING *
                `,
                [
                    tipo,

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
                    '',

                    'pendente'
                ]
            );


        // ====================================================
        // PRESTADOR / COLABORADOR
        // ====================================================

        if (
            tipo ===
            'prestador'
            ||
            tipo ===
            'colaborador'
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


        const usuarioBanco =
            resultado.rows[0];


        const usuario = {
            ...usuarioBanco
        };


        delete usuario.senha;


        await registrarAuditoria(
            email,
            'CADASTRO',
            `Novo usuário cadastrado como ${tipo}.`
        );


        const gestores = await pool.query(`
            SELECT email FROM usuarios
            WHERE LOWER(COALESCE(tipo,'')) IN ('admin','administrador','gestor','grupo_rs','grupo rs')
               OR LOWER(email)=LOWER($1)
        `, [normalizarEmail(process.env.ADMIN_EMAIL)]);

        for (const gestor of gestores.rows) {
            await registrarNotificacaoUsuario(
                gestor.email,
                'novo_cadastro_pendente',
                {mensagem:`${nome} solicitou cadastro como ${tipo}.`}
            );
        }


        return res.json({

            sucesso:
                true,

            pendenteAprovacao:
                true,

            mensagem:
                'Cadastro enviado. Aguarde a aprovação do Grupo RS para entrar.',

            usuario
        });


    } catch (err) {

        console.error(
            '❌ Cadastro:',
            err
        );


        return res
            .status(
                500
            )
            .json({

                sucesso:
                    false,

                erro:
                    'Erro ao cadastrar usuário.'
            });
    }
}


// ============================================================
// ROTAS DE CADASTRO
// ============================================================

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
//
// AGORA DEVOLVE:
//
// token
// usuario
// contexto de privacidade
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
            .status(
                400
            )
            .json({

                sucesso:
                    false,

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
                    LOWER(
                        TRIM(email)
                    )
                    =
                    LOWER(
                        TRIM($1)
                    )

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
                .status(
                    401
                )
                .json({

                    sucesso:
                        false,

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
                .status(
                    401
                )
                .json({

                    sucesso:
                        false,

                    erro:
                        'E-mail ou senha incorretos.'
                });
        }


        const cadastroStatus =
            String(
                usuarioBanco.cadastro_status ||
                'aprovado'
            )
                .trim()
                .toLowerCase();


        if (cadastroStatus !== 'aprovado') {
            return res
                .status(403)
                .json({
                    sucesso: false,
                    pendenteAprovacao: cadastroStatus === 'pendente',
                    erro: cadastroStatus === 'rejeitado'
                        ? 'Este cadastro não foi aprovado. Entre em contato com o Grupo RS.'
                        : 'Seu cadastro está aguardando aprovação do Grupo RS.'
                });
        }


        // ====================================================
        // MIGRAR SENHAS ANTIGAS AUTOMATICAMENTE
        // ====================================================

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
                        $1,

                    atualizado_em =
                        CURRENT_TIMESTAMP

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


        // ====================================================
        // TOKEN ASSINADO
        // ====================================================

        const token =
            gerarTokenUsuario(
                usuarioBanco
            );


        const usuario = {
            ...usuarioBanco
        };


        delete usuario.senha;


        // ====================================================
        // CONTEXTO DE PRIVACIDADE
        // ====================================================

        const usuarioSeguro = {

            id:
                Number(
                    usuarioBanco.id
                ),

            nome:
                usuarioBanco.nome,

            email:
                normalizarEmail(
                    usuarioBanco.email
                ),

            tipo:
                String(
                    usuarioBanco.tipo ||
                    ''
                )
                    .trim()
                    .toLowerCase(),

            gestorRS:
                usuarioEhGestorRS(
                    usuarioBanco
                ),

            prestador:
                usuarioEhPrestador(
                    usuarioBanco
                )
        };


        const contexto =
            await obterContextoPrivacidade(
                usuarioSeguro
            );


        await registrarAuditoria(
            email,
            'LOGIN',
            'Login realizado com sucesso.'
        );


        console.log(
            `✅ LOGIN OK: ${email}`
        );


        return res.json({

            sucesso:
                true,

            token,

            usuario,

            privacidade: {

                gestorRS:
                    contexto.gestorRS,

                empresaCliente:
                    contexto.empresaCliente,

                prestador:
                    contexto.prestador,

                clienteId:
                    contexto.clienteId
            }
        });


    } catch (err) {

        console.error(
            '❌ Erro login:',
            err
        );


        return res
            .status(
                500
            )
            .json({

                sucesso:
                    false,

                erro:
                    'Erro interno no login.'
            });
    }
}


// ============================================================
// ROTAS DE LOGIN
// ============================================================

app.post(
    '/api/login',
    loginUsuarioRS
);


app.post(
    '/api/auth/login',
    loginUsuarioRS
);


// ============================================================
// VERIFICAR SESSÃO
//
// O INDEX poderá chamar essa rota ao abrir o aplicativo.
//
// Se token estiver válido:
// mantém login.
//
// Se estiver vencido:
// pede login novamente.
// ============================================================

app.get(
    '/api/auth/sessao',

    autenticarUsuario,

    async (
        req,
        res
    ) => {

        try {

            const contexto =
                await obterContextoPrivacidade(
                    req.usuario
                );


            return res.json({

                sucesso:
                    true,

                usuario:
                    req.usuario,

                privacidade: {

                    gestorRS:
                        contexto.gestorRS,

                    empresaCliente:
                        contexto.empresaCliente,

                    prestador:
                        contexto.prestador,

                    clienteId:
                        contexto.clienteId
                }
            });


        } catch (err) {

            console.error(
                '❌ Sessão:',
                err
            );


            return res
                .status(
                    500
                )
                .json({

                    sucesso:
                        false,

                    erro:
                        'Erro ao verificar sessão.'
                });
        }
    }
);


// ============================================================
// ALTERAR A PRÓPRIA SENHA
//
// IMPORTANTE:
//
// NÃO ACEITAMOS MAIS O E-MAIL DO BODY
// PARA DECIDIR QUAL CONTA ALTERAR.
//
// A CONTA VEM DO TOKEN.
// ============================================================

async function alterarSenhaRS(
    req,
    res
) {

    const email =
        normalizarEmail(
            req.usuario?.email
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
            .status(
                400
            )
            .json({

                sucesso:
                    false,

                erro:
                    'Informe a senha atual e a nova senha.'
            });
    }


    if (
        novaSenha.length <
        6
    ) {

        return res
            .status(
                400
            )
            .json({

                sucesso:
                    false,

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
                    id =
                    $1

                LIMIT 1
                `,
                [
                    req.usuario.id
                ]
            );


        const usuario =
            resultado.rows[0];


        if (!usuario) {

            return res
                .status(
                    404
                )
                .json({

                    sucesso:
                        false,

                    erro:
                        'Usuário não encontrado.'
                });
        }


        if (
            !verificarSenha(
                senhaAtual,
                usuario.senha
            )
        ) {

            return res
                .status(
                    401
                )
                .json({

                    sucesso:
                        false,

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
                    $1,

                atualizado_em =
                    CURRENT_TIMESTAMP

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
            'Senha alterada pelo próprio usuário.'
        );


        return res.json({

            sucesso:
                true,

            mensagem:
                'Senha alterada com sucesso.'
        });


    } catch (err) {

        console.error(
            '❌ Alterar senha:',
            err
        );


        return res
            .status(
                500
            )
            .json({

                sucesso:
                    false,

                erro:
                    'Erro ao alterar senha.'
            });
    }
}


// ============================================================
// ALTERAÇÃO DE SENHA EXIGE TOKEN
// ============================================================

app.post(
    '/api/alterar-senha',
    autenticarUsuario,
    alterarSenhaRS
);


app.post(
    '/api/auth/alterar-senha',
    autenticarUsuario,
    alterarSenhaRS
);


// ============================================================
// REDEFINIR SENHA DE OUTRA CONTA — SUPORTE DO GRUPO RS
//
// Exige sessão de administrador e confirma novamente a senha
// atual antes de permitir a alteração.
// ============================================================

app.post(
    '/api/admin/redefinir-senha-segura',

    autenticarUsuario,

    async (
        req,
        res
    ) => {

        const adminEmail =
            normalizarEmail(
                req.body?.adminEmail
            );


        const adminSenha =
            String(
                req.body?.adminSenha ||
                ''
            );


        const emailAlvo =
            normalizarEmail(
                req.body?.email
            );


        const novaSenha =
            String(
                req.body?.novaSenha ||
                ''
            );


        if (!req.usuario?.gestorRS) {

            return responderAcessoNegado(
                res,
                'Somente o Grupo RS pode redefinir a senha de outra conta.'
            );
        }


        if (
            adminEmail !==
            normalizarEmail(req.usuario.email)
        ) {

            return res
                .status(403)
                .json({
                    sucesso: false,
                    erro: 'O administrador informado não corresponde à sessão atual.'
                });
        }


        if (
            !adminSenha ||
            !emailAlvo ||
            novaSenha.length < 6
        ) {

            return res
                .status(400)
                .json({
                    sucesso: false,
                    erro: 'Confira os dados. A nova senha deve ter no mínimo 6 caracteres.'
                });
        }


        try {

            const adminResultado =
                await pool.query(
                    `SELECT * FROM usuarios WHERE id = $1 LIMIT 1`,
                    [req.usuario.id]
                );


            const admin =
                adminResultado.rows[0];


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
                        erro: 'Senha atual do administrador incorreta.'
                    });
            }


            const alvoResultado =
                await pool.query(
                    `
                    SELECT id, email
                    FROM usuarios
                    WHERE LOWER(TRIM(email)) = LOWER(TRIM($1))
                    LIMIT 1
                    `,
                    [emailAlvo]
                );


            const alvo =
                alvoResultado.rows[0];


            if (!alvo) {

                return res
                    .status(404)
                    .json({
                        sucesso: false,
                        erro: 'Conta não encontrada.'
                    });
            }


            await pool.query(
                `
                UPDATE usuarios
                SET senha = $1, atualizado_em = CURRENT_TIMESTAMP
                WHERE id = $2
                `,
                [
                    gerarHashSenha(novaSenha),
                    alvo.id
                ]
            );


            await registrarAuditoria(
                req.usuario.email,
                'ADMIN_REDEFINIR_SENHA',
                `Senha redefinida para ${normalizarEmail(alvo.email)}.`
            );


            return res.json({
                sucesso: true,
                mensagem: 'Senha redefinida com segurança.'
            });


        } catch (err) {

            console.error(
                '❌ Redefinir senha pelo administrador:',
                err
            );


            return res
                .status(500)
                .json({
                    sucesso: false,
                    erro: 'Não foi possível redefinir a senha.'
                });
        }
    }
);


// ============================================================
// ESQUECI MINHA SENHA
//
// NÃO PRECISA ESTAR LOGADO.
//
// 1. Informa e-mail.
// 2. Código de 6 números.
// 3. Expira em 15 minutos.
// 4. Cria nova senha.
// ============================================================

app.post(
    '/api/auth/esqueci-senha',

    async (
        req,
        res
    ) => {

        const email =
            normalizarEmail(
                req.body?.email
            );


        if (!email) {

            return res
                .status(
                    400
                )
                .json({

                    sucesso:
                        false,

                    erro:
                        'Informe o e-mail da conta.'
                });
        }


        try {

            const usuarioRes =
                await pool.query(
                    `
                    SELECT
                        id,
                        nome,
                        email

                    FROM usuarios

                    WHERE
                        LOWER(
                            TRIM(email)
                        )
                        =
                        LOWER(
                            TRIM($1)
                        )

                    LIMIT 1
                    `,
                    [
                        email
                    ]
                );


            // =================================================
            // RESPOSTA NEUTRA
            //
            // NÃO REVELA SE O E-MAIL EXISTE.
            // =================================================

            if (
                !usuarioRes.rows.length
            ) {

                return res.json({

                    sucesso:
                        true,

                    mensagem:
                        'Se o e-mail estiver cadastrado, você receberá um código de recuperação.'
                });
            }


            // =================================================
            // LIMITE DE SOLICITAÇÕES
            //
            // MÁXIMO 3 EM 15 MINUTOS.
            // =================================================

            const limiteRes =
                await pool.query(
                    `
                    SELECT
                        COUNT(*)::int
                        AS total

                    FROM recuperacao_senha

                    WHERE
                        LOWER(email)
                        =
                        LOWER($1)

                    AND
                        criado_em
                        >
                        CURRENT_TIMESTAMP
                        -
                        INTERVAL '15 minutes'
                    `,
                    [
                        email
                    ]
                );


            const totalRecentes =
                Number(
                    limiteRes.rows[0]?.total ||
                    0
                );


            if (
                totalRecentes >=
                3
            ) {

                return res
                    .status(
                        429
                    )
                    .json({

                        sucesso:
                            false,

                        erro:
                            'Muitas solicitações. Aguarde alguns minutos antes de tentar novamente.'
                    });
            }


            // =================================================
            // GERAR CÓDIGO
            // =================================================

            const codigo =
                String(
                    crypto.randomInt(
                        100000,
                        1000000
                    )
                );


            const codigoHash =
                hashCodigoRecuperacao(
                    email,
                    codigo
                );


            // =================================================
            // INVALIDAR CÓDIGOS ANTERIORES
            // =================================================

            await pool.query(
                `
                UPDATE recuperacao_senha

                SET
                    usado =
                        TRUE

                WHERE
                    LOWER(email)
                    =
                    LOWER($1)

                AND
                    usado =
                        FALSE
                `,
                [
                    email
                ]
            );


            // =================================================
            // SALVAR NOVO CÓDIGO
            // =================================================

            await pool.query(
                `
                INSERT INTO recuperacao_senha (
                    email,
                    codigo_hash,
                    usado,
                    tentativas,
                    expira_em
                )

                VALUES (
                    $1,
                    $2,
                    FALSE,
                    0,
                    CURRENT_TIMESTAMP
                    +
                    INTERVAL '15 minutes'
                )
                `,
                [
                    email,
                    codigoHash
                ]
            );


            // =================================================
            // ENVIAR E-MAIL
            // =================================================

            try {

                await enviarEmailRecuperacao(
                    email,
                    codigo
                );


            } catch (emailErr) {

                console.error(
                    '❌ Envio recuperação:',
                    emailErr
                );


                // Invalidar código se o e-mail não saiu.
                await pool.query(
                    `
                    UPDATE recuperacao_senha

                    SET
                        usado =
                            TRUE

                    WHERE
                        LOWER(email)
                        =
                        LOWER($1)

                    AND
                        codigo_hash =
                            $2

                    AND
                        usado =
                            FALSE
                    `,
                    [
                        email,
                        codigoHash
                    ]
                );


                return res
                    .status(
                        503
                    )
                    .json({

                        sucesso:
                            false,

                        erro:
                            'O serviço de recuperação por e-mail ainda não está configurado. Procure o suporte do Grupo RS.'
                    });
            }


            await registrarAuditoria(
                email,
                'SOLICITAR_RECUPERACAO_SENHA',
                'Código de recuperação solicitado.'
            );


            console.log(
                `📧 Código de recuperação enviado para ${email}`
            );


            return res.json({

                sucesso:
                    true,

                mensagem:
                    'Código enviado para seu e-mail. Ele expira em 15 minutos.'
            });


        } catch (err) {

            console.error(
                '❌ Esqueci senha:',
                err
            );


            return res
                .status(
                    500
                )
                .json({

                    sucesso:
                        false,

                    erro:
                        'Não foi possível iniciar a recuperação de senha.'
                });
        }
    }
);


// ============================================================
// REDEFINIR SENHA COM CÓDIGO
// ============================================================

app.post(
    '/api/auth/redefinir-senha',

    async (
        req,
        res
    ) => {

        const email =
            normalizarEmail(
                req.body?.email
            );


        const codigo =
            String(
                req.body?.codigo ||
                ''
            )
                .trim();


        const novaSenha =
            String(
                req.body?.novaSenha ||
                req.body?.nova_senha ||
                ''
            );


        if (
            !email ||
            !codigo ||
            !novaSenha
        ) {

            return res
                .status(
                    400
                )
                .json({

                    sucesso:
                        false,

                    erro:
                        'Informe e-mail, código e nova senha.'
                });
        }


        if (
            !/^\d{6}$/
                .test(
                    codigo
                )
        ) {

            return res
                .status(
                    400
                )
                .json({

                    sucesso:
                        false,

                    erro:
                        'O código deve conter 6 números.'
                });
        }


        if (
            novaSenha.length <
            6
        ) {

            return res
                .status(
                    400
                )
                .json({

                    sucesso:
                        false,

                    erro:
                        'A nova senha precisa ter no mínimo 6 caracteres.'
                });
        }


        try {

            const tokenRes =
                await pool.query(
                    `
                    SELECT *
                    FROM recuperacao_senha

                    WHERE
                        LOWER(email)
                        =
                        LOWER($1)

                    AND
                        usado =
                        FALSE

                    ORDER BY
                        criado_em DESC

                    LIMIT 1
                    `,
                    [
                        email
                    ]
                );


            const recuperacao =
                tokenRes.rows[0];


            if (!recuperacao) {

                return res
                    .status(
                        400
                    )
                    .json({

                        sucesso:
                            false,

                        erro:
                            'Código inválido ou já utilizado.'
                    });
            }


            // =================================================
            // EXPIRAÇÃO
            // =================================================

            if (
                new Date(
                    recuperacao.expira_em
                )
                <
                new Date()
            ) {

                await pool.query(
                    `
                    UPDATE recuperacao_senha

                    SET
                        usado =
                            TRUE

                    WHERE
                        id =
                            $1
                    `,
                    [
                        recuperacao.id
                    ]
                );


                return res
                    .status(
                        400
                    )
                    .json({

                        sucesso:
                            false,

                        erro:
                            'Este código expirou. Solicite um novo código.'
                    });
            }


            // =================================================
            // MÁXIMO 5 TENTATIVAS
            // =================================================

            if (
                Number(
                    recuperacao.tentativas ||
                    0
                )
                >=
                5
            ) {

                await pool.query(
                    `
                    UPDATE recuperacao_senha

                    SET
                        usado =
                            TRUE

                    WHERE
                        id =
                            $1
                    `,
                    [
                        recuperacao.id
                    ]
                );


                return res
                    .status(
                        429
                    )
                    .json({

                        sucesso:
                            false,

                        erro:
                            'Número máximo de tentativas atingido. Solicite um novo código.'
                    });
            }


            const codigoHash =
                hashCodigoRecuperacao(
                    email,
                    codigo
                );


            const hashBancoBuffer =
                Buffer.from(
                    String(
                        recuperacao.codigo_hash ||
                        ''
                    ),
                    'hex'
                );


            const hashCodigoBuffer =
                Buffer.from(
                    String(
                        codigoHash ||
                        ''
                    ),
                    'hex'
                );


            let hashCorreto =
                false;


            if (
                hashBancoBuffer.length ===
                hashCodigoBuffer.length
                &&
                hashBancoBuffer.length >
                0
            ) {

                hashCorreto =
                    crypto.timingSafeEqual(
                        hashBancoBuffer,
                        hashCodigoBuffer
                    );
            }


            if (
                !hashCorreto
            ) {

                await pool.query(
                    `
                    UPDATE recuperacao_senha

                    SET
                        tentativas =
                            tentativas + 1

                    WHERE
                        id =
                            $1
                    `,
                    [
                        recuperacao.id
                    ]
                );


                return res
                    .status(
                        400
                    )
                    .json({

                        sucesso:
                            false,

                        erro:
                            'Código incorreto.'
                    });
            }


            // =================================================
            // LOCALIZAR CONTA
            // =================================================

            const usuarioRes =
                await pool.query(
                    `
                    SELECT
                        id,
                        nome,
                        email

                    FROM usuarios

                    WHERE
                        LOWER(
                            TRIM(email)
                        )
                        =
                        LOWER(
                            TRIM($1)
                        )

                    LIMIT 1
                    `,
                    [
                        email
                    ]
                );


            const usuario =
                usuarioRes.rows[0];


            if (!usuario) {

                return res
                    .status(
                        404
                    )
                    .json({

                        sucesso:
                            false,

                        erro:
                            'Conta não encontrada.'
                    });
            }


            const novaSenhaHash =
                gerarHashSenha(
                    novaSenha
                );


            // =================================================
            // TRANSAÇÃO
            // =================================================

            const clienteBanco =
                await pool.connect();


            try {

                await clienteBanco.query(
                    'BEGIN'
                );


                await clienteBanco.query(
                    `
                    UPDATE usuarios

                    SET
                        senha =
                            $1,

                        atualizado_em =
                            CURRENT_TIMESTAMP

                    WHERE
                        id =
                            $2
                    `,
                    [
                        novaSenhaHash,
                        usuario.id
                    ]
                );


                await clienteBanco.query(
                    `
                    UPDATE recuperacao_senha

                    SET
                        usado =
                            TRUE

                    WHERE
                        LOWER(email)
                        =
                        LOWER($1)

                    AND
                        usado =
                            FALSE
                    `,
                    [
                        email
                    ]
                );


                await clienteBanco.query(
                    'COMMIT'
                );


            } catch (txErr) {

                await clienteBanco.query(
                    'ROLLBACK'
                );


                throw txErr;


            } finally {

                clienteBanco.release();
            }


            await registrarAuditoria(
                email,
                'REDEFINIR_SENHA_AUTOATENDIMENTO',
                'Senha redefinida pelo próprio usuário através de código enviado por e-mail.'
            );


            console.log(
                `✅ Senha recuperada pelo próprio usuário: ${email}`
            );


            return res.json({

                sucesso:
                    true,

                mensagem:
                    'Senha redefinida com sucesso. Você já pode entrar no RS Connect.'
            });


        } catch (err) {

            console.error(
                '❌ Redefinir senha:',
                err
            );


            return res
                .status(
                    500
                )
                .json({

                    sucesso:
                        false,

                    erro:
                        'Não foi possível redefinir a senha.'
                });
        }
    }
);


// ============================================================
// FIM DA PARTE 3
//
// PARTE 4:
// SERVIÇOS / VAGAS
// + PRIVACIDADE ENTRE EMPRESAS
// + RADAR DO PRESTADOR
// + FILA / TITULAR / RESERVAS
// ============================================================
// ============================================================
// RS CONNECT — SERVER.JS
// VERSÃO COM PRIVACIDADE POR EMPRESA
//
// PARTE 4
//
// SERVIÇOS / VAGAS
// RADAR + PRIVACIDADE
// PUBLICAÇÃO + TITULAR + RESERVAS
// SAIR DA VAGA
// ============================================================


// ============================================================
// SERVIÇO VISÍVEL PARA O PRESTADOR
//
// NÃO DEVOLVE:
//
// e-mail interno da empresa
// WhatsApp administrativo
// PIX de outro prestador
// documentos internos
// informações financeiras administrativas
// ============================================================

function servicoParaPrestador(
    servico
) {

    if (!servico) {
        return null;
    }


    const emailPrestador =
        normalizarEmail(
            servico.prestador_email
        );


    return {

        id:
            servico.id,

        titulo:
            servico.titulo,

        categoria:
            servico.categoria,

        local:
            servico.local,

        cidade:
            servico.cidade,

        endereco:
            servico.endereco,

        valor:
            servico.valor,

        valor_diaria:
            servico.valor_diaria,

        valor_liquido:
            servico.valor_liquido,

        data_horario:
            servico.data_horario,

        horario_fim:
            servico.horario_fim,

        forma_pgto:
            servico.forma_pgto,

        descricao:
            servico.descricao,

        recorrencia:
            servico.recorrencia,

        status:
            servico.status,

        empresa_nome:
            servico.empresa_nome,

        responsavel_servico:
            servico.responsavel_servico,

        prestador_nome:
            servico.prestador_nome,

        prestador_email:
            emailPrestador,

        reservas:
            parseReservas(
                servico.reservas
            )
                .map(
                    reserva => {

                        if (
                            typeof reserva ===
                            'string'
                        ) {

                            return {
                                ocupado:
                                    true
                            };
                        }


                        return {

                            ocupado:
                                true,

                            nome:
                                reserva?.nome
                                ||
                                'Reserva'
                        };
                    }
                ),

        presenca_confirmada:
            Boolean(
                servico.presenca_confirmada
            ),

        presenca_hora:
            servico.presenca_hora,

        status_checkin:
            servico.status_checkin,

        checkin_hora:
            servico.checkin_hora,

        intervalo_inicio:
            servico.intervalo_inicio,

        intervalo_fim:
            servico.intervalo_fim,

        intervalo_retorno:
            servico.intervalo_retorno,

        em_intervalo:
            Boolean(
                servico.em_intervalo
            ),

        checkout_hora:
            servico.checkout_hora,

        validado_empresa:
            Boolean(
                servico.validado_empresa
            ),

        pagamento_autorizado:
            Boolean(
                servico.pagamento_autorizado
            ),

        pagamento_realizado:
            Boolean(
                servico.pagamento_realizado
            )
    };
}


// ============================================================
// LISTAR SERVIÇOS
//
// ADMIN / GRUPO RS:
// → todos
//
// EMPRESA:
// → somente serviços criados por ela
//
// PRESTADOR:
// → Radar + serviços em que está envolvido
//
// UMA EMPRESA NUNCA RECEBE SERVIÇO DA OUTRA.
// ============================================================

app.get(
    '/api/servicos',

    autenticarUsuario,

    async (
        req,
        res
    ) => {

        try {

            const usuario =
                req.usuario;


            // =================================================
            // GRUPO RS / ADMIN
            // =================================================

            if (
                usuario.gestorRS
            ) {

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
            }


            // =================================================
            // EMPRESA
            //
            // SERVIÇOS SOMENTE DA PRÓPRIA CONTA.
            // =================================================

            if (
                usuario.tipo ===
                'empresa'
            ) {

                const resultado =
                    await pool.query(
                        `
                        SELECT *
                        FROM servicos

                        WHERE
                            LOWER(
                                empresa_email
                            )
                            =
                            LOWER($1)

                        ORDER BY
                            id DESC
                        `,
                        [
                            usuario.email
                        ]
                    );


                return res.json(
                    resultado.rows
                );
            }


            // =================================================
            // PRESTADOR
            //
            // O RADAR PODE MOSTRAR VAGAS DISPONÍVEIS,
            // MAS COM DADOS CONTROLADOS.
            // =================================================

            const resultado =
                await pool.query(
                    `
                    SELECT *
                    FROM servicos

                    WHERE

                        LOWER(
                            COALESCE(
                                status,
                                ''
                            )
                        )
                        NOT IN (
                            'cancelado'
                        )

                    ORDER BY
                        id DESC
                    `
                );


            const lista =
                resultado.rows
                    .filter(
                        servico => {

                            const status =
                                String(
                                    servico.status ||
                                    ''
                                )
                                    .toLowerCase();


                            const ehTitular =
                                normalizarEmail(
                                    servico.prestador_email
                                )
                                ===
                                usuario.email;


                            const ehReserva =
                                prestadorEstaNaReserva(
                                    servico,
                                    usuario.email
                                );


                            // Serviço ativo aparece no Radar.
                            if (
                                status ===
                                'ativo'
                                ||
                                status ===
                                'aguardando_confirmacao'
                            ) {

                                return true;
                            }


                            // Serviços em andamento/finalizados
                            // aparecem apenas para quem participou.
                            return (
                                ehTitular ||
                                ehReserva
                            );
                        }
                    )
                    .map(
                        servico =>
                            servicoParaPrestador(
                                servico
                            )
                    );


            return res.json(
                lista
            );


        } catch (err) {

            console.error(
                '❌ Erro ao buscar serviços:',
                err
            );


            return res
                .status(
                    500
                )
                .json({

                    sucesso:
                        false,

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

    autenticarUsuario,

    async (
        req,
        res
    ) => {

        try {

            const servico =
                await buscarServico(
                    Number(
                        req.params.id
                    )
                );


            if (!servico) {

                return res
                    .status(
                        404
                    )
                    .json({

                        sucesso:
                            false,

                        erro:
                            'Serviço não encontrado.'
                    });
            }


            const usuario =
                req.usuario;


            // =================================================
            // ADMIN
            // =================================================

            if (
                usuario.gestorRS
            ) {

                return res.json({

                    sucesso:
                        true,

                    servico
                });
            }


            // =================================================
            // EMPRESA
            //
            // SÓ SERVIÇO DELA.
            // =================================================

            if (
                usuario.tipo ===
                'empresa'
            ) {

                if (
                    normalizarEmail(
                        servico.empresa_email
                    )
                    !==
                    usuario.email
                ) {

                    return responderAcessoNegado(
                        res,
                        'Este serviço pertence a outra empresa.'
                    );
                }


                return res.json({

                    sucesso:
                        true,

                    servico
                });
            }


            // =================================================
            // PRESTADOR
            //
            // Só recebe versão controlada.
            // =================================================

            const status =
                String(
                    servico.status ||
                    ''
                )
                    .toLowerCase();


            const envolvido =
                usuarioPodeAcessarServicoPrivado(
                    usuario,
                    servico
                );


            if (
                !envolvido
                &&
                ![
                    'ativo',
                    'aguardando_confirmacao'
                ].includes(
                    status
                )
            ) {

                return responderAcessoNegado(
                    res
                );
            }


            return res.json({

                sucesso:
                    true,

                servico:
                    servicoParaPrestador(
                        servico
                    )
            });


        } catch (err) {

            console.error(
                '❌ Buscar serviço:',
                err
            );


            return res
                .status(
                    500
                )
                .json({

                    sucesso:
                        false,

                    erro:
                        'Erro ao buscar serviço.'
                });
        }
    }
);


// ============================================================
// PUBLICAR SERVIÇO
//
// A EMPRESA NÃO ESCOLHE MAIS:
// empresa_email
//
// O SERVER PEGA DO TOKEN.
//
// Isso impede Empresa X de cadastrar
// serviço fingindo ser Empresa Y.
// ============================================================

app.post(
    '/api/servicos',

    autenticarUsuario,

    async (
        req,
        res
    ) => {

        const dados =
            req.body ||
            {};


        try {

            // =================================================
            // SOMENTE EMPRESA OU GRUPO RS
            // =================================================

            if (
                !req.usuario.gestorRS
                &&
                req.usuario.tipo !==
                'empresa'
            ) {

                return responderAcessoNegado(
                    res,
                    'Somente empresas podem publicar serviços.'
                );
            }


            const empresaEmail =
                req.usuario.email;


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
                    .trim()
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


            // =================================================
            // NOME DA EMPRESA VEM DO USUÁRIO LOGADO
            // =================================================

            const usuarioEmpresaRes =
                await pool.query(
                    `
                    SELECT
                        nome,
                        whatsapp

                    FROM usuarios

                    WHERE
                        id =
                        $1

                    LIMIT 1
                    `,
                    [
                        req.usuario.id
                    ]
                );


            const empresaUsuario =
                usuarioEmpresaRes.rows[0];


            let empresaNome =
                String(
                    empresaUsuario?.nome ||
                    dados.empresaNome ||
                    dados.empresa_nome ||
                    'Empresa'
                )
                    .trim();


            const empresaWhatsapp =
                String(
                    empresaUsuario?.whatsapp ||
                    dados.empresaWhatsapp ||
                    dados.empresa_whatsapp ||
                    ''
                )
                    .trim();


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
                        status,
                        atualizado_em
                    )

                    VALUES (
                        $1,$2,$3,$4,$5,
                        $6,$7,$8,$9,$10,
                        $11,$12,$13,$14,$15,
                        $16,$17,$18,$19,$20,
                        'ativo',
                        CURRENT_TIMESTAMP
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

                        empresaWhatsapp,

                        dados.responsavelServico ||
                        dados.responsavel_servico ||
                        empresaNome,

                        dados.whatsappResponsavel ||
                        dados.whatsapp_responsavel ||
                        empresaWhatsapp,

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


            emitirAtualizacaoEmpresa(
                empresaEmail,
                'meus_servicos_atualizados',
                {
                    servicoId:
                        servico.id
                }
            );


            return res.json({

                sucesso:
                    true,

                servico
            });


        } catch (err) {

            console.error(
                '❌ Publicar serviço:',
                err
            );


            return res
                .status(
                    500
                )
                .json({

                    sucesso:
                        false,

                    erro:
                        'Erro ao publicar serviço: ' +
                        err.message
                });
        }
    }
);


// ============================================================
// ACEITAR VAGA
//
// NÃO USA MAIS:
//
// req.body.email
// req.body.prestadorEmail
//
// USA O TOKEN.
// ============================================================

app.post(
    '/api/servicos/:id/aceitar',

    autenticarUsuario,

    async (
        req,
        res
    ) => {

        const servicoId =
            Number(
                req.params.id
            );


        try {

            if (
                req.usuario.gestorRS
                ||
                req.usuario.tipo ===
                'empresa'
            ) {

                return responderAcessoNegado(
                    res,
                    'Somente prestadores podem aceitar vagas.'
                );
            }


            const servico =
                await buscarServico(
                    servicoId
                );


            if (!servico) {

                return res
                    .status(
                        404
                    )
                    .json({

                        sucesso:
                            false,

                        erro:
                            'Serviço não encontrado.'
                    });
            }


            const prestadorEmail =
                req.usuario.email;


            // =================================================
            // DADOS DO PRESTADOR VÊM DO BANCO
            // =================================================

            const prestadorRes =
                await pool.query(
                    `
                    SELECT
                        nome,
                        pix,
                        whatsapp

                    FROM usuarios

                    WHERE
                        id =
                        $1

                    LIMIT 1
                    `,
                    [
                        req.usuario.id
                    ]
                );


            const prestadorBanco =
                prestadorRes.rows[0];


            const prestadorNome =
                String(
                    prestadorBanco?.nome ||
                    prestadorEmail
                );


            const prestadorPix =
                String(
                    prestadorBanco?.pix ||
                    ''
                );


            const prestadorWhatsapp =
                String(
                    prestadorBanco?.whatsapp ||
                    ''
                );


            const statusServico =
                String(
                    servico.status ||
                    ''
                )
                    .toLowerCase();


            if (
                [
                    'cancelado',
                    'finalizado',
                    'pago'
                ].includes(
                    statusServico
                )
            ) {

                return res
                    .status(
                        409
                    )
                    .json({

                        sucesso:
                            false,

                        erro:
                            'Esta vaga não está mais disponível.'
                    });
            }


            let reservas =
                parseReservas(
                    servico.reservas
                );


            if (
                prestadorEhTitular(
                    servico,
                    prestadorEmail
                )
            ) {

                return res
                    .status(
                        409
                    )
                    .json({

                        sucesso:
                            false,

                        erro:
                            'Você já é o Titular desta vaga.'
                    });
            }


            const jaReserva =
                prestadorEstaNaReserva(
                    servico,
                    prestadorEmail
                );


            if (
                jaReserva
            ) {

                return res
                    .status(
                        409
                    )
                    .json({

                        sucesso:
                            false,

                        erro:
                            'Você já está na reserva desta vaga.'
                    });
            }


            // =================================================
            // PRIMEIRO PRESTADOR = TITULAR
            // =================================================

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

                            prestador_id =
                                $5,

                            status =
                                'aguardando_confirmacao',

                            atualizado_em =
                                CURRENT_TIMESTAMP

                        WHERE
                            id =
                                $6

                        AND
                            prestador_email
                            IS NULL

                        RETURNING *
                        `,
                        [
                            prestadorEmail,

                            prestadorNome,

                            prestadorPix,

                            prestadorWhatsapp,

                            req.usuario.id,

                            servicoId
                        ]
                    );


                // Outro usuário pode ter clicado
                // ao mesmo tempo.
                if (
                    !resultado.rows.length
                ) {

                    return res
                        .status(
                            409
                        )
                        .json({

                            sucesso:
                                false,

                            erro:
                                'Outro prestador assumiu a vaga primeiro. Atualize o Radar.'
                        });
                }


                await registrarAuditoria(
                    prestadorEmail,
                    'ACEITAR_VAGA_TITULAR',
                    `Prestador assumiu como Titular do serviço #${servicoId}.`
                );


                emitirAtualizacao(
                    servicoId
                );


                emitirAtualizacaoEmpresa(
                    servico.empresa_email,
                    'prestador_assumiu_vaga',
                    {
                        servicoId,

                        prestadorNome
                    }
                );


                return res.json({

                    sucesso:
                        true,

                    mensagem:
                        'Você assumiu a vaga como Titular.',

                    posicao:
                        'titular',

                    servico:
                        servicoParaPrestador(
                            resultado.rows[0]
                        )
                });
            }


            // =================================================
            // RESERVAS
            //
            // 1 TITULAR + ATÉ 2 RESERVAS
            // =================================================

            if (
                reservas.length >=
                2
            ) {

                return res
                    .status(
                        409
                    )
                    .json({

                        sucesso:
                            false,

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
                            $1::jsonb,

                        atualizado_em =
                            CURRENT_TIMESTAMP

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

                sucesso:
                    true,

                mensagem:
                    `Você entrou como Reserva ${reservas.length}.`,

                posicao:
                    `reserva_${reservas.length}`,

                servico:
                    servicoParaPrestador(
                        resultado.rows[0]
                    )
            });


        } catch (err) {

            console.error(
                '❌ Aceitar vaga:',
                err
            );


            return res
                .status(
                    500
                )
                .json({

                    sucesso:
                        false,

                    erro:
                        'Erro ao aceitar vaga.'
                });
        }
    }
);


// ============================================================
// SAIR DA VAGA
//
// SOMENTE O PRÓPRIO PRESTADOR LOGADO.
// ============================================================

app.post(
    '/api/servicos/:id/sair-vaga',

    autenticarUsuario,

    async (
        req,
        res
    ) => {

        const servicoId =
            Number(
                req.params.id
            );


        try {

            if (
                req.usuario.tipo ===
                'empresa'
                ||
                req.usuario.gestorRS
            ) {

                return responderAcessoNegado(
                    res,
                    'Esta função é exclusiva do prestador.'
                );
            }


            const email =
                req.usuario.email;


            const servico =
                await buscarServico(
                    servicoId
                );


            if (!servico) {

                return res
                    .status(
                        404
                    )
                    .json({

                        sucesso:
                            false,

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
                    reserva => {

                        const emailReserva =
                            normalizarEmail(
                                typeof reserva ===
                                'string'

                                    ?

                                    reserva

                                    :

                                    reserva?.email
                                    ||
                                    reserva?.prestadorEmail
                                    ||
                                    reserva?.prestador_email
                            );


                        return (
                            emailReserva ===
                            email
                        );
                    }
                );


            if (
                !ehTitular
                &&
                indiceReserva ===
                -1
            ) {

                return res
                    .status(
                        400
                    )
                    .json({

                        sucesso:
                            false,

                        erro:
                            'Você não está vinculado a esta vaga.'
                    });
            }


            // =================================================
            // TITULAR
            // =================================================

            if (
                ehTitular
            ) {

                if (
                    servico.presenca_confirmada
                    ||
                    servico.checkin_hora
                    ||
                    servico.intervalo_inicio
                    ||
                    servico.checkout_hora
                ) {

                    return res
                        .status(
                            409
                        )
                        .json({

                            sucesso:
                                false,

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


                if (
                    novoTitular
                ) {

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


                    const novoUsuarioRes =
                        await pool.query(
                            `
                            SELECT id
                            FROM usuarios

                            WHERE
                                LOWER(email)
                                =
                                LOWER($1)

                            LIMIT 1
                            `,
                            [
                                novoEmail
                            ]
                        );


                    const novoUsuarioId =
                        novoUsuarioRes.rows[0]?.id
                        ||
                        null;


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

                            prestador_id =
                                $5,

                            reservas =
                                $6::jsonb,

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
                                NULL,

                            atualizado_em =
                                CURRENT_TIMESTAMP

                        WHERE
                            id =
                                $7
                        `,
                        [
                            novoEmail,

                            novoNome,

                            novoPix,

                            novoWhatsapp,

                            novoUsuarioId,

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


                    emitirAtualizacaoPrestador(
                        novoEmail,
                        'promovido_titular',
                        {
                            servicoId
                        }
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
                                NULL,

                            atualizado_em =
                                CURRENT_TIMESTAMP

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

                    sucesso:
                        true,

                    mensagem:
                        novoTitular

                            ?

                            'Você saiu da vaga. A primeira reserva virou Titular.'

                            :

                            'Você saiu da vaga. Ela voltou para o Radar.'
                });
            }


            // =================================================
            // REMOVER APENAS A PRÓPRIA RESERVA
            // =================================================

            reservas.splice(
                indiceReserva,
                1
            );


            await pool.query(
                `
                UPDATE servicos

                SET
                    reservas =
                        $1::jsonb,

                    atualizado_em =
                        CURRENT_TIMESTAMP

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

                sucesso:
                    true,

                mensagem:
                    'Você saiu da reserva.'
            });


        } catch (err) {

            console.error(
                '❌ Sair da vaga:',
                err
            );


            return res
                .status(
                    500
                )
                .json({

                    sucesso:
                        false,

                    erro:
                        'Erro ao sair da vaga.'
                });
        }
    }
);


// ============================================================
// FIM DA PARTE 4
//
// PARTE 5:
//
// PRESENÇA + CHECK-IN
// INTERVALO + RETORNO
// CHECK-OUT
// VALIDAÇÃO DA EMPRESA
//
// TUDO PROTEGIDO PELO TOKEN.
// ============================================================
// ============================================================
// RS CONNECT — SERVER.JS
// VERSÃO COM PRIVACIDADE POR EMPRESA
//
// PARTE 5
//
// PRESENÇA + CHECK-IN
// INTERVALO + RETORNO
// CHECK-OUT + VALIDAÇÃO DA EMPRESA
// ============================================================


// ============================================================
// CONFIRMAR PRESENÇA
//
// SOMENTE O TITULAR LOGADO.
// FOTO + GPS OBRIGATÓRIOS.
// ============================================================

async function confirmarPresencaRS(
    req,
    res
) {

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


        const email =
            req.usuario.email;


        if (
            !prestadorEhTitular(
                servico,
                email
            )
        ) {

            return responderAcessoNegado(
                res,
                'Somente o Titular desta vaga pode confirmar presença.'
            );
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
                servico:
                    servicoParaPrestador(
                        servico
                    )
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
            latitude === undefined
            ||
            longitude === undefined
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
                        'confirmado',

                    atualizado_em =
                        CURRENT_TIMESTAMP

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


        emitirAtualizacaoPrestador(
            email,
            'presenca_confirmada',
            {
                servicoId,
                hora
            }
        );


        emitirAtualizacaoEmpresa(
            servico.empresa_email,
            'presenca_confirmada',
            {
                servicoId,
                prestadorNome:
                    servico.prestador_nome,
                hora
            }
        );


        emitirAtualizacao(
            servicoId
        );


        return res.json({
            sucesso: true,

            mensagem:
                'Presença confirmada.',

            hora,

            servico:
                servicoParaPrestador(
                    resultado.rows[0]
                )
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


// ============================================================
// ROTAS DE PRESENÇA
// ============================================================

app.post(
    '/api/servicos/:id/confirmar-presenca',
    autenticarUsuario,
    confirmarPresencaRS
);


app.post(
    '/api/servicos/:id/presenca',
    autenticarUsuario,
    confirmarPresencaRS
);


// ============================================================
// CHECK-IN
//
// FOTO + GPS.
// SOMENTE TITULAR.
// ============================================================

app.post(
    '/api/servicos/:id/checkin',

    autenticarUsuario,

    async (
        req,
        res
    ) => {

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


            const email =
                req.usuario.email;


            if (
                !prestadorEhTitular(
                    servico,
                    email
                )
            ) {

                return responderAcessoNegado(
                    res,
                    'Somente o Titular pode registrar a entrada.'
                );
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
                latitude === undefined
                ||
                longitude === undefined
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
                            FALSE,

                        atualizado_em =
                            CURRENT_TIMESTAMP

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


            emitirAtualizacaoPrestador(
                email,
                'checkin_realizado',
                {
                    servicoId,
                    hora
                }
            );


            emitirAtualizacaoEmpresa(
                servico.empresa_email,
                'checkin_realizado',
                {
                    servicoId,
                    prestadorNome:
                        servico.prestador_nome,
                    hora
                }
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
                    servicoParaPrestador(
                        resultado.rows[0]
                    )
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
// INICIAR INTERVALO
// ============================================================

async function iniciarIntervaloRS(
    req,
    res
) {

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


        const email =
            req.usuario.email;


        if (
            !prestadorEhTitular(
                servico,
                email
            )
        ) {

            return responderAcessoNegado(
                res,
                'Somente o Titular pode iniciar o intervalo.'
            );
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
                    'em_intervalo',

                atualizado_em =
                    CURRENT_TIMESTAMP

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


        emitirAtualizacaoPrestador(
            email,
            'intervalo_iniciado',
            {
                servicoId,
                hora
            }
        );


        emitirAtualizacaoEmpresa(
            servico.empresa_email,
            'intervalo_iniciado',
            {
                servicoId,
                hora
            }
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


// ============================================================
// ROTAS DE INÍCIO DE INTERVALO
// ============================================================

app.post(
    '/api/servicos/:id/intervalo/iniciar',
    autenticarUsuario,
    iniciarIntervaloRS
);


app.post(
    '/api/servicos/:id/iniciar-intervalo',
    autenticarUsuario,
    iniciarIntervaloRS
);


// ============================================================
// RETORNAR DO INTERVALO
// ============================================================

async function retornarIntervaloRS(
    req,
    res
) {

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


        const email =
            req.usuario.email;


        if (
            !prestadorEhTitular(
                servico,
                email
            )
        ) {

            return responderAcessoNegado(
                res,
                'Somente o Titular pode retornar do intervalo.'
            );
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
                    'em_andamento',

                atualizado_em =
                    CURRENT_TIMESTAMP

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


        emitirAtualizacaoPrestador(
            email,
            'intervalo_finalizado',
            {
                servicoId,
                hora
            }
        );


        emitirAtualizacaoEmpresa(
            servico.empresa_email,
            'intervalo_finalizado',
            {
                servicoId,
                hora
            }
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


// ============================================================
// ROTAS DE RETORNO
// ============================================================

app.post(
    '/api/servicos/:id/intervalo/voltar',
    autenticarUsuario,
    retornarIntervaloRS
);


app.post(
    '/api/servicos/:id/intervalo/retornar',
    autenticarUsuario,
    retornarIntervaloRS
);


app.post(
    '/api/servicos/:id/voltar-intervalo',
    autenticarUsuario,
    retornarIntervaloRS
);


// ============================================================
// FUNÇÃO AUXILIAR DE HORÁRIOS
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


// ============================================================
// CALCULAR TEMPO TRABALHADO
//
// DESCONTA O INTERVALO.
// ============================================================

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
        entrada === null
        ||
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
            servico.intervalo_fim
            ||
            servico.intervalo_retorno
        );


    if (
        inicioIntervalo !== null
        &&
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
// CHECK-OUT
//
// FOTO + GPS OBRIGATÓRIOS.
//
// AO FINALIZAR:
// - serviço sai da área ativa no INDEX;
// - permanece salvo no banco;
// - poderá aparecer no Histórico/PDF.
// ============================================================

app.post(
    '/api/servicos/:id/checkout',

    autenticarUsuario,

    async (
        req,
        res
    ) => {

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


            const email =
                req.usuario.email;


            if (
                !prestadorEhTitular(
                    servico,
                    email
                )
            ) {

                return responderAcessoNegado(
                    res,
                    'Somente o Titular pode registrar a saída.'
                );
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
                latitude === undefined
                ||
                longitude === undefined
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
                    servico.valor_liquido
                    ||
                    servico.valor_diaria
                    ||
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
                            FALSE,

                        atualizado_em =
                            CURRENT_TIMESTAMP

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


            // ================================================
            // AVISOS PRIVADOS
            // ================================================

            emitirAtualizacaoPrestador(
                email,
                'servico_finalizado',
                {
                    servicoId,
                    checkoutHora:
                        hora,
                    totalTrabalhado:
                        tempo.texto,
                    valor
                }
            );


            emitirAtualizacaoEmpresa(
                servico.empresa_email,
                'servico_finalizado',
                {
                    servicoId,
                    prestadorNome:
                        servico.prestador_nome,
                    checkoutHora:
                        hora,
                    totalTrabalhado:
                        tempo.texto,
                    valor
                }
            );


            emitirAtualizacao(
                servicoId
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
                    servicoParaPrestador(
                        resultado.rows[0]
                    )
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
//
// SOMENTE:
//
// - EMPRESA DONA DO SERVIÇO
// - GRUPO RS / ADMIN
//
// OUTRA EMPRESA RECEBE 403.
// ============================================================

app.post(
    '/api/servicos/:id/validar',

    autenticarUsuario,

    async (
        req,
        res
    ) => {

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


            // ================================================
            // PRIVACIDADE
            // ================================================

            if (
                !req.usuario.gestorRS
                &&
                !empresaEhResponsavel(
                    servico,
                    req.usuario.email
                )
            ) {

                return responderAcessoNegado(
                    res,
                    'Somente a empresa responsável por este serviço pode validar.'
                );
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


            if (
                servico.validado_empresa
            ) {

                return res.json({
                    sucesso: true,

                    mensagem:
                        'Este serviço já foi validado.',

                    servico
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

                        jornada_aprovacao_status =
                            'aprovada',

                        jornada_correcao_motivo =
                            NULL,

                        status =
                            'validado',

                        atualizado_em =
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


            await registrarAuditoria(
                req.usuario.email,
                'VALIDAR_SERVICO',
                `Serviço #${servicoId} validado pela empresa.`
            );


            emitirAtualizacaoEmpresa(
                servico.empresa_email,
                'servico_validado',
                {
                    servicoId
                }
            );


            emitirAtualizacaoPrestador(
                servico.prestador_email,
                'servico_validado',
                {
                    servicoId
                }
            );


            emitirAtualizacao(
                servicoId
            );


            return res.json({
                sucesso: true,

                mensagem:
                    'Serviço validado com sucesso.',

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
// CANCELAR / EXCLUIR SERVIÇO ATIVO
//
// IMPORTANTE:
// - NÃO apaga fisicamente do PostgreSQL.
// - muda o status para "cancelado";
// - preserva histórico, auditoria e documentos;
// - somente Grupo RS ou a empresa dona pode cancelar;
// - serviço com check-out não pode ser cancelado.
//
// ROTAS:
// PATCH  /api/servicos/:id/cancelar
// DELETE /api/servicos/:id   (compatibilidade com INDEX antigo)
// ============================================================

async function cancelarServicoRS(
    req,
    res
) {

    const servicoId =
        Number(
            req.params.id
        );


    if (
        !Number.isInteger(
            servicoId
        )
        ||
        servicoId <= 0
    ) {

        return res
            .status(400)
            .json({
                sucesso: false,
                erro:
                    'ID do serviço inválido.'
            });
    }


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


        // ====================================================
        // PRIVACIDADE
        // Grupo RS pode cancelar qualquer serviço.
        // Empresa só pode cancelar o próprio serviço.
        // ====================================================

        if (
            !req.usuario?.gestorRS
            &&
            !empresaEhResponsavel(
                servico,
                req.usuario?.email
            )
        ) {

            return responderAcessoNegado(
                res,
                'Somente a empresa responsável por este serviço pode cancelar.'
            );
        }


        // Serviço finalizado deve permanecer no histórico.
        if (
            servico.checkout_hora
        ) {

            return res
                .status(409)
                .json({
                    sucesso: false,
                    erro:
                        'Este serviço já foi finalizado e permanece no histórico. Ele não pode ser excluído.'
                });
        }


        if (
            String(
                servico.status ||
                ''
            )
                .trim()
                .toLowerCase()
            ===
            'cancelado'
        ) {

            return res.json({
                sucesso: true,
                mensagem:
                    'Este serviço já está cancelado.',
                servico
            });
        }


        const motivo =
            String(
                req.body?.motivo
                ||
                'Cancelado pela empresa'
            )
                .trim()
            ||
            'Cancelado pela empresa';


        const resultado =
            await pool.query(
                `
                UPDATE
                    servicos

                SET
                    status =
                        'cancelado',

                    motivo_cancelamento =
                        $1,

                    atualizado_em =
                        CURRENT_TIMESTAMP

                WHERE
                    id =
                        $2

                RETURNING
                    *
                `,
                [
                    motivo,
                    servicoId
                ]
            );


        const servicoAtualizado =
            resultado.rows[0];


        await registrarAuditoria(
            req.usuario.email,
            'CANCELAR_SERVICO',
            `Serviço #${servicoId} cancelado. Motivo: ${motivo}`
        );


        emitirAtualizacaoEmpresa(
            servico.empresa_email,
            'servico_cancelado',
            {
                servicoId,
                motivo
            }
        );


        if (
            servico.prestador_email
        ) {

            emitirAtualizacaoPrestador(
                servico.prestador_email,
                'servico_cancelado',
                {
                    servicoId,
                    motivo
                }
            );
        }


        emitirAtualizacao(
            servicoId
        );


        return res.json({
            sucesso: true,
            mensagem:
                'Serviço cancelado e retirado da área ativa.',
            servico:
                servicoAtualizado
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
                    'Erro ao cancelar o serviço.'
            });
    }
}


app.patch(
    '/api/servicos/:id/cancelar',
    autenticarUsuario,
    cancelarServicoRS
);


// Compatibilidade com INDEX que ainda chama DELETE.
app.delete(
    '/api/servicos/:id',
    autenticarUsuario,
    cancelarServicoRS
);


// ============================================================
// FIM — CANCELAR / EXCLUIR SERVIÇO
// ============================================================

// ============================================================
// FIM DA PARTE 5
//
// PARTE 6:
//
// CLIENTES SOB DEMANDA
// CADASTRO DE CLIENTE
// VINCULAR COLABORADOR
// LISTAR COLABORADORES
//
// COM A PRIVACIDADE:
//
// EMPRESA X NÃO VÊ EMPRESA Y.
// ============================================================
// GRUPO RS / ADMIN
// → cadastra clientes
// → vincula colaboradores
// → vê todos
//
// RESPONSÁVEL DO CLIENTE GRATIDÃO
// → vê somente Gratidão
// → vê somente colaboradores da Gratidão
// → NÃO vê SMT, PortoX etc.

// RESPONSÁVEL DA SMT
// → vê somente SMT

// COLABORADOR / PRESTADOR
// → não vê cadastro/lista de clientes
// → verá somente a própria Jornada
// ============================================================
// RS CONNECT — SERVER.JS
// VERSÃO COM PRIVACIDADE POR EMPRESA
//
// PARTE 7
//
// JORNADA DOS CLIENTES SOB DEMANDA
//
// - JORNADA DO DIA
// - MINHA JORNADA
// - HISTÓRICO
// - CHECK-IN FOTO + GPS
// - INTERVALO
// - RETORNO
// - CHECK-OUT
// - VALIDAÇÃO PELO RESPONSÁVEL
// ============================================================


// ============================================================
// JORNADA SEGURA PARA O COLABORADOR
//
// Não devolve informações administrativas
// que não interessam ao colaborador.
// ============================================================

function jornadaParaColaborador(
    jornada
) {

    if (!jornada) {

        return null;
    }


    return {

        id:
            jornada.id,

        cliente_id:
            jornada.cliente_id,

        cliente_nome:
            jornada.cliente_nome,

        cliente_endereco:
            jornada.cliente_endereco,

        cliente_cidade:
            jornada.cliente_cidade,

        cliente_uf:
            jornada.cliente_uf,

        colaborador_nome:
            jornada.colaborador_nome,

        colaborador_email:
            jornada.colaborador_email,

        funcao:
            jornada.funcao,

        data:
            jornada.data,

        horario_previsto:
            jornada.horario_previsto,

        status:
            jornada.status,

        entrada_em:
            jornada.entrada_em,

        entrada_validada:
            Boolean(
                jornada.entrada_validada
            ),

        intervalo_inicio_em:
            jornada.intervalo_inicio_em,

        intervalo_retorno_em:
            jornada.intervalo_retorno_em,

        saida_em:
            jornada.saida_em,

        saida_validada:
            Boolean(
                jornada.saida_validada
            ),

        total_minutos:
            Number(
                jornada.total_minutos ||
                0
            ),

        total_horas:
            Number(
                jornada.total_horas ||
                0
            ),

        valor_tipo:
            jornada.valor_tipo,

        valor_base:
            numeroRS(
                jornada.valor_base
            ),

        valor_gerado:
            numeroRS(
                jornada.valor_gerado
            ),

        fechada:
            Boolean(
                jornada.fechada
            ),

        observacoes:
            jornada.observacoes
    };
}


// ============================================================
// VERIFICAR SE É O PRÓPRIO COLABORADOR
// ============================================================

function usuarioEhDonoJornada(
    usuario,
    jornada
) {

    if (
        !usuario ||
        !jornada
    ) {

        return false;
    }


    return (
        normalizarEmail(
            usuario.email
        )
        ===
        normalizarEmail(
            jornada.colaborador_email
        )
    );
}


// ============================================================
// JORNADAS DO CLIENTE
//
// GRUPO RS:
// → pode consultar qualquer cliente.
//
// RESPONSÁVEL:
// → somente o próprio cliente.
//
// PRESTADOR:
// → não pode usar esta rota administrativa.
// ============================================================

app.get(
    '/api/jornada-clientes/:id/jornadas',

    autenticarUsuario,

    async (
        req,
        res
    ) => {

        try {

            const clienteId =
                Number(
                    req.params.id
                );


            const permitido =
                await usuarioPodeAcessarCliente(
                    req.usuario,
                    clienteId
                );


            if (!permitido) {

                return responderAcessoNegado(
                    res,
                    'Você não tem permissão para visualizar jornadas deste cliente.'
                );
            }


            const data =
                String(
                    req.query?.data ||
                    dataAtualRS()
                )
                    .slice(
                        0,
                        10
                    );


            // Garante somente as jornadas
            // daquele cliente.
            await garantirJornadasDiaCliente(
                clienteId,
                data
            );


            const jornadas =
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
                            AS cliente_uf

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
                        jornada.cliente_id =
                        $1

                    AND
                        jornada.data =
                        $2::date

                    ORDER BY
                        jornada.colaborador_nome
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

                sucesso:
                    true,

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

                    sucesso:
                        false,

                    erro:
                        'Erro ao carregar jornadas.'
                });
        }
    }
);


// ============================================================
// HISTÓRICO DO CLIENTE
//
// Empresa X só pesquisa histórico da Empresa X.
// ============================================================

app.get(
    '/api/jornada-clientes/:id/historico',

    autenticarUsuario,

    async (
        req,
        res
    ) => {

        try {

            const clienteId =
                Number(
                    req.params.id
                );


            const permitido =
                await usuarioPodeAcessarCliente(
                    req.usuario,
                    clienteId
                );


            if (!permitido) {

                return responderAcessoNegado(
                    res,
                    'Você não tem acesso ao histórico deste cliente.'
                );
            }


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
                        SELECT

                            jornada.*,

                            cliente.nome
                                AS cliente_nome

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
                            jornada.cliente_id =
                            $1

                        AND
                            LOWER(
                                jornada.colaborador_email
                            )
                            =
                            LOWER($2)

                        ORDER BY
                            jornada.data DESC,
                            jornada.id DESC

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
                        SELECT

                            jornada.*,

                            cliente.nome
                                AS cliente_nome

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
                            jornada.cliente_id =
                            $1

                        ORDER BY
                            jornada.data DESC,
                            jornada.colaborador_nome

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

                sucesso:
                    true,

                jornadas:
                    resultado.rows
            });


        } catch (err) {

            console.error(
                '❌ Histórico Jornada:',
                err
            );


            return res
                .status(500)
                .json({

                    sucesso:
                        false,

                    erro:
                        'Erro ao carregar histórico.'
                });
        }
    }
);


// ============================================================
// MINHA JORNADA DE HOJE
//
// ROTA NOVA E SEGURA.
//
// NÃO RECEBE E-MAIL.
//
// O SERVER SABE QUEM É PELO TOKEN.
// ============================================================

async function carregarMinhaJornadaHoje(
    req,
    res
) {

    try {

        if (
            req.usuario.gestorRS
            ||
            req.usuario.tipo ===
            'empresa'
        ) {

            return responderAcessoNegado(
                res,
                'Esta área é exclusiva do colaborador.'
            );
        }


        const email =
            req.usuario.email;


        const data =
            dataAtualRS();


        // ====================================================
        // DESCOBRIR VÍNCULOS DO PRÓPRIO COLABORADOR
        // ====================================================

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


        // ====================================================
        // GARANTIR JORNADA SOMENTE NOS CLIENTES
        // EM QUE ELE ESTÁ REALMENTE VINCULADO.
        // ====================================================

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
                        AS cliente_uf

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

            sucesso:
                true,

            data,

            jornadas:
                resultado.rows
                    .map(
                        jornada =>
                            jornadaParaColaborador(
                                jornada
                            )
                    )
        });


    } catch (err) {

        console.error(
            '❌ Minha Jornada:',
            err
        );


        return res
            .status(500)
            .json({

                sucesso:
                    false,

                erro:
                    'Erro ao carregar sua jornada.'
            });
    }
}


// ============================================================
// ROTA PRINCIPAL NOVA
// ============================================================

app.get(
    '/api/minha-jornada/hoje',
    autenticarUsuario,
    carregarMinhaJornadaHoje
);


// ============================================================
// COMPATIBILIDADE COM INDEX ANTIGO
//
// Mesmo que alguém altere:
//
// /api/jornada-colaborador/outro@email.com/hoje
//
// O SERVER IGNORA O E-MAIL DA URL
// E USA O TOKEN.
//
// Isso fecha a brecha.
// ============================================================

app.get(
    '/api/jornada-colaborador/:email/hoje',

    autenticarUsuario,

    carregarMinhaJornadaHoje
);


// ============================================================
// HISTÓRICO DO PRÓPRIO COLABORADOR
// ============================================================

app.get(
    '/api/minha-jornada/historico',

    autenticarUsuario,

    async (
        req,
        res
    ) => {

        try {

            if (
                req.usuario.gestorRS
                ||
                req.usuario.tipo ===
                'empresa'
            ) {

                return responderAcessoNegado(
                    res,
                    'Esta área é exclusiva do colaborador.'
                );
            }


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
                            AS cliente_uf

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

                    ORDER BY
                        jornada.data DESC,
                        jornada.id DESC

                    LIMIT
                        $2
                    `,
                    [
                        req.usuario.email,
                        limite
                    ]
                );


            return res.json({

                sucesso:
                    true,

                jornadas:
                    resultado.rows
                        .map(
                            jornada =>
                                jornadaParaColaborador(
                                    jornada
                                )
                        )
            });


        } catch (err) {

            console.error(
                '❌ Histórico colaborador:',
                err
            );


            return res
                .status(500)
                .json({

                    sucesso:
                        false,

                    erro:
                        'Erro ao carregar seu histórico.'
                });
        }
    }
);


// ============================================================
// CHECK-IN — CLIENTE SOB DEMANDA
//
// SOMENTE O PRÓPRIO COLABORADOR.
//
// FOTO + GPS OBRIGATÓRIOS.
// ============================================================

app.post(
    '/api/jornada-fixa/:id/checkin',

    autenticarUsuario,

    async (
        req,
        res
    ) => {

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

                        sucesso:
                            false,

                        erro:
                            'Jornada não encontrada.'
                    });
            }


            // =================================================
            // NÃO CONFIA NO E-MAIL DO BODY
            // =================================================

            if (
                !usuarioEhDonoJornada(
                    req.usuario,
                    jornada
                )
            ) {

                return responderAcessoNegado(
                    res,
                    'Esta jornada pertence a outro colaborador.'
                );
            }


            if (
                jornada.fechada
            ) {

                return res
                    .status(409)
                    .json({

                        sucesso:
                            false,

                        erro:
                            'Esta jornada está fechada.'
                    });
            }


            if (
                jornada.entrada_em
            ) {

                return res
                    .status(409)
                    .json({

                        sucesso:
                            false,

                        erro:
                            'A entrada já foi registrada.'
                    });
            }


            const foto =
                req.body?.foto
                ||
                req.body?.selfie
                ||
                req.body?.imagem
                ||
                '';


            const latitude =
                req.body?.latitude
                ??
                req.body?.lat;


            const longitude =
                req.body?.longitude
                ??
                req.body?.lng;


            const precisao =
                req.body?.precisao
                ??
                req.body?.accuracy
                ??
                '';


            if (!foto) {

                return res
                    .status(400)
                    .json({

                        sucesso:
                            false,

                        erro:
                            'A foto de entrada é obrigatória.'
                    });
            }


            if (
                latitude === undefined
                ||
                longitude === undefined
            ) {

                return res
                    .status(400)
                    .json({

                        sucesso:
                            false,

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

                    AND
                        fechada =
                        FALSE

                    AND
                        entrada_em
                        IS NULL

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


            if (
                !resultado.rows.length
            ) {

                return res
                    .status(409)
                    .json({

                        sucesso:
                            false,

                        erro:
                            'Não foi possível registrar a entrada. Atualize sua Jornada.'
                    });
            }


            await registrarAuditoria(
                req.usuario.email,
                'JORNADA_CHECKIN',
                `Entrada registrada na jornada #${jornadaId}.`
            );


            await emitirAtualizacaoClienteJornada(
                jornada.cliente_id,
                {
                    acao:
                        'CHECKIN',

                    jornadaId,

                    colaboradorEmail:
                        req.usuario.email
                }
            );


            emitirAtualizacaoPrestador(
                req.usuario.email,
                'minha_jornada_atualizada',
                {
                    jornadaId
                }
            );


            return res.json({

                sucesso:
                    true,

                mensagem:
                    'Entrada registrada com foto e GPS.',

                jornada:
                    jornadaParaColaborador({
                        ...jornada,
                        ...resultado.rows[0]
                    })
            });


        } catch (err) {

            console.error(
                '❌ Check-in Jornada:',
                err
            );


            return res
                .status(500)
                .json({

                    sucesso:
                        false,

                    erro:
                        'Erro ao registrar entrada.'
                });
        }
    }
);


// ============================================================
// INICIAR INTERVALO
//
// SOMENTE O PRÓPRIO COLABORADOR.
// ============================================================

app.post(
    '/api/jornada-fixa/:id/intervalo/iniciar',

    autenticarUsuario,

    async (
        req,
        res
    ) => {

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

                        sucesso:
                            false,

                        erro:
                            'Jornada não encontrada.'
                    });
            }


            if (
                !usuarioEhDonoJornada(
                    req.usuario,
                    jornada
                )
            ) {

                return responderAcessoNegado(
                    res,
                    'Esta jornada pertence a outro colaborador.'
                );
            }


            if (
                jornada.fechada
            ) {

                return res
                    .status(409)
                    .json({

                        sucesso:
                            false,

                        erro:
                            'Esta jornada está fechada.'
                    });
            }


            if (
                !jornada.entrada_em
            ) {

                return res
                    .status(409)
                    .json({

                        sucesso:
                            false,

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

                        sucesso:
                            false,

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

                        sucesso:
                            false,

                        erro:
                            'O intervalo já foi iniciado.'
                    });
            }


            const resultado =
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

                    AND
                        fechada =
                        FALSE

                    AND
                        intervalo_inicio_em
                        IS NULL

                    RETURNING *
                    `,
                    [
                        jornadaId
                    ]
                );


            if (
                !resultado.rows.length
            ) {

                return res
                    .status(409)
                    .json({

                        sucesso:
                            false,

                        erro:
                            'Não foi possível iniciar o intervalo.'
                    });
            }


            await registrarAuditoria(
                req.usuario.email,
                'JORNADA_INTERVALO_INICIO',
                `Intervalo iniciado na jornada #${jornadaId}.`
            );


            await emitirAtualizacaoClienteJornada(
                jornada.cliente_id,
                {
                    acao:
                        'INTERVALO_INICIADO',

                    jornadaId
                }
            );


            emitirAtualizacaoPrestador(
                req.usuario.email,
                'minha_jornada_atualizada',
                {
                    jornadaId
                }
            );


            return res.json({

                sucesso:
                    true,

                mensagem:
                    'Intervalo iniciado.',

                jornada:
                    jornadaParaColaborador({
                        ...jornada,
                        ...resultado.rows[0]
                    })
            });


        } catch (err) {

            console.error(
                '❌ Iniciar intervalo Jornada:',
                err
            );


            return res
                .status(500)
                .json({

                    sucesso:
                        false,

                    erro:
                        'Erro ao iniciar intervalo.'
                });
        }
    }
);


// ============================================================
// RETORNAR DO INTERVALO
// ============================================================

app.post(
    '/api/jornada-fixa/:id/intervalo/retornar',

    autenticarUsuario,

    async (
        req,
        res
    ) => {

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

                        sucesso:
                            false,

                        erro:
                            'Jornada não encontrada.'
                    });
            }


            if (
                !usuarioEhDonoJornada(
                    req.usuario,
                    jornada
                )
            ) {

                return responderAcessoNegado(
                    res,
                    'Esta jornada pertence a outro colaborador.'
                );
            }


            if (
                jornada.fechada
            ) {

                return res
                    .status(409)
                    .json({

                        sucesso:
                            false,

                        erro:
                            'Esta jornada está fechada.'
                    });
            }


            if (
                !jornada.intervalo_inicio_em
            ) {

                return res
                    .status(409)
                    .json({

                        sucesso:
                            false,

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

                        sucesso:
                            false,

                        erro:
                            'O retorno já foi registrado.'
                    });
            }


            if (
                jornada.saida_em
            ) {

                return res
                    .status(409)
                    .json({

                        sucesso:
                            false,

                        erro:
                            'A jornada já terminou.'
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

                        intervalo_retorno_em =
                            CURRENT_TIMESTAMP,

                        atualizado_em =
                            CURRENT_TIMESTAMP

                    WHERE
                        id =
                        $1

                    AND
                        fechada =
                        FALSE

                    AND
                        intervalo_retorno_em
                        IS NULL

                    RETURNING *
                    `,
                    [
                        jornadaId
                    ]
                );


            if (
                !resultado.rows.length
            ) {

                return res
                    .status(409)
                    .json({

                        sucesso:
                            false,

                        erro:
                            'Não foi possível registrar o retorno.'
                    });
            }


            await registrarAuditoria(
                req.usuario.email,
                'JORNADA_INTERVALO_RETORNO',
                `Retorno registrado na jornada #${jornadaId}.`
            );


            await emitirAtualizacaoClienteJornada(
                jornada.cliente_id,
                {
                    acao:
                        'INTERVALO_RETORNO',

                    jornadaId
                }
            );


            emitirAtualizacaoPrestador(
                req.usuario.email,
                'minha_jornada_atualizada',
                {
                    jornadaId
                }
            );


            return res.json({

                sucesso:
                    true,

                mensagem:
                    'Retorno do intervalo registrado.',

                jornada:
                    jornadaParaColaborador({
                        ...jornada,
                        ...resultado.rows[0]
                    })
            });


        } catch (err) {

            console.error(
                '❌ Retorno Jornada:',
                err
            );


            return res
                .status(500)
                .json({

                    sucesso:
                        false,

                    erro:
                        'Erro ao registrar retorno.'
                });
        }
    }
);


// ============================================================
// CHECK-OUT
//
// SOMENTE O PRÓPRIO COLABORADOR.
// FOTO + GPS OBRIGATÓRIOS.
// ============================================================

app.post(
    '/api/jornada-fixa/:id/checkout',

    autenticarUsuario,

    async (
        req,
        res
    ) => {

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

                        sucesso:
                            false,

                        erro:
                            'Jornada não encontrada.'
                    });
            }


            if (
                !usuarioEhDonoJornada(
                    req.usuario,
                    jornada
                )
            ) {

                return responderAcessoNegado(
                    res,
                    'Esta jornada pertence a outro colaborador.'
                );
            }


            if (
                jornada.fechada
            ) {

                return res
                    .status(409)
                    .json({

                        sucesso:
                            false,

                        erro:
                            'Esta jornada está fechada.'
                    });
            }


            if (
                !jornada.entrada_em
            ) {

                return res
                    .status(409)
                    .json({

                        sucesso:
                            false,

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

                        sucesso:
                            false,

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

                        sucesso:
                            false,

                        erro:
                            'Registre o retorno do intervalo antes da saída.'
                    });
            }


            const foto =
                req.body?.foto
                ||
                req.body?.selfie
                ||
                req.body?.imagem
                ||
                '';


            const latitude =
                req.body?.latitude
                ??
                req.body?.lat;


            const longitude =
                req.body?.longitude
                ??
                req.body?.lng;


            const precisao =
                req.body?.precisao
                ??
                req.body?.accuracy
                ??
                '';


            if (!foto) {

                return res
                    .status(400)
                    .json({

                        sucesso:
                            false,

                        erro:
                            'A foto de saída é obrigatória.'
                    });
            }


            if (
                latitude === undefined
                ||
                longitude === undefined
            ) {

                return res
                    .status(400)
                    .json({

                        sucesso:
                            false,

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

                    AND
                        fechada =
                        FALSE

                    AND
                        saida_em
                        IS NULL

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


            if (
                !resultado.rows.length
            ) {

                return res
                    .status(409)
                    .json({

                        sucesso:
                            false,

                        erro:
                            'Não foi possível registrar a saída.'
                    });
            }


            const atualizada =
                await recalcularJornadaCliente(
                    jornadaId
                );


            await registrarAuditoria(
                req.usuario.email,
                'JORNADA_CHECKOUT',
                `Saída registrada na jornada #${jornadaId}.`
            );


            await emitirAtualizacaoClienteJornada(
                jornada.cliente_id,
                {
                    acao:
                        'CHECKOUT',

                    jornadaId
                }
            );


            emitirAtualizacaoPrestador(
                req.usuario.email,
                'minha_jornada_atualizada',
                {
                    jornadaId
                }
            );


            return res.json({

                sucesso:
                    true,

                mensagem:
                    'Saída registrada. Horas e valor calculados.',

                jornada:
                    jornadaParaColaborador({
                        ...jornada,
                        ...atualizada
                    })
            });


        } catch (err) {

            console.error(
                '❌ Checkout Jornada:',
                err
            );


            return res
                .status(500)
                .json({

                    sucesso:
                        false,

                    erro:
                        'Erro ao registrar saída.'
                });
        }
    }
);


// ============================================================
// VALIDAR ENTRADA / SAÍDA
//
// REGRA PRINCIPAL:
//
// SOMENTE O RESPONSÁVEL CADASTRADO DO CLIENTE
// PODE VALIDAR.
//
// O GRUPO RS / ADMIN TAMBÉM POSSUI ACESSO
// ADMINISTRATIVO PARA SUPORTE.
//
// EMPRESA X NÃO VALIDA EMPRESA Y.
// ============================================================

app.post(
    '/api/jornada-fixa/:id/validar',

    autenticarUsuario,

    async (
        req,
        res
    ) => {

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
                    .trim()
                    .toLowerCase();


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

                        sucesso:
                            false,

                        erro:
                            'Tipo de validação inválido.'
                    });
            }


            const jornada =
                await buscarJornadaCliente(
                    jornadaId
                );


            if (!jornada) {

                return res
                    .status(404)
                    .json({

                        sucesso:
                            false,

                        erro:
                            'Jornada não encontrada.'
                    });
            }


            // =================================================
            // RESPONSÁVEL DO CLIENTE
            // =================================================

            const ehResponsavel =
                normalizarEmail(
                    jornada.responsavel_email
                )
                ===
                normalizarEmail(
                    req.usuario.email
                );


            if (
                !ehResponsavel
                &&
                !req.usuario.gestorRS
            ) {

                return responderAcessoNegado(
                    res,
                    'Somente o responsável deste cliente pode validar.'
                );
            }


            // =================================================
            // ENTRADA
            // =================================================

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

                            sucesso:
                                false,

                            erro:
                                'Não existe entrada para validar.'
                        });
                }


                if (
                    jornada.entrada_validada
                ) {

                    return res.json({

                        sucesso:
                            true,

                        mensagem:
                            'A entrada já está validada.'
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
                        req.usuario.email,
                        jornadaId
                    ]
                );


            } else {

                // =============================================
                // SAÍDA
                // =============================================

                if (
                    !jornada.saida_em
                ) {

                    return res
                        .status(409)
                        .json({

                            sucesso:
                                false,

                            erro:
                                'Não existe saída para validar.'
                        });
                }


                if (
                    jornada.saida_validada
                ) {

                    return res.json({

                        sucesso:
                            true,

                        mensagem:
                            'A saída já está validada.'
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
                        req.usuario.email,
                        jornadaId
                    ]
                );
            }


            await registrarAuditoria(
                req.usuario.email,

                tipo ===
                'entrada'

                    ?

                    'VALIDAR_ENTRADA_JORNADA'

                    :

                    'VALIDAR_SAIDA_JORNADA',

                `Jornada #${jornadaId}.`
            );


            await emitirAtualizacaoClienteJornada(
                jornada.cliente_id,
                {
                    acao:
                        tipo ===
                        'entrada'

                            ?

                            'ENTRADA_VALIDADA'

                            :

                            'SAIDA_VALIDADA',

                    jornadaId
                }
            );


            emitirAtualizacaoPrestador(
                jornada.colaborador_email,
                'minha_jornada_atualizada',
                {
                    jornadaId
                }
            );


            return res.json({

                sucesso:
                    true,

                mensagem:
                    tipo ===
                    'entrada'

                        ?

                        'Entrada validada com sucesso.'

                        :

                        'Saída validada com sucesso.'
            });


        } catch (err) {

            console.error(
                '❌ Validação Jornada:',
                err
            );


            return res
                .status(500)
                .json({

                    sucesso:
                        false,

                    erro:
                        'Erro ao validar jornada.'
                });
        }
    }
);


// ============================================================
// FECHAR E ARQUIVAR O DIA
//
// GRUPO RS OU RESPONSÁVEL DO PRÓPRIO CLIENTE.
//
// NÃO APAGA NADA.
//
// APENAS:
// fechada = TRUE
//
// Depois fica disponível no Histórico.
// ============================================================

app.post(
    '/api/jornada-clientes/:id/fechar-dia',

    autenticarUsuario,

    async (
        req,
        res
    ) => {

        try {

            const clienteId =
                Number(
                    req.params.id
                );


            const permitido =
                await usuarioPodeAcessarCliente(
                    req.usuario,
                    clienteId
                );


            if (!permitido) {

                return responderAcessoNegado(
                    res,
                    'Você não pode fechar a jornada deste cliente.'
                );
            }


            const data =
                String(
                    req.body?.data ||
                    dataAtualRS()
                )
                    .slice(
                        0,
                        10
                    );


            // =================================================
            // NÃO FECHA COM JORNADA ABERTA
            // =================================================

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

                        sucesso:
                            false,

                        erro:
                            'Existem colaboradores com jornada aberta.'
                    });
            }


            const fechamento =
                await pool.query(
                    `
                    INSERT INTO
                        fechamentos_clientes (
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

                        req.usuario.email,

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
                    req.usuario.email,
                    clienteId,
                    data
                ]
            );


            await registrarAuditoria(
                req.usuario.email,
                'FECHAR_DIA_CLIENTE',
                `Cliente #${clienteId}, data ${data}.`
            );


            await emitirAtualizacaoClienteJornada(
                clienteId,
                {
                    acao:
                        'DIA_FECHADO',

                    data
                }
            );


            return res.json({

                sucesso:
                    true,

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

                    sucesso:
                        false,

                    erro:
                        'Erro ao fechar o dia.'
                });
        }
    }
);


// ============================================================
// FIM DA PARTE 7
//
// PARTE 8:
//
// DOCUMENTOS DA JORNADA
// PDF
// ASSINATURA
// DOWNLOAD PROTEGIDO
// PRIVACIDADE DOS DOCUMENTOS
//
// EMPRESA X NÃO VÊ DOCUMENTOS DA EMPRESA Y.
// ============================================================
// ============================================================
// RS CONNECT — SERVER.JS
// VERSÃO COM PRIVACIDADE POR EMPRESA
//
// PARTE 8
//
// DOCUMENTOS DA JORNADA
// CONTRATOS
// PDF
// DOCUMENTO ASSINADO
// DOWNLOAD PROTEGIDO
//
// REGRA:
// EMPRESA X NÃO ACESSA DOCUMENTO DA EMPRESA Y
// COLABORADOR SÓ ACESSA DOCUMENTO DA PRÓPRIA JORNADA
// GRUPO RS POSSUI ACESSO ADMINISTRATIVO
// ============================================================


// ============================================================
// VERIFICAR ACESSO À JORNADA / DOCUMENTOS
// ============================================================

async function usuarioPodeAcessarJornada(
    usuario,
    jornadaId
) {

    try {

        if (!usuario) {

            return false;
        }


        const resultado =
            await pool.query(
                `
                SELECT

                    jornada.id,

                    jornada.cliente_id,

                    jornada.colaborador_email,

                    cliente.responsavel_email

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


        const jornada =
            resultado.rows[0];


        if (!jornada) {

            return false;
        }


        // ====================================================
        // GRUPO RS
        // ====================================================

        if (
            usuario.gestorRS
        ) {

            return true;
        }


        // ====================================================
        // COLABORADOR DA PRÓPRIA JORNADA
        // ====================================================

        if (
            normalizarEmail(
                jornada.colaborador_email
            )
            ===
            normalizarEmail(
                usuario.email
            )
        ) {

            return true;
        }


        // ====================================================
        // RESPONSÁVEL DO PRÓPRIO CLIENTE
        // ====================================================

        if (
            normalizarEmail(
                jornada.responsavel_email
            )
            ===
            normalizarEmail(
                usuario.email
            )
        ) {

            return true;
        }


        return false;


    } catch (err) {

        console.error(
            '❌ Verificar acesso jornada:',
            err
        );


        return false;
    }
}


// ============================================================
// VERIFICAR SE PODE ADMINISTRAR DOCUMENTOS
//
// Upload e alterações:
// Grupo RS ou responsável do próprio cliente.
//
// Colaborador pode visualizar os documentos da própria jornada,
// mas não cadastrar documentos administrativos.
// ============================================================

async function usuarioPodeAdministrarDocumentosJornada(
    usuario,
    jornadaId
) {

    try {

        if (!usuario) {

            return false;
        }


        if (
            usuario.gestorRS
        ) {

            return true;
        }


        const resultado =
            await pool.query(
                `
                SELECT
                    cliente.responsavel_email

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


        const registro =
            resultado.rows[0];


        if (!registro) {

            return false;
        }


        return (
            normalizarEmail(
                registro.responsavel_email
            )
            ===
            normalizarEmail(
                usuario.email
            )
        );


    } catch (err) {

        console.error(
            '❌ Permissão documentos:',
            err
        );


        return false;
    }
}


// ============================================================
// LISTAR DOCUMENTOS DA JORNADA
//
// IMPORTANTE:
// NÃO DEVOLVE O CONTEÚDO BYTEA DO PDF.
//
// Só devolve os dados necessários para a tela.
// ============================================================

app.get(
    '/api/jornada-fixa/:id/documentos',

    autenticarUsuario,

    async (
        req,
        res
    ) => {

        try {

            const jornadaId =
                Number(
                    req.params.id
                );


            if (
                !Number.isInteger(
                    jornadaId
                )
                ||
                jornadaId <= 0
            ) {

                return res
                    .status(400)
                    .json({

                        sucesso:
                            false,

                        erro:
                            'Jornada inválida.'
                    });
            }


            const permitido =
                await usuarioPodeAcessarJornada(
                    req.usuario,
                    jornadaId
                );


            if (!permitido) {

                return responderAcessoNegado(
                    res,
                    'Você não tem permissão para visualizar documentos desta jornada.'
                );
            }


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
                        criado_em DESC,
                        id DESC
                    `,
                    [
                        jornadaId
                    ]
                );


            return res.json({

                sucesso:
                    true,

                documentos:
                    resultado.rows
            });


        } catch (err) {

            console.error(
                '❌ Listar documentos Jornada:',
                err
            );


            return res
                .status(500)
                .json({

                    sucesso:
                        false,

                    erro:
                        'Erro ao carregar documentos.'
                });
        }
    }
);


// ============================================================
// UPLOAD DE DOCUMENTO / CONTRATO
//
// SOMENTE:
// - GRUPO RS
// - RESPONSÁVEL DO PRÓPRIO CLIENTE
//
// PDF OBRIGATÓRIO
// ============================================================

app.post(
    '/api/jornada-fixa/:id/documentos',

    autenticarUsuario,

    upload.single(
        'arquivo'
    ),

    async (
        req,
        res
    ) => {

        try {

            const jornadaId =
                Number(
                    req.params.id
                );


            if (
                !Number.isInteger(
                    jornadaId
                )
                ||
                jornadaId <= 0
            ) {

                return res
                    .status(400)
                    .json({

                        sucesso:
                            false,

                        erro:
                            'Jornada inválida.'
                    });
            }


            const permitido =
                await usuarioPodeAdministrarDocumentosJornada(
                    req.usuario,
                    jornadaId
                );


            if (!permitido) {

                return responderAcessoNegado(
                    res,
                    'Você não tem permissão para adicionar documentos nesta jornada.'
                );
            }


            if (
                !req.file?.buffer
            ) {

                return res
                    .status(400)
                    .json({

                        sucesso:
                            false,

                        erro:
                            'Selecione um arquivo PDF.'
                    });
            }


            const nome =
                String(
                    req.file.originalname
                    ||
                    `documento-${jornadaId}.pdf`
                )
                    .trim();


            const mime =
                String(
                    req.file.mimetype
                    ||
                    ''
                )
                    .toLowerCase();


            // =================================================
            // VALIDAR PDF
            // =================================================

            const parecePDF =
                mime ===
                'application/pdf'
                ||
                nome
                    .toLowerCase()
                    .endsWith(
                        '.pdf'
                    );


            if (!parecePDF) {

                return res
                    .status(400)
                    .json({

                        sucesso:
                            false,

                        erro:
                            'Somente arquivos PDF são permitidos.'
                    });
            }


            // =================================================
            // LIMITE DE SEGURANÇA
            // 10 MB POR DOCUMENTO
            // =================================================

            const limiteDocumento =
                10 *
                1024 *
                1024;


            if (
                req.file.buffer.length
                >
                limiteDocumento
            ) {

                return res
                    .status(413)
                    .json({

                        sucesso:
                            false,

                        erro:
                            'O PDF ultrapassa o limite de 10 MB.'
                    });
            }


            const tipo =
                String(
                    req.body?.tipo
                    ||
                    'CONTRATO'
                )
                    .trim()
                    .toUpperCase()
                    .slice(
                        0,
                        80
                    );


            const resultado =
                await pool.query(
                    `
                    INSERT INTO
                        jornadas_clientes_documentos (
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

                        mime,

                        assinatura_status,

                        criado_por,

                        criado_em
                    `,
                    [
                        jornadaId,

                        tipo,

                        nome,

                        'application/pdf',

                        req.file.buffer,

                        req.usuario.email
                    ]
                );


            await registrarAuditoria(
                req.usuario.email,
                'DOCUMENTO_JORNADA_ENVIADO',
                `Documento enviado para jornada #${jornadaId}: ${nome}`
            );


            return res.json({

                sucesso:
                    true,

                mensagem:
                    'Documento vinculado à jornada com sucesso.',

                documento:
                    resultado.rows[0]
            });


        } catch (err) {

            console.error(
                '❌ Upload documento Jornada:',
                err
            );


            return res
                .status(500)
                .json({

                    sucesso:
                        false,

                    erro:
                        'Erro ao salvar documento.'
                });
        }
    }
);


// ============================================================
// BUSCAR DOCUMENTO PELO ID
//
// Esta função NÃO libera o arquivo.
//
// Primeiro localiza:
// documento -> jornada -> cliente
//
// Depois as rotas verificam permissão.
// ============================================================

async function buscarDocumentoJornada(
    documentoId
) {

    const resultado =
        await pool.query(
            `
            SELECT

                documento.*,

                jornada.cliente_id,

                jornada.colaborador_email,

                cliente.responsavel_email,

                cliente.nome
                    AS cliente_nome

            FROM
                jornadas_clientes_documentos
                AS documento

            JOIN
                jornadas_clientes
                AS jornada

            ON
                jornada.id =
                documento.jornada_id

            JOIN
                clientes_rs
                AS cliente

            ON
                cliente.id =
                jornada.cliente_id

            WHERE
                documento.id =
                $1

            LIMIT 1
            `,
            [
                documentoId
            ]
        );


    return (
        resultado.rows[0]
        ||
        null
    );
}


// ============================================================
// VERIFICAR ACESSO DIRETO AO DOCUMENTO
// ============================================================

function usuarioPodeAcessarDocumento(
    usuario,
    documento
) {

    if (
        !usuario
        ||
        !documento
    ) {

        return false;
    }


    // GRUPO RS

    if (
        usuario.gestorRS
    ) {

        return true;
    }


    const emailUsuario =
        normalizarEmail(
            usuario.email
        );


    // COLABORADOR DA JORNADA

    if (
        emailUsuario
        ===
        normalizarEmail(
            documento.colaborador_email
        )
    ) {

        return true;
    }


    // RESPONSÁVEL DO CLIENTE

    if (
        emailUsuario
        ===
        normalizarEmail(
            documento.responsavel_email
        )
    ) {

        return true;
    }


    return false;
}


// ============================================================
// DOWNLOAD / VISUALIZAÇÃO DO PDF
//
// NÃO EXISTE DOWNLOAD PÚBLICO.
//
// PRECISA ESTAR LOGADO.
// ============================================================

app.get(
    '/api/jornada-documentos/:id/arquivo',

    autenticarUsuario,

    async (
        req,
        res
    ) => {

        try {

            const documentoId =
                Number(
                    req.params.id
                );


            if (
                !Number.isInteger(
                    documentoId
                )
                ||
                documentoId <= 0
            ) {

                return res
                    .status(400)
                    .json({

                        sucesso:
                            false,

                        erro:
                            'Documento inválido.'
                    });
            }


            const documento =
                await buscarDocumentoJornada(
                    documentoId
                );


            if (!documento) {

                return res
                    .status(404)
                    .json({

                        sucesso:
                            false,

                        erro:
                            'Documento não encontrado.'
                    });
            }


            if (
                !usuarioPodeAcessarDocumento(
                    req.usuario,
                    documento
                )
            ) {

                return responderAcessoNegado(
                    res,
                    'Você não tem permissão para acessar este documento.'
                );
            }


            if (
                !documento.arquivo
            ) {

                return res
                    .status(404)
                    .json({

                        sucesso:
                            false,

                        erro:
                            'Arquivo não encontrado.'
                    });
            }


            const nomeSeguro =
                String(
                    documento.nome
                    ||
                    `documento-${documento.id}.pdf`
                )
                    .replace(
                        /[\r\n"]/g,
                        ''
                    );


            res.setHeader(
                'Content-Type',
                documento.mime
                ||
                'application/pdf'
            );


            res.setHeader(
                'Content-Disposition',
                `inline; filename="${nomeSeguro}"`
            );


            res.setHeader(
                'Cache-Control',
                'private, no-store, no-cache, must-revalidate'
            );


            return res.send(
                documento.arquivo
            );


        } catch (err) {

            console.error(
                '❌ Abrir documento Jornada:',
                err
            );


            return res
                .status(500)
                .json({

                    sucesso:
                        false,

                    erro:
                        'Erro ao abrir documento.'
                });
        }
    }
);


// ============================================================
// DOWNLOAD FORÇADO
// ============================================================

app.get(
    '/api/jornada-documentos/:id/download',

    autenticarUsuario,

    async (
        req,
        res
    ) => {

        try {

            const documentoId =
                Number(
                    req.params.id
                );


            const documento =
                await buscarDocumentoJornada(
                    documentoId
                );


            if (!documento) {

                return res
                    .status(404)
                    .json({

                        sucesso:
                            false,

                        erro:
                            'Documento não encontrado.'
                    });
            }


            if (
                !usuarioPodeAcessarDocumento(
                    req.usuario,
                    documento
                )
            ) {

                return responderAcessoNegado(
                    res,
                    'Você não tem permissão para baixar este documento.'
                );
            }


            const nomeSeguro =
                String(
                    documento.nome
                    ||
                    `documento-${documento.id}.pdf`
                )
                    .replace(
                        /[\r\n"]/g,
                        ''
                    );


            res.setHeader(
                'Content-Type',
                documento.mime
                ||
                'application/pdf'
            );


            res.setHeader(
                'Content-Disposition',
                `attachment; filename="${nomeSeguro}"`
            );


            res.setHeader(
                'Cache-Control',
                'private, no-store'
            );


            return res.send(
                documento.arquivo
            );


        } catch (err) {

            console.error(
                '❌ Download documento:',
                err
            );


            return res
                .status(500)
                .json({

                    sucesso:
                        false,

                    erro:
                        'Erro ao baixar documento.'
                });
        }
    }
);


// ============================================================
// ENVIAR PDF ASSINADO
//
// O arquivo assinado NÃO substitui silenciosamente
// o original.
//
// Criamos outro registro.
//
// Assim mantemos:
// - original
// - assinado
// - data
// - usuário
// - histórico
// ============================================================

app.post(
    '/api/jornada-documentos/:id/assinado',

    autenticarUsuario,

    upload.single(
        'arquivo'
    ),

    async (
        req,
        res
    ) => {

        try {

            const documentoId =
                Number(
                    req.params.id
                );


            const original =
                await buscarDocumentoJornada(
                    documentoId
                );


            if (!original) {

                return res
                    .status(404)
                    .json({

                        sucesso:
                            false,

                        erro:
                            'Documento original não encontrado.'
                    });
            }


            // =================================================
            // QUEM PODE ENVIAR O DOCUMENTO ASSINADO?
            //
            // Grupo RS
            // Responsável do cliente
            // Colaborador da própria jornada
            // =================================================

            if (
                !usuarioPodeAcessarDocumento(
                    req.usuario,
                    original
                )
            ) {

                return responderAcessoNegado(
                    res,
                    'Você não tem permissão para enviar este documento assinado.'
                );
            }


            if (
                !req.file?.buffer
            ) {

                return res
                    .status(400)
                    .json({

                        sucesso:
                            false,

                        erro:
                            'Selecione o PDF assinado.'
                    });
            }


            const nome =
                String(
                    req.file.originalname
                    ||
                    `assinado-${original.nome}`
                )
                    .trim();


            const mime =
                String(
                    req.file.mimetype
                    ||
                    ''
                )
                    .toLowerCase();


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

                return res
                    .status(400)
                    .json({

                        sucesso:
                            false,

                        erro:
                            'O documento assinado deve ser um PDF.'
                    });
            }


            const limiteDocumento =
                10 *
                1024 *
                1024;


            if (
                req.file.buffer.length
                >
                limiteDocumento
            ) {

                return res
                    .status(413)
                    .json({

                        sucesso:
                            false,

                        erro:
                            'O PDF ultrapassa o limite de 10 MB.'
                    });
            }


            const resultado =
                await pool.query(
                    `
                    INSERT INTO
                        jornadas_clientes_documentos (
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
                        'application/pdf',
                        $4,
                        'ASSINADO',
                        $5,
                        CURRENT_TIMESTAMP,
                        $5
                    )

                    RETURNING

                        id,

                        jornada_id,

                        tipo,

                        nome,

                        mime,

                        assinatura_status,

                        assinado_por,

                        assinado_em,

                        criado_em
                    `,
                    [
                        original.jornada_id,

                        `${
                            original.tipo
                            ||
                            'DOCUMENTO'
                        }_ASSINADO`,

                        nome,

                        req.file.buffer,

                        req.usuario.email
                    ]
                );


            await registrarAuditoria(
                req.usuario.email,
                'DOCUMENTO_JORNADA_ASSINADO',
                `Documento #${documentoId} assinado e arquivado.`
            );


            return res.json({

                sucesso:
                    true,

                mensagem:
                    'Documento assinado arquivado com sucesso.',

                documento:
                    resultado.rows[0]
            });


        } catch (err) {

            console.error(
                '❌ Documento assinado:',
                err
            );


            return res
                .status(500)
                .json({

                    sucesso:
                        false,

                    erro:
                        'Erro ao arquivar documento assinado.'
                });
        }
    }
);


// ============================================================
// EXCLUIR DOCUMENTO
//
// IMPORTANTE:
// NÃO PERMITIMOS O COLABORADOR APAGAR.
//
// SOMENTE:
// - GRUPO RS
// - RESPONSÁVEL DO PRÓPRIO CLIENTE
// ============================================================

app.delete(
    '/api/jornada-documentos/:id',

    autenticarUsuario,

    async (
        req,
        res
    ) => {

        try {

            const documentoId =
                Number(
                    req.params.id
                );


            const documento =
                await buscarDocumentoJornada(
                    documentoId
                );


            if (!documento) {

                return res
                    .status(404)
                    .json({

                        sucesso:
                            false,

                        erro:
                            'Documento não encontrado.'
                    });
            }


            const permitido =
                await usuarioPodeAdministrarDocumentosJornada(
                    req.usuario,
                    documento.jornada_id
                );


            if (!permitido) {

                return responderAcessoNegado(
                    res,
                    'Você não tem permissão para excluir este documento.'
                );
            }


            await pool.query(
                `
                DELETE FROM
                    jornadas_clientes_documentos

                WHERE
                    id =
                    $1
                `,
                [
                    documentoId
                ]
            );


            await registrarAuditoria(
                req.usuario.email,
                'DOCUMENTO_JORNADA_EXCLUIDO',
                `Documento #${documentoId} excluído da jornada #${documento.jornada_id}.`
            );


            return res.json({

                sucesso:
                    true,

                mensagem:
                    'Documento excluído.'
            });


        } catch (err) {

            console.error(
                '❌ Excluir documento Jornada:',
                err
            );


            return res
                .status(500)
                .json({

                    sucesso:
                        false,

                    erro:
                        'Erro ao excluir documento.'
                });
        }
    }
);


// ============================================================
// INFORMAÇÕES SOBRE ASSINATURA GOV.BR
//
// IMPORTANTE:
//
// ESTA ROTA NÃO FINGE QUE O DOCUMENTO FOI
// ASSINADO PELO GOV.BR.
//
// Uma integração real com assinatura eletrônica externa
// precisa de credenciais, autorização e API apropriada.
//
// Por enquanto:
// - mantém o documento no RS Connect
// - permite baixar
// - assinar externamente quando necessário
// - reenviar o PDF assinado
// - arquivar junto da jornada
// ============================================================

app.get(
    '/api/jornada-assinatura/informacoes',

    autenticarUsuario,

    async (
        req,
        res
    ) => {

        return res.json({

            sucesso:
                true,

            assinatura_interna:
                true,

            govbr_integrado:
                false,

            mensagem:
                'Os documentos podem ser arquivados e assinados externamente. A integração automática com assinatura GOV.BR exige configuração oficial específica.'
        });
    }
);


// ============================================================
// FIM DA PARTE 8
//
// PARTE 9:
//
// RELATÓRIO / PDF DA JORNADA
// ARQUIVAMENTO
// SERVIÇOS FINALIZADOS
// HISTÓRICO
// LIMPEZA DA TELA ATIVA
//
// O SERVIÇO FINALIZADO SOME DA ÁREA PRINCIPAL,
// MAS O HISTÓRICO NÃO É APAGADO.
// ============================================================// ============================================================
// RS CONNECT — SERVER.JS
// VERSÃO COM PRIVACIDADE POR EMPRESA
//
// PARTE 9
//
// HISTÓRICO
// SERVIÇOS FINALIZADOS
// RELATÓRIO DA JORNADA
// ARQUIVAMENTO
//
// FINALIZADO NÃO É EXCLUÍDO.
// ============================================================


// ============================================================
// SERVIÇO ESTÁ FINALIZADO?
// ============================================================

function servicoEstaFinalizado(
    servico
) {

    const status =
        String(
            servico?.status ||
            ''
        )
            .trim()
            .toLowerCase();


    return (
        Boolean(
            servico?.checkout_hora
        )

        ||

        [
            'finalizado',
            'validado',
            'pago',
            'concluido',
            'concluído'
        ].includes(
            status
        )
    );
}


// ============================================================
// HISTÓRICO DE SERVIÇOS
//
// GRUPO RS:
// → TODOS.
//
// EMPRESA:
// → SOMENTE SERVIÇOS DA PRÓPRIA EMPRESA.
//
// PRESTADOR:
// → SOMENTE SERVIÇOS EM QUE ELE FOI TITULAR.
//
// NÃO APARECEM SERVIÇOS ATIVOS.
// ============================================================

app.get(
    '/api/historico/servicos',

    autenticarUsuario,

    async (
        req,
        res
    ) => {

        try {

            const usuario =
                req.usuario;


            const limite =
                Math.min(
                    Math.max(
                        Number(
                            req.query?.limite ||
                            200
                        ),
                        1
                    ),
                    500
                );


            let resultado;


            // =================================================
            // GRUPO RS
            // =================================================

            if (
                usuario.gestorRS
            ) {

                resultado =
                    await pool.query(
                        `
                        SELECT *
                        FROM servicos

                        WHERE
                            checkout_hora
                            IS NOT NULL

                        OR
                            LOWER(
                                COALESCE(
                                    status,
                                    ''
                                )
                            )
                            IN (
                                'finalizado',
                                'validado',
                                'pago',
                                'concluido',
                                'concluído'
                            )

                        ORDER BY
                            atualizado_em DESC,
                            id DESC

                        LIMIT
                            $1
                        `,
                        [
                            limite
                        ]
                    );


                return res.json({

                    sucesso:
                        true,

                    servicos:
                        resultado.rows
                });
            }


            // =================================================
            // EMPRESA
            // =================================================

            if (
                usuario.tipo ===
                'empresa'
            ) {

                resultado =
                    await pool.query(
                        `
                        SELECT *
                        FROM servicos

                        WHERE
                            LOWER(
                                empresa_email
                            )
                            =
                            LOWER($1)

                        AND
                            (
                                checkout_hora
                                IS NOT NULL

                                OR

                                LOWER(
                                    COALESCE(
                                        status,
                                        ''
                                    )
                                )
                                IN (
                                    'finalizado',
                                    'validado',
                                    'pago',
                                    'concluido',
                                    'concluído'
                                )
                            )

                        ORDER BY
                            atualizado_em DESC,
                            id DESC

                        LIMIT
                            $2
                        `,
                        [
                            usuario.email,
                            limite
                        ]
                    );


                return res.json({

                    sucesso:
                        true,

                    servicos:
                        resultado.rows
                });
            }


            // =================================================
            // PRESTADOR
            // =================================================

            resultado =
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

                    AND
                        (
                            checkout_hora
                            IS NOT NULL

                            OR

                            LOWER(
                                COALESCE(
                                    status,
                                    ''
                                )
                            )
                            IN (
                                'finalizado',
                                'validado',
                                'pago',
                                'concluido',
                                'concluído'
                            )
                        )

                    ORDER BY
                        atualizado_em DESC,
                        id DESC

                    LIMIT
                        $2
                    `,
                    [
                        usuario.email,
                        limite
                    ]
                );


            return res.json({

                sucesso:
                    true,

                servicos:
                    resultado.rows
                        .map(
                            servico =>
                                servicoParaPrestador(
                                    servico
                                )
                        )
            });


        } catch (err) {

            console.error(
                '❌ Histórico serviços:',
                err
            );


            return res
                .status(500)
                .json({

                    sucesso:
                        false,

                    erro:
                        'Erro ao carregar histórico de serviços.'
                });
        }
    }
);


// ============================================================
// HISTÓRICO DE UM SERVIÇO ESPECÍFICO
// ============================================================

app.get(
    '/api/historico/servicos/:id',

    autenticarUsuario,

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
                await buscarServico(
                    servicoId
                );


            if (!servico) {

                return res
                    .status(404)
                    .json({

                        sucesso:
                            false,

                        erro:
                            'Serviço não encontrado.'
                    });
            }


            if (
                !servicoEstaFinalizado(
                    servico
                )
            ) {

                return res
                    .status(409)
                    .json({

                        sucesso:
                            false,

                        erro:
                            'Este serviço ainda está em andamento.'
                    });
            }


            if (
                !usuarioPodeAcessarServicoPrivado(
                    req.usuario,
                    servico
                )
            ) {

                return responderAcessoNegado(
                    res,
                    'Você não pode acessar o histórico deste serviço.'
                );
            }


            if (
                req.usuario.gestorRS
                ||
                req.usuario.tipo ===
                'empresa'
            ) {

                return res.json({

                    sucesso:
                        true,

                    servico
                });
            }


            return res.json({

                sucesso:
                    true,

                servico:
                    servicoParaPrestador(
                        servico
                    )
            });


        } catch (err) {

            console.error(
                '❌ Histórico serviço:',
                err
            );


            return res
                .status(500)
                .json({

                    sucesso:
                        false,

                    erro:
                        'Erro ao carregar serviço.'
                });
        }
    }
);


// ============================================================
// MINHAS JORNADAS ARQUIVADAS
//
// COLABORADOR:
// → APENAS AS PRÓPRIAS.
//
// SERVE PARA:
// "HISTÓRICO DA MINHA JORNADA"
// ============================================================

app.get(
    '/api/minha-jornada/arquivadas',

    autenticarUsuario,

    async (
        req,
        res
    ) => {

        try {

            if (
                req.usuario.gestorRS
                ||
                req.usuario.tipo ===
                'empresa'
            ) {

                return responderAcessoNegado(
                    res,
                    'Esta área é exclusiva do colaborador.'
                );
            }


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
                            AS cliente_uf

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
                        (
                            jornada.saida_em
                            IS NOT NULL

                            OR

                            jornada.fechada =
                            TRUE
                        )

                    ORDER BY
                        jornada.data DESC,
                        jornada.id DESC

                    LIMIT
                        $2
                    `,
                    [
                        req.usuario.email,
                        limite
                    ]
                );


            return res.json({

                sucesso:
                    true,

                jornadas:
                    resultado.rows
                        .map(
                            jornada =>
                                jornadaParaColaborador(
                                    jornada
                                )
                        )
            });


        } catch (err) {

            console.error(
                '❌ Jornadas arquivadas:',
                err
            );


            return res
                .status(500)
                .json({

                    sucesso:
                        false,

                    erro:
                        'Erro ao carregar jornadas anteriores.'
                });
        }
    }
);


// ============================================================
// RELATÓRIO COMPLETO DA JORNADA
//
// Serve como fonte dos dados para:
//
// - visualização;
// - impressão;
// - Salvar como PDF no INDEX.
//
// PRIVACIDADE:
//
// ADMIN → QUALQUER.
//
// RESPONSÁVEL → SOMENTE SEU CLIENTE.
//
// COLABORADOR → SOMENTE SUA JORNADA.
// ============================================================

app.get(
    '/api/jornada-fixa/:id/relatorio',

    autenticarUsuario,

    async (
        req,
        res
    ) => {

        try {

            const jornadaId =
                Number(
                    req.params.id
                );


            const permitido =
                await usuarioPodeAcessarJornada(
                    req.usuario,
                    jornadaId
                );


            if (!permitido) {

                return responderAcessoNegado(
                    res,
                    'Você não tem permissão para visualizar este relatório.'
                );
            }


            const jornada =
                await buscarJornadaCliente(
                    jornadaId
                );


            if (!jornada) {

                return res
                    .status(404)
                    .json({

                        sucesso:
                            false,

                        erro:
                            'Jornada não encontrada.'
                    });
            }


            // =================================================
            // DOCUMENTOS SEM BYTEA
            // =================================================

            const documentosRes =
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
                        criado_em,
                        id
                    `,
                    [
                        jornadaId
                    ]
                );


            // =================================================
            // RELATÓRIO DO COLABORADOR
            //
            // NÃO DEVOLVE DADOS ADMINISTRATIVOS EXTRAS.
            // =================================================

            if (
                usuarioEhDonoJornada(
                    req.usuario,
                    jornada
                )
                &&
                !req.usuario.gestorRS
            ) {

                return res.json({

                    sucesso:
                        true,

                    relatorio: {

                        jornada:
                            jornadaParaColaborador(
                                jornada
                            ),

                        documentos:
                            documentosRes.rows
                    }
                });
            }


            // =================================================
            // RESPONSÁVEL / GRUPO RS
            // =================================================

            return res.json({

                sucesso:
                    true,

                relatorio: {

                    jornada: {

                        id:
                            jornada.id,

                        cliente_id:
                            jornada.cliente_id,

                        cliente_nome:
                            jornada.cliente_nome,

                        cliente_endereco:
                            jornada.cliente_endereco,

                        cliente_cidade:
                            jornada.cliente_cidade,

                        cliente_uf:
                            jornada.cliente_uf,

                        responsavel_nome:
                            jornada.responsavel_nome,

                        colaborador_nome:
                            jornada.colaborador_nome,

                        colaborador_email:
                            jornada.colaborador_email,

                        funcao:
                            jornada.funcao,

                        data:
                            jornada.data,

                        horario_previsto:
                            jornada.horario_previsto,

                        status:
                            jornada.status,

                        entrada_em:
                            jornada.entrada_em,

                        entrada_latitude:
                            jornada.entrada_latitude,

                        entrada_longitude:
                            jornada.entrada_longitude,

                        entrada_validada:
                            Boolean(
                                jornada.entrada_validada
                            ),

                        entrada_validada_por:
                            jornada.entrada_validada_por,

                        entrada_validada_em:
                            jornada.entrada_validada_em,

                        intervalo_inicio_em:
                            jornada.intervalo_inicio_em,

                        intervalo_retorno_em:
                            jornada.intervalo_retorno_em,

                        saida_em:
                            jornada.saida_em,

                        saida_latitude:
                            jornada.saida_latitude,

                        saida_longitude:
                            jornada.saida_longitude,

                        saida_validada:
                            Boolean(
                                jornada.saida_validada
                            ),

                        saida_validada_por:
                            jornada.saida_validada_por,

                        saida_validada_em:
                            jornada.saida_validada_em,

                        total_minutos:
                            Number(
                                jornada.total_minutos ||
                                0
                            ),

                        total_horas:
                            Number(
                                jornada.total_horas ||
                                0
                            ),

                        valor_tipo:
                            jornada.valor_tipo,

                        valor_base:
                            numeroRS(
                                jornada.valor_base
                            ),

                        valor_gerado:
                            numeroRS(
                                jornada.valor_gerado
                            ),

                        fechada:
                            Boolean(
                                jornada.fechada
                            ),

                        fechada_por:
                            jornada.fechada_por,

                        fechada_em:
                            jornada.fechada_em,

                        observacoes:
                            jornada.observacoes
                    },

                    documentos:
                        documentosRes.rows
                }
            });


        } catch (err) {

            console.error(
                '❌ Relatório Jornada:',
                err
            );


            return res
                .status(500)
                .json({

                    sucesso:
                        false,

                    erro:
                        'Erro ao gerar relatório da jornada.'
                });
        }
    }
);


// ============================================================
// FOTO DE ENTRADA PROTEGIDA
//
// Não vamos deixar a foto disponível por uma URL pública.
//
// O INDEX busca esta rota usando token.
// ============================================================

app.get(
    '/api/jornada-fixa/:id/foto-entrada',

    autenticarUsuario,

    async (
        req,
        res
    ) => {

        try {

            const jornadaId =
                Number(
                    req.params.id
                );


            const permitido =
                await usuarioPodeAcessarJornada(
                    req.usuario,
                    jornadaId
                );


            if (!permitido) {

                return responderAcessoNegado(
                    res
                );
            }


            const jornada =
                await buscarJornadaCliente(
                    jornadaId
                );


            if (
                !jornada?.entrada_foto
            ) {

                return res
                    .status(404)
                    .json({

                        sucesso:
                            false,

                        erro:
                            'Foto de entrada não encontrada.'
                    });
            }


            return res.json({

                sucesso:
                    true,

                foto:
                    jornada.entrada_foto
            });


        } catch (err) {

            console.error(
                '❌ Foto entrada:',
                err
            );


            return res
                .status(500)
                .json({

                    sucesso:
                        false,

                    erro:
                        'Erro ao carregar foto.'
                });
        }
    }
);


// ============================================================
// FOTO DE SAÍDA PROTEGIDA
// ============================================================

app.get(
    '/api/jornada-fixa/:id/foto-saida',

    autenticarUsuario,

    async (
        req,
        res
    ) => {

        try {

            const jornadaId =
                Number(
                    req.params.id
                );


            const permitido =
                await usuarioPodeAcessarJornada(
                    req.usuario,
                    jornadaId
                );


            if (!permitido) {

                return responderAcessoNegado(
                    res
                );
            }


            const jornada =
                await buscarJornadaCliente(
                    jornadaId
                );


            if (
                !jornada?.saida_foto
            ) {

                return res
                    .status(404)
                    .json({

                        sucesso:
                            false,

                        erro:
                            'Foto de saída não encontrada.'
                    });
            }


            return res.json({

                sucesso:
                    true,

                foto:
                    jornada.saida_foto
            });


        } catch (err) {

            console.error(
                '❌ Foto saída:',
                err
            );


            return res
                .status(500)
                .json({

                    sucesso:
                        false,

                    erro:
                        'Erro ao carregar foto.'
                });
        }
    }
);


// ============================================================
// RESUMO DO CLIENTE
//
// Exemplo:
// Gratidão
//
// presentes: 10
// ausentes: 2
// intervalo: 1
// encerrados: 8
// total de horas
// valor gerado
//
// SEM MISTURAR OUTRA EMPRESA.
// ============================================================

app.get(
    '/api/jornada-clientes/:id/resumo',

    autenticarUsuario,

    async (
        req,
        res
    ) => {

        try {

            const clienteId =
                Number(
                    req.params.id
                );


            const permitido =
                await usuarioPodeAcessarCliente(
                    req.usuario,
                    clienteId
                );


            if (!permitido) {

                return responderAcessoNegado(
                    res,
                    'Você não tem acesso ao resumo deste cliente.'
                );
            }


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


            const resultado =
                await pool.query(
                    `
                    SELECT

                        COUNT(*)::int
                            AS total_colaboradores,

                        COUNT(*)
                        FILTER (
                            WHERE
                                entrada_em
                                IS NOT NULL

                            AND
                                saida_em
                                IS NULL
                        )::int
                            AS presentes,

                        COUNT(*)
                        FILTER (
                            WHERE
                                entrada_em
                                IS NULL
                        )::int
                            AS ausentes,

                        COUNT(*)
                        FILTER (
                            WHERE
                                intervalo_inicio_em
                                IS NOT NULL

                            AND
                                intervalo_retorno_em
                                IS NULL

                            AND
                                saida_em
                                IS NULL
                        )::int
                            AS em_intervalo,

                        COUNT(*)
                        FILTER (
                            WHERE
                                saida_em
                                IS NOT NULL
                        )::int
                            AS encerrados,

                        COALESCE(
                            SUM(
                                total_horas
                            ),
                            0
                        )
                            AS total_horas,

                        COALESCE(
                            SUM(
                                valor_gerado
                            ),
                            0
                        )
                            AS valor_gerado

                    FROM
                        jornadas_clientes

                    WHERE
                        cliente_id =
                        $1

                    AND
                        data =
                        $2::date
                    `,
                    [
                        clienteId,
                        data
                    ]
                );


            return res.json({

                sucesso:
                    true,

                data,

                resumo:
                    resultado.rows[0]
            });


        } catch (err) {

            console.error(
                '❌ Resumo cliente:',
                err
            );


            return res
                .status(500)
                .json({

                    sucesso:
                        false,

                    erro:
                        'Erro ao carregar resumo.'
                });
        }
    }
);


// ============================================================
// ARQUIVO HISTÓRICO POR COLABORADOR
//
// Exemplo:
//
// Mayara
// → Gratidão
// → todas as jornadas
//
// Somente quem tem acesso à Gratidão
// consegue executar a busca.
// ============================================================

app.get(
    '/api/jornada-clientes/:id/colaborador/:email/historico',

    autenticarUsuario,

    async (
        req,
        res
    ) => {

        try {

            const clienteId =
                Number(
                    req.params.id
                );


            const permitido =
                await usuarioPodeAcessarCliente(
                    req.usuario,
                    clienteId
                );


            if (!permitido) {

                return responderAcessoNegado(
                    res,
                    'Você não pode consultar colaboradores deste cliente.'
                );
            }


            const colaboradorEmail =
                normalizarEmail(
                    req.params.email
                );


            const resultado =
                await pool.query(
                    `
                    SELECT

                        jornada.*,

                        cliente.nome
                            AS cliente_nome

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
                        jornada.cliente_id =
                        $1

                    AND
                        LOWER(
                            jornada.colaborador_email
                        )
                        =
                        LOWER($2)

                    ORDER BY
                        jornada.data DESC,
                        jornada.id DESC
                    `,
                    [
                        clienteId,
                        colaboradorEmail
                    ]
                );


            return res.json({

                sucesso:
                    true,

                jornadas:
                    resultado.rows
            });


        } catch (err) {

            console.error(
                '❌ Histórico colaborador cliente:',
                err
            );


            return res
                .status(500)
                .json({

                    sucesso:
                        false,

                    erro:
                        'Erro ao pesquisar histórico do colaborador.'
                });
        }
    }
);


// ============================================================
// IMPORTANTE SOBRE EXCLUSÃO
//
// NÃO CRIAMOS ROTA PARA APAGAR SERVIÇO FINALIZADO.
//
// FINALIZADO:
// → sai da área ativa;
// → continua no PostgreSQL;
// → fica no Histórico;
// → mantém fotos;
// → mantém horários;
// → mantém pagamentos;
// → mantém documentos;
// → mantém auditoria.
//
// Isso evita perda de dados.
// ============================================================


// ============================================================
// FIM DA PARTE 9
//
// PARTE 10:
//
// PAGAMENTOS
// COMPROVANTES
// AUTORIZAÇÃO DE PAGAMENTO
//
// COM PRIVACIDADE:
//
// EMPRESA X NÃO ACESSA PAGAMENTO DA EMPRESA Y.
// PRESTADOR SÓ ACESSA O PRÓPRIO PAGAMENTO.
// ============================================================
// ============================================================
// RS CONNECT — SERVER.JS
// VERSÃO COM PRIVACIDADE POR EMPRESA
//
// PARTE 10
//
// PAGAMENTOS
// AUTORIZAÇÃO
// REGISTRO
// COMPROVANTE
// HISTÓRICO DO PRESTADOR
//
// PRIVACIDADE:
// EMPRESA X NÃO ACESSA PAGAMENTO DA EMPRESA Y.
// PRESTADOR SÓ VÊ OS PRÓPRIOS PAGAMENTOS.
// ============================================================


// ============================================================
// SOLICITAR CORREÇÃO DA JORNADA
//
// SOMENTE A EMPRESA RESPONSÁVEL OU O GRUPO RS.
// ============================================================

app.post(
    '/api/servicos/:id/solicitar-correcao-jornada',

    autenticarUsuario,

    async (
        req,
        res
    ) => {

        const servicoId =
            Number(
                req.params.id
            );


        const motivo =
            String(
                req.body?.motivo ||
                ''
            )
                .trim();


        if (
            !Number.isInteger(servicoId) ||
            servicoId <= 0
        ) {

            return res
                .status(400)
                .json({
                    sucesso: false,
                    erro: 'Serviço inválido.'
                });
        }


        if (
            motivo.length < 10 ||
            motivo.length > 1000
        ) {

            return res
                .status(400)
                .json({
                    sucesso: false,
                    erro: 'Informe o motivo da correção entre 10 e 1000 caracteres.'
                });
        }


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
                        erro: 'Serviço não encontrado.'
                    });
            }


            if (
                !req.usuario.gestorRS &&
                !empresaEhResponsavel(
                    servico,
                    req.usuario.email
                )
            ) {

                return responderAcessoNegado(
                    res,
                    'Somente a empresa responsável pode solicitar a correção.'
                );
            }


            if (!servico.checkout_hora) {

                return res
                    .status(409)
                    .json({
                        sucesso: false,
                        erro: 'A jornada ainda não foi finalizada.'
                    });
            }


            const resultado =
                await pool.query(
                    `
                    UPDATE servicos

                    SET
                        validado_empresa = FALSE,
                        validado_em = NULL,
                        jornada_aprovacao_status = 'correcao_solicitada',
                        jornada_correcao_motivo = $1,
                        jornada_correcao_solicitada_em = CURRENT_TIMESTAMP,
                        atualizado_em = CURRENT_TIMESTAMP

                    WHERE id = $2

                    RETURNING *
                    `,
                    [
                        motivo,
                        servicoId
                    ]
                );


            await registrarAuditoria(
                req.usuario.email,
                'SOLICITAR_CORRECAO_JORNADA',
                `Correção solicitada para o serviço #${servicoId}.`
            );


            emitirAtualizacaoPrestador(
                servico.prestador_email,
                'correcao_jornada_solicitada',
                {
                    servicoId,
                    motivo
                }
            );


            emitirAtualizacao(
                servicoId
            );


            return res.json({
                sucesso: true,
                mensagem: 'Correção solicitada ao prestador.',
                servico: resultado.rows[0]
            });


        } catch (err) {

            console.error(
                '❌ Solicitar correção da jornada:',
                err
            );


            return res
                .status(500)
                .json({
                    sucesso: false,
                    erro: 'Não foi possível solicitar a correção da jornada.'
                });
        }
    }
);


// ============================================================
// AUTORIZAR PAGAMENTO
//
// SOMENTE:
// - EMPRESA DONA DO SERVIÇO
// - GRUPO RS / ADMIN
// ============================================================

app.post(
    '/api/servicos/:id/autorizar-pagamento',

    autenticarUsuario,

    async (
        req,
        res
    ) => {

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

                        sucesso:
                            false,

                        erro:
                            'Serviço não encontrado.'
                    });
            }


            if (
                !req.usuario.gestorRS
                &&
                !empresaEhResponsavel(
                    servico,
                    req.usuario.email
                )
            ) {

                return responderAcessoNegado(
                    res,
                    'Somente a empresa responsável por este serviço pode autorizar o pagamento.'
                );
            }


            if (
                !servico.checkout_hora
            ) {

                return res
                    .status(409)
                    .json({

                        sucesso:
                            false,

                        erro:
                            'O serviço precisa estar finalizado antes do pagamento.'
                    });
            }


            if (
                !servico.prestador_email
            ) {

                return res
                    .status(409)
                    .json({

                        sucesso:
                            false,

                        erro:
                            'Este serviço não possui prestador vinculado.'
                    });
            }


            if (
                servico.pagamento_autorizado
            ) {

                return res.json({

                    sucesso:
                        true,

                    mensagem:
                        'O pagamento já está autorizado.',

                    valor:
                        numeroRS(
                            servico.valor_liquido
                            ||
                            servico.valor_diaria
                            ||
                            servico.valor
                        )
                });
            }


            const valor =
                numeroRS(
                    servico.valor_liquido
                    ||
                    servico.valor_diaria
                    ||
                    servico.valor
                );


            const resultado =
                await pool.query(
                    `
                    UPDATE
                        servicos

                    SET
                        pagamento_autorizado =
                            TRUE,

                        pagamento_autorizado_em =
                            CURRENT_TIMESTAMP,

                        atualizado_em =
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


            // =================================================
            // EVITAR DUPLICAR AUTORIZAÇÃO NA TABELA PAGAMENTOS
            // =================================================

            const pagamentoExistente =
                await pool.query(
                    `
                    SELECT
                        id

                    FROM
                        pagamentos

                    WHERE
                        servico_id =
                        $1

                    AND
                        status
                        IN (
                            'AUTORIZADO',
                            'PAGO'
                        )

                    ORDER BY
                        id DESC

                    LIMIT 1
                    `,
                    [
                        servicoId
                    ]
                );


            if (
                !pagamentoExistente.rows.length
            ) {

                await pool.query(
                    `
                    INSERT INTO
                        pagamentos (
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

                        normalizarEmail(
                            servico.empresa_email
                        ),

                        normalizarEmail(
                            servico.prestador_email
                        ),

                        valor,

                        servico.forma_pgto
                        ||
                        'Pix'
                    ]
                );
            }


            await registrarLedger(
                servicoId,
                req.usuario.email,
                'PAGAMENTO_AUTORIZADO',
                valor
            );


            await registrarAuditoria(
                req.usuario.email,
                'PAGAMENTO_AUTORIZADO',
                `Pagamento do serviço #${servicoId} autorizado.`
            );


            emitirAtualizacaoEmpresa(
                servico.empresa_email,
                'pagamento_autorizado',
                {
                    servicoId,
                    valor
                }
            );


            emitirAtualizacaoPrestador(
                servico.prestador_email,
                'pagamento_autorizado',
                {
                    servicoId,
                    valor
                }
            );


            emitirAtualizacao(
                servicoId
            );


            return res.json({

                sucesso:
                    true,

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

                    sucesso:
                        false,

                    erro:
                        'Erro ao autorizar pagamento.'
                });
        }
    }
);


// ============================================================
// REGISTRAR PAGAMENTO
//
// SOMENTE:
// - EMPRESA DONA DO SERVIÇO
// - GRUPO RS / ADMIN
//
// O PRESTADOR NÃO MARCA O PRÓPRIO PAGAMENTO COMO PAGO.
// ============================================================

app.post(
    [
        '/api/servicos/:id/pagamento',
        '/api/servicos/:id/pagamento-realizado'
    ],

    autenticarUsuario,

    async (
        req,
        res
    ) => {

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

                        sucesso:
                            false,

                        erro:
                            'Serviço não encontrado.'
                    });
            }


            if (
                !req.usuario.gestorRS
                &&
                !empresaEhResponsavel(
                    servico,
                    req.usuario.email
                )
            ) {

                return responderAcessoNegado(
                    res,
                    'Somente a empresa responsável pode registrar este pagamento.'
                );
            }


            if (
                !servico.checkout_hora
            ) {

                return res
                    .status(409)
                    .json({

                        sucesso:
                            false,

                        erro:
                            'O serviço ainda não foi finalizado.'
                    });
            }


            if (
                !servico.pagamento_autorizado
            ) {

                return res
                    .status(409)
                    .json({

                        sucesso:
                            false,

                        erro:
                            'Autorize o pagamento antes de registrá-lo como pago.'
                    });
            }


            if (
                servico.pagamento_realizado
            ) {

                return res.json({

                    sucesso:
                        true,

                    mensagem:
                        'Este pagamento já foi registrado.'
                });
            }


            const valor =
                numeroRS(
                    req.body?.valor
                    ||
                    servico.valor_liquido
                    ||
                    servico.valor_diaria
                    ||
                    servico.valor
                );


            const formaPagamento =
                String(
                    req.body?.formaPagamento
                    ||
                    req.body?.forma_pagamento
                    ||
                    servico.forma_pgto
                    ||
                    'Pix'
                )
                    .trim();


            const comprovante =
                String(
                    req.body?.comprovante
                    ||
                    req.body?.arquivo
                    ||
                    ''
                );


            const resultado =
                await pool.query(
                    `
                    UPDATE
                        servicos

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
                            'pago',

                        atualizado_em =
                            CURRENT_TIMESTAMP

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


            // =================================================
            // ATUALIZAR PAGAMENTO EXISTENTE
            // =================================================

            const existente =
                await pool.query(
                    `
                    SELECT
                        id

                    FROM
                        pagamentos

                    WHERE
                        servico_id =
                        $1

                    ORDER BY
                        id DESC

                    LIMIT 1
                    `,
                    [
                        servicoId
                    ]
                );


            if (
                existente.rows.length
            ) {

                await pool.query(
                    `
                    UPDATE
                        pagamentos

                    SET
                        empresa_email =
                            $1,

                        prestador_email =
                            $2,

                        valor =
                            $3,

                        forma_pagamento =
                            $4,

                        status =
                            'PAGO',

                        comprovante =
                            CASE

                                WHEN $5 <> ''
                                THEN $5

                                ELSE
                                    comprovante

                            END,

                        pago_em =
                            CURRENT_TIMESTAMP

                    WHERE
                        id =
                        $6
                    `,
                    [
                        normalizarEmail(
                            servico.empresa_email
                        ),

                        normalizarEmail(
                            servico.prestador_email
                        ),

                        valor,

                        formaPagamento,

                        comprovante,

                        existente.rows[0].id
                    ]
                );


            } else {

                await pool.query(
                    `
                    INSERT INTO
                        pagamentos (
                            servico_id,
                            empresa_email,
                            prestador_email,
                            valor,
                            forma_pagamento,
                            status,
                            comprovante,
                            autorizado_em,
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
                        CURRENT_TIMESTAMP,
                        CURRENT_TIMESTAMP
                    )
                    `,
                    [
                        servicoId,

                        normalizarEmail(
                            servico.empresa_email
                        ),

                        normalizarEmail(
                            servico.prestador_email
                        ),

                        valor,

                        formaPagamento,

                        comprovante
                    ]
                );
            }


            await registrarLedger(
                servicoId,
                req.usuario.email,
                'PAGAMENTO_REALIZADO',
                valor
            );


            await registrarAuditoria(
                req.usuario.email,
                'PAGAMENTO_REALIZADO',
                `Pagamento do serviço #${servicoId} registrado.`
            );


            emitirAtualizacaoEmpresa(
                servico.empresa_email,
                'pagamento_realizado',
                {
                    servicoId,
                    valor
                }
            );


            emitirAtualizacaoPrestador(
                servico.prestador_email,
                'pagamento_realizado',
                {
                    servicoId,
                    valor
                }
            );


            emitirAtualizacao(
                servicoId
            );


            return res.json({

                sucesso:
                    true,

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

                    sucesso:
                        false,

                    erro:
                        'Erro ao registrar pagamento.'
                });
        }
    }
);


// ============================================================
// COMPROVANTE DE PAGAMENTO
//
// SOMENTE:
// - EMPRESA RESPONSÁVEL
// - GRUPO RS
//
// O PRESTADOR PODE VISUALIZAR DEPOIS,
// MAS NÃO ALTERAR.
// ============================================================

app.post(
    '/api/servicos/:id/comprovante-pagamento',

    autenticarUsuario,

    upload.single(
        'arquivo'
    ),

    async (
        req,
        res
    ) => {

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

                        sucesso:
                            false,

                        erro:
                            'Serviço não encontrado.'
                    });
            }


            if (
                !req.usuario.gestorRS
                &&
                !empresaEhResponsavel(
                    servico,
                    req.usuario.email
                )
            ) {

                return responderAcessoNegado(
                    res,
                    'Somente a empresa responsável pode enviar o comprovante.'
                );
            }


            let arquivo =
                '';


            let nomeArquivo =
                'comprovante';


            if (
                req.file
            ) {

                arquivo =
                    `data:${
                        req.file.mimetype
                    };base64,${
                        req.file.buffer
                            .toString(
                                'base64'
                            )
                    }`;


                nomeArquivo =
                    req.file.originalname
                    ||
                    nomeArquivo;


            } else {

                arquivo =
                    String(
                        req.body?.arquivo
                        ||
                        req.body?.comprovante
                        ||
                        ''
                    );


                nomeArquivo =
                    String(
                        req.body?.nomeArquivo
                        ||
                        req.body?.nome_arquivo
                        ||
                        nomeArquivo
                    );
            }


            if (!arquivo) {

                return res
                    .status(400)
                    .json({

                        sucesso:
                            false,

                        erro:
                            'Selecione o comprovante.'
                    });
            }


            await pool.query(
                `
                UPDATE
                    servicos

                SET
                    comprovante_pagamento =
                        TRUE,

                    comprovante_pagamento_arquivo =
                        $1,

                    pagamento_realizado =
                        TRUE,

                    pagamento_realizado_em =
                        CURRENT_TIMESTAMP,

                    pagamento_autorizado =
                        TRUE,

                    pagamento_autorizado_em =
                        COALESCE(
                            pagamento_autorizado_em,
                            CURRENT_TIMESTAMP
                        ),

                    status =
                        'pago',

                    atualizado_em =
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


            // =================================================
            // SALVAR COMPROVANTE NOS DOCUMENTOS DO SERVIÇO
            // =================================================

            await pool.query(
                `
                INSERT INTO
                    documentos_rs (
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

                    normalizarEmail(
                        servico.empresa_email
                    ),

                    normalizarEmail(
                        servico.prestador_email
                    ),

                    nomeArquivo,

                    arquivo
                ]
            );


            // =================================================
            // ATUALIZAR TABELA PAGAMENTOS
            // =================================================

            const valor =
                numeroRS(
                    servico.valor_liquido
                    ||
                    servico.valor_diaria
                    ||
                    servico.valor
                );


            const pagamentoRes =
                await pool.query(
                    `
                    SELECT
                        id

                    FROM
                        pagamentos

                    WHERE
                        servico_id =
                        $1

                    ORDER BY
                        id DESC

                    LIMIT 1
                    `,
                    [
                        servicoId
                    ]
                );


            if (
                pagamentoRes.rows.length
            ) {

                await pool.query(
                    `
                    UPDATE
                        pagamentos

                    SET
                        status =
                            'PAGO',

                        valor =
                            $1,

                        comprovante =
                            $2,

                        pago_em =
                            CURRENT_TIMESTAMP

                    WHERE
                        id =
                            $3
                    `,
                    [
                        valor,

                        arquivo,

                        pagamentoRes.rows[0].id
                    ]
                );


            } else {

                await pool.query(
                    `
                    INSERT INTO
                        pagamentos (
                            servico_id,
                            empresa_email,
                            prestador_email,
                            valor,
                            forma_pagamento,
                            status,
                            comprovante,
                            autorizado_em,
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
                        CURRENT_TIMESTAMP,
                        CURRENT_TIMESTAMP
                    )
                    `,
                    [
                        servicoId,

                        normalizarEmail(
                            servico.empresa_email
                        ),

                        normalizarEmail(
                            servico.prestador_email
                        ),

                        valor,

                        servico.forma_pgto
                        ||
                        'Pix',

                        arquivo
                    ]
                );
            }


            await registrarAuditoria(
                req.usuario.email,
                'COMPROVANTE_PAGAMENTO',
                `Comprovante do serviço #${servicoId} registrado.`
            );


            emitirAtualizacaoEmpresa(
                servico.empresa_email,
                'comprovante_pagamento',
                {
                    servicoId
                }
            );


            emitirAtualizacaoPrestador(
                servico.prestador_email,
                'comprovante_pagamento',
                {
                    servicoId
                }
            );


            emitirAtualizacao(
                servicoId
            );


            return res.json({

                sucesso:
                    true,

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

                    sucesso:
                        false,

                    erro:
                        'Erro ao registrar comprovante.'
                });
        }
    }
);


// ============================================================
// MEUS PAGAMENTOS — PRESTADOR
//
// ROTA NOVA:
//
// /api/meus-pagamentos
//
// NÃO RECEBE E-MAIL.
//
// O TOKEN IDENTIFICA O PRESTADOR.
// ============================================================

async function carregarMeusPagamentos(
    req,
    res
) {

    try {

        if (
            req.usuario.gestorRS
            ||
            req.usuario.tipo ===
            'empresa'
        ) {

            return responderAcessoNegado(
                res,
                'Esta área é exclusiva do prestador.'
            );
        }


        const resultado =
            await pool.query(
                `
                SELECT

                    pagamento.*,

                    servico.titulo
                        AS servico_titulo,

                    servico.categoria
                        AS servico_categoria,

                    servico.empresa_nome,

                    servico.data_horario

                FROM
                    pagamentos
                    AS pagamento

                LEFT JOIN
                    servicos
                    AS servico

                ON
                    servico.id =
                    pagamento.servico_id

                WHERE
                    LOWER(
                        pagamento.prestador_email
                    )
                    =
                    LOWER($1)

                ORDER BY
                    pagamento.criado_em DESC,
                    pagamento.id DESC
                `,
                [
                    req.usuario.email
                ]
            );


        return res.json({

            sucesso:
                true,

            pagamentos:
                resultado.rows
        });


    } catch (err) {

        console.error(
            '❌ Meus pagamentos:',
            err
        );


        return res
            .status(500)
            .json({

                sucesso:
                    false,

                erro:
                    'Erro ao carregar pagamentos.'
            });
    }
}


// ============================================================
// ROTA PRINCIPAL SEGURA
// ============================================================

app.get(
    '/api/meus-pagamentos',

    autenticarUsuario,

    carregarMeusPagamentos
);


// ============================================================
// COMPATIBILIDADE COM INDEX ANTIGO
//
// Mesmo que alguém coloque outro e-mail:
//
// /api/prestador/outra-pessoa@gmail.com/pagamentos
//
// O SERVER IGNORA O E-MAIL DA URL.
// ============================================================

app.get(
    '/api/prestador/:email/pagamentos',

    autenticarUsuario,

    carregarMeusPagamentos
);


app.get(
    '/api/prestador/:email/historico-pagamentos',

    autenticarUsuario,

    carregarMeusPagamentos
);


// ============================================================
// PAGAMENTOS DA EMPRESA
//
// EMPRESA:
// → SOMENTE OS PRÓPRIOS.
//
// GRUPO RS:
// → TODOS.
// ============================================================

app.get(
    '/api/pagamentos/empresa',

    autenticarUsuario,

    async (
        req,
        res
    ) => {

        try {

            let resultado;


            if (
                req.usuario.gestorRS
            ) {

                resultado =
                    await pool.query(
                        `
                        SELECT
                            pagamento.*,

                            servico.titulo
                                AS servico_titulo,

                            servico.prestador_nome

                        FROM
                            pagamentos
                            AS pagamento

                        LEFT JOIN
                            servicos
                            AS servico

                        ON
                            servico.id =
                            pagamento.servico_id

                        ORDER BY
                            pagamento.criado_em DESC,
                            pagamento.id DESC
                        `
                    );


            } else if (
                req.usuario.tipo ===
                'empresa'
            ) {

                resultado =
                    await pool.query(
                        `
                        SELECT
                            pagamento.*,

                            servico.titulo
                                AS servico_titulo,

                            servico.prestador_nome

                        FROM
                            pagamentos
                            AS pagamento

                        LEFT JOIN
                            servicos
                            AS servico

                        ON
                            servico.id =
                            pagamento.servico_id

                        WHERE
                            LOWER(
                                pagamento.empresa_email
                            )
                            =
                            LOWER($1)

                        ORDER BY
                            pagamento.criado_em DESC,
                            pagamento.id DESC
                        `,
                        [
                            req.usuario.email
                        ]
                    );


            } else {

                return responderAcessoNegado(
                    res,
                    'Área exclusiva da empresa.'
                );
            }


            return res.json({

                sucesso:
                    true,

                pagamentos:
                    resultado.rows
            });


        } catch (err) {

            console.error(
                '❌ Pagamentos empresa:',
                err
            );


            return res
                .status(500)
                .json({

                    sucesso:
                        false,

                    erro:
                        'Erro ao carregar pagamentos da empresa.'
                });
        }
    }
);


// ============================================================
// FIM DA PARTE 10
//
// PARTE 11:
//
// DOCUMENTOS DOS SERVIÇOS
// CONTRATO ASSINADO
// COMPROVANTES PROTEGIDOS
// CHAT COM PRIVACIDADE
// ============================================================
// ============================================================
// RS CONNECT — SERVER.JS
// VERSÃO COM PRIVACIDADE POR EMPRESA
//
// PARTE 11
//
// DOCUMENTOS DOS SERVIÇOS
// CONTRATO ASSINADO
// NOTA FISCAL
// CHAT PRIVADO
// ============================================================


// ============================================================
// ACESSO A DOCUMENTOS DE SERVIÇO
//
// GRUPO RS:
// → qualquer serviço
//
// EMPRESA:
// → somente serviço dela
//
// PRESTADOR:
// → somente serviço em que participa
// ============================================================

function usuarioPodeAcessarDocumentoServico(
    usuario,
    servico
) {

    if (
        !usuario ||
        !servico
    ) {

        return false;
    }


    if (
        usuario.gestorRS
    ) {

        return true;
    }


    const email =
        normalizarEmail(
            usuario.email
        );


    if (
        email ===
        normalizarEmail(
            servico.empresa_email
        )
    ) {

        return true;
    }


    if (
        email ===
        normalizarEmail(
            servico.prestador_email
        )
    ) {

        return true;
    }


    return false;
}


// ============================================================
// QUEM PODE ENVIAR DOCUMENTO ADMINISTRATIVO DO SERVIÇO
//
// - Grupo RS
// - empresa dona do serviço
// ============================================================

function usuarioPodeAdministrarDocumentoServico(
    usuario,
    servico
) {

    if (
        !usuario ||
        !servico
    ) {

        return false;
    }


    if (
        usuario.gestorRS
    ) {

        return true;
    }


    return (
        normalizarEmail(
            usuario.email
        )
        ===
        normalizarEmail(
            servico.empresa_email
        )
    );
}


// ============================================================
// ENVIAR DOCUMENTO DO SERVIÇO
// ============================================================

app.post(
    '/api/servicos/:id/documentos',

    autenticarUsuario,

    upload.single(
        'arquivo'
    ),

    async (
        req,
        res
    ) => {

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

                        sucesso:
                            false,

                        erro:
                            'Serviço não encontrado.'
                    });
            }


            if (
                !usuarioPodeAdministrarDocumentoServico(
                    req.usuario,
                    servico
                )
            ) {

                return responderAcessoNegado(
                    res,
                    'Você não pode adicionar documentos neste serviço.'
                );
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
                    .trim()
                    .toUpperCase()
                    .slice(
                        0,
                        80
                    );


            if (
                req.file
            ) {

                arquivo =
                    `data:${
                        req.file.mimetype
                    };base64,${
                        req.file.buffer
                            .toString(
                                'base64'
                            )
                    }`;


                nome =
                    req.file.originalname
                    ||
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

                        sucesso:
                            false,

                        erro:
                            'Selecione um documento.'
                    });
            }


            const resultado =
                await pool.query(
                    `
                    INSERT INTO
                        documentos_rs (
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
                        $4,
                        $5,
                        $6
                    )

                    RETURNING
                        id,
                        servico_id,
                        empresa_email,
                        prestador_email,
                        categoria,
                        nome,
                        criado_em
                    `,
                    [
                        servicoId,

                        normalizarEmail(
                            servico.empresa_email
                        ),

                        normalizarEmail(
                            servico.prestador_email
                        )
                        ||
                        null,

                        categoria,

                        nome,

                        arquivo
                    ]
                );


            await registrarAuditoria(
                req.usuario.email,
                'DOCUMENTO_SERVICO',
                `Documento adicionado ao serviço #${servicoId}.`
            );


            emitirAtualizacaoEmpresa(
                servico.empresa_email,
                'documentos_atualizados',
                {
                    servicoId
                }
            );


            if (
                servico.prestador_email
            ) {

                emitirAtualizacaoPrestador(
                    servico.prestador_email,
                    'documentos_atualizados',
                    {
                        servicoId
                    }
                );
            }


            return res.json({

                sucesso:
                    true,

                mensagem:
                    'Documento arquivado.',

                documento:
                    resultado.rows[0]
            });


        } catch (err) {

            console.error(
                '❌ Documento serviço:',
                err
            );


            return res
                .status(500)
                .json({

                    sucesso:
                        false,

                    erro:
                        'Erro ao arquivar documento.'
                });
        }
    }
);


// ============================================================
// LISTAR DOCUMENTOS DO SERVIÇO
//
// IMPORTANTE:
// SOMENTE QUEM PARTICIPA DO SERVIÇO.
//
// NÃO PRECISA ENTREGAR DOCUMENTOS
// DE OUTRA EMPRESA.
// ============================================================

app.get(
    '/api/servicos/:id/documentos',

    autenticarUsuario,

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
                await buscarServico(
                    servicoId
                );


            if (!servico) {

                return res
                    .status(404)
                    .json({

                        sucesso:
                            false,

                        erro:
                            'Serviço não encontrado.'
                    });
            }


            if (
                !usuarioPodeAcessarDocumentoServico(
                    req.usuario,
                    servico
                )
            ) {

                return responderAcessoNegado(
                    res,
                    'Você não pode visualizar documentos deste serviço.'
                );
            }


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

                    FROM
                        documentos_rs

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

                sucesso:
                    true,

                documentos:
                    resultado.rows
            });


        } catch (err) {

            console.error(
                '❌ Listar documentos serviço:',
                err
            );


            return res
                .status(500)
                .json({

                    sucesso:
                        false,

                    erro:
                        'Erro ao carregar documentos.'
                });
        }
    }
);


// ============================================================
// ABRIR DOCUMENTO DE SERVIÇO
//
// Documento não fica público.
// ============================================================

app.get(
    '/api/documentos-servicos/:id/arquivo',

    autenticarUsuario,

    async (
        req,
        res
    ) => {

        try {

            const documentoId =
                Number(
                    req.params.id
                );


            const resultado =
                await pool.query(
                    `
                    SELECT

                        documento.*,

                        servico.empresa_email
                            AS servico_empresa_email,

                        servico.prestador_email
                            AS servico_prestador_email

                    FROM
                        documentos_rs
                        AS documento

                    JOIN
                        servicos
                        AS servico

                    ON
                        servico.id =
                        documento.servico_id

                    WHERE
                        documento.id =
                        $1

                    LIMIT 1
                    `,
                    [
                        documentoId
                    ]
                );


            const documento =
                resultado.rows[0];


            if (!documento) {

                return res
                    .status(404)
                    .json({

                        sucesso:
                            false,

                        erro:
                            'Documento não encontrado.'
                    });
            }


            const servico = {

                empresa_email:
                    documento.servico_empresa_email,

                prestador_email:
                    documento.servico_prestador_email
            };


            if (
                !usuarioPodeAcessarDocumentoServico(
                    req.usuario,
                    servico
                )
            ) {

                return responderAcessoNegado(
                    res,
                    'Você não pode abrir este documento.'
                );
            }


            return res.json({

                sucesso:
                    true,

                documento: {

                    id:
                        documento.id,

                    nome:
                        documento.nome,

                    categoria:
                        documento.categoria,

                    arquivo:
                        documento.arquivo
                }
            });


        } catch (err) {

            console.error(
                '❌ Abrir documento serviço:',
                err
            );


            return res
                .status(500)
                .json({

                    sucesso:
                        false,

                    erro:
                        'Erro ao abrir documento.'
                });
        }
    }
);


// ============================================================
// CONTRATO ASSINADO
//
// Pode enviar:
//
// - Grupo RS
// - empresa dona
// - prestador titular do próprio serviço
//
// Assim o colaborador pode devolver o contrato assinado,
// mas nunca acessar contrato de outro prestador.
// ============================================================

app.post(
    '/api/servicos/:id/contrato-assinado',

    autenticarUsuario,

    upload.single(
        'arquivo'
    ),

    async (
        req,
        res
    ) => {

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

                        sucesso:
                            false,

                        erro:
                            'Serviço não encontrado.'
                    });
            }


            if (
                !usuarioPodeAcessarDocumentoServico(
                    req.usuario,
                    servico
                )
            ) {

                return responderAcessoNegado(
                    res,
                    'Você não pode enviar contrato para este serviço.'
                );
            }


            let arquivo =
                '';


            let nome =
                'Contrato assinado';


            if (
                req.file
            ) {

                arquivo =
                    `data:${
                        req.file.mimetype
                    };base64,${
                        req.file.buffer
                            .toString(
                                'base64'
                            )
                    }`;


                nome =
                    req.file.originalname
                    ||
                    nome;


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

                        sucesso:
                            false,

                        erro:
                            'Envie o contrato assinado.'
                    });
            }


            await pool.query(
                `
                UPDATE
                    servicos

                SET
                    contrato_assinado =
                        $1,

                    contrato_assinado_em =
                        CURRENT_TIMESTAMP,

                    atualizado_em =
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
                INSERT INTO
                    documentos_rs (
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
                    $4,
                    $5
                )
                `,
                [
                    servicoId,

                    normalizarEmail(
                        servico.empresa_email
                    ),

                    normalizarEmail(
                        servico.prestador_email
                    )
                    ||
                    null,

                    nome,

                    arquivo
                ]
            );


            await registrarAuditoria(
                req.usuario.email,
                'CONTRATO_ASSINADO',
                `Contrato do serviço #${servicoId} arquivado.`
            );


            emitirAtualizacaoEmpresa(
                servico.empresa_email,
                'contrato_assinado',
                {
                    servicoId
                }
            );


            emitirAtualizacaoPrestador(
                servico.prestador_email,
                'contrato_assinado',
                {
                    servicoId
                }
            );


            return res.json({

                sucesso:
                    true,

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

                    sucesso:
                        false,

                    erro:
                        'Erro ao arquivar contrato.'
                });
        }
    }
);


// ============================================================
// NOTA FISCAL
//
// SOMENTE EMPRESA DONA OU GRUPO RS
// PODE ARQUIVAR NOTA ADMINISTRATIVA.
// ============================================================

app.post(
    '/api/servicos/:id/nota-oficial',

    autenticarUsuario,

    upload.single(
        'notaFiscal'
    ),

    async (
        req,
        res
    ) => {

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

                        sucesso:
                            false,

                        erro:
                            'Serviço não encontrado.'
                    });
            }


            if (
                !usuarioPodeAdministrarDocumentoServico(
                    req.usuario,
                    servico
                )
            ) {

                return responderAcessoNegado(
                    res,
                    'Você não pode enviar nota fiscal para este serviço.'
                );
            }


            let arquivo =
                '';


            let nome =
                'Nota fiscal';


            if (
                req.file
            ) {

                arquivo =
                    `data:${
                        req.file.mimetype
                    };base64,${
                        req.file.buffer
                            .toString(
                                'base64'
                            )
                    }`;


                nome =
                    req.file.originalname
                    ||
                    nome;


            } else {

                arquivo =
                    String(
                        req.body?.notaFiscal
                        ||
                        req.body?.arquivo
                        ||
                        ''
                    );
            }


            if (!arquivo) {

                return res
                    .status(400)
                    .json({

                        sucesso:
                            false,

                        erro:
                            'Nenhuma nota fiscal enviada.'
                    });
            }


            await pool.query(
                `
                UPDATE
                    servicos

                SET
                    nota_oficial =
                        $1,

                    atualizado_em =
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
                INSERT INTO
                    documentos_rs (
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
                    'NOTA_FISCAL',
                    $4,
                    $5
                )
                `,
                [
                    servicoId,

                    normalizarEmail(
                        servico.empresa_email
                    ),

                    normalizarEmail(
                        servico.prestador_email
                    )
                    ||
                    null,

                    nome,

                    arquivo
                ]
            );


            await registrarAuditoria(
                req.usuario.email,
                'NOTA_FISCAL',
                `Nota fiscal do serviço #${servicoId} arquivada.`
            );


            emitirAtualizacaoEmpresa(
                servico.empresa_email,
                'nota_fiscal_atualizada',
                {
                    servicoId
                }
            );


            return res.json({

                sucesso:
                    true,

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

                    sucesso:
                        false,

                    erro:
                        'Erro ao enviar nota fiscal.'
                });
        }
    }
);


// ============================================================
// CHAT — GARANTIR CONVERSA
//
// A CONVERSA É SEMPRE:
//
// EMPRESA DONA DO SERVIÇO
// ↕
// PRESTADOR TITULAR
//
// Não existe conversa entre empresas diferentes.
// ============================================================

async function garantirConversaServico(
    servico
) {

    if (
        !servico
        ||
        !servico.id
        ||
        !servico.empresa_email
        ||
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


    const resultado =
        await pool.query(
            `
            INSERT INTO
                conversas (
                    servico_id,
                    empresa_email,
                    prestador_email,
                    ativo,
                    atualizado_em
                )

            VALUES (
                $1,
                $2,
                $3,
                TRUE,
                CURRENT_TIMESTAMP
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


    return (
        resultado.rows[0]
        ||
        null
    );
}


// ============================================================
// BUSCAR CONVERSA
// ============================================================

async function buscarConversa(
    conversaId
) {

    const resultado =
        await pool.query(
            `
            SELECT

                conversa.*,

                servico.titulo
                    AS servico_titulo,

                servico.categoria
                    AS servico_categoria,

                servico.empresa_nome,

                servico.prestador_nome

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
                conversa.id =
                $1

            LIMIT 1
            `,
            [
                Number(
                    conversaId
                )
            ]
        );


    return (
        resultado.rows[0]
        ||
        null
    );
}


// ============================================================
// USUÁRIO PARTICIPA DA CONVERSA?
// ============================================================

function usuarioParticipaConversa(
    usuario,
    conversa
) {

    if (
        !usuario ||
        !conversa
    ) {

        return false;
    }


    // Grupo RS pode acessar para suporte.
    if (
        usuario.gestorRS
    ) {

        return true;
    }


    const email =
        normalizarEmail(
            usuario.email
        );


    return (
        email ===
        normalizarEmail(
            conversa.empresa_email
        )

        ||

        email ===
        normalizarEmail(
            conversa.prestador_email
        )
    );
}


// ============================================================
// ABRIR CONVERSA DO SERVIÇO
// ============================================================

app.get(
    '/api/servicos/:id/conversa',

    autenticarUsuario,

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
                await buscarServico(
                    servicoId
                );


            if (!servico) {

                return res
                    .status(404)
                    .json({

                        sucesso:
                            false,

                        erro:
                            'Serviço não encontrado.'
                    });
            }


            if (
                !servico.prestador_email
            ) {

                return res
                    .status(409)
                    .json({

                        sucesso:
                            false,

                        erro:
                            'Este serviço ainda não possui Titular.'
                    });
            }


            if (
                !usuarioPodeAcessarServicoPrivado(
                    req.usuario,
                    servico
                )
            ) {

                return responderAcessoNegado(
                    res,
                    'Você não participa deste serviço.'
                );
            }


            const conversa =
                await garantirConversaServico(
                    servico
                );


            if (!conversa) {

                return res
                    .status(500)
                    .json({

                        sucesso:
                            false,

                        erro:
                            'Não foi possível abrir a conversa.'
                    });
            }


            return res.json({

                sucesso:
                    true,

                conversa: {

                    ...conversa,

                    empresa_nome:
                        servico.empresa_nome,

                    prestador_nome:
                        servico.prestador_nome,

                    servico_titulo:
                        servico.titulo
                        ||
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

                    sucesso:
                        false,

                    erro:
                        'Erro ao abrir conversa.'
                });
        }
    }
);


// ============================================================
// LISTAR MINHAS CONVERSAS
//
// ROTA NOVA:
//
// /api/chat/conversas
//
// NÃO PRECISA INFORMAR E-MAIL.
// ============================================================

async function listarMinhasConversas(
    req,
    res
) {

    try {

        const email =
            req.usuario.email;


        let resultado;


        // ====================================================
        // ADMIN / GRUPO RS
        // ====================================================

        if (
            req.usuario.gestorRS
        ) {

            resultado =
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

                        0::int
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
                        conversa.ativo =
                        TRUE

                    ORDER BY
                        conversa.atualizado_em DESC,
                        conversa.id DESC
                    `
                );


        } else {

            // =================================================
            // EMPRESA / PRESTADOR
            // APENAS CONVERSAS DO PRÓPRIO E-MAIL.
            // =================================================

            resultado =
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
                        conversa.ativo =
                        TRUE

                    AND
                        (
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
                        )

                    ORDER BY
                        conversa.atualizado_em DESC,
                        conversa.id DESC
                    `,
                    [
                        email
                    ]
                );
        }


        return res.json({

            sucesso:
                true,

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

                sucesso:
                    false,

                erro:
                    'Erro ao carregar conversas.'
            });
    }
}


// ============================================================
// ROTA NOVA SEGURA
// ============================================================

app.get(
    '/api/chat/conversas',

    autenticarUsuario,

    listarMinhasConversas
);


// ============================================================
// COMPATIBILIDADE COM INDEX ANTIGO
//
// Mesmo que alguém troque:
// /api/chat/conversas/outro@gmail.com
//
// O server IGNORA o e-mail da URL.
// ============================================================

app.get(
    '/api/chat/conversas/:email',

    autenticarUsuario,

    listarMinhasConversas
);


// ============================================================
// LISTAR MENSAGENS DE UMA CONVERSA
// ============================================================

app.get(
    '/api/chat/conversas/:id/mensagens',

    autenticarUsuario,

    async (
        req,
        res
    ) => {

        try {

            const conversaId =
                Number(
                    req.params.id
                );


            const conversa =
                await buscarConversa(
                    conversaId
                );


            if (!conversa) {

                return res
                    .status(404)
                    .json({

                        sucesso:
                            false,

                        erro:
                            'Conversa não encontrada.'
                    });
            }


            if (
                !usuarioParticipaConversa(
                    req.usuario,
                    conversa
                )
            ) {

                return responderAcessoNegado(
                    res,
                    'Você não participa desta conversa.'
                );
            }


            const resultado =
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
                        conversaId
                    ]
                );


            return res.json({

                sucesso:
                    true,

                mensagens:
                    resultado.rows
            });


        } catch (err) {

            console.error(
                '❌ Mensagens chat:',
                err
            );


            return res
                .status(500)
                .json({

                    sucesso:
                        false,

                    erro:
                        'Erro ao carregar mensagens.'
                });
        }
    }
);


// ============================================================
// ENVIAR MENSAGEM
//
// REMETENTE NÃO VEM MAIS DO BODY.
//
// REMETENTE = USUÁRIO DO TOKEN.
// ============================================================

app.post(
    '/api/chat/conversas/:id/mensagens',

    autenticarUsuario,

    async (
        req,
        res
    ) => {

        try {

            const conversaId =
                Number(
                    req.params.id
                );


            const mensagem =
                String(
                    req.body?.mensagem ||
                    ''
                )
                    .trim();


            if (!mensagem) {

                return res
                    .status(400)
                    .json({

                        sucesso:
                            false,

                        erro:
                            'Digite uma mensagem.'
                    });
            }


            if (
                mensagem.length >
                5000
            ) {

                return res
                    .status(400)
                    .json({

                        sucesso:
                            false,

                        erro:
                            'Mensagem muito longa.'
                    });
            }


            const conversa =
                await buscarConversa(
                    conversaId
                );


            if (!conversa) {

                return res
                    .status(404)
                    .json({

                        sucesso:
                            false,

                        erro:
                            'Conversa não encontrada.'
                    });
            }


            if (
                !usuarioParticipaConversa(
                    req.usuario,
                    conversa
                )
            ) {

                return responderAcessoNegado(
                    res,
                    'Você não participa desta conversa.'
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


            let remetente =
                req.usuario.email;


            let destinatario =
                '';


            // =================================================
            // ADMIN / GRUPO RS
            //
            // Se gestor estiver dando suporte,
            // o destinatário precisa ser informado.
            // =================================================

            if (
                req.usuario.gestorRS
                &&
                remetente !==
                empresaEmail
                &&
                remetente !==
                prestadorEmail
            ) {

                const destinoInformado =
                    normalizarEmail(
                        req.body?.destinatario_email
                    );


                if (
                    destinoInformado !==
                    empresaEmail
                    &&
                    destinoInformado !==
                    prestadorEmail
                ) {

                    return res
                        .status(400)
                        .json({

                            sucesso:
                                false,

                            erro:
                                'Informe o destinatário da conversa.'
                        });
                }


                destinatario =
                    destinoInformado;


            } else {

                destinatario =
                    remetente ===
                    empresaEmail

                        ?

                        prestadorEmail

                        :

                        empresaEmail;
            }


            const resultado =
                await pool.query(
                    `
                    INSERT INTO
                        mensagens_chat (
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
                UPDATE
                    conversas

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


            // =================================================
            // SOCKET DA CONVERSA
            // =================================================

            io.to(
                `conversa_${conversaId}`
            )
                .emit(
                    'nova_mensagem',
                    novaMensagem
                );


            // =================================================
            // SOCKET PRIVADO DO DESTINATÁRIO
            // =================================================

            emitirAtualizacaoPrestador(
                destinatario,
                'mensagem_recebida',
                {
                    conversaId,

                    servicoId:
                        conversa.servico_id
                }
            );


            return res.json({

                sucesso:
                    true,

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

                    sucesso:
                        false,

                    erro:
                        'Erro ao enviar mensagem.'
                });
        }
    }
);


// ============================================================
// MARCAR MENSAGENS COMO LIDAS
//
// E-MAIL = TOKEN.
//
// Mantemos /lida e /lidas
// para compatibilidade com versões diferentes do INDEX.
// ============================================================

async function marcarMensagensLidas(
    req,
    res
) {

    try {

        const conversaId =
            Number(
                req.params.id
            );


        const conversa =
            await buscarConversa(
                conversaId
            );


        if (!conversa) {

            return res
                .status(404)
                .json({

                    sucesso:
                        false,

                    erro:
                        'Conversa não encontrada.'
                });
        }


        if (
            !usuarioParticipaConversa(
                req.usuario,
                conversa
            )
        ) {

            return responderAcessoNegado(
                res
            );
        }


        await pool.query(
            `
            UPDATE
                mensagens_chat

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
                req.usuario.email
            ]
        );


        return res.json({

            sucesso:
                true
        });


    } catch (err) {

        console.error(
            '❌ Marcar mensagens:',
            err
        );


        return res
            .status(500)
            .json({

                sucesso:
                    false,

                erro:
                    'Erro ao marcar mensagens.'
            });
    }
}


app.post(
    '/api/chat/conversas/:id/lida',
    autenticarUsuario,
    marcarMensagensLidas
);


app.post(
    '/api/chat/conversas/:id/lidas',
    autenticarUsuario,
    marcarMensagensLidas
);


// ============================================================
// TOTAL DE MENSAGENS NÃO LIDAS
//
// ROTA PRINCIPAL:
// /api/chat/nao-lidas
//
// COMPATIBILIDADE:
// /api/chat/nao-lidas/:email
//
// O EMAIL DA URL É IGNORADO.
// ============================================================

async function contarMensagensNaoLidas(
    req,
    res
) {

    try {

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
                    req.usuario.email
                ]
            );


        return res.json({

            sucesso:
                true,

            total:
                Number(
                    resultado.rows[0]?.total ||
                    0
                )
        });


    } catch (err) {

        console.error(
            '❌ Não lidas:',
            err
        );


        return res
            .status(500)
            .json({

                sucesso:
                    false,

                erro:
                    'Erro ao consultar mensagens.'
            });
    }
}


app.get(
    '/api/chat/nao-lidas',
    autenticarUsuario,
    contarMensagensNaoLidas
);


app.get(
    '/api/chat/nao-lidas/:email',
    autenticarUsuario,
    contarMensagensNaoLidas
);


// ============================================================
// CENTRAL DE NOTIFICAÇÕES
// ============================================================

app.get(
    '/api/notificacoes',
    autenticarUsuario,
    async (req, res) => {

        try {
            const limite = Math.min(Math.max(Number(req.query?.limite) || 50, 1), 100);

            const [lista, naoLidas] = await Promise.all([
                pool.query(
                    `SELECT id, titulo, mensagem, tipo, pagina, servico_id, lida, criado_em
                     FROM notificacoes
                     WHERE LOWER(usuario_email) = LOWER($1)
                     ORDER BY criado_em DESC
                     LIMIT $2`,
                    [req.usuario.email, limite]
                ),
                pool.query(
                    `SELECT COUNT(*)::int AS total
                     FROM notificacoes
                     WHERE LOWER(usuario_email) = LOWER($1) AND lida = FALSE`,
                    [req.usuario.email]
                )
            ]);

            return res.json({
                sucesso: true,
                notificacoes: lista.rows,
                naoLidas: Number(naoLidas.rows[0]?.total || 0)
            });
        } catch (err) {
            console.error('❌ Consultar notificações:', err);
            return res.status(500).json({sucesso: false, erro: 'Erro ao consultar notificações.'});
        }
    }
);


app.post(
    '/api/notificacoes/ler-todas',
    autenticarUsuario,
    async (req, res) => {
        try {
            await pool.query(
                `UPDATE notificacoes SET lida = TRUE
                 WHERE LOWER(usuario_email) = LOWER($1) AND lida = FALSE`,
                [req.usuario.email]
            );
            return res.json({sucesso: true, mensagem: 'Notificações marcadas como lidas.'});
        } catch (err) {
            console.error('❌ Ler notificações:', err);
            return res.status(500).json({sucesso: false, erro: 'Erro ao atualizar notificações.'});
        }
    }
);


app.post(
    '/api/notificacoes/:id/lida',
    autenticarUsuario,
    async (req, res) => {
        try {
            const resultado = await pool.query(
                `UPDATE notificacoes SET lida = TRUE
                 WHERE id = $1 AND LOWER(usuario_email) = LOWER($2)
                 RETURNING id`,
                [Number(req.params.id), req.usuario.email]
            );

            if (!resultado.rows.length) {
                return res.status(404).json({sucesso: false, erro: 'Notificação não encontrada.'});
            }

            return res.json({sucesso: true});
        } catch (err) {
            console.error('❌ Atualizar notificação:', err);
            return res.status(500).json({sucesso: false, erro: 'Erro ao atualizar notificação.'});
        }
    }
);


// ============================================================
// RELATÓRIO MENSAL DA EMPRESA
// ============================================================

app.get('/api/relatorios/mensal', autenticarUsuario, async (req, res) => {
    if (!req.usuario?.gestorRS && usuarioEhPrestador(req.usuario)) {
        return responderAcessoNegado(res, 'Relatório disponível apenas para empresas e Grupo RS.');
    }

    const mes = String(req.query?.mes || '').trim();
    if (!/^\d{4}-\d{2}$/.test(mes)) {
        return res.status(400).json({sucesso:false, erro:'Informe o mês no formato AAAA-MM.'});
    }

    const empresaEmail = req.usuario.gestorRS && req.query?.empresa
        ? normalizarEmail(req.query.empresa)
        : normalizarEmail(req.usuario.email);

    try {
        const inicio = `${mes}-01`;
        const resultado = await pool.query(`
            SELECT id, titulo, categoria, empresa_nome, empresa_email, prestador_nome,
                   prestador_email, data_horario, checkin_hora, intervalo_inicio,
                   intervalo_retorno, intervalo_fim, checkout_hora, valor_diaria,
                   valor_liquido, valor_total, status, validado_empresa,
                   pagamento_realizado, criado_em
            FROM servicos
            WHERE LOWER(empresa_email)=LOWER($1)
              AND criado_em >= $2::date
              AND criado_em < ($2::date + INTERVAL '1 month')
            ORDER BY criado_em ASC, id ASC
        `, [empresaEmail, inicio]);

        const servicos = resultado.rows.map(item => {
            const tempo = item.checkin_hora && item.checkout_hora
                ? calcularTempoTrabalhado(item, item.checkout_hora)
                : {minutos:0};
            const minutos = Math.max(0, Number(tempo?.minutos || 0));
            return {...item, minutos_trabalhados:minutos, minutos_extras:Math.max(0,minutos-480)};
        });

        const resumo = servicos.reduce((acc,item) => {
            acc.servicos += 1;
            acc.minutos += Number(item.minutos_trabalhados||0);
            acc.extras += Number(item.minutos_extras||0);
            acc.valor += numeroRS(item.valor_liquido || item.valor_diaria || item.valor_total || 0);
            if (item.pagamento_realizado) acc.pagos += 1;
            return acc;
        }, {servicos:0,minutos:0,extras:0,valor:0,pagos:0});

        return res.json({sucesso:true, mes, empresaEmail, empresaNome:servicos[0]?.empresa_nome || req.usuario.nome || 'Empresa', resumo, servicos});
    } catch (err) {
        console.error('❌ Relatório mensal:', err);
        return res.status(500).json({sucesso:false, erro:'Erro ao gerar relatório mensal.'});
    }
});


// ============================================================
// PERFIL PROFISSIONAL E AVALIAÇÕES
// ============================================================

app.get('/api/perfil/me', autenticarUsuario, async (req, res) => {
    try {
        const resultado = await pool.query(`
            SELECT u.id, u.nome, u.email, u.tipo, u.whatsapp, u.profissao, u.experiencia,
                   u.descricao, u.funcoes, u.foto_perfil, u.perfil_verificado,
                   u.documentos_verificados, u.documento_perfil_nome, u.cadastro_status,
                   COALESCE(AVG(a.nota),0)::numeric(3,2) AS avaliacao_media,
                   COUNT(a.id)::int AS total_avaliacoes,
                   (SELECT COUNT(*)::int FROM servicos s
                    WHERE LOWER(s.prestador_email)=LOWER(u.email)
                    AND s.checkout_hora IS NOT NULL) AS servicos_concluidos
            FROM usuarios u LEFT JOIN avaliacoes a ON LOWER(a.avaliado_email)=LOWER(u.email)
            WHERE u.id=$1 GROUP BY u.id
        `, [req.usuario.id]);
        return res.json({sucesso:true, perfil:resultado.rows[0] || null});
    } catch (err) {
        console.error('❌ Meu perfil:', err);
        return res.status(500).json({sucesso:false, erro:'Erro ao carregar o perfil.'});
    }
});


app.get('/api/perfis/:email', autenticarUsuario, async (req, res) => {
    try {
        const resultado = await pool.query(`
            SELECT u.nome, u.email, u.profissao, u.experiencia, u.descricao, u.funcoes,
                   u.foto_perfil, u.perfil_verificado,
                   COALESCE(AVG(a.nota),0)::numeric(3,2) AS avaliacao_media,
                   COUNT(a.id)::int AS total_avaliacoes,
                   (SELECT COUNT(*)::int FROM servicos s WHERE LOWER(s.prestador_email)=LOWER(u.email)
                    AND s.checkout_hora IS NOT NULL) AS servicos_concluidos
            FROM usuarios u LEFT JOIN avaliacoes a ON LOWER(a.avaliado_email)=LOWER(u.email)
            WHERE LOWER(u.email)=LOWER($1) AND LOWER(COALESCE(u.cadastro_status,'aprovado'))='aprovado'
            GROUP BY u.id
        `, [normalizarEmail(req.params.email)]);
        if (!resultado.rows.length) return res.status(404).json({sucesso:false, erro:'Perfil não encontrado.'});
        return res.json({sucesso:true, perfil:resultado.rows[0]});
    } catch (err) {
        console.error('❌ Perfil profissional:', err);
        return res.status(500).json({sucesso:false, erro:'Erro ao carregar o perfil profissional.'});
    }
});


app.put('/api/perfil/me', autenticarUsuario, async (req, res) => {
    try {
        const foto = String(req.body?.foto_perfil || '');
        const documento = String(req.body?.documento_perfil || '');
        const documentoNome = String(req.body?.documento_perfil_nome || '').slice(0,180);
        if (foto && !/^data:image\/(jpeg|png|webp);base64,/i.test(foto)) {
            return res.status(400).json({sucesso:false, erro:'Formato da foto inválido.'});
        }
        if (foto.length > 5 * 1024 * 1024) {
            return res.status(413).json({sucesso:false, erro:'A foto é muito grande.'});
        }
        if (documento && !/^data:(application\/pdf|image\/(jpeg|png|webp));base64,/i.test(documento)) {
            return res.status(400).json({sucesso:false, erro:'Envie o documento em PDF ou imagem.'});
        }
        if (documento.length > 7 * 1024 * 1024) {
            return res.status(413).json({sucesso:false, erro:'O documento é muito grande.'});
        }
        const resultado = await pool.query(`
            UPDATE usuarios SET whatsapp=$1, profissao=$2, experiencia=$3, descricao=$4,
                funcoes=$5, foto_perfil=CASE WHEN $6='' THEN foto_perfil ELSE $6 END,
                documento_perfil=CASE WHEN $7='' THEN documento_perfil ELSE $7 END,
                documento_perfil_nome=CASE WHEN $7='' THEN documento_perfil_nome ELSE $8 END,
                atualizado_em=CURRENT_TIMESTAMP
            WHERE id=$9
            RETURNING id, nome, email, tipo, whatsapp, profissao, experiencia, descricao,
                      funcoes, foto_perfil, perfil_verificado, documentos_verificados
        `, [
            String(req.body?.whatsapp || '').slice(0,40),
            String(req.body?.profissao || '').slice(0,150),
            String(req.body?.experiencia || '').slice(0,2000),
            String(req.body?.descricao || '').slice(0,1000),
            String(req.body?.funcoes || '').slice(0,600),
            foto,
            documento,
            documentoNome,
            req.usuario.id
        ]);
        return res.json({sucesso:true, mensagem:'Perfil atualizado.', perfil:resultado.rows[0]});
    } catch (err) {
        console.error('❌ Atualizar perfil:', err);
        return res.status(500).json({sucesso:false, erro:'Erro ao atualizar o perfil.'});
    }
});


app.post('/api/servicos/:id/avaliar', autenticarUsuario, async (req, res) => {
    const nota = Number(req.body?.nota);
    const comentario = String(req.body?.comentario || '').trim().slice(0,1000);
    if (!Number.isInteger(nota) || nota < 1 || nota > 5) {
        return res.status(400).json({sucesso:false, erro:'Escolha uma nota de 1 a 5.'});
    }
    try {
        const servico = await buscarServico(Number(req.params.id));
        if (!servico) return res.status(404).json({sucesso:false, erro:'Serviço não encontrado.'});
        if (!servico.checkout_hora) return res.status(409).json({sucesso:false, erro:'A avaliação só é liberada após o serviço.'});

        const email = normalizarEmail(req.usuario.email);
        let avaliadoEmail = '';
        let avaliadorTipo = '';
        if (req.usuario.gestorRS || empresaEhResponsavel(servico, email)) {
            avaliadoEmail = normalizarEmail(servico.prestador_email);
            avaliadorTipo = 'empresa';
        } else if (prestadorEhTitular(servico, email)) {
            avaliadoEmail = normalizarEmail(servico.empresa_email);
            avaliadorTipo = 'prestador';
        } else {
            return responderAcessoNegado(res, 'Você não participou deste serviço.');
        }
        if (!avaliadoEmail) return res.status(409).json({sucesso:false, erro:'Não foi possível identificar quem será avaliado.'});

        await pool.query(`
            INSERT INTO avaliacoes (servico_id, avaliador_email, avaliado_email, avaliador_tipo, nota, comentario)
            VALUES ($1,$2,$3,$4,$5,$6)
            ON CONFLICT (servico_id, avaliador_email)
            DO UPDATE SET nota=EXCLUDED.nota, comentario=EXCLUDED.comentario, criado_em=CURRENT_TIMESTAMP
        `, [Number(req.params.id), email, avaliadoEmail, avaliadorTipo, nota, comentario]);

        await registrarNotificacaoUsuario(avaliadoEmail, 'nova_avaliacao', {mensagem:`Você recebeu uma avaliação de ${nota} estrela(s).`, servicoId:Number(req.params.id)});
        return res.json({sucesso:true, mensagem:'Avaliação enviada com sucesso.'});
    } catch (err) {
        console.error('❌ Avaliar serviço:', err);
        return res.status(500).json({sucesso:false, erro:'Erro ao registrar a avaliação.'});
    }
});


// ============================================================
// PAINEL ADMINISTRATIVO — SOMENTE GRUPO RS
// ============================================================

app.get(
    '/api/admin/cadastros-pendentes',
    autenticarUsuario,
    async (req, res) => {
        if (!req.usuario?.gestorRS) return responderAcessoNegado(res, 'Área exclusiva do Grupo RS.');
        try {
            const resultado = await pool.query(`
                SELECT id, nome, email, tipo, doc, whatsapp, profissao, criado_em
                FROM usuarios
                WHERE LOWER(COALESCE(cadastro_status,'aprovado')) = 'pendente'
                ORDER BY criado_em ASC NULLS LAST, id ASC
            `);
            return res.json({sucesso: true, cadastros: resultado.rows});
        } catch (err) {
            console.error('❌ Cadastros pendentes:', err);
            return res.status(500).json({sucesso: false, erro: 'Erro ao consultar cadastros pendentes.'});
        }
    }
);


app.post(
    '/api/admin/usuarios/:id/aprovar',
    autenticarUsuario,
    async (req, res) => {
        if (!req.usuario?.gestorRS) return responderAcessoNegado(res, 'Área exclusiva do Grupo RS.');
        try {
            const resultado = await pool.query(`
                UPDATE usuarios SET cadastro_status = 'aprovado', aprovado_em = CURRENT_TIMESTAMP,
                    aprovado_por = $1, atualizado_em = CURRENT_TIMESTAMP
                WHERE id = $2 RETURNING id, nome, email, tipo
            `, [req.usuario.email, Number(req.params.id)]);
            if (!resultado.rows.length) return res.status(404).json({sucesso:false, erro:'Cadastro não encontrado.'});
            await registrarNotificacaoUsuario(resultado.rows[0].email, 'cadastro_aprovado', {mensagem:'Seu cadastro foi aprovado. Você já pode entrar no RS CONNECT.'});
            return res.json({sucesso:true, mensagem:'Cadastro aprovado com sucesso.', usuario:resultado.rows[0]});
        } catch (err) {
            console.error('❌ Aprovar cadastro:', err);
            return res.status(500).json({sucesso:false, erro:'Erro ao aprovar cadastro.'});
        }
    }
);


app.post(
    '/api/admin/usuarios/:id/rejeitar',
    autenticarUsuario,
    async (req, res) => {
        if (!req.usuario?.gestorRS) return responderAcessoNegado(res, 'Área exclusiva do Grupo RS.');
        try {
            const resultado = await pool.query(`
                UPDATE usuarios SET cadastro_status = 'rejeitado', aprovado_por = $1,
                    atualizado_em = CURRENT_TIMESTAMP WHERE id = $2 RETURNING id, email
            `, [req.usuario.email, Number(req.params.id)]);
            if (!resultado.rows.length) return res.status(404).json({sucesso:false, erro:'Cadastro não encontrado.'});
            return res.json({sucesso:true, mensagem:'Cadastro rejeitado.'});
        } catch (err) {
            console.error('❌ Rejeitar cadastro:', err);
            return res.status(500).json({sucesso:false, erro:'Erro ao rejeitar cadastro.'});
        }
    }
);


app.post(
    '/api/admin/usuarios/:id/verificar-perfil',
    autenticarUsuario,
    async (req, res) => {
        if (!req.usuario?.gestorRS) return responderAcessoNegado(res, 'Área exclusiva do Grupo RS.');
        try {
            const verificado = req.body?.verificado !== false;
            const resultado = await pool.query(`
                UPDATE usuarios SET perfil_verificado = $1, documentos_verificados = $1,
                    atualizado_em = CURRENT_TIMESTAMP WHERE id = $2 RETURNING id, email, perfil_verificado
            `, [verificado, Number(req.params.id)]);
            if (!resultado.rows.length) return res.status(404).json({sucesso:false, erro:'Usuário não encontrado.'});
            return res.json({sucesso:true, mensagem:verificado?'Perfil verificado.':'Verificação removida.'});
        } catch (err) {
            console.error('❌ Verificar perfil:', err);
            return res.status(500).json({sucesso:false, erro:'Erro ao verificar perfil.'});
        }
    }
);


app.get('/api/admin/central', autenticarUsuario, async (req,res) => {
    if(!req.usuario?.gestorRS) return responderAcessoNegado(res,'Central exclusiva do Grupo RS.');
    try{
        const [usuarios,servicos,jornadas,pagamentos,avaliacoes,auditoria]=await Promise.all([
            pool.query(`SELECT id,nome,email,tipo,doc,responsavel,whatsapp,profissao,cadastro_status,perfil_verificado,documentos_verificados,criado_em,atualizado_em FROM usuarios ORDER BY id DESC LIMIT 200`),
            pool.query(`SELECT id,titulo,categoria,empresa_nome,empresa_email,prestador_nome,prestador_email,status,valor_liquido,data_horario,criado_em FROM servicos ORDER BY id DESC LIMIT 200`),
            pool.query(`SELECT id,titulo,empresa_nome,prestador_nome,prestador_email,checkin_hora,intervalo_inicio,intervalo_retorno,intervalo_fim,checkout_hora,jornada_aprovacao_status,validado_empresa,data_horario FROM servicos WHERE checkin_hora IS NOT NULL OR checkout_hora IS NOT NULL ORDER BY id DESC LIMIT 200`),
            pool.query(`SELECT id,servico_id,empresa_email,prestador_email,valor,forma_pagamento,status,autorizado_em,pago_em,criado_em FROM pagamentos ORDER BY id DESC LIMIT 200`),
            pool.query(`SELECT id,servico_id,avaliador_email,avaliado_email,avaliador_tipo,nota,comentario,criado_em FROM avaliacoes ORDER BY id DESC LIMIT 200`),
            pool.query(`SELECT id,usuario_email,acao,detalhes,criado_em FROM auditoria_sistema ORDER BY id DESC LIMIT 250`)
        ]);
        return res.json({sucesso:true,usuarios:usuarios.rows,servicos:servicos.rows,jornadas:jornadas.rows,pagamentos:pagamentos.rows,avaliacoes:avaliacoes.rows,auditoria:auditoria.rows});
    }catch(err){console.error('❌ Central administrativa:',err);return res.status(500).json({sucesso:false,erro:'Erro ao carregar a Central Administrativa.'});}
});


app.post('/api/admin/usuarios/:id/situacao', autenticarUsuario, async (req,res) => {
    if(!req.usuario?.gestorRS) return responderAcessoNegado(res,'Área exclusiva do Grupo RS.');
    const situacao=String(req.body?.situacao||'').toLowerCase();
    if(!['aprovado','bloqueado','rejeitado'].includes(situacao)) return res.status(400).json({sucesso:false,erro:'Situação inválida.'});
    try{
        const resultado=await pool.query(`UPDATE usuarios SET cadastro_status=$1,atualizado_em=CURRENT_TIMESTAMP WHERE id=$2 RETURNING id,nome,email,cadastro_status`,[situacao,Number(req.params.id)]);
        if(!resultado.rows.length)return res.status(404).json({sucesso:false,erro:'Usuário não encontrado.'});
        await registrarAuditoria(req.usuario.email,'ADMIN_SITUACAO_USUARIO',`Conta ${resultado.rows[0].email} alterada para ${situacao}.`);
        return res.json({sucesso:true,mensagem:`Conta marcada como ${situacao}.`,usuario:resultado.rows[0]});
    }catch(err){console.error('❌ Situação usuário:',err);return res.status(500).json({sucesso:false,erro:'Erro ao atualizar usuário.'});}
});


app.delete('/api/admin/avaliacoes/:id', autenticarUsuario, async (req,res) => {
    if(!req.usuario?.gestorRS) return responderAcessoNegado(res,'Área exclusiva do Grupo RS.');
    try{
        const resultado=await pool.query('DELETE FROM avaliacoes WHERE id=$1 RETURNING id,servico_id',[Number(req.params.id)]);
        if(!resultado.rows.length)return res.status(404).json({sucesso:false,erro:'Avaliação não encontrada.'});
        await registrarAuditoria(req.usuario.email,'ADMIN_REMOVER_AVALIACAO',`Avaliação #${req.params.id} removida.`);
        return res.json({sucesso:true,mensagem:'Avaliação removida.'});
    }catch(err){console.error('❌ Remover avaliação:',err);return res.status(500).json({sucesso:false,erro:'Erro ao remover avaliação.'});}
});

app.get(
    '/api/admin/resumo',
    autenticarUsuario,
    async (req, res) => {

        if (!req.usuario?.gestorRS) {
            return responderAcessoNegado(res, 'Painel exclusivo do Grupo RS.');
        }

        try {
            const resultado = await pool.query(`
                SELECT
                    (SELECT COUNT(*)::int FROM usuarios) AS usuarios,
                    (SELECT COUNT(*)::int FROM usuarios
                     WHERE LOWER(COALESCE(cadastro_status,'aprovado'))='pendente') AS cadastros_pendentes,
                    (SELECT COUNT(*)::int FROM usuarios
                     WHERE LOWER(COALESCE(tipo,'')) IN ('prestador','colaborador')) AS prestadores,
                    (SELECT COUNT(*)::int FROM usuarios
                     WHERE LOWER(COALESCE(tipo,'')) NOT IN ('prestador','colaborador')) AS empresas,
                    (SELECT COUNT(*)::int FROM servicos
                     WHERE LOWER(COALESCE(status,'')) NOT IN ('pago','cancelado','excluido')) AS servicos_ativos,
                    (SELECT COUNT(*)::int FROM servicos
                     WHERE checkout_hora IS NOT NULL AND COALESCE(validado_empresa,FALSE) = FALSE) AS jornadas_pendentes,
                    (SELECT COUNT(*)::int FROM servicos
                     WHERE COALESCE(pagamento_autorizado,FALSE) = TRUE
                     AND COALESCE(pagamento_realizado,FALSE) = FALSE) AS pagamentos_pendentes
            `);

            const usuariosRecentes = await pool.query(`
                SELECT id, nome, email, tipo, cadastro_status, perfil_verificado,
                       documento_perfil_nome, criado_em
                FROM usuarios
                ORDER BY criado_em DESC NULLS LAST, id DESC
                LIMIT 8
            `);

            const servicosRecentes = await pool.query(`
                SELECT id, titulo, empresa_nome, prestador_nome, status, criado_em
                FROM servicos
                ORDER BY criado_em DESC NULLS LAST, id DESC
                LIMIT 8
            `);

            return res.json({
                sucesso: true,
                resumo: resultado.rows[0] || {},
                usuariosRecentes: usuariosRecentes.rows,
                servicosRecentes: servicosRecentes.rows
            });
        } catch (err) {
            console.error('❌ Painel administrativo:', err);
            return res.status(500).json({sucesso: false, erro: 'Erro ao carregar o painel administrativo.'});
        }
    }
);


// ============================================================
// FIM DA PARTE 11
//
// PARTE 12:
//
// WEBSOCKET SEGURO COM TOKEN
// SALAS PRIVADAS
// STATUS DO SERVER
// 404
// INICIALIZAÇÃO DO RENDER
// ENCERRAMENTO
//
// A PARTE 12 FECHA O NOVO SERVER.JS.
// ============================================================
// ============================================================
// RS CONNECT — SERVER.JS
// VERSÃO COM PRIVACIDADE POR EMPRESA
//
// PARTE 12 — FINAL
//
// WEBSOCKET SEGURO
// STATUS
// TRATAMENTO DE ERROS
// FRONT-END
// RENDER
// ENCERRAMENTO
//
// ESTA PARTE FECHA O server.js
// ============================================================


// ============================================================
// WEBSOCKET — AUTENTICAÇÃO POR TOKEN
//
// O SOCKET NÃO CONFIA MAIS EM:
//
// identificar_usuario({ email: '...' })
//
// PRIMEIRO CONFERE O TOKEN.
// ============================================================

io.use(
    async (
        socket,
        next
    ) => {

        try {

            const token =
                String(
                    socket.handshake?.auth?.token
                    ||
                    socket.handshake?.headers?.['x-rs-token']
                    ||
                    ''
                )
                    .trim();


            const payload =
                validarTokenUsuario(
                    token
                );


            if (!payload) {

                return next(
                    new Error(
                        'Sessão inválida ou expirada.'
                    )
                );
            }


            const usuario =
                await buscarUsuarioPorEmail(
                    payload.email
                );


            if (!usuario) {

                return next(
                    new Error(
                        'Usuário não encontrado.'
                    )
                );
            }


            socket.data.usuario = {

                id:
                    Number(
                        usuario.id
                    ),

                nome:
                    usuario.nome,

                email:
                    normalizarEmail(
                        usuario.email
                    ),

                tipo:
                    String(
                        usuario.tipo ||
                        ''
                    )
                        .trim()
                        .toLowerCase(),

                gestorRS:
                    usuarioEhGestorRS(
                        usuario
                    ),

                prestador:
                    usuarioEhPrestador(
                        usuario
                    )
            };


            return next();


        } catch (err) {

            console.error(
                '❌ Autenticação WebSocket:',
                err
            );


            return next(
                new Error(
                    'Não foi possível autenticar o WebSocket.'
                )
            );
        }
    }
);


// ============================================================
// WEBSOCKET
// ============================================================

io.on(
    'connection',

    socket => {

        const usuario =
            socket.data.usuario;


        if (!usuario) {

            socket.disconnect(
                true
            );

            return;
        }


        const email =
            normalizarEmail(
                usuario.email
            );


        console.log(
            `🔌 WebSocket conectado: ${email} (${socket.id})`
        );


        // ====================================================
        // SALAS DO PRÓPRIO USUÁRIO
        //
        // Mantemos os dois formatos
        // para compatibilidade com partes anteriores.
        // ====================================================

        socket.join(
            `usuario_${email}`
        );


        socket.join(
            `user:${email}`
        );


        // ====================================================
        // SALA EXCLUSIVA DOS GESTORES RS
        // ====================================================

        if (
            usuario.gestorRS
        ) {

            socket.join(
                'gestores_rs'
            );
        }


        // ====================================================
        // IDENTIFICAR USUÁRIO
        //
        // COMPATIBILIDADE COM INDEX ANTIGO.
        //
        // IMPORTANTE:
        // IGNORAMOS QUALQUER E-MAIL ENVIADO PELO NAVEGADOR.
        //
        // O ÚNICO E-MAIL VÁLIDO É O DO TOKEN.
        // ====================================================

        socket.on(
            'identificar_usuario',

            () => {

                socket.data.email =
                    email;


                socket.emit(
                    'usuario_identificado',
                    {
                        sucesso:
                            true,

                        email
                    }
                );
            }
        );


        // ====================================================
        // ENTRAR EM CONVERSA
        //
        // ANTES DE ENTRAR NA SALA,
        // VERIFICAMOS SE O USUÁRIO PARTICIPA.
        // ====================================================

        socket.on(
            'entrar_conversa',

            async dados => {

                try {

                    const conversaId =
                        Number(
                            dados?.conversaId
                            ||
                            dados?.conversa_id
                        );


                    if (!conversaId) {

                        return;
                    }


                    const conversa =
                        await buscarConversa(
                            conversaId
                        );


                    if (!conversa) {

                        socket.emit(
                            'erro_chat',
                            {
                                erro:
                                    'Conversa não encontrada.'
                            }
                        );


                        return;
                    }


                    if (
                        !usuarioParticipaConversa(
                            usuario,
                            conversa
                        )
                    ) {

                        socket.emit(
                            'erro_chat',
                            {
                                erro:
                                    'Você não participa desta conversa.'
                            }
                        );


                        return;
                    }


                    socket.join(
                        `conversa_${conversaId}`
                    );


                    socket.emit(
                        'conversa_conectada',
                        {
                            conversaId
                        }
                    );


                } catch (err) {

                    console.error(
                        '❌ Entrar conversa WebSocket:',
                        err
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
                        dados?.conversaId
                        ||
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


        // ====================================================
        // PING DO APLICATIVO
        // ====================================================

        socket.on(
            'rs_ping',

            () => {

                socket.emit(
                    'rs_pong',
                    {
                        horario:
                            new Date()
                                .toISOString()
                    }
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
                    `🔌 WebSocket desconectado: ${email} — ${motivo}`
                );
            }
        );
    }
);


// ============================================================
// STATUS GERAL
// ============================================================

app.get(
    '/api/status',

    async (
        req,
        res
    ) => {

        try {

            await pool.query(
                'SELECT 1'
            );


            return res.json({

                sucesso:
                    true,

                sistema:
                    'RS Connect',

                status:
                    'online',

                banco:
                    'online',

                websocket:
                    'online',

                autenticacao:
                    'token',

                privacidade_empresas:
                    'ativa',

                horario:
                    horaAtualRS()
            });


        } catch (err) {

            return res
                .status(500)
                .json({

                    sucesso:
                        false,

                    status:
                        'erro',

                    erro:
                        err.message
                });
        }
    }
);


// ============================================================
// INFORMAÇÕES DA CONTA LOGADA
//
// ÚTIL PARA O INDEX SABER:
//
// - quem está logado;
// - tipo;
// - se é gestor;
// - cliente vinculado.
// ============================================================

app.get(
    '/api/me',

    autenticarUsuario,

    async (
        req,
        res
    ) => {

        try {

            const contexto =
                await obterContextoPrivacidade(
                    req.usuario
                );


            return res.json({

                sucesso:
                    true,

                usuario:
                    req.usuario,

                privacidade: {

                    gestorRS:
                        contexto.gestorRS,

                    empresaCliente:
                        contexto.empresaCliente,

                    prestador:
                        contexto.prestador,

                    clienteId:
                        contexto.clienteId,

                    clienteNome:
                        contexto.cliente?.nome
                        ||
                        null
                }
            });


        } catch (err) {

            console.error(
                '❌ /api/me:',
                err
            );


            return res
                .status(500)
                .json({

                    sucesso:
                        false,

                    erro:
                        'Erro ao carregar informações da conta.'
                });
        }
    }
);


// ============================================================
// ERROS DO MULTER / UPLOAD
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

                        sucesso:
                            false,

                        erro:
                            'Arquivo muito grande. Limite de 10 MB.'
                    });
            }


            return res
                .status(400)
                .json({

                    sucesso:
                        false,

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
//
// PRECISA FICAR DEPOIS DE TODAS AS ROTAS /api.
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
// FRONT-END
//
// QUALQUER GET QUE NÃO FOR /api
// ENTREGA O index.html.
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

                sucesso:
                    false,

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
                process.env.NODE_ENV
                ||
                'development'
            }`
        );


        console.log(
            '🕒 Timezone: America/Sao_Paulo'
        );


        console.log(
            '🔐 Privacidade por empresa: ATIVA'
        );


        console.log(
            '======================================'
        );


        // ====================================================
        // DATABASE_URL
        // ====================================================

        if (
            !process.env.DATABASE_URL
        ) {

            throw new Error(
                'DATABASE_URL não configurada.'
            );
        }


        // ====================================================
        // AVISO DA CHAVE DO TOKEN
        //
        // NÃO DERRUBAMOS O SERVIDOR,
        // MAS É RECOMENDADO CONFIGURAR NO RENDER:
        //
        // AUTH_TOKEN_SECRET
        // ====================================================

        if (
            !process.env.AUTH_TOKEN_SECRET
        ) {

            console.warn(
                '⚠️ AUTH_TOKEN_SECRET ainda não foi configurada no Render.'
            );


            console.warn(
                '⚠️ Configure uma chave grande e aleatória antes do uso definitivo.'
            );
        }


        // ====================================================
        // TESTAR POSTGRESQL
        // ====================================================

        await pool.query(
            'SELECT NOW()'
        );


        console.log(
            '✅ PostgreSQL conectado.'
        );


        // ====================================================
        // CRIAR / ATUALIZAR BANCO
        // ====================================================

        await criarTabelas();


        await criarTabelasJornadaClientes();


        console.log(
            '✅ Banco principal verificado.'
        );


        console.log(
            '✅ Clientes sob demanda verificados.'
        );


        console.log(
            '✅ Jornada verificada.'
        );


        console.log(
            '✅ Privacidade preparada.'
        );


        // ====================================================
        // PORTA RENDER
        // ====================================================

        const PORT =
            Number(
                process.env.PORT
                ||
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
                    '✅ LOGIN + TOKEN ONLINE'
                );


                console.log(
                    '✅ RECUPERAÇÃO DE SENHA ONLINE'
                );


                console.log(
                    '✅ WEBSOCKET PROTEGIDO ONLINE'
                );


                console.log(
                    '✅ SERVIÇOS / VAGAS ONLINE'
                );


                console.log(
                    '✅ CLIENTES SOB DEMANDA ONLINE'
                );


                console.log(
                    '✅ JORNADA ONLINE'
                );


                console.log(
                    '✅ DOCUMENTOS ONLINE'
                );


                console.log(
                    '✅ PAGAMENTOS ONLINE'
                );


                console.log(
                    '✅ CHAT ONLINE'
                );


                console.log(
                    '✅ PRIVACIDADE ENTRE EMPRESAS ATIVA'
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
// ENCERRAMENTO CORRETO NO RENDER
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
// FIM DO NOVO server.js
// ============================================================
