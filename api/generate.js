export default async function handler(req, res) {
    if (req.method !== 'POST') return res.status(405).json({ error: 'Método não permitido' });

    try {
        const { prompt: q } = req.body;
        if (!q) return res.status(400).json({ error: "O prompt é obrigatório" });

        // 1. Tradução (Google Translate)
        const translateUrl = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=pt&tl=en&dt=t&q=${encodeURIComponent(q)}`;
        const transRes = await fetch(translateUrl);
        const transJson = await transRes.json();
        const translatedPrompt = transJson[0][0][0];

        // 2. Configurações
        const ACCOUNT_ID = "648085ab1193eeacc92d058d278a0d83";
        const API_TOKEN = "EZnH74dXipNmuwQOtCAcW1oLQzJ5oKbTnpgBqJUI";
        const model = "@cf/black-forest-labs/flux-2-klein-9b";

        const finalPrompt = `Hyper-realistic RAW photo, ${translatedPrompt}, detailed skin pores, cinematic lighting, 8k, masterpiece, shot on 35mm lens.`;

        // 3. Payload como JSON (mais confiável que FormData no ambiente Vercel/Node)
        const cfResponse = await fetch(
            `https://api.cloudflare.com/client/v4/accounts/${ACCOUNT_ID}/ai/run/${model}`,
            {
                method: "POST",
                headers: {
                    "Authorization": `Bearer ${API_TOKEN}`,
                    "Content-Type": "application/json",
                },
                body: JSON.stringify({ prompt: finalPrompt }),
            }
        );

        if (!cfResponse.ok) {
            const errorData = await cfResponse.text();
            console.error("Erro CF:", errorData);
            return res.status(cfResponse.status).json({ error: "Cloudflare recusou", detalhes: errorData });
        }

        // 4. Detectar o tipo de resposta da Cloudflare
        const cfContentType = cfResponse.headers.get("content-type") || "";

        // Caso A: CF retornou diretamente bytes de imagem
        if (cfContentType.includes("image/")) {
            const arrayBuffer = await cfResponse.arrayBuffer();
            const buffer = Buffer.from(arrayBuffer);

            if (buffer.length === 0) throw new Error("A imagem retornada está vazia.");

            res.setHeader("Content-Type", cfContentType);
            res.setHeader("Content-Length", buffer.length);
            // Permite que o front-end carregue a imagem via blob URL
            res.setHeader("Cache-Control", "no-cache");
            return res.send(buffer);
        }

        // Caso B: CF retornou um JSON com { result: { image: "<base64>" } }
        if (cfContentType.includes("application/json")) {
            const json = await cfResponse.json();

            // Estrutura padrão da Cloudflare Workers AI
            const base64Image =
                json?.result?.image ||          // formato mais comum
                json?.result?.images?.[0] ||    // alguns modelos retornam array
                json?.image ||                  // fallback
                null;

            if (!base64Image) {
                console.error("JSON inesperado da CF:", JSON.stringify(json));
                throw new Error("Não foi possível extrair a imagem da resposta.");
            }

            // Converte base64 → buffer e envia como imagem
            const buffer = Buffer.from(base64Image, "base64");

            if (buffer.length === 0) throw new Error("A imagem base64 decodificada está vazia.");

            res.setHeader("Content-Type", "image/jpeg");
            res.setHeader("Content-Length", buffer.length);
            res.setHeader("Cache-Control", "no-cache");
            return res.send(buffer);
        }

        // Caso C: Tipo desconhecido — tenta ler como binário mesmo assim
        const arrayBuffer = await cfResponse.arrayBuffer();
        const buffer = Buffer.from(arrayBuffer);

        if (buffer.length === 0) throw new Error("Resposta vazia e tipo desconhecido.");

        res.setHeader("Content-Type", "image/jpeg");
        res.setHeader("Content-Length", buffer.length);
        res.setHeader("Cache-Control", "no-cache");
        return res.send(buffer);

    } catch (error) {
        console.error("ERRO VERCEL:", error.message);
        return res.status(500).json({ error: "Falha no Servidor", mensagem: error.message });
    }
                }
