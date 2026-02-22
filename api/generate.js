export default async function handler(req, res) {
    if (req.method !== 'POST') return res.status(405).json({ error: 'Método não permitido' });

    try {
        const { prompt: q } = req.body;
        if (!q) return res.status(400).json({ error: "O prompt é obrigatório" });

        // 1. Tradução PT → EN
        const translateUrl = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=pt&tl=en&dt=t&q=${encodeURIComponent(q)}`;
        const transRes  = await fetch(translateUrl);
        const transJson = await transRes.json();
        const translatedPrompt = transJson[0].map(s => s[0]).join("");

        console.log("Prompt traduzido:", translatedPrompt);

        // 2. Cloudflare Workers AI — dreamshaper-8-lcm
        //    Único modelo da Cloudflare com fine-tune explícito para FOTORREALISMO.
        //    Aceita JSON direto (não precisa de FormData).
        //    Referência: https://developers.cloudflare.com/workers-ai/models/dreamshaper-8-lcm
        const ACCOUNT_ID = "648085ab1193eeacc92d058d278a0d83";
        const API_TOKEN  = "EZnH74dXipNmuwQOtCAcW1oLQzJ5oKbTnpgBqJUI";
        const model      = "@cf/lykon/dreamshaper-8-lcm";

        const payload = {
            prompt: `RAW photo, ${translatedPrompt}, photorealistic, 8k uhd, dslr, soft lighting, high quality, film grain, Fujifilm XT3`,
            negative_prompt: "cartoon, anime, illustration, painting, drawing, art, sketch, 3d render, cgi, animated, extra limbs, extra fingers, extra heads, deformed, disfigured, bad anatomy, blurry, low quality, watermark, signature",
            guidance_scale: 8,   // alto = mais fiel ao prompt e mais realista
            num_steps: 20,       // máximo permitido pelo LCM para qualidade
            width: 768,
            height: 768,
        };

        const cfResponse = await fetch(
            `https://api.cloudflare.com/client/v4/accounts/${ACCOUNT_ID}/ai/run/${model}`,
            {
                method: "POST",
                headers: {
                    "Authorization": `Bearer ${API_TOKEN}`,
                    "Content-Type": "application/json",
                },
                body: JSON.stringify(payload),
            }
        );

        if (!cfResponse.ok) {
            const errorText = await cfResponse.text();
            console.error("Erro CF:", errorText);
            return res.status(cfResponse.status).json({ error: "Cloudflare recusou", detalhes: errorText });
        }

        // 3. dreamshaper-8-lcm retorna a imagem como bytes diretos (image/jpeg)
        const cfContentType = cfResponse.headers.get("content-type") || "";

        if (cfContentType.includes("image/")) {
            const buffer = Buffer.from(await cfResponse.arrayBuffer());
            if (buffer.length === 0) throw new Error("Imagem retornada está vazia.");
            res.setHeader("Content-Type", cfContentType);
            res.setHeader("Content-Length", buffer.length);
            res.setHeader("Cache-Control", "no-cache");
            return res.send(buffer);
        }

        // Fallback: JSON com base64 (segurança)
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
