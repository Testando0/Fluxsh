export default async function handler(req, res) {
    if (req.method !== 'POST') return res.status(405).send('Use POST');

    const { prompt: q } = req.body;
    if (!q) return res.status(400).json({ error: "Insira um texto" });

    try {
        // 1. Tradução Automática (Google Translate API gratuita)
        const translateUrl = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=pt&tl=en&dt=t&q=${encodeURIComponent(q)}`;
        const transRes = await fetch(translateUrl);
        const transJson = await transRes.json();
        const translatedPrompt = transJson[0][0][0];

        // 2. Configurações da Cloudflare (Dados da sua Case)
        const ACCOUNT_ID = "648085ab1193eeacc92d058d278a0d83";
        const API_TOKEN = "EZnH74dXipNmuwQOtCAcW1oLQzJ5oKbTnpgBqJUI";
        const model = "@cf/black-forest-labs/flux-1-schnell"; // Alterado para FLUX como solicitado inicialmente, ou use @cf/leonardo/phoenix-1.0 se preferir o da case

        const finalPrompt = `${translatedPrompt}, high quality, detailed, 8k`;

        const response = await fetch(
            `https://api.cloudflare.com/client/v4/accounts/${ACCOUNT_ID}/ai/run/${model}`,
            {
                method: "POST",
                headers: {
                    "Authorization": `Bearer ${API_TOKEN}`,
                    "Content-Type": "application/json",
                },
                body: JSON.stringify({
                    prompt: finalPrompt,
                    num_steps: 4, // Para FLUX Schnell use 4. Se usar Phoenix, use 20.
                    guidance: 7.5
                }),
            }
        );

        if (!response.ok) {
            const errorText = await response.text();
            return res.status(response.status).json({ error: "Erro Cloudflare", details: errorText });
        }

        const arrayBuffer = await response.arrayBuffer();
        res.setHeader('Content-Type', 'image/jpeg');
        return res.send(Buffer.from(arrayBuffer));

    } catch (error) {
        return res.status(500).json({ error: "Erro no servidor", message: error.message });
    }
}
