export default async function handler(req, res) {
  // Configuração de Headers para evitar qualquer bloqueio
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).send('Use POST');

  try {
    // Tenta pegar o prompt de diferentes formas (body parseado ou bruto)
    const data = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
    const prompt = data?.prompt;

    if (!prompt) {
      return res.status(400).json({ error: 'Prompt vazio' });
    }

    const response = await fetch(
      "https://api-inference.huggingface.co/models/black-forest-labs/FLUX.1-schnell",
      {
        headers: {
          "Authorization": `Bearer ${process.env.HF_TOKEN}`,
          "Content-Type": "application/json",
        },
        method: "POST",
        body: JSON.stringify({ 
            inputs: prompt,
            options: { wait_for_model: true } 
        }),
      }
    );

    if (!response.ok) {
        const errorText = await response.text();
        return res.status(response.status).json({ hf_error: errorText });
    }

    const arrayBuffer = await response.arrayBuffer();
    res.setHeader('Content-Type', 'image/jpeg');
    return res.send(Buffer.from(arrayBuffer));

  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
