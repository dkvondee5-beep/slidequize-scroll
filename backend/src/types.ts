export interface Question {
  id: string;
  type: 'multiple_choice' | 'true_false' | 'fill_in_the_blank';
  question: string;
  options?: string[];
  correct_index?: number;
  explanation?: string;
  learning_objective: string;
  key_concept: string;
  bloom_level: string;
  difficulty: number;
}
