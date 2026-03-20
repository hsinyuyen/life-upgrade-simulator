
type AnimationState = 'normal' | 'buff' | 'debuff' | 'both';

const MOTION_PROMPTS: Record<AnimationState, string> = {
  normal: 'The character is standing in an idle pose with subtle breathing animation, hair gently swaying, slight body movement. Calm and confident atmosphere. --duration 5 --camerafixed true',
  buff: 'The character is glowing with radiant golden energy, aura pulsating outward, sparks of light orbiting around them, hair lifted by power surge. Empowered and heroic. --duration 5 --camerafixed true',
  debuff: 'The character is surrounded by dark purple shadows that flicker and pulse, slightly hunched with visible fatigue, dark energy crackling around them. Weakened atmosphere. --duration 5 --camerafixed true',
  both: 'The character has conflicting energies — half golden light and half dark shadows alternating rapidly, dramatic energy clash, hair whipping between both forces. Intense duality. --duration 5 --camerafixed true',
};

interface ArkTaskResponse {
  id: string;
  status: string;
  // Other fields might exist
}

interface ArkStatusResponse {
  id: string;
  status: 'pending' | 'running' | 'succeeded' | 'failed';
  output?: {
    video_url?: string;
  };
  error?: {
    code: string;
    message: string;
  };
}

class SeedanceService {
  private apiKey: string;
  private baseUrl: string;
  private model: string = 'seedance-1-5-pro-251215';

  constructor() {
    this.apiKey = import.meta.env.VITE_SEEDANCE_API_KEY || '';
    // Base URL for task creation
    this.baseUrl = import.meta.env.VITE_SEEDANCE_BASE_URL || 'https://ark.ap-southeast.bytepluses.com/api/v3/contents/generations/tasks';
    if (!this.apiKey) {
      console.warn('Seedance API Key is missing! Please set VITE_SEEDANCE_API_KEY in .env');
    }
  }

  private async submitImageToVideo(imageUrl: string, motionPrompt: string): Promise<string> {
    const res = await fetch(this.baseUrl, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: this.model,
        content: [
          {
            type: 'text',
            text: motionPrompt,
          },
          {
            type: 'image_url',
            image_url: {
              url: imageUrl,
            },
          },
        ],
      }),
    });

    if (!res.ok) {
      const errText = await res.text();
      throw new Error(`Seedance submit failed: ${res.status} ${errText}`);
    }

    const data: ArkTaskResponse = await res.json();
    if (!data.id) {
      throw new Error(`Seedance submit returned no task id: ${JSON.stringify(data)}`);
    }
    return data.id;
  }

  private async pollTaskStatus(taskId: string, maxAttempts = 360, intervalMs = 5000): Promise<string> {
    // Polling endpoint is usually the same base but with the ID
    const pollUrl = `${this.baseUrl}/${taskId}`;

    console.log(`Starting poll for task ${taskId}...`);

    for (let i = 0; i < maxAttempts; i++) {
      await new Promise(r => setTimeout(r, intervalMs));

      try {
        const res = await fetch(pollUrl, {
          headers: {
            'Authorization': `Bearer ${this.apiKey}`,
          },
        });

        if (!res.ok) {
          console.warn(`Seedance poll attempt ${i + 1} failed with status ${res.status}`);
          continue;
        }

        const data: ArkStatusResponse = await res.json();
        const status = data.status;
        
        console.log(`Task ${taskId} status: ${status} (Attempt ${i + 1}/${maxAttempts})`, data);

        if (status === 'succeeded' && data.output?.video_url) {
          console.log(`Task ${taskId} succeeded! URL: ${data.output.video_url}`);
          return data.output.video_url;
        }
        
        if (status === 'failed') {
          const errorMsg = data.error?.message || 'Unknown API error';
          console.error(`Task ${taskId} failed: ${errorMsg}`);
          throw new Error(`Seedance task ${taskId} failed: ${errorMsg}`);
        }
      } catch (e: any) {
        if (e.message.includes('failed')) throw e; // Re-throw failed status errors
        console.warn(`Poll attempt ${i + 1} network/parse error:`, e.message);
      }

      // 'pending' or 'running' continues polling
    }
    throw new Error(`Seedance task ${taskId} timed out after ${(maxAttempts * intervalMs) / 1000}s`);
  }

  async generateAnimatedState(imageUrl: string, state: AnimationState): Promise<string> {
    const prompt = MOTION_PROMPTS[state];
    const taskId = await this.submitImageToVideo(imageUrl, prompt);
    return this.pollTaskStatus(taskId);
  }

  async generateAllAnimatedStates(
    imageUrls: { normal: string; buff: string; debuff: string; both: string },
    onProgress?: (state: AnimationState, index: number, phase: 'submit' | 'poll') => void
  ): Promise<{ normal: string; buff: string; debuff: string; both: string } | null> {
    const states: AnimationState[] = ['normal', 'buff', 'debuff', 'both'];
    const results: Record<string, string> = {};

    for (let i = 0; i < states.length; i++) {
      const state = states[i];
      try {
        onProgress?.(state, i, 'submit');
        const prompt = MOTION_PROMPTS[state];
        const taskId = await this.submitImageToVideo(imageUrls[state], prompt);

        onProgress?.(state, i, 'poll');
        const videoUrl = await this.pollTaskStatus(taskId);
        results[state] = videoUrl;
      } catch (e) {
        console.error(`Animation generation failed for ${state}:`, e);
        return null;
      }
    }

    return results as { normal: string; buff: string; debuff: string; both: string };
  }
}

export const seedanceService = new SeedanceService();
