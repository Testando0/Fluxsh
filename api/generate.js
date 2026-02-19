export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Método não permitido' });
  }

  // Garante que o prompt seja lido corretamente
  let prompt;
  try {
    prompt = typeof req.body === 'string' ? JSON.parse(req.body).prompt : req.body.prompt;
  } catch (e) {
    return res.status(400).json({ error: 'Erro ao processar o JSON' });
  }

  if (!prompt) {
    return res.status(400).json({ error: 'O prompt é obrigatório' });
  }

  try {
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
          parameters: {
            guidance_scale: 3.5,
            num_inference_steps: 4,
          },
          options: {
            wait_for_model: true // CRÍTICO: Evita erro se o modelo estiver carregando
          }
        }),
      }
    );

    if (!response.ok) {
      const errorMsg = await response.text();
      console.error("Erro Hugging Face:", errorMsg); // Aparecerá nos logs do Vercel
      return res.status(response.status).json({ error: "Erro na API externa", details: errorMsg });
    }

    const arrayBuffer = await response.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    res.setHeader('Content-Type', 'image/jpeg');
    return res.send(buffer);

  } catch (error) {
    console.error("Erro Interno:", error);
    return res.status(500).json({ error: 'Erro interno', message: error.message });
  }
}
