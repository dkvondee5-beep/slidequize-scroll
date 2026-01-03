import express, { Request, Response } from 'express';
import { Pool, PoolClient } from 'pg';
import cors from 'cors';
import dotenv from 'dotenv';
import axios from 'axios';
import { v4 as uuidv4 } from 'uuid';
import { clerkAuth, syncUserToDatabase } from './middleware/auth';
import { Question } from './types';

dotenv.config();

const app = express();
const port = process.env.PORT || 5000;

// PostgreSQL connection pool - UPDATED FOR SUPABASE
const pool = new Pool({
  connectionString: process.env.DB_URL,
  ssl: {
    rejectUnauthorized: false  // Required for Supabase
  }
});

// Middleware
app.use(cors());
app.use(express.json());

// Test DB connection
pool.connect()
  .then(() => console.log('Connected to PostgreSQL'))
  .catch(err => console.error('PostgreSQL connection error:', err));

// Public health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok', service: 'slidequiz-backend' });
});

// PROTECTED ROUTES
app.get('/api/feed/next', clerkAuth, async (req: Request, res: Response) => {
  let client: PoolClient | undefined;
  try { 
    const userId = (req as any).userId;
    client = await pool.connect();
    if (!client) {
        throw new Error('Failed to obtain database client');
    }
    
    // First try to serve existing questions
    const feedQuery = `
      SELECT id, question_data, question_type, difficulty, 
             engagement_score, times_shown, correct_rate
      FROM generated_questions 
      WHERE times_shown < 10
      ORDER BY 
        CASE WHEN times_shown = 0 THEN 0 ELSE 1 END,
        correct_rate ASC,
        engagement_score DESC,
        difficulty ASC
      LIMIT 5;
    `;
    
    const feedResult = await client.query(feedQuery);
    
    if (feedResult.rows.length >= 3) {
      const questions = feedResult.rows.map(row => ({
        id: row.id,
        type: row.question_type,
        ...row.question_data,
        difficulty: row.difficulty
      }));
      
      // Update times_shown
    const updatePromises = feedResult.rows.map(row => { 
        if (!client) {
        throw new Error('Failed to obtain database client');
    }
       return client.query(
          'UPDATE generated_questions SET times_shown = times_shown + 1 WHERE id = $1',
          [row.id]
        );
    });
      await Promise.all(updatePromises);
      
      return res.json(questions);
    }
    
    // Generate new questions if needed
    console.log('Generating new batch...');
    const chunkQuery = `
      WITH ranked_chunks AS (
        SELECT cc.id, cc.chunk_text,
               COUNT(gq.id) as question_count,
               ROW_NUMBER() OVER (ORDER BY COUNT(gq.id) ASC, RANDOM()) as rn
        FROM content_chunks cc
        LEFT JOIN generated_questions gq ON cc.id = gq.chunk_id
        GROUP BY cc.id
      )
      SELECT id, chunk_text FROM ranked_chunks WHERE rn = 1;
    `;
    const chunkResult = await client.query(chunkQuery);

    if (chunkResult.rows.length === 0) {
      return res.json(getMockQuestions());
    }

    const { id: chunkId, chunk_text: text } = chunkResult.rows[0];

    let aiResponse;
    try {
      aiResponse = await axios.post('http://ai-service:8000/generate', { text }, {
        timeout: 10000,
      });
    } catch (aiError) {
      console.error('AI service error:', aiError);
      return res.json(getMockQuestions());
    }

    const generatedQuestions: Question[] = aiResponse.data;
    const insertPromises = generatedQuestions.map(async (q) => {
      const questionId = uuidv4();
      const questionData = {
        question: q.question,
        options: q.options,
        correct_index: q.correct_index,
        explanation: q.explanation,
        learning_objective: q.learning_objective,
        key_concept: q.key_concept,
        bloom_level: q.bloom_level,
        difficulty: q.difficulty
      };
if (!client) {
        throw new Error('Failed to obtain database client');
    }
      await client.query(
        `INSERT INTO generated_questions (id, chunk_id, question_data, question_type, difficulty, engagement_score, times_shown, correct_rate)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
        [questionId, chunkId, questionData, q.type, q.difficulty, 0.5, 0, 0.0]
      );

      q.id = questionId;
    });

    await Promise.all(insertPromises);
    res.json(generatedQuestions);
  } catch (err: any) {
    console.error('Error in /api/feed/next:', err);
    res.status(500).json({ error: 'Internal server error' });
  } finally {
    if (client) client.release();
  }
});

app.post('/api/interaction', clerkAuth, async (req: Request, res: Response) => {
  const userId = (req as any).userId;
  const { questionId, type, answer } = req.body;
  
  if (!questionId || !type) {
    return res.status(400).json({ error: 'Missing required fields' });
  }
  
  let client: PoolClient | undefined;
  try {
    client = await pool.connect();
    await client.query(
      `INSERT INTO user_interactions (user_id, question_id, interaction_type, answer_correct, time_spent)
       VALUES ($1, $2, $3, $4, $5)`,
      [userId, questionId, type, answer?.correct || false, answer?.timeSpent || 0]
    );
    res.json({ success: true });
  } catch (err) {
    console.error('Error in /api/interaction:', err);
    res.status(500).json({ error: 'Internal server error' });
  } finally {
    if (client) client.release();
  }
});

// Webhook for Clerk user sync
app.post('/api/webhooks/clerk', async (req: Request, res: Response) => {
  const event = req.body;
  if (event.type === 'user.created' || event.type === 'user.updated') {
    const user = event.data;
    await syncUserToDatabase(user.id, user.email_addresses[0].email_address, user.username);
  }
  res.json({ received: true });
});

// Helper function
function getMockQuestions(): Question[] {
  return [
    {
      id: '1',
      type: 'multiple_choice',
      question: 'What is the capital of France?',
      options: ['Paris', 'London', 'Berlin', 'Madrid'],
      correct_index: 0,
      explanation: 'Paris is the capital city of France.',
      learning_objective: 'Geography basics',
      key_concept: 'Capitals',
      bloom_level: 'recall',
      difficulty: 0.3,
    }
  ];
}

app.listen(port, () => {
  console.log(`Server running on port ${port}`);
});
