
import { FoodEntry } from '../types';
import { geminiService } from './geminiService';

// Open Food Facts API - free, no key needed (barcode + search)
const OFF_API = 'https://world.openfoodfacts.org/api/v2';

export interface BarcodeResult {
  found: boolean;
  name: string;
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
  servingSize: string;
  barcode: string;
}

/** Per reference amount (referenceGrams). Used for scaling in adjust-grams popup. */
export interface SearchFoodResult {
  name: string;
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
  servingSize: string;
  /** Base amount in grams for the above macros (e.g. 100 = per 100g). */
  referenceGrams: number;
}

class NutritionService {

  // Look up food by barcode using OpenFoodFacts
  async lookupBarcode(barcode: string): Promise<BarcodeResult> {
    try {
      const response = await fetch(`${OFF_API}/product/${barcode}?fields=product_name,nutriments,serving_size`);
      const data = await response.json();

      if (data.status === 1 && data.product) {
        const p = data.product;
        const n = p.nutriments || {};
        return {
          found: true,
          name: p.product_name || 'Unknown Product',
          calories: Math.round(n['energy-kcal_100g'] || n['energy-kcal_serving'] || 0),
          protein: Math.round((n.proteins_100g || 0) * 10) / 10,
          carbs: Math.round((n.carbohydrates_100g || 0) * 10) / 10,
          fat: Math.round((n.fat_100g || 0) * 10) / 10,
          servingSize: p.serving_size || '100g',
          barcode,
        };
      }
      return { found: false, name: '', calories: 0, protein: 0, carbs: 0, fat: 0, servingSize: '100g', barcode };
    } catch (e) {
      console.error('Barcode lookup failed:', e);
      return { found: false, name: '', calories: 0, protein: 0, carbs: 0, fat: 0, servingSize: '100g', barcode };
    }
  }

  // Search food using Gemini AI for better accuracy and "MyFitnessPal-like" experience
  async searchFood(query: string): Promise<SearchFoodResult[]> {
    try {
      const prompt = `You are a high-accuracy nutrition database (similar to MyFitnessPal). 
      The user is searching for: "${query}"
      
      Return up to 8 matching food items with their nutritional information PER 100g.
      If a food is typically measured in units, still provide the data per 100g.
      
      Return a JSON array of objects with this structure:
      [{ "name": "Food Name", "calories": 123, "protein": 10.5, "carbs": 20.1, "fat": 5.2, "servingSize": "100g", "referenceGrams": 100 }]
      
      Be extremely accurate with real nutritional data. Include common variations (e.g., "Cooked", "Raw", "Brand Name" if applicable).`;

      const response = await (geminiService as any).getAI().models.generateContent({
        model: 'gemini-3-flash-preview',
        contents: { parts: [{ text: prompt }] },
        config: {
          responseMimeType: 'application/json',
        }
      });

      const results = JSON.parse(response.text || '[]');
      return Array.isArray(results) ? results : [];
    } catch (e) {
      console.error('Food search failed:', e);
      // Fallback to Open Food Facts if Gemini fails
      return this.searchFoodOFF(query);
    }
  }

  async analyzeFoodImage(imageBase64: string, foodName?: string, source: 'restaurant' | 'homemade' = 'homemade'): Promise<SearchFoodResult | null> {
    return geminiService.analyzeFoodImage(imageBase64, foodName, source);
  }

  // Fallback search using Open Food Facts
  private async searchFoodOFF(query: string): Promise<SearchFoodResult[]> {
    try {
      const params = new URLSearchParams({
        search_terms: query.trim(),
        page_size: '10',
        fields: 'product_name,nutriments',
        json: '1',
      });
      const response = await fetch(`${OFF_API}/search?${params}`);
      const data = await response.json();
      const products = data.products || [];
      return products
        .filter((p: any) => p.product_name && (p.nutriments?.['energy-kcal_100g'] != null || p.nutriments?.energy_100g != null))
        .slice(0, 8)
        .map((p: any) => {
          const n = p.nutriments || {};
          const kcal = n['energy-kcal_100g'] ?? (n.energy_100g != null ? Math.round(n.energy_100g / 4.184) : 0);
          return {
            name: p.product_name,
            calories: Math.round(kcal * 10) / 10,
            protein: Math.round((n.proteins_100g ?? 0) * 10) / 10,
            carbs: Math.round((n.carbohydrates_100g ?? 0) * 10) / 10,
            fat: Math.round((n.fat_100g ?? 0) * 10) / 10,
            servingSize: '100g',
            referenceGrams: 100,
          } as SearchFoodResult;
        });
    } catch (e) {
      console.error('OFF search fallback failed:', e);
      return [];
    }
  }
}

export const nutritionService = new NutritionService();
