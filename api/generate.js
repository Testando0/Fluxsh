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

        // 2. Configurações da Cloudflare (Dados da tua case)
        const ACCOUNT_ID = "648085ab1193eeacc92d058d278a0d83";
        const API_TOKEN = "EZnH74dXipNmuwQOtCAcW1oLQzJ5oKbTnpgBqJUI";
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
                    num_steps: 4 
                }),
            }
        );

        if (!response.ok) {
            const errorText = await response.text();
            return res.status(response.status).json({ error: "Erro Cloudflare", details: errorText });
        }

        // --- A SOLUÇÃO ESTÁ AQUI ---
        const result = await response.json(); // A Cloudflare retorna um JSON { result: { image: "base64..." } }
        
        let base64Image;
        if (result.result && result.result.image) {
            base64Image = result.result.image;
        } else if (result.image) {
            base64Image = result.image;
        } else {
            return res.status(500).json({ error: "Formato de resposta inesperado", data: result });
        }

        // Converte a string Base64 num Buffer binário
        const buffer = Buffer.from(base64Image, 'base64');

        // Envia como imagem real
        res.setHeader('Content-Type', 'image/png');
        res.setHeader('Content-Length', buffer.length);
        return res.send(buffer);

    } catch (error) {
        console.error("ERRO NO SERVIDOR:", error);
        return res.status(500).json({ error: "Erro no servidor", message: error.message });
    }
}
