import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { Pool, PoolClient } from 'pg';
import dotenv from 'dotenv';

dotenv.config();

const pool = new Pool({
  host: process.env.DB_HOST || 'localhost',
  database: process.env.DB_NAME || 'slidequiz',
  user: process.env.DB_USER || 'user',
  password: process.env.DB_PASSWORD || 'password',
  port: 5432,
});

export const clerkAuth = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const authHeader = req.headers.authorization;
    
    if (!authHeader?.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'No token provided' });
    }

    const token = authHeader.split(' ')[1];
    const decoded = jwt.decode(token) as any;
    
    if (!decoded?.sub) {
      return res.status(401).json({ error: 'Invalid token' });
    }

    (req as any).userId = decoded.sub;
    (req as any).userEmail = decoded.email;
    
    next();
  } catch (error) {
    console.error('Auth middleware error:', error);
    res.status(401).json({ error: 'Authentication failed' });
  }
};

export const syncUserToDatabase = async (clerkUserId: string, email: string, username?: string) => {
  const client: PoolClient  = await pool.connect();
  try {
    const userCheck = await client.query(
      'SELECT id FROM users WHERE auth_provider_id = $1',
      [clerkUserId]
    );
    
    if (userCheck.rows.length > 0) {
      await client.query(
        'UPDATE users SET last_active = CURRENT_TIMESTAMP WHERE id = $1',
        [userCheck.rows[0].id]
      );
      return userCheck.rows[0].id;
    } else {
      const newUser = await client.query(
        `INSERT INTO users (username, email, auth_provider, auth_provider_id, created_at, last_active)
         VALUES ($1, $2, 'clerk', $3, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
         RETURNING id`,
        [username || email.split('@')[0], email, clerkUserId]
      );
      return newUser.rows[0].id;
    }
  } catch (error) {
    console.error('Error syncing user:', error);
    throw error;
  } finally {
    client.release();
  }
};
