export default async function handler(req, res) {
    if (req.method !== 'POST') return res.status(405).json({ error: 'Use POST' });

    try {
        const { prompt: inputPrompt } = req.body;
        if (!inputPrompt) return res.status(400).json({ error: "Prompt vazio" });

        // 1. TRADUÇÃO
        const translateUrl = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=pt&tl=en&dt=t&q=${encodeURIComponent(inputPrompt)}`;
        const transRes = await fetch(translateUrl);
        const transJson = await transRes.json();
        const translatedText = transJson[0][0][0];

        // 2. PROMPT DE ELITE (Foco em Fotografia RAW)
        // Mudamos a estratégia: usamos palavras de peso para o SDXL
        const finalPrompt = `Professional RAW photo, ${translatedText}, high fidelity, 8k uhd, soft cinematic lighting, highly detailed skin, Fujifilm XT4, masterpiece, sharp focus.`;
        const negativePrompt = "cartoon, anime, 3d, render, illustration, deformed, blurry, bad anatomy, text, watermark, low quality";

        const ACCOUNT_ID = "648085ab1193eeacc92d058d278a0d83";
        const API_TOKEN = "EZnH74dXipNmuwQOtCAcW1oLQzJ5oKbTnpgBqJUI";
        
        // MUDAMOS O MODELO: Saindo do Flux, indo para o SDXL Base
        const model = "@cf/stabilityai/stable-diffusion-xl-base-1.0"; 

        const cfResponse = await fetch(
            `https://api.cloudflare.com/client/v4/accounts/${ACCOUNT_ID}/ai/run/${model}`,
            {
                method: "POST",
                headers: {
                    "Authorization": `Bearer ${API_TOKEN}`,
                    "Content-Type": "application/json",
                },
                body: JSON.stringify({
                    prompt: finalPrompt,
                    negative_prompt: negativePrompt, // SDXL usa negative prompt (o Flux não)
                    num_steps: 30, // SDXL precisa de mais passos para ser realista
                    guidance: 7.5
                }),
            }
        );

        // 3. VERIFICAÇÃO DE RESPOSTA (Evita a imagem quebrada)
        if (!cfResponse.ok) {
            const errorText = await cfResponse.text();
            console.error("Erro da Cloudflare:", errorText);
            return res.status(500).json({ error: "A Cloudflare recusou o pedido", detalhes: errorText });
        }

        const contentType = cfResponse.headers.get("content-type");

        // Se a Cloudflare retornar JSON em vez de imagem, é um erro interno
        if (contentType && contentType.includes("application/json")) {
            const errorJson = await cfResponse.json();
            return res.status(500).json({ error: "Erro na geração", details: errorJson });
        }

        // 4. ENVIO SEGURO DO BUFFER
        const arrayBuffer = await cfResponse.arrayBuffer();
        const buffer = Buffer.from(arrayBuffer);
        
        res.setHeader('Content-Type', 'image/png');
        res.setHeader('Content-Length', buffer.length); // Garante que o navegador saiba o tamanho
        return res.send(buffer);

    } catch (error) {
        console.error("Erro no Servidor:", error.message);
        return res.status(500).json({ error: "Falha Total", message: error.message });
    }
}
