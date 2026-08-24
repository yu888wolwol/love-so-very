import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import { createServer as createViteServer } from 'vite';
import { GoogleGenAI } from '@google/genai';
import dotenv from 'dotenv';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json({ limit: '50mb' }));
  app.use(express.urlencoded({ extended: true, limit: '50mb' }));

  // Initialize Gemini if key exists
  let ai: GoogleGenAI | null = null;
  if (process.env.GEMINI_API_KEY) {
    ai = new GoogleGenAI({
      apiKey: process.env.GEMINI_API_KEY,
      httpOptions: {
        headers: {
          'User-Agent': 'aistudio-build',
        },
      },
    });
  }

  // Health check
  app.get('/api/health', (req, res) => {
    res.json({ status: 'ok', hasGeminiKey: !!process.env.GEMINI_API_KEY });
  });

  // AI Electrochemical Analysis Report Endpoint
  app.post('/api/analyze-report', async (req, res) => {
    try {
      const { reactionType, referenceElectrode, pH, samples, metrics } = req.body;

      if (!ai) {
        return res.status(200).json({
          report: null,
          message: 'GEMINI_API_KEY not configured. Generating rule-based analytical report.',
        });
      }

      const prompt = `You are a world-class electrochemistry and catalyst research expert specializing in water splitting (OER/HER), fuel cells, and batteries.
Analyze the following experimental LSV (Linear Sweep Voltammetry) and Tafel plot data for the samples provided.

Reaction Type: ${reactionType || 'OER (Oxygen Evolution Reaction)'}
Reference Electrode: ${referenceElectrode || 'Ag/AgCl'}
Electrolyte pH: ${pH || 14.0}

Sample Performance Data:
${JSON.stringify(samples, null, 2)}

Key Calculated Metrics:
${JSON.stringify(metrics, null, 2)}

Please generate a professional, structured scientific research report in Korean with the following sections:
1. 🧪 종합 성능 평가 요약 (Executive Performance Summary) - 랭킹 및 벤치마크 촉매(Pt/C, RuO2, IrO2 등) 대비 활성 평가
2. ⚡ 반응 속도론 및 타펠 메커니즘 분석 (Kinetics & Tafel Mechanism Interpretation) - Tafel slope (mV/dec)에 기반한 Rate-Determining Step (RDS) 및 전하 이동 특성 해석
3. 🎯 과전압(Overpotential η_10, η_50, η_100) 및 활성도 비교 분석
4. 🔬 촉매 구조-성능 상관관계 및 개선 제안 (Insights & Optimization Strategy)

Use rigorous electrochemical terms (e.g. Volmer-Heyrovsky-Tafel, RDS, iR-drop, 교환전류밀도 j0, 고전류 안정성 등). Format with clear headings, bullet points, and high readability.`;

      const response = await ai.models.generateContent({
        model: 'gemini-3.7-flash',
        contents: prompt,
        config: {
          temperature: 0.3,
        },
      });

      const reportText = response.text || '';
      return res.json({ report: reportText, success: true });
    } catch (error: any) {
      console.error('Gemini analysis error:', error);
      return res.status(500).json({
        error: error?.message || 'Failed to generate AI analysis report',
        fallback: true,
      });
    }
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`ElectroData Lab server running on http://localhost:${PORT}`);
  });
}

startServer();
