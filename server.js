// ============================================================
// RS CONNECT - CHAT PRIVADO
// PARTE 1
// BANCO + CONVERSAS + FUNÇÕES AUXILIARES
// ============================================================


// ============================================================
// CRIAR TABELAS DO CHAT
// ============================================================

async function verificarTabelasChat() {

    try {

        // ----------------------------------------------------
        // CONVERSAS
        // Uma conversa pertence a um serviço.
        // ----------------------------------------------------

        await pool.query(`

            CREATE TABLE IF NOT EXISTS conversas (

                id SERIAL PRIMARY KEY,

                servico_id INTEGER NOT NULL,

                empresa_email VARCHAR(255) NOT NULL,

                prestador_email VARCHAR(255) NOT NULL,

                criado_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

                atualizado_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

                ativo BOOLEAN DEFAULT TRUE,

                UNIQUE (
                    servico_id,
                    empresa_email,
                    prestador_email
                )

            );

        `);


        // ----------------------------------------------------
        // MENSAGENS
        // ----------------------------------------------------

        await pool.query(`

            CREATE TABLE IF NOT EXISTS mensagens (

                id SERIAL PRIMARY KEY,

                conversa_id INTEGER NOT NULL,

                servico_id INTEGER NOT NULL,

                remetente_email VARCHAR(255) NOT NULL,

                destinatario_email VARCHAR(255) NOT NULL,

                mensagem TEXT NOT NULL,

                tipo VARCHAR(30) DEFAULT 'texto',

                lida BOOLEAN DEFAULT FALSE,

                criado_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

                FOREIGN KEY (conversa_id)
                    REFERENCES conversas(id)
                    ON DELETE CASCADE

            );

        `);


        // ----------------------------------------------------
        // ÍNDICES PARA O CHAT FICAR RÁPIDO
        // ----------------------------------------------------

        await pool.query(`

            CREATE INDEX IF NOT EXISTS idx_conversas_servico
            ON conversas(servico_id);

        `);


        await pool.query(`

            CREATE INDEX IF NOT EXISTS idx_conversas_empresa
            ON conversas(empresa_email);

        `);


        await pool.query(`

            CREATE INDEX IF NOT EXISTS idx_conversas_prestador
            ON conversas(prestador_email);

        `);


        await pool.query(`

            CREATE INDEX IF NOT EXISTS idx_mensagens_conversa
            ON mensagens(conversa_id);

        `);


        await pool.query(`

            CREATE INDEX IF NOT EXISTS idx_mensagens_servico
            ON mensagens(servico_id);

        `);


        await pool.query(`

            CREATE INDEX IF NOT EXISTS idx_mensagens_criado_em
            ON mensagens(criado_em);

        `);


        console.log(
            "Tabelas do chat RS Connect verificadas com sucesso."
        );


    } catch (erro) {

        console.error(
            "Erro ao verificar tabelas do chat:",
            erro
        );

        throw erro;
    }
}



// ============================================================
// NORMALIZAR E-MAIL
// ============================================================

function normalizarEmailChat(email) {

    return String(
        email || ""
    )
    .trim()
    .toLowerCase();
}



// ============================================================
// BUSCAR SERVIÇO
// ============================================================

async function buscarServicoChat(servicoId) {

    const resultado = await pool.query(

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


    return resultado.rows[0] || null;
}



// ============================================================
// DESCOBRIR E-MAIL DA EMPRESA
// ============================================================

function obterEmpresaEmailChat(servico) {

    return normalizarEmailChat(

        servico?.empresa_email ||

        servico?.empresaEmail ||

        servico?.email_empresa ||

        ""
    );
}



// ============================================================
// DESCOBRIR E-MAIL DO PRESTADOR TITULAR
// ============================================================

function obterPrestadorEmailChat(servico) {

    return normalizarEmailChat(

        servico?.prestador_email ||

        servico?.prestadorEmail ||

        servico?.email_prestador ||

        ""
    );
}



// ============================================================
// VERIFICAR SE USUÁRIO PODE ACESSAR O CHAT
// ============================================================

async function usuarioPodeAcessarChat(
    servicoId,
    usuarioEmail
) {

    const servico =
        await buscarServicoChat(
            servicoId
        );


    if (!servico) {

        return {

            autorizado: false,

            motivo:
                "Serviço não encontrado.",

            servico: null
        };
    }


    const email =
        normalizarEmailChat(
            usuarioEmail
        );


    const empresaEmail =
        obterEmpresaEmailChat(
            servico
        );


    const prestadorEmail =
        obterPrestadorEmailChat(
            servico
        );


    // --------------------------------------------------------
    // EMPRESA DO SERVIÇO
    // --------------------------------------------------------

    if (
        email &&
        email === empresaEmail
    ) {

        return {

            autorizado: true,

            tipo:
                "empresa",

            servico,

            empresaEmail,

            prestadorEmail
        };
    }


    // --------------------------------------------------------
    // PRESTADOR TITULAR
    // --------------------------------------------------------

    if (
        email &&
        email === prestadorEmail
    ) {

        return {

            autorizado: true,

            tipo:
                "prestador",

            servico,

            empresaEmail,

            prestadorEmail
        };
    }


    return {

        autorizado: false,

        motivo:
            "Você não possui acesso ao chat deste serviço.",

        servico,

        empresaEmail,

        prestadorEmail
    };
}



// ============================================================
// CRIAR OU LOCALIZAR CONVERSA
// ============================================================

async function obterOuCriarConversa(
    servicoId
) {

    const servico =
        await buscarServicoChat(
            servicoId
        );


    if (!servico) {

        throw new Error(
            "Serviço não encontrado."
        );
    }


    const empresaEmail =
        obterEmpresaEmailChat(
            servico
        );


    const prestadorEmail =
        obterPrestadorEmailChat(
            servico
        );


    if (!empresaEmail) {

        throw new Error(
            "Este serviço não possui empresa vinculada."
        );
    }


    if (!prestadorEmail) {

        throw new Error(
            "O chat será liberado quando houver um prestador titular."
        );
    }


    // --------------------------------------------------------
    // VERIFICAR SE JÁ EXISTE
    // --------------------------------------------------------

    const existente =
        await pool.query(

            `

            SELECT *
            FROM conversas

            WHERE servico_id = $1
              AND LOWER(empresa_email) = LOWER($2)
              AND LOWER(prestador_email) = LOWER($3)

            LIMIT 1

            `,

            [
                servicoId,
                empresaEmail,
                prestadorEmail
            ]
        );


    if (
        existente.rows.length
    ) {

        return existente.rows[0];
    }


    // --------------------------------------------------------
    // CRIAR CONVERSA
    // --------------------------------------------------------

    const criada =
        await pool.query(

            `

            INSERT INTO conversas (

                servico_id,
                empresa_email,
                prestador_email

            )

            VALUES (
                $1,
                $2,
                $3
            )

            ON CONFLICT (
                servico_id,
                empresa_email,
                prestador_email
            )

            DO UPDATE SET

                atualizado_em =
                    CURRENT_TIMESTAMP,

                ativo =
                    TRUE

            RETURNING *;

            `,

            [
                servicoId,
                empresaEmail,
                prestadorEmail
            ]
        );


    return criada.rows[0];
}



// ============================================================
// SALA SOCKET DE CADA CONVERSA
// ============================================================

function nomeSalaChat(
    conversaId
) {

    return `chat_${conversaId}`;
}



// ============================================================
// SOCKET.IO - ENTRAR NA SALA DO CHAT
// ============================================================

io.on(
    "connection",
    socket => {

        console.log(
            "Cliente conectado ao chat:",
            socket.id
        );


        // ----------------------------------------------------
        // ENTRAR NA CONVERSA
        // ----------------------------------------------------

        socket.on(
            "chat:entrar",
            async dados => {

                try {

                    const servicoId =
                        Number(
                            dados?.servicoId
                        );


                    const email =
                        normalizarEmailChat(
                            dados?.email
                        );


                    if (
                        !servicoId ||
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
                            "chat:erro",
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


                    const sala =
                        nomeSalaChat(
                            conversa.id
                        );


                    socket.join(
                        sala
                    );


                    socket.emit(
                        "chat:entrou",
                        {

                            conversaId:
                                conversa.id,

                            servicoId,

                            sala
                        }
                    );


                    console.log(
                        `${email} entrou na conversa ${conversa.id}`
                    );


                } catch (erro) {

                    console.error(
                        "Erro ao entrar no chat:",
                        erro
                    );


                    socket.emit(
                        "chat:erro",
                        {
                            mensagem:
                                erro.message ||
                                "Erro ao entrar no chat."
                        }
                    );
                }
            }
        );


        // ----------------------------------------------------
        // SAIR DA SALA
        // ----------------------------------------------------

        socket.on(
            "chat:sair",
            dados => {

                const conversaId =
                    Number(
                        dados?.conversaId
                    );


                if (!conversaId) {

                    return;
                }


                socket.leave(
                    nomeSalaChat(
                        conversaId
                    )
                );
            }
        );


        socket.on(
            "disconnect",
            () => {

                console.log(
                    "Cliente desconectado do chat:",
                    socket.id
                );
            }
        );
    }
);



// ============================================================
// EXECUTAR VERIFICAÇÃO DAS TABELAS DO CHAT
// ============================================================

verificarTabelasChat()
    .catch(
        erro => {

            console.error(
                "Falha ao iniciar banco do chat:",
                erro
            );
        }
    );


// ============================================================
// FIM DA PARTE 1 DO CHAT
// ============================================================
// ============================================================
// RS CONNECT - CHAT PRIVADO
// PARTE 2
// ROTAS REST + MENSAGENS EM TEMPO REAL
// ============================================================


// ============================================================
// LISTAR CONVERSAS DO USUÁRIO
// GET /api/chat/conversas?email=usuario@email.com
// ============================================================

app.get(
    "/api/chat/conversas",
    async (req, res) => {

        try {

            const email =
                normalizarEmailChat(
                    req.query.email
                );


            if (!email) {

                return res
                    .status(400)
                    .json({
                        erro:
                            "E-mail do usuário é obrigatório."
                    });
            }


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

                        s.titulo AS servico_titulo,
                        s.categoria AS servico_categoria,
                        s.local AS servico_local,
                        s.empresa_nome,
                        s.prestador_nome,

                        (
                            SELECT m.mensagem

                            FROM mensagens m

                            WHERE m.conversa_id = c.id

                            ORDER BY
                                m.criado_em DESC,
                                m.id DESC

                            LIMIT 1
                        )
                        AS ultima_mensagem,

                        (
                            SELECT m.criado_em

                            FROM mensagens m

                            WHERE m.conversa_id = c.id

                            ORDER BY
                                m.criado_em DESC,
                                m.id DESC

                            LIMIT 1
                        )
                        AS ultima_mensagem_em,

                        (
                            SELECT COUNT(*)

                            FROM mensagens m

                            WHERE m.conversa_id = c.id

                              AND LOWER(
                                    m.destinatario_email
                                  ) = LOWER($1)

                              AND m.lida = FALSE
                        )
                        AS nao_lidas

                    FROM conversas c

                    LEFT JOIN servicos s
                        ON s.id = c.servico_id

                    WHERE
                        (
                            LOWER(c.empresa_email)
                            =
                            LOWER($1)

                            OR

                            LOWER(c.prestador_email)
                            =
                            LOWER($1)
                        )

                        AND c.ativo = TRUE

                    ORDER BY

                        COALESCE(

                            (
                                SELECT MAX(m.criado_em)

                                FROM mensagens m

                                WHERE
                                    m.conversa_id = c.id
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
                sucesso:
                    true,

                conversas:
                    resultado.rows
            });


        } catch (erro) {

            console.error(
                "Erro ao listar conversas:",
                erro
            );


            return res
                .status(500)
                .json({
                    erro:
                        "Erro ao carregar conversas."
                });
        }
    }
);



// ============================================================
// BUSCAR MENSAGENS DE UM SERVIÇO
//
// GET
// /api/chat/:servicoId/mensagens?email=usuario@email.com
// ============================================================

app.get(
    "/api/chat/:servicoId/mensagens",
    async (req, res) => {

        try {

            const servicoId =
                Number(
                    req.params.servicoId
                );


            const email =
                normalizarEmailChat(
                    req.query.email
                );


            if (!servicoId) {

                return res
                    .status(400)
                    .json({
                        erro:
                            "Serviço inválido."
                    });
            }


            if (!email) {

                return res
                    .status(400)
                    .json({
                        erro:
                            "E-mail do usuário é obrigatório."
                    });
            }


            // ------------------------------------------------
            // VERIFICAR ACESSO
            // ------------------------------------------------

            const permissao =
                await usuarioPodeAcessarChat(
                    servicoId,
                    email
                );


            if (
                !permissao.autorizado
            ) {

                return res
                    .status(403)
                    .json({
                        erro:
                            permissao.motivo
                    });
            }


            // ------------------------------------------------
            // CRIAR / LOCALIZAR CONVERSA
            // ------------------------------------------------

            const conversa =
                await obterOuCriarConversa(
                    servicoId
                );


            // ------------------------------------------------
            // CARREGAR MENSAGENS
            // ------------------------------------------------

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

                    FROM mensagens

                    WHERE conversa_id = $1

                    ORDER BY
                        criado_em ASC,
                        id ASC

                    `,

                    [
                        conversa.id
                    ]
                );


            // ------------------------------------------------
            // MARCAR COMO LIDAS AS MENSAGENS RECEBIDAS
            // ------------------------------------------------

            await pool.query(

                `

                UPDATE mensagens

                SET lida = TRUE

                WHERE conversa_id = $1

                  AND LOWER(
                        destinatario_email
                      ) = LOWER($2)

                  AND lida = FALSE

                `,

                [
                    conversa.id,
                    email
                ]
            );


            return res.json({

                sucesso:
                    true,

                conversa: {

                    id:
                        conversa.id,

                    servicoId:
                        servicoId,

                    empresaEmail:
                        conversa.empresa_email,

                    prestadorEmail:
                        conversa.prestador_email,

                    servicoTitulo:
                        permissao.servico?.titulo ||
                        "Serviço",

                    empresaNome:
                        permissao.servico?.empresa_nome ||
                        permissao.empresaEmail,

                    prestadorNome:
                        permissao.servico?.prestador_nome ||
                        permissao.prestadorEmail
                },

                mensagens:
                    mensagens.rows
            });


        } catch (erro) {

            console.error(
                "Erro ao buscar mensagens:",
                erro
            );


            return res
                .status(500)
                .json({
                    erro:
                        erro.message ||
                        "Erro ao carregar mensagens."
                });
        }
    }
);



// ============================================================
// ENVIAR MENSAGEM
//
// POST
// /api/chat/:servicoId/mensagens
//
// BODY:
// {
//   "remetenteEmail": "...",
//   "mensagem": "..."
// }
// ============================================================

app.post(
    "/api/chat/:servicoId/mensagens",
    async (req, res) => {

        try {

            const servicoId =
                Number(
                    req.params.servicoId
                );


            const remetenteEmail =
                normalizarEmailChat(
                    req.body?.remetenteEmail ||
                    req.body?.email
                );


            const mensagem =
                String(
                    req.body?.mensagem ||
                    ""
                )
                .trim();


            if (!servicoId) {

                return res
                    .status(400)
                    .json({
                        erro:
                            "Serviço inválido."
                    });
            }


            if (!remetenteEmail) {

                return res
                    .status(400)
                    .json({
                        erro:
                            "Remetente não informado."
                    });
            }


            if (!mensagem) {

                return res
                    .status(400)
                    .json({
                        erro:
                            "Digite uma mensagem."
                    });
            }


            // Evita mensagens gigantes.
            if (
                mensagem.length >
                5000
            ) {

                return res
                    .status(400)
                    .json({
                        erro:
                            "A mensagem ultrapassa o limite permitido."
                    });
            }


            // ------------------------------------------------
            // VERIFICAR ACESSO
            // ------------------------------------------------

            const permissao =
                await usuarioPodeAcessarChat(
                    servicoId,
                    remetenteEmail
                );


            if (
                !permissao.autorizado
            ) {

                return res
                    .status(403)
                    .json({
                        erro:
                            permissao.motivo
                    });
            }


            // ------------------------------------------------
            // CONVERSA
            // ------------------------------------------------

            const conversa =
                await obterOuCriarConversa(
                    servicoId
                );


            // ------------------------------------------------
            // DESTINATÁRIO
            // ------------------------------------------------

            let destinatarioEmail;


            if (
                remetenteEmail ===
                permissao.empresaEmail
            ) {

                destinatarioEmail =
                    permissao.prestadorEmail;


            } else {

                destinatarioEmail =
                    permissao.empresaEmail;
            }


            if (!destinatarioEmail) {

                return res
                    .status(400)
                    .json({
                        erro:
                            "Não foi possível identificar o destinatário."
                    });
            }


            // ------------------------------------------------
            // SALVAR MENSAGEM
            // ------------------------------------------------

            const resultado =
                await pool.query(

                    `

                    INSERT INTO mensagens (

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

                    RETURNING

                        id,
                        conversa_id,
                        servico_id,
                        remetente_email,
                        destinatario_email,
                        mensagem,
                        tipo,
                        lida,
                        criado_em

                    `,

                    [
                        conversa.id,
                        servicoId,
                        remetenteEmail,
                        destinatarioEmail,
                        mensagem
                    ]
                );


            const novaMensagem =
                resultado.rows[0];


            // ------------------------------------------------
            // ATUALIZAR CONVERSA
            // ------------------------------------------------

            await pool.query(

                `

                UPDATE conversas

                SET atualizado_em =
                    CURRENT_TIMESTAMP

                WHERE id = $1

                `,

                [
                    conversa.id
                ]
            );


            // ------------------------------------------------
            // SOCKET.IO
            // ENVIAR PARA QUEM ESTÁ NA SALA
            // ------------------------------------------------

            io
                .to(
                    nomeSalaChat(
                        conversa.id
                    )
                )
                .emit(
                    "chat:nova-mensagem",
                    {

                        conversaId:
                            conversa.id,

                        servicoId,

                        mensagem:
                            novaMensagem
                    }
                );


            // ------------------------------------------------
            // AVISAR OUTRAS TELAS
            // ------------------------------------------------

            io.emit(
                "chat:conversas-atualizadas",
                {

                    servicoId,

                    conversaId:
                        conversa.id
                }
            );


            return res.json({

                sucesso:
                    true,

                mensagem:
                    novaMensagem
            });


        } catch (erro) {

            console.error(
                "Erro ao enviar mensagem:",
                erro
            );


            return res
                .status(500)
                .json({
                    erro:
                        erro.message ||
                        "Erro ao enviar mensagem."
                });
        }
    }
);



// ============================================================
// MARCAR MENSAGENS COMO LIDAS
//
// POST
// /api/chat/:servicoId/marcar-lidas
//
// BODY:
// {
//   "email": "usuario@email.com"
// }
// ============================================================

app.post(
    "/api/chat/:servicoId/marcar-lidas",
    async (req, res) => {

        try {

            const servicoId =
                Number(
                    req.params.servicoId
                );


            const email =
                normalizarEmailChat(
                    req.body?.email
                );


            if (
                !servicoId ||
                !email
            ) {

                return res
                    .status(400)
                    .json({
                        erro:
                            "Dados incompletos."
                    });
            }


            const permissao =
                await usuarioPodeAcessarChat(
                    servicoId,
                    email
                );


            if (
                !permissao.autorizado
            ) {

                return res
                    .status(403)
                    .json({
                        erro:
                            permissao.motivo
                    });
            }


            const conversa =
                await obterOuCriarConversa(
                    servicoId
                );


            const resultado =
                await pool.query(

                    `

                    UPDATE mensagens

                    SET lida = TRUE

                    WHERE conversa_id = $1

                      AND LOWER(
                            destinatario_email
                          ) = LOWER($2)

                      AND lida = FALSE

                    RETURNING id

                    `,

                    [
                        conversa.id,
                        email
                    ]
                );


            // Atualiza contadores de mensagens
            io.emit(
                "chat:conversas-atualizadas",
                {

                    conversaId:
                        conversa.id,

                    servicoId
                }
            );


            return res.json({

                sucesso:
                    true,

                marcadas:
                    resultado.rowCount
            });


        } catch (erro) {

            console.error(
                "Erro ao marcar mensagens como lidas:",
                erro
            );


            return res
                .status(500)
                .json({
                    erro:
                        "Erro ao atualizar mensagens."
                });
        }
    }
);



// ============================================================
// CONTADOR DE MENSAGENS NÃO LIDAS
//
// GET
// /api/chat/nao-lidas?email=usuario@email.com
// ============================================================

app.get(
    "/api/chat/nao-lidas",
    async (req, res) => {

        try {

            const email =
                normalizarEmailChat(
                    req.query.email
                );


            if (!email) {

                return res
                    .status(400)
                    .json({
                        erro:
                            "E-mail obrigatório."
                    });
            }


            const resultado =
                await pool.query(

                    `

                    SELECT COUNT(*)::INTEGER
                    AS total

                    FROM mensagens

                    WHERE LOWER(
                        destinatario_email
                    ) = LOWER($1)

                    AND lida = FALSE

                    `,

                    [
                        email
                    ]
                );


            return res.json({

                sucesso:
                    true,

                total:
                    resultado.rows[0]
                        ?.total ||
                    0
            });


        } catch (erro) {

            console.error(
                "Erro ao contar mensagens:",
                erro
            );


            return res
                .status(500)
                .json({
                    erro:
                        "Erro ao contar mensagens."
                });
        }
    }
);



// ============================================================
// SOCKET - CONFIRMAÇÃO DE LEITURA EM TEMPO REAL
// ============================================================

io.on(
    "connection",
    socket => {

        socket.on(
            "chat:marcar-lidas",
            async dados => {

                try {

                    const servicoId =
                        Number(
                            dados?.servicoId
                        );


                    const email =
                        normalizarEmailChat(
                            dados?.email
                        );


                    if (
                        !servicoId ||
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

                        UPDATE mensagens

                        SET lida = TRUE

                        WHERE conversa_id = $1

                          AND LOWER(
                                destinatario_email
                              ) = LOWER($2)

                          AND lida = FALSE

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
                            "chat:leitura-atualizada",
                            {

                                conversaId:
                                    conversa.id,

                                servicoId,

                                leitorEmail:
                                    email
                            }
                        );


                } catch (erro) {
                    // ============================================================
// RS CONNECT - SERVER.JS
// PARTE 3
// JORNADA + INTERVALO + VALIDAÇÃO + PAGAMENTO
// ============================================================


// ============================================================
// GARANTIR COLUNAS DA JORNADA
// ============================================================

async function verificarColunasJornada() {

    try {

        await pool.query(`
            ALTER TABLE servicos
            ADD COLUMN IF NOT EXISTS
                presenca_confirmada BOOLEAN DEFAULT FALSE;
        `);


        await pool.query(`
            ALTER TABLE servicos
            ADD COLUMN IF NOT EXISTS
                presenca_hora VARCHAR(20);
        `);


        await pool.query(`
            ALTER TABLE servicos
            ADD COLUMN IF NOT EXISTS
                selfie_confirmacao TEXT;
        `);


        await pool.query(`
            ALTER TABLE servicos
            ADD COLUMN IF NOT EXISTS
                presenca_latitude TEXT;
        `);


        await pool.query(`
            ALTER TABLE servicos
            ADD COLUMN IF NOT EXISTS
                presenca_longitude TEXT;
        `);


        await pool.query(`
            ALTER TABLE servicos
            ADD COLUMN IF NOT EXISTS
                presenca_precisao TEXT;
        `);


        await pool.query(`
            ALTER TABLE servicos
            ADD COLUMN IF NOT EXISTS
                checkin_hora VARCHAR(20);
        `);


        await pool.query(`
            ALTER TABLE servicos
            ADD COLUMN IF NOT EXISTS
                checkin_foto TEXT;
        `);


        await pool.query(`
            ALTER TABLE servicos
            ADD COLUMN IF NOT EXISTS
                checkin_latitude TEXT;
        `);


        await pool.query(`
            ALTER TABLE servicos
            ADD COLUMN IF NOT EXISTS
                checkin_longitude TEXT;
        `);


        await pool.query(`
            ALTER TABLE servicos
            ADD COLUMN IF NOT EXISTS
                checkout_hora VARCHAR(20);
        `);


        await pool.query(`
            ALTER TABLE servicos
            ADD COLUMN IF NOT EXISTS
                checkout_foto TEXT;
        `);


        await pool.query(`
            ALTER TABLE servicos
            ADD COLUMN IF NOT EXISTS
                checkout_latitude TEXT;
        `);


        await pool.query(`
            ALTER TABLE servicos
            ADD COLUMN IF NOT EXISTS
                checkout_longitude TEXT;
        `);


        await pool.query(`
            ALTER TABLE servicos
            ADD COLUMN IF NOT EXISTS
                intervalo_inicio VARCHAR(20);
        `);


        await pool.query(`
            ALTER TABLE servicos
            ADD COLUMN IF NOT EXISTS
                intervalo_fim VARCHAR(20);
        `);


        await pool.query(`
            ALTER TABLE servicos
            ADD COLUMN IF NOT EXISTS
                intervalo_retorno VARCHAR(20);
        `);


        await pool.query(`
            ALTER TABLE servicos
            ADD COLUMN IF NOT EXISTS
                em_intervalo BOOLEAN DEFAULT FALSE;
        `);


        await pool.query(`
            ALTER TABLE servicos
            ADD COLUMN IF NOT EXISTS
                validado_empresa BOOLEAN DEFAULT FALSE;
        `);


        await pool.query(`
            ALTER TABLE servicos
            ADD COLUMN IF NOT EXISTS
                validado_em TIMESTAMP;
        `);


        await pool.query(`
            ALTER TABLE servicos
            ADD COLUMN IF NOT EXISTS
                pagamento_autorizado BOOLEAN DEFAULT FALSE;
        `);


        await pool.query(`
            ALTER TABLE servicos
            ADD COLUMN IF NOT EXISTS
                pagamento_autorizado_em TIMESTAMP;
        `);


        console.log(
            "Colunas da jornada verificadas com sucesso."
        );


    } catch (erro) {

        console.error(
            "Erro ao verificar colunas da jornada:",
            erro
        );
    }
}


verificarColunasJornada();



// ============================================================
// FUNÇÃO DE HORA ATUAL
// ============================================================

function horaAtualRS() {

    return new Date()
        .toLocaleTimeString(
            "pt-BR",
            {
                hour:
                    "2-digit",

                minute:
                    "2-digit",

                second:
                    "2-digit",

                timeZone:
                    "America/Sao_Paulo"
            }
        );
}



// ============================================================
// BUSCAR SERVIÇO POR ID
// ============================================================

async function buscarServicoRS(
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


    return resultado.rows[0] || null;
}



// ============================================================
// VALIDAR PRESTADOR TITULAR
// ============================================================

function prestadorEhTitularRS(
    servico,
    email
) {

    return String(
        servico?.prestador_email ||
        ""
    )
    .trim()
    .toLowerCase()
    ===
    String(
        email ||
        ""
    )
    .trim()
    .toLowerCase();
}



// ============================================================
// CONFIRMAR PRESENÇA
// POST /api/servicos/:id/confirmar-presenca
// ============================================================

app.post(
    "/api/servicos/:id/confirmar-presenca",
    async (req, res) => {

        try {

            const servicoId =
                Number(
                    req.params.id
                );


            const prestadorEmail =
                normalizarEmailChat(
                    req.body?.prestadorEmail
                );


            const foto =
                req.body?.foto ||
                req.body?.selfie ||
                "";


            const latitude =
                req.body?.latitude ??
                "";


            const longitude =
                req.body?.longitude ??
                "";


            const precisao =
                req.body?.precisao ??
                req.body?.precisaoGps ??
                "";


            const servico =
                await buscarServicoRS(
                    servicoId
                );


            if (!servico) {

                return res
                    .status(404)
                    .json({
                        erro:
                            "Serviço não encontrado."
                    });
            }


            if (
                !prestadorEhTitularRS(
                    servico,
                    prestadorEmail
                )
            ) {

                return res
                    .status(403)
                    .json({
                        erro:
                            "Somente o Titular pode confirmar presença."
                    });
            }


            if (!foto) {

                return res
                    .status(400)
                    .json({
                        erro:
                            "A foto tirada na hora é obrigatória."
                    });
            }


            if (
                latitude === "" ||
                longitude === ""
            ) {

                return res
                    .status(400)
                    .json({
                        erro:
                            "A localização GPS é obrigatória."
                    });
            }


            const hora =
                horaAtualRS();


            await pool.query(
                `
                UPDATE servicos

                SET
                    presenca_confirmada = TRUE,
                    presenca_hora = $1,
                    selfie_confirmacao = $2,
                    presenca_latitude = $3,
                    presenca_longitude = $4,
                    presenca_precisao = $5

                WHERE id = $6
                `,
                [
                    hora,
                    foto,
                    String(latitude),
                    String(longitude),
                    String(precisao),
                    servicoId
                ]
            );


            io.emit(
                "atualizar_servicos",
                {
                    servicoId
                }
            );


            return res.json({
                sucesso:
                    true,

                mensagem:
                    "Presença confirmada com sucesso.",

                hora
            });


        } catch (erro) {

            console.error(
                "Erro ao confirmar presença:",
                erro
            );


            return res
                .status(500)
                .json({
                    erro:
                        "Erro ao confirmar presença."
                });
        }
    }
);



// ============================================================
// CHECK-IN
// POST /api/servicos/:id/checkin
// ============================================================

app.post(
    "/api/servicos/:id/checkin",
    async (req, res) => {

        try {

            const servicoId =
                Number(
                    req.params.id
                );


            const prestadorEmail =
                normalizarEmailChat(
                    req.body?.prestadorEmail
                );


            const foto =
                req.body?.foto ||
                "";


            const latitude =
                req.body?.latitude ??
                "";


            const longitude =
                req.body?.longitude ??
                "";


            const servico =
                await buscarServicoRS(
                    servicoId
                );


            if (!servico) {

                return res
                    .status(404)
                    .json({
                        erro:
                            "Serviço não encontrado."
                    });
            }


            if (
                !prestadorEhTitularRS(
                    servico,
                    prestadorEmail
                )
            ) {

                return res
                    .status(403)
                    .json({
                        erro:
                            "Somente o Titular pode registrar entrada."
                    });
            }


            if (
                !servico.presenca_confirmada
            ) {

                return res
                    .status(400)
                    .json({
                        erro:
                            "Confirme sua presença antes do check-in."
                    });
            }


            if (
                servico.checkin_hora
            ) {

                return res
                    .status(400)
                    .json({
                        erro:
                            "O check-in já foi realizado."
                    });
            }


            if (!foto) {

                return res
                    .status(400)
                    .json({
                        erro:
                            "A foto tirada na hora é obrigatória."
                    });
            }


            if (
                latitude === "" ||
                longitude === ""
            ) {

                return res
                    .status(400)
                    .json({
                        erro:
                            "A localização GPS é obrigatória."
                    });
            }


            const hora =
                horaAtualRS();


            await pool.query(
                `
                UPDATE servicos

                SET
                    checkin_hora = $1,
                    checkin_foto = $2,
                    checkin_latitude = $3,
                    checkin_longitude = $4,
                    status = 'EM_SERVICO'

                WHERE id = $5
                `,
                [
                    hora,
                    foto,
                    String(latitude),
                    String(longitude),
                    servicoId
                ]
            );


            io.emit(
                "atualizar_servicos",
                {
                    servicoId
                }
            );


            return res.json({
                sucesso:
                    true,

                mensagem:
                    "Entrada registrada com sucesso.",

                hora
            });


        } catch (erro) {

            console.error(
                "Erro no check-in:",
                erro
            );


            return res
                .status(500)
                .json({
                    erro:
                        "Erro ao registrar entrada."
                });
        }
    }
);



// ============================================================
// INICIAR INTERVALO
// POST /api/servicos/:id/intervalo/iniciar
// ============================================================

app.post(
    "/api/servicos/:id/intervalo/iniciar",
    async (req, res) => {

        try {

            const servicoId =
                Number(
                    req.params.id
                );


            const prestadorEmail =
                normalizarEmailChat(
                    req.body?.prestadorEmail
                );


            const servico =
                await buscarServicoRS(
                    servicoId
                );


            if (!servico) {

                return res
                    .status(404)
                    .json({
                        erro:
                            "Serviço não encontrado."
                    });
            }


            if (
                !prestadorEhTitularRS(
                    servico,
                    prestadorEmail
                )
            ) {

                return res
                    .status(403)
                    .json({
                        erro:
                            "Somente o Titular pode iniciar o intervalo."
                    });
            }


            if (
                !servico.checkin_hora
            ) {

                return res
                    .status(400)
                    .json({
                        erro:
                            "Faça o check-in antes do intervalo."
                    });
            }


            if (
                servico.checkout_hora
            ) {

                return res
                    .status(400)
                    .json({
                        erro:
                            "O serviço já foi finalizado."
                    });
            }


            if (
                servico.em_intervalo
            ) {

                return res
                    .status(400)
                    .json({
                        erro:
                            "Você já está em intervalo."
                    });
            }


            const hora =
                horaAtualRS();


            await pool.query(
                `
                UPDATE servicos

                SET
                    intervalo_inicio = $1,
                    intervalo_fim = NULL,
                    intervalo_retorno = NULL,
                    em_intervalo = TRUE

                WHERE id = $2
                `,
                [
                    hora,
                    servicoId
                ]
            );


            io.emit(
                "atualizar_servicos",
                {
                    servicoId
                }
            );


            return res.json({
                sucesso:
                    true,

                mensagem:
                    "Intervalo iniciado.",

                hora
            });


        } catch (erro) {

            console.error(
                "Erro ao iniciar intervalo:",
                erro
            );


            return res
                .status(500)
                .json({
                    erro:
                        "Erro ao iniciar intervalo."
                });
        }
    }
);



// ============================================================
// VOLTAR DO INTERVALO
// POST /api/servicos/:id/intervalo/retornar
// ============================================================

app.post(
    "/api/servicos/:id/intervalo/retornar",
    async (req, res) => {

        try {

            const servicoId =
                Number(
                    req.params.id
                );


            const prestadorEmail =
                normalizarEmailChat(
                    req.body?.prestadorEmail
                );


            const servico =
                await buscarServicoRS(
                    servicoId
                );


            if (!servico) {

                return res
                    .status(404)
                    .json({
                        erro:
                            "Serviço não encontrado."
                    });
            }


            if (
                !prestadorEhTitularRS(
                    servico,
                    prestadorEmail
                )
            ) {

                return res
                    .status(403)
                    .json({
                        erro:
                            "Somente o Titular pode retornar do intervalo."
                    });
            }


            if (
                !servico.intervalo_inicio
            ) {

                return res
                    .status(400)
                    .json({
                        erro:
                            "Nenhum intervalo foi iniciado."
                    });
            }


            if (
                !servico.em_intervalo
            ) {

                return res
                    .status(400)
                    .json({
                        erro:
                            "Você não está em intervalo."
                    });
            }


            const hora =
                horaAtualRS();


            await pool.query(
                `
                UPDATE servicos

                SET
                    intervalo_fim = $1,
                    intervalo_retorno = $1,
                    em_intervalo = FALSE

                WHERE id = $2
                `,
                [
                    hora,
                    servicoId
                ]
            );


            io.emit(
                "atualizar_servicos",
                {
                    servicoId
                }
            );


            return res.json({
                sucesso:
                    true,

                mensagem:
                    "Retorno do intervalo registrado.",

                hora
            });


        } catch (erro) {

            console.error(
                "Erro ao retornar do intervalo:",
                erro
            );


            return res
                .status(500)
                .json({
                    erro:
                        "Erro ao retornar do intervalo."
                });
        }
    }
);



// ============================================================
// CHECK-OUT
// POST /api/servicos/:id/checkout
// ============================================================

app.post(
    "/api/servicos/:id/checkout",
    async (req, res) => {

        try {

            const servicoId =
                Number(
                    req.params.id
                );


            const prestadorEmail =
                normalizarEmailChat(
                    req.body?.prestadorEmail
                );


            const foto =
                req.body?.foto ||
                "";


            const latitude =
                req.body?.latitude ??
                "";


            const longitude =
                req.body?.longitude ??
                "";


            const servico =
                await buscarServicoRS(
                    servicoId
                );


            if (!servico) {

                return res
                    .status(404)
                    .json({
                        erro:
                            "Serviço não encontrado."
                    });
            }


            if (
                !prestadorEhTitularRS(
                    servico,
                    prestadorEmail
                )
            ) {

                return res
                    .status(403)
                    .json({
                        erro:
                            "Somente o Titular pode registrar saída."
                    });
            }


            if (
                !servico.checkin_hora
            ) {

                return res
                    .status(400)
                    .json({
                        erro:
                            "Faça o check-in antes de registrar saída."
                    });
            }


            if (
                servico.em_intervalo
            ) {

                return res
                    .status(400)
                    .json({
                        erro:
                            "Volte do intervalo antes de registrar a saída."
                    });
            }


            if (
                servico.checkout_hora
            ) {

                return res
                    .status(400)
                    .json({
                        erro:
                            "A saída já foi registrada."
                    });
            }


            if (!foto) {

                return res
                    .status(400)
                    .json({
                        erro:
                            "A foto tirada na hora é obrigatória."
                    });
            }


            if (
                latitude === "" ||
                longitude === ""
            ) {

                return res
                    .status(400)
                    .json({
                        erro:
                            "A localização GPS é obrigatória."
                    });
            }


            const hora =
                horaAtualRS();


            await pool.query(
                `
                UPDATE servicos

                SET
                    checkout_hora = $1,
                    checkout_foto = $2,
                    checkout_latitude = $3,
                    checkout_longitude = $4,
                    status = 'AGUARDANDO_VALIDACAO'

                WHERE id = $5
                `,
                [
                    hora,
                    foto,
                    String(latitude),
                    String(longitude),
                    servicoId
                ]
            );


            io.emit(
                "atualizar_servicos",
                {
                    servicoId
                }
            );


            return res.json({
                sucesso:
                    true,

                mensagem:
                    "Saída registrada com sucesso.",

                hora
            });


        } catch (erro) {

            console.error(
                "Erro no check-out:",
                erro
            );


            return res
                .status(500)
                .json({
                    erro:
                        "Erro ao registrar saída."
                });
        }
    }
);



// ============================================================
// VALIDAR SERVIÇO PELA EMPRESA
// POST /api/servicos/:id/validar
// ============================================================

app.post(
    "/api/servicos/:id/validar",
    async (req, res) => {

        try {

            const servicoId =
                Number(
                    req.params.id
                );


            const empresaEmail =
                normalizarEmailChat(
                    req.body?.empresaEmail
                );


            const servico =
                await buscarServicoRS(
                    servicoId
                );


            if (!servico) {

                return res
                    .status(404)
                    .json({
                        erro:
                            "Serviço não encontrado."
                    });
            }


            if (
                normalizarEmailChat(
                    servico.empresa_email
                )
                !==
                empresaEmail
            ) {

                return res
                    .status(403)
                    .json({
                        erro:
                            "Somente a empresa responsável pode validar."
                    });
            }


            if (
                !servico.checkout_hora
            ) {

                return res
                    .status(400)
                    .json({
                        erro:
                            "O trabalhador ainda não realizou o check-out."
                    });
            }


            await pool.query(
                `
                UPDATE servicos

                SET
                    validado_empresa = TRUE,
                    validado_em = CURRENT_TIMESTAMP,
                    status = 'VALIDADO'

                WHERE id = $1
                `,
                [
                    servicoId
                ]
            );


            io.emit(
                "atualizar_servicos",
                {
                    servicoId
                }
            );


            return res.json({
                sucesso:
                    true,

                mensagem:
                    "Serviço validado com sucesso."
            });


        } catch (erro) {

            console.error(
                "Erro ao validar serviço:",
                erro
            );


            return res
                .status(500)
                .json({
                    erro:
                        "Erro ao validar serviço."
                });
        }
    }
);



// ============================================================
// CRIAR TABELA DE PAGAMENTOS
// ============================================================

async function verificarTabelaPagamentos() {

    try {

        await pool.query(`
            CREATE TABLE IF NOT EXISTS pagamentos (

                id SERIAL PRIMARY KEY,

                servico_id INTEGER NOT NULL,

                empresa_email VARCHAR(255),

                prestador_email VARCHAR(255),

                valor NUMERIC(12,2) DEFAULT 0,

                forma_pagamento VARCHAR(100),

                status VARCHAR(50) DEFAULT 'PENDENTE',

                comprovante TEXT,

                autorizado_em TIMESTAMP,

                pago_em TIMESTAMP,

                criado_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP

            );
        `);


        await pool.query(`
            CREATE UNIQUE INDEX IF NOT EXISTS
                idx_pagamento_servico_prestador

            ON pagamentos(
                servico_id,
                prestador_email
            );
        `);


        console.log(
            "Tabela de pagamentos verificada."
        );


    } catch (erro) {

        console.error(
            "Erro ao verificar pagamentos:",
            erro
        );
    }
}


verificarTabelaPagamentos();



// ============================================================
// AUTORIZAR PAGAMENTO
// POST /api/servicos/:id/autorizar-pagamento
// ============================================================

app.post(
    "/api/servicos/:id/autorizar-pagamento",
    async (req, res) => {

        try {

            const servicoId =
                Number(
                    req.params.id
                );


            const empresaEmail =
                normalizarEmailChat(
                    req.body?.empresaEmail
                );


            const servico =
                await buscarServicoRS(
                    servicoId
                );


            if (!servico) {

                return res
                    .status(404)
                    .json({
                        erro:
                            "Serviço não encontrado."
                    });
            }


            if (
                normalizarEmailChat(
                    servico.empresa_email
                )
                !==
                empresaEmail
            ) {

                return res
                    .status(403)
                    .json({
                        erro:
                            "Empresa sem permissão."
                    });
            }


            if (
                !servico.validado_empresa
            ) {

                return res
                    .status(400)
                    .json({
                        erro:
                            "Valide o serviço antes de autorizar o pagamento."
                    });
            }


            if (
                !servico.prestador_email
            ) {

                return res
                    .status(400)
                    .json({
                        erro:
                            "Serviço sem trabalhador Titular."
                    });
            }


            const valor =
                Number(
                    servico.valor_liquido ||
                    servico.valor_total ||
                    servico.valor ||
                    0
                );


            const formaPagamento =
                servico.forma_pagamento ||
                servico.forma_pgto ||
                servico.pagamento ||
                "Pix";


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

                ON CONFLICT (
                    servico_id,
                    prestador_email
                )

                DO UPDATE SET

                    empresa_email =
                        EXCLUDED.empresa_email,

                    valor =
                        EXCLUDED.valor,

                    forma_pagamento =
                        EXCLUDED.forma_pagamento,

                    status =
                        'AUTORIZADO',

                    autorizado_em =
                        CURRENT_TIMESTAMP
                `,
                [
                    servicoId,
                    servico.empresa_email,
                    servico.prestador_email,
                    valor,
                    formaPagamento
                ]
            );


            await pool.query(
                `
                UPDATE servicos

                SET
                    pagamento_autorizado = TRUE,
                    pagamento_autorizado_em =
                        CURRENT_TIMESTAMP,
                    status =
                        'PAGAMENTO_AUTORIZADO'

                WHERE id = $1
                `,
                [
                    servicoId
                ]
            );


            io.emit(
                "atualizar_servicos",
                {
                    servicoId
                }
            );


            return res.json({
                sucesso:
                    true,

                mensagem:
                    "Pagamento autorizado com sucesso."
            });


        } catch (erro) {

            console.error(
                "Erro ao autorizar pagamento:",
                erro
            );


            return res
                .status(500)
                .json({
                    erro:
                        "Erro ao autorizar pagamento."
                });
        }
    }
);



// ============================================================
// HISTÓRICO DE PAGAMENTOS DO PRESTADOR
// GET /api/prestador/:email/historico-pagamentos
// ============================================================

app.get(
    "/api/prestador/:email/historico-pagamentos",
    async (req, res) => {

        try {

            const email =
                normalizarEmailChat(
                    req.params.email
                );


            const resultado =
                await pool.query(
                    `
                    SELECT *

                    FROM pagamentos

                    WHERE LOWER(
                        prestador_email
                    ) = LOWER($1)

                    ORDER BY
                        criado_em DESC,
                        id DESC
                    `,
                    [
                        email
                    ]
                );


            return res.json({
                sucesso:
                    true,

                pagamentos:
                    resultado.rows
            });


        } catch (erro) {

            console.error(
                "Erro no histórico de pagamentos:",
                erro
            );


            return res
                .status(500)
                .json({
                    erro:
                        "Erro ao carregar pagamentos."
                });
        }
    }
);



// ============================================================
// ATUALIZAR PAINEL EM TEMPO REAL
// ============================================================

function emitirAtualizacaoRS(
    servicoId = null
) {

    io.emit(
        "atualizar_servicos",
        {
            servicoId,
            atualizadoEm:
                new Date().toISOString()
        }
    );


    io.emit(
        "servicosAtualizados",
        {
            servicoId
        }
    );
}


// ============================================================
// FIM DA PARTE 3
// ============================================================
                    // ============================================================
// RS CONNECT - SERVER.JS
// PARTE 4
// ARQUIVO DIGITAL + COMPROVANTE + PAINEL + HISTÓRICO
// ============================================================


// ============================================================
// COLUNAS EXTRAS PARA DOCUMENTOS / PAGAMENTO
// ============================================================

async function verificarColunasParte4RS() {

    try {

        await pool.query(`
            ALTER TABLE servicos
            ADD COLUMN IF NOT EXISTS
                contrato_assinado TEXT;
        `);

        await pool.query(`
            ALTER TABLE servicos
            ADD COLUMN IF NOT EXISTS
                contrato_assinado_em TIMESTAMP;
        `);

        await pool.query(`
            ALTER TABLE servicos
            ADD COLUMN IF NOT EXISTS
                comprovante_pagamento TEXT;
        `);

        await pool.query(`
            ALTER TABLE servicos
            ADD COLUMN IF NOT EXISTS
                pagamento_realizado BOOLEAN DEFAULT FALSE;
        `);

        await pool.query(`
            ALTER TABLE servicos
            ADD COLUMN IF NOT EXISTS
                pagamento_realizado_em TIMESTAMP;
        `);

        console.log(
            "✅ Colunas da Parte 4 verificadas."
        );

    } catch (erro) {

        console.error(
            "❌ Erro ao verificar colunas da Parte 4:",
            erro
        );
    }
}

verificarColunasParte4RS();


// ============================================================
// TABELA DE DOCUMENTOS
// ============================================================

async function verificarTabelaDocumentosRS() {

    try {

        await pool.query(`

            CREATE TABLE IF NOT EXISTS documentos_rs (

                id SERIAL PRIMARY KEY,

                servico_id INTEGER,

                empresa_email VARCHAR(255),

                prestador_email VARCHAR(255),

                categoria VARCHAR(80),

                nome VARCHAR(255),

                arquivo TEXT,

                criado_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP

            );

        `);


        await pool.query(`

            CREATE INDEX IF NOT EXISTS
                idx_documentos_empresa_rs

            ON documentos_rs(
                empresa_email
            );

        `);


        await pool.query(`

            CREATE INDEX IF NOT EXISTS
                idx_documentos_servico_rs

            ON documentos_rs(
                servico_id
            );

        `);


        console.log(
            "✅ Arquivo Digital RS verificado."
        );

    } catch (erro) {

        console.error(
            "❌ Erro no Arquivo Digital:",
            erro
        );
    }
}

verificarTabelaDocumentosRS();


// ============================================================
// SALVAR CONTRATO ASSINADO
//
// POST
// /api/servicos/:id/contrato-assinado
//
// BODY:
// {
//    prestadorEmail,
//    arquivo,
//    nomeArquivo
// }
// ============================================================

app.post(
    "/api/servicos/:id/contrato-assinado",
    async (req, res) => {

        try {

            const servicoId =
                Number(req.params.id);

            const prestadorEmail =
                normalizarEmailChat(
                    req.body?.prestadorEmail
                );

            const arquivo =
                String(
                    req.body?.arquivo || ""
                );

            const nomeArquivo =
                String(
                    req.body?.nomeArquivo ||
                    "contrato-assinado.pdf"
                );


            if (!servicoId) {

                return res.status(400).json({
                    erro:
                        "Serviço inválido."
                });
            }


            if (!prestadorEmail) {

                return res.status(400).json({
                    erro:
                        "Prestador não informado."
                });
            }


            if (!arquivo) {

                return res.status(400).json({
                    erro:
                        "Selecione o contrato assinado."
                });
            }


            /*
             * Se estiver usando Data URL no INDEX,
             * garante que seja PDF.
             */

            if (
                arquivo.startsWith("data:") &&
                !arquivo.startsWith(
                    "data:application/pdf"
                )
            ) {

                return res.status(400).json({
                    erro:
                        "O contrato deve ser um arquivo PDF."
                });
            }


            /*
             * Proteção simples contra arquivos
             * exageradamente grandes em Base64.
             *
             * Aproximadamente 10 MB.
             */

            if (
                arquivo.length >
                14 * 1024 * 1024
            ) {

                return res.status(413).json({
                    erro:
                        "O contrato ultrapassa o limite permitido."
                });
            }


            const servico =
                await buscarServicoRS(
                    servicoId
                );


            if (!servico) {

                return res.status(404).json({
                    erro:
                        "Serviço não encontrado."
                });
            }


            if (
                !prestadorEhTitularRS(
                    servico,
                    prestadorEmail
                )
            ) {

                return res.status(403).json({
                    erro:
                        "Somente o prestador Titular pode enviar este contrato."
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
                    $1,
                    $2,
                    $3,
                    'CONTRATO',
                    $4,
                    $5
                )

                `,
                [
                    servicoId,
                    servico.empresa_email,
                    prestadorEmail,
                    nomeArquivo,
                    arquivo
                ]
            );


            emitirAtualizacaoRS(
                servicoId
            );


            return res.json({

                sucesso:
                    true,

                mensagem:
                    "Contrato assinado enviado com sucesso."
            });


        } catch (erro) {

            console.error(
                "Erro ao enviar contrato:",
                erro
            );


            return res.status(500).json({
                erro:
                    "Erro ao salvar contrato."
            });
        }
    }
);


// ============================================================
// ENVIAR COMPROVANTE DE PAGAMENTO
//
// POST
// /api/servicos/:id/comprovante-pagamento
//
// BODY:
// {
//    empresaEmail,
//    arquivo,
//    nomeArquivo
// }
// ============================================================

app.post(
    "/api/servicos/:id/comprovante-pagamento",
    async (req, res) => {

        try {

            const servicoId =
                Number(req.params.id);


            const empresaEmail =
                normalizarEmailChat(
                    req.body?.empresaEmail
                );


            const arquivo =
                String(
                    req.body?.arquivo || ""
                );


            const nomeArquivo =
                String(
                    req.body?.nomeArquivo ||
                    "comprovante"
                );


            if (
                !servicoId ||
                !empresaEmail ||
                !arquivo
            ) {

                return res.status(400).json({
                    erro:
                        "Dados do comprovante incompletos."
                });
            }


            /*
             * Limite aproximado de 10 MB.
             */

            if (
                arquivo.length >
                14 * 1024 * 1024
            ) {

                return res.status(413).json({
                    erro:
                        "O comprovante ultrapassa o limite permitido."
                });
            }


            const servico =
                await buscarServicoRS(
                    servicoId
                );


            if (!servico) {

                return res.status(404).json({
                    erro:
                        "Serviço não encontrado."
                });
            }


            if (
                normalizarEmailChat(
                    servico.empresa_email
                )
                !==
                empresaEmail
            ) {

                return res.status(403).json({
                    erro:
                        "Somente a empresa responsável pode enviar o comprovante."
                });
            }


            if (
                !servico.pagamento_autorizado
            ) {

                return res.status(400).json({
                    erro:
                        "O pagamento ainda não foi autorizado."
                });
            }


            await pool.query(
                `

                UPDATE servicos

                SET
                    comprovante_pagamento = $1,
                    pagamento_realizado = TRUE,
                    pagamento_realizado_em =
                        CURRENT_TIMESTAMP,
                    status = 'PAGO'

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
                    pago_em =
                        CURRENT_TIMESTAMP

                WHERE
                    servico_id = $2

                    AND LOWER(
                        prestador_email
                    ) = LOWER($3)

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


            emitirAtualizacaoRS(
                servicoId
            );


            io.emit(
                "pagamento_atualizado",
                {
                    servicoId
                }
            );


            return res.json({

                sucesso:
                    true,

                mensagem:
                    "Pagamento registrado e comprovante arquivado."
            });


        } catch (erro) {

            console.error(
                "Erro no comprovante:",
                erro
            );


            return res.status(500).json({
                erro:
                    "Erro ao registrar comprovante."
            });
        }
    }
);


// ============================================================
// PAINEL COMPLETO DA EMPRESA
//
// GET /api/empresa/:email/painel
// ============================================================

app.get(
    "/api/empresa/:email/painel",
    async (req, res) => {

        try {

            const empresaEmail =
                normalizarEmailChat(
                    req.params.email
                );


            if (!empresaEmail) {

                return res.status(400).json({
                    erro:
                        "Empresa não informada."
                });
            }


            const resultado =
                await pool.query(
                    `

                    SELECT *

                    FROM servicos

                    WHERE LOWER(
                        empresa_email
                    ) = LOWER($1)

                    ORDER BY
                        id DESC

                    `,
                    [
                        empresaEmail
                    ]
                );


            const servicos =
                resultado.rows;


            const trabalhadoresMap =
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
                    normalizarEmailChat(
                        servico.prestador_email
                    );


                if (
                    !trabalhadoresMap.has(
                        chave
                    )
                ) {

                    trabalhadoresMap.set(
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

                            faltas:
                                0,

                            valorTotal:
                                0
                        }
                    );
                }


                const trabalhador =
                    trabalhadoresMap.get(
                        chave
                    );


                trabalhador.servicos++;


                if (
                    servico.checkout_hora
                ) {

                    trabalhador.concluidos++;
                }


                if (
                    String(
                        servico.status || ""
                    )
                    .toUpperCase()
                    ===
                    "FALTOU"
                ) {

                    trabalhador.faltas++;
                }


                trabalhador.valorTotal +=
                    Number(
                        servico.valor_liquido ||
                        servico.valor_total ||
                        servico.valor ||
                        0
                    );
            }


            const pagamentos =
                await pool.query(
                    `

                    SELECT *

                    FROM pagamentos

                    WHERE LOWER(
                        empresa_email
                    ) = LOWER($1)

                    ORDER BY
                        criado_em DESC

                    `,
                    [
                        empresaEmail
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

                    WHERE LOWER(
                        empresa_email
                    ) = LOWER($1)

                    ORDER BY
                        criado_em DESC

                    `,
                    [
                        empresaEmail
                    ]
                );


            return res.json({

                sucesso:
                    true,

                empresaEmail,

                resumo: {

                    totalServicos:
                        servicos.length,

                    trabalhadores:
                        trabalhadoresMap.size,

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
                        trabalhadoresMap.values()
                    ),

                servicos,

                pagamentos:
                    pagamentos.rows,

                documentos:
                    documentos.rows
            });


        } catch (erro) {

            console.error(
                "Erro no painel da empresa:",
                erro
            );


            return res.status(500).json({
                erro:
                    "Erro ao carregar painel da empresa."
            });
        }
    }
);


// ============================================================
// ARQUIVO DIGITAL DA EMPRESA
//
// GET /api/empresa/:email/arquivo
// ============================================================

app.get(
    "/api/empresa/:email/arquivo",
    async (req, res) => {

        try {

            const empresaEmail =
                normalizarEmailChat(
                    req.params.email
                );


            const servicos =
                await pool.query(
                    `

                    SELECT *

                    FROM servicos

                    WHERE LOWER(
                        empresa_email
                    ) = LOWER($1)

                    ORDER BY
                        id DESC

                    `,
                    [
                        empresaEmail
                    ]
                );


            const documentos =
                await pool.query(
                    `

                    SELECT *

                    FROM documentos_rs

                    WHERE LOWER(
                        empresa_email
                    ) = LOWER($1)

                    ORDER BY
                        criado_em DESC

                    `,
                    [
                        empresaEmail
                    ]
                );


            const pagamentos =
                await pool.query(
                    `

                    SELECT *

                    FROM pagamentos

                    WHERE LOWER(
                        empresa_email
                    ) = LOWER($1)

                    ORDER BY
                        criado_em DESC

                    `,
                    [
                        empresaEmail
                    ]
                );


            const listaServicos =
                servicos.rows;


            return res.json({

                sucesso:
                    true,

                pastas: {

                    trabalhadores:
                        listaServicos.filter(
                            s =>
                                Boolean(
                                    s.prestador_email
                                )
                        ),

                    contratos:
                        documentos.rows.filter(
                            d =>
                                d.categoria ===
                                "CONTRATO"
                        ),

                    servicosRealizados:
                        listaServicos.filter(
                            s =>
                                Boolean(
                                    s.checkout_hora
                                )
                        ),

                    escalas:
                        listaServicos,

                    pagamentos:
                        pagamentos.rows,

                    comprovantes:
                        documentos.rows.filter(
                            d =>
                                d.categoria ===
                                "COMPROVANTE"
                        ),

                    historico:
                        listaServicos,

                    documentos:
                        documentos.rows
                }
            });


        } catch (erro) {

            console.error(
                "Erro no arquivo digital:",
                erro
            );


            return res.status(500).json({
                erro:
                    "Erro ao carregar Arquivo Digital."
            });
        }
    }
);


// ============================================================
// HISTÓRICO DE UM TRABALHADOR NA EMPRESA
//
// GET
// /api/empresa/:empresaEmail/trabalhador/:prestadorEmail
// ============================================================

app.get(
    "/api/empresa/:empresaEmail/trabalhador/:prestadorEmail",
    async (req, res) => {

        try {

            const empresaEmail =
                normalizarEmailChat(
                    req.params.empresaEmail
                );


            const prestadorEmail =
                normalizarEmailChat(
                    req.params.prestadorEmail
                );


            const servicos =
                await pool.query(
                    `

                    SELECT *

                    FROM servicos

                    WHERE
                        LOWER(
                            empresa_email
                        ) = LOWER($1)

                    AND
                        LOWER(
                            prestador_email
                        ) = LOWER($2)

                    ORDER BY
                        id DESC

                    `,
                    [
                        empresaEmail,
                        prestadorEmail
                    ]
                );


            const pagamentos =
                await pool.query(
                    `

                    SELECT *

                    FROM pagamentos

                    WHERE
                        LOWER(
                            empresa_email
                        ) = LOWER($1)

                    AND
                        LOWER(
                            prestador_email
                        ) = LOWER($2)

                    ORDER BY
                        criado_em DESC

                    `,
                    [
                        empresaEmail,
                        prestadorEmail
                    ]
                );


            const documentos =
                await pool.query(
                    `

                    SELECT
                        id,
                        servico_id,
                        categoria,
                        nome,
                        criado_em

                    FROM documentos_rs

                    WHERE
                        LOWER(
                            empresa_email
                        ) = LOWER($1)

                    AND
                        LOWER(
                            prestador_email
                        ) = LOWER($2)

                    ORDER BY
                        criado_em DESC

                    `,
                    [
                        empresaEmail,
                        prestadorEmail
                    ]
                );


            return res.json({

                sucesso:
                    true,

                trabalhador: {

                    email:
                        prestadorEmail,

                    nome:
                        servicos.rows[0]
                            ?.prestador_nome ||
                        prestadorEmail

                },

                totalServicos:
                    servicos.rows.length,

                servicos:
                    servicos.rows,

                pagamentos:
                    pagamentos.rows,

                documentos:
                    documentos.rows
            });


        } catch (erro) {

            console.error(
                "Erro no histórico do trabalhador:",
                erro
            );


            return res.status(500).json({
                erro:
                    "Erro ao carregar histórico do trabalhador."
            });
        }
    }
);


// ============================================================
// DOCUMENTOS DE UM SERVIÇO
//
// GET /api/servicos/:id/documentos
// ============================================================

app.get(
    "/api/servicos/:id/documentos",
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

                    WHERE servico_id = $1

                    ORDER BY
                        criado_em DESC

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


        } catch (erro) {

            console.error(
                "Erro ao buscar documentos:",
                erro
            );


            return res.status(500).json({
                erro:
                    "Erro ao carregar documentos."
            });
        }
    }
);


// ============================================================
// STATUS GERAL DO BACKEND
//
// GET /api/status
// ============================================================

app.get(
    "/api/status",
    async (req, res) => {

        try {

            await pool.query(
                "SELECT NOW()"
            );


            return res.json({

                online:
                    true,

                sistema:
                    "RS CONNECT",

                banco:
                    "PostgreSQL conectado",

                socket:
                    "ativo",

                data:
                    new Date()
                        .toISOString()
            });


        } catch (erro) {

            return res.status(500).json({

                online:
                    false,

                sistema:
                    "RS CONNECT",

                banco:
                    "erro",

                erro:
                    erro.message
            });
        }
    }
);


// ============================================================
// SOCKET.IO - SINCRONIZAÇÃO GERAL
// ============================================================

io.on(
    "connection",
    socket => {

        console.log(
            "🔵 RS Connect conectado:",
            socket.id
        );


        /*
         * Quando uma tela pede atualização,
         * avisa as outras.
         */

        socket.on(
            "rs:solicitar-atualizacao",
            dados => {

                socket.broadcast.emit(
                    "atualizar_servicos",
                    {
                        servicoId:
                            dados?.servicoId ||
                            null,

                        atualizadoEm:
                            new Date()
                                .toISOString()
                    }
                );
            }
        );


        /*
         * Jornada atualizada.
         */

        socket.on(
            "jornada:atualizada",
            dados => {

                io.emit(
                    "atualizar_servicos",
                    {
                        servicoId:
                            dados?.servicoId ||
                            null
                    }
                );
            }
        );


        /*
         * Pagamento atualizado.
         */

        socket.on(
            "pagamento:atualizado",
            dados => {

                io.emit(
                    "pagamento_atualizado",
                    {
                        servicoId:
                            dados?.servicoId ||
                            null
                    }
                );
            }
        );
    }
);


// ============================================================
// TRATAMENTO DE ERRO DA API
// DEIXE DEPOIS DAS ROTAS
// ============================================================

app.use(
    (
        erro,
        req,
        res,
        next
    ) => {

        console.error(
            "❌ ERRO RS CONNECT:",
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
                    "Erro interno do RS Connect."
            });
    }
);


// ============================================================
// INICIAR SERVIDOR
// ============================================================
//
// ATENÇÃO:
//
// SE JÁ EXISTE server.listen(...) NO SEU ARQUIVO,
// NÃO COLE OUTRO.
//
// O SERVER DEVE SER O MESMO PASSADO AO SOCKET.IO.
//
// Exemplo da estrutura correta:
//
// const server = http.createServer(app);
// const io = new Server(server, {...});
//
// ============================================================

const PORT =
    process.env.PORT ||
    3000;


/*
 * USE ESTE BLOCO SOMENTE SE NÃO EXISTIR
 * OUTRO server.listen() NO SERVER.JS.
 */

if (
    require.main === module
) {

    server.listen(
        PORT,
        "0.0.0.0",
        () => {

            console.log(
                "======================================"
            );

            console.log(
                "🚀 RS CONNECT ONLINE"
            );

            console.log(
                `🌐 Porta: ${PORT}`
            );

            console.log(
                "💾 PostgreSQL"
            );

            console.log(
                "⚡ Socket.IO ativo"
            );

            console.log(
                "💬 Chat ativo"
            );

            console.log(
                "📁 Arquivo Digital ativo"
            );

            console.log(
                "======================================"
            );
        }
    );
}


// ============================================================
// FIM DA PARTE 4
// ============================================================

                    console.error(
                        "Erro Socket ao marcar leitura:",
                        erro
                    );
                }
            }
        );
    }
);


// ============================================================
// FIM DA PARTE 2 DO CHAT
// ============================================================
