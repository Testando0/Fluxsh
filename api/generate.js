export default async function handler(req, res) {
    if (req.method !== 'POST') return res.status(405).send('Use POST');

    const { prompt: q } = req.body;
    if (!q) return res.status(400).json({ error: "Insira um texto" });

    try {
        // 1. Tradução Automática
        const translateUrl = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=pt&tl=en&dt=t&q=${encodeURIComponent(q)}`;
        const transRes = await fetch(translateUrl);
        const transJson = await transRes.json();
        const translatedPrompt = transJson[0][0][0];

        // 2. Configurações da Cloudflare
        const ACCOUNT_ID = "648085ab1193eeacc92d058d278a0d83";
        const API_TOKEN = "EZnH74dXipNmuwQOtCAcW1oLQzJ5oKbTnpgBqJUI";
        
        // Vamos usar o FLUX Schnell da Cloudflare
        const model = "@cf/black-forest-labs/flux-1-schnell"; 

        const response = await fetch(
            `https://api.cloudflare.com/client/v4/accounts/${ACCOUNT_ID}/ai/run/${model}`,
            {
                method: "POST",
                headers: {
                    "Authorization": `Bearer ${API_TOKEN}`,
                    "Content-Type": "application/json",
                },
                body: JSON.stringify({
                    prompt: `${translatedPrompt}, high quality, detailed, 8k`,
                    num_steps: 4 // O Flux Schnell exige apenas 4 passos
                }),
            }
        );

        if (!response.ok) {
            const errorText = await response.text();
            return res.status(response.status).json({ error: "Erro Cloudflare", details: errorText });
        }

        // --- AJUSTE CRÍTICO AQUI ---
        // A Cloudflare pode retornar a imagem direto ou um JSON com a imagem dentro.
        // Vamos forçar a leitura como ArrayBuffer para garantir a integridade do arquivo.
        const arrayBuffer = await response.arrayBuffer();
        const buffer = Buffer.from(arrayBuffer);

        // Definimos o Header como PNG ou JPEG
        res.setHeader('Content-Type', 'image/png'); 
        res.setHeader('Content-Length', buffer.length);
        
        return res.send(buffer);

    } catch (error) {
        console.error(error);
        return res.status(500).json({ error: "Erro no servidor", message: error.message });
    }
}
