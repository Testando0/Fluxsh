export default async function handler(req, res) {
    if (req.method !== 'POST') return res.status(405).json({ error: 'Método não permitido' });

    try {
        const { prompt: q } = req.body;
        if (!q) return res.status(400).json({ error: "O prompt é obrigatório" });

        // 1. Tradução PT → EN (une todos os fragmentos corretamente)
        const translateUrl = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=pt&tl=en&dt=t&q=${encodeURIComponent(q)}`;
        const transRes  = await fetch(translateUrl);
        const transJson = await transRes.json();
        const translatedPrompt = transJson[0].map(s => s[0]).join("");

        // 2. Prompt técnico fotográfico para o Flux-dev
        //    Estrutura: [sujeito exato] + [contexto] + [câmera/técnica] + [qualidade]
        //    O Flux-dev responde muito melhor a descrições de câmera real do que a palavras como "realistic"
        const finalPrompt = [
            translatedPrompt,                          // sujeito exato do usuário — SEMPRE PRIMEIRO
            "photograph taken with a Sony A7R V",      // câmera real = output fotográfico
            "35mm f/1.8 lens",                         // lente específica = bokeh e profundidade reais
            "natural lighting",                        // iluminação naturalista
            "hyper detailed",                          // nível de detalhe máximo
            "photojournalism quality",                 // estilo documental = sem artistismo exagerado
            "ultra sharp focus",                       // foco preciso no sujeito
            "4K resolution"                            // resolução alta
        ].join(", ");

        console.log("✅ Prompt final:", finalPrompt);

        // 3. Cloudflare Workers AI — flux-2-dev
        //    OBRIGATÓRIO: multipart/form-data (nunca JSON)
        //    steps 50 + guidance 7 = máxima fidelidade e qualidade
        const ACCOUNT_ID = "648085ab1193eeacc92d058d278a0d83";
        const API_TOKEN  = "EZnH74dXipNmuwQOtCAcW1oLQzJ5oKbTnpgBqJUI";
        const model      = "@cf/black-forest-labs/flux-2-dev";

        const formData = new FormData();
        formData.append("prompt",   finalPrompt);
        formData.append("steps",    "50");   // máximo de passos = máxima qualidade
        formData.append("guidance", "7");    // alta aderência ao prompt
        formData.append("width",    "1024");
        formData.append("height",   "1024");

        const cfResponse = await fetch(
            `https://api.cloudflare.com/client/v4/accounts/${ACCOUNT_ID}/ai/run/${model}`,
            {
                method: "POST",
                headers: { "Authorization": `Bearer ${API_TOKEN}` },
                body: formData,
            }
        );

        if (!cfResponse.ok) {
            const errorText = await cfResponse.text();
            console.error("Erro CF:", errorText);
            return res.status(cfResponse.status).json({ error: "Cloudflare recusou", detalhes: errorText });
        }

        // 4. Processar resposta
        const cfContentType = cfResponse.headers.get("content-type") || "";

        // Caso A: bytes de imagem diretos
        if (cfContentType.includes("image/")) {
            const buffer = Buffer.from(await cfResponse.arrayBuffer());
            if (buffer.length === 0) throw new Error("Imagem retornada está vazia.");
            res.setHeader("Content-Type", cfContentType);
            res.setHeader("Content-Length", buffer.length);
            res.setHeader("Cache-Control", "no-cache");
            return res.send(buffer);
        }

        // Caso B: JSON com base64 { result: { image: "..." } }
        const json = await cfResponse.json();
        const base64Image = json?.result?.image || json?.image || null;

        if (!base64Image) {
            console.error("JSON inesperado da CF:", JSON.stringify(json));
            return res.status(500).json({ error: "Imagem não encontrada na resposta da Cloudflare." });
        }

        const buffer = Buffer.from(base64Image, "base64");
        if (buffer.length === 0) throw new Error("Imagem base64 decodificada está vazia.");

        res.setHeader("Content-Type", "image/jpeg");
        res.setHeader("Content-Length", buffer.length);
        res.setHeader("Cache-Control", "no-cache");
        return res.send(buffer);

    } catch (error) {
        console.error("ERRO VERCEL:", error.message);
        return res.status(500).json({ error: "Falha no Servidor", mensagem: error.message });
    }
                          }
